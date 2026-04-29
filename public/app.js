(() => {
  'use strict';

  // GAS web app base — serves Captain, Scorecard, SeasonStats, PlayersDirectory,
  // MatchDisplay, PublicScoreboard, PlayerPage, GameReport, publicdata JSON.
  // See Web.js doGet().
  const GAS_BASE = 'https://script.google.com/macros/s/AKfycbzuzujnOWumYMPb64hQw6LCiAGPVqDd79WnBQa8X6ZabAxrNUhVVAHfHYJnCKvxlBvD/exec';

  const ADMIN_PASSCODE = 'cpbl2026';
  const ADMIN_STORAGE_KEY = 'cpbl_admin_unlocked';

  const ROUTES = {
    home:         { kind: 'page' },
    schedule:     { kind: 'page', onEnter: renderSchedule },
    scores:       { kind: 'page', onEnter: renderScores },
    standings:    { kind: 'page', onEnter: renderStandings },
    rules:        { kind: 'page' },
    registration: { kind: 'page' },
    feedback:     { kind: 'iframe', url: `${GAS_BASE}?page=request` },

    seasonstats:  { kind: 'iframe', url: `${GAS_BASE}?page=seasonstats` },
    players:      { kind: 'iframe', url: `${GAS_BASE}?page=players` },
    scoreboard:   { kind: 'iframe', url: `${GAS_BASE}?page=scoreboard` },
    gamereport:   { kind: 'iframe', urlFn: id => `${GAS_BASE}?page=gamereport&matchId=${encodeURIComponent(id)}`, hidden: true },

    captain:      { kind: 'iframe', url: `${GAS_BASE}?page=captain`,      admin: true },
    display:      { kind: 'iframe', url: `${GAS_BASE}?page=display`,      admin: true },
    scorecard:    { kind: 'iframe', url: `${GAS_BASE}?page=scorecard`,    admin: true },
    requests:     { kind: 'iframe', url: `${GAS_BASE}?page=requestadmin`, admin: true },
  };

  const app          = document.getElementById('app');
  const toggleBtn    = document.getElementById('toggleSidebar');
  const backdrop     = document.getElementById('backdrop');
  const iframe       = document.getElementById('appFrame');
  const adminToggle  = document.getElementById('adminToggle');
  const adminLockLbl = document.getElementById('adminLockLabel');
  const adminChildren= document.getElementById('adminChildren');
  const adminLoginBtn= document.getElementById('adminLoginBtn');
  const authBackdrop = document.getElementById('authBackdrop');
  const authInput    = document.getElementById('authInput');
  const authError    = document.getElementById('authError');
  const authSubmit   = document.getElementById('authSubmit');
  const authCancel   = document.getElementById('authCancel');

  const pages = Array.from(document.querySelectorAll('.page'));
  const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

  // ---------- Sidebar ----------
  toggleBtn.addEventListener('click', () => {
    if (isMobile()) app.classList.toggle('is-mobile-open');
    else app.classList.toggle('is-collapsed');
  });
  backdrop.addEventListener('click', () => app.classList.remove('is-mobile-open'));

  // ---------- Admin unlock ----------
  const isUnlocked = () => sessionStorage.getItem(ADMIN_STORAGE_KEY) === '1';

  function applyUnlockUI() {
    const unlocked = isUnlocked();
    adminLockLbl.textContent = unlocked ? 'UNLOCKED' : 'LOCKED';
    adminLockLbl.style.background = unlocked ? 'rgba(11,126,57,.14)' : 'rgba(201,106,0,.14)';
    adminLockLbl.style.color = unlocked ? 'var(--ok)' : 'var(--warn)';
    adminLoginBtn.textContent = unlocked ? 'Sign out' : 'Sign in';
  }
  function openAdminChildren()  { adminToggle.classList.add('is-open');    adminChildren.classList.add('is-open'); }
  function closeAdminChildren() { adminToggle.classList.remove('is-open'); adminChildren.classList.remove('is-open'); }

  adminToggle.addEventListener('click', () => {
    if (!isUnlocked()) return openAuthModal();
    adminChildren.classList.contains('is-open') ? closeAdminChildren() : openAdminChildren();
  });

  adminLoginBtn.addEventListener('click', () => {
    if (isUnlocked()) {
      sessionStorage.removeItem(ADMIN_STORAGE_KEY);
      closeAdminChildren();
      applyUnlockUI();
      const active = document.querySelector('.nav-item.is-active');
      if (active && active.dataset.admin === '1') navigate('home');
    } else openAuthModal();
  });

  function openAuthModal() {
    authBackdrop.classList.add('is-open');
    authInput.value = '';
    authError.textContent = '';
    setTimeout(() => authInput.focus(), 50);
  }
  function closeAuthModal() { authBackdrop.classList.remove('is-open'); }
  function submitAuth() {
    if (authInput.value === ADMIN_PASSCODE) {
      sessionStorage.setItem(ADMIN_STORAGE_KEY, '1');
      applyUnlockUI();
      openAdminChildren();
      closeAuthModal();
    } else {
      authError.textContent = 'Incorrect code.';
      authInput.focus();
      authInput.select();
    }
  }
  authSubmit.addEventListener('click', submitAuth);
  authCancel.addEventListener('click', closeAuthModal);
  authInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  authBackdrop.addEventListener('click', e => { if (e.target === authBackdrop) closeAuthModal(); });

  // ---------- Navigation ----------
  function setActive(routeKey) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('is-active', el.dataset.route === routeKey);
    });
  }
  function showPage(routeKey) {
    pages.forEach(p => { p.style.display = (p.id === `page-${routeKey}`) ? '' : 'none'; });
    iframe.style.display = 'none';
    if (iframe.src && iframe.src !== 'about:blank') iframe.src = 'about:blank';
  }
  function showIframe(url) {
    pages.forEach(p => { p.style.display = 'none'; });
    iframe.style.display = 'block';
    if (iframe.src !== url) iframe.src = url;
  }

  function navigate(routeKey, param) {
    const route = ROUTES[routeKey];
    if (!route) return navigate('home');
    if (route.admin && !isUnlocked()) return openAuthModal();

    if (!route.hidden) setActive(routeKey);

    if (route.kind === 'page') {
      showPage(routeKey);
      if (route.onEnter) route.onEnter();
    } else if (route.kind === 'iframe') {
      const url = route.urlFn ? route.urlFn(param) : route.url;
      showIframe(url);
    }

    if (isMobile()) app.classList.remove('is-mobile-open');

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

  // ==========================================================================
  //                           DATA + RENDERERS
  // ==========================================================================

  let publicData = null;
  let publicDataPromise = null;

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

  function isCompleted(status) {
    return status === 'completed' || status === 'finalized';
  }

  function parseMatchDate(m) {
    // match_date may be "2026-04-21" or "4/21/2026"; start_time may be "7:00 PM"
    const d = (m.match_date || '').trim();
    if (!d) return null;
    let iso = d;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(d)) {
      const [mo, da, yr] = d.split('/');
      const y = yr.length === 2 ? `20${yr}` : yr;
      iso = `${y}-${mo.padStart(2,'0')}-${da.padStart(2,'0')}`;
    }
    const t = (m.start_time || '').trim();
    return new Date(`${iso}${t ? `T${to24h(t)}` : 'T00:00:00'}`);
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
  // SCHEDULE
  // ==========================================================================

  async function renderSchedule() {
    const body = document.getElementById('schedule-body');
    if (body.dataset.loaded !== '1') body.innerHTML = '<div class="loading-card">Loading schedule…</div>';

    let data;
    try {
      data = await fetchPublicData();
    } catch (err) {
      body.innerHTML = errorCard(err.message);
      body.querySelector('[data-retry]').addEventListener('click', () => { body.dataset.loaded = ''; renderSchedule(); });
      return;
    }

    const filter = document.querySelector('[data-filter="schedule-division"]');
    if (filter.options.length <= 1) {
      populateDivisionFilter(filter, data.divisions);
      filter.addEventListener('change', renderSchedule);
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');

    const divisionFilter = filter.value;
    const upcoming = data.matches
      .filter(m => !isCompleted(m.status))
      .filter(m => !divisionFilter || m.division_id === divisionFilter)
      .map(m => ({ ...m, _date: parseMatchDate(m) }))
      .sort((a,b) => {
        if (!a._date && !b._date) return 0;
        if (!a._date) return 1;
        if (!b._date) return -1;
        return a._date - b._date;
      });

    if (!upcoming.length) {
      body.innerHTML = '<div class="empty-card">No upcoming matches.</div>';
      body.dataset.loaded = '1';
      return;
    }

    const groups = {};
    upcoming.forEach(m => {
      const k = weekKey(m._date);
      (groups[k] = groups[k] || []).push(m);
    });

    const sortedKeys = Object.keys(groups).sort((a,b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return a.localeCompare(b);
    });

    body.innerHTML = sortedKeys.map(k => `
      <section class="data-group">
        <h2 class="data-group-title">${weekLabel(k)}</h2>
        <div class="match-list">
          ${groups[k].map(m => matchCardHtml(m, teamsById, divsById, false)).join('')}
        </div>
      </section>
    `).join('');
    body.dataset.loaded = '1';
  }

  function matchCardHtml(m, teamsById, divsById, withScores) {
    const home = teamName(teamsById, m.home_team_id);
    const away = teamName(teamsById, m.away_team_id);
    const div  = divisionName(divsById, m.division_id);

    const dateStr = m._date ? fmtDate(m._date) : 'Date TBD';
    const timeStr = m._date && m.start_time ? fmtTime(m._date) : '';
    const homeWon = m.winning_team_id && m.winning_team_id === m.home_team_id;
    const awayWon = m.winning_team_id && m.winning_team_id === m.away_team_id;

    const scores = withScores
      ? `<div class="match-scores">
           <span class="score ${homeWon ? 'is-winner' : ''}">${m.home_games_won ?? ''}</span>
           <span class="score-sep">—</span>
           <span class="score ${awayWon ? 'is-winner' : ''}">${m.away_games_won ?? ''}</span>
         </div>`
      : '';

    const action = withScores
      ? `<div class="match-actions">
           <button class="btn-ghost btn-sm" data-route="gamereport" data-param="${escapeHtml(m.match_id)}">
             View Game Report
             <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="9 18 15 12 9 6"/>
             </svg>
           </button>
         </div>`
      : '';

    return `
      <article class="match-card ${withScores ? 'is-result' : ''}">
        <div class="match-meta">
          <div class="match-date">
            <div class="match-date-day">${escapeHtml(dateStr)}</div>
            ${timeStr ? `<div class="match-date-time">${escapeHtml(timeStr)}</div>` : ''}
          </div>
          ${div ? `<span class="division-pill">${escapeHtml(div)}</span>` : ''}
        </div>
        <div class="match-main">
          <div class="match-teams">
            <div class="match-team ${homeWon ? 'is-winner' : ''}">${escapeHtml(home)}</div>
            <div class="match-vs">vs</div>
            <div class="match-team ${awayWon ? 'is-winner' : ''}">${escapeHtml(away)}</div>
          </div>
          ${scores}
        </div>
        ${m.venue ? `<div class="match-venue">${escapeHtml(m.venue)}</div>` : ''}
        ${action}
      </article>`;
  }

  // ==========================================================================
  // SCORES
  // ==========================================================================

  async function renderScores() {
    const body = document.getElementById('scores-body');
    if (body.dataset.loaded !== '1') body.innerHTML = '<div class="loading-card">Loading scores…</div>';

    let data;
    try {
      data = await fetchPublicData();
    } catch (err) {
      body.innerHTML = errorCard(err.message);
      body.querySelector('[data-retry]').addEventListener('click', () => { body.dataset.loaded = ''; renderScores(); });
      return;
    }

    const filter = document.querySelector('[data-filter="scores-division"]');
    if (filter.options.length <= 1) {
      populateDivisionFilter(filter, data.divisions);
      filter.addEventListener('change', renderScores);
    }

    const teamsById = indexBy(data.teams, 'team_id');
    const divsById  = indexBy(data.divisions, 'division_id');

    const divisionFilter = filter.value;
    const completed = data.matches
      .filter(m => isCompleted(m.status))
      .filter(m => !divisionFilter || m.division_id === divisionFilter)
      .map(m => ({ ...m, _date: parseMatchDate(m) }))
      .sort((a,b) => {
        if (!a._date && !b._date) return 0;
        if (!a._date) return 1;
        if (!b._date) return -1;
        return b._date - a._date;
      });

    if (!completed.length) {
      body.innerHTML = '<div class="empty-card">No completed matches yet.</div>';
      body.dataset.loaded = '1';
      return;
    }

    body.innerHTML = `
      <div class="match-list">
        ${completed.map(m => matchCardHtml(m, teamsById, divsById, true)).join('')}
      </div>`;
    body.dataset.loaded = '1';
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

  // ---------- Init ----------
  applyUnlockUI();
  const [initialKey, initialParam] = (location.hash || '#home').slice(1).split('/');
  navigate(ROUTES[initialKey] ? initialKey : 'home', initialParam);
})();
