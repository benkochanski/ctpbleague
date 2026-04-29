// ─────────────────────────────────────────────────────────────────────────────
//  Player Page — Server-side data functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a flat list of active players with their current team,
 * grouped-friendly for the selector dropdown.
 */
function getPlayerListV1() {
  const players = getObjects_(SHEETS.PLAYERS);

  return players.map(p => {
    const pid      = String(p.player_id || '').trim();
    const fullName = String(p.name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '').trim();
    const duprRaw  = p.registered_dupr ?? p.dupr ?? null;
    const teamName = stripDivisionSuffix_(String(p.club || p.team_name || '').trim());

    return {
      player_id: pid,
      full_name: fullName,
      gender:    String(p.gender || '').trim(),
      dupr:      duprRaw != null ? Number(duprRaw) : null,
      team_id:   '',
      team_name: teamName
    };
  }).filter(p => p.full_name && p.player_id);
}


/**
 * Returns full player data for the Player Stats page:
 *   player        – profile info
 *   gamelog       – enriched list of every completed game
 *   brand         – league branding
 */
function getPlayerPageData(playerId) {
  const cleanId = String(playerId || '').trim();
  if (!cleanId) throw new Error('Missing playerId');

  // ── Load all sheets ──────────────────────────────────────────────────────
  const allPlayers  = getObjects_(SHEETS.PLAYERS);
  const allGames    = getObjects_(SHEETS.MATCH_GAMES);
  const allMatches  = getObjects_(SHEETS.MATCHES);
  const allSeasons  = getObjects_(SHEETS.SEASONS);
  const allRosters  = getObjects_(SHEETS.TEAM_ROSTERS);
  const allTeams    = getObjects_(SHEETS.TEAMS);
  const allClubs    = getObjects_(SHEETS.CLUBS);

  // ── Lookup maps ──────────────────────────────────────────────────────────
  const playerMap = {};
  allPlayers.forEach(p => {
    const id = String(p.player_id || '').trim();
    if (!id) return;
    playerMap[id] = String(
      p.name || p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      id
    ).trim();
  });

  const seasonMap = {};
  allSeasons.forEach(s => {
    const id = String(s.season_id || '').trim();
    if (id) seasonMap[id] = String(s.season_name || id).trim();
  });

  const matchMap = {};
  allMatches.forEach(m => {
    const id = String(m.match_id || '').trim();
    if (id) matchMap[id] = m;
  });

  const teamMap = {};
  allTeams.forEach(t => {
    const id = String(t.team_id || '').trim();
    if (id) teamMap[id] = t;
  });

  const clubMap = {};
  allClubs.forEach(c => {
    const id = String(c.club_id || '').trim();
    if (id) clubMap[id] = c;
  });

  // ── Player record ────────────────────────────────────────────────────────
  const player = allPlayers.find(p => String(p.player_id || '').trim() === cleanId);
  if (!player) throw new Error('Player not found: ' + cleanId);

  // Determine current team via most recent active roster entry
  const myRosters = allRosters
    .filter(r => String(r.player_id || '').trim() === cleanId && normalizeBool_(r.active))
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));

  const latestRoster = myRosters[0] || null;
  const myTeam  = latestRoster ? teamMap[String(latestRoster.team_id || '').trim()] : null;
  // Strip "Division N" so the comparison succeeds whether the Players or
  // Teams sheet stores the club with or without the suffix.
  const playerClubName = stripDivisionSuffix_(String(player.club || player.team_name || '').trim());
  const teamClubId = myTeam ? String(myTeam.club_id || '').trim() : '';
  const myClub = myTeam
    ? (clubMap[teamClubId] || allClubs.find(c => {
        const cname = stripDivisionSuffix_(String(c.club_name || c.short_name || '').trim()).toLowerCase();
        const tname = stripDivisionSuffix_(String(myTeam.team_name || '').trim()).toLowerCase();
        return cname && tname && (tname === cname || tname.includes(cname) || cname.includes(tname));
      }))
    : allClubs.find(c => {
        const cn = stripDivisionSuffix_(String(c.club_name || c.short_name || '').trim()).toLowerCase();
        const pn = playerClubName.toLowerCase();
        return cn && pn && (cn === pn || pn.includes(cn) || cn.includes(pn));
      });
  const logoId  = myClub
    ? String(myClub.logo_id || myClub.logo_file_id || myClub.logo_url || '').trim()
    : '';

  // ── Find all completed games for this player ─────────────────────────────
  const myGames = allGames.filter(g => {
    if (!String(g.winner_team_id || '').trim()) return false;
    const ids = [g.home_player_1_id, g.home_player_2_id, g.away_player_1_id, g.away_player_2_id];
    return ids.some(id => String(id || '').trim() === cleanId);
  });

  // ── Build enriched gamelog ───────────────────────────────────────────────
  const gamelog = myGames.map(g => {
    const match    = matchMap[String(g.match_id || '').trim()] || {};
    const seasonId = String(match.season_id || '').trim();

    const isHome =
      String(g.home_player_1_id || '').trim() === cleanId ||
      String(g.home_player_2_id || '').trim() === cleanId;

    let partnerId, opp1Id, opp2Id, myTeamId, oppTeamId;

    if (isHome) {
      partnerId  = String(g.home_player_1_id || '').trim() === cleanId
        ? String(g.home_player_2_id || '').trim()
        : String(g.home_player_1_id || '').trim();
      opp1Id     = String(g.away_player_1_id || '').trim();
      opp2Id     = String(g.away_player_2_id || '').trim();
      myTeamId   = String(match.home_team_id || '').trim();
      oppTeamId  = String(match.away_team_id || '').trim();
    } else {
      partnerId  = String(g.away_player_1_id || '').trim() === cleanId
        ? String(g.away_player_2_id || '').trim()
        : String(g.away_player_1_id || '').trim();
      opp1Id     = String(g.home_player_1_id || '').trim();
      opp2Id     = String(g.home_player_2_id || '').trim();
      myTeamId   = String(match.away_team_id || '').trim();
      oppTeamId  = String(match.home_team_id || '').trim();
    }

    const myScore  = isHome ? Number(g.home_score || 0) : Number(g.away_score || 0);
    const oppScore = isHome ? Number(g.away_score  || 0) : Number(g.home_score || 0);
    const won      = String(g.winner_team_id || '').trim() === myTeamId;

    const myTeamObj  = teamMap[myTeamId]  || {};
    const oppTeamObj = teamMap[oppTeamId] || {};

    return {
      game_id:            String(g.game_id || '').trim(),
      match_id:           String(g.match_id || '').trim(),
      season_id:          seasonId,
      season_name:        seasonMap[seasonId] || seasonId,
      match_date:         String(match.match_date || '').trim(),
      division_id:        String(match.division_id || '').trim(),
      game_type:          String(g.game_type || '').trim().toLowerCase(),
      round_number:       Number(g.round_number || 0),
      game_number_in_round: Number(g.game_number_in_round || 0),
      partner_id:         partnerId,
      partner_name:       playerMap[partnerId] || partnerId || '',
      opp1_id:            opp1Id,
      opp1_name:          playerMap[opp1Id]    || opp1Id    || '',
      opp2_id:            opp2Id,
      opp2_name:          playerMap[opp2Id]    || opp2Id    || '',
      my_score:           myScore,
      opp_score:          oppScore,
      won:                won,
      diff:               myScore - oppScore,
      my_team_id:         myTeamId,
      my_team_name:       stripDivisionSuffix_(String(myTeamObj.team_name  || myTeamId  || '').trim()),
      opp_team_id:        oppTeamId,
      opp_team_name:      stripDivisionSuffix_(String(oppTeamObj.team_name || oppTeamId || '').trim())
    };
  }).sort((a, b) => String(b.match_date).localeCompare(String(a.match_date)));

  return {
    player: {
      player_id:     cleanId,
      full_name:     String(player.name || player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ') || '').trim(),
      gender:        String(player.gender || '').trim(),
      dupr:          (player.registered_dupr ?? player.dupr) != null ? Number(player.registered_dupr ?? player.dupr) : null,
      team_id:       myTeam ? String(myTeam.team_id  || '').trim() : '',
      team_name:     stripDivisionSuffix_(myTeam ? String(myTeam.team_name || '').trim() : playerClubName),
      team_logo_url: driveImageUrl_(logoId)
    },
    gamelog,
    brand: {
      leagueLogoUrl: driveImageUrl_(LEAGUE_LOGO_FILE_ID),
      leagueTitle:   'Connecticut Pickleball League'
    }
  };
}
