function getOpenMatchesForScoreEntryV3() {
  const rows = getOpenMatchesForScoreEntryV2();
  Logger.log('V3 called. rows=' + rows.length);

  return rows.slice(0, 20).map(r => ({
    match_id: r.match_id,
    match_date: r.match_date,
    status: r.status,
    home_team_id: r.home_team_id,
    away_team_id: r.away_team_id,
    home_team_name: r.home_team_name,
    away_team_name: r.away_team_name,
    _source: 'V3'
  }));
}

function scorecardPingV3() {
  return {
    ok: true,
    source: 'scorecardPingV3',
    timestamp: new Date().toISOString()
  };
}

function getOpenMatchesForScoreEntryV2() {
  const ss = getBackendSpreadsheet_();
  const matchesSheet = ss.getSheetByName('Matches');
  const teamsSheet = ss.getSheetByName('Teams');

  if (!matchesSheet || !teamsSheet) {
    throw new Error('Missing Matches or Teams sheet.');
  }

  const matchesTable = getTableScorecard_(matchesSheet);
  const teamsTable = getTableScorecard_(teamsSheet);

  const teamsById = {};
  teamsTable.rows.forEach(r => {
    const obj = rowToObjectScorecard_(teamsTable, r.rowNumber);
    if (obj && obj.team_id) {
      teamsById[String(obj.team_id).trim()] = obj;
    }
  });

  const rows = matchesTable.rows
    .map(r => rowToObjectScorecard_(matchesTable, r.rowNumber))
    .filter(m => m && m.match_id && m.home_team_id && m.away_team_id)
    .map(m => {
      const homeKey = String(m.home_team_id).trim();
      const awayKey = String(m.away_team_id).trim();

      return {
        match_id: String(m.match_id).trim(),
        match_date: m.match_date,
        status: String(m.status || 'scheduled').trim(),
        home_team_id: homeKey,
        away_team_id: awayKey,
        home_team_name: teamsById[homeKey]?.team_name || homeKey,
        away_team_name: teamsById[awayKey]?.team_name || awayKey
      };
    })
    .filter(m => m.status.toLowerCase() !== 'completed');

  Logger.log('getOpenMatchesForScoreEntryV2 rows=' + rows.length);
  return rows;
}

function getScorecardDataV2(matchId) {
  const ss = getBackendSpreadsheet_();

  const matchesSheet = ss.getSheetByName('Matches');
  const roundsSheet = ss.getSheetByName('Match_Rounds');
  const gamesSheet = ss.getSheetByName('Match_Games');
  const teamsSheet = ss.getSheetByName('Teams');
  const playersSheet = ss.getSheetByName('Players');

  const matchesTable = getTableScorecard_(matchesSheet);
  const roundsTable = getTableScorecard_(roundsSheet);
  const gamesTable = getTableScorecard_(gamesSheet);
  const teamsTable = getTableScorecard_(teamsSheet);
  const playersTable = getTableScorecard_(playersSheet);

  const matchRow = findRowByIdScorecard_(matchesTable, 'match_id', matchId);
  if (!matchRow) throw new Error('Match not found: ' + matchId);

  const match = rowToObjectScorecard_(matchesTable, matchRow.rowNumber);

  const homeTeam = getRowObjectByIdScorecard_(teamsTable, 'team_id', match.home_team_id);
  const awayTeam = getRowObjectByIdScorecard_(teamsTable, 'team_id', match.away_team_id);

  const playersById = {};
  playersTable.rows.forEach(r => {
    const obj = rowToObjectScorecard_(playersTable, r.rowNumber);
    if (obj && obj.player_id) {
      playersById[String(obj.player_id).trim()] = obj;
    }
  });

  const games = gamesTable.rows
    .map(r => rowToObjectScorecard_(gamesTable, r.rowNumber))
    .filter(g => g && g.match_id && String(g.match_id).trim() === String(matchId).trim())
    .sort((a, b) => {
      const roundCompare = Number(a.round_number || 0) - Number(b.round_number || 0);
      if (roundCompare !== 0) return roundCompare;
      return Number(a.game_number_in_round || 0) - Number(b.game_number_in_round || 0);
    })
    .map(game => ({
      ...game,
      home_player_1_name: getPlayerNameScorecard_(playersById, game.home_player_1_id),
      home_player_2_name: getPlayerNameScorecard_(playersById, game.home_player_2_id),
      away_player_1_name: getPlayerNameScorecard_(playersById, game.away_player_1_id),
      away_player_2_name: getPlayerNameScorecard_(playersById, game.away_player_2_id)
    }));

  let rounds = roundsTable.rows
    .map(r => rowToObjectScorecard_(roundsTable, r.rowNumber))
    .filter(r => r && r.match_id && String(r.match_id).trim() === String(matchId).trim())
    .sort((a, b) => Number(a.round_number || 0) - Number(b.round_number || 0));

  // Fallback: build rounds from Match_Games if Match_Rounds is empty
  if (!rounds.length && games.length) {
    const roundMap = {};

    games.forEach(game => {
      const roundKey = String(game.round_id || 'ROUND_' + String(game.round_number || '1')).trim();
      const roundNumber = Number(game.round_number || 1);

      if (!roundMap[roundKey]) {
        roundMap[roundKey] = {
          round_id: roundKey,
          match_id: matchId,
          round_number: roundNumber,
          status: 'pending',
          home_games_won: 0,
          away_games_won: 0,
          winning_team_id: '',
          games: []
        };
      }

      roundMap[roundKey].games.push(game);
    });

    rounds = Object.values(roundMap)
      .sort((a, b) => Number(a.round_number || 0) - Number(b.round_number || 0))
      .map(round => {
        let homeWins = 0;
        let awayWins = 0;
        let completedGames = 0;

        round.games.forEach(game => {
          const hasScore = game.home_score !== '' && game.home_score != null &&
                           game.away_score !== '' && game.away_score != null;

          if (hasScore) completedGames++;

          if (String(game.winner_team_id).trim() === String(match.home_team_id).trim()) homeWins++;
          if (String(game.winner_team_id).trim() === String(match.away_team_id).trim()) awayWins++;
        });

        let status = 'pending';
        if (completedGames > 0 && completedGames < round.games.length) status = 'in_progress';
        if (round.games.length > 0 && completedGames === round.games.length) status = 'completed';

        let winningTeamId = '';
        if (status === 'completed') {
          if (homeWins > awayWins) winningTeamId = match.home_team_id;
          if (awayWins > homeWins) winningTeamId = match.away_team_id;
        }

        return {
          ...round,
          status,
          home_games_won: homeWins,
          away_games_won: awayWins,
          winning_team_id: winningTeamId
        };
      });
  } else {
    rounds = rounds.map(round => {
      const roundGames = games.filter(
        g => String(g.round_id || '').trim() === String(round.round_id || '').trim()
      );

      return {
        ...round,
        games: roundGames
      };
    });
  }

  Logger.log('getScorecardDataV2 matchId=' + matchId + ' rounds=' + rounds.length + ' games=' + games.length);

  return {
    match: {
      ...match,
      home_team_name: homeTeam ? homeTeam.team_name : match.home_team_id,
      away_team_name: awayTeam ? awayTeam.team_name : match.away_team_id
    },
    rounds: rounds
  };
}

function saveGameScoreFromUiV2(payload) {
  return recordGameScoreV2(
    payload.gameId,
    payload.homeScore,
    payload.awayScore,
    payload.userId || '',
    payload.reason || 'Entered from scorecard UI'
  );
}

function recordGameScoreV2(gameId, homeScore, awayScore, changedByUserId, reason) {
  const ss = getBackendSpreadsheet_();

  const gamesSheet = ss.getSheetByName('Match_Games');
  const roundsSheet = ss.getSheetByName('Match_Rounds');
  const matchesSheet = ss.getSheetByName('Matches');

  if (!gamesSheet || !roundsSheet || !matchesSheet) {
    throw new Error('One or more required sheets are missing.');
  }

  validateScoreInputsV2_(gameId, homeScore, awayScore);

  const now = new Date();

  const gamesTable = getTableScorecard_(gamesSheet);
  const roundsTable = getTableScorecard_(roundsSheet);
  const matchesTable = getTableScorecard_(matchesSheet);

  const gameRow = findRowByIdScorecard_(gamesTable, 'game_id', gameId);
  if (!gameRow) throw new Error('Game not found: ' + gameId);

  const homeTeamId = gameRow.values[gamesTable.headerMap.home_team_id - 1];
  const awayTeamId = gameRow.values[gamesTable.headerMap.away_team_id - 1];
  const roundId = gameRow.values[gamesTable.headerMap.round_id - 1];
  const matchId = gameRow.values[gamesTable.headerMap.match_id - 1];

  const winnerTeamId = Number(homeScore) > Number(awayScore) ? homeTeamId : awayTeamId;

  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'home_score', Number(homeScore));
  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'away_score', Number(awayScore));
  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'winner_team_id', winnerTeamId);
  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'status', 'completed');

  if (gamesTable.headerMap.score_entered_by_user_id) {
    setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'score_entered_by_user_id', changedByUserId || '');
  }
  if (gamesTable.headerMap.score_entered_at) {
    setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'score_entered_at', now);
  }
  if (gamesTable.headerMap.updated_at) {
    setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'updated_at', now);
  }

  const roundSummary = recalculateRoundFromGamesV2_(roundsSheet, gamesSheet, roundId, matchId);
  const matchSummary = recalculateMatchFromRoundsV2_(matchesSheet, roundsSheet, matchId);

  try { refreshAllSummaries_(); } catch (e) { /* don't fail score save if rollup throws */ }

  return {
    success: true,
    game_id: gameId,
    round_id: roundId,
    match_id: matchId,
    round: roundSummary,
    match: matchSummary,
    reason: reason || ''
  };
}

function recalculateRoundFromGamesV2_(roundsSheet, gamesSheet, roundId, matchId) {
  const roundsTable = getTableScorecard_(roundsSheet);
  const gamesTable = getTableScorecard_(gamesSheet);

  const roundRow = findRowByIdScorecard_(roundsTable, 'round_id', roundId);
  if (!roundRow) throw new Error('Round not found: ' + roundId);

  const roundObj = rowToObjectScorecard_(roundsTable, roundRow.rowNumber);
  const homeTeamId = getHomeTeamIdForMatchV2_(matchId);
  const awayTeamId = getAwayTeamIdForMatchV2_(matchId);

  const roundGames = gamesTable.rows
    .map(r => rowToObjectScorecard_(gamesTable, r.rowNumber))
    .filter(g => g && String(g.round_id).trim() === String(roundId).trim());

  let homeWins = 0;
  let awayWins = 0;
  let completedGames = 0;

  roundGames.forEach(g => {
    const hasScore = g.home_score !== '' && g.home_score != null && g.away_score !== '' && g.away_score != null;
    if (hasScore) completedGames++;

    if (String(g.winner_team_id).trim() === String(homeTeamId).trim()) homeWins++;
    if (String(g.winner_team_id).trim() === String(awayTeamId).trim()) awayWins++;
  });

  const expectedGameCount = Number(roundObj.expected_game_count || roundGames.length || 0);

  let winningTeamId = '';
  if (completedGames >= expectedGameCount && expectedGameCount > 0) {
    if (homeWins > awayWins) winningTeamId = homeTeamId;
    if (awayWins > homeWins) winningTeamId = awayTeamId;
  }

  let status = 'pending';
  if (completedGames > 0 && completedGames < expectedGameCount) status = 'in_progress';
  if (expectedGameCount > 0 && completedGames >= expectedGameCount) status = 'completed';

  if (roundsTable.headerMap.home_games_won) {
    setCellByHeaderScorecard_(roundsSheet, roundsTable.headerMap, roundRow.rowNumber, 'home_games_won', homeWins);
  }
  if (roundsTable.headerMap.away_games_won) {
    setCellByHeaderScorecard_(roundsSheet, roundsTable.headerMap, roundRow.rowNumber, 'away_games_won', awayWins);
  }
  if (roundsTable.headerMap.winning_team_id) {
    setCellByHeaderScorecard_(roundsSheet, roundsTable.headerMap, roundRow.rowNumber, 'winning_team_id', winningTeamId);
  }
  if (roundsTable.headerMap.status) {
    setCellByHeaderScorecard_(roundsSheet, roundsTable.headerMap, roundRow.rowNumber, 'status', status);
  }

  return {
    round_id: roundId,
    home_games_won: homeWins,
    away_games_won: awayWins,
    winning_team_id: winningTeamId,
    status: status
  };
}

function recalculateMatchFromRoundsV2_(matchesSheet, roundsSheet, matchId) {
  const matchesTable = getTableScorecard_(matchesSheet);
  const roundsTable = getTableScorecard_(roundsSheet);

  const matchRow = findRowByIdScorecard_(matchesTable, 'match_id', matchId);
  if (!matchRow) throw new Error('Match not found: ' + matchId);

  const matchObj = rowToObjectScorecard_(matchesTable, matchRow.rowNumber);
  const homeTeamId = matchObj.home_team_id;
  const awayTeamId = matchObj.away_team_id;

  const REG = (typeof MATCH_SCORING !== 'undefined' && MATCH_SCORING.REGULATION_ROUNDS) || 8;
  const WIN_REG = (typeof MATCH_SCORING !== 'undefined' && MATCH_SCORING.GAMES_TO_WIN_REGULATION) || 17;
  const WIN_OVERALL = (typeof MATCH_SCORING !== 'undefined' && MATCH_SCORING.GAMES_TO_WIN_OVERALL) || 18;

  const matchRounds = roundsTable.rows
    .map(r => rowToObjectScorecard_(roundsTable, r.rowNumber))
    .filter(r => r && String(r.match_id).trim() === String(matchId).trim());

  let homeRoundsWon = 0;
  let awayRoundsWon = 0;
  let homeRegGames = 0;
  let awayRegGames = 0;
  let homeSdbGames = 0;
  let awaySdbGames = 0;
  let regulationRoundsComplete = true;
  let hasAnyActivity = false;

  matchRounds.forEach(r => {
    const rn = Number(r.round_number);
    const isReg = rn <= REG;
    const isComplete = String(r.status).trim() === 'completed' || String(r.status).trim().toLowerCase() === 'complete';
    const hGames = Number(r.home_games_won || 0);
    const aGames = Number(r.away_games_won || 0);

    if (isReg) {
      if (!isComplete) regulationRoundsComplete = false;
      homeRegGames += hGames;
      awayRegGames += aGames;
      if (String(r.winning_team_id).trim() === String(homeTeamId).trim()) homeRoundsWon++;
      if (String(r.winning_team_id).trim() === String(awayTeamId).trim()) awayRoundsWon++;
    } else {
      homeSdbGames += hGames;
      awaySdbGames += aGames;
    }

    if (hGames > 0 || aGames > 0 || isComplete) hasAnyActivity = true;
  });

  const homeTotalGames = homeRegGames + homeSdbGames;
  const awayTotalGames = awayRegGames + awaySdbGames;

  let winningTeamId = '';
  if (homeRegGames >= WIN_REG && homeRegGames > awayRegGames) {
    winningTeamId = homeTeamId;
  } else if (awayRegGames >= WIN_REG && awayRegGames > homeRegGames) {
    winningTeamId = awayTeamId;
  } else if (regulationRoundsComplete && homeRegGames === 16 && awayRegGames === 16) {
    if (homeTotalGames >= WIN_OVERALL && homeTotalGames > awayTotalGames) winningTeamId = homeTeamId;
    else if (awayTotalGames >= WIN_OVERALL && awayTotalGames > homeTotalGames) winningTeamId = awayTeamId;
  }

  let status = 'pending';
  if (hasAnyActivity && !winningTeamId) status = 'in_progress';
  if (winningTeamId) status = 'completed';

  if (matchesTable.headerMap.home_rounds_won) {
    setCellByHeaderScorecard_(matchesSheet, matchesTable.headerMap, matchRow.rowNumber, 'home_rounds_won', homeRoundsWon);
  }
  if (matchesTable.headerMap.away_rounds_won) {
    setCellByHeaderScorecard_(matchesSheet, matchesTable.headerMap, matchRow.rowNumber, 'away_rounds_won', awayRoundsWon);
  }
  if (matchesTable.headerMap.home_games_won) {
    setCellByHeaderScorecard_(matchesSheet, matchesTable.headerMap, matchRow.rowNumber, 'home_games_won', homeTotalGames);
  }
  if (matchesTable.headerMap.away_games_won) {
    setCellByHeaderScorecard_(matchesSheet, matchesTable.headerMap, matchRow.rowNumber, 'away_games_won', awayTotalGames);
  }
  if (matchesTable.headerMap.winning_team_id) {
    setCellByHeaderScorecard_(matchesSheet, matchesTable.headerMap, matchRow.rowNumber, 'winning_team_id', winningTeamId);
  }
  if (matchesTable.headerMap.status) {
    setCellByHeaderScorecard_(matchesSheet, matchesTable.headerMap, matchRow.rowNumber, 'status', status);
  }

  return {
    match_id: matchId,
    home_rounds_won: homeRoundsWon,
    away_rounds_won: awayRoundsWon,
    home_games_won: homeTotalGames,
    away_games_won: awayTotalGames,
    winning_team_id: winningTeamId,
    status: status
  };
}

function getHomeTeamIdForMatchV2_(matchId) {
  const ss = getBackendSpreadsheet_();
  const sheet = ss.getSheetByName('Matches');
  const table = getTableScorecard_(sheet);
  const row = findRowByIdScorecard_(table, 'match_id', matchId);
  if (!row) throw new Error('Match not found: ' + matchId);
  return row.values[table.headerMap.home_team_id - 1];
}

function getAwayTeamIdForMatchV2_(matchId) {
  const ss = getBackendSpreadsheet_();
  const sheet = ss.getSheetByName('Matches');
  const table = getTableScorecard_(sheet);
  const row = findRowByIdScorecard_(table, 'match_id', matchId);
  if (!row) throw new Error('Match not found: ' + matchId);
  return row.values[table.headerMap.away_team_id - 1];
}

function getRowObjectByIdScorecard_(table, idHeader, idValue) {
  const row = findRowByIdScorecard_(table, idHeader, idValue);
  return row ? rowToObjectScorecard_(table, row.rowNumber) : null;
}

function getPlayerNameScorecard_(playersById, playerId) {
  if (!playerId) return '';
  return playersById[String(playerId).trim()]?.name || String(playerId).trim();
}

function validateScoreInputsV2_(gameId, homeScore, awayScore) {
  if (!gameId) throw new Error('gameId is required.');
  if (homeScore === '' || homeScore === null || homeScore === undefined) throw new Error('homeScore is required.');
  if (awayScore === '' || awayScore === null || awayScore === undefined) throw new Error('awayScore is required.');
  if (isNaN(homeScore) || isNaN(awayScore)) throw new Error('Scores must be numeric.');
  if (Number(homeScore) < 0 || Number(awayScore) < 0) throw new Error('Scores cannot be negative.');
  if (Number(homeScore) === Number(awayScore)) throw new Error('Ties are not allowed.');
}

function getTableScorecard_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Sheet is empty: ' + sheet.getName());

  const headers = values[0].map(h => String(h || '').trim());
  const headerMap = {};
  headers.forEach((h, i) => {
    if (h) headerMap[h] = i + 1;
  });

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    rows.push({
      rowNumber: i + 1,
      values: values[i]
    });
  }

  return { headers, headerMap, rows };
}

function findRowByIdScorecard_(table, idHeader, idValue) {
  const col = table.headerMap[idHeader];
  if (!col) throw new Error('Missing column: ' + idHeader);
  return table.rows.find(r => String(r.values[col - 1]).trim() === String(idValue).trim()) || null;
}

function rowToObjectScorecard_(table, rowNumber) {
  const row = table.rows.find(r => r.rowNumber === rowNumber);
  if (!row) return null;

  const obj = {};
  table.headers.forEach((h, i) => {
    if (h) obj[h] = row.values[i];
  });
  return obj;
}

function setCellByHeaderScorecard_(sheet, headerMap, rowNumber, headerName, value) {
  const col = headerMap[headerName];
  if (!col) throw new Error('Missing column "' + headerName + '" on sheet "' + sheet.getName() + '"');
  sheet.getRange(rowNumber, col).setValue(value);
}

function testMatchesLoadV2() {
  const data = getOpenMatchesForScoreEntryV2();
  Logger.log(JSON.stringify(data.slice(0, 10), null, 2));
}

function getOpenMatchesForScoreEntryV4() {
  const rows = getOpenMatchesForScoreEntryV2();
  return {
    ok: true,
    source: 'getOpenMatchesForScoreEntryV4',
    rows: rows
  };
}

function getScorecardDataV4(matchId) {
  return getScorecardDataV2(matchId);
}

function saveGameScoreFromUiV4(payload) {
  return saveGameScoreFromUiV2(payload);
}

function getOpenMatchesForScoreEntryV5() {
  const rows = getOpenMatchesForScoreEntryV2();
  return JSON.stringify({
    ok: true,
    source: 'getOpenMatchesForScoreEntryV5',
    rows: rows
  });
}

function getScorecardDataV5(matchId) {
  const data = getScorecardDataV2(matchId);
  return JSON.stringify(data);
}



function getPlayerGendersV1() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Players');
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  const nameCol   = headers.indexOf('name');
  const genderCol = headers.indexOf('gender');
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const name   = String(rows[i][nameCol]   || '').trim();
    const gender = String(rows[i][genderCol] || '').trim().toLowerCase();
    if (name) map[name] = gender; // 'w' or 'm'
  }
  return JSON.stringify(map);
}

function saveGameScoreFromUiV5(payload) {
  const result = saveGameScoreFromUiV2(payload);
  return JSON.stringify({
    ok: true,
    source: 'saveGameScoreFromUiV5',
    result: result
  });
}

function testMatchesLoadV5() {
  const raw = getOpenMatchesForScoreEntryV5();
  Logger.log(raw);
}

function testScorecardDataV2() {
  const data = getScorecardDataV2('MATCH_W1_DIV1');
  Logger.log('rounds=' + data.rounds.length);
  Logger.log('first round=' + JSON.stringify(data.rounds[0], null, 2));
}

/**
 * Clears a game's scores and recomputes round/match aggregates.
 * payload: { gameId, userId?, reason? }
 */
function resetGameScoreV1(payload) {
  const { gameId, userId, reason } = payload || {};
  if (!gameId) throw new Error('gameId is required.');

  const ss           = getBackendSpreadsheet_();
  const gamesSheet   = ss.getSheetByName('Match_Games');
  const roundsSheet  = ss.getSheetByName('Match_Rounds');
  const matchesSheet = ss.getSheetByName('Matches');
  if (!gamesSheet || !roundsSheet || !matchesSheet)
    throw new Error('Required sheets not found.');

  const gamesTable = getTableScorecard_(gamesSheet);
  const gameRow    = findRowByIdScorecard_(gamesTable, 'game_id', gameId);
  if (!gameRow) throw new Error('Game not found: ' + gameId);

  const roundId = gameRow.values[gamesTable.headerMap.round_id - 1];
  const matchId = gameRow.values[gamesTable.headerMap.match_id - 1];
  const now     = new Date();

  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'home_score',     '');
  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'away_score',     '');
  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'winner_team_id', '');
  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'status',         'pending');
  if (gamesTable.headerMap.updated_at)
    setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, 'updated_at', now);

  const roundSummary = recalculateRoundFromGamesV2_(roundsSheet, gamesSheet, roundId, matchId);
  const matchSummary = recalculateMatchFromRoundsV2_(matchesSheet, roundsSheet, matchId);

  return JSON.stringify({
    ok: true,
    source: 'resetGameScoreV1',
    result: { game_id: gameId, round_id: roundId, match_id: matchId, round: roundSummary, match: matchSummary }
  });
}

// League logo Drive file ID — defined here so it's always in scope regardless of which
// script files are included in this GAS project.
const SCORECARD_LEAGUE_LOGO_FILE_ID = '1PA1pVhADGrUO4aIn1pz6srSwI50r41EZ';

function getScorecardBrandingV1() {
  const branding = getBranding_ ? getBranding_() : {};
  const fallbackLogoUrl = SCORECARD_LEAGUE_LOGO_FILE_ID ? driveImageUrl_(SCORECARD_LEAGUE_LOGO_FILE_ID) : '';
  return JSON.stringify({
    leagueTitle:   'Connecticut Pickleball League',
    subtitle:      'Official Match Score Entry',
    leagueLogoUrl: branding.leagueLogoUrl || fallbackLogoUrl,
    campLogoUrl:   branding.campLogoUrl   || '',
    dillLogoUrl:   branding.dillLogoUrl   || '',
    clubLogos:     branding.clubLogos     || {}
  });
}

/**
 * Updates a player slot in a game mid-match.
 * payload: { gameId, position ('home_1'|'home_2'|'away_1'|'away_2'), newPlayerName, matchId }
 */
function savePlayerSubstitutionV1(payload) {
  const { gameId, position, newPlayerName } = payload;
  if (!gameId || !position || !newPlayerName) throw new Error('gameId, position, and newPlayerName are required.');

  const ss         = getBackendSpreadsheet_();
  const gamesSheet = ss.getSheetByName('Match_Games');
  const playersSheet = ss.getSheetByName('Players');
  if (!gamesSheet)   throw new Error('Match_Games sheet not found.');
  if (!playersSheet) throw new Error('Players sheet not found.');

  const gamesTable   = getTableScorecard_(gamesSheet);
  const playersTable = getTableScorecard_(playersSheet);
  const gameRow      = findRowByIdScorecard_(gamesTable, 'game_id', gameId);
  if (!gameRow) throw new Error('Game not found: ' + gameId);

  // Resolve player name → player_id
  const nameLower = String(newPlayerName).trim().toLowerCase();
  let playerId = '';
  for (const r of playersTable.rows) {
    const obj = rowToObjectScorecard_(playersTable, r.rowNumber);
    if (obj && String(obj.name || '').trim().toLowerCase() === nameLower) {
      playerId = String(obj.player_id).trim();
      break;
    }
  }
  if (!playerId) throw new Error('Player not found: ' + newPlayerName);

  const colMap = {
    home_1: 'home_player_1_id',
    home_2: 'home_player_2_id',
    away_1: 'away_player_1_id',
    away_2: 'away_player_2_id'
  };
  const col = colMap[position];
  if (!col) throw new Error('Unknown position: ' + position);

  setCellByHeaderScorecard_(gamesSheet, gamesTable.headerMap, gameRow.rowNumber, col, playerId);

  return JSON.stringify({ ok: true, gameId, position, playerId, playerName: newPlayerName });
}

/**
 * Creates a Super Dreambreaker game appended to the match.
 * payload: { matchId, homePlayerName, awayPlayerName }
 */
function createDreambreakerGameV1(payload) {
  const { matchId, homePlayerName, awayPlayerName } = payload;
  if (!matchId || !homePlayerName || !awayPlayerName)
    throw new Error('matchId, homePlayerName, and awayPlayerName are required.');

  const ss           = getBackendSpreadsheet_();
  const gamesSheet   = ss.getSheetByName('Match_Games');
  const roundsSheet  = ss.getSheetByName('Match_Rounds');
  const matchesSheet = ss.getSheetByName('Matches');
  const playersSheet = ss.getSheetByName('Players');
  if (!gamesSheet || !roundsSheet || !matchesSheet || !playersSheet)
    throw new Error('Required sheets not found.');

  const matchesTable = getTableScorecard_(matchesSheet);
  const gamesTable   = getTableScorecard_(gamesSheet);
  const roundsTable  = getTableScorecard_(roundsSheet);
  const playersTable = getTableScorecard_(playersSheet);

  const matchRow = findRowByIdScorecard_(matchesTable, 'match_id', matchId);
  if (!matchRow) throw new Error('Match not found: ' + matchId);
  const match = rowToObjectScorecard_(matchesTable, matchRow.rowNumber);

  // Resolve player names → IDs
  function resolvePlayer_(name) {
    const nl = String(name).trim().toLowerCase();
    for (const r of playersTable.rows) {
      const obj = rowToObjectScorecard_(playersTable, r.rowNumber);
      if (obj && String(obj.name || '').trim().toLowerCase() === nl) return String(obj.player_id).trim();
    }
    throw new Error('Player not found: ' + name);
  }

  const homePlayerId = resolvePlayer_(homePlayerName);
  const awayPlayerId = resolvePlayer_(awayPlayerName);

  // Find or create the dreambreaker round (highest round number + 1)
  const existingRounds = roundsTable.rows
    .map(r => rowToObjectScorecard_(roundsTable, r.rowNumber))
    .filter(r => r && String(r.match_id).trim() === String(matchId).trim());
  const maxRound = existingRounds.reduce((m, r) => Math.max(m, Number(r.round_number || 0)), 0);
  const dbRoundNumber = maxRound + 1;
  const dbRoundId     = matchId + '_R' + dbRoundNumber + '_DB';

  // Determine next game number
  const existingGames = gamesTable.rows
    .map(r => rowToObjectScorecard_(gamesTable, r.rowNumber))
    .filter(g => g && String(g.match_id).trim() === String(matchId).trim());
  const maxGame = existingGames.reduce((m, g) => Math.max(m, Number(g.game_number_in_round || 0)), 0);
  const dbGameId = matchId + '_R' + dbRoundNumber + '_G1_DB';

  const now = new Date();

  // Append round row
  const roundHeaders = roundsTable.headers;
  const roundValues  = roundHeaders.map(h => {
    if (h === 'round_id')       return dbRoundId;
    if (h === 'match_id')       return matchId;
    if (h === 'round_number')   return dbRoundNumber;
    if (h === 'round_type')     return 'super_dreambreaker';
    if (h === 'status')         return 'pending';
    if (h === 'home_games_won') return 0;
    if (h === 'away_games_won') return 0;
    if (h === 'created_at' || h === 'updated_at') return now;
    return '';
  });
  roundsSheet.appendRow(roundValues);

  // Append game row
  const gameHeaders = gamesTable.headers;
  const gameValues  = gameHeaders.map(h => {
    if (h === 'game_id')              return dbGameId;
    if (h === 'match_id')             return matchId;
    if (h === 'round_id')             return dbRoundId;
    if (h === 'round_number')         return dbRoundNumber;
    if (h === 'game_number_in_round') return 1;
    if (h === 'game_type')            return 'super_dreambreaker';
    if (h === 'home_team_id')         return match.home_team_id;
    if (h === 'away_team_id')         return match.away_team_id;
    if (h === 'home_player_1_id')     return homePlayerId;
    if (h === 'away_player_1_id')     return awayPlayerId;
    if (h === 'status')               return 'pending';
    if (h === 'created_at' || h === 'updated_at') return now;
    return '';
  });
  gamesSheet.appendRow(gameValues);

  return JSON.stringify({ ok: true, roundId: dbRoundId, gameId: dbGameId });
}