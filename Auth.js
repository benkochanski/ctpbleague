/**
 * Auth helpers — Google Identity Services (client-side sign-in) + server-side
 * verification of the resulting ID token.
 *
 * The web app deployment is "Execute as: Me / Anyone, even anonymous". The
 * captain identifies themselves by clicking the Google Sign-In button on
 * Captain.html or Scorecard.html — Google issues a signed JWT (the ID token)
 * and the page passes it to the backend with every write call. The backend
 * verifies the token via the public tokeninfo endpoint, extracts the email,
 * looks the user up in the Users sheet, and authorizes.
 *
 * Tokens are short-lived (~1 hour). The client refreshes them silently.
 */

/**
 * Verify a Google ID token by calling Google's tokeninfo endpoint.
 *
 * Returns { email, name, sub, exp } on success.
 * Throws on missing/expired/forged token, or wrong audience.
 *
 * Note: tokeninfo is the simple verification path (one HTTPS round-trip).
 * For high-throughput use, prefer local JWT signature verification with
 * Google's published keys, but for our scale tokeninfo is fine and has the
 * advantage that Google does the signature work for us.
 */
function verifyGoogleIdToken_(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw new Error('Missing Google ID token. Please sign in.');

  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' +
              encodeURIComponent(token);
  let resp;
  try {
    resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    throw new Error('Could not reach Google to verify sign-in: ' + e.message);
  }
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) {
    throw new Error('Sign-in token rejected by Google (HTTP ' + code + '). ' +
                    'Try signing out and back in.');
  }

  let payload;
  try { payload = JSON.parse(body); }
  catch (e) { throw new Error('Could not parse tokeninfo response: ' + e.message); }

  const iss = String(payload.iss || '');
  const aud = String(payload.aud || '');
  const exp = Number(payload.exp || 0);
  const now = Math.floor(Date.now() / 1000);

  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    throw new Error('Sign-in token has wrong issuer: ' + iss);
  }
  if (aud !== GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error('Sign-in token has wrong audience. ' +
                    'Expected ' + GOOGLE_OAUTH_CLIENT_ID + ' but got ' + aud);
  }
  if (exp <= now) {
    throw new Error('Sign-in token has expired. Please sign in again.');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new Error('Sign-in token has no email claim.');
  if (String(payload.email_verified || '').toLowerCase() !== 'true') {
    throw new Error('Sign-in token email is not verified.');
  }

  return {
    email,
    name: String(payload.name || '').trim(),
    sub:  String(payload.sub || ''),
    exp
  };
}

/**
 * Internal: find all active Users rows for the given email and build an
 * access profile. Single-sheet lookup — no User_Access join needed.
 *
 * Returns the full access object, or { ok:false, reason } on failure.
 */
function resolveAccessByEmail_(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { ok: false, email: '', userId: '', name: '',
             isCommissioner: false, allowedTeamIds: [], allowedClubIds: [],
             clubId: '', clubName: '', shortName: '',
             reason: 'No email supplied' };
  }

  const rows = getObjects_(SHEETS.USERS).filter(u =>
    String(u.email || '').trim().toLowerCase() === cleanEmail &&
    (u.active === undefined || u.active === '' || normalizeBool_(u.active))
  );
  if (!rows.length) {
    return { ok: false, email: cleanEmail, userId: '', name: '',
             isCommissioner: false, allowedTeamIds: [], allowedClubIds: [],
             clubId: '', clubName: '', shortName: '',
             reason: 'Email not found in active Users list' };
  }

  const userId = String(rows[0].user_id || '').trim();
  const name   = String(rows[0].full_name || rows[0].name || '').trim();

  const isCommissioner = rows.some(r =>
    String(r.role_type || '').trim().toLowerCase() === ROLE.COMMISSIONER
  );

  const directTeamIds = new Set();
  const clubIds = new Set();
  rows.forEach(r => {
    const role   = String(r.role_type || '').trim().toLowerCase();
    const teamId = String(r.team_id || '').trim();
    const clubId = String(r.club_id || '').trim();
    if (role === ROLE.CAPTAIN && teamId) directTeamIds.add(teamId);
    if (clubId && (role === ROLE.DIRECTOR || (role === ROLE.CAPTAIN && !teamId))) {
      clubIds.add(clubId);
    }
  });

  const allowedTeamIds = new Set(directTeamIds);
  let primaryClubId = '', clubName = '', shortName = '';

  if (clubIds.size) {
    primaryClubId = [...clubIds][0];
    const allClubs = getObjects_(SHEETS.CLUBS);
    const primaryClub = allClubs.find(c => String(c.club_id || '').trim() === primaryClubId) || null;
    clubName  = primaryClub ? String(primaryClub.club_name  || '').trim() : '';
    shortName = primaryClub ? String(primaryClub.short_name || '').trim() : '';

    if (!isCommissioner) {
      getObjects_(SHEETS.TEAMS)
        .filter(t => clubIds.has(String(t.club_id || '').trim()))
        .forEach(t => {
          const id = String(t.team_id || '').trim();
          if (id) allowedTeamIds.add(id);
        });
    }
  }

  // For captain rows with direct team_id (no club_id), derive club for display.
  if (!primaryClubId && directTeamIds.size) {
    const firstTeam = getObjects_(SHEETS.TEAMS)
      .find(t => directTeamIds.has(String(t.team_id || '').trim()));
    if (firstTeam) {
      primaryClubId = String(firstTeam.club_id || '').trim();
      if (primaryClubId) {
        const club = getObjects_(SHEETS.CLUBS)
          .find(c => String(c.club_id || '').trim() === primaryClubId);
        if (club) {
          clubName  = String(club.club_name  || '').trim();
          shortName = String(club.short_name || '').trim();
        }
      }
    }
  }

  const ok = isCommissioner || allowedTeamIds.size > 0;
  return {
    ok,
    email: cleanEmail,
    userId,
    name,
    isCommissioner,
    allowedTeamIds: Array.from(allowedTeamIds),
    allowedClubIds: Array.from(clubIds),
    clubId: primaryClubId,
    clubName,
    shortName,
    reason: ok ? '' : 'No active captain/director/commissioner roles for this user'
  };
}

/**
 * Returns the captain access summary for a given email.
 *
 *   { ok, email, userId, name, isCommissioner, allowedTeamIds, allowedClubIds, reason }
 *
 * Director access expands automatically to all teams in the director's club(s).
 */
function getCaptainAccessForEmail_(email) {
  return resolveAccessByEmail_(email);
}

/**
 * Throws unless the bearer of the given Google ID token is allowed to manage
 * the given team. Returns the resolved access object on success, which the
 * caller can use to record the editor's identity in audit logs.
 *
 * Use at the top of any captain-only handler:
 *
 *   const access = requireCaptainAccess_(idToken, cleanTeamId);
 *   // ...do the write...
 *   appendAuditLog_({ access, entityType:'Lineup', entityId: cleanMatchId,
 *                     actionType:'submit', newValueJson: JSON.stringify(...) });
 */
function requireCaptainAccess_(idToken, teamId) {
  const cleanTeamId = String(teamId || '').trim();
  if (!cleanTeamId) throw new Error('Missing teamId');

  const verified = verifyGoogleIdToken_(idToken);  // throws if invalid
  const access = getCaptainAccessForEmail_(verified.email);

  // Always carry the verified email/name forward, even when the user isn't in
  // the Users sheet — we still want to log who tried to do what.
  if (!access.name && verified.name) access.name = verified.name;

  if (!access.ok) {
    throw new Error('Not authorized. ' + access.reason +
                    '. Email used: ' + access.email +
                    '. Ask the league commissioner to add you to the Users sheet.');
  }
  if (!access.isCommissioner && access.allowedTeamIds.indexOf(cleanTeamId) === -1) {
    throw new Error('You don\'t have access to team ' + cleanTeamId + '. ' +
                    'Allowed teams for ' + access.email + ': ' +
                    (access.allowedTeamIds.join(', ') || '(none)') + '.');
  }
  return access;
}

/**
 * Public lookup callable from a client page (Captain.html, Scorecard.html)
 * to discover who's signed in and what teams they can manage. Pass the
 * Google ID token as the only argument.
 */
function getMyCaptainAccessV1(idToken) {
  try {
    const verified = verifyGoogleIdToken_(idToken);
    const access = getCaptainAccessForEmail_(verified.email);
    return JSON.stringify({
      ok: access.ok,
      email: access.email,
      name: access.name || verified.name,
      isCommissioner: access.isCommissioner,
      allowedTeamIds: access.allowedTeamIds,
      reason: access.reason
    });
  } catch (e) {
    return JSON.stringify({
      ok: false, email: '', name: '', isCommissioner: false,
      allowedTeamIds: [], reason: String(e.message || e)
    });
  }
}

/**
 * Append an audit-log row. Schema lives in Schema.js → SHEETS.AUDIT_LOG.
 *
 *   appendAuditLog_({
 *     access:        { email, name, userId } from requireCaptainAccess_(...)
 *     entityType:    'Lineup' | 'MatchGame' | ...
 *     entityId:      match_id, game_id, etc.
 *     actionType:    'create' | 'update' | 'submit' | 'delete'
 *     oldValueJson:  string  (optional)
 *     newValueJson:  string  (optional)
 *     reason:        string  (optional, free text)
 *   })
 */
/**
 * Look up a captain PIN in the Users sheet. Returns a JSON string so it can
 * be called via google.script.run from the client.
 *
 *   { ok: true,  name, userId, allowedTeamIds }
 *   { ok: false, error: '...' }
 *
 * PIN is stored in the `pin` column of the Users sheet. Any format is fine
 * (4–6 digit number is typical). Matching is case-insensitive string compare.
 */
// Email-only auth: verify email exists and return access profile (no PIN required).
function verifyPortalEmail(email) {
  try {
    const r = resolvePortalEmailAccess_(email);
    if (!r.ok) return JSON.stringify({ ok: false, error: r.reason });
    return JSON.stringify({
      ok: true,
      name: r.name,
      email: r.email,
      userId: r.userId,
      isCommissioner: !!r.isCommissioner,
      clubId: r.clubId,
      clubName: r.clubName,
      shortName: r.shortName,
      allowedTeamIds: r.allowedTeamIds
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e.message || e) });
  }
}

// Internal: resolve access from email alone (no PIN check).
function resolvePortalEmailAccess_(email) {
  const r = resolveAccessByEmail_(email);
  if (!r.ok) return { ok: false, reason: r.reason || 'No user registered with that email address' };
  return r;
}

// Used by write handlers: throws unless the caller's email has access to teamId.
function requireEmailAccess_(email, teamId) {
  const cleanTeamId = String(teamId || '').trim();
  const access = resolvePortalEmailAccess_(email);
  if (!access.ok) throw new Error(access.reason);
  if (cleanTeamId && !access.isCommissioner && !access.allowedTeamIds.includes(cleanTeamId)) {
    throw new Error(
      (access.name || 'This user') + ' does not have access to team ' + cleanTeamId +
      '. Allowed: ' + (access.allowedTeamIds.join(', ') || '(none)')
    );
  }
  return access;
}

// Step 1 — check whether an email address exists in the Users sheet.
// Returns { found: true } or { found: false }. Never reveals more.
function checkPortalEmail(email) {
  try {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return JSON.stringify({ found: false });
    const found = getObjects_(SHEETS.USERS).some(u =>
      String(u.email || '').trim().toLowerCase() === cleanEmail &&
      (u.active === undefined || u.active === '' || normalizeBool_(u.active))
    );
    return JSON.stringify({ found });
  } catch (e) {
    return JSON.stringify({ found: false, error: String(e.message || e) });
  }
}

// Step 2 — verify email + PIN and return the user's access profile.
function verifyPortalLogin(email, pin) {
  try {
    const r = resolvePortalAccess_(email, pin);
    if (!r.ok) return JSON.stringify({ ok: false, error: r.reason });
    return JSON.stringify({
      ok: true,
      name: r.name,
      email: r.email,
      userId: r.userId,
      clubId: r.clubId,
      clubName: r.clubName,
      shortName: r.shortName,
      allowedTeamIds: r.allowedTeamIds
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e.message || e) });
  }
}

// Internal: resolve access from email + PIN.
function resolvePortalAccess_(email, pin) {
  const cleanPin = String(pin || '').trim();
  // Find first active row for this email to check PIN (pin is shared across rows for the same user).
  const firstRow = getObjects_(SHEETS.USERS).find(u =>
    String(u.email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase() &&
    (u.active === undefined || u.active === '' || normalizeBool_(u.active))
  );
  if (!firstRow) return { ok: false, reason: 'No user registered with that email address' };
  if (!cleanPin || String(firstRow.pin || '').trim() !== cleanPin) {
    return { ok: false, reason: 'Incorrect PIN' };
  }
  return resolveAccessByEmail_(email);
}

// Used by write handlers: throws unless the caller has access to teamId.
function requirePortalAccess_(email, pin, teamId) {
  const cleanTeamId = String(teamId || '').trim();
  const access = resolvePortalAccess_(email, pin);
  if (!access.ok) throw new Error(access.reason);
  if (cleanTeamId && !access.allowedTeamIds.includes(cleanTeamId)) {
    throw new Error(
      (access.name || 'This user') + ' does not have access to team ' + cleanTeamId +
      '. Allowed: ' + (access.allowedTeamIds.join(', ') || '(none)')
    );
  }
  return access;
}

// Legacy — kept so existing calls continue to work during transition.
function verifyPortalPin(pin) {
  try {
    const access = getPinAccess_(pin);
    if (!access.ok) return JSON.stringify({ ok: false, error: access.reason });
    return JSON.stringify({ ok: true, name: access.name, userId: access.userId, allowedTeamIds: access.allowedTeamIds });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e.message || e) });
  }
}

function getPinAccess_(pin) {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin) return { ok: false, reason: 'No PIN entered' };
  const user = getObjects_(SHEETS.USERS).find(u =>
    String(u.pin || '').trim() === cleanPin &&
    (u.active === undefined || u.active === '' || normalizeBool_(u.active))
  );
  if (!user) return { ok: false, reason: 'PIN not recognised' };
  return resolvePortalAccess_(String(user.email || '').trim(), cleanPin);
}

function requirePinAccess_(pin, teamId) {
  const cleanTeamId = String(teamId || '').trim();
  const access = getPinAccess_(pin);
  if (!access.ok) throw new Error(access.reason || 'Invalid PIN');
  if (!access.isCommissioner && cleanTeamId && !access.allowedTeamIds.includes(cleanTeamId)) {
    throw new Error(
      (access.name || 'This user') + ' does not have access to team ' + cleanTeamId +
      '. Allowed: ' + (access.allowedTeamIds.join(', ') || '(none)')
    );
  }
  return access;
}

function appendAuditLog_(entry) {
  if (!entry || typeof entry !== 'object') return;
  const ss = getBackendSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!sh) return;  // sheet not provisioned; silently skip rather than break the write

  const access = entry.access || {};
  const reasonParts = [];
  if (access.email) reasonParts.push('by ' + access.email);
  if (access.name)  reasonParts.push('(' + access.name + ')');
  if (entry.reason) reasonParts.push(String(entry.reason));

  const row = [
    Utilities.getUuid(),                           // audit_id
    String(entry.entityType || ''),                // entity_type
    String(entry.entityId   || ''),                // entity_id
    String(entry.actionType || ''),                // action_type
    String(entry.oldValueJson || ''),              // old_value_json
    String(entry.newValueJson || ''),              // new_value_json
    String(access.userId || access.email || ''),   // changed_by_user_id (fallback to email)
    new Date(),                                    // changed_at
    reasonParts.join(' ')                          // reason
  ];
  try { sh.appendRow(row); } catch (e) { console.error('appendAuditLog_:', e); }
}
