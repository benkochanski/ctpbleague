function seedCaptainPortalTestData() {
  setupWorkbook_();

  const email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('No active user email found. Make sure you are running this from your own authorized Google account.');
  }

  seedDivisions_();
  seedClubs_();
  seedTeams_();
  seedSeason_();
  seedUsersAndAccess_(email);
  seedPlayers_();
  seedRosters_();
  seedTemplates_();

  const existingMatch = getObjects_(SHEETS.MATCHES).find(m => m.match_id === 'MATCH_TEST_001');
  if (!existingMatch) {
    appendObjects_(SHEETS.MATCHES, [{
      match_id: 'MATCH_TEST_001',
      season_id: 'SEASON2026',
      division_id: 'DIV1',
      home_team_id: 'TEAM_CAMP_DIV1',
      away_team_id: 'TEAM_DILL_DIV1',
      match_date: '2026-04-18',
      start_time: '14:00',
      venue: 'Test Venue',
      status: MATCH_STATUS.SCHEDULED,
      away_lineup_due_at: '2026-04-17 14:00',
      home_lineup_due_at: '2026-04-18 13:00',
      away_submission_status: SUBMISSION_STATUS.NOT_SUBMITTED,
      home_submission_status: SUBMISSION_STATUS.NOT_SUBMITTED,
      public_visibility_status: 'hidden',
      home_rounds_won: 0,
      away_rounds_won: 0,
      super_dreambreaker_played: false,
      winning_team_id: '',
      notes: 'Seeded test match'
    }]);

    generateRoundsAndGamesForMatch_('MATCH_TEST_001');
  }

  return {
    ok: true,
    email,
    message: 'Test data seeded. Open the web app with ?page=captain'
  };
}

function seedDivisions_() {
  const rows = getObjects_(SHEETS.DIVISIONS);
  const needed = [
    { division_id: 'DIV1', division_name: 'Division 1', division_order: 1, match_template_id: 'MT_DIV1', active: true }
  ];
  appendMissingByKey_(SHEETS.DIVISIONS, rows, needed, 'division_id');
}

function seedClubs_() {
  const rows = getObjects_(SHEETS.CLUBS);
  const needed = [
    { club_id: 'CLUB_CAMP', club_name: 'Camp Pickleball', short_name: 'CAMP', logo_url: '', active: true },
    { club_id: 'CLUB_DILL', club_name: 'Dill Dinkers', short_name: 'DILL', logo_url: '', active: true }
  ];
  appendMissingByKey_(SHEETS.CLUBS, rows, needed, 'club_id');
}

function seedTeams_() {
  const rows = getObjects_(SHEETS.TEAMS);
  const needed = [
    { team_id: 'TEAM_CAMP_DIV1', team_name: 'Camp Division 1', club_id: 'CLUB_CAMP', division_id: 'DIV1', active: true },
    { team_id: 'TEAM_DILL_DIV1', team_name: 'Dill Division 1', club_id: 'CLUB_DILL', division_id: 'DIV1', active: true }
  ];
  appendMissingByKey_(SHEETS.TEAMS, rows, needed, 'team_id');
}

function seedSeason_() {
  const rows = getObjects_(SHEETS.SEASONS);
  const needed = [
    { season_id: 'SEASON2026', season_name: 'Spring 2026', start_date: '2026-04-01', end_date: '2026-06-30', status: 'active' }
  ];
  appendMissingByKey_(SHEETS.SEASONS, rows, needed, 'season_id');
}

function seedUsersAndAccess_(email) {
  const users = getObjects_(SHEETS.USERS);
  const cleanEmail = String(email).toLowerCase();

  const existingRow = users.find(u =>
    String(u.email).toLowerCase() === cleanEmail &&
    u.role_type === ROLE.CAPTAIN &&
    u.team_id === 'TEAM_CAMP_DIV1'
  );

  if (!existingRow) {
    const userId = users.find(u => String(u.email).toLowerCase() === cleanEmail)
      ? users.find(u => String(u.email).toLowerCase() === cleanEmail).user_id
      : 'USR_TEST_CAPTAIN';

    appendObjects_(SHEETS.USERS, [{
      user_id: userId,
      full_name: 'Test Captain',
      email: email,
      active: true,
      pin: '',
      role_type: ROLE.CAPTAIN,
      team_id: 'TEAM_CAMP_DIV1',
      club_id: ''
    }]);
  }
}

function seedPlayers_() {
  const rows = getObjects_(SHEETS.PLAYERS);

  const needed = [
    { player_id: 'PLY001', first_name: 'Jane',  last_name: 'Smith',  full_name: 'Jane Smith',  gender: 'F', dupr: 4.10, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY002', first_name: 'Sarah', last_name: 'Jones',  full_name: 'Sarah Jones', gender: 'F', dupr: 4.00, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY003', first_name: 'Emily', last_name: 'Brown',  full_name: 'Emily Brown', gender: 'F', dupr: 3.90, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY004', first_name: 'Megan', last_name: 'White',  full_name: 'Megan White', gender: 'F', dupr: 3.80, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY005', first_name: 'Mike',  last_name: 'Taylor', full_name: 'Mike Taylor', gender: 'M', dupr: 4.20, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY006', first_name: 'Chris', last_name: 'Hall',   full_name: 'Chris Hall',  gender: 'M', dupr: 4.00, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY007', first_name: 'Adam',  last_name: 'Young',  full_name: 'Adam Young',  gender: 'M', dupr: 3.95, dupr_id: '', email: '', phone: '', active: true, notes: '' },
    { player_id: 'PLY008', first_name: 'Luke',  last_name: 'Green',  full_name: 'Luke Green',  gender: 'M', dupr: 3.85, dupr_id: '', email: '', phone: '', active: true, notes: '' }
  ];

  appendMissingByKey_(SHEETS.PLAYERS, rows, needed, 'player_id');
}

function seedRosters_() {
  const rows = getObjects_(SHEETS.TEAM_ROSTERS);

  const needed = [
    'PLY001','PLY002','PLY003','PLY004','PLY005','PLY006','PLY007','PLY008'
  ].map((playerId, i) => ({
    roster_id: `ROS_TEST_${String(i + 1).padStart(3, '0')}`,
    season_id: 'SEASON2026',
    team_id: 'TEAM_CAMP_DIV1',
    player_id: playerId,
    roster_status: 'eligible',
    available: true,
    active: true,
    start_date: '2026-04-01',
    end_date: '',
    notes: ''
  }));

  appendMissingByCompositeKey_(SHEETS.TEAM_ROSTERS, rows, needed, ['season_id', 'team_id', 'player_id']);
}

function seedTemplates_() {
  const rows = getObjects_(SHEETS.MATCH_FORMAT_TEMPLATES);

  const needed = [
    ['TMP101','MT_DIV1',1,'regulation',1,'womens'],
    ['TMP102','MT_DIV1',1,'regulation',2,'coed'],
    ['TMP103','MT_DIV1',1,'regulation',3,'coed'],
    ['TMP104','MT_DIV1',1,'regulation',4,'coed'],
    ['TMP105','MT_DIV1',2,'regulation',1,'mixed'],
    ['TMP106','MT_DIV1',2,'regulation',2,'coed'],
    ['TMP107','MT_DIV1',2,'regulation',3,'coed'],
    ['TMP108','MT_DIV1',2,'regulation',4,'coed'],
    ['TMP109','MT_DIV1',3,'regulation',1,'womens'],
    ['TMP110','MT_DIV1',3,'regulation',2,'coed'],
    ['TMP111','MT_DIV1',3,'regulation',3,'coed'],
    ['TMP112','MT_DIV1',3,'regulation',4,'coed'],
    ['TMP113','MT_DIV1',4,'regulation',1,'mixed'],
    ['TMP114','MT_DIV1',4,'regulation',2,'coed'],
    ['TMP115','MT_DIV1',4,'regulation',3,'coed'],
    ['TMP116','MT_DIV1',4,'regulation',4,'coed'],
    ['TMP117','MT_DIV1',5,'regulation',1,'womens'],
    ['TMP118','MT_DIV1',5,'regulation',2,'coed'],
    ['TMP119','MT_DIV1',5,'regulation',3,'coed'],
    ['TMP120','MT_DIV1',5,'regulation',4,'coed'],
    ['TMP121','MT_DIV1',6,'regulation',1,'mixed'],
    ['TMP122','MT_DIV1',6,'regulation',2,'coed'],
    ['TMP123','MT_DIV1',6,'regulation',3,'coed'],
    ['TMP124','MT_DIV1',6,'regulation',4,'coed'],
    ['TMP125','MT_DIV1',7,'regulation',1,'womens'],
    ['TMP126','MT_DIV1',7,'regulation',2,'coed'],
    ['TMP127','MT_DIV1',7,'regulation',3,'coed'],
    ['TMP128','MT_DIV1',7,'regulation',4,'coed'],
    ['TMP129','MT_DIV1',8,'regulation',1,'mixed'],
    ['TMP130','MT_DIV1',8,'regulation',2,'coed'],
    ['TMP131','MT_DIV1',8,'regulation',3,'coed'],
    ['TMP132','MT_DIV1',8,'regulation',4,'coed'],
    ['TMP133','MT_DIV1',9,'super_dreambreaker',1,'mixed'],
    ['TMP134','MT_DIV1',9,'super_dreambreaker',2,'coed'],
    ['TMP135','MT_DIV1',9,'super_dreambreaker',3,'coed']
  ].map(r => ({
    template_row_id: r[0],
    match_template_id: r[1],
    round_number: r[2],
    round_type: r[3],
    game_number_in_round: r[4],
    game_type: r[5]
  }));

  appendMissingByKey_(SHEETS.MATCH_FORMAT_TEMPLATES, rows, needed, 'template_row_id');
}

function appendMissingByKey_(sheetName, existingRows, neededRows, keyField) {
  const existingKeys = new Set(existingRows.map(r => String(r[keyField] || '')));
  const toAdd = neededRows.filter(r => !existingKeys.has(String(r[keyField] || '')));
  if (toAdd.length) appendObjects_(sheetName, toAdd);
}

function appendMissingByCompositeKey_(sheetName, existingRows, neededRows, keyFields) {
  const makeKey = obj => keyFields.map(k => String(obj[k] || '')).join('|');
  const existingKeys = new Set(existingRows.map(makeKey));
  const toAdd = neededRows.filter(r => !existingKeys.has(makeKey(r)));
  if (toAdd.length) appendObjects_(sheetName, toAdd);
}