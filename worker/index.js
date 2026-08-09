// Cloudflare Worker for ctpbleague.com
//
// Serves the static hub from ./public (via the ASSETS binding) and adds
// fast same-origin JSON endpoints under /api/* backed by KV. Each endpoint
// is a thin cache in front of the Google Apps Script /exec backend.
//
// Cache strategy: stale-while-revalidate. KV holds the last fetched JSON
// plus a soft expiry timestamp. If a request lands before soft expiry, we
// serve from KV. If past soft expiry, we still serve from KV immediately
// and kick off a background refresh via ctx.waitUntil — the next request
// sees the new data. A hard TTL on the KV entry keeps it from growing
// stale forever if GAS is down for a long stretch.

const GAS_PROD =
  'https://script.google.com/macros/s/AKfycbzuzujnOWumYMPb64hQw6LCiAGPVqDd79WnBQa8X6ZabAxrNUhVVAHfHYJnCKvxlBvD/exec';

// Map /api/* path → upstream GAS page name. Add new endpoints here.
// `passQuery` lists query parameters that are forwarded to GAS and that
// participate in the cache key.
const API_ROUTES = {
  '/api/publicdata':           { page: 'publicdata',           softTtl: 300,  hardTtl: 3600 },
  '/api/homedata':             { page: 'homedata',             softTtl: 300,  hardTtl: 3600 },
  '/api/mvpleaderboard':       { page: 'mvpleaderboard',       softTtl: 300,  hardTtl: 3600, passQuery: ['limit'] },
  '/api/scorebranding':        { page: 'scorebranding',        softTtl: 1800, hardTtl: 86400 },
  // Read-only data backing the slow iframe pages.
  '/api/seasondivisions':      { page: 'seasondivisions',      softTtl: 600,  hardTtl: 3600 },
  '/api/seasondata':           { page: 'seasondata',           softTtl: 300,  hardTtl: 3600, passQuery: ['division'] },
  '/api/playerlist':           { page: 'playerlist',           softTtl: 600,  hardTtl: 3600 },
  '/api/playerpagedata':       { page: 'playerpagedata',       softTtl: 300,  hardTtl: 3600, passQuery: ['id', 'playerId'] },
  '/api/playersdirectorydata': { page: 'playersdirectorydata', softTtl: 300,  hardTtl: 3600 },
  '/api/playergenders':        { page: 'playergenders',        softTtl: 1800, hardTtl: 86400 },
  '/api/openmatches':          { page: 'openmatches',          softTtl: 300,  hardTtl: 3600 },
  '/api/allmatches':           { page: 'allmatches',           softTtl: 300,  hardTtl: 3600 },
  // Live scorecard: short TTL so live matches refresh quickly, but repeat
  // polls within ~15s still come from cache instead of hammering GAS.
  '/api/scorecarddata':        { page: 'scorecarddata',        softTtl: 15,   hardTtl: 300, passQuery: ['matchId'] },
};

// ── V2 registration passthrough ─────────────────────────────────────────────
// The 2026 registration flow (form + DUPR link + SafeSave payment + the public
// registrant list) lives in the ctpbleague-v2 SvelteKit app on Cloudflare Pages.
// Rather than cut the whole site over, we mount just those routes onto this
// domain and leave every other path on the v1 hub below.
//
// This allowlist IS the gate: nothing else in v2 is reachable from
// ctpbleague.com. Widen it only when a v2 section is ready to be public.
//
// `/_app/*` has to be included because SvelteKit serves its JS/CSS from
// absolute /_app/immutable/… URLs. `/club-logos/*` likewise: v2 mirrors club
// logos as static assets and references them root-relative (see
// apps/web/src/lib/logos.ts), so without this they 404 into the v1 hub.
// The v1 hub has neither path, so nothing collides.
const V2_ORIGIN = 'https://ctpbleague-v2.pages.dev';

function isV2Path(pathname) {
  return (
    pathname === '/register' ||
    pathname.startsWith('/register/') ||
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/club-logos/')
  );
}

function proxyV2(request, url) {
  const upstream = new URL(url.pathname + url.search, V2_ORIGIN);
  // Preserve method/body/headers so the SvelteKit form actions and the
  // Firebase callables invoked from the page keep working.
  const proxied = new Request(upstream, request);
  // Pages routes on the Host header; sending ctpbleague.com would 404.
  proxied.headers.set('host', new URL(V2_ORIGIN).host);
  proxied.headers.set('x-forwarded-host', url.host);
  return fetch(proxied);
}

const CORS_HEADERS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age':       '86400',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isV2Path(url.pathname)) {
      return proxyV2(request, url);
    }
    if (url.pathname === '/api/invalidate') {
      return handleInvalidate(request, env);
    }
    const route = API_ROUTES[url.pathname];
    if (route) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      return handleApi(url, route, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};

// POST /api/invalidate
// Body: { keys: [{page: 'publicdata'}, {page: 'scorecarddata', params: {matchId: 'M123'}}, ...] }
// Auth: Authorization: Bearer <CPBL_INVALIDATE_TOKEN>
//
// Computes the same KV key the API_ROUTES handler would and deletes it.
async function handleInvalidate(request, env) {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
  }
  const auth = request.headers.get('authorization') || '';
  const expected = 'Bearer ' + (env.CPBL_INVALIDATE_TOKEN || '');
  if (!env.CPBL_INVALIDATE_TOKEN || auth !== expected) {
    return new Response('unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response('bad body', { status: 400, headers: CORS_HEADERS }); }

  const items = Array.isArray(body && body.keys) ? body.keys : [];
  const deleted = [];
  // Look up each route's passQuery order so the computed key matches the
  // canonical one set by cacheKey() — order matters.
  const routeByPage = {};
  for (const path in API_ROUTES) {
    routeByPage[API_ROUTES[path].page] = API_ROUTES[path];
  }
  for (const item of items) {
    const page = item && item.page;
    if (!page) continue;
    const route = routeByPage[page];
    if (!route) continue;
    const parts = [page];
    const params = (item.params && typeof item.params === 'object') ? item.params : {};
    (route.passQuery || []).forEach(k => {
      if (params[k] != null) parts.push(`${k}=${params[k]}`);
    });
    const key = parts.join('|');
    await env.CPBL_CACHE.delete(key);
    deleted.push(key);
  }
  return new Response(JSON.stringify({ ok: true, deleted }), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

function buildUpstreamUrl(route, url) {
  const u = new URL(GAS_PROD);
  u.searchParams.set('page', route.page);
  (route.passQuery || []).forEach(key => {
    const v = url.searchParams.get(key);
    if (v != null) u.searchParams.set(key, v);
  });
  return u.toString();
}

function cacheKey(route, url) {
  // Different query params (e.g. ?limit=10 vs ?limit=20) get distinct keys.
  const parts = [route.page];
  (route.passQuery || []).forEach(key => {
    const v = url.searchParams.get(key);
    if (v != null) parts.push(`${key}=${v}`);
  });
  return parts.join('|');
}

async function handleApi(url, route, env, ctx) {
  const key = cacheKey(route, url);
  const cached = await env.CPBL_CACHE.get(key, { type: 'json' });
  const now = Math.floor(Date.now() / 1000);

  if (cached && cached.body) {
    const isStale = !cached.softExpiresAt || cached.softExpiresAt < now;
    if (isStale) {
      // Background refresh; do NOT await — return cached immediately.
      ctx.waitUntil(refresh(url, route, env, key).catch(() => {}));
    }
    return jsonResponse(cached.body, { hit: true, stale: isStale });
  }

  // Cold cache: fetch synchronously so the user gets fresh data, then store.
  try {
    const body = await refresh(url, route, env, key);
    return jsonResponse(body, { hit: false, stale: false });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'upstream_failed', detail: String(err) }),
      { status: 502, headers: { ...CORS_HEADERS, 'content-type': 'application/json' } }
    );
  }
}

async function refresh(url, route, env, key) {
  const upstream = buildUpstreamUrl(route, url);
  const resp = await fetch(upstream, { cf: { cacheTtl: 0 } });
  if (!resp.ok) throw new Error(`upstream ${resp.status}`);
  const body = await resp.json();
  const entry = {
    body,
    softExpiresAt: Math.floor(Date.now() / 1000) + route.softTtl,
    fetchedAt:     Math.floor(Date.now() / 1000),
  };
  await env.CPBL_CACHE.put(key, JSON.stringify(entry), { expirationTtl: route.hardTtl });
  return body;
}

function jsonResponse(body, meta) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      // Allow short browser cache so rapid re-fetches don't even hit the Worker.
      'cache-control': 'public, max-age=30',
      'x-cpbl-cache': meta.hit ? (meta.stale ? 'STALE' : 'HIT') : 'MISS',
    },
  });
}
