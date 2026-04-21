function getSchemaMap_() {
  return {
    [SHEETS.DIVISIONS]: [
      'division_id', 'division_name', 'division_order', 'match_template_id', 'active'
    ],
    [SHEETS.CLUBS]: [
      'club_id', 'club_name', 'short_name', 'logo_url', 'active'
    ],
    [SHEETS.TEAMS]: [
      'team_id', 'team_name', 'club_id', 'division_id', 'active'
    ],
    [SHEETS.USERS]: [
      'user_id', 'full_name', 'email', 'active'
    ],
    [SHEETS.USER_ACCESS]: [
      'access_id', 'user_id', 'role_type', 'club_id', 'team_id', 'active'
    ],
    [SHEETS.PLAYERS]: [
      'player_id', 'first_name', 'last_name', 'full_name', 'gender', 'dupr', 'dupr_id', 'email', 'phone', 'active', 'notes'
    ],
    [SHEETS.TEAM_ROSTERS]: [
      'roster_id', 'season_id', 'team_id', 'player_id', 'roster_status', 'available', 'active', 'start_date', 'end_date', 'notes'
    ],
    [SHEETS.SEASONS]: [
      'season_id', 'season_name', 'start_date', 'end_date', 'status'
    ],
    [SHEETS.MATCHES]: [
      'match_id', 'season_id', 'division_id', 'home_team_id', 'away_team_id', 'match_date', 'start_time', 'venue',
      'status', 'away_lineup_due_at', 'home_lineup_due_at',
      'away_submission_status', 'home_submission_status', 'public_visibility_status',
      'home_rounds_won', 'away_rounds_won', 'home_games_won', 'away_games_won', 'super_dreambreaker_played', 'winning_team_id', 'notes'
    ],
    [SHEETS.MATCH_ROUNDS]: [
      'round_id', 'match_id', 'round_number', 'round_type', 'expected_game_count',
      'home_games_won', 'away_games_won', 'winning_team_id', 'status'
    ],
    [SHEETS.MATCH_GAMES]: [
      'game_id', 'match_id', 'round_id', 'round_number', 'round_type', 'game_number_in_round', 'game_sequence',
      'court_number', 'game_type', 'home_team_id', 'away_team_id',
      'home_player_1_id', 'home_player_2_id', 'away_player_1_id', 'away_player_2_id',
      'home_score', 'away_score', 'winner_team_id', 'status',
      'lineup_submitted_home', 'lineup_submitted_away',
      'score_entered_by_user_id', 'score_entered_at', 'updated_at'
    ],
    [SHEETS.MATCH_SUBMISSIONS]: [
      'submission_id', 'match_id', 'team_id', 'submitted_by_user_id', 'submitted_at',
      'submission_type', 'submission_status', 'is_visible_to_opponent',
      'is_visible_to_public', 'officially_submitted', 'notes'
    ],
    [SHEETS.MATCH_FORMAT_TEMPLATES]: [
      'template_row_id', 'match_template_id', 'round_number', 'round_type', 'game_number_in_round', 'game_type'
    ],
    [SHEETS.LINEUP_VALIDATION_RULES]: [
      'rule_id', 'division_id', 'game_type', 'rule_name', 'rule_value', 'active'
    ],
    [SHEETS.MATCH_PLAYER_AVAILABILITY]: [
      'availability_id', 'match_id', 'team_id', 'player_id', 'available', 'reported_by_user_id', 'reported_at', 'notes'
    ],
    [SHEETS.STANDINGS_SUMMARY]: [
      'season_id', 'division_id', 'team_id', 'matches_played', 'match_wins', 'match_losses',
      'rounds_won', 'rounds_lost', 'games_won', 'games_lost',
      'points_for', 'points_against', 'point_diff', 'standings_rank'
    ],
    [SHEETS.PLAYER_STATS_SUMMARY]: [
      'season_id', 'division_id', 'team_id', 'player_id', 'games_played', 'wins', 'losses',
      'points_for', 'points_against', 'point_diff',
      'mens_games', 'womens_games', 'mixed_games', 'coed_games'
    ],
    [SHEETS.PAIRING_STATS_SUMMARY]: [
      'season_id', 'division_id', 'team_id', 'player_1_id', 'player_2_id',
      'total_games_together', 'mens_games_together', 'womens_games_together',
      'mixed_games_together', 'coed_games_together'
    ],
    [SHEETS.AUDIT_LOG]: [
      'audit_id', 'entity_type', 'entity_id', 'action_type',
      'old_value_json', 'new_value_json', 'changed_by_user_id', 'changed_at', 'reason'
    ],
    [SHEETS.README]: [
      'section', 'notes'
    ]
  };
}

function ensureSchema_() {
  const ss = getSpreadsheet_();
  const schema = getSchemaMap_();

  Object.keys(schema).forEach(sheetName => {
    let sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);

    const headers = schema[sheetName];
    const existing = sh.getLastColumn() > 0
      ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String)
      : [];

    const same =
      existing.length === headers.length &&
      existing.every((h, i) => h === headers[i]);

    if (!same) {
      sh.clear();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  });
}

function resetSheetToSchema_(sheetName) {
  const schema = getSchemaMap_();
  const headers = schema[sheetName];
  if (!headers) throw new Error(`No schema found for ${sheetName}`);

  const sh = getSheet_(sheetName);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function setupWorkbook_() {
  ensureSchema_();
}