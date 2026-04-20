function createMatch_(payload) {
  const {
    seasonId,
    divisionId,
    homeTeamId,
    awayTeamId,
    matchDate,
    startTime,
    venue
  } = payload;

  const matchId = makeId_('MATCH');
  const homeDue = computeHomeLineupDue_(matchDate, startTime);
  const awayDue = computeAwayLineupDue_(matchDate, startTime);

  const matchRow = {
    match_id: matchId,
    season_id: seasonId,
    division_id: divisionId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    match_date: matchDate,
    start_time: startTime,
    venue: venue || '',
    status: MATCH_STATUS.SCHEDULED,
    away_lineup_due_at: awayDue,
    home_lineup_due_at: homeDue,
    away_submission_status: SUBMISSION_STATUS.NOT_SUBMITTED,
    home_submission_status: SUBMISSION_STATUS.NOT_SUBMITTED,
    public_visibility_status: 'hidden',
    home_rounds_won: 0,
    away_rounds_won: 0,
    super_dreambreaker_played: false,
    winning_team_id: '',
    notes: ''
  };

  appendObjects_(SHEETS.MATCHES, [matchRow]);

  generateRoundsAndGamesForMatch_(matchId);

  return matchId;
}

function generateRoundsAndGamesForMatch_(matchId) {
  const matches = getObjects_(SHEETS.MATCHES);
  const match = matches.find(m => m.match_id === matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);

  const templateRows = getMatchTemplateRows_(match.division_id);

  const roundMap = {};
  const roundRows = [];
  const gameRows = [];

  templateRows.forEach(t => {
    const roundNumber = Number(t.round_number);
    const roundKey = `${matchId}_${roundNumber}`;

    if (!roundMap[roundKey]) {
      const roundId = `RND_${matchId}_${roundNumber}`;
      roundMap[roundKey] = roundId;

      roundRows.push({
        round_id: roundId,
        match_id: matchId,
        round_number: roundNumber,
        round_type: t.round_type,
        expected_game_count: roundNumber === 9 ? 3 : 4,
        home_games_won: 0,
        away_games_won: 0,
        winning_team_id: '',
        status: roundNumber === 9 ? ROUND_STATUS.INACTIVE : ROUND_STATUS.NOT_STARTED
      });
    }

    const gameSequence = gameRows.length + 1;
    gameRows.push({
      game_id: `GAME_${matchId}_${String(gameSequence).padStart(2, '0')}`,
      match_id: matchId,
      round_id: roundMap[roundKey],
      round_number: roundNumber,
      round_type: t.round_type,
      game_number_in_round: Number(t.game_number_in_round),
      game_sequence: gameSequence,
      court_number: Number(t.game_number_in_round),
      game_type: t.game_type,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      home_player_1_id: '',
      home_player_2_id: '',
      away_player_1_id: '',
      away_player_2_id: '',
      home_score: '',
      away_score: '',
      winner_team_id: '',
      status: roundNumber === 9 ? GAME_STATUS.VOID : GAME_STATUS.NOT_STARTED,
      lineup_submitted_home: false,
      lineup_submitted_away: false,
      score_entered_by_user_id: '',
      score_entered_at: '',
      updated_at: ''
    });
  });

  appendObjects_(SHEETS.MATCH_ROUNDS, roundRows);
  appendObjects_(SHEETS.MATCH_GAMES, gameRows);
}

function computeAwayLineupDue_(matchDate, startTime) {
  return `${matchDate} ${startTime}`;
}

function computeHomeLineupDue_(matchDate, startTime) {
  return `${matchDate} ${startTime}`;
}

function ensureRoundsAndGamesForMatch_(matchId) {
  const cleanMatchId = String(matchId || '').trim();
  if (!cleanMatchId) return;

  const existingGames = getObjects_(SHEETS.MATCH_GAMES).filter(
    g => String(g.match_id || '').trim() === cleanMatchId
  );

  if (existingGames.length) return;

  generateRoundsAndGamesForMatch_(cleanMatchId);
}