# Cloudflare KV cache — setup

The Worker in `worker/index.js` adds same-origin `/api/*` JSON endpoints
backed by Cloudflare KV. The hub (`public/app.js`) auto-detects when it's
running on a Cloudflare-routed origin and routes reads through `/api/*`
instead of hitting Google Apps Script directly. End-user reads drop from
~1–3s (GAS cold start + sheet I/O) to ~20–50ms (edge KV).

## One-time setup

1. **Create the KV namespace.** From the Cloudflare dashboard:

   - Workers & Pages → KV → **Create namespace**
   - Name: `cpbl-cache`
   - Copy the namespace ID (a long hex string)

   Or via the CLI:

   ```
   npx wrangler kv namespace create CPBL_CACHE
   ```

2. **Paste the namespace ID into `wrangler.jsonc`:**

   ```jsonc
   "kv_namespaces": [
     { "binding": "CPBL_CACHE", "id": "PASTE_KV_NAMESPACE_ID_HERE" }
   ]
   ```

3. **Deploy.** Pushing to `main` triggers Cloudflare's build, which now
   picks up `main: "worker/index.js"` and binds the KV namespace.

   ```
   git add wrangler.jsonc worker/index.js public/app.js
   git commit -m "Add KV-cached /api routes"
   git push origin main
   ```

## What's cached

| Path | GAS upstream | Soft TTL | Hard TTL |
|---|---|---|---|
| `/api/publicdata` | `?page=publicdata` | 5 min | 1 h |
| `/api/homedata` | `?page=homedata` | 5 min | 1 h |
| `/api/mvpleaderboard` | `?page=mvpleaderboard&limit=…` | 5 min | 1 h |
| `/api/scorebranding` | `?page=scorebranding` | 30 min | 24 h |

**Strategy:** stale-while-revalidate. Soft TTL controls when a background
refresh fires; users always get an instant response from KV until the
hard TTL expires. The `x-cpbl-cache` response header reports `HIT`,
`STALE`, or `MISS`.

## Invalidating after a sheet edit

The cache picks up changes naturally within ~5 minutes (next read past
soft TTL triggers a background refresh). If you need to force an immediate
refresh:

- **Dashboard:** Workers & Pages → KV → `cpbl-cache` → delete the entry
  (key is the GAS page name, e.g. `publicdata`).
- **CLI:** `npx wrangler kv key delete --binding=CPBL_CACHE publicdata`

Optional later: add a `?page=invalidatecache&key=…&token=…` GAS endpoint
that the captain/scorecard write paths call after a successful save.

## Cost

Free tier ceilings (per day): 100k Worker requests, 100k KV reads, 1k KV
writes. With stale-while-revalidate, KV writes only happen on background
refresh (≤ 1 per soft-TTL window per key), so writes are well under 100/day.
Reads are 1 per page view, also well under 100k/day for league traffic.
**Expected bill: $0.**

## Falling back

`public/app.js` only routes through `/api/*` when `location.hostname`
matches `ctpbleague.com` or `workers.dev`. On localhost (Python preview
server) or `?staging=1`, it hits GAS directly. So you can keep developing
locally even before the KV namespace is wired up, and staging stays
unaffected.
