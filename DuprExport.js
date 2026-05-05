// ── DUPR CSV Export ──────────────────────────────────────────────────────────
// Generates a DUPR-compatible doubles CSV for a given week's completed games.
//
// CSV columns (DUPR format):
//   matchType, scoreType, event, date,
//   playerA1, playerA1DuprId, playerA2, playerA2DuprId,
//   playerB1, playerB1DuprId, playerB2, playerB2DuprId,
//   teamAGame1..teamBGame5
//
// Each row = one court game (one pair vs one pair).
// ────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

function duprCsvEsc_(v) {
  const s = String(v == null ? '' : v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function duprExtractWeekNum_(matchId) {
  const m = String(matchId || '').match(/W(\d+)/i);
  return m ? Number(m[1]) : 0;
}

// Returns map: player_id → { fullName, duprId }
function duprBuildPlayerLookup_() {
  const ss = getBackendSpreadsheet_();
  const sheet = ss.getSheetByName('Players');
  const map = {};
  if (!sheet) return map;
  const data = sheet.getDataRange().getValues();
  const h = data[0].map(x => String(x).trim().toLowerCase());
  const idIdx   = h.indexOf('player_id');
  const nameIdx = h.indexOf('full_name');
  const duprIdx = h.indexOf('dupr_id');
  for (let i = 1; i < data.length; i++) {
    const id     = String(data[i][idIdx]   || '').trim();
    const name   = String(data[i][nameIdx] || '').trim();
    const duprId = String(data[i][duprIdx] || '').trim();
    if (id) map[id] = { fullName: name, duprId };
  }
  return map;
}

function duprGetEventName_() {
  return 'Connecticut Pickleball League Match';
}

// ── Core generator ────────────────────────────────────────────────────────────

/**
 * Builds the DUPR CSV string for all completed games in the given week.
 * Returns null if no data found.
 */
function generateDuprCsvForWeek_(weekNum) {
  weekNum = Number(weekNum);
  if (!weekNum) return null;

  const ss = getBackendSpreadsheet_();
  const playerMap = duprBuildPlayerLookup_();

  // ── Match date lookup ──
  const matchesSheet = ss.getSheetByName('Matches');
  const matchMeta = {}; // match_id → { date, divisionId }
  if (matchesSheet) {
    const data = matchesSheet.getDataRange().getValues();
    const h    = data[0].map(x => String(x).trim().toLowerCase());
    const idIdx   = h.indexOf('match_id');
    const dateIdx = h.indexOf('match_date');
    const divIdx  = h.indexOf('division_id');
    for (let i = 1; i < data.length; i++) {
      const mid = String(data[i][idIdx] || '').trim();
      if (!mid || duprExtractWeekNum_(mid) !== weekNum) continue;
      const rawDate = data[i][dateIdx];
      let dateStr = '';
      if (rawDate instanceof Date) {
        // Add 12 hours before formatting to avoid off-by-one-day issues caused by
        // midnight-UTC vs midnight-local timezone differences in GAS date handling.
        const noon = new Date(rawDate.getTime() + 12 * 60 * 60 * 1000);
        dateStr = Utilities.formatDate(noon, 'America/New_York', 'yyyy-MM-dd');
      } else {
        dateStr = String(rawDate || '').slice(0, 10);
      }
      matchMeta[mid] = { date: dateStr, divisionId: String(data[i][divIdx] || '') };
    }
  }

  if (!Object.keys(matchMeta).length) return null;

  // ── Game rows ──
  const gamesSheet = ss.getSheetByName('Match_Games');
  if (!gamesSheet) return null;

  const gData = gamesSheet.getDataRange().getValues();
  const gh    = gData[0].map(x => String(x).trim().toLowerCase());
  const gc    = name => gh.indexOf(name);

  const eventName = duprGetEventName_();
  const HEADER = 'matchType,scoreType,event,date,' +
    'playerA1,playerA1DuprId,playerA2,playerA2DuprId,' +
    'playerB1,playerB1DuprId,playerB2,playerB2DuprId,' +
    'teamAGame1,teamBGame1,teamAGame2,teamBGame2,teamAGame3,teamBGame3,teamAGame4,teamBGame4,teamAGame5,teamBGame5';

  const rows = [HEADER];

  for (let i = 1; i < gData.length; i++) {
    const row     = gData[i];
    const matchId = String(row[gc('match_id')] || '').trim();
    if (!matchMeta[matchId]) continue;

    const hScore = row[gc('home_score')];
    const aScore = row[gc('away_score')];
    // Skip unscored games
    if (hScore === '' || hScore === null || hScore === undefined) continue;
    if (aScore === '' || aScore === null || aScore === undefined) continue;
    // Skip games where neither team reached 6 points (incomplete/forfeit)
    if (Number(hScore) < 6 && Number(aScore) < 6) continue;

    // Player IDs → names + DUPR IDs via Players sheet lookup
    const id1h = String(row[gc('home_player_1_id')] || '').trim();
    const id2h = String(row[gc('home_player_2_id')] || '').trim();
    const id1a = String(row[gc('away_player_1_id')] || '').trim();
    const id2a = String(row[gc('away_player_2_id')] || '').trim();

    // Skip games with no player assignments at all
    if (!id1h && !id2h && !id1a && !id2a) continue;

    const p1h = (playerMap[id1h] || {}).fullName || '';
    const p2h = (playerMap[id2h] || {}).fullName || '';
    const p1a = (playerMap[id1a] || {}).fullName || '';
    const p2a = (playerMap[id2a] || {}).fullName || '';
    const d1h = (playerMap[id1h] || {}).duprId   || '';
    const d2h = (playerMap[id2h] || {}).duprId   || '';
    const d1a = (playerMap[id1a] || {}).duprId   || '';
    const d2a = (playerMap[id2a] || {}).duprId   || '';

    const meta = matchMeta[matchId];

    rows.push([
      'D',
      'SIDEOUT',
      duprCsvEsc_(eventName),
      meta.date,
      duprCsvEsc_(p1h), duprCsvEsc_(d1h),
      duprCsvEsc_(p2h), duprCsvEsc_(d2h),
      duprCsvEsc_(p1a), duprCsvEsc_(d1a),
      duprCsvEsc_(p2a), duprCsvEsc_(d2a),
      hScore, aScore,
      '', '', '', '', '', '', '', ''   // game 2–5 columns empty (one game per court)
    ].join(','));
  }

  return rows.length > 1 ? rows.join('\r\n') : null;
}

// ── Week-complete detection ───────────────────────────────────────────────────

function duprIsWeekComplete_(weekNum) {
  const ss = getBackendSpreadsheet_();
  const sheet = ss.getSheetByName('Matches');
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const h    = data[0].map(x => String(x).trim().toLowerCase());
  const idIdx  = h.indexOf('match_id');
  const stIdx  = h.indexOf('status');
  let total = 0, done = 0;
  for (let i = 1; i < data.length; i++) {
    const mid = String(data[i][idIdx] || '').trim();
    if (!mid || duprExtractWeekNum_(mid) !== weekNum) continue;
    total++;
    const st = String(data[i][stIdx] || '').trim().toLowerCase();
    if (st === 'completed' || st === 'complete' || st === 'final') done++;
  }
  return total > 0 && total === done;
}

// ── Commissioner email lookup ─────────────────────────────────────────────────

function duprGetCommissionerEmails_() {
  try {
    const ss    = getBackendSpreadsheet_();
    const sheet = ss.getSheetByName('Users');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const h    = data[0].map(x => String(x).trim().toLowerCase());
    const eIdx = h.indexOf('email');
    const rIdx = h.indexOf('role_type');
    const aIdx = h.indexOf('active');
    const emails = [];
    for (let i = 1; i < data.length; i++) {
      const role   = String(data[i][rIdx] || '').trim().toLowerCase();
      const active = data[i][aIdx];
      const email  = String(data[i][eIdx] || '').trim().toLowerCase();
      if ((role === 'commissioner' || role === 'director') && active && email && !emails.includes(email)) {
        emails.push(email);
      }
    }
    return emails;
  } catch (e) { return []; }
}

// ── Save to Drive + email ─────────────────────────────────────────────────────

function duprSaveAndNotify_(weekNum, csv) {
  const fileName = 'CPBL_Week' + weekNum + '_DUPR_' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '.csv';
  const blob = Utilities.newBlob(csv, 'text/csv', fileName);

  // Save to a "DUPR Exports" folder in Drive, creating it if needed.
  let folder;
  try {
    const folders = DriveApp.getFoldersByName('CPBL DUPR Exports');
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('CPBL DUPR Exports');
  } catch (e) {
    folder = DriveApp.getRootFolder();
  }
  const file = folder.createFile(blob);
  const fileUrl = file.getUrl();
  Logger.log('DUPR CSV saved: ' + fileUrl);

  // Email commissioners
  const recipients = duprGetCommissionerEmails_();
  if (recipients.length) {
    try {
      GmailApp.sendEmail(
        recipients.join(','),
        'CPBL Week ' + weekNum + ' — DUPR Results CSV',
        'All matches for Week ' + weekNum + ' are complete. The DUPR upload CSV is attached.\n\n' +
        'It is also saved in Google Drive:\n' + fileUrl + '\n\n' +
        'Upload it at https://dupr.com to post results.',
        {
          attachments: [Utilities.newBlob(csv, 'text/csv', fileName)],
          name: 'CPBL League Admin'
        }
      );
    } catch (e) {
      Logger.log('DUPR email error: ' + e);
    }
  }

  return { fileUrl, fileName };
}

// ── Auto-trigger (called after every score save) ──────────────────────────────

/**
 * Called from recordGameScoreV2 after a successful save.
 * Detects when the last game of the week is entered and auto-exports.
 * Uses ScriptProperties to ensure each week is only exported once automatically.
 */
function duprCheckAndExportIfWeekComplete_(matchId) {
  try {
    const weekNum = duprExtractWeekNum_(matchId);
    if (!weekNum) return;

    // Guard: only export once per week automatically.
    const props = PropertiesService.getScriptProperties();
    const key   = 'DUPR_AUTO_EXPORTED_W' + weekNum;
    if (props.getProperty(key)) return;

    if (!duprIsWeekComplete_(weekNum)) return;

    const csv = generateDuprCsvForWeek_(weekNum);
    if (!csv) return;

    props.setProperty(key, new Date().toISOString());
    duprSaveAndNotify_(weekNum, csv);
  } catch (e) {
    Logger.log('duprCheckAndExportIfWeekComplete_ error: ' + e);
  }
}

// ── Preview (no save, no email) ───────────────────────────────────────────────

/**
 * Generate CSV data for preview — does NOT save to Drive or send email.
 * Returns { ok, rows, headers, rowCount, eventName } or { ok:false, error }.
 * rows is an array of objects keyed by header name.
 */
function previewDuprCsv(weekNum) {
  weekNum = Number(weekNum);
  if (!weekNum) return JSON.stringify({ ok: false, error: 'Invalid week number.' });

  const csv = generateDuprCsvForWeek_(weekNum);
  if (!csv) return JSON.stringify({ ok: false, error: 'No completed game data found for Week ' + weekNum + '. Make sure all games have scores entered.' });

  const lines   = csv.split('\r\n').filter(Boolean);
  const headers = lines[0].split(',');
  const rows    = lines.slice(1).map(line => {
    // Simple CSV parse (fields may be quoted)
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fields[i] || ''; });
    return obj;
  });

  return JSON.stringify({ ok: true, headers, rows, rowCount: rows.length, csv });
}

// ── Manual export (called from Admin via fetch) ───────────────────────────────

/**
 * Manually generate, save to Drive, and email commissioners for a given week.
 * Returns { ok, fileUrl, fileName, rowCount } or { ok:false, error }.
 * The 'force' flag resets the auto-export guard so it can re-trigger on next save.
 */
function exportDuprCsvManual(weekNum, force) {
  weekNum = Number(weekNum);
  if (!weekNum) return JSON.stringify({ ok: false, error: 'Invalid week number.' });

  const csv = generateDuprCsvForWeek_(weekNum);
  if (!csv) return JSON.stringify({ ok: false, error: 'No completed game data found for Week ' + weekNum + '.' });

  const rowCount = csv.split('\r\n').filter(Boolean).length - 1;

  if (force) {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('DUPR_AUTO_EXPORTED_W' + weekNum);
  }

  const { fileUrl, fileName } = duprSaveAndNotify_(weekNum, csv);
  return JSON.stringify({ ok: true, fileUrl, fileName, rowCount });
}
