function validateTeamLineup_(match, teamId, assignments, existingGames) {
  const playersById = buildValidationPlayersById_();
  const eligibleIds = buildEligiblePlayerIdSetForTeam_(match, teamId);

  const roundUsage = {};
  const pairCounts = {};

  (assignments || []).forEach(a => {
    const game = (existingGames || []).find(
      g => String(g.game_id || '').trim() === String(a.game_id || '').trim()
    );
    if (!game) throw new Error(`Game not found: ${a.game_id}`);

    const p1 = String(a.player_1_id || '').trim();
    const p2 = String(a.player_2_id || '').trim();

    if (!p1 && !p2) return;
    if (!p1 || !p2) throw new Error(`Game ${game.game_sequence} must have two players`);
    if (p1 === p2) throw new Error(`Same player used twice in Game ${game.game_sequence}`);

    if (!eligibleIds.has(p1)) throw new Error(`Player ${p1} is not eligible for this match`);
    if (!eligibleIds.has(p2)) throw new Error(`Player ${p2} is not eligible for this match`);

    const roundKey = String(game.round_number || '');
    roundUsage[roundKey] = roundUsage[roundKey] || new Set();

    if (roundUsage[roundKey].has(p1) || roundUsage[roundKey].has(p2)) {
      throw new Error(`A player is being used more than once in round ${game.round_number}`);
    }

    roundUsage[roundKey].add(p1);
    roundUsage[roundKey].add(p2);

    const player1 = playersById[p1];
    const player2 = playersById[p2];

    if (!player1 || !player2) {
      throw new Error(`Player not found in Game ${game.game_sequence}`);
    }

    Logger.log(JSON.stringify({
      game_id: String(game.game_id || '').trim(),
      game_sequence: Number(game.game_sequence || 0),
      round_number: Number(game.round_number || 0),
      game_number_in_round: Number(game.game_number_in_round || 0),
      game_type: String(game.game_type || '').trim(),
      p1: p1,
      p1_name: player1.full_name,
      p1_gender: player1.gender,
      p2: p2,
      p2_name: player2.full_name,
      p2_gender: player2.gender
    }));

    validateGameType_(match, game, player1, player2);

    const pairKey = [p1, p2].sort().join('|');
    const nextCount = (pairCounts[pairKey] || 0) + 1;
    const maxAllowed = maxPairingsAllowedServer_(match, player1, player2);

    if (nextCount > maxAllowed) {
      throw new Error(
        `Players ${player1.full_name} and ${player2.full_name} cannot be partnered more than ${maxAllowed} times`
      );
    }

    pairCounts[pairKey] = nextCount;
  });
}

function validateGameType_(match, game, p1, p2) {
  const t = normalizedGameTypeForMatchValidation_(match, game);
  const g1 = normalizeGenderForValidation_(p1 && p1.gender);
  const g2 = normalizeGenderForValidation_(p2 && p2.gender);

  if (t === 'mens') {
    if (!(g1 === 'M' && g2 === 'M')) {
      throw new Error(`Mens game requires two men. Got ${p1.full_name || p1.player_id} (${g1 || 'blank'}) and ${p2.full_name || p2.player_id} (${g2 || 'blank'})`);
    }
    return;
  }

  if (t === 'womens') {
    if (!(g1 === 'F' && g2 === 'F')) {
      throw new Error(`Womens game requires two women. Got ${p1.full_name || p1.player_id} (${g1 || 'blank'}) and ${p2.full_name || p2.player_id} (${g2 || 'blank'})`);
    }
    return;
  }

  if (t === 'mixed') {
    const genders = [g1, g2].sort().join('');
    if (genders !== 'FM') {
      throw new Error(`Mixed game requires one man and one woman. Got ${p1.full_name || p1.player_id} (${g1 || 'blank'}) and ${p2.full_name || p2.player_id} (${g2 || 'blank'})`);
    }
    return;
  }

  if (t === 'coed') return;

  throw new Error(`Unknown game type: ${game && game.game_type}`);
}

function isPairingExempt_(divisionId, gameType, p1, p2) {
  return String(divisionId || '').trim().toUpperCase() === 'DIV1' &&
         normalizeGameTypeForValidation_(gameType) === 'womens' &&
         normalizeGenderForValidation_(p1 && p1.gender) === 'F' &&
         normalizeGenderForValidation_(p2 && p2.gender) === 'F';
}

function buildValidationPlayersById_() {
  const out = {};
  getObjects_(SHEETS.PLAYERS).forEach(p => {
    const playerId = String(p.player_id || '').trim();
    if (!playerId) return;

    out[playerId] = {
      player_id: playerId,
      full_name: String(p.full_name || p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '').trim(),
      gender: normalizeGenderForValidation_(p.gender)
    };
  });
  return out;
}

function normalizeGenderForValidation_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (['f', 'w', 'female', 'woman', 'women'].includes(s)) return 'F';
  if (['m', 'male', 'man', 'men'].includes(s)) return 'M';
  return String(value || '').trim().toUpperCase();
}

function normalizeGameTypeForValidation_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'men' || s === 'mens' || s === "men's") return 'mens';
  if (s === 'women' || s === 'womens' || s === "women's") return 'womens';
  if (s === 'coed' || s === 'co-ed') return 'coed';
  if (s === 'mixed') return 'mixed';
  return s;
}

function isStandardTemplateMatchForValidation_(match) {
  return getDivisionNumberFromMatch_(match) !== 1;
}

function normalizedGameTypeForMatchValidation_(match, game) {
  const baseType = normalizeGameTypeForValidation_(game && game.game_type);

  if (!isStandardTemplateMatchForValidation_(match)) return baseType;

  const roundNumber = Number(game && game.round_number || 0);
  const gameNumberInRound = Number(game && game.game_number_in_round || 0);

  if (roundNumber % 2 !== 1) return baseType;

  if (gameNumberInRound === 1 || gameNumberInRound === 2) return 'womens';
  if (gameNumberInRound === 3 || gameNumberInRound === 4) return 'mens';

  return baseType;
}

function getDivisionNumberFromMatch_(match) {
  const raw =
    match?.division_number ??
    match?.division_id ??
    '';

  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Lenient validator for draft saves. Skips empty games entirely and
// half-filled games (one slot picked, the other still empty), so captains
// can save mid-edit. Fully-filled games still get the full check —
// eligibility, gender/game-type match, no double-up in a round, pair-count
// limits — so we never persist a draft that already violates the rules.
function validateTeamLineupDraft_(match, teamId, assignments, existingGames) {
  const playersById = buildValidationPlayersById_();
  const eligibleIds = buildEligiblePlayerIdSetForTeam_(match, teamId);

  const roundUsage = {};
  const pairCounts = {};

  (assignments || []).forEach(a => {
    const game = (existingGames || []).find(
      g => String(g.game_id || '').trim() === String(a.game_id || '').trim()
    );
    if (!game) throw new Error(`Game not found: ${a.game_id}`);

    const p1 = String(a.player_1_id || '').trim();
    const p2 = String(a.player_2_id || '').trim();

    if (!p1 || !p2) return;  // draft: skip incomplete pairs
    if (p1 === p2) throw new Error(`Same player used twice in Game ${game.game_sequence}`);

    if (!eligibleIds.has(p1)) throw new Error(`Player ${p1} is not eligible for this match`);
    if (!eligibleIds.has(p2)) throw new Error(`Player ${p2} is not eligible for this match`);

    const roundKey = String(game.round_number || '');
    roundUsage[roundKey] = roundUsage[roundKey] || new Set();

    if (roundUsage[roundKey].has(p1) || roundUsage[roundKey].has(p2)) {
      throw new Error(`A player is being used more than once in round ${game.round_number}`);
    }
    roundUsage[roundKey].add(p1);
    roundUsage[roundKey].add(p2);

    const player1 = playersById[p1];
    const player2 = playersById[p2];
    if (!player1 || !player2) {
      throw new Error(`Player not found in Game ${game.game_sequence}`);
    }

    validateGameType_(match, game, player1, player2);

    const pairKey = [p1, p2].sort().join('|');
    const nextCount = (pairCounts[pairKey] || 0) + 1;
    const maxAllowed = maxPairingsAllowedServer_(match, player1, player2);
    if (nextCount > maxAllowed) {
      throw new Error(
        `Players ${player1.full_name} and ${player2.full_name} cannot be partnered more than ${maxAllowed} times`
      );
    }
    pairCounts[pairKey] = nextCount;
  });
}

function buildEligiblePlayerIdSetForTeam_(match, teamId) {
  const cleanTeamId = String(teamId || '').trim();
  const teams = getObjects_(SHEETS.TEAMS);
  const clubs  = getObjects_(SHEETS.CLUBS);
  const thisTeam = teams.find(t => String(t.team_id || '').trim() === cleanTeamId);
  const clubId   = thisTeam ? String(thisTeam.club_id || '').trim() : '';
  const thisClub = clubs.find(c => String(c.club_id || '').trim() === clubId);
  const divisionId = String((thisTeam && thisTeam.division_id) || (match && match.division_id) || '').trim();

  const clubNames = new Set(
    [
      thisClub && String(thisClub.club_name  || '').trim(),
      thisClub && String(thisClub.short_name || '').trim(),
      clubId
    ].filter(Boolean).map(s => s.toLowerCase())
  );

  const out = new Set();
  getObjects_(SHEETS.PLAYERS).forEach(p => {
    const activeRaw = p.active;
    if (activeRaw !== undefined && activeRaw !== '' && !normalizeBoolValue_(activeRaw)) return;
    if (clubNames.size) {
      const pClub = String(p.club || '').trim().toLowerCase();
      if (pClub && !clubNames.has(pClub)) return;
    }
    if (divisionId && p.division) {
      const pDiv = String(p.division || '').trim().toLowerCase();
      if (pDiv && pDiv !== divisionId.toLowerCase()) return;
    }
    const pid = String(p.player_id || '').trim();
    if (pid) out.add(pid);
  });
  return out;
}

function maxPairingsAllowedServer_(match, playerA, playerB) {
  const isDivision1 = getDivisionNumberFromMatch_(match) === 1;
  const isWomenPair =
    normalizeGenderForValidation_(playerA?.gender) === 'F' &&
    normalizeGenderForValidation_(playerB?.gender) === 'F';

  return (isDivision1 && isWomenPair) ? 4 : 2;
}