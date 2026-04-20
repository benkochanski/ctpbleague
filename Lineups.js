function getEligibleRosterForMatch_(matchId, teamId) {
  const match = getObjects_(SHEETS.MATCHES).find(
    m => String(m.match_id || '').trim() === String(matchId || '').trim()
  );
  if (!match) throw new Error('Match not found');

  const rosters = getObjects_(SHEETS.TEAM_ROSTERS).filter(r =>
    String(r.team_id || '').trim() === String(teamId || '').trim() &&
    String(r.season_id || '').trim() === String(match.season_id || '').trim() &&
    String(r.roster_status || '').trim().toLowerCase() === 'eligible'
  );

  const players = getObjects_(SHEETS.PLAYERS);
  const availability = getObjects_(SHEETS.MATCH_PLAYER_AVAILABILITY).filter(a =>
    String(a.match_id || '').trim() === String(matchId || '').trim() &&
    String(a.team_id || '').trim() === String(teamId || '').trim()
  );

  return rosters.map(r => {
    const player = players.find(p => String(p.player_id || '').trim() === String(r.player_id || '').trim());
    const a = availability.find(av => String(av.player_id || '').trim() === String(r.player_id || '').trim());

    return {
      player_id: String(r.player_id || '').trim(),
      full_name: String((player && (player.full_name || player.name)) || '').trim(),
      gender: normalizeGenderCodeForRoster_(player ? player.gender : ''),
      available: a ? normalizeBoolValue_(a.available) : true
    };
  });
}

function saveTeamLineup_(matchId, teamId, assignments, submitted) {
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

  const userId = '';
  const userEmail = 'Public User';

  const now = nowStamp_();
  const isHomeSide = String(teamId || '').trim() === String(match.home_team_id || '').trim();
  const isAwaySide = String(teamId || '').trim() === String(match.away_team_id || '').trim();

  if (!isHomeSide && !isAwaySide) {
    throw new Error('Team is not part of this match');
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
      g.home_updated_by = userEmail;
      g.home_updated_by_email = userEmail;

      if (submitted) {
        g.home_submitted_at = now;
        g.home_submitted_by = userEmail;
        g.home_submitted_by_email = userEmail;
      }
    }

    if (isAwaySide) {
      g.away_player_1_id = String(incoming.player_1_id || '').trim();
      g.away_player_2_id = String(incoming.player_2_id || '').trim();
      g.lineup_submitted_away = !!submitted;

      g.away_updated_at = now;
      g.away_updated_by = userEmail;
      g.away_updated_by_email = userEmail;

      if (submitted) {
        g.away_submitted_at = now;
        g.away_submitted_by = userEmail;
        g.away_submitted_by_email = userEmail;
      }
    }

    g.updated_at = now;
    g.updated_by = userEmail;
    g.updated_by_user_id = userId;
    g.status = computeGameReadiness_(g);

    return g;
  });

  overwriteObjects_(SHEETS.MATCH_GAMES, updatedGames);

  upsertMatchSubmission_(matchId, teamId, submitted ? SUBMISSION_STATUS.SUBMITTED : SUBMISSION_STATUS.DRAFT);
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