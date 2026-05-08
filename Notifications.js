/**
 * Lineup submission notifications.
 *
 * Called from submitCaptainLineup after the lineup has been persisted.
 * Wrapped in try/catch at the top level — email/Telegram failures must
 * never break a lineup submission.
 *
 * League rule: away submits first; once a captain hits submit, that
 * team's lineup is public. Sending the full lineup to all recipients
 * (including the opposing captain) is consistent with that — the
 * opposing captain has already submitted by the time they get this.
 *
 * Recipients (multi-select per league config):
 *   - Opposing captain(s)        (Users.role_type=captain, other team)
 *   - Submitting captain          (confirmation copy)
 *   - Division directors          (role_type=director, club in this match)
 *   - League commissioners        (role_type=commissioner)
 */
function notifyLineupSubmitted_(matchId, teamId, access) {
  try {
    const cleanMatchId = String(matchId || '').trim();
    const cleanTeamId  = String(teamId  || '').trim();
    if (!cleanMatchId || !cleanTeamId) return;

    const match = getObjects_(SHEETS.MATCHES)
      .find(m => String(m.match_id || '').trim() === cleanMatchId);
    if (!match) return;

    const teams = getObjects_(SHEETS.TEAMS);
    const clubs = getObjects_(SHEETS.CLUBS);
    const divisions = getObjects_(SHEETS.DIVISIONS);

    const homeTeamId = String(match.home_team_id || '').trim();
    const awayTeamId = String(match.away_team_id || '').trim();
    const homeTeam = teams.find(t => String(t.team_id || '').trim() === homeTeamId) || null;
    const awayTeam = teams.find(t => String(t.team_id || '').trim() === awayTeamId) || null;

    const submitterIsHome = cleanTeamId === homeTeamId;
    const submittingTeam  = submitterIsHome ? homeTeam : awayTeam;
    const opponentTeam    = submitterIsHome ? awayTeam : homeTeam;
    if (!submittingTeam) return;

    const division = divisions.find(d =>
      String(d.division_id || '').trim() === String(match.division_id || '').trim()
    ) || null;

    const games = getObjects_(SHEETS.MATCH_GAMES)
      .filter(g => String(g.match_id || '').trim() === cleanMatchId)
      .sort((a, b) =>
        Number(a.round_number || 0) - Number(b.round_number || 0) ||
        Number(a.game_number_in_round || 0) - Number(b.game_number_in_round || 0)
      );

    const playerById = {};
    getObjects_(SHEETS.PLAYERS).forEach(p => {
      const id = String(p.player_id || '').trim();
      if (!id) return;
      playerById[id] = String(
        p.full_name || p.name ||
        [p.first_name, p.last_name].filter(Boolean).join(' ') || id
      ).trim();
    });

    const recipients = collectLineupNotificationRecipients_({
      submittingTeamId: cleanTeamId,
      opponentTeamId: submitterIsHome ? awayTeamId : homeTeamId,
      homeTeam,
      awayTeam,
      submitterEmail: String((access && access.email) || '').trim().toLowerCase()
    });
    if (!recipients.length) return;

    const subject = buildLineupEmailSubject_(match, submittingTeam, opponentTeam, division);
    const body = buildLineupEmailBody_({
      match,
      division,
      submittingTeam,
      opponentTeam,
      submitterIsHome,
      submitterName: String((access && access.name) || access && access.email || '').trim(),
      games,
      playerById
    });

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      body: body,
      name: 'CPBL Lineup Notifications',
      noReply: true
    });

    sendLineupTelegramNotification_({
      match,
      division,
      submittingTeam,
      opponentTeam,
      submitterIsHome,
      submitterName: String((access && access.name) || access && access.email || '').trim(),
      games,
      playerById
    });
  } catch (e) {
    Logger.log('notifyLineupSubmitted_ failed: ' + (e && e.stack || e));
  }
}

function collectLineupNotificationRecipients_(args) {
  const out = new Set();
  const submittingTeamId = String(args.submittingTeamId || '').trim();
  const opponentTeamId   = String(args.opponentTeamId   || '').trim();
  const submitterEmail   = String(args.submitterEmail   || '').trim().toLowerCase();

  const homeClubId = String((args.homeTeam && args.homeTeam.club_id) || '').trim();
  const awayClubId = String((args.awayTeam && args.awayTeam.club_id) || '').trim();
  const matchClubIds = new Set([homeClubId, awayClubId].filter(Boolean));

  const users = getObjects_(SHEETS.USERS).filter(u =>
    u.active === undefined || u.active === '' || normalizeBoolValue_(u.active)
  );

  users.forEach(u => {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) return;
    const role = String(u.role_type || '').trim().toLowerCase();
    const userTeamId = String(u.team_id || '').trim();
    const userClubId = String(u.club_id || '').trim();

    // Opposing captain(s): captain rows for the other team.
    if (role === ROLE.CAPTAIN && opponentTeamId && userTeamId === opponentTeamId) {
      out.add(email);
      return;
    }

    // Director rows for a club in this match.
    if (role === ROLE.DIRECTOR && userClubId && matchClubIds.has(userClubId)) {
      out.add(email);
      return;
    }

    // All commissioners.
    if (role === ROLE.COMMISSIONER) {
      out.add(email);
      return;
    }
  });

  // Confirmation copy back to the submitter.
  if (submitterEmail) out.add(submitterEmail);

  return Array.from(out);
}

function buildLineupEmailSubject_(match, submittingTeam, opponentTeam, division) {
  const matchDate = String(match && match.match_date || '').trim();
  const divName   = (division && division.division_name) || (match && match.division_id) || '';
  const submitter = (submittingTeam && submittingTeam.team_name) || (submittingTeam && submittingTeam.team_id) || '';
  const opponent  = (opponentTeam  && opponentTeam.team_name)  || (opponentTeam  && opponentTeam.team_id)  || '';

  const parts = [
    'CPBL lineup submitted',
    submitter && opponent ? `— ${submitter} vs ${opponent}` : '',
    divName ? `(${divName})` : '',
    matchDate ? `— ${matchDate}` : ''
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildLineupEmailBody_(ctx) {
  const lines = [];
  const matchDate  = String(ctx.match && ctx.match.match_date || '').trim();
  const startTime  = String(ctx.match && ctx.match.start_time || '').trim();
  const venue      = String(ctx.match && ctx.match.venue || '').trim();
  const divName    = (ctx.division && ctx.division.division_name) || (ctx.match && ctx.match.division_id) || '';
  const submitter  = (ctx.submittingTeam && ctx.submittingTeam.team_name) || (ctx.submittingTeam && ctx.submittingTeam.team_id) || 'Team';
  const opponent   = (ctx.opponentTeam   && ctx.opponentTeam.team_name)   || (ctx.opponentTeam   && ctx.opponentTeam.team_id)   || 'Opponent';
  const sideLabel  = ctx.submitterIsHome ? 'home' : 'away';

  lines.push(`${submitter} (${sideLabel}) submitted a lineup against ${opponent}.`);
  if (ctx.submitterName) lines.push(`Submitted by: ${ctx.submitterName}`);
  if (matchDate) lines.push(`Match date: ${matchDate}${startTime ? ' ' + startTime : ''}`);
  if (venue) lines.push(`Venue: ${venue}`);
  if (divName) lines.push(`Division: ${divName}`);
  lines.push('');
  lines.push('Lineup:');
  lines.push('');

  let lastRound = null;
  ctx.games.forEach(g => {
    const round = Number(g.round_number || 0);
    if (round !== lastRound) {
      lines.push(`Round ${round || '?'}`);
      lastRound = round;
    }

    const gameInRound = Number(g.game_number_in_round || 0);
    const gameType = String(g.game_type || '').trim();
    const p1Id = ctx.submitterIsHome
      ? String(g.home_player_1_id || '').trim()
      : String(g.away_player_1_id || '').trim();
    const p2Id = ctx.submitterIsHome
      ? String(g.home_player_2_id || '').trim()
      : String(g.away_player_2_id || '').trim();
    const p1 = p1Id ? (ctx.playerById[p1Id] || p1Id) : '—';
    const p2 = p2Id ? (ctx.playerById[p2Id] || p2Id) : '—';

    lines.push(`  Game ${gameInRound || '?'} (${gameType || 'game'}): ${p1} / ${p2}`);
  });

  lines.push('');
  lines.push('View on the league site: https://ctpbleague.com');
  lines.push('');
  lines.push('— CPBL Lineup Notifications');

  return lines.join('\n');
}

/**
 * One-time setup: store the Telegram bot token + chat id in Script Properties
 * so they don't live in source control. Run once from the GAS console:
 *
 *   setTelegramCredentials('123456:abcdef...', '-1003758690267')
 *
 * Re-run any time you rotate the token. To remove them entirely:
 *   PropertiesService.getScriptProperties().deleteProperty('TELEGRAM_BOT_TOKEN')
 *   PropertiesService.getScriptProperties().deleteProperty('TELEGRAM_CHAT_ID')
 */
function setTelegramCredentials(botToken, chatId) {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    TELEGRAM_BOT_TOKEN: String(botToken || '').trim(),
    TELEGRAM_CHAT_ID:   String(chatId   || '').trim()
  });
  return { ok: true };
}

function sendLineupTelegramNotification_(ctx) {
  try {
    const props  = PropertiesService.getScriptProperties();
    const token  = props.getProperty('TELEGRAM_BOT_TOKEN');
    const chatId = props.getProperty('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      Logger.log('Telegram credentials not set; skipping Telegram notification.');
      return;
    }

    const text = buildLineupTelegramText_(ctx);
    const url = 'https://api.telegram.org/bot' + encodeURIComponent(token) + '/sendMessage';
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code >= 300) {
      Logger.log('Telegram sendMessage HTTP ' + code + ': ' + resp.getContentText());
    }
  } catch (e) {
    Logger.log('sendLineupTelegramNotification_ failed: ' + (e && e.stack || e));
  }
}

function buildLineupTelegramText_(ctx) {
  const submitter = (ctx.submittingTeam && ctx.submittingTeam.team_name) || (ctx.submittingTeam && ctx.submittingTeam.team_id) || 'Team';
  const opponent  = (ctx.opponentTeam   && ctx.opponentTeam.team_name)   || (ctx.opponentTeam   && ctx.opponentTeam.team_id)   || 'Opponent';
  const sideLabel = ctx.submitterIsHome ? 'home' : 'away';
  const divName   = (ctx.division && ctx.division.division_name) || (ctx.match && ctx.match.division_id) || '';
  const matchDate = String(ctx.match && ctx.match.match_date || '').trim();
  const startTime = String(ctx.match && ctx.match.start_time || '').trim();

  const lines = [];
  lines.push(
    '<b>Lineup submitted:</b> ' + escapeTelegramHtml_(submitter) +
    ' (' + sideLabel + ') vs ' + escapeTelegramHtml_(opponent)
  );
  const meta = [
    divName ? escapeTelegramHtml_(divName) : '',
    matchDate ? escapeTelegramHtml_(matchDate) + (startTime ? ' ' + escapeTelegramHtml_(startTime) : '') : ''
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(' • '));
  if (ctx.submitterName) lines.push('By ' + escapeTelegramHtml_(ctx.submitterName));
  lines.push('');

  let lastRound = null;
  ctx.games.forEach(g => {
    const round = Number(g.round_number || 0);
    if (round !== lastRound) {
      lines.push('<b>Round ' + (round || '?') + '</b>');
      lastRound = round;
    }

    const gameInRound = Number(g.game_number_in_round || 0);
    const gameType = String(g.game_type || '').trim();
    const p1Id = ctx.submitterIsHome
      ? String(g.home_player_1_id || '').trim()
      : String(g.away_player_1_id || '').trim();
    const p2Id = ctx.submitterIsHome
      ? String(g.home_player_2_id || '').trim()
      : String(g.away_player_2_id || '').trim();
    const p1 = p1Id ? (ctx.playerById[p1Id] || p1Id) : '—';
    const p2 = p2Id ? (ctx.playerById[p2Id] || p2Id) : '—';

    lines.push(
      '  G' + (gameInRound || '?') +
      (gameType ? ' (' + escapeTelegramHtml_(gameType) + ')' : '') +
      ': ' + escapeTelegramHtml_(p1) + ' / ' + escapeTelegramHtml_(p2)
    );
  });

  lines.push('');
  lines.push('https://ctpbleague.com');

  return lines.join('\n');
}

function escapeTelegramHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
