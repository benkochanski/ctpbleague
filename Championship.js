// Championship week builder.
//
// Turns the 5 placeholder MATCH_PLAYOFF_DIVn rows (the chronological 7th week)
// into a real, scorekeepable "Championship" round:
//   • assigns teams  — Dill hosts all divisions (home = Dill, away = Camp)
//   • sets start times (D1/D2/D5 = 12:00, D3/D4 = 15:00, mirroring the season)
//   • clears the placeholder "TBD" venue
//   • generates the rounds + games from each division's format template
//
// Safe to run more than once: it re-asserts the team/time cells every run, but
// only builds rounds/games for a match that doesn't already have them, so a
// second run won't duplicate the scorecard.
//
// HOW TO RUN: open the Apps Script editor and run buildChampionshipWeek once.
// It writes directly to the live sheet — there is only one workbook.
function buildChampionshipWeek() {
  // Championship schedule — staggered across the weekend (shared courts):
  //   Sat 6/13 — D1 12:00, D4 3:00 PM, D2 6:00 PM
  //   Sun 6/14 — D5 12:00, D3 3:00 PM
  const CONFIG = [
    { div: 'DIV1', date: '2026-06-13', start: '12:00' },
    { div: 'DIV2', date: '2026-06-13', start: '18:00' },
    { div: 'DIV3', date: '2026-06-14', start: '15:00' },
    { div: 'DIV4', date: '2026-06-13', start: '15:00' },
    { div: 'DIV5', date: '2026-06-14', start: '12:00' },
  ];

  const sh = getSheet_(SHEETS.MATCHES);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const colIdx = name => headers.indexOf(name);

  const builtRoundMatchIds = new Set(
    getObjects_(SHEETS.MATCH_ROUNDS).map(r => String(r.match_id).trim())
  );

  const log = [];

  CONFIG.forEach(({ div, date, start }) => {
    const matchId = 'MATCH_PLAYOFF_' + div;
    const home = 'TEAM2_DILL_' + div; // Dill hosts all
    const away = 'TEAM1_CAMP_' + div;

    // Find the row (1-based row number, including the header row).
    let rowNum = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colIdx('match_id')]).trim() === matchId) { rowNum = i + 1; break; }
    }
    if (rowNum === -1) { log.push('SKIP — no Matches row for ' + matchId); return; }

    // Write match_date as a real Date (script-tz midnight) so it matches the
    // other rows; D3 moves Sat→Sun, the rest re-assert their existing day.
    const [yr, mo, dy] = date.split('-').map(Number);
    const matchDate = new Date(yr, mo - 1, dy);
    const dueAt = date + ' ' + start; // e.g. "2026-06-14 15:00"

    const setCell = (name, val) => {
      const c = colIdx(name);
      if (c >= 0) sh.getRange(rowNum, c + 1).setValue(val);
    };
    setCell('home_team_id', home);
    setCell('away_team_id', away);
    setCell('match_date', matchDate);
    setCell('start_time', start);
    setCell('venue', '');            // drop the placeholder "TBD"
    setCell('away_lineup_due_at', dueAt);
    setCell('home_lineup_due_at', dueAt);

    // Make the team writes visible to generateRoundsAndGamesForMatch_'s fresh read.
    SpreadsheetApp.flush();

    if (builtRoundMatchIds.has(matchId)) {
      log.push('teams/time set — scorecard already built for ' + matchId);
      return;
    }

    generateRoundsAndGamesForMatch_(matchId);
    log.push('BUILT ' + matchId + ' — ' + home + ' (home) vs ' + away + ' @ ' + start);
  });

  // Bust read caches so the hub + pages show the championship immediately.
  try {
    CacheService.getScriptCache().removeAll([
      'publicSiteData_v7', 'homeSiteData_v1', 'allmatches_v1', 'openmatches_v5',
    ]);
  } catch (e) {}
  try {
    invalidateWorkerKv_([{ page: 'allmatches' }, { page: 'openmatches' }]);
  } catch (e) {}

  const summary = log.join('\n');
  Logger.log(summary);
  return summary;
}
