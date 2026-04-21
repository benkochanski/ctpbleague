function refreshRoundResult_(roundId) {
  const rounds = getObjects_(SHEETS.MATCH_ROUNDS);
  const games = getObjects_(SHEETS.MATCH_GAMES).filter(g => g.round_id === roundId);
  const round = rounds.find(r => r.round_id === roundId);
  if (!round) throw new Error('Round not found');

  const homeTeam = games[0]?.home_team_id;
  const awayTeam = games[0]?.away_team_id;

  let homeWins = 0;
  let awayWins = 0;

  games.forEach(g => {
    if (g.winner_team_id === homeTeam) homeWins++;
    if (g.winner_team_id === awayTeam) awayWins++;
  });

  round.home_games_won = homeWins;
  round.away_games_won = awayWins;
  round.status = games.every(g => g.status === GAME_STATUS.COMPLETE) ? ROUND_STATUS.COMPLETE : ROUND_STATUS.IN_PROGRESS;
  round.winning_team_id = homeWins > awayWins ? homeTeam : awayWins > homeWins ? awayTeam : '';

  overwriteObjects_(SHEETS.MATCH_ROUNDS, rounds);
}

function refreshMatchResult_(matchId) {
  const matches = getObjects_(SHEETS.MATCHES);
  const rounds = getObjects_(SHEETS.MATCH_ROUNDS).filter(r => r.match_id === matchId);
  const games = getObjects_(SHEETS.MATCH_GAMES).filter(g => g.match_id === matchId);
  const match = matches.find(m => m.match_id === matchId);
  if (!match) throw new Error('Match not found');

  const REG = MATCH_SCORING.REGULATION_ROUNDS;
  const WIN_REG = MATCH_SCORING.GAMES_TO_WIN_REGULATION;
  const WIN_OVERALL = MATCH_SCORING.GAMES_TO_WIN_OVERALL;

  let homeRounds = 0;
  let awayRounds = 0;
  rounds
    .filter(r => Number(r.round_number) <= REG && r.status === ROUND_STATUS.COMPLETE)
    .forEach(r => {
      if (r.winning_team_id === match.home_team_id) homeRounds++;
      if (r.winning_team_id === match.away_team_id) awayRounds++;
    });

  let homeRegGames = 0, awayRegGames = 0;
  let homeSdbGames = 0, awaySdbGames = 0;
  games
    .filter(g => String(g.status).toLowerCase() === GAME_STATUS.COMPLETE)
    .forEach(g => {
      const isReg = Number(g.round_number) <= REG;
      if (g.winner_team_id === match.home_team_id) {
        if (isReg) homeRegGames++; else homeSdbGames++;
      } else if (g.winner_team_id === match.away_team_id) {
        if (isReg) awayRegGames++; else awaySdbGames++;
      }
    });

  const homeTotalGames = homeRegGames + homeSdbGames;
  const awayTotalGames = awayRegGames + awaySdbGames;

  match.home_rounds_won = homeRounds;
  match.away_rounds_won = awayRounds;
  match.home_games_won = homeTotalGames;
  match.away_games_won = awayTotalGames;

  const regulationRoundsComplete = rounds
    .filter(r => Number(r.round_number) <= REG)
    .every(r => r.status === ROUND_STATUS.COMPLETE);

  let winningTeamId = '';
  if (homeRegGames >= WIN_REG && homeRegGames > awayRegGames) {
    winningTeamId = match.home_team_id;
  } else if (awayRegGames >= WIN_REG && awayRegGames > homeRegGames) {
    winningTeamId = match.away_team_id;
  } else if (regulationRoundsComplete && homeRegGames === 16 && awayRegGames === 16) {
    if (homeTotalGames >= WIN_OVERALL && homeTotalGames > awayTotalGames) {
      winningTeamId = match.home_team_id;
    } else if (awayTotalGames >= WIN_OVERALL && awayTotalGames > homeTotalGames) {
      winningTeamId = match.away_team_id;
    } else if (!match.super_dreambreaker_played) {
      overwriteObjects_(SHEETS.MATCHES, matches);
      activateSuperDreambreaker_(matchId);
      return;
    }
  }

  if (winningTeamId) {
    match.winning_team_id = winningTeamId;
    match.status = MATCH_STATUS.COMPLETED;
  } else {
    match.winning_team_id = '';
  }

  overwriteObjects_(SHEETS.MATCHES, matches);
}

function activateSuperDreambreaker_(matchId) {
  const rounds = getObjects_(SHEETS.MATCH_ROUNDS);
  const games = getObjects_(SHEETS.MATCH_GAMES);

  rounds.forEach(r => {
    if (r.match_id === matchId && Number(r.round_number) === 9) {
      r.status = ROUND_STATUS.NOT_STARTED;
    }
  });

  games.forEach(g => {
    if (g.match_id === matchId && Number(g.round_number) === 9) {
      g.status = GAME_STATUS.NOT_STARTED;
    }
  });

  overwriteObjects_(SHEETS.MATCH_ROUNDS, rounds);
  overwriteObjects_(SHEETS.MATCH_GAMES, games);

  const matches = getObjects_(SHEETS.MATCHES);
  const match = matches.find(m => m.match_id === matchId);
  if (match) {
    match.super_dreambreaker_played = true;
    match.status = MATCH_STATUS.LIVE;
    overwriteObjects_(SHEETS.MATCHES, matches);
  }
}