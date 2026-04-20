const LEAGUE_LOGO_FILE_ID = '1PA1pVhADGrUO4aIn1pz6srSwI50r41EZ';

function lineupPingUniqueV1() {
  return {
    ok: true,
    source: 'lineupPingUniqueV1',
    timestamp: new Date().toISOString()
  };
}

function getCaptainSelectorData() {
  const divisions = getObjects_(SHEETS.DIVISIONS);
  const teams = getObjects_(SHEETS.TEAMS);
  const matches = getObjects_(SHEETS.MATCHES);

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
        home_team_name: String((homeTeam && (homeTeam.team_name || homeTeam.name)) || homeId).trim(),
        away_team_name: String((awayTeam && (awayTeam.team_name || awayTeam.name)) || awayId).trim()
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
  const page = String(params.page || 'scoreboard').trim().toLowerCase();

  if (page === 'scorecard') {
    return HtmlService.createTemplateFromFile('Scorecard')
      .evaluate()
      .setTitle('CPBL Score Entry');
  }

  if (page === 'players') {
    return HtmlService.createHtmlOutputFromFile('PlayersDirectory')
      .setTitle('Connecticut Pickleball League Players');
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

  const matches = allMatches.slice();

  let currentMatchId = cleanMatchId;
  if (!currentMatchId && matches.length) {
    currentMatchId = String(matches[0].match_id || '').trim();
  }

  const currentMatch = matches.find(m => String(m.match_id || '').trim() === currentMatchId) || null;

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

function saveCaptainLineupDraft(matchId, teamId, assignments) {
  const cleanMatchId = String(matchId || '').trim();
  const cleanTeamId = String(teamId || '').trim();
  if (!cleanMatchId) throw new Error('Missing matchId');
  if (!cleanTeamId) throw new Error('Missing teamId');

  const normalizedAssignments = normalizeAssignments_(
    assignments,
    getObjects_(SHEETS.MATCH_GAMES).filter(g => String(g.match_id || '').trim() === cleanMatchId)
  );

  saveTeamLineup_(cleanMatchId, cleanTeamId, normalizedAssignments, false);

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

function submitCaptainLineup(matchId, teamId, assignments) {
  const cleanMatchId = String(matchId || '').trim();
  const cleanTeamId = String(teamId || '').trim();
  if (!cleanMatchId) throw new Error('Missing matchId');
  if (!cleanTeamId) throw new Error('Missing teamId');

  const match = getObjects_(SHEETS.MATCHES).find(m =>
    String(m.match_id || '').trim() === cleanMatchId
  );
  if (!match) throw new Error('Match not found');

  const homeId = String(match.home_team_id || '').trim();
  const awayId = String(match.away_team_id || '').trim();
  if (cleanTeamId !== homeId && cleanTeamId !== awayId) {
    throw new Error('teamId is not part of this match');
  }

  saveTeamLineup_(cleanMatchId, cleanTeamId, assignments || [], true);
  revealLineupsIfReady_(cleanMatchId);

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