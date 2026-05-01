const LEAGUE_LOGO_FILE_ID = '1PA1pVhADGrUO4aIn1pz6srSwI50r41EZ';

function lineupPingUniqueV1() {
  return {
    ok: true,
    source: 'lineupPingUniqueV1',
    timestamp: new Date().toISOString()
  };
}

// Sunday of the current week in America/New_York, as yyyy-MM-dd. Matches
// before this date are hidden from captain dropdowns so captains aren't
// scrolling past the entire season's history.
function captainWeekStartIso_() {
  const tz = Session.getScriptTimeZone() || 'America/New_York';
  const now = new Date();
  // 'u' = ISO day of week, 1=Mon..7=Sun. (sun%7)=0, mon=1..sat=6 — days since Sunday.
  const daysSinceSunday = Number(Utilities.formatDate(now, tz, 'u')) % 7;
  const start = new Date(now.getTime() - daysSinceSunday * 24 * 60 * 60 * 1000);
  return Utilities.formatDate(start, tz, 'yyyy-MM-dd');
}

function captainMatchDateIso_(v) {
  if (!v) return '';
  const tz = Session.getScriptTimeZone() || 'America/New_York';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const [mo, da, yr] = s.split('/');
    const y = yr.length === 2 ? '20' + yr : yr;
    return y + '-' + mo.padStart(2, '0') + '-' + da.padStart(2, '0');
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return '';
}

function filterAndSortCaptainMatches_(rawMatches) {
  const cutoff = captainWeekStartIso_();
  return (rawMatches || [])
    .map(m => {
      m.__iso_match_date = captainMatchDateIso_(m.match_date);
      return m;
    })
    .filter(m => m.__iso_match_date && m.__iso_match_date >= cutoff)
    .sort((a, b) =>
      String(a.__iso_match_date || '').localeCompare(String(b.__iso_match_date || '')) ||
      String(a.start_time || '').localeCompare(String(b.start_time || ''))
    );
}

function getCaptainSelectorData() {
  const divisions = getObjects_(SHEETS.DIVISIONS);
  const teams = getObjects_(SHEETS.TEAMS);
  const matches = filterAndSortCaptainMatches_(getObjects_(SHEETS.MATCHES));

  const divisionMap = {};
  divisions.forEach(d => {
    divisionMap[String(d.division_id || '').trim()] = {
      division_id: String(d.division_id || '').trim(),
      division_name: String(d.division_name || d.division_id || '').trim(),
      division_number: d.division_number || d.division_order || ''
    };
  });

  return {
    availableDivisions: matches
      .map(m => divisionMap[String(m.division_id || '').trim()])
      .filter(Boolean)
      .filter((d, i, arr) => arr.findIndex(x => x.division_id === d.division_id) === i)
      .sort((a, b) => Number(a.division_number || 0) - Number(b.division_number || 0)),
    matches: matches.map(m => {
      const homeId = String(m.home_team_id || '').trim();
      const awayId = String(m.away_team_id || '').trim();
      const homeTeam = teams.find(t => String(t.team_id || '').trim() === homeId);
      const awayTeam = teams.find(t => String(t.team_id || '').trim() === awayId);

      return {
        match_id: String(m.match_id || '').trim(),
        division_id: String(m.division_id || '').trim(),
        match_date: String(m.match_date || '').trim(),
        venue: String(m.venue || m.location || m.match_location || '').trim(),
        home_team_id: homeId,
        away_team_id: awayId,
        home_team_name: stripDivisionSuffix_(String((homeTeam && (homeTeam.team_name || homeTeam.name)) || homeId)),
        away_team_name: stripDivisionSuffix_(String((awayTeam && (awayTeam.team_name || awayTeam.name)) || awayId))
      };
    })
  };
}

function resolveDefaultCaptainRoute_(selectorData, userEmail) {
  const matches = (selectorData && Array.isArray(selectorData.matches))
    ? selectorData.matches
    : [];
  if (!matches.length) {
    return { ok: false, matchId: '', teamId: '', reason: 'No matches available' };
  }

  const fallbackMatch = matches[0];
  const fallback = {
    matchId: String(fallbackMatch.match_id || '').trim(),
    teamId: String(fallbackMatch.home_team_id || '').trim()
  };

  const cleanEmail = String(userEmail || '').trim().toLowerCase();
  if (!cleanEmail) {
    return {
      ok: true,
      matchId: fallback.matchId,
      teamId: fallback.teamId,
      reason: 'No user email supplied; using fallback'
    };
  }

  const users = getObjects_(SHEETS.USERS);
  const accessRows = getObjects_(SHEETS.USER_ACCESS);
  const teams = getObjects_(SHEETS.TEAMS);

  const user = users.find(u =>
    String(u.email || '').trim().toLowerCase() === cleanEmail &&
    normalizeBool_(u.active)
  );
  if (!user) {
    return {
      ok: false,
      matchId: '',
      teamId: '',
      reason: 'Email not found in active USERS list'
    };
  }

  const userAccess = accessRows.filter(a =>
    String(a.user_id || '').trim() === String(user.user_id || '').trim() &&
    normalizeBool_(a.active)
  );
  if (!userAccess.length) {
    return {
      ok: false,
      matchId: '',
      teamId: '',
      reason: 'No active USER_ACCESS rows for this user'
    };
  }

  const allowedTeamIds = new Set();
  let preferredCaptainTeamId = '';
  let isCommissioner = false;

  userAccess.forEach(a => {
    const role = String(a.role_type || '').trim().toLowerCase();
    if (role === ROLE.COMMISSIONER) {
      isCommissioner = true;
    } else if (role === ROLE.DIRECTOR) {
      const clubId = String(a.club_id || '').trim();
      if (!clubId) return;
      teams.forEach(t => {
        if (String(t.club_id || '').trim() === clubId) {
          const teamId = String(t.team_id || '').trim();
          if (teamId) allowedTeamIds.add(teamId);
        }
      });
    } else if (role === ROLE.CAPTAIN) {
      const teamId = String(a.team_id || '').trim();
      if (teamId) {
        if (!preferredCaptainTeamId) preferredCaptainTeamId = teamId;
        allowedTeamIds.add(teamId);
        return;
      }

      // Backward-compatible captain access: if team_id is blank but club_id exists,
      // treat it as club-scoped captain access.
      const clubId = String(a.club_id || '').trim();
      if (!clubId) return;
      teams.forEach(t => {
        if (String(t.club_id || '').trim() === clubId) {
          const clubTeamId = String(t.team_id || '').trim();
          if (clubTeamId) allowedTeamIds.add(clubTeamId);
        }
      });
    }
  });

  if (isCommissioner) {
    return {
      ok: true,
      matchId: fallback.matchId,
      teamId: fallback.teamId,
      reason: 'Commissioner access; using first match'
    };
  }

  if (preferredCaptainTeamId) {
    const captainMatch = matches.find(m =>
      String(m.home_team_id || '').trim() === preferredCaptainTeamId ||
      String(m.away_team_id || '').trim() === preferredCaptainTeamId
    );
    if (captainMatch) {
      return {
        ok: true,
        matchId: String(captainMatch.match_id || '').trim(),
        teamId: preferredCaptainTeamId
      };
    }
  }

  const accessibleMatch = matches.find(m =>
    allowedTeamIds.has(String(m.home_team_id || '').trim()) ||
    allowedTeamIds.has(String(m.away_team_id || '').trim())
  );
  if (accessibleMatch) {
    const homeId = String(accessibleMatch.home_team_id || '').trim();
    const awayId = String(accessibleMatch.away_team_id || '').trim();
    const teamId = allowedTeamIds.has(homeId) ? homeId : awayId;
    return {
      ok: true,
      matchId: String(accessibleMatch.match_id || '').trim(),
      teamId: teamId || homeId || awayId
    };
  }

  return {
    ok: false,
    matchId: '',
    teamId: '',
    reason: 'User has access rows but no matching team for available matches'
  };
}

function resolveCaptainRouteByEmailV1(email) {
  const selectorData = getCaptainSelectorData();
  const resolved = resolveDefaultCaptainRoute_(selectorData, email);
  return {
    ok: !!resolved.ok,
    email: String(email || '').trim().toLowerCase(),
    matchId: String(resolved.matchId || '').trim(),
    teamId: String(resolved.teamId || '').trim(),
    reason: String(resolved.reason || '').trim()
  };
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const page = String(params.page || 'players').trim().toLowerCase();

  if (page === 'player') {
    const t = HtmlService.createTemplateFromFile('PlayerPage');
    t.initialPlayerId   = String(params.playerId   || '').trim();
    t.initialPlayerName = String(params.playerName || '').trim();
    const playerOut = t.evaluate();
    playerOut.setTitle('CTPBL Player Stats');
    playerOut.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return playerOut;
  }

  if (page === 'seasonstats') {
    const t = HtmlService.createTemplateFromFile('SeasonStats');
    t.initialPlayerId = String(params.playerId || '').trim();
    // Pre-select division when coming from the Matches page "View details"
    // link. The query string here is reachable via params; the iframe's own
    // window.location.search is rewritten by Google's googleusercontent
    // redirect, so reading it client-side doesn't work — inject instead.
    t.initialDivision = String(params.division || '').trim();
    t.initialDisplay  = String(params.display  || '').trim();
    // Inject the real exec URL so client-side JS can open other pages correctly.
    t.webAppUrl = ScriptApp.getService().getUrl();
    return t.evaluate()
      .setTitle('CTPBL Player Stats')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'scorecard') {
    return HtmlService.createTemplateFromFile('Scorecard')
      .evaluate()
      .setTitle('CPBL Score Entry')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'players') {
    return HtmlService.createHtmlOutputFromFile('PlayersDirectory')
      .setTitle('Connecticut Pickleball League Players')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'gamereport') {
    const tGr = HtmlService.createTemplateFromFile('GameReport');
    tGr.initialMatchId = String(params.matchId || '').trim();
    return tGr.evaluate()
      .setTitle('CPL Game Report')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'request') {
    return HtmlService.createHtmlOutputFromFile('RequestForm')
      .setTitle('CPBL Feedback')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'requestadmin') {
    return HtmlService.createHtmlOutputFromFile('RequestAdmin')
      .setTitle('CPBL Request Manager')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'publicdata') {
    return ContentService
      .createTextOutput(JSON.stringify(getPublicSiteData_()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'auth') {
    const email = String(params.email || '').trim();
    const pin   = String(params.pin   || '').trim();
    return ContentService
      .createTextOutput(verifyPortalLogin(email, pin))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'scoreboard') {
    const tSb = HtmlService.createTemplateFromFile('PublicScoreboard');
    tSb.initialMatchId = String(params.matchId || '').trim();
    return tSb.evaluate()
      .setTitle('CPL Live Scoreboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'display') {
    const tDp = HtmlService.createTemplateFromFile('MatchDisplay');
    tDp.initialMatchId = String(params.matchId || '').trim();
    return tDp.evaluate()
      .setTitle('CPL Match Display')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const matchId = String(params.matchId || '').trim();
  const teamId = String(params.teamId || '').trim();

  const t = HtmlService.createTemplateFromFile('Captain');

  let initialData = null;
  let bootstrapError = '';
  let selectorData = null;

  try {
    selectorData = getCaptainSelectorData();
    if (matchId) {
      initialData = getCaptainPortalData(matchId, teamId);
    }
  } catch (err) {
    bootstrapError = err && err.message ? err.message : String(err);
  }

  t.initialData = initialData ? JSON.stringify(initialData) : 'null';
  t.selectorData = selectorData ? JSON.stringify(selectorData) : '{"availableDivisions":[],"matches":[]}';
  t.requestedMatchId = matchId;
  t.requestedTeamId = teamId;
  t.bootstrapError = bootstrapError;
  // Token + email from the wrapper shell's Google Sign-In (workers.dev origin),
  // forwarded via query string so the iframe's writes can authenticate without
  // running GSI itself (which can't validate against a googleusercontent origin).
  t.injectedIdToken = String(params.idToken  || '').trim();
  t.injectedEmail   = String(params.userEmail || '').trim();

  return t.evaluate()
    .setTitle('Captain Portal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function driveImageUrl_(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return '';
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
}

function getCaptainPortalDataV3(matchId, teamId) {
  return JSON.stringify(getCaptainPortalData(matchId, teamId));
}

function getSubmissionAuditForMatchTeam_(matchId, teamId) {
  const cleanMatchId = String(matchId || '').trim();
  const cleanTeamId = String(teamId || '').trim();

  const usersById = {};
  getObjects_(SHEETS.USERS).forEach(u => {
    const id = String(u.user_id || '').trim();
    if (!id) return;
    usersById[id] = u;
  });

  const submissions = getObjects_(SHEETS.MATCH_SUBMISSIONS)
    .filter(s =>
      String(s.match_id || '').trim() === cleanMatchId &&
      String(s.team_id || '').trim() === cleanTeamId &&
      String(s.submission_type || 'lineup').trim().toLowerCase() === 'lineup'
    )
    .sort((a, b) => String(a.submitted_at || '').localeCompare(String(b.submitted_at || '')));

  const decorated = submissions.map(s => {
    const who = usersById[String(s.submitted_by_user_id || '').trim()] || null;
    const displayName =
      (who && (who.full_name || who.email)) ||
      String(s.submitted_by_user_id || '').trim() ||
      String(s.submitted_by_email || '').trim() ||
      'Public User';

    return {
      submission_id: String(s.submission_id || '').trim(),
      submission_status: String(s.submission_status || '').trim(),
      submitted_at: s.submitted_at || '',
      submitted_by: displayName,
      submitted_by_user_id: String(s.submitted_by_user_id || '').trim()
    };
  });

  const submitted = [...decorated]
    .filter(s => String(s.submission_status || '').trim().toLowerCase() === String(SUBMISSION_STATUS.SUBMITTED || '').toLowerCase())
    .slice(-1)[0] || null;

  const lastEdited = decorated.slice(-1)[0] || null;

  return { lastEdited, submitted };
}

function getCaptainPortalData(matchId, teamId) {
  const cleanMatchId = String(matchId || '').trim();
  const requestedTeamId = String(teamId || '').trim();

  const teams = getObjects_(SHEETS.TEAMS);
  const divisions = getObjects_(SHEETS.DIVISIONS);
  const clubs = getObjects_(SHEETS.CLUBS);
  const allMatches = getObjects_(SHEETS.MATCHES);

  const matches = filterAndSortCaptainMatches_(allMatches.slice());

  let currentMatchId = cleanMatchId;
  let currentMatch = currentMatchId
    ? matches.find(m => String(m.match_id || '').trim() === currentMatchId) || null
    : null;
  if (!currentMatch && matches.length) {
    currentMatch = matches[0];
    currentMatchId = String(currentMatch.match_id || '').trim();
  }

  const availableDivisions = matches
    .map(m => divisions.find(d => String(d.division_id || '').trim() === String(m.division_id || '').trim()))
    .filter(Boolean)
    .filter((d, i, arr) =>
      arr.findIndex(x => String(x.division_id || '').trim() === String(d.division_id || '').trim()) === i
    )
    .sort((a, b) =>
      Number(a.division_order || a.division_number || 0) -
      Number(b.division_order || b.division_number || 0)
    )
    .map(d => ({
      division_id: d.division_id,
      division_name: d.division_name || d.division_id,
      division_number: d.division_number || d.division_order || ''
    }));

  if (!currentMatch) {
    return {
      user: { email: '', full_name: 'Public User' },
      clubs: [],
      teams: teams.map(t => String(t.team_id || '').trim()),
      matches,
      currentMatch: null,
      myTeamId: '',
      mySide: '',
      games: [],
      roster: [],
      activeState: {},
      teamName: '',
      divisionName: '',
      availableDivisions,
      submissionAudit: null,
      brand: {
        leagueTitle: 'Connecticut Pickleball League',
        subtitle: 'Official Match Lineup Portal',
        leagueLogoUrl: driveImageUrl_(LEAGUE_LOGO_FILE_ID),
        teamLogoUrl: ''
      }
    };
  }

  const homeTeam = teams.find(t => String(t.team_id || '').trim() === String(currentMatch.home_team_id || '').trim()) || null;
  const awayTeam = teams.find(t => String(t.team_id || '').trim() === String(currentMatch.away_team_id || '').trim()) || null;

  let myTeam = null;
  if (requestedTeamId) {
    myTeam =
      (homeTeam && String(homeTeam.team_id || '').trim() === requestedTeamId) ? homeTeam :
      (awayTeam && String(awayTeam.team_id || '').trim() === requestedTeamId) ? awayTeam :
      null;
  } else {
    myTeam = homeTeam || awayTeam || null;
  }

  if (!myTeam) {
    throw new Error('Invalid or missing teamId for this match');
  }

  const myTeamId = String(myTeam.team_id || '').trim();
  const mySide = myTeamId === String(currentMatch.home_team_id || '').trim() ? 'home' : 'away';

  ensureRoundsAndGamesForMatch_(currentMatchId);

  const division = divisions.find(d => String(d.division_id || '').trim() === String(currentMatch.division_id || '').trim());
  const teamName = myTeam.team_name || myTeamId;
  const clubId = String(myTeam.club_id || '').trim();
  const myClub = clubs.find(c => String(c.club_id || '').trim() === clubId);

  const teamLogoId = myClub
    ? (myClub.logo_id || myClub.logo_file_id || myClub.logo_url || '')
    : '';

  const userDisplayMap = getUserDisplayMap_();

  const games = getObjects_(SHEETS.MATCH_GAMES)
    .filter(g => String(g.match_id || '').trim() === currentMatchId)
    .map(g => {
      const row = { ...g };

      row.home_updated_by_name =
        userDisplayMap[String(row.home_updated_by || '').trim().toLowerCase()] ||
        userDisplayMap[String(row.updated_by_user_id || '').trim()] ||
        String(row.home_updated_by || '').trim() ||
        '';

      row.away_updated_by_name =
        userDisplayMap[String(row.away_updated_by || '').trim().toLowerCase()] ||
        userDisplayMap[String(row.updated_by_user_id || '').trim()] ||
        String(row.away_updated_by || '').trim() ||
        '';

      row.home_submitted_by_name =
        userDisplayMap[String(row.home_submitted_by || '').trim().toLowerCase()] ||
        String(row.home_submitted_by || '').trim() ||
        '';

      row.away_submitted_by_name =
        userDisplayMap[String(row.away_submitted_by || '').trim().toLowerCase()] ||
        String(row.away_submitted_by || '').trim() ||
        '';

      row.updated_by_name =
        userDisplayMap[String(row.updated_by_user_id || '').trim()] ||
        userDisplayMap[String(row.updated_by || '').trim().toLowerCase()] ||
        String(row.updated_by || '').trim() ||
        '';

      return row;
    })
    .sort((a, b) =>
      Number(a.round_number || 0) - Number(b.round_number || 0) ||
      Number(a.game_number_in_round || 0) - Number(b.game_number_in_round || 0)
    );

  return {
    user: { email: '', full_name: 'Public User' },
    clubs: clubId ? [clubId] : [],
    teams: [myTeamId],
    matches,
    currentMatch,
    myTeamId,
    mySide,
    games,
    roster: getEligibleRosterForMatch_(currentMatchId, myTeamId),
    activeState: getMatchPlayerActiveMap_(currentMatchId),
    teamName,
    divisionName: division ? division.division_name : currentMatch.division_id,
    availableDivisions,
    submissionAudit: getSubmissionAuditForMatchTeam_(currentMatchId, myTeamId),
    brand: {
      leagueTitle: 'Connecticut Pickleball League',
      subtitle: 'Official Match Lineup Portal',
      leagueLogoUrl: driveImageUrl_(LEAGUE_LOGO_FILE_ID),
      teamLogoUrl: driveImageUrl_(teamLogoId)
    }
  };
}

function saveCaptainLineupDraft(email, pin, matchId, teamId, assignments) {
  const cleanMatchId = String(matchId || '').trim();
  const cleanTeamId = String(teamId || '').trim();
  if (!cleanMatchId) throw new Error('Missing matchId');
  if (!cleanTeamId) throw new Error('Missing teamId');
  const access = requirePortalAccess_(email, pin, cleanTeamId);

  const normalizedAssignments = normalizeAssignments_(
    assignments,
    getObjects_(SHEETS.MATCH_GAMES).filter(g => String(g.match_id || '').trim() === cleanMatchId)
  );

  saveTeamLineup_(cleanMatchId, cleanTeamId, normalizedAssignments, false, access);
  appendAuditLog_({
    access,
    entityType: 'Lineup',
    entityId:   cleanMatchId + ':' + cleanTeamId,
    actionType: 'draft',
    newValueJson: JSON.stringify(normalizedAssignments).slice(0, 50000)
  });

  const games = getObjects_(SHEETS.MATCH_GAMES)
    .filter(g => String(g.match_id || '').trim() === cleanMatchId)
    .sort((a, b) =>
      Number(a.round_number || 0) - Number(b.round_number || 0) ||
      Number(a.game_number_in_round || 0) - Number(b.game_number_in_round || 0)
    );

  return {
    ok: true,
    message: 'Draft saved',
    games: games
  };
}

function submitCaptainLineup(email, pin, matchId, teamId, assignments) {
  const cleanMatchId = String(matchId || '').trim();
  const cleanTeamId = String(teamId || '').trim();
  if (!cleanMatchId) throw new Error('Missing matchId');
  if (!cleanTeamId) throw new Error('Missing teamId');
  const access = requirePortalAccess_(email, pin, cleanTeamId);

  const match = getObjects_(SHEETS.MATCHES).find(m =>
    String(m.match_id || '').trim() === cleanMatchId
  );
  if (!match) throw new Error('Match not found');

  const homeId = String(match.home_team_id || '').trim();
  const awayId = String(match.away_team_id || '').trim();
  if (cleanTeamId !== homeId && cleanTeamId !== awayId) {
    throw new Error('teamId is not part of this match');
  }

  saveTeamLineup_(cleanMatchId, cleanTeamId, assignments || [], true, access);
  revealLineupsIfReady_(cleanMatchId);
  appendAuditLog_({
    access,
    entityType: 'Lineup',
    entityId:   cleanMatchId + ':' + cleanTeamId,
    actionType: 'submit',
    newValueJson: JSON.stringify(assignments || []).slice(0, 50000)
  });

  return {
    ok: true,
    message: 'Official lineup submitted'
  };
}

function revealLineupsIfReady_(matchId) {
  const matches = getObjects_(SHEETS.MATCHES);
  const submissions = getObjects_(SHEETS.MATCH_SUBMISSIONS);

  const match = matches.find(m =>
    String(m.match_id || '').trim() === String(matchId || '').trim()
  );
  if (!match) return;

  const homeSub = submissions.find(s =>
    String(s.match_id || '').trim() === String(matchId || '').trim() &&
    String(s.team_id || '').trim() === String(match.home_team_id || '').trim() &&
    String(s.submission_type || '').trim() === 'lineup' &&
    String(s.submission_status || '').trim() === SUBMISSION_STATUS.SUBMITTED
  );

  const awaySub = submissions.find(s =>
    String(s.match_id || '').trim() === String(matchId || '').trim() &&
    String(s.team_id || '').trim() === String(match.away_team_id || '').trim() &&
    String(s.submission_type || '').trim() === 'lineup' &&
    String(s.submission_status || '').trim() === SUBMISSION_STATUS.SUBMITTED
  );

  if (homeSub && awaySub) {
    submissions.forEach(s => {
      if (
        String(s.match_id || '').trim() === String(matchId || '').trim() &&
        String(s.submission_type || '').trim() === 'lineup'
      ) {
        s.is_visible_to_opponent = true;
      }
    });

    match.home_submission_status = SUBMISSION_STATUS.SUBMITTED;
    match.away_submission_status = SUBMISSION_STATUS.SUBMITTED;
    match.public_visibility_status = 'partial';

    overwriteObjects_(SHEETS.MATCH_SUBMISSIONS, submissions);
    overwriteObjects_(SHEETS.MATCHES, matches);
  }
}

function getPublicDashboardData() {
  return {
    standings: getObjects_(SHEETS.STANDINGS_SUMMARY),
    matches: getObjects_(SHEETS.MATCHES),
    rounds: getObjects_(SHEETS.MATCH_ROUNDS),
    games: getObjects_(SHEETS.MATCH_GAMES)
  };
}

/**
 * Bundle of read-only data for the ctpbleague.com public hub.
 * Cached in CacheService for 60s to cut sheet reads under load.
 */
function getPublicSiteData_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('publicSiteData_v4');
  if (cached) return JSON.parse(cached);

  const str = (v) => String(v == null ? '' : v).trim();
  const num = (v) => (v === '' || v == null || isNaN(Number(v))) ? 0 : Number(v);

  const divisions = getObjects_(SHEETS.DIVISIONS).map(d => ({
    division_id:     str(d.division_id),
    division_name:   str(d.division_name || d.division_id),
    division_order:  num(d.division_order),
    active:          normalizeBool_(d.active)
  })).filter(d => d.active !== false);

  // Resolve a club logo from any of the columns the Clubs sheet may use:
  // logo_url (full URL or Drive ID), logo_id, logo_file_id, image_file_id.
  const resolveClubLogo = (c) => {
    const raw = str(c.logo_url) || str(c.logo_id) || str(c.logo_file_id) || str(c.image_file_id);
    if (!raw) return '';
    return raw.startsWith('http') ? raw : driveImageUrl_(raw);
  };

  const clubs = getObjects_(SHEETS.CLUBS).map(c => ({
    club_id:    str(c.club_id),
    club_name:  str(c.club_name),
    short_name: str(c.short_name),
    logo_url:   resolveClubLogo(c)
  }));

  const teams = getObjects_(SHEETS.TEAMS).map(t => ({
    team_id:     str(t.team_id),
    team_name:   stripDivisionSuffix_(str(t.team_name)),
    club_id:     str(t.club_id),
    division_id: str(t.division_id)
  }));

  // Normalize start_time to a "h:mm AM/PM" string. Sheets return a time-only
  // cell as a Date anchored to 1899-12-30, so extracting hours/minutes gives
  // the actual time.
  const toClockTime = (v) => {
    if (!v) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      let h  = v.getHours();
      const min = v.getMinutes();
      if (h === 0 && min === 0) return '';
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return min === 0 ? `${h} ${ap}` : `${h}:${String(min).padStart(2,'0')} ${ap}`;
    }
    return String(v).trim();
  };

  // Normalize match_date to ISO yyyy-mm-dd (sheet may return native Date or
  // various string formats — clients should not have to guess).
  const toIsoDate = (v) => {
    if (!v) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      return Utilities.formatDate(v, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
      const [mo, da, yr] = s.split('/');
      const y = yr.length === 2 ? '20' + yr : yr;
      return y + '-' + mo.padStart(2, '0') + '-' + da.padStart(2, '0');
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
    }
    return s;
  };

  // Derive per-match game tallies from Match_Games (sheet's home_games_won is
  // often empty). Counts the number of games each team won within each match.
  const gameRows = getObjects_(SHEETS.MATCH_GAMES);
  const matchTallies = {};
  gameRows.forEach(g => {
    const mid = str(g.match_id);
    if (!mid) return;
    if (!matchTallies[mid]) matchTallies[mid] = { home: 0, away: 0 };
    const winner = str(g.winner_team_id);
    const home   = str(g.home_team_id);
    if (!winner) return;
    if (winner === home) matchTallies[mid].home += 1;
    else                 matchTallies[mid].away += 1;
  });

  const matches = getObjects_(SHEETS.MATCHES).map(m => {
    const matchId = str(m.match_id);
    const homeId  = str(m.home_team_id);
    const awayId  = str(m.away_team_id);
    const tally   = matchTallies[matchId];

    // Prefer Matches sheet values when present, fall back to derived tallies
    let hgw = num(m.home_games_won);
    let agw = num(m.away_games_won);
    let winId = str(m.winning_team_id);
    if (tally && hgw + agw === 0) { hgw = tally.home; agw = tally.away; }
    if (!winId && (hgw || agw)) {
      if (hgw > agw) winId = homeId;
      else if (agw > hgw) winId = awayId;
    }

    return {
      match_id:         matchId,
      season_id:        str(m.season_id),
      division_id:      str(m.division_id),
      home_team_id:     homeId,
      away_team_id:     awayId,
      match_date:       toIsoDate(m.match_date),
      start_time:       toClockTime(m.start_time),
      venue:            str(m.venue),
      status:           str(m.status).toLowerCase(),
      home_rounds_won:  num(m.home_rounds_won),
      away_rounds_won:  num(m.away_rounds_won),
      home_games_won:   hgw,
      away_games_won:   agw,
      winning_team_id:  winId
    };
  });

  const standings = getObjects_(SHEETS.STANDINGS_SUMMARY).map(s => ({
    season_id:       str(s.season_id),
    division_id:     str(s.division_id),
    team_id:         str(s.team_id),
    matches_played:  num(s.matches_played),
    match_wins:      num(s.match_wins),
    match_losses:    num(s.match_losses),
    rounds_won:      num(s.rounds_won),
    rounds_lost:     num(s.rounds_lost),
    games_won:       num(s.games_won),
    games_lost:      num(s.games_lost),
    points_for:      num(s.points_for),
    points_against:  num(s.points_against),
    point_diff:      num(s.point_diff),
    standings_rank:  num(s.standings_rank)
  }));

  const seasons = getObjects_(SHEETS.SEASONS).map(s => ({
    season_id:   str(s.season_id),
    season_name: str(s.season_name),
    start_date:  str(s.start_date),
    end_date:    str(s.end_date),
    status:      str(s.status).toLowerCase()
  }));

  const currentSeason =
    seasons.find(s => s.status === 'active') ||
    seasons.find(s => s.status === 'open') ||
    seasons[seasons.length - 1] ||
    null;

  const payload = {
    generatedAt:   new Date().toISOString(),
    currentSeason: currentSeason || null,
    seasons,
    divisions,
    clubs,
    teams,
    matches,
    standings
  };

  cache.put('publicSiteData_v4', JSON.stringify(payload), 60);
  return payload;
}

function getUserDisplayMap_() {
  const users = getObjects_(SHEETS.USERS);
  const map = {};

  users.forEach(u => {
    const userId = String(u.user_id || '').trim();
    const email = String(u.email || '').trim().toLowerCase();
    const name =
      String(u.display_name || '').trim() ||
      String(u.full_name || '').trim() ||
      String(u.name || '').trim() ||
      email;

    if (userId) map[userId] = name;
    if (email) map[email] = name;
  });

  return map;
}
