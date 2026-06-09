// ── DUPR API push ────────────────────────────────────────────────────────────
// Posts a single completed game to the dupr-platform companion service, which
// validates that all 4 players have linked DUPR accounts + BASIC_L1
// entitlement and pushes to DUPR via the partner API.
//
// Configured via Script Properties (never commit these):
//   DUPR_PLATFORM_URL   e.g. https://dupr.ctpbleague.com
//   DUPR_PLATFORM_KEY   the dupr_… service-to-service key (mint in /admin/keys)
//
// If properties are missing, calls become no-ops — the CSV export keeps
// working as the fallback.
// ────────────────────────────────────────────────────────────────────────────

function duprApiConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    url: (props.getProperty('DUPR_PLATFORM_URL') || '').replace(/\/$/, ''),
    key: props.getProperty('DUPR_PLATFORM_KEY') || '',
  };
}

function duprApiIsConfigured_() {
  const c = duprApiConfig_();
  return !!(c.url && c.key);
}

// Returns the same player map shape as DuprExport.js so we can reuse it.
function duprApiBuildPlayerLookup_() {
  return duprBuildPlayerLookup_();
}

// Look up match metadata (date, event name) for a single match_id.
function duprApiMatchMeta_(matchId) {
  const ss = getBackendSpreadsheet_();
  const matchesSheet = ss.getSheetByName('Matches');
  if (!matchesSheet) return null;
  const data = matchesSheet.getDataRange().getValues();
  const h    = data[0].map(x => String(x).trim().toLowerCase());
  const idIdx   = h.indexOf('match_id');
  const dateIdx = h.indexOf('match_date');
  const divIdx  = h.indexOf('division_id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx] || '').trim() === matchId) {
      const rawDate = data[i][dateIdx];
      let dateStr = '';
      if (rawDate instanceof Date) {
        const noon = new Date(rawDate.getTime() + 12 * 60 * 60 * 1000);
        dateStr = Utilities.formatDate(noon, 'America/New_York', 'yyyy-MM-dd');
      } else {
        dateStr = String(rawDate || '').slice(0, 10);
      }
      return { date: dateStr, divisionId: String(data[i][divIdx] || '') };
    }
  }
  return null;
}

// Find a single Match_Games row by game_id.
function duprApiGameRow_(gameId) {
  const ss = getBackendSpreadsheet_();
  const sheet = ss.getSheetByName('Match_Games');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const h    = data[0].map(x => String(x).trim().toLowerCase());
  const idIdx = h.indexOf('game_id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx] || '').trim() === gameId) {
      const obj = {};
      h.forEach((col, j) => { obj[col] = data[i][j]; });
      return obj;
    }
  }
  return null;
}

// Build the request body for /bridge/game from one Match_Games row.
function duprApiBuildGamePayload_(gameRow, playerMap) {
  const matchId = String(gameRow.match_id || '').trim();
  const meta    = duprApiMatchMeta_(matchId);
  if (!meta) return null;

  const ids = {
    a1: String(gameRow.home_player_1_id || '').trim(),
    a2: String(gameRow.home_player_2_id || '').trim(),
    b1: String(gameRow.away_player_1_id || '').trim(),
    b2: String(gameRow.away_player_2_id || '').trim(),
  };
  // Map our player_ids → DUPR ids via the Players sheet.
  const dupr = {
    a1: (playerMap[ids.a1] || {}).duprId || '',
    a2: (playerMap[ids.a2] || {}).duprId || '',
    b1: (playerMap[ids.b1] || {}).duprId || '',
    b2: (playerMap[ids.b2] || {}).duprId || '',
  };
  // Require all 4 to have DUPR IDs — otherwise we skip the push (CSV fallback handles them).
  if (!dupr.a1 || !dupr.a2 || !dupr.b1 || !dupr.b2) return null;

  const hScore = Number(gameRow.home_score);
  const aScore = Number(gameRow.away_score);
  if (!Number.isFinite(hScore) || !Number.isFinite(aScore)) return null;
  if (hScore < 6 && aScore < 6) return null; // incomplete

  const week = duprExtractWeekNum_(matchId);

  return {
    externalId: 'cpbl-' + String(gameRow.game_id || matchId + '-' + (gameRow.round_id || '') + '-' + (gameRow.game_number_in_round || '')),
    matchDate:  meta.date,
    leagueName: 'Connecticut Pickleball League',
    location:   'CPBL',
    week:       week,
    players:    { a1: dupr.a1, a2: dupr.a2, b1: dupr.b1, b2: dupr.b2 },
    scores:     { a: hScore,   b: aScore },
  };
}

// POST one game to the platform. Returns { ok, status, body } or { skipped, reason }.
function duprApiPushGame_(gameId) {
  if (!duprApiIsConfigured_()) return { skipped: true, reason: 'not-configured' };
  const row = duprApiGameRow_(gameId);
  if (!row) return { skipped: true, reason: 'game-not-found' };
  const map = duprApiBuildPlayerLookup_();
  const payload = duprApiBuildGamePayload_(row, map);
  if (!payload) return { skipped: true, reason: 'missing-dupr-ids-or-scores' };

  const cfg = duprApiConfig_();
  const res = UrlFetchApp.fetch(cfg.url + '/bridge/game', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg.key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = res.getResponseCode();
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = { raw: res.getContentText() }; }
  Logger.log('DUPR API push game=' + gameId + ' status=' + status + ' body=' + JSON.stringify(body).slice(0, 300));
  return { ok: status >= 200 && status < 300 && body.ok !== false, status, body };
}

// POST the staged matches at the platform end so DUPR actually receives them.
// Safe to call after every game push — the platform's /matches/push is idempotent.
function duprApiFlushPending_() {
  if (!duprApiIsConfigured_()) return { skipped: true, reason: 'not-configured' };
  const cfg = duprApiConfig_();
  const res = UrlFetchApp.fetch(cfg.url + '/matches/push', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + cfg.key },
    muteHttpExceptions: true,
  });
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = { raw: res.getContentText() }; }
  return { status: res.getResponseCode(), body };
}

// Convenience entry point: push a single game and flush. Called from recordGameScoreV2.
function duprApiPushAndFlush_(gameId) {
  try {
    const push  = duprApiPushGame_(gameId);
    if (!push.ok) return push;
    const flush = duprApiFlushPending_();
    return { ok: true, push, flush };
  } catch (e) {
    Logger.log('duprApiPushAndFlush_ error for ' + gameId + ': ' + e);
    return { ok: false, error: String(e) };
  }
}
