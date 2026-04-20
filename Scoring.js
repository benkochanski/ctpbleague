function saveGameScore_(gameId, homeScore, awayScore) {
  const allGames = getObjects_(SHEETS.MATCH_GAMES);
  const game = allGames.find(g => g.game_id === gameId);
  if (!game) throw new Error('Game not found');

  const matchId = game.match_id;

  game.home_score = Number(homeScore);
  game.away_score = Number(awayScore);
  game.winner_team_id = Number(homeScore) > Number(awayScore) ? game.home_team_id : game.away_team_id;
  game.status = GAME_STATUS.COMPLETE;
  game.score_entered_at = nowStamp_();
  game.updated_at = nowStamp_();

  overwriteObjects_(SHEETS.MATCH_GAMES, allGames);

  refreshRoundResult_(game.round_id);
  refreshMatchResult_(matchId);
}
