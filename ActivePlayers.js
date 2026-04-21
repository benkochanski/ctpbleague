const MATCH_PLAYER_ACTIVE_SHEET = 'Match_Player_Active';

function getMatchPlayerActiveMap_(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return {};

  const sh = getOrCreateMatchPlayerActiveSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return {};

  const headers = values[0].map(String);
  const col = indexMap_(headers, [
    'match_id',
    'player_id',
    'is_active',
    'updated_at',
    'updated_by'
  ]);

  const out = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowMatchId = String(row[col.match_id] || '').trim();
    const playerId = String(row[col.player_id] || '').trim();
    if (!rowMatchId || !playerId) continue;
    if (rowMatchId !== id) continue;

    out[playerId] = normalizeBool_(row[col.is_active]);
  }

  return out;
}

function saveMatchPlayerActiveState(matchId, playerId, isActive) {
  const matchIdStr = String(matchId || '').trim();
  const playerIdStr = String(playerId || '').trim();
  if (!matchIdStr) throw new Error('Missing matchId');
  if (!playerIdStr) throw new Error('Missing playerId');

  const sh = getOrCreateMatchPlayerActiveSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = indexMap_(headers, [
    'match_id',
    'player_id',
    'is_active',
    'updated_at',
    'updated_by'
  ]);

  const now = new Date();
  const userEmail = tryGetUserEmail_();

  let foundRow = -1;
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (
      String(row[col.match_id] || '').trim() === matchIdStr &&
      String(row[col.player_id] || '').trim() === playerIdStr
    ) {
      foundRow = r + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sh.getRange(foundRow, col.is_active + 1).setValue(!!isActive);
    sh.getRange(foundRow, col.updated_at + 1).setValue(now);
    sh.getRange(foundRow, col.updated_by + 1).setValue(userEmail);
  } else {
    sh.appendRow([
      matchIdStr,
      playerIdStr,
      !!isActive,
      now,
      userEmail
    ]);
  }

  return {
    ok: true,
    match_id: matchIdStr,
    player_id: playerIdStr,
    is_active: !!isActive
  };
}

function saveMatchPlayerActiveStates(matchId, states) {
  const matchIdStr = String(matchId || '').trim();
  if (!matchIdStr) throw new Error('Missing matchId');
  if (!Array.isArray(states)) throw new Error('States must be an array');

  const sh = getOrCreateMatchPlayerActiveSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = indexMap_(headers, [
    'match_id',
    'player_id',
    'is_active',
    'updated_at',
    'updated_by'
  ]);

  const now = new Date();
  const userEmail = tryGetUserEmail_();

  const existingRowMap = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rowMatchId = String(row[col.match_id] || '').trim();
    const playerId = String(row[col.player_id] || '').trim();
    if (!rowMatchId || !playerId) continue;
    existingRowMap[`${rowMatchId}||${playerId}`] = r + 1;
  }

  const appends = [];

  states.forEach(obj => {
    const playerIdStr = String(obj.player_id || '').trim();
    if (!playerIdStr) return;

    const isActive = !!obj.is_active;
    const key = `${matchIdStr}||${playerIdStr}`;
    const rowNum = existingRowMap[key];

    if (rowNum) {
      sh.getRange(rowNum, col.is_active + 1).setValue(isActive);
      sh.getRange(rowNum, col.updated_at + 1).setValue(now);
      sh.getRange(rowNum, col.updated_by + 1).setValue(userEmail);
    } else {
      appends.push([
        matchIdStr,
        playerIdStr,
        isActive,
        now,
        userEmail
      ]);
    }
  });

  if (appends.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  }

  return {
    ok: true,
    match_id: matchIdStr,
    count: states.length
  };
}

function clearMatchPlayerActiveStates(matchId) {
  const matchIdStr = String(matchId || '').trim();
  if (!matchIdStr) throw new Error('Missing matchId');

  const sh = getOrCreateMatchPlayerActiveSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: true, removed: 0 };

  const headers = values[0].map(String);
  const col = indexMap_(headers, ['match_id']);

  const rowsToDelete = [];
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][col.match_id] || '').trim() === matchIdStr) {
      rowsToDelete.push(r + 1);
    }
  }

  rowsToDelete.forEach(rowNum => sh.deleteRow(rowNum));

  return { ok: true, removed: rowsToDelete.length };
}

function getOrCreateMatchPlayerActiveSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(MATCH_PLAYER_ACTIVE_SHEET);

  if (!sh) {
    sh = ss.insertSheet(MATCH_PLAYER_ACTIVE_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([[
      'match_id',
      'player_id',
      'is_active',
      'updated_at',
      'updated_by'
    ]]);
  }

  return sh;
}

function indexMap_(headers, required) {
  const out = {};
  required.forEach(name => {
    const idx = headers.findIndex(h => String(h).trim() === name);
    if (idx === -1) throw new Error(`Missing required column: ${name}`);
    out[name] = idx;
  });
  return out;
}

function normalizeBool_(value) {
  if (value === true) return true;
  if (value === false) return false;

  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function tryGetUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}