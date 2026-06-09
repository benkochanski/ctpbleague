// Registration page logic. Loaded by index.html; initialized on first nav to /registration.
//
// Flow:
//   1) Fetch /publicdata-style form data (clubs, teams, divisions, season)
//   2) Optional: user clicks "Link DUPR" → opens DUPR SSO iframe in modal
//   3) postMessage from DUPR captures duprId / userToken / stats → prefills name + rating
//   4) Form submit POSTs to GAS ?page=register

(() => {
  'use strict';

  // ---- Config ----
  // DUPR partner client key (PUBLIC — only the secret stays server-side).
  // UAT for now; swap to the production key once DUPR issues one.
  const DUPR_ENV = 'uat';
  const DUPR_CLIENT_KEY = 'test-ck-ca475af7-cd72-43de-fd43-5ae91e64e26d';
  const DUPR_SSO_BASE = DUPR_ENV === 'prod'
    ? 'https://dashboard.dupr.com/login-external-app'
    : 'https://uat.dupr.gg/login-external-app';
  const DUPR_ALLOWED_ORIGIN = DUPR_ENV === 'prod'
    ? 'https://dashboard.dupr.com'
    : 'https://uat.dupr.gg';

  // GAS base URL is set by app.js into window.__CPBL_GAS_BASE__ at boot.
  function gasBase() {
    return window.__CPBL_GAS_BASE__ || '';
  }

  // ---- State ----
  let initialized = false;
  let formData = null;          // { clubs, teams, divisions, season }
  let duprSession = null;       // { duprId, userToken, refreshToken, fullName, rating? }

  const $ = id => document.getElementById(id);

  // ---- Init ----
  async function init() {
    if (initialized) return;
    initialized = true;

    // Load form bootstrap data.
    try {
      const r = await fetch(gasBase() + '?page=regdata', { method: 'GET' });
      formData = await r.json();
    } catch (e) {
      console.error('regdata load failed', e);
      formData = { clubs: [], teams: [], divisions: [], season: null };
    }

    if (formData.season && formData.season.season_name) {
      $('regSeasonBadge').textContent = formData.season.season_name;
    }
    populateClubSelect();
    wireEvents();
  }

  function populateClubSelect() {
    const sel = $('regClubSelect');
    sel.innerHTML = '<option value="">Select a club…</option>';
    (formData.clubs || [])
      .slice()
      .sort((a, b) => String(a.club_name).localeCompare(String(b.club_name)))
      .forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.club_id;
        opt.textContent = c.club_name;
        sel.appendChild(opt);
      });
  }

  function populateTeamSelect(clubId) {
    const sel = $('regTeamSelect');
    sel.innerHTML = '<option value="">—</option>';
    if (!clubId) return;
    (formData.teams || [])
      .filter(t => String(t.club_id) === String(clubId))
      .slice()
      .sort((a, b) => String(a.team_name).localeCompare(String(b.team_name)))
      .forEach(t => {
        const div = (formData.divisions || []).find(d => String(d.division_id) === String(t.division_id));
        const opt = document.createElement('option');
        opt.value = t.team_id;
        opt.textContent = t.team_name + (div ? ' · ' + div.division_name : '');
        sel.appendChild(opt);
      });
  }

  // ---- DUPR SSO ----
  function openDuprModal() {
    const frame = $('regDuprFrame');
    const clientKey64 = btoa(DUPR_CLIENT_KEY);
    frame.src = `${DUPR_SSO_BASE}/${clientKey64}`;
    $('regDuprModal').style.display = 'flex';
  }
  function closeDuprModal() {
    $('regDuprModal').style.display = 'none';
    $('regDuprFrame').src = 'about:blank';
  }

  function applyDuprSession(d) {
    duprSession = d;
    $('regDuprStatus').textContent = '✓ Linked';
    $('regDuprStatus').classList.add('is-linked');
    $('regDuprCard').style.display = 'block';
    $('regDuprName').textContent = d.fullName || d.duprId;
    $('regDuprId').textContent = d.duprId;
    $('regDuprRating').textContent = d.rating != null ? `Rating: ${d.rating}` : '';
    // Prefill the form.
    const form = $('regForm');
    if (d.fullName) {
      const parts = String(d.fullName).trim().split(/\s+/);
      if (parts.length > 1) {
        if (!form.firstName.value) form.firstName.value = parts.slice(0, -1).join(' ');
        if (!form.lastName.value) form.lastName.value = parts.slice(-1).join(' ');
      } else if (!form.firstName.value) {
        form.firstName.value = parts[0] || '';
      }
    }
    if (d.email && !form.email.value) form.email.value = d.email;
    if (d.rating != null && !form.dupr.value) form.dupr.value = d.rating;
    closeDuprModal();
  }

  function clearDuprSession() {
    duprSession = null;
    $('regDuprStatus').textContent = 'Not linked';
    $('regDuprStatus').classList.remove('is-linked');
    $('regDuprCard').style.display = 'none';
  }

  // Listen for DUPR iframe postMessage. We accept on env-matched origin.
  window.addEventListener('message', async (ev) => {
    if (!ev || !ev.data) return;
    if (ev.origin !== DUPR_ALLOWED_ORIGIN) return;
    let d = ev.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    const duprId = d.id || d.duprId;
    const userToken = d.userToken || d.token;
    if (!duprId || !userToken) return;
    // Try to extract a rating from the stats payload (shape varies — keep it lenient).
    let rating = null;
    if (d.stats) {
      rating = d.stats.doubles ?? d.stats.doublesRating ?? d.stats.singles ?? null;
      if (rating != null && typeof rating === 'object') rating = rating.rating ?? rating.value ?? null;
    }
    applyDuprSession({
      duprId,
      userToken,
      refreshToken: d.refreshToken,
      fullName: d.fullName || d.name || '',
      email: d.email || '',
      rating,
    });
  });

  // ---- Submit ----
  async function submit(e) {
    e.preventDefault();
    const btn = $('regSubmitBtn');
    const msg = $('regSubmitMsg');
    msg.textContent = '';
    msg.classList.remove('is-err', 'is-ok');
    btn.disabled = true;

    const form = $('regForm');
    const payload = {
      firstName: form.firstName.value.trim(),
      lastName:  form.lastName.value.trim(),
      email:     form.email.value.trim(),
      phone:     form.phone.value.trim(),
      gender:    form.gender.value,
      dupr:      form.dupr.value,
      clubId:    form.clubId.value,
      teamId:    form.teamId.value,
      duprId:        duprSession ? duprSession.duprId : '',
      duprUserToken: duprSession ? duprSession.userToken : '',
    };

    try {
      // text/plain content-type bypasses CORS preflight against script.google.com.
      const res = await fetch(gasBase() + '?page=register', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (j.ok) {
        msg.textContent = `✓ Registered! Your player ID is ${j.player_id}. A commissioner will confirm your team assignment.`;
        msg.classList.add('is-ok');
        form.reset();
        clearDuprSession();
      } else {
        msg.textContent = j.error || 'Submission failed.';
        msg.classList.add('is-err');
      }
    } catch (err) {
      msg.textContent = 'Network error — please try again.';
      msg.classList.add('is-err');
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  function wireEvents() {
    $('regLinkDuprBtn').addEventListener('click', openDuprModal);
    $('regSkipDuprBtn').addEventListener('click', () => {
      $('regStepDupr').classList.add('is-skipped');
      $('regDuprStatus').textContent = 'Skipped';
      document.querySelector('#regForm input[name="firstName"]').focus();
    });
    $('regUnlinkDuprBtn').addEventListener('click', clearDuprSession);
    $('regDuprClose').addEventListener('click', closeDuprModal);
    $('regDuprBackdrop').addEventListener('click', closeDuprModal);
    $('regClubSelect').addEventListener('change', e => populateTeamSelect(e.target.value));
    $('regForm').addEventListener('submit', submit);
  }

  // Exposed so app.js can call this on route enter.
  window.cpblInitRegistration = init;
})();
