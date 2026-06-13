function getEligibleRosterForMatch_(matchId, teamId) {
  const cleanTeamId = String(teamId || '').trim();
  const cleanMatchId = String(matchId || '').trim();

  // Resolve the captain's club name from Teams + Clubs.
  const teams = getObjects_(SHEETS.TEAMS);
  const clubs  = getObjects_(SHEETS.CLUBS);
  const thisTeam = teams.find(t => String(t.team_id || '').trim() === cleanTeamId);
  const clubId   = thisTeam ? String(thisTeam.club_id || '').trim() : '';
  const thisClub = clubs.find(c => String(c.club_id || '').trim() === clubId);

  // All names this club goes by in the Players sheet (club_name, short_name).
  const clubNames = new Set(
    [
      thisClub && String(thisClub.club_name  || '').trim(),
      thisClub && String(thisClub.short_name || '').trim(),
      clubId
    ].filter(Boolean).map(s => s.toLowerCase())
  );

  // Resolve match division for eligibility filtering.
  const matches = getObjects_(SHEETS.MATCHES);
  const thisMatch = matches.find(m => String(m.match_id || '').trim() === cleanMatchId);
  const divisionId = String((thisMatch && thisMatch.division_id) || (thisTeam && thisTeam.division_id) || '').trim();

  const availability = getObjects_(SHEETS.MATCH_PLAYER_AVAILABILITY).filter(a =>
    String(a.match_id || '').trim() === cleanMatchId &&
    String(a.team_id || '').trim() === cleanTeamId
  );

  return getObjects_(SHEETS.PLAYERS)
    .filter(p => {
      // Exclude only if active is explicitly FALSE — missing/blank = include.
      const activeRaw = p.active;
      if (activeRaw !== undefined && activeRaw !== '' && !normalizeBoolValue_(activeRaw)) return false;

      // Club match: only filter if the captain has a resolvable club AND
      // the player has a club value — skip the filter if either is absent.
      if (clubNames.size) {
        const pClub = String(p.club || '').trim().toLowerCase();
        if (pClub && !clubNames.has(pClub)) return false;
      }

      // Division eligibility: p.eligibility is the player's division rating
      // (lowest number = most competitive). Include the player if their
      // eligibility number >= the match's division number — i.e. players
      // rated for this division and all less-competitive (higher-numbered)
      // divisions are shown; players rated for more-competitive divisions only
      // (lower number) are excluded.
      if (p.eligibility !== undefined && p.eligibility !== '') {
        const playerElig = Number(p.eligibility);
        const matchDivNum = Number(String(divisionId || '').replace(/\D/g, '')) || 0;
        if (matchDivNum && !isNaN(playerElig) && playerElig < matchDivNum) return false;
      }

      return true;
    })
    .map(p => {
      const playerId = String(p.player_id || '').trim();
      const a = availability.find(av => String(av.player_id || '').trim() === playerId);
      return {
        player_id: playerId,
        full_name: String(p.name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '').trim(),
        gender: normalizeGenderCodeForRoster_(p.gender),
        available: a ? normalizeBoolValue_(a.available) : true
      };
    });
}

// Upsert a per-match availability record into Match_Player_Availability, keyed
// by (match_id, team_id, player_id). getEligibleRosterForMatch_ above reads
// `available` from this same sheet, so this is what makes the captain's
// Available/Unavailable drag persist. (Previously this function didn't exist,
// so the drag silently failed.)
function savePlayerAvailabilityForMatch(matchId, teamId, playerId, available) {
  const matchIdStr  = String(matchId  || '').trim();
  const teamIdStr   = String(teamId   || '').trim();
  const playerIdStr = String(playerId || '').trim();
  if (!matchIdStr)  throw new Error('Missing matchId');
  if (!teamIdStr)   throw new Error('Missing teamId');
  if (!playerIdStr) throw new Error('Missing playerId');

  const isAvailable = !!available;
  const sh = getSheet_(SHEETS.MATCH_PLAYER_AVAILABILITY);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const idx = name => headers.indexOf(name);
  const cMatch = idx('match_id'), cTeam = idx('team_id'), cPlayer = idx('player_id'), cAvail = idx('available');

  let foundRow = -1;
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (String(row[cMatch] || '').trim() === matchIdStr &&
        String(row[cTeam]  || '').trim() === teamIdStr &&
        String(row[cPlayer]|| '').trim() === playerIdStr) {
      foundRow = r + 1;
      break;
    }
  }

  const userEmail = (typeof tryGetUserEmail_ === 'function') ? tryGetUserEmail_() : '';
  const now = nowStamp_();

  if (foundRow > 0) {
    sh.getRange(foundRow, cAvail + 1).setValue(isAvailable);
    if (idx('reported_by_user_id') >= 0) sh.getRange(foundRow, idx('reported_by_user_id') + 1).setValue(userEmail);
    if (idx('reported_at') >= 0)         sh.getRange(foundRow, idx('reported_at') + 1).setValue(now);
  } else {
    appendObjects_(SHEETS.MATCH_PLAYER_AVAILABILITY, [{
      availability_id:     makeId_('AVAIL'),
      match_id:            matchIdStr,
      team_id:             teamIdStr,
      player_id:           playerIdStr,
      available:           isAvailable,
      reported_by_user_id: userEmail,
      reported_at:         now,
      notes:               ''
    }]);
  }

  return { ok: true, match_id: matchIdStr, team_id: teamIdStr, player_id: playerIdStr, available: isAvailable };
}

function saveTeamLineup_(matchId, teamId, assignments, submitted, access) {
  const allGames = getObjects_(SHEETS.MATCH_GAMES);
  const allMatches = getObjects_(SHEETS.MATCHES);
  const match = allMatches.find(m => String(m.match_id || '').trim() === String(matchId || '').trim());
  if (!match) throw new Error('Match not found');

  const targetGames = allGames.filter(g => String(g.match_id || '').trim() === String(matchId || '').trim());

  if (submitted) {
    validateTeamLineup_(match, teamId, assignments, targetGames);
  } else {
    validateTeamLineupDraft_(match, teamId, assignments, targetGames);
  }

  const userId    = String((access && access.userId) || '');
  const userEmail = String((access && access.email)  || '');
  const userName  = String((access && access.name)   || userEmail || '');

  const now = nowStamp_();
  const isHomeSide = String(teamId || '').trim() === String(match.home_team_id || '').trim();
  const isAwaySide = String(teamId || '').trim() === String(match.away_team_id || '').trim();

  if (!isHomeSide && !isAwaySide) {
    throw new Error('Team is not part of this match');
  }

  // Guardrail: refuse to silently wipe a non-empty draft.
  //
  // If a draft save (submitted=false) comes in with NO player IDs at all,
  // and this side already has filled slots in the sheet, treat it as a
  // likely UI bug (a captain page that loaded an empty schedule and then
  // autosaved blanks). Captains who actually want to start over should
  // clear individual slots via the UI — single-slot edits still pass
  // because the other slots' incoming values stay populated.
  if (!submitted) {
    const incomingHasAnyPlayer = (assignments || []).some(a =>
      String(a && a.player_1_id || '').trim() ||
      String(a && a.player_2_id || '').trim()
    );
    if (!incomingHasAnyPlayer) {
      const existingHasAnyPlayer = targetGames.some(g => isHomeSide
        ? (String(g.home_player_1_id || '').trim() || String(g.home_player_2_id || '').trim())
        : (String(g.away_player_1_id || '').trim() || String(g.away_player_2_id || '').trim())
      );
      if (existingHasAnyPlayer) {
        throw new Error(
          'Refused to overwrite an existing lineup with an empty one. ' +
          'Reload the page to see the current lineup before editing.'
        );
      }
    }
  }

  const assignmentMap = {};
  (assignments || []).forEach(a => {
    const gid = String(a.game_id || '').trim();
    if (gid) assignmentMap[gid] = a;
  });

  const updatedGames = allGames.map(g => {
    if (String(g.match_id || '').trim() !== String(matchId || '').trim()) return g;

    const gid = String(g.game_id || '').trim();
    const incoming = assignmentMap[gid];
    if (!incoming) return g;

    if (isHomeSide) {
      g.home_player_1_id = String(incoming.player_1_id || '').trim();
      g.home_player_2_id = String(incoming.player_2_id || '').trim();
      g.lineup_submitted_home = !!submitted;

      g.home_updated_at = now;
      g.home_updated_by = userName;
      g.home_updated_by_email = userEmail;
      g.home_updated_by_name = userName;

      if (submitted) {
        g.home_submitted_at = now;
        g.home_submitted_by = userName;
        g.home_submitted_by_email = userEmail;
        g.home_submitted_by_name = userName;
      }
    }

    if (isAwaySide) {
      g.away_player_1_id = String(incoming.player_1_id || '').trim();
      g.away_player_2_id = String(incoming.player_2_id || '').trim();
      g.lineup_submitted_away = !!submitted;

      g.away_updated_at = now;
      g.away_updated_by = userName;
      g.away_updated_by_email = userEmail;
      g.away_updated_by_name = userName;

      if (submitted) {
        g.away_submitted_at = now;
        g.away_submitted_by = userName;
        g.away_submitted_by_email = userEmail;
        g.away_submitted_by_name = userName;
      }
    }

    g.updated_at = now;
    g.updated_by = userName;
    g.updated_by_user_id = userId;
    g.status = computeGameReadiness_(g);

    return g;
  });

  overwriteObjects_(SHEETS.MATCH_GAMES, updatedGames);

  upsertMatchSubmission_(matchId, teamId, submitted ? SUBMISSION_STATUS.SUBMITTED : SUBMISSION_STATUS.DRAFT, access);
}

function computeGameReadiness_(game) {
  const hp1 = String(game.home_player_1_id || '').trim();
  const hp2 = String(game.home_player_2_id || '').trim();
  const ap1 = String(game.away_player_1_id || '').trim();
  const ap2 = String(game.away_player_2_id || '').trim();

  const homeReady = !!(hp1 && hp2);
  const awayReady = !!(ap1 && ap2);

  if (homeReady && awayReady) return 'ready';
  if (homeReady || awayReady) return 'partial';
  return 'pending';
}

function normalizeAssignments_(assignments, existingGames) {
  const validGameIds = new Set((existingGames || []).map(g => String(g.game_id || '').trim()));

  return (assignments || []).map(a => ({
    game_id: String(a && a.game_id || '').trim(),
    player_1_id: String(a && a.player_1_id || '').trim(),
    player_2_id: String(a && a.player_2_id || '').trim()
  })).filter(a => a.game_id && validGameIds.has(a.game_id));
}

function normalizeGenderCodeForRoster_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (['w', 'f', 'female', 'woman', 'women'].includes(s)) return 'F';
  if (['m', 'male', 'man', 'men'].includes(s)) return 'M';
  return String(value || '').trim().toUpperCase();
}

function normalizeBoolValue_(value) {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}