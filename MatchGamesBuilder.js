function rebuildMatchGamesFromTemplates() {
  const ss = SpreadsheetApp.getActive();
  const matchesSheet = ss.getSheetByName('Matches');
  const templateSheet = ss.getSheetByName('Match_Format_Templates');
  const matchGamesSheet = ss.getSheetByName('Match_Games');
  const matchRoundsSheet = ss.getSheetByName('Match_Rounds');

  if (!matchesSheet) throw new Error('Matches sheet not found');
  if (!templateSheet) throw new Error('Match_Format_Templates sheet not found');
  if (!matchGamesSheet) throw new Error('Match_Games sheet not found');
  if (!matchRoundsSheet) throw new Error('Match_Rounds sheet not found');

  const matches = getSheetObjects_(matchesSheet);
  const templates = getSheetObjects_(templateSheet);

  const templateMap = {};
  templates.forEach(row => {
    const templateId = String(row.match_template_id || '').trim();
    if (!templateId) return;
    if (!templateMap[templateId]) templateMap[templateId] = [];
    templateMap[templateId].push(row);
  });

  Object.keys(templateMap).forEach(templateId => {
    templateMap[templateId].sort((a, b) =>
      Number(a.round_number || 0) - Number(b.round_number || 0) ||
      Number(a.game_number_in_round || 0) - Number(b.game_number_in_round || 0)
    );
  });

  const gameOutput = [];
  const roundOutput = [];

  matches.forEach(match => {
    const matchId = String(match.match_id || '').trim();
    const divisionId = String(match.division_id || '').trim();
    const homeTeamId = String(match.home_team_id || '').trim();
    const awayTeamId = String(match.away_team_id || '').trim();

    if (!matchId || !divisionId) return;
    if (!homeTeamId || !awayTeamId) return;
    if (homeTeamId === 'TBD' || awayTeamId === 'TBD') return;

    const templateId = getTemplateIdForDivision_(divisionId);
    const templateRows = templateMap[templateId] || [];

    if (!templateRows.length) {
      Logger.log(
        'No template rows found for matchId=' + matchId +
        ', divisionId=' + divisionId +
        ', templateId=' + templateId
      );
      return;
    }

    let matchSequence = 1;
    const roundsSeen = {};

    templateRows.forEach(t => {
      const roundNumber = Number(t.round_number || 0);
      const roundType = String(t.round_type || '').trim() || 'regulation';
      const gameNumberInRound = Number(t.game_number_in_round || 0);
      const gameType = String(t.game_type || '').trim();

      const cleanMatchId = matchId.replace(/[^A-Za-z0-9]/g, '');
      const roundId =
        'ROUND_' +
        cleanMatchId +
        '_R' + String(roundNumber).padStart(2, '0');

      const gameId =
        'GAME_' +
        cleanMatchId +
        '_R' + String(roundNumber).padStart(2, '0') +
        '_G' + String(gameNumberInRound).padStart(2, '0');

      if (!roundsSeen[roundId]) {
        roundsSeen[roundId] = true;

        const roundRowsForThisRound = templateRows.filter(r =>
          Number(r.round_number || 0) === roundNumber
        );

        roundOutput.push([
          roundId,                      // round_id
          matchId,                      // match_id
          roundNumber,                  // round_number
          roundType,                    // round_type
          roundRowsForThisRound.length, // expected_game_count
          0,                            // home_games_won
          0,                            // away_games_won
          '',                           // winning_team_id
          'scheduled'                   // status
        ]);
      }

      gameOutput.push([
        gameId,            // game_id
        matchId,           // match_id
        roundId,           // round_id
        roundNumber,       // round_number
        roundType,         // round_type
        gameNumberInRound, // game_number_in_round
        matchSequence,     // game_sequence
        '',                // court_number
        gameType,          // game_type
        homeTeamId,        // home_team_id
        awayTeamId,        // away_team_id
        '',                // home_player_1_id
        '',                // home_player_2_id
        '',                // away_player_1_id
        '',                // away_player_2_id
        '',                // home_score
        '',                // away_score
        '',                // winner_team_id
        'scheduled',       // status
        false,             // lineup_submitted_home
        false,             // lineup_submitted_away
        '',                // score_entered_by_user_id
        '',                // score_entered_at
        ''                 // updated_at
      ]);

      matchSequence++;
    });
  });

  const roundHeaders = [
    'round_id',
    'match_id',
    'round_number',
    'round_type',
    'expected_game_count',
    'home_games_won',
    'away_games_won',
    'winning_team_id',
    'status'
  ];

  const gameHeaders = [
    'game_id',
    'match_id',
    'round_id',
    'round_number',
    'round_type',
    'game_number_in_round',
    'game_sequence',
    'court_number',
    'game_type',
    'home_team_id',
    'away_team_id',
    'home_player_1_id',
    'home_player_2_id',
    'away_player_1_id',
    'away_player_2_id',
    'home_score',
    'away_score',
    'winner_team_id',
    'status',
    'lineup_submitted_home',
    'lineup_submitted_away',
    'score_entered_by_user_id',
    'score_entered_at',
    'updated_at'
  ];

  matchRoundsSheet.clearContents();
  matchRoundsSheet.getRange(1, 1, 1, roundHeaders.length).setValues([roundHeaders]);
  if (roundOutput.length) {
    matchRoundsSheet.getRange(2, 1, roundOutput.length, roundHeaders.length).setValues(roundOutput);
  }

  matchGamesSheet.clearContents();
  matchGamesSheet.getRange(1, 1, 1, gameHeaders.length).setValues([gameHeaders]);
  if (gameOutput.length) {
    matchGamesSheet.getRange(2, 1, gameOutput.length, gameHeaders.length).setValues(gameOutput);
  }
}

function getTemplateIdForDivision_(divisionId) {
  const d = String(divisionId || '').trim().toUpperCase();

  if (
    d === 'DIV1' ||
    d === 'D1' ||
    d === 'DIV 1' ||
    d === 'DIVISION 1' ||
    d === '1'
  ) {
    return 'MT_DIV1';
  }

  return 'MT_STD';
}

function getSheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}