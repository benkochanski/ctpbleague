function getSpreadsheet_() {
  return getBackendSpreadsheet_();
}

/**
 * Remove a trailing " Division N" suffix from a team name. Case-insensitive,
 * tolerates extra whitespace. Returns the trimmed name unchanged if no match.
 *   "Camp Division 1" → "Camp"
 *   "Dill Dinkers Division 5" → "Dill Dinkers"
 *   "Hartford" → "Hartford"
 */
function stripDivisionSuffix_(name) {
  if (!name) return '';
  return String(name).replace(/\s+division\s+\d+\s*$/i, '').trim();
}

function getSheet_(sheetName) {
  const sh = getSpreadsheet_().getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet not found: ${sheetName}`);
  return sh;
}

function getData_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (!values.length) return { headers: [], rows: [] };

  const headers = values[0].map(String);
  const rows = values.slice(1).filter(r => r.some(v => String(v).trim() !== ''));
  return { headers, rows };
}

function rowsToObjects_(headers, rows) {
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getObjects_(sheetName) {
  const { headers, rows } = getData_(sheetName);
  return rowsToObjects_(headers, rows);
}

// Like getObjects_ but reads cell display strings instead of parsed values.
// Use this when you need dates/times exactly as the sheet shows them, with no
// timezone conversion — cells formatted as dates come back as "5/2/2026" etc.
function getDisplayObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const displayRows = sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues()
    .filter(r => r.some(v => v !== ''));
  return rowsToObjects_(headers, displayRows);
}

function appendObjects_(sheetName, objects) {
  if (!objects.length) return;
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);

  const values = objects.map(obj => headers.map(h => obj[h] ?? ''));
  sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function overwriteObjects_(sheetName, objects) {
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), headers.length).clearContent();
  if (!objects.length) return;

  const values = objects.map(obj => headers.map(h => obj[h] ?? ''));
  sh.getRange(2, 1, values.length, headers.length).setValues(values);
}

function makeId_(prefix) {
  return `${prefix}_${Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function nowStamp_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
}

function normalizeBool_(value) {
  if (value === true || value === false) return value;
  const s = String(value).trim().toLowerCase();
  return ['true', 'yes', 'y', '1'].includes(s);
}