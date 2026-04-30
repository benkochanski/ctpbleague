// ── Season Stats API ──────────────────────────────────────────────────────
function testPlayers() {
  Logger.log(JSON.stringify(getObjects_(SHEETS.PLAYERS)));
}

function getSeasonDivisionsV1() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const rows    = ss.getSheetByName('Divisions').getDataRange().getValues();
  const h       = rows[0];
  const idIdx   = h.indexOf('division_id');
  const nameIdx = h.indexOf('division_name');
  const actIdx  = h.indexOf('active');

  const divs = rows.slice(1)
    .filter(r => String(r[actIdx]).toLowerCase() === 'true')
    .map(r => ({ key: String(r[idIdx]), label: String(r[nameIdx]) }));

  return JSON.stringify(divs);
}


function getSeasonDataV1(divisionKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Active season ──────────────────────────────────────────────────────
  const seasRows = ss.getSheetByName('Seasons').getDataRange().getValues();
  const sH = seasRows[0];
  const activeSeason = seasRows.slice(1).find(r =>
    String(r[sH.indexOf('status')]).toLowerCase() === 'active'
  );
  const seasonId = activeSeason ? String(activeSeason[sH.indexOf('season_id')]) : null;

  // ── Teams in this division ─────────────────────────────────────────────
  const teamRows = ss.getSheetByName('Teams').getDataRange().getValues();
  const tH = teamRows[0];
  const divTeams = {};      // stripped (for display)
  const divTeamsFull = {};  // unstripped (for logo keyword matching)
  teamRows.slice(1)
    .filter(r => String(r[tH.indexOf('division_id')]) === divisionKey
              && String(r[tH.indexOf('active')]).toLowerCase() === 'true')
    .forEach(r => {
      const tid = String(r[tH.indexOf('team_id')]);
      const fullName = String(r[tH.indexOf('team_name')]);
      divTeams[tid]     = stripDivisionSuffix_(fullName);
      divTeamsFull[tid] = fullName;
    });

  // All teams (regardless of active flag) — used for name resolution in matches
  const allTeamNames = {};
  const allTeamNamesFull = {};
  teamRows.slice(1).forEach(r => {
    const tid = String(r[tH.indexOf('team_id')]);
    const fullName = String(r[tH.indexOf('team_name')]);
    allTeamNames[tid]     = stripDivisionSuffix_(fullName);
    allTeamNamesFull[tid] = fullName;
  });

  // ── Match IDs + match list for this division/season ────────────────────
  const matchRows = ss.getSheetByName('Matches').getDataRange().getValues();
  const mH = matchRows[0];
  const mIdIdx     = mH.indexOf('match_id');
  const mDivIdx    = mH.indexOf('division_id');
  const mSeasonIdx = mH.indexOf('season_id');
  const mDateIdx   = mH.indexOf('match_date');
  const mTimeIdx   = mH.indexOf('start_time');
  const mStatusIdx = mH.indexOf('status');
  const mHomeIdx   = mH.indexOf('home_team_id');
  const mAwayIdx   = mH.indexOf('away_team_id');
  const mHGWIdx    = mH.indexOf('home_games_won');
  const mAGWIdx    = mH.indexOf('away_games_won');
  const mWinIdx    = mH.indexOf('winning_team_id');

  // Helper: normalize match_date to ISO yyyy-mm-dd string regardless of source
  // (sheet may return native Date object, or string in various formats).
  // Use Utilities.formatDate with the spreadsheet timezone for Date objects so
  // that midnight-UTC dates don't shift one day early in ET.
  const tz_ = Session.getScriptTimeZone() || 'America/New_York';
  const toIsoDate_ = v => {
    if (!v) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      return Utilities.formatDate(v, tz_, 'yyyy-MM-dd');
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
      const [mo, da, yr] = s.split('/');
      const y = yr.length === 2 ? `20${yr}` : yr;
      return `${y}-${mo.padStart(2,'0')}-${da.padStart(2,'0')}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, tz_, 'yyyy-MM-dd');
    }
    return s;
  };

  const divMatches = matchRows.slice(1)
    .filter(r => String(r[mDivIdx]) === divisionKey
              && (!seasonId || String(r[mSeasonIdx]) === seasonId))
    .map(r => {
      const homeId = String(r[mHomeIdx] || '');
      const awayId = String(r[mAwayIdx] || '');
      return {
        match_id:        String(r[mIdIdx] || ''),
        match_date:      toIsoDate_(r[mDateIdx]),
        start_time:      String(r[mTimeIdx] || ''),
        status:          String(r[mStatusIdx] || '').toLowerCase(),
        home_team_id:    homeId,
        away_team_id:    awayId,
        home_team_name:  allTeamNames[homeId] || homeId || '',
        away_team_name:  allTeamNames[awayId] || awayId || '',
        home_games_won:  Number(r[mHGWIdx]) || 0,
        away_games_won:  Number(r[mAGWIdx]) || 0,
        winning_team_id: String(r[mWinIdx] || ''),
      };
    });

  const divMatchIds = new Set(divMatches.map(m => m.match_id));
  // Map for in-place enrichment of per-match game tallies during the
  // Match_Games pass below (the Matches sheet often has empty score cells).
  const divMatchById_ = {};
  divMatches.forEach(m => { divMatchById_[m.match_id] = { home: 0, away: 0, ref: m }; });

  // ── Players lookup (name + optional gender) ────────────────────────────
  const plyrRows = ss.getSheetByName('Players').getDataRange().getValues();
  const plH = plyrRows[0];
  const plGenderIdx = plH.indexOf('gender');  // -1 if column doesn't exist
  const playerNames  = {};
  const playerGender = {};
  plyrRows.slice(1).forEach(r => {
    const pid = String(r[plH.indexOf('player_id')]);
    playerNames[pid]  = String(r[plH.indexOf('name')]);
    if (plGenderIdx >= 0) playerGender[pid] = String(r[plGenderIdx]).toLowerCase().trim();
  });

  // ── Read Match_Games once — drives both team and player stats ──────────
  const gameRows = ss.getSheetByName('Match_Games').getDataRange().getValues();
  const gH = gameRows[0];
  const gMatchIdx = gH.indexOf('match_id');
  const gTypeIdx  = gH.indexOf('game_type');
  const gHomeIdx  = gH.indexOf('home_team_id');
  const gAwayIdx  = gH.indexOf('away_team_id');
  const gHScIdx   = gH.indexOf('home_score');
  const gAScIdx   = gH.indexOf('away_score');
  const gWinIdx   = gH.indexOf('winner_team_id');
  const gHP1Idx   = gH.indexOf('home_player_1_id');
  const gHP2Idx   = gH.indexOf('home_player_2_id');
  const gAP1Idx   = gH.indexOf('away_player_1_id');
  const gAP2Idx   = gH.indexOf('away_player_2_id');

  // Initialise team type accumulators
  const typeStats = {};
  Object.keys(divTeams).forEach(tid => {
    typeStats[tid] = {
      womens_w:0, womens_diff:0, mens_w:0, mens_diff:0,
      mixed_w:0,  mixed_diff:0,  coed_w:0, coed_diff:0,
    };
  });

  // Initialise player accumulators
  const psMap = {};
  const teamMatchSets = {};  // tid → Set of match_ids (for team_match_count)
  const VALID_TYPES = new Set(['womens','mens','mixed','coed']);

  const initPs = (pid, teamId) => ({
    team_id:       teamId,
    wins:          0, losses:        0,
    points_for:    0, points_against:0,
    womens_w:0, womens_l:0, womens_diff:0,
    mens_w:0,   mens_l:0,   mens_diff:0,
    mixed_w:0,  mixed_l:0,  mixed_diff:0,
    coed_w:0,   coed_l:0,   coed_diff:0,
    matchIds:   new Set(),
    gameTypes:  new Set(),
  });

  // Single pass over Match_Games
  gameRows.slice(1).forEach(r => {
    const matchId = String(r[gMatchIdx]);
    if (!divMatchIds.has(matchId)) return;

    const hs  = Number(r[gHScIdx]);
    const as_ = Number(r[gAScIdx]);
    if (r[gHScIdx] === '' || r[gAScIdx] === '' || isNaN(hs) || isNaN(as_)) return;

    const gt      = String(r[gTypeIdx]).toLowerCase();
    const home    = String(r[gHomeIdx]);
    const away    = String(r[gAwayIdx]);
    const winner  = String(r[gWinIdx]);
    const homeWon = winner === home;
    const validGt = VALID_TYPES.has(gt);

    // Per-match game tallies (used to fill in match-level scores)
    const _t = divMatchById_[matchId];
    if (_t) {
      if (homeWon) _t.home++; else _t.away++;
    }

    // ── Team stats ─────────────────────────────────────────────────────
    if (validGt) {
      if (typeStats[home]) {
        if (homeWon) typeStats[home][gt+'_w']++;
        typeStats[home][gt+'_diff'] += hs - as_;
      }
      if (typeStats[away]) {
        if (!homeWon) typeStats[away][gt+'_w']++;
        typeStats[away][gt+'_diff'] += as_ - hs;
      }
    }

    // Track team-level match counts
    if (!teamMatchSets[home]) teamMatchSets[home] = new Set();
    if (!teamMatchSets[away]) teamMatchSets[away] = new Set();
    teamMatchSets[home].add(matchId);
    teamMatchSets[away].add(matchId);

    // ── Player stats ───────────────────────────────────────────────────
    const accum = (pid, teamId, won, pf, pa) => {
      if (!psMap[pid]) psMap[pid] = initPs(pid, teamId);
      const ps = psMap[pid];
      if (won) ps.wins++; else ps.losses++;
      ps.points_for     += pf;
      ps.points_against += pa;
      ps.matchIds.add(matchId);
      if (validGt) {
        ps.gameTypes.add(gt);
        if (won) ps[gt+'_w']++; else ps[gt+'_l']++;
        ps[gt+'_diff'] += pf - pa;
      }
    };

    [r[gHP1Idx], r[gHP2Idx]].map(String)
      .filter(p => p && p !== '' && p.toLowerCase() !== 'undefined')
      .forEach(pid => accum(pid, home,  homeWon, hs,  as_));

    [r[gAP1Idx], r[gAP2Idx]].map(String)
      .filter(p => p && p !== '' && p.toLowerCase() !== 'undefined')
      .forEach(pid => accum(pid, away, !homeWon, as_,  hs));
  });

  // ── Apply per-match tallies (overrides empty sheet score cells) ────────
  Object.values(divMatchById_).forEach(({ home, away, ref }) => {
    if (home + away === 0) return; // no games yet — match is upcoming
    if (!ref.home_games_won)  ref.home_games_won = home;
    if (!ref.away_games_won)  ref.away_games_won = away;
    if (!ref.winning_team_id) {
      if (home > away) ref.winning_team_id = ref.home_team_id;
      else if (away > home) ref.winning_team_id = ref.away_team_id;
    }
  });

  // ── Standings_Summary (match W/L and ranking) ──────────────────────────
  const stRows = ss.getSheetByName('Standings_Summary').getDataRange().getValues();
  const stH    = stRows[0];
  const stByTeam = {};
  stRows.slice(1)
    .filter(r => String(r[stH.indexOf('division_id')]) === divisionKey
              && (!seasonId || String(r[stH.indexOf('season_id')]) === seasonId))
    .forEach(r => {
      const tid = String(r[stH.indexOf('team_id')]);
      stByTeam[tid] = {
        matches_won:    Number(r[stH.indexOf('match_wins')])     || 0,
        matches_lost:   Number(r[stH.indexOf('match_losses')])   || 0,
        standings_rank: Number(r[stH.indexOf('standings_rank')]) || 99,
      };
    });

  const standings = Object.keys(divTeams).map(tid => ({
    team_name:      divTeams[tid],
    team_name_full: divTeamsFull[tid] || divTeams[tid],
    matches_won:    (stByTeam[tid] || {}).matches_won   || 0,
    matches_lost:   (stByTeam[tid] || {}).matches_lost  || 0,
    standings_rank: (stByTeam[tid] || {}).standings_rank || 99,
    ...(typeStats[tid] || {}),
  })).sort((a, b) => a.standings_rank - b.standings_rank || b.matches_won - a.matches_won);

  // ── Build playerStats from accumulated psMap ───────────────────────────
  const totalRounds = divMatchIds.size;  // each match = one "round"

  const playerStats = Object.entries(psMap)
    .filter(([, ps]) => ps.wins > 0 || ps.losses > 0)
    .map(([pid, ps]) => {
      const gms         = ps.wins + ps.losses;
      const teamMatches = teamMatchSets[ps.team_id]?.size || 1;

      // Gender: Players sheet column first, then infer from game types played
      const g = playerGender[pid] || '';
      const isWomensGender = ['f','female','w','woman','women'].includes(g);
      const isMensGender   = ['m','male','man','men'].includes(g);
      const isWomens = isWomensGender || (!g && ps.gameTypes.has('womens'));
      const isMens   = isMensGender   || (!g && !ps.gameTypes.has('womens') && ps.gameTypes.has('mens'));

      // Qualified: appeared in ≥ 50% of the division's rounds
      const qualified = totalRounds > 0 && (ps.matchIds.size / totalRounds) >= 0.5;

      // Rating: blended Win% + Pts% (0–100 scale)
      const winPct = gms > 0 ? ps.wins / gms : 0;
      const ptsPct = gms > 0 ? Math.min(ps.points_for / (21 * gms), 1) : 0;
      const rating = (winPct + ptsPct) / 2 * 100;

      // Per-type: null = player never played that type (hides the cell)
      const hasType = t => ps[t+'_w'] + ps[t+'_l'] > 0;

      return {
        name:            playerNames[pid] || pid,
        team_name:       divTeams[ps.team_id] || ps.team_id,
        team_name_full:  divTeamsFull[ps.team_id] || divTeams[ps.team_id] || ps.team_id,
        wins:            ps.wins,
        losses:          ps.losses,
        points_for:      ps.points_for,
        points_against:  ps.points_against,
        rating:          rating,
        qualified:       qualified,
        team_match_count: teamMatches,
        isWomens,
        isMens,
        womens_w: hasType('womens') ? ps.womens_w : null, womens_l: ps.womens_l, womens_diff: ps.womens_diff,
        mens_w:   hasType('mens')   ? ps.mens_w   : null, mens_l:   ps.mens_l,   mens_diff:   ps.mens_diff,
        mixed_w:  hasType('mixed')  ? ps.mixed_w  : null, mixed_l:  ps.mixed_l,  mixed_diff:  ps.mixed_diff,
        coed_w:   hasType('coed')   ? ps.coed_w   : null, coed_l:   ps.coed_l,   coed_diff:   ps.coed_diff,
      };
    });

  return JSON.stringify({ standings, playerStats, matches: divMatches });

}