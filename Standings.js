function refreshAllSummaries_() {
  refreshStandingsSummary_();
  refreshPlayerStatsSummary_();
  refreshPairingStatsSummary_();
}

function refreshAllSummaries() {
  refreshAllSummaries_();
}

function refreshStandingsSummary_() {
  const matches = getObjects_(SHEETS.MATCHES);
  const rounds = getObjects_(SHEETS.MATCH_ROUNDS);
  const games = getObjects_(SHEETS.MATCH_GAMES);

  const bucket = {};

  matches.forEach(match => {
    const seasonId = match.season_id;
    const divisionId = match.division_id;

    const homeId = String(match.home_team_id || '').trim();
    const awayId = String(match.away_team_id || '').trim();
    if (!homeId || !awayId || homeId === 'TBD' || awayId === 'TBD') return;

    [match.home_team_id, match.away_team_id].forEach(teamId => {
      const key = `${seasonId}|${divisionId}|${teamId}`;
      if (!bucket[key]) {
        bucket[key] = {
          season_id: seasonId,
          division_id: divisionId,
          team_id: teamId,
          matches_played: 0,
          match_wins: 0,
          match_losses: 0,
          rounds_won: 0,
          rounds_lost: 0,
          games_won: 0,
          games_lost: 0,
          points_for: 0,
          points_against: 0,
          point_diff: 0,
          standings_rank: ''
        };
      }
    });

    const homeKey = `${seasonId}|${divisionId}|${match.home_team_id}`;
    const awayKey = `${seasonId}|${divisionId}|${match.away_team_id}`;

    if (String(match.status).toLowerCase() === MATCH_STATUS.COMPLETED ||
        String(match.status).toLowerCase() === MATCH_STATUS.FINALIZED) {
      bucket[homeKey].matches_played++;
      bucket[awayKey].matches_played++;

      if (match.winning_team_id === match.home_team_id) {
        bucket[homeKey].match_wins++;
        bucket[awayKey].match_losses++;
      } else if (match.winning_team_id === match.away_team_id) {
        bucket[awayKey].match_wins++;
        bucket[homeKey].match_losses++;
      }
    }

    rounds
      .filter(r => r.match_id === match.match_id && String(r.status).toLowerCase() === ROUND_STATUS.COMPLETE)
      .forEach(r => {
        if (r.winning_team_id === match.home_team_id) {
          bucket[homeKey].rounds_won++;
          bucket[awayKey].rounds_lost++;
        } else if (r.winning_team_id === match.away_team_id) {
          bucket[awayKey].rounds_won++;
          bucket[homeKey].rounds_lost++;
        }
      });

    games
      .filter(g => g.match_id === match.match_id && String(g.status).toLowerCase() === GAME_STATUS.COMPLETE)
      .forEach(g => {
        const hs = Number(g.home_score || 0);
        const as = Number(g.away_score || 0);

        bucket[homeKey].points_for += hs;
        bucket[homeKey].points_against += as;
        bucket[awayKey].points_for += as;
        bucket[awayKey].points_against += hs;

        if (g.winner_team_id === match.home_team_id) {
          bucket[homeKey].games_won++;
          bucket[awayKey].games_lost++;
        } else if (g.winner_team_id === match.away_team_id) {
          bucket[awayKey].games_won++;
          bucket[homeKey].games_lost++;
        }
      });
  });

  const rows = Object.values(bucket).map(r => {
    r.point_diff = Number(r.points_for) - Number(r.points_against);
    return r;
  });

  const grouped = {};
  rows.forEach(r => {
    const k = `${r.season_id}|${r.division_id}`;
    grouped[k] = grouped[k] || [];
    grouped[k].push(r);
  });

  Object.values(grouped).forEach(group => {
    group.sort((a, b) =>
      Number(b.match_wins) - Number(a.match_wins) ||
      Number(b.games_won) - Number(a.games_won) ||
      Number(b.point_diff) - Number(a.point_diff)
    );
    group.forEach((r, i) => r.standings_rank = i + 1);
  });

  overwriteObjects_(SHEETS.STANDINGS_SUMMARY, rows);
}

function refreshPlayerStatsSummary_() {
  const matches = getObjects_(SHEETS.MATCHES);
  const games = getObjects_(SHEETS.MATCH_GAMES);

  const bucket = {};

  games
    .filter(g => String(g.status).toLowerCase() === GAME_STATUS.COMPLETE)
    .forEach(g => {
      const match = matches.find(m => m.match_id === g.match_id);
      if (!match) return;

      const homePlayers = [g.home_player_1_id, g.home_player_2_id].filter(Boolean);
      const awayPlayers = [g.away_player_1_id, g.away_player_2_id].filter(Boolean);

      const hs = Number(g.home_score || 0);
      const as = Number(g.away_score || 0);

      homePlayers.forEach(playerId => {
        const key = `${match.season_id}|${match.division_id}|${g.home_team_id}|${playerId}`;
        if (!bucket[key]) {
          bucket[key] = blankPlayerStatsRow_(match.season_id, match.division_id, g.home_team_id, playerId);
        }
        applyPlayerGameStats_(bucket[key], g.game_type, hs, as, g.winner_team_id === g.home_team_id);
      });

      awayPlayers.forEach(playerId => {
        const key = `${match.season_id}|${match.division_id}|${g.away_team_id}|${playerId}`;
        if (!bucket[key]) {
          bucket[key] = blankPlayerStatsRow_(match.season_id, match.division_id, g.away_team_id, playerId);
        }
        applyPlayerGameStats_(bucket[key], g.game_type, as, hs, g.winner_team_id === g.away_team_id);
      });
    });

  Object.values(bucket).forEach(r => {
    r.point_diff = Number(r.points_for) - Number(r.points_against);
  });

  overwriteObjects_(SHEETS.PLAYER_STATS_SUMMARY, Object.values(bucket));
}

function blankPlayerStatsRow_(seasonId, divisionId, teamId, playerId) {
  return {
    season_id: seasonId,
    division_id: divisionId,
    team_id: teamId,
    player_id: playerId,
    games_played: 0,
    wins: 0,
    losses: 0,
    points_for: 0,
    points_against: 0,
    point_diff: 0,
    mens_games: 0,
    womens_games: 0,
    mixed_games: 0,
    coed_games: 0
  };
}

function applyPlayerGameStats_(row, gameType, pointsFor, pointsAgainst, won) {
  row.games_played++;
  row.points_for += Number(pointsFor || 0);
  row.points_against += Number(pointsAgainst || 0);
  if (won) row.wins++;
  else row.losses++;

  if (gameType === 'mens') row.mens_games++;
  if (gameType === 'womens') row.womens_games++;
  if (gameType === 'mixed') row.mixed_games++;
  if (gameType === 'coed') row.coed_games++;
}

function refreshPairingStatsSummary_() {
  const matches = getObjects_(SHEETS.MATCHES);
  const games = getObjects_(SHEETS.MATCH_GAMES);

  const bucket = {};

  games
    .filter(g => String(g.status).toLowerCase() === GAME_STATUS.COMPLETE)
    .forEach(g => {
      const match = matches.find(m => m.match_id === g.match_id);
      if (!match) return;

      const homePair = [g.home_player_1_id, g.home_player_2_id].filter(Boolean);
      const awayPair = [g.away_player_1_id, g.away_player_2_id].filter(Boolean);

      if (homePair.length === 2) {
        addPairingStats_(bucket, match.season_id, match.division_id, g.home_team_id, homePair[0], homePair[1], g.game_type);
      }
      if (awayPair.length === 2) {
        addPairingStats_(bucket, match.season_id, match.division_id, g.away_team_id, awayPair[0], awayPair[1], g.game_type);
      }
    });

  overwriteObjects_(SHEETS.PAIRING_STATS_SUMMARY, Object.values(bucket));
}

function addPairingStats_(bucket, seasonId, divisionId, teamId, p1, p2, gameType) {
  const pair = [p1, p2].sort();
  const key = `${seasonId}|${divisionId}|${teamId}|${pair[0]}|${pair[1]}`;

  if (!bucket[key]) {
    bucket[key] = {
      season_id: seasonId,
      division_id: divisionId,
      team_id: teamId,
      player_1_id: pair[0],
      player_2_id: pair[1],
      total_games_together: 0,
      mens_games_together: 0,
      womens_games_together: 0,
      mixed_games_together: 0,
      coed_games_together: 0
    };
  }

  bucket[key].total_games_together++;
  if (gameType === 'mens') bucket[key].mens_games_together++;
  if (gameType === 'womens') bucket[key].womens_games_together++;
  if (gameType === 'mixed') bucket[key].mixed_games_together++;
  if (gameType === 'coed') bucket[key].coed_games_together++;
}