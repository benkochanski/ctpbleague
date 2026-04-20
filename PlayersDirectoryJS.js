function getPlayersDirectoryData() {
  return {
    players: getLeaguePlayers_(),
    branding: getPlayersDirectoryBranding_()
  };
}

function getLeaguePlayers_() {
  const ss = getBackendSpreadsheet_();
  const sheetName = (typeof SHEETS !== 'undefined' && SHEETS.PLAYERS) ? SHEETS.PLAYERS : 'Players';
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h || '').trim());
  const rows = values.slice(1);

  const col = {
    playerId: findHeaderIndex_(headers, ['player_id', 'player id', 'id']),
    name: findHeaderIndex_(headers, ['name', 'player', 'player name', 'full_name', 'full name']),
    club: findHeaderIndex_(headers, ['club', 'team', 'club name']),
    gender: findHeaderIndex_(headers, ['gender', 'sex']),
    registeredDate: findHeaderIndex_(headers, ['registered_date', 'registered date', 'date registered', 'registration date', 'registered']),
    registeredDupr: findHeaderIndex_(headers, ['registered_dupr', 'registered dupr', 'dupr', 'reg dupr']),
    eligibility: findHeaderIndex_(headers, ['eligibility', 'lowest eligible division', 'lowest eligible', 'lowest division', 'eligible division', 'lowest div', 'division', 'div']),
    duprId: findHeaderIndex_(headers, ['dupr_id', 'dupr id', 'duprid', 'dupr number', 'player dupr id'])
  };

  return rows
    .filter(row => getCellStringPD_(row, col.name) !== '')
    .map((row, index) => {
      const playerId = getCellStringPD_(row, col.playerId) || `PLY${String(index + 1).padStart(3, '0')}`;
      const name = getCellStringPD_(row, col.name);
      const clubRaw = getCellStringPD_(row, col.club);
      const genderRaw = getCellStringPD_(row, col.gender);
      const registeredDateRaw = col.registeredDate > -1 ? row[col.registeredDate] : '';
      const registeredDupr = getCellStringPD_(row, col.registeredDupr);
      const eligibilityRaw = getCellStringPD_(row, col.eligibility);
      const duprId = getCellStringPD_(row, col.duprId);

      return {
        id: playerId,
        playerId: playerId,
        name: name,
        club: normalizeClubPD_(clubRaw),
        gender: normalizeGenderPD_(genderRaw),
        registeredDateDisplay: formatDateForDisplayPD_(registeredDateRaw),
        registeredDateSort: formatDateForSortPD_(registeredDateRaw),
        registeredDupr: normalizeDuprDisplayPD_(registeredDupr),
        registeredDuprSort: normalizeDuprSortPD_(registeredDupr),
        eligibility: normalizeEligibilityPD_(eligibilityRaw),
        duprId: String(duprId || '').trim().toUpperCase()
      };
    });
}

function getPlayersDirectoryBranding_() {
  try {
    const brandingSheetName = (typeof SHEETS !== 'undefined' && SHEETS.BRANDING) ? SHEETS.BRANDING : 'Branding';
    const ss = getBackendSpreadsheet_();
    const sh = ss.getSheetByName(brandingSheetName);

    if (!sh || sh.getLastRow() <= 1) {
      return { leagueLogoUrl: '', campLogoUrl: '', dillLogoUrl: '' };
    }

    const values = sh.getDataRange().getValues();
    const map = {};
    values.slice(1).forEach(row => {
      const key = String(row[0] || '').trim();
      const value = String(row[1] || '').trim();
      if (key) map[key] = value;
    });

    return {
      leagueLogoUrl: resolveBrandingUrlPD_(map.leagueLogoFileId || map.leagueLogoUrl || ''),
      campLogoUrl: resolveBrandingUrlPD_(map.campLogoFileId || map.campLogoUrl || ''),
      dillLogoUrl: resolveBrandingUrlPD_(map.dillLogoFileId || map.dillLogoUrl || '')
    };
  } catch (err) {
    return { leagueLogoUrl: '', campLogoUrl: '', dillLogoUrl: '' };
  }
}

function resolveBrandingUrlPD_(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (typeof normalizeLogoUrl_ === 'function') return normalizeLogoUrl_(s);
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(s)}&sz=w1200`;
}

function findHeaderIndex_(headers, candidates) {
  const normalizedHeaders = headers.map(normalizeHeaderPD_);
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(normalizeHeaderPD_(candidate));
    if (idx > -1) return idx;
  }
  return -1;
}

function normalizeHeaderPD_(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getCellStringPD_(row, idx) {
  if (idx < 0) return '';
  return String(row[idx] == null ? '' : row[idx]).trim();
}

function normalizeClubPD_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s.includes('camp')) return 'Camp';
  if (s.includes('dill')) return 'Dill';
  return String(value || '').trim() || 'Other';
}

function normalizeGenderPD_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (['f', 'female', 'woman', 'women', 'w'].includes(s)) return 'F';
  if (['m', 'male', 'man', 'men'].includes(s)) return 'M';
  return '';
}

function normalizeDuprDisplayPD_(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const num = Number(String(s).replace(/[^\d.]/g, ''));
  if (isNaN(num)) return s;
  return num.toFixed(3);
}

function normalizeDuprSortPD_(value) {
  const s = String(value || '').trim();
  if (!s) return -1;
  const num = Number(String(s).replace(/[^\d.]/g, ''));
  return isNaN(num) ? -1 : num;
}

function normalizeEligibilityPD_(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const n = Number(s);
  if ([1, 2, 3, 4, 5].includes(n)) return String(n);

  const match = s.match(/\d+/);
  if (match) {
    const found = Number(match[0]);
    if ([1, 2, 3, 4, 5].includes(found)) return String(found);
  }
  return '';
}

function formatDateForDisplayPD_(value) {
  if (!value) return '';
  let d = null;
  if (value instanceof Date && !isNaN(value)) d = value;
  else {
    const parsed = new Date(value);
    if (!isNaN(parsed)) d = parsed;
  }
  if (!d) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MM/dd/yy');
}

function formatDateForSortPD_(value) {
  if (!value) return '';
  let d = null;
  if (value instanceof Date && !isNaN(value)) d = value;
  else {
    const parsed = new Date(value);
    if (!isNaN(parsed)) d = parsed;
  }
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}