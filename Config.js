const SHEETS = {
  DIVISIONS: 'Divisions',
  CLUBS: 'Clubs',
  TEAMS: 'Teams',
  USERS: 'Users',
  USER_ACCESS: 'User_Access',
  PLAYERS: 'Players',
  TEAM_ROSTERS: 'Team_Rosters',
  SEASONS: 'Seasons',
  MATCHES: 'Matches',
  MATCH_ROUNDS: 'Match_Rounds',
  MATCH_GAMES: 'Match_Games',
  MATCH_SUBMISSIONS: 'Match_Submissions',
  MATCH_FORMAT_TEMPLATES: 'Match_Format_Templates',
  LINEUP_VALIDATION_RULES: 'Lineup_Validation_Rules',
  MATCH_PLAYER_AVAILABILITY: 'Match_Player_Availability',
  STANDINGS_SUMMARY: 'Standings_Summary',
  PLAYER_STATS_SUMMARY: 'Player_Stats_Summary',
  PAIRING_STATS_SUMMARY: 'Pairing_Stats_Summary',
  AUDIT_LOG: 'Audit_Log',
  REQUESTS: 'Requests',
  README: 'README'
};

const BACKEND_SPREADSHEET_ID = '1DRiZ-xraXY9J1Bp09U3Rxg0qx943Apj8guBy1fd5jJ8';

function getBackendSpreadsheet_() {
  return SpreadsheetApp.openById(BACKEND_SPREADSHEET_ID);
}

// Google OAuth Client ID — used by GIS (Google Identity Services) sign-in
// in Captain.html / Scorecard.html. Backend verifies tokens against this
// audience claim. Public; no need to keep secret.
const GOOGLE_OAUTH_CLIENT_ID = '250461385382-o1jcqvvkom51s3l8qim8te5frr3ju52h.apps.googleusercontent.com';

const ROLE = {
  COMMISSIONER: 'commissioner',
  DIRECTOR: 'director',
  CAPTAIN: 'captain'
};

const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  LINEUP_OPEN: 'lineup_open',
  LINEUP_LOCKED: 'lineup_locked',
  LIVE: 'live',
  COMPLETED: 'completed',
  FINALIZED: 'finalized',
  CANCELED: 'canceled'
};

const MATCH_SCORING = {
  REGULATION_ROUNDS: 8,
  GAMES_TO_WIN_REGULATION: 17,
  GAMES_TO_WIN_OVERALL: 18
};

const SUBMISSION_STATUS = {
  NOT_SUBMITTED: 'not_submitted',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  LOCKED: 'locked',
  OVERRIDDEN: 'overridden'
};

const ROUND_STATUS = {
  INACTIVE: 'inactive',
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'completed'
};

const GAME_STATUS = {
  NOT_STARTED: 'not_started',
  LINEUP_PARTIAL: 'lineup_partial',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'completed',
  VOID: 'void'
};