/**
 * Auth helpers — Google Identity Services (client-side sign-in) + server-side
 * verification of the resulting ID token.
 *
 * The web app deployment is "Execute as: Me / Anyone, even anonymous". The
 * captain identifies themselves by clicking the Google Sign-In button on
 * Captain.html or Scorecard.html — Google issues a signed JWT (the ID token)
 * and the page passes it to the backend with every write call. The backend
 * verifies the token via the public tokeninfo endpoint, extracts the email,
 * looks the user up in the Users + User_Access sheets, and authorizes.
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
 * Returns the captain access summary for a given email.
 *
 *   { ok, email, userId, name, isCommissioner, allowedTeamIds, allowedClubIds, reason }
 *
 * Director access expands automatically to all teams in the director's club(s).
 */
function getCaptainAccessForEmail_(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { ok: false, email: '', userId: '', name: '',
             isCommissioner: false, allowedTeamIds: [], allowedClubIds: [],
             reason: 'No email supplied' };
  }

  const users = getObjects_(SHEETS.USERS);
  const user = users.find(u =>
    String(u.email || '').trim().toLowerCase() === cleanEmail &&
    (u.active === undefined || u.active === '' || normalizeBool_(u.active))
  );
  if (!user) {
    return { ok: false, email: cleanEmail, userId: '', name: '',
             isCommissioner: false, allowedTeamIds: [], allowedClubIds: [],
             reason: 'Email not found in active Users list' };
  }

  const userId = String(user.user_id || '').trim();
  const accessRows = getObjects_(SHEETS.USER_ACCESS).filter(a =>
    String(a.user_id || '').trim() === userId &&
    (a.active === undefined || a.active === '' || normalizeBool_(a.active))
  );

  let isCommissioner = false;
  const allowedTeamIds = new Set();
  const allowedClubIds = new Set();
  accessRows.forEach(a => {
    const role = String(a.role_type || '').trim().toLowerCase();
    if (role === ROLE.COMMISSIONER) {
      isCommissioner = true;
    } else if (role === ROLE.DIRECTOR) {
      const clubId = String(a.club_id || '').trim();
      if (clubId) allowedClubIds.add(clubId);
    } else if (role === ROLE.CAPTAIN) {
      const teamId = String(a.team_id || '').trim();
      if (teamId) allowedTeamIds.add(teamId);
      // Backward-compatible: captain rows with club_id but no team_id grant
      // access to all teams in that club.
      const clubId = String(a.club_id || '').trim();
      if (!teamId && clubId) allowedClubIds.add(clubId);
    }
  });

  if (allowedClubIds.size) {
    const teams = getObjects_(SHEETS.TEAMS);
    teams.forEach(t => {
      const clubId = String(t.club_id || '').trim();
      const teamId = String(t.team_id || '').trim();
      if (allowedClubIds.has(clubId) && teamId) allowedTeamIds.add(teamId);
    });
  }

  const ok = isCommissioner || allowedTeamIds.size > 0;
  return {
    ok,
    email: cleanEmail,
    userId,
    name: String(user.name || '').trim(),
    isCommissioner,
    allowedTeamIds: Array.from(allowedTeamIds),
    allowedClubIds: Array.from(allowedClubIds),
    reason: ok ? '' : 'No active captain/director/commissioner roles for this user'
  };
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
                    '. Ask the league commissioner to add you to the Users + User_Access sheets.');
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
// Chain: Users → User_Access → club_id → Clubs → Teams
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

// Internal: resolve access from email + PIN.  Follows the exact chain:
//   Users → User_Access → club_id → Clubs → Teams
function resolvePortalAccess_(email, pin) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPin   = String(pin   || '').trim();

  // 1. Find user by email.
  const user = getObjects_(SHEETS.USERS).find(u =>
    String(u.email || '').trim().toLowerCase() === cleanEmail &&
    (u.active === undefined || u.active === '' || normalizeBool_(u.active))
  );
  if (!user) return { ok: false, reason: 'No user registered with that email address' };

  // 2. Verify PIN.
  if (!cleanPin || String(user.pin || '').trim() !== cleanPin) {
    return { ok: false, reason: 'Incorrect PIN' };
  }

  const userId = String(user.user_id || '').trim();
  const name   = String(user.full_name || user.name || '').trim();

  // 3. Find User_Access rows for this user.
  const accessRows = getObjects_(SHEETS.USER_ACCESS).filter(a =>
    String(a.user_id || '').trim() === userId &&
    (a.active === undefined || a.active === '' || normalizeBool_(a.active))
  );
  if (!accessRows.length) return { ok: false, reason: 'No access configured for this user. Contact the commissioner.' };

  // 4. Collect all club IDs from access rows.
  const clubIds = [...new Set(
    accessRows.map(a => String(a.club_id || '').trim()).filter(Boolean)
  )];
  if (!clubIds.length) return { ok: false, reason: 'No club assigned to this user in User_Access. Contact the commissioner.' };

  // Use first club for name display (most users have one).
  const primaryClubId = clubIds[0];
  const allClubs = getObjects_(SHEETS.CLUBS);
  const primaryClub = allClubs.find(c => String(c.club_id || '').trim() === primaryClubId) || null;
  const clubName  = primaryClub ? String(primaryClub.club_name  || '').trim() : '';
  const shortName = primaryClub ? String(primaryClub.short_name || '').trim() : '';

  // 5. Find all teams in any of the user's clubs.
  const allTeams = getObjects_(SHEETS.TEAMS);
  const allowedTeamIds = allTeams
    .filter(t => clubIds.includes(String(t.club_id || '').trim()))
    .map(t => String(t.team_id || '').trim())
    .filter(Boolean);

  return { ok: true, userId, name, email: cleanEmail, clubId: primaryClubId, clubName, shortName, allowedTeamIds };
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
