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
    normalizeBool_(u.active)
  );
  if (!user) {
    return { ok: false, email: cleanEmail, userId: '', name: '',
             isCommissioner: false, allowedTeamIds: [], allowedClubIds: [],
             reason: 'Email not found in active Users list' };
  }

  const userId = String(user.user_id || '').trim();
  const accessRows = getObjects_(SHEETS.USER_ACCESS).filter(a =>
    String(a.user_id || '').trim() === userId &&
    normalizeBool_(a.active)
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
