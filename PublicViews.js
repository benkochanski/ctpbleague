/**
 * PublicViews.js
 * Backend functions for the public-facing scoreboard and match display views.
 */

/**
 * Returns standings and player stats for both teams in a given match.
 * Reads from Standings_Summary and Player_Stats_Summary sheets.
 * Returns JSON string: { homeStats, awayStats, homePlayers, awayPlayers }
 */
function getPublicMatchStatsV1(matchId) {
  const cleanId = String(matchId || '').trim();
  if (!cleanId) return JSON.stringify({ ok: false, error: 'Missing matchId' });

  const matches = getObjects_(SHEETS.MATCHES);
  const match = matches.find(m => String(m.match_id || '').trim() === cleanId);
  if (!match) return JSON.stringify({ ok: false, error: 'Match not found' });

  const homeTeamId = String(match.home_team_id || '').trim();
  const awayTeamId = String(match.away_team_id || '').trim();

  // Resolve team names
  const teams = getObjects_(SHEETS.TEAMS);
  const findTeam = id => teams.find(t => String(t.team_id || '').trim() === id);
  const homeTeam = findTeam(homeTeamId);
  const awayTeam = findTeam(awayTeamId);
  const homeName = stripDivisionSuffix_((homeTeam && (homeTeam.team_name || homeTeam.name)) || homeTeamId);
  const awayName = stripDivisionSuffix_((awayTeam && (awayTeam.team_name || awayTeam.name)) || awayTeamId);

  // Standings Summary — keyed by team_id
  const standingsRows = getObjects_(SHEETS.STANDINGS_SUMMARY);
  const findStats = id => {
    const row = standingsRows.find(r => String(r.team_id || '').trim() === id);
    if (!row) return null;
    return {
      team_id:        id,
      team_name:      stripDivisionSuffix_((findTeam(id) && (findTeam(id).team_name || findTeam(id).name)) || id),
      matches_played: Number(row.matches_played  || 0),
      match_wins:     Number(row.match_wins      || 0),
      match_losses:   Number(row.match_losses    || 0),
      rounds_won:     Number(row.rounds_won      || 0),
      rounds_lost:    Number(row.rounds_lost     || 0),
      games_won:      Number(row.games_won       || 0),
      games_lost:     Number(row.games_lost      || 0),
      points_for:     Number(row.points_for      || 0),
      points_against: Number(row.points_against  || 0),
      point_diff:     Number(row.point_diff      || 0),
      standings_rank: row.standings_rank ? Number(row.standings_rank) : null,
    };
  };

  const homeStats = findStats(homeTeamId);
  const awayStats = findStats(awayTeamId);

  // Player Stats Summary — filter by team_id, resolve player names
  const playerStatsRows = getObjects_(SHEETS.PLAYER_STATS_SUMMARY);
  const players = getObjects_(SHEETS.PLAYERS);
  const playerMap = {};
  players.forEach(p => {
    const id = String(p.player_id || '').trim();
    if (id) playerMap[id] = String(p.full_name || p.name || p.player_name || '').trim() || id;
  });

  const buildPlayerStats = teamId => {
    return playerStatsRows
      .filter(r => String(r.team_id || '').trim() === teamId)
      .map(r => {
        const pid = String(r.player_id || '').trim();
        return {
          player_id:    pid,
          player_name:  playerMap[pid] || String(r.player_name || r.name || '').trim() || pid,
          games_played: Number(r.games_played || 0),
          wins:         Number(r.wins         || 0),
          losses:       Number(r.losses       || 0),
          points_for:   Number(r.points_for   || 0),
          points_against: Number(r.points_against || 0),
          point_diff:   Number(r.point_diff   || 0),
        };
      })
      .sort((a, b) => b.wins - a.wins || b.games_played - a.games_played);
  };

  return JSON.stringify({
    ok:          true,
    matchId:     cleanId,
    homeStats,
    awayStats,
    homePlayers: buildPlayerStats(homeTeamId),
    awayPlayers: buildPlayerStats(awayTeamId),
  });
}

/**
 * Returns all matches (not filtered to open/incomplete) for public display.
 * Returns JSON string: { ok, rows }
 */
function getMatchesPublicV1() {
  const matches = getObjects_(SHEETS.MATCHES);
  const teams   = getObjects_(SHEETS.TEAMS);
  const teamMap = {};
  teams.forEach(t => {
    const id = String(t.team_id || '').trim();
    if (id) teamMap[id] = stripDivisionSuffix_(String(t.team_name || t.name || '').trim()) || id;
  });

  const rows = matches.map(m => {
    const hId = String(m.home_team_id || '').trim();
    const aId = String(m.away_team_id || '').trim();
    return {
      match_id:        String(m.match_id       || '').trim(),
      division_id:     String(m.division_id    || '').trim(),
      match_date:      String(m.match_date      || '').trim(),
      venue:           String(m.venue || m.location || m.match_location || '').trim(),
      match_status:    String(m.match_status    || '').trim(),
      home_team_id:    hId,
      away_team_id:    aId,
      home_team_name:  teamMap[hId] || hId,
      away_team_name:  teamMap[aId] || aId,
      label:           `${teamMap[hId] || hId} vs ${teamMap[aId] || aId}`,
    };
  });

  return JSON.stringify({ ok: true, rows });
}
