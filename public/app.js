(() => {
  'use strict';

  // GAS web app — single deployment, anonymous access. Captain/Scorecard
  // pages identify the user via Google Identity Services (client-side sign-in)
  // and pass a verified ID token to the backend. See Auth.js.
  const GAS_PROD    = 'https://script.google.com/macros/s/AKfycbzuzujnOWumYMPb64hQw6LCiAGPVqDd79WnBQa8X6ZabAxrNUhVVAHfHYJnCKvxlBvD/exec';
  const GAS_STAGING = 'https://script.google.com/macros/s/AKfycbzjVryG88l3GHDqTglfeB9UmN8Ju6VYU_YVADWCwdMi5WQhomJhFramhpg1MZQHZKy-/exec';
  const IS_STAGING  = new URLSearchParams(location.search).get('staging') === '1';
  const GAS_BASE    = IS_STAGING ? GAS_STAGING : GAS_PROD;

  const ROUTES = {
    home:         { kind: 'page', label: 'ctpbleague.com',    onEnter: renderHome },
    matches:      { kind: 'page', label: 'Matches',           onEnter: renderMatches },
    standings:    { kind: 'page', label: 'Standings',         onEnter: renderStandings },
    rules:        { kind: 'page', label: 'Rules & Handbook' },
    registration: { kind: 'page', label: 'Registration' },
    feedback:     { kind: 'iframe', label: 'Feedback',        url: `${GAS_BASE}?page=request` },
    requests:     { kind: 'iframe', label: 'Request Manager', url: `${GAS_BASE}?page=requestadmin` },
    notfound:     { kind: 'page', label: 'Page Not Found',    hidden: true },

    seasonstats:  { kind: 'iframe', label: 'Season Stats',
                    url: `${GAS_BASE}?page=seasonstats`,
                    urlFn: divId => `${GAS_BASE}?page=seasonstats${divId ? `&division=${encodeURIComponent(divId)}` : ''}` },
    players:      { kind: 'iframe', label: 'Players',         url: `${GAS_BASE}?page=players` },
    scoreboard:   { kind: 'iframe', label: 'Live Scoreboard',
                    urlFn: id => `${GAS_BASE}?page=scoreboard${id ? `&matchId=${encodeURIComponent(id)}` : ''}` },
    matchcast:    { kind: 'page',   label: 'Match Cast',    onEnter: renderMatchcast,   hidden: true },
    matchreport:  { kind: 'page',   label: 'Match Report',  onEnter: renderMatchreport, hidden: true },
    gamereport:   { kind: 'iframe', label: 'Game Report',     urlFn: id => `${GAS_BASE}?page=gamereport&matchId=${encodeURIComponent(id)}`, hidden: true },
    player:       { kind: 'iframe', label: 'Player Profile',  urlFn: name => `${GAS_BASE}?page=player&playerName=${encodeURIComponent(name || '')}`, hidden: true },

    // Admin = single entry point for league ops. Login happens once on the
    // admin landing page; from there the user picks Captain / Scorekeeping.
    // Routes are kept around so anything still linking to them works.
    admin:        { kind: 'newtab', label: 'Admin',             url: `${GAS_BASE}?page=admin`     },
    display:      { kind: 'iframe', label: 'Match Display',     url: `${GAS_BASE}?page=display`   },
    captain:      { kind: 'newtab', label: 'Captain / Lineups', url: `${GAS_BASE}?page=captain`,   hidden: true },
    scorecard:    { kind: 'newtab', label: 'Scorekeeping',      url: `${GAS_BASE}?page=scorecard`, hidden: true },
  };

  const app          = document.getElementById('app');
  const toggleBtn    = document.getElementById('toggleSidebar');
  const backdrop     = document.getElementById('backdrop');
  const iframe       = document.getElementById('appFrame');
  const iframeLoader = document.getElementById('iframeLoader');
  const brandSub     = document.getElementById('brandSub');

  const pages = Array.from(document.querySelectorAll('.page, .sc-page'));

  // ---------- Sidebar (drawer) ----------
  toggleBtn.addEventListener('click', () => app.classList.toggle('is-expanded'));
  backdrop.addEventListener('click', () => app.classList.remove('is-expanded'));

  // ---------- Navigation ----------
  function setActive(routeKey) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('is-active', el.dataset.route === routeKey);
    });
  }
  function showPage(routeKey) {
    pages.forEach(p => { p.style.display = (p.id === `page-${routeKey}`) ? '' : 'none'; });
    iframe.style.display = 'none';
    iframeLoader.classList.remove('is-visible');
    if (iframe.src && iframe.src !== 'about:blank') iframe.src = 'about:blank';
  }
  function showIframe(url) {
    pages.forEach(p => { p.style.display = 'none'; });
    iframe.style.display = 'block';
    if (iframe.src !== url) {
      iframeLoader.classList.add('is-visible');
      iframe.src = url;
    }
  }
  iframe.addEventListener('load', () => {
    if (iframe.src && iframe.src !== 'about:blank') iframeLoader.classList.remove('is-visible');
  });

  function navigate(routeKey, param) {
    const route = ROUTES[routeKey];
    if (!route) return navigate('notfound');

    // Stop live polling whenever we navigate away from matchcast
    if (_mcPollTimer) { clearInterval(_mcPollTimer); _mcPollTimer = null; }

    if (!route.hidden) setActive(routeKey);
    else if (routeKey === 'notfound') document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('is-active'));

    if (brandSub && route.label) brandSub.textContent = route.label;

    if (route.kind === 'page') {
      showPage(routeKey);
      if (route.onEnter) route.onEnter(param);
    } else if (route.kind === 'iframe') {
      const url = route.urlFn ? route.urlFn(param) : route.url;
      showIframe(url);
    } else if (route.kind === 'newtab') {
      const url = route.urlFn ? route.urlFn(param) : route.url;
      window.open(url, '_blank', 'noopener');
      // Don't update the iframe — keep the user on whatever page they were on.
      // But still close the drawer.
    }

    app.classList.remove('is-expanded');

    const hashTarget = param ? `#${routeKey}/${param}` : `#${routeKey}`;
    if (location.hash !== hashTarget) history.replaceState(null, '', hashTarget);
  }

  document.addEventListener('click', e => {
    const target = e.target.closest('[data-route]');
    if (!target) return;
    e.preventDefault();
    navigate(target.dataset.route, target.dataset.param);
  });

  window.addEventListener('hashchange', () => {
    const [key, param] = (location.hash || '#home').slice(1).split('/');
    if (ROUTES[key]) navigate(key, param);
  });

  // Cross-origin nav from iframed GAS pages (e.g., clicking a player name in
  // Season Stats opens the Player Profile inside the hub instead of a new tab).
  window.addEventListener('message', e => {
    const data = e.data;
    if (!data) return;

    if (data.type !== 'cpbl-nav' || !data.route) return;
    if (!ROUTES[data.route]) return;
    navigate(data.route, data.param);
  });

  // ==========================================================================
  //                           DATA + RENDERERS
  // ==========================================================================

  let publicData = null;
  let publicDataPromise = null;
  let _mcPollTimer = null;
  let _scBranding = null;
  let _scBrandingPromise = null;

  function fetchPublicData() {
    if (publicData) return Promise.resolve(publicData);
    if (publicDataPromise) return publicDataPromise;
    publicDataPromise = fetch(`${GAS_BASE}?page=publicdata`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { publicData = data; return data; })
      .catch(err => { publicDataPromise = null; throw err; });
    return publicDataPromise;
  }

  function resetPublicData() { publicData = null; publicDataPromise = null; }

  // ---- Helpers ----

  function indexBy(arr, key) {
    const map = {};
    (arr || []).forEach(item => { if (item[key]) map[item[key]] = item; });
    return map;
  }

  function teamName(teams, id) {
    const t = teams[id];
    return (t && t.team_name) || id || 'TBD';
  }

  function divisionName(divisions, id) {
    const d = divisions[id];
    return (d && d.division_name) || id || '';
  }

  function isCompleted(m) {
    if (typeof m === 'string') return m === 'completed' || m === 'finalized' || m === 'final';
    if (m && typeof m === 'object') {
      if (m.status === 'completed' || m.status === 'finalized' || m.status === 'final') return true;
      if (m.winning_team_id) return true;
      if ((Number(m.home_games_won) || 0) + (Number(m.away_games_won) || 0) > 0) return true;
    }
    return false;
  }

  function parseMatchDate(m) {
    // match_date may be ISO ("2026-04-21"), MM/DD/YYYY, or a stringified Date
    // ("Fri Apr 10 2026 …"). Fall back on direct Date parsing for the latter.
    const d = (m.match_date || '').trim();
    if (!d) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
      const t = (m.start_time || '').trim();
      const dt = new Date(`${d.slice(0,10)}${t ? `T${to24h(t)}` : 'T00:00:00'}`);
      return isNaN(dt.getTime()) ? null : dt;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(d)) {
      const [mo, da, yr] = d.split('/');
      const y = yr.length === 2 ? `20${yr}` : yr;
      const t = (m.start_time || '').trim();
      const dt = new Date(`${y}-${mo.padStart(2,'0')}-${da.padStart(2,'0')}${t ? `T${to24h(t)}` : 'T00:00:00'}`);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function to24h(s) {
    const m = /^(\d{1,2}):?(\d{0,2})\s*([ap]m)?$/i.exec(s.trim());
    if (!m) return '00:00:00';
    let h = Number(m[1]);
    const min = m[2] ? m[2].padStart(2,'0') : '00';
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${min}:00`;
  }

  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtDate(d) {
    if (!d || isNaN(d)) return '';
    return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
  }

  function fmtTime(d) {
    if (!d || isNaN(d)) return '';
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2,'0')} ${ap}`;
  }

  function weekKey(d) {
    if (!d || isNaN(d)) return 'unknown';
    const monday = new Date(d);
    const day = monday.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0,0,0,0);
    return monday.toISOString().slice(0, 10);
  }
  function weekLabel(key) {
    if (key === 'unknown') return 'Date TBD';
    const d = new Date(key);
    return `Week of ${MON[d.getMonth()]} ${d.getDate()}`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function errorCard(msg) {
    return `
      <div class="error-card">
        <h3>Couldn't load data</h3>
        <p>${escapeHtml(msg)}</p>
        <p class="error-hint">Make sure the Apps Script web app has been redeployed with the new <code>publicdata</code> route.</p>
        <button class="btn-gold" data-retry="1">Retry</button>
      </div>`;
  }

  // ---- Division filter wiring ----

  function populateDivisionFilter(selectEl, divisions) {
    // Keep first option (All divisions), replace the rest
    while (selectEl.options.length > 1) selectEl.remove(1);
    divisions
      .slice()
      .sort((a,b) => (a.division_order||0) - (b.division_order||0))
      .forEach(d => {
        const o = document.createElement('option');
        o.value = d.division_id;
        o.textContent = d.division_name;
        selectEl.appendChild(o);
      });
  }

  // ==========================================================================
  // HOME (upcoming + recent previews)
  // ==========================================================================

  async function renderHome() {
    const upcomingEl = document.getElementById('home-upcoming');
    const recentEl   = document.getElementById('home-recent');
    if (upcomingEl.dataset.loaded === '1' && recentEl.dataset.loaded === '1') return;

    let data;
    try {
      data = await fetchPublicData();
    } catch (err) {
      const msg = `<div class="empty-card">Couldn't load match data.</div>`;
      upcomingEl.innerHTML = msg;
      recentEl.innerHTML = msg;
      return;
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');
    const clubsById = indexBy(data.clubs || [], 'club_id');
    const teamLogo  = id => {
      const team = teamsById[id];
      if (!team) return '';
      const club = clubsById[team.club_id];
      return club?.logo_url || '';
    };
    // Override displayed date + time per league rules:
    //   D1–D4 play Saturdays; D5 plays Sundays.
    //   D1, D2, D5 start at 12 PM; D3, D4 start at 3 PM.
    // Snap each match to its week's Saturday/Sunday based on the Monday of week.
    const monOfHome = x => {
      const t = new Date(x); const day = t.getDay();
      t.setDate(t.getDate() + (day === 0 ? -6 : 1 - day));
      t.setHours(0,0,0,0);
      return t;
    };
    const enriched  = data.matches.map(m => {
      const _date = parseMatchDate(m);
      let _displayDate = null;
      if (_date) {
        const divName = divisionName(divsById, m.division_id);
        const divNum = (divName.match(/\d+/) || [''])[0];
        const dayOffset = divNum === '5' ? 6 : 5; // Sat = Mon + 5, Sun = Mon + 6
        const hour = (divNum === '3' || divNum === '4') ? 15 : 12;
        _displayDate = monOfHome(_date);
        _displayDate.setDate(_displayDate.getDate() + dayOffset);
        _displayDate.setHours(hour, 0, 0, 0);
      }
      return { ...m, _date, _displayDate };
    });

    const renderHomeTable = (rows) => `
      <div class="matches-table-wrap is-compact">
        <table class="matches-table is-compact">
          <tbody>${rows.map(m => homeMatchRowHtml(m, teamsById, divsById, teamLogo)).join('')}</tbody>
        </table>
      </div>`;

    // Pick one match per division, ordered by division_order.
    //   asc=true  → earliest match in each division (used for "This Week")
    //   asc=false → most recent match in each division (used for "Latest Scores")
    const pickPerDivision = (matches, asc) => {
      const byDiv = new Map();
      matches.forEach(m => {
        const cur = byDiv.get(m.division_id);
        if (!cur) { byDiv.set(m.division_id, m); return; }
        if (!m._date) return;
        if (!cur._date) { byDiv.set(m.division_id, m); return; }
        const better = asc ? m._date < cur._date : m._date > cur._date;
        if (better) byDiv.set(m.division_id, m);
      });
      return [...byDiv.values()].sort((a, b) => {
        const ao = (divsById[a.division_id] || {}).division_order || 0;
        const bo = (divsById[b.division_id] || {}).division_order || 0;
        return ao - bo;
      });
    };

    // Upcoming: nearest not-yet-completed match per division
    const upcoming = pickPerDivision(enriched.filter(m => !isCompleted(m)), true);

    upcomingEl.innerHTML = upcoming.length
      ? renderHomeTable(upcoming)
      : `<div class="empty-card">No upcoming matches.</div>`;
    upcomingEl.dataset.loaded = '1';

    // Recent: most recent completed match per division
    const recent = pickPerDivision(enriched.filter(m => isCompleted(m)), false);

    recentEl.innerHTML = recent.length
      ? renderHomeTable(recent)
      : `<div class="empty-card">No completed matches yet.</div>`;
    recentEl.dataset.loaded = '1';
  }

  // Compact home-page row — same match-cell styling as the Matches page, with
  // a leading division pill so the layout mirrors the Matches table on phones.
  function homeMatchRowHtml(m, teamsById, divsById, teamLogo) {
    const home     = teamName(teamsById, m.home_team_id);
    const away     = teamName(teamsById, m.away_team_id);
    const homeLogo = teamLogo(m.home_team_id);
    const awayLogo = teamLogo(m.away_team_id);
    const isDone   = isCompleted(m);

    const div = divisionName(divsById, m.division_id);
    const divNum = (div.match(/\d+/) || [''])[0];
    const divPill = `<span class="div-pill div-${divNum || 'na'}">${escapeHtml(div)}</span>`;

    const displayDate = m._displayDate || m._date;
    const dateBlock = displayDate
      ? `<div class="date-stack"><span class="date-dow">${DOW[displayDate.getDay()]}</span><span class="date-md">${MON[displayDate.getMonth()]} ${displayDate.getDate()}</span></div>`
      : `<div class="date-stack"><span class="date-md is-tbd">TBD</span></div>`;

    const live = !isDone && isLive(m);
    let matchCell;
    if (isDone) {
      const winnerIsHome = m.winning_team_id
        ? m.winning_team_id === m.home_team_id
        : (m.home_games_won || 0) > (m.away_games_won || 0);
      matchCell = `
        <button class="match-cell is-final is-compact" data-route="matchreport" data-param="${escapeHtml(m.match_id)}" title="View match report">
          <span class="m-team m-team-home ${winnerIsHome ? 'is-winner' : ''}">${teamBadgeHtml(home, homeLogo)}</span>
          <span class="m-score">
            <span class="m-score-num ${winnerIsHome ? 'is-win' : ''}">${m.home_games_won || 0}</span>
            <span class="m-score-sep">–</span>
            <span class="m-score-num ${!winnerIsHome ? 'is-win' : ''}">${m.away_games_won || 0}</span>
          </span>
          <span class="m-team m-team-away ${!winnerIsHome ? 'is-winner' : ''}">${teamBadgeHtml(away, awayLogo)}</span>
        </button>`;
    } else if (live) {
      matchCell = `
        <button class="match-cell is-upcoming is-compact is-live" data-route="matchcast" data-param="${escapeHtml(m.match_id)}" title="Watch live">
          <span class="m-team m-team-home">${teamBadgeHtml(home, homeLogo)}</span>
          <span class="m-vs">vs</span>
          <span class="m-team m-team-away">${teamBadgeHtml(away, awayLogo)}</span>
          <span class="m-status m-status-live"><span class="live-dot"></span>Live</span>
        </button>`;
    } else {
      matchCell = `
        <div class="match-cell is-upcoming is-compact">
          <span class="m-team m-team-home">${teamBadgeHtml(home, homeLogo)}</span>
          <span class="m-vs">vs</span>
          <span class="m-team m-team-away">${teamBadgeHtml(away, awayLogo)}</span>
        </div>`;
    }

    return `
      <tr class="match-row ${isDone ? 'is-done' : 'is-upcoming'}">
        <td class="col-division">${divPill}</td>
        <td class="col-date">${dateBlock}</td>
        <td class="col-match">${matchCell}</td>
      </tr>`;
  }

  // ==========================================================================
  // MATCHES (combined schedule + results)
  // ==========================================================================

  // Persistent state across re-renders
  const matchesState = {
    groupBy: 'week', // 'week' | 'division'
  };

  async function renderMatches() {
    const body = document.getElementById('matches-body');
    if (body.dataset.loaded !== '1') body.innerHTML = '<div class="loading-card">Loading matches…</div>';

    let data;
    try {
      data = await fetchPublicData();
    } catch (err) {
      body.innerHTML = errorCard(err.message);
      body.querySelector('[data-retry]').addEventListener('click', () => { body.dataset.loaded = ''; renderMatches(); });
      return;
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');
    const clubsById = indexBy(data.clubs || [], 'club_id');

    // Map team_id → logo URL via club association
    const teamLogo = id => {
      const team = teamsById[id];
      if (!team) return '';
      const club = clubsById[team.club_id];
      return club?.logo_url || '';
    };

    // Sequential league-week numbering. Bucket each match by its Monday-of-week,
    // collect distinct buckets in chronological order, and assign 1, 2, 3...
    // This way Week N+1 always immediately follows Week N even if no matches
    // were played in the calendar week between them.
    const monOf = x => {
      const t = new Date(x); const day = t.getDay();
      t.setDate(t.getDate() + (day === 0 ? -6 : 1 - day));
      t.setHours(0,0,0,0);
      return t;
    };

    const enriched = data.matches
      .map(m => ({ ...m, _date: parseMatchDate(m) }))
      .filter(m => m._date);

    const weekKeysSorted = [...new Set(enriched.map(m => monOf(m._date).getTime()))]
      .sort((a, b) => a - b);
    const weekIndex = Object.fromEntries(weekKeysSorted.map((k, i) => [k, i + 1]));
    const weekOf = d => d ? (weekIndex[monOf(d).getTime()] || null) : null;

    // Override displayed date + time per league rules:
    //   D1–D4 play Saturdays starting 2026-04-11; D5 plays Sundays.
    //   D1, D2, D5 start at 12 PM; D3, D4 start at 3 PM.
    const SEASON_START = new Date(2026, 3, 11); // Sat Apr 11, 2026
    const allMatches = enriched.map(m => {
      const week = weekOf(m._date);
      const divName = divisionName(divsById, m.division_id);
      const divNum = (divName.match(/\d+/) || [''])[0];
      let dispDate = null;
      if (week) {
        const dayOffset = divNum === '5' ? 1 : 0;
        const hour = (divNum === '3' || divNum === '4') ? 15 : 12;
        dispDate = new Date(SEASON_START);
        dispDate.setDate(SEASON_START.getDate() + (week - 1) * 7 + dayOffset);
        dispDate.setHours(hour, 0, 0, 0);
      }
      return { ...m, _week: week, _displayDate: dispDate };
    });

    // Wire up the group-by toggle once
    const groupToggleEl = document.querySelector('.group-toggle');
    if (groupToggleEl && !groupToggleEl.dataset.bound) {
      groupToggleEl.dataset.bound = '1';
      groupToggleEl.addEventListener('click', e => {
        const btn = e.target.closest('.group-toggle-btn[data-group]');
        if (!btn) return;
        const next = btn.dataset.group;
        if (matchesState.groupBy === next) return;
        matchesState.groupBy = next;
        groupToggleEl.querySelectorAll('.group-toggle-btn').forEach(b => {
          const active = b.dataset.group === next;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        renderMatches();
      });
    }
    if (groupToggleEl) {
      groupToggleEl.querySelectorAll('.group-toggle-btn').forEach(b => {
        const active = b.dataset.group === matchesState.groupBy;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
    }

    const filteredRows = allMatches;

    if (!filteredRows.length) {
      body.innerHTML = '<div class="empty-card">No matches found.</div>';
      body.dataset.loaded = '1';
      return;
    }

    // Group rows
    const groupBy = matchesState.groupBy;
    const groupMap = new Map();

    if (groupBy === 'week') {
      // Group by week, secondary sort: division then date
      filteredRows.forEach(m => {
        const k = m._week ?? 9999;
        if (!groupMap.has(k)) groupMap.set(k, []);
        groupMap.get(k).push(m);
      });
      // Sort group keys ascending
      const sortedGroups = [...groupMap.entries()].sort((a,b) => a[0] - b[0]);
      groupMap.clear();
      sortedGroups.forEach(([k, list]) => {
        list.sort((a,b) =>
          divisionName(divsById, a.division_id).localeCompare(divisionName(divsById, b.division_id))
          || (a._date - b._date)
        );
        groupMap.set(k, list);
      });
    } else {
      // Group by division, secondary sort: week then date
      filteredRows.forEach(m => {
        const k = m.division_id || '_unknown';
        if (!groupMap.has(k)) groupMap.set(k, []);
        groupMap.get(k).push(m);
      });
      const order = (data.divisions || []).map(d => d.division_id);
      const sortedGroups = [...groupMap.entries()].sort((a,b) => {
        const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0]);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return String(a[0]).localeCompare(String(b[0]));
      });
      groupMap.clear();
      sortedGroups.forEach(([k, list]) => {
        list.sort((a,b) => ((a._week ?? 9999) - (b._week ?? 9999)) || (a._date - b._date));
        groupMap.set(k, list);
      });
    }

    // Compact date range from the actual match dates in the group.
    // Examples: "Apr 11", "Apr 11–12", "Apr 30 – May 2"
    const dateRangeFromList = (list) => {
      const dates = list.map(m => m._displayDate || m._date).filter(Boolean).sort((a,b) => a - b);
      if (!dates.length) return '';
      const first = dates[0], last = dates[dates.length - 1];
      const sameDay = first.getMonth() === last.getMonth() && first.getDate() === last.getDate();
      if (sameDay) return `${MON[first.getMonth()]} ${first.getDate()}`;
      if (first.getMonth() === last.getMonth()) {
        return `${MON[first.getMonth()]} ${first.getDate()}–${last.getDate()}`;
      }
      return `${MON[first.getMonth()]} ${first.getDate()} – ${MON[last.getMonth()]} ${last.getDate()}`;
    };

    // Tally wins per team brand (first word of stripped team_name) within a group.
    // Returns a sorted array of { brand, wins, logo } in the order the brands
    // appear among the home teams of the group.
    const groupTeamWins = (list) => {
      const order = [];
      const wins  = {};
      const logos = {};
      list.forEach(m => {
        [m.home_team_id, m.away_team_id].forEach(id => {
          const name  = teamName(teamsById, id);
          const brand = String(name || '').split(/\s+/)[0] || '—';
          if (!(brand in wins)) {
            wins[brand]  = 0;
            logos[brand] = teamLogo(id);
            order.push(brand);
          }
        });
        const isDone = isCompleted(m);
        if (!isDone) return;
        const winnerIsHome = m.winning_team_id
          ? m.winning_team_id === m.home_team_id
          : (m.home_games_won || 0) > (m.away_games_won || 0);
        const winnerId   = winnerIsHome ? m.home_team_id : m.away_team_id;
        const winnerName = teamName(teamsById, winnerId);
        const winnerBrand = String(winnerName || '').split(/\s+/)[0] || '—';
        wins[winnerBrand] = (wins[winnerBrand] || 0) + 1;
      });
      return order.map(brand => ({ brand, wins: wins[brand] || 0, logo: logos[brand] || '' }));
    };

    const winsSummaryHtml = (list) => {
      const tallies = groupTeamWins(list);
      if (!tallies.length) return '';
      // Show top 2 brands as "Camp 3 – 2 Dill" for readability.
      const top = tallies.slice(0, 2);
      if (top.length === 2) {
        const [a, b] = top;
        const aWin = a.wins > b.wins, bWin = b.wins > a.wins;
        return `
          <div class="group-summary">
            <span class="gs-team ${aWin ? 'is-winner' : ''}">${a.logo ? `<span class="gs-logo"><img src="${escapeHtml(a.logo)}" alt=""></span>` : ''}<span class="gs-name">${escapeHtml(a.brand)}</span></span>
            <span class="gs-score"><span class="${aWin ? 'is-win' : ''}">${a.wins}</span><span class="gs-sep">–</span><span class="${bWin ? 'is-win' : ''}">${b.wins}</span></span>
            <span class="gs-team ${bWin ? 'is-winner' : ''}">${b.logo ? `<span class="gs-logo"><img src="${escapeHtml(b.logo)}" alt=""></span>` : ''}<span class="gs-name">${escapeHtml(b.brand)}</span></span>
          </div>`;
      }
      // Fallback when only one brand (rare): show count list
      return `<div class="group-summary">${tallies.map(t => `<span class="gs-tally"><strong>${escapeHtml(t.brand)}</strong> ${t.wins}</span>`).join('')}</div>`;
    };

    // Render grouped sections
    const sectionsHtml = [...groupMap.entries()].map(([key, list]) => {
      let titleHtml, metaHtml;
      if (groupBy === 'week') {
        titleHtml = key === 9999 ? 'Date TBD' : (key === 7 ? 'Championship' : `Week ${key}`);
        metaHtml  = key === 9999 ? '' : escapeHtml(dateRangeFromList(list));
      } else {
        titleHtml = escapeHtml(divisionName(divsById, key) || 'Division');
        metaHtml  = `${list.length} match${list.length === 1 ? '' : 'es'}`;
      }

      const detailsLink = groupBy === 'division'
        ? `<a class="group-details-link" href="#seasonstats" data-route="seasonstats" data-param="${escapeHtml(key)}" title="Open ${escapeHtml(divisionName(divsById, key) || 'Division')} details">
             View details
             <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="9 18 15 12 9 6"/>
             </svg>
           </a>`
        : '';

      return `
        <section class="match-group">
          <header class="match-group-head">
            <div class="match-group-headline">
              <h2 class="match-group-title">${titleHtml}</h2>
              ${metaHtml ? `<span class="match-group-meta">${metaHtml}</span>` : ''}
            </div>
            <div class="match-group-summary">
              ${winsSummaryHtml(list)}
              ${detailsLink}
            </div>
          </header>
          <div class="matches-table-wrap">
            <table class="matches-table">
              <thead>
                <tr>
                  ${groupBy === 'week'
                    ? `<th class="col-division">Division</th><th class="col-date">Date</th>`
                    : `<th class="col-week">Week</th><th class="col-date">Date</th>`}
                  <th class="col-match">Match</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(m => matchRowHtml(m, teamsById, divsById, teamLogo, groupBy)).join('')}
              </tbody>
            </table>
          </div>
        </section>`;
    }).join('');

    body.innerHTML = `<div class="match-groups">${sectionsHtml}</div>`;

    body.dataset.loaded = '1';
  }

  function teamBadgeHtml(name, logoUrl) {
    const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase();
    const logo = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="" loading="lazy">`
      : `<span class="m-team-fallback">${escapeHtml(initials)}</span>`;
    return `<span class="m-team-logo">${logo}</span><span class="m-team-name">${escapeHtml(name || 'TBD')}</span>`;
  }

  function matchRowHtml(m, teamsById, divsById, teamLogo, groupBy) {
    const home = teamName(teamsById, m.home_team_id);
    const away = teamName(teamsById, m.away_team_id);
    const div  = divisionName(divsById, m.division_id);
    const homeLogo = teamLogo(m.home_team_id);
    const awayLogo = teamLogo(m.away_team_id);
    const isDone   = isCompleted(m);
    const live     = !isDone && isLive(m);

    const divNum = (div.match(/\d+/) || [''])[0];
    const divPill = `<span class="div-pill div-${divNum || 'na'}">${escapeHtml(div)}</span>`;
    const weekPill = m._week != null
      ? `<span class="week-pill">${m._week === 7 ? 'Championship' : `Week ${m._week}`}</span>`
      : `<span class="week-pill is-tbd">—</span>`;
    const leadingCell = groupBy === 'week'
      ? `<td class="col-division">${divPill}</td>`
      : `<td class="col-week">${weekPill}</td>`;

    const displayDate = m._displayDate || m._date;
    const dateBlock = displayDate
      ? `<div class="date-stack"><span class="date-dow">${DOW[displayDate.getDay()]}</span><span class="date-md">${MON[displayDate.getMonth()]} ${displayDate.getDate()}</span></div>`
      : `<div class="date-stack"><span class="date-md is-tbd">TBD</span></div>`;

    let matchCell;
    if (isDone) {
      const winnerIsHome = m.winning_team_id
        ? m.winning_team_id === m.home_team_id
        : (m.home_games_won || 0) > (m.away_games_won || 0);
      matchCell = `
        <button class="match-cell is-final" data-route="matchreport" data-param="${escapeHtml(m.match_id)}" title="View match report">
          <span class="m-team m-team-home ${winnerIsHome ? 'is-winner' : ''}">${teamBadgeHtml(home, homeLogo)}</span>
          <span class="m-score">
            <span class="m-score-num ${winnerIsHome ? 'is-win' : ''}">${m.home_games_won || 0}</span>
            <span class="m-score-sep">–</span>
            <span class="m-score-num ${!winnerIsHome ? 'is-win' : ''}">${m.away_games_won || 0}</span>
          </span>
          <span class="m-team m-team-away ${!winnerIsHome ? 'is-winner' : ''}">${teamBadgeHtml(away, awayLogo)}</span>
          <span class="m-status m-status-final">Final</span>
        </button>`;
    } else if (live) {
      matchCell = `
        <button class="match-cell is-upcoming is-live" data-route="matchcast" data-param="${escapeHtml(m.match_id)}" title="Watch live">
          <span class="m-team m-team-home">${teamBadgeHtml(home, homeLogo)}</span>
          <span class="m-vs">vs</span>
          <span class="m-team m-team-away">${teamBadgeHtml(away, awayLogo)}</span>
          <span class="m-status m-status-live"><span class="live-dot"></span>Live</span>
        </button>`;
    } else {
      const timeStr = displayDate ? fmtTime(displayDate) : '';
      const venue   = (m.venue || '').split(/\s+/)[0];
      const meta    = [timeStr, venue].filter(Boolean).join(' · ');
      matchCell = `
        <div class="match-cell is-upcoming">
          <span class="m-team m-team-home">${teamBadgeHtml(home, homeLogo)}</span>
          <span class="m-vs">vs</span>
          <span class="m-team m-team-away">${teamBadgeHtml(away, awayLogo)}</span>
          ${meta ? `<span class="m-status m-status-upcoming">${escapeHtml(meta)}</span>` : ''}
        </div>`;
    }

    return `
      <tr class="match-row ${isDone ? 'is-done' : live ? 'is-live' : 'is-upcoming'}">
        ${leadingCell}
        <td class="col-date">${dateBlock}</td>
        <td class="col-match">${matchCell}</td>
      </tr>`;
  }

  // ==========================================================================
  // STANDINGS
  // ==========================================================================

  async function renderStandings() {
    const body = document.getElementById('standings-body');
    if (body.dataset.loaded !== '1') body.innerHTML = '<div class="loading-card">Loading standings…</div>';

    let data;
    try {
      data = await fetchPublicData();
    } catch (err) {
      body.innerHTML = errorCard(err.message);
      body.querySelector('[data-retry]').addEventListener('click', () => { body.dataset.loaded = ''; renderStandings(); });
      return;
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');

    if (!data.standings.length) {
      body.innerHTML = '<div class="empty-card">Standings will appear here once matches are played.</div>';
      body.dataset.loaded = '1';
      return;
    }

    const byDivision = {};
    data.standings.forEach(s => { (byDivision[s.division_id] = byDivision[s.division_id] || []).push(s); });

    const divisionKeys = Object.keys(byDivision).sort((a,b) =>
      (divsById[a]?.division_order || 0) - (divsById[b]?.division_order || 0)
    );

    body.innerHTML = divisionKeys.map(divId => {
      const rows = byDivision[divId]
        .slice()
        .sort((a,b) => (a.standings_rank || 999) - (b.standings_rank || 999));
      const divName = divisionName(divsById, divId);

      return `
        <section class="data-group">
          <h2 class="data-group-title">${escapeHtml(divName)}</h2>
          <div class="standings-table-wrap">
            <table class="standings-table">
              <thead>
                <tr>
                  <th class="col-rank">#</th>
                  <th class="col-team">Team</th>
                  <th>MP</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Rounds</th>
                  <th>Games</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td class="col-rank">${r.standings_rank || '—'}</td>
                    <td class="col-team"><strong>${escapeHtml(teamName(teamsById, r.team_id))}</strong></td>
                    <td>${r.matches_played}</td>
                    <td class="is-good">${r.match_wins}</td>
                    <td class="is-muted">${r.match_losses}</td>
                    <td>${r.rounds_won}–${r.rounds_lost}</td>
                    <td>${r.games_won}–${r.games_lost}</td>
                    <td>${r.points_for}</td>
                    <td>${r.points_against}</td>
                    <td class="${r.point_diff > 0 ? 'is-good' : r.point_diff < 0 ? 'is-bad' : ''}">${r.point_diff > 0 ? '+' : ''}${r.point_diff}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>`;
    }).join('');
    body.dataset.loaded = '1';
  }

  // ==========================================================================
  // MATCH CAST + MATCH REPORT
  // ==========================================================================

  function isLive(m) {
    if (!m || typeof m !== 'object') return false;
    const s = (m.status || '').toLowerCase();
    return s === 'in_progress' || s === 'live' || s === 'active';
  }

  function fetchScBranding() {
    if (_scBranding) return Promise.resolve(_scBranding);
    if (_scBrandingPromise) return _scBrandingPromise;
    _scBrandingPromise = fetch(`${GAS_BASE}?page=scorebranding`)
      .then(r => r.ok ? r.json() : {})
      .then(b => { _scBranding = b; return b; })
      .catch(() => { _scBrandingPromise = null; return {}; });
    return _scBrandingPromise;
  }

  // ---- Match Cast (live) ----

  async function renderMatchcast(matchId) {
    const selectEl = document.getElementById('mc-select');
    const mainEl   = document.getElementById('mc-main');
    const sideEl   = document.getElementById('mc-side');
    if (!selectEl || !mainEl || !sideEl) return;

    mainEl.innerHTML = `<div class="sc-empty"><div class="sc-spinner"></div><span>Loading…</span></div>`;
    sideEl.innerHTML = '';

    let data, branding;
    try {
      [data, branding] = await Promise.all([fetchPublicData(), fetchScBranding()]);
    } catch (err) {
      mainEl.innerHTML = `<div class="sc-empty">Failed to load data.<br><small>${escapeHtml(err.message)}</small></div>`;
      return;
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');
    const liveMatches = (data.matches || []).filter(m => isLive(m));

    selectEl.innerHTML = '';
    if (!liveMatches.length) {
      const o = document.createElement('option');
      o.textContent = 'No live matches';
      selectEl.appendChild(o);
      mainEl.innerHTML = `<div class="sc-empty">No matches currently in progress.</div>`;
      return;
    }

    // Group by division
    const byDiv = new Map();
    liveMatches.forEach(m => {
      const k = m.division_id || 'other';
      if (!byDiv.has(k)) byDiv.set(k, []);
      byDiv.get(k).push(m);
    });
    byDiv.forEach((matches, divId) => {
      const grp = document.createElement('optgroup');
      grp.label = divisionName(divsById, divId) || 'Division';
      matches.forEach(m => {
        const o = document.createElement('option');
        o.value = m.match_id;
        o.textContent = `${teamName(teamsById, m.home_team_id)} vs ${teamName(teamsById, m.away_team_id)}`;
        grp.appendChild(o);
      });
      selectEl.appendChild(grp);
    });

    const target = matchId && [...selectEl.options].some(o => o.value === matchId)
      ? matchId : liveMatches[0].match_id;
    selectEl.value = target;

    selectEl.onchange = () => {
      if (_mcPollTimer) { clearInterval(_mcPollTimer); _mcPollTimer = null; }
      scLoadAndRender(selectEl.value, mainEl, sideEl, branding, teamsById, divsById, true);
    };

    scLoadAndRender(target, mainEl, sideEl, branding, teamsById, divsById, true);
  }

  // ---- Match Report (completed) ----

  async function renderMatchreport(matchId) {
    const selectEl = document.getElementById('mr-select');
    const mainEl   = document.getElementById('mr-main');
    const sideEl   = document.getElementById('mr-side');
    if (!selectEl || !mainEl || !sideEl) return;

    mainEl.innerHTML = `<div class="sc-empty"><div class="sc-spinner"></div><span>Loading…</span></div>`;
    sideEl.innerHTML = '';

    let data, branding;
    try {
      [data, branding] = await Promise.all([fetchPublicData(), fetchScBranding()]);
    } catch (err) {
      mainEl.innerHTML = `<div class="sc-empty">Failed to load data.<br><small>${escapeHtml(err.message)}</small></div>`;
      return;
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');

    const completed = (data.matches || [])
      .filter(m => isCompleted(m))
      .map(m => ({ ...m, _date: parseMatchDate(m) }))
      .sort((a, b) => (b._date || 0) - (a._date || 0));

    selectEl.innerHTML = '';
    if (!completed.length) {
      const o = document.createElement('option');
      o.textContent = 'No completed matches';
      selectEl.appendChild(o);
      mainEl.innerHTML = `<div class="sc-empty">No completed matches yet.</div>`;
      return;
    }

    // Group by week, newest first
    const weekGroups = new Map();
    completed.forEach(m => {
      const wk = m._date ? weekKey(m._date) : 'unknown';
      if (!weekGroups.has(wk)) weekGroups.set(wk, []);
      weekGroups.get(wk).push(m);
    });
    const sortedWeeks = [...weekGroups.keys()].sort((a, b) => b.localeCompare(a));
    sortedWeeks.forEach(wk => {
      const grp = document.createElement('optgroup');
      grp.label = weekLabel(wk);
      weekGroups.get(wk).forEach(m => {
        const div = divisionName(divsById, m.division_id);
        const divNum = (div.match(/\d+/) || [''])[0];
        const o = document.createElement('option');
        o.value = m.match_id;
        o.textContent = `${divNum ? 'Div ' + divNum + ' · ' : ''}${teamName(teamsById, m.home_team_id)} ${m.home_games_won || 0}–${m.away_games_won || 0} ${teamName(teamsById, m.away_team_id)}`;
        grp.appendChild(o);
      });
      selectEl.appendChild(grp);
    });

    const target = matchId && [...selectEl.options].some(o => o.value === matchId)
      ? matchId : completed[0].match_id;
    selectEl.value = target;

    selectEl.onchange = () => {
      scLoadAndRender(selectEl.value, mainEl, sideEl, branding, teamsById, divsById, false);
    };

    scLoadAndRender(target, mainEl, sideEl, branding, teamsById, divsById, false);
  }

  // ---- Core fetch + render ----

  function scLoadAndRender(matchId, mainEl, sideEl, branding, teamsById, divsById, live) {
    if (!matchId) return;
    mainEl.innerHTML = `<div class="sc-empty"><div class="sc-spinner"></div><span>Loading…</span></div>`;
    sideEl.innerHTML = '';

    const doFetch = () => {
      fetch(`${GAS_BASE}?page=scorecarddata&matchId=${encodeURIComponent(matchId)}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => scRender(d, mainEl, sideEl, branding, divsById))
        .catch(err => {
          mainEl.innerHTML = `<div class="sc-empty">Couldn't load match data.<br><small>${escapeHtml(err.message)}</small></div>`;
        });
    };

    doFetch();
    if (live) _mcPollTimer = setInterval(doFetch, 30000);
  }

  function scRender(data, mainEl, sideEl, branding, divsById) {
    if (!data || !data.match) {
      mainEl.innerHTML = `<div class="sc-empty">No scorecard data.</div>`;
      return;
    }
    const match  = data.match;
    const rounds = scDedupeRounds(data.rounds || []);

    const homeTotal = rounds.reduce((s, r) => s + (r.home_games_won || 0), 0);
    const awayTotal = rounds.reduce((s, r) => s + (r.away_games_won || 0), 0);

    const divNum  = scExtractDivNum(match, divsById);
    const weekNum = scExtractWeekNum(match);
    const metaParts = [
      match.match_date ? scFmtDate(match.match_date) : '',
      match.start_time ? scFmtTime(match.start_time) : '',
      match.venue ? 'at ' + match.venue : '',
      divNum  ? 'Div ' + divNum   : '',
      weekNum ? 'Week ' + weekNum : '',
    ].filter(Boolean);

    const colHeaders = rounds.map((r, i) => `<th>R${r.round_number || (i + 1)}</th>`).join('');
    const homeScores = rounds.map(r => {
      const hw = r.home_games_won || 0, aw = r.away_games_won || 0;
      const active = hw || aw || scRoundDone(r);
      const cls = scRoundDone(r) ? (hw > aw ? 'sc-win' : 'sc-loss') : '';
      return `<td class="sc-score-cell ${cls}">${active ? hw : '—'}</td>`;
    }).join('');
    const awayScores = rounds.map(r => {
      const hw = r.home_games_won || 0, aw = r.away_games_won || 0;
      const active = hw || aw || scRoundDone(r);
      const cls = scRoundDone(r) ? (aw > hw ? 'sc-win' : 'sc-loss') : '';
      return `<td class="sc-score-cell ${cls}">${active ? aw : '—'}</td>`;
    }).join('');

    const cardHtml = `
      <div class="sc-card">
        <table class="sc-table">
          <thead><tr class="sc-header-row">
            <th>Team</th>${colHeaders}<th>Total</th>
          </tr></thead>
          <tbody>
            <tr class="sc-body-row">
              <td class="sc-team-cell"><div class="sc-team-inner"><div class="sc-logo">${scLogoHtml(match.home_team_name, 'sb', branding)}</div></div></td>
              ${homeScores}
              <td class="sc-total-cell ${homeTotal > awayTotal ? 'sc-leader' : 'sc-trail'}">${homeTotal}</td>
            </tr>
            <tr class="sc-body-row">
              <td class="sc-team-cell"><div class="sc-team-inner"><div class="sc-logo">${scLogoHtml(match.away_team_name, 'sb', branding)}</div></div></td>
              ${awayScores}
              <td class="sc-total-cell ${awayTotal > homeTotal ? 'sc-leader' : 'sc-trail'}">${awayTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>`;

    const metaHtml = metaParts.length
      ? `<div class="sc-meta-bar">${escapeHtml(metaParts.join(' · '))}</div>`
      : '';

    const roundsHtml = rounds.length
      ? `<div class="sc-rounds">${rounds.map(r => scRoundHtml({ ...r, games: scSortGames(r.games || []) }, match, branding)).join('')}</div>`
      : `<div class="sc-empty">No rounds found.</div>`;

    mainEl.innerHTML = cardHtml + metaHtml + roundsHtml;
    sideEl.innerHTML = scTeamStatsHtml(data, branding) + scPlayerStatsHtml(data, branding);
  }

  // ---- Round ----

  function scRoundHtml(round, match, branding) {
    const hw = round.home_games_won || 0, aw = round.away_games_won || 0;
    const done = scRoundDone(round);
    const showScore = hw || aw || done;
    return `
      <div class="round-block">
        <div class="round-head">
          <div class="round-head-left">
            <div class="round-badge">${escapeHtml(String(round.round_number || ''))}</div>
            <span class="round-label">Round ${escapeHtml(String(round.round_number || ''))}</span>
          </div>
          <div class="round-head-right">
            ${showScore ? `<span class="round-score-disp">${hw} – ${aw}</span>` : ''}
            <span class="round-pill ${done ? 'done' : ''}">${done ? 'Complete' : escapeHtml(round.status || 'Pending')}</span>
          </div>
        </div>
        <div class="game-stack">${(round.games || []).map(g => scGameCardHtml(g, match, branding)).join('')}</div>
      </div>`;
  }

  // ---- Game card ----

  function scGameCardHtml(game, match, branding) {
    const hasH = game.home_score !== null && game.home_score !== undefined && game.home_score !== '';
    const hasA = game.away_score !== null && game.away_score !== undefined && game.away_score !== '';
    const done = hasH && hasA;
    const hNum = done ? Number(game.home_score) : null;
    const aNum = done ? Number(game.away_score) : null;
    const hWin = done && hNum > aNum, aWin = done && aNum > hNum;
    const p1h = game.home_player_1_name || '', p2h = game.home_player_2_name || '';
    const p1a = game.away_player_1_name || '', p2a = game.away_player_2_name || '';
    const hScoreCls = !hasH ? 'blank' : hWin ? 'win' : aWin ? 'lose' : '';
    const aScoreCls = !hasA ? 'blank' : aWin ? 'win' : hWin ? 'lose' : '';
    const courtLabel = game.court_number
      ? `Court ${game.court_number}`
      : (game.court ? `Court ${game.court}` : `Court ${game.game_number_in_round || ''}`);
    const tc = scTypeClass(game.game_type);
    return `
      <div class="gcard">
        <div class="gcard-head">
          <span class="game-num-lbl">${escapeHtml(courtLabel)}</span>
          <span class="type-pill ${tc}">${escapeHtml(scPrettyType(game.game_type))}</span>
        </div>
        <div class="team-rows">
          <div class="team-row ${hWin ? 'winner' : aWin ? 'loser' : ''}">
            <div class="club-icon">${scLogoHtml(match.home_team_name, 'sm', branding)}</div>
            <div class="player-names">
              <div class="player-name">${p1h ? escapeHtml(p1h) : 'TBD'}</div>
              <div class="player-name-2">${p2h ? escapeHtml(p2h) : 'TBD'}</div>
            </div>
            <span class="score-disp ${hScoreCls}">${hasH ? hNum : '—'}</span>
          </div>
          <div class="team-row ${aWin ? 'winner' : hWin ? 'loser' : ''}">
            <div class="club-icon">${scLogoHtml(match.away_team_name, 'sm', branding)}</div>
            <div class="player-names">
              <div class="player-name">${p1a ? escapeHtml(p1a) : 'TBD'}</div>
              <div class="player-name-2">${p2a ? escapeHtml(p2a) : 'TBD'}</div>
            </div>
            <span class="score-disp ${aScoreCls}">${hasA ? aNum : '—'}</span>
          </div>
        </div>
      </div>`;
  }

  // ---- Team stats ----

  function scTeamStatsHtml(data, branding) {
    if (!data || !data.match) return '';
    const match    = data.match;
    const allGames = (data.rounds || []).flatMap(r => r.games || []);
    const gtypes   = ['womens','mens','mixed','coed'];
    const glabels  = { womens:"W's", mens:"M's", mixed:'Mix', coed:'Coed' };
    const stats    = { all: { hW:0, aW:0, hD:0, aD:0 } };
    for (const gt of gtypes) stats[gt] = { hW:0, aW:0, hD:0, aD:0, found:false };
    const scheduled = new Set();
    for (const g of allGames) {
      const gt = scTypeClass(g.game_type);
      if (gt && gt !== 'other') scheduled.add(gt);
      if (g.home_score === '' || g.home_score === null || g.home_score === undefined) continue;
      if (g.away_score === '' || g.away_score === null || g.away_score === undefined) continue;
      const hs = Number(g.home_score), as = Number(g.away_score);
      stats.all.hW += hs>as?1:0; stats.all.aW += as>hs?1:0; stats.all.hD += hs-as; stats.all.aD += as-hs;
      if (stats[gt]) { stats[gt].hW += hs>as?1:0; stats[gt].aW += as>hs?1:0; stats[gt].hD += hs-as; stats[gt].aD += as-hs; stats[gt].found = true; }
    }
    const activeCols = ['all', ...gtypes.filter(gt => stats[gt].found || scheduled.has(gt))];
    const colHeads = activeCols.map(col => `<th class="ts-col-head ts-${col}">${escapeHtml(col === 'all' ? 'All' : glabels[col])}</th>`).join('');
    const scoreCell = (col, isHome) => {
      const s    = stats[col];
      const wins = isHome ? s.hW : s.aW;
      const diff = isHome ? s.hD : s.aD;
      const opp  = isHome ? s.aW : s.hW;
      const cls  = wins > opp ? 'ts-win' : wins < opp ? 'ts-loss' : '';
      return `<td class="ts-score-cell ${cls}">
        <span class="ts-wins">${wins}</span>
        ${diff !== 0 ? `<span class="ts-diff ${diff>0?'pos':'neg'}">${diff>0?'+':''}${diff}</span>` : ''}
      </td>`;
    };
    return `
      <div class="sc-panel">
        <div class="sc-panel-head"><span class="sc-panel-title">Games Won</span></div>
        <table class="ts-table">
          <thead><tr>
            <th class="ts-team-head">Team</th>${colHeads}
          </tr></thead>
          <tbody>
            <tr class="ts-row">
              <td class="ts-team-cell"><div class="ts-team-inner"><div class="ts-logo">${scLogoHtml(match.home_team_name, 'sb', branding)}</div></div></td>
              ${activeCols.map(col => scoreCell(col, true)).join('')}
            </tr>
            <tr class="ts-row">
              <td class="ts-team-cell"><div class="ts-team-inner"><div class="ts-logo">${scLogoHtml(match.away_team_name, 'sb', branding)}</div></div></td>
              ${activeCols.map(col => scoreCell(col, false)).join('')}
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  // ---- Player stats ----

  function scPlayerStatsHtml(data, branding) {
    if (!data || !data.match) return '';
    const match    = data.match;
    const allGames = (data.rounds || []).flatMap(r => r.games || []);
    const pm = {};
    const ensure = (name, isHome, gt) => {
      if (!name) return;
      if (!pm[name]) pm[name] = { name, wins:0, losses:0, diff:0, isWomens:false, teamName: isHome ? match.home_team_name : match.away_team_name };
      if (scTypeClass(gt) === 'womens') pm[name].isWomens = true;
    };
    for (const g of allGames) {
      ensure(g.home_player_1_name, true,  g.game_type);
      ensure(g.home_player_2_name, true,  g.game_type);
      ensure(g.away_player_1_name, false, g.game_type);
      ensure(g.away_player_2_name, false, g.game_type);
      const hasH = g.home_score !== null && g.home_score !== undefined && g.home_score !== '';
      const hasA = g.away_score !== null && g.away_score !== undefined && g.away_score !== '';
      if (!hasH || !hasA) continue;
      const hs = Number(g.home_score), as = Number(g.away_score);
      const tally = (name, home) => {
        const p = pm[name]; if (!p) return;
        if (home) { p.wins += hs>as?1:0; p.losses += as>hs?1:0; p.diff += hs-as; }
        else      { p.wins += as>hs?1:0; p.losses += hs>as?1:0; p.diff += as-hs; }
      };
      tally(g.home_player_1_name, true);  tally(g.home_player_2_name, true);
      tally(g.away_player_1_name, false); tally(g.away_player_2_name, false);
    }
    const players = Object.values(pm).filter(p => p.name);
    if (!players.length) return '';
    const sortFn = (a, b) => b.wins - a.wins || a.losses - b.losses || b.diff - a.diff;
    const women = players.filter(p =>  p.isWomens).sort(sortFn);
    const men   = players.filter(p => !p.isWomens).sort(sortFn);
    if (!women.length && !men.length) return '';
    const buildRows = list => list.map((p, i) => {
      const ds = p.diff > 0 ? '+' + p.diff : String(p.diff);
      return `<tr>
        <td class="ps-rank">${i+1}</td>
        <td class="ps-logo-cell"><div class="ps-logo-inner">${scLogoHtml(p.teamName, 'xs', branding)}</div></td>
        <td class="ps-name">${escapeHtml(p.name)}</td>
        <td class="ps-mono">${p.wins}–${p.losses}</td>
        <td class="ps-mono ${p.diff>0?'positive':p.diff<0?'negative':''}">${escapeHtml(ds)}</td>
      </tr>`;
    }).join('');
    const buildSection = (label, list) => {
      if (!list.length) return '';
      return `<div class="ps-section">
          <div class="ps-section-badge">${label[0]}</div>
          <span class="ps-section-label">${escapeHtml(label)}</span>
        </div>
        <table class="ps-table">
          <thead><tr><th class="ps-rank"></th><th class="ps-logo-cell"></th><th class="ps-th-name">Player</th><th>W–L</th><th>+/–</th></tr></thead>
          <tbody>${buildRows(list)}</tbody>
        </table>`;
    };
    return `
      <div class="sc-panel">
        <div class="ps-two-col">
          <div class="ps-col">${buildSection('Women', women)}</div>
          <div class="ps-col">${buildSection('Men', men)}</div>
        </div>
      </div>`;
  }

  // ---- Logo builder ----

  function scLogoHtml(teamName, size, branding) {
    const t = String(teamName || '').toLowerCase();
    const dynLogos  = branding?.clubLogos || {};
    const legacyMap = {};
    if (branding?.campLogoUrl) legacyMap['camp'] = branding.campLogoUrl;
    if (branding?.dillLogoUrl) legacyMap['dill'] = branding.dillLogoUrl;
    const logos = Object.keys(dynLogos).length ? dynLogos : legacyMap;
    for (const [kw, url] of Object.entries(logos)) {
      if (url && t.includes(kw.toLowerCase()))
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(teamName)}" style="width:100%;height:100%;object-fit:contain;">`;
    }
    const initials = String(teamName || 'TM').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    const palette  = ['#123a7c','#0b7e39','#7c3a12','#3a127c','#127c3a','#7c6012'];
    const idx      = Math.abs(String(teamName).split('').reduce((a,c) => a + c.charCodeAt(0), 0)) % palette.length;
    const fs       = size === 'sb' ? '12' : '10';
    return `<span style="font-family:'Bebas Neue',sans-serif;font-size:${fs}px;color:#fff;background:${palette[idx]};width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:inherit;">${escapeHtml(initials)}</span>`;
  }

  // ---- Scorecard helpers ----

  function scDedupeRounds(rounds) {
    if (!Array.isArray(rounds)) return [];
    const byNum = new Map();
    for (const r of rounds) {
      const num = Number(r.round_number || 0);
      const key = num || String(r.round_id || '').trim();
      if (!key) continue;
      const prev = byNum.get(key);
      if (!prev) { byNum.set(key, { ...r, games: [...(r.games || [])] }); continue; }
      const seenIds = new Set(prev.games.map(g => String(g.game_id)));
      for (const g of (r.games || [])) {
        if (!seenIds.has(String(g.game_id))) { prev.games.push(g); seenIds.add(String(g.game_id)); }
      }
      prev.home_games_won = Math.max(prev.home_games_won || 0, r.home_games_won || 0);
      prev.away_games_won = Math.max(prev.away_games_won || 0, r.away_games_won || 0);
      if ((prev.status || '') !== 'completed' && (r.status || '') === 'completed') prev.status = 'completed';
    }
    return Array.from(byNum.values()).sort((a,b) => Number(a.round_number||0) - Number(b.round_number||0));
  }

  function scRoundDone(r) {
    const gs = r.games || [];
    return gs.length > 0 && gs.every(g => {
      const hasH = g.home_score !== null && g.home_score !== undefined && g.home_score !== '';
      const hasA = g.away_score !== null && g.away_score !== undefined && g.away_score !== '';
      return hasH && hasA;
    });
  }

  function scSortGames(games) {
    const pri = g => { const tc = scTypeClass(g.game_type); return tc==='womens'?0:tc==='mens'?1:tc==='mixed'?2:tc==='coed'?3:4; };
    return [...games].sort((a,b) => pri(a)-pri(b) || (a.game_number_in_round||0)-(b.game_number_in_round||0));
  }

  function scTypeClass(type) {
    const t = String(type || '').trim().toLowerCase();
    if (t === 'womens' || t === "women's" || t === 'women') return 'womens';
    if (t === 'mens'   || t === "men's"   || t === 'men')   return 'mens';
    if (t === 'mixed')  return 'mixed';
    if (t === 'coed'   || t === 'co-ed')  return 'coed';
    return 'other';
  }

  function scPrettyType(type) {
    const t = String(type || '').trim().toLowerCase();
    if (t === 'womens' || t === "women's" || t === 'women') return "Women's";
    if (t === 'mens'   || t === "men's"   || t === 'men')   return "Men's";
    if (t === 'mixed')  return 'Mixed';
    if (t === 'coed'   || t === 'co-ed')  return 'Coed';
    return type || 'Game';
  }

  function scExtractDivNum(match, divsById) {
    const divId = match?.division_id;
    const name  = divId && divsById && divsById[divId] ? divsById[divId].division_name : '';
    const m = (name || String(divId || '')).match(/(\d+)/);
    return m ? m[1] : '';
  }

  function scExtractWeekNum(match) {
    const m = String(match?.match_id || '').match(/W(\d+)/i);
    return m ? m[1] : '';
  }

  function scFmtDate(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, mo, d] = s.split('-').map(Number);
      return new Date(y, mo-1, d).toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    }
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    return s;
  }

  function scFmtTime(raw) {
    if (!raw) return '';
    const s  = String(raw).trim();
    const hm = s.match(/^(\d{1,2}):(\d{2})/);
    if (hm) {
      const dt = new Date(); dt.setHours(+hm[1], +hm[2], 0, 0);
      return dt.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
    }
    return s;
  }

  // ---------- Init ----------
  if (IS_STAGING) {
    const banner = document.getElementById('staging-banner');
    if (banner) banner.style.display = '';
  }

  const [initialKey, initialParam] = (location.hash || '#home').slice(1).split('/');
  navigate(initialKey || 'home', initialParam);
})();
