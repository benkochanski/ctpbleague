// ── Registration ────────────────────────────────────────────────────────────
// Player self-registration. Optional DUPR linking via SSO (handled on the
// hub side; we just receive the verified duprId here).
//
// Public endpoints (Web.js):
//   GET  ?page=regdata        → { clubs, teams, divisions, seasons } for the form
//   POST ?page=register       → creates a Players row, returns { ok, player_id }
//
// The Players sheet schema (Schema.js):
//   player_id, first_name, last_name, full_name, gender, dupr, dupr_id, email,
//   phone, active, notes
// ────────────────────────────────────────────────────────────────────────────

// Public form-bootstrap data: clubs, teams, divisions, current season.
function getRegistrationFormData_() {
  const ss = getBackendSpreadsheet_();
  const sheetRows = (name) => {
    const sh = ss.getSheetByName(name);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    const h = data[0].map(x => String(x).trim().toLowerCase());
    return data.slice(1).map(row => {
      const o = {};
      h.forEach((col, i) => { o[col] = row[i]; });
      return o;
    });
  };
  const clubs     = sheetRows('Clubs').filter(c => c.active);
  const teams     = sheetRows('Teams').filter(t => t.active);
  const divisions = sheetRows('Divisions').filter(d => d.active);
  const seasons   = sheetRows('Seasons');
  const currentSeason = seasons.find(s => String(s.status || '').toLowerCase() === 'active')
    || seasons[seasons.length - 1] || null;
  return {
    clubs: clubs.map(c => ({ club_id: c.club_id, club_name: c.club_name, short_name: c.short_name, logo_url: c.logo_url })),
    teams: teams.map(t => ({ team_id: t.team_id, team_name: t.team_name, club_id: t.club_id, division_id: t.division_id })),
    divisions: divisions.map(d => ({ division_id: d.division_id, division_name: d.division_name, division_order: d.division_order })),
    season: currentSeason ? { season_id: currentSeason.season_id, season_name: currentSeason.season_name } : null,
  };
}

// Allocate the next sequential player_id (PLY###).
function nextPlayerId_() {
  const ss = getBackendSpreadsheet_();
  const sheet = ss.getSheetByName('Players');
  if (!sheet) throw new Error('Players sheet missing');
  const data = sheet.getDataRange().getValues();
  const h = data[0].map(x => String(x).trim().toLowerCase());
  const idIdx = h.indexOf('player_id');
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][idIdx] || '').match(/^PLY(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'PLY' + String(max + 1).padStart(3, '0');
}

// Submit handler. Payload comes in as JSON from the hub registration page.
//
//   {
//     firstName, lastName, gender, email, phone,
//     clubId, teamId,         // selected from dropdowns
//     duprId?, dupr?,         // optional, prefilled from DUPR SSO
//     duprUserToken?          // optional, raw user token from postMessage (audit only)
//   }
//
// Returns { ok, player_id, full_name } or { ok:false, error }.
function registerPlayerSubmit(rawJson) {
  const ss = getBackendSpreadsheet_();
  let body;
  try { body = JSON.parse(rawJson || '{}'); } catch (e) { return { ok: false, error: 'invalid JSON' }; }

  const errs = [];
  const trim = (k) => String(body[k] || '').trim();
  const firstName = trim('firstName');
  const lastName  = trim('lastName');
  const email     = trim('email').toLowerCase();
  const phone     = trim('phone');
  const gender    = trim('gender');
  const clubId    = trim('clubId');
  const teamId    = trim('teamId');
  const duprId    = trim('duprId').toUpperCase();
  const duprRating = trim('dupr');

  if (!firstName) errs.push('firstName required');
  if (!lastName)  errs.push('lastName required');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push('valid email required');
  if (!gender) errs.push('gender required');
  if (!clubId) errs.push('club required');
  if (errs.length) return { ok: false, error: errs.join('; ') };

  // Reject duplicate email (must be unique in Players sheet).
  const playersSheet = ss.getSheetByName('Players');
  const pData = playersSheet.getDataRange().getValues();
  const ph = pData[0].map(x => String(x).trim().toLowerCase());
  const emailIdx = ph.indexOf('email');
  const duprIdIdx = ph.indexOf('dupr_id');
  for (let i = 1; i < pData.length; i++) {
    if (String(pData[i][emailIdx] || '').trim().toLowerCase() === email) {
      return { ok: false, error: 'A player with this email is already registered.' };
    }
    if (duprId && String(pData[i][duprIdIdx] || '').trim().toUpperCase() === duprId) {
      return { ok: false, error: 'A player with this DUPR ID is already registered.' };
    }
  }

  const playerId = nextPlayerId_();
  const fullName = (firstName + ' ' + lastName).trim();
  const row = {
    player_id: playerId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    gender: gender,
    dupr: duprRating ? Number(duprRating) : '',
    dupr_id: duprId,
    email: email,
    phone: phone,
    active: true,
    notes: '',
  };
  // Append row in schema order.
  playersSheet.appendRow(ph.map(col => row[col] != null ? row[col] : ''));

  // Roster: optional team assignment via Team_Rosters.
  if (teamId) {
    try {
      const rostersSheet = ss.getSheetByName('Team_Rosters');
      if (rostersSheet) {
        const rh = rostersSheet.getDataRange().getValues()[0].map(x => String(x).trim().toLowerCase());
        const seasonId = (getRegistrationFormData_().season || {}).season_id || '';
        const rosterRow = {
          roster_id: 'ROST' + Utilities.getUuid().slice(0, 8).toUpperCase(),
          season_id: seasonId,
          team_id: teamId,
          player_id: playerId,
          roster_status: 'pending_confirmation',
          available: true,
          active: true,
          start_date: new Date(),
          end_date: '',
          notes: 'self-registered',
        };
        rostersSheet.appendRow(rh.map(col => rosterRow[col] != null ? rosterRow[col] : ''));
      }
    } catch (e) {
      Logger.log('Roster append failed for ' + playerId + ': ' + e);
    }
  }

  // Audit.
  try {
    appendAuditLog_({
      access: { userId: 'self-register', email: email, name: fullName },
      entityType: 'Players',
      entityId: playerId,
      actionType: 'register',
      newValueJson: JSON.stringify({ fullName, email, clubId, teamId, duprId }),
      reason: 'self-registration',
    });
  } catch (e) { /* never block on audit */ }

  // Notify commissioners (existing pattern from DuprExport.js).
  try {
    const recipients = duprGetCommissionerEmails_();
    if (recipients.length) {
      GmailApp.sendEmail(
        recipients.join(','),
        'CPBL: new registration — ' + fullName,
        'New player registered:\n\n' +
        '  Name:    ' + fullName + '\n' +
        '  Email:   ' + email + '\n' +
        '  Phone:   ' + (phone || '—') + '\n' +
        '  Gender:  ' + gender + '\n' +
        '  Club:    ' + clubId + '\n' +
        '  Team:    ' + (teamId || '—') + '\n' +
        '  DUPR ID: ' + (duprId || '—') + (duprRating ? ' (rating ' + duprRating + ')' : '') + '\n\n' +
        'Sheet: ' + ss.getUrl(),
        { name: 'CPBL Registration' }
      );
    }
  } catch (e) { Logger.log('Registration notify failed: ' + e); }

  return { ok: true, player_id: playerId, full_name: fullName };
}
