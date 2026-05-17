// =============================================================
// battle.js  ·  battle engine for gym + pvp + (encounter battles)
// Players use the dice input (1-6) to gate strong moves. AI
// gym leaders pick their own move with a 50/50 mix.
// =============================================================
window.GameBattle = {
  active: null, // current battle state
};

GameBattle.ensurePP = function (mon) {
  if (!mon || !mon.moves) return;
  mon.moves.forEach(mv => {
    if (mv.maxPp == null) mv.maxPp = mv.gated ? 3 : 20;
    if (mv.pp == null) mv.pp = mv.maxPp;
  });
};

GameBattle.start = function (opts) {
  // opts: { kind: 'gym'|'pvp', leader, opponentPlayer, prizePokemon, onWin, onLose }
  const player = GameState.currentPlayer();
  // Battle uses the first 3 Pokemon in party order (the highlighted battle slots).
  // For wild battles, just use the active first Pokemon that isn't fainted.
  const playerTeam = (opts.kind === 'gym' || opts.kind === 'pvp')
    ? player.party.slice(0, 3)
    : player.party.filter(m => !m.fainted);
  let oppTeam;
  let opponentLabel;
  let opponentColor;

  if (opts.kind === 'gym') {
    const leader = opts.leader;
    const leaderMul = Number(leader.scaleMultiplier) || 1;
    oppTeam = leader.team.map(spec => {
      const base = GameData.getPokemon(spec.id);
      // Per-mon `scale` (if set) overrides the level-based curve. Otherwise
      // use the level formula × the leader's gym-wide multiplier.
      const lvlBoost = (typeof spec.scale === 'number')
        ? spec.scale
        : (1 + (spec.level / 50) * 0.6) * leaderMul;
      return {
        speciesId: spec.id,
        name: base.name,
        types: base.types.slice(),
        moves: base.moves.map(m => {
          const maxPp = m.gated ? 3 : 20;
          return Object.assign({}, m, { power: Math.round(m.power * lvlBoost), pp: maxPp, maxPp });
        }),
        hp: Math.round(base.hp * lvlBoost),
        maxHp: Math.round(base.hp * lvlBoost),
        fainted: false,
      };
    });
    opponentLabel = `Gym Leader ${leader.name}`;
    opponentColor = leader.color;
  } else if (opts.kind === 'pvp') {
    const opp = opts.opponentPlayer;
    oppTeam = opp.party.filter(m => !m.fainted).slice(0, 3).map(m => ({
      speciesId: m.speciesId,
      name: m.name,
      types: m.types.slice(),
      moves: GameState.cloneMoves(m.moves),
      hp: m.maxHp,
      maxHp: m.maxHp,
      fainted: false,
    }));
    opponentLabel = `${opp.name}`;
    opponentColor = opp.color;
  } else if (opts.kind === 'wild') {
    const wild = GameData.getPokemon(opts.speciesId);
    oppTeam = [{
      speciesId: opts.speciesId,
      name: wild.name,
      types: wild.types.slice(),
      moves: GameState.cloneMoves(wild.moves),
      hp: wild.hp,
      maxHp: wild.hp,
      fainted: false,
    }];
    opponentLabel = 'Wild Pokemon';
    opponentColor = '#888';
  }

  // Defensive: backfill PP on any move that's missing it (legacy saves).
  playerTeam.forEach(m => GameBattle.ensurePP(m));
  oppTeam.forEach(m => GameBattle.ensurePP(m));

  // Use the first 3 of the party for gym/pvp (battle slots), or all non-fainted for wild
  let teamForBattle = playerTeam;
  if (opts.kind === 'gym' || opts.kind === 'pvp') {
    // Find the first non-fainted in battle slots to send out first
    const firstAlive = teamForBattle.findIndex(m => !m.fainted);
    if (firstAlive > 0) {
      // Reorder so first non-fainted is in slot 0 for battle start
      const team = teamForBattle.slice();
      const [alive] = team.splice(firstAlive, 1);
      team.unshift(alive);
      teamForBattle = team;
    }
  }

  // Apply pending 2x buffs to the LEAD Pokemon (slot 0 of teamForBattle).
  // Each pending unit equals one buffed move. They consume on use, not on faint.
  const leadMon = teamForBattle[0];
  const attackTurns = Number(player.flags.x2AttackPending) || 0;
  const defenseTurns = Number(player.flags.x2DefensePending) || 0;
  const leadX2Atk = attackTurns > 0 && leadMon && !leadMon.fainted;
  const leadX2Def = defenseTurns > 0 && leadMon && !leadMon.fainted;
  if (leadX2Atk) {
    player.flags.x2AttackPending = 0;
    GameUI.log(`<strong>${leadMon.name}</strong> enters battle with <strong>X-ATTACK</strong> (+25% Attack) for ${attackTurns} move${attackTurns === 1 ? '' : 's'}!`, 'crit');
  }
  if (leadX2Def) {
    player.flags.x2DefensePending = 0;
    GameUI.log(`<strong>${leadMon.name}</strong> enters battle with <strong>X-DEFENSE</strong> (+25% Defense) for ${defenseTurns} incoming hit${defenseTurns === 1 ? '' : 's'}!`, 'crit');
  }

  GameBattle.active = {
    kind: opts.kind,
    opts,
    opponentLabel,
    opponentColor,
    playerTeam: teamForBattle,
    oppTeam,
    playerActive: 0,
    oppActive: 0,
    awaitingDice: false,
    pendingMoveIdx: null,
    message: 'Battle start.',
    onWin: opts.onWin,
    onLose: opts.onLose,
    onBattleMonUsed: opts.onBattleMonUsed,
    // Buffs tied to the lead mon's instanceId. Each buff has a remaining
    // count of buffed actions; decremented on use (not on faint).
    buffs: {
      x2AttackOnInstance: leadX2Atk ? leadMon.instanceId : null,
      x2AttackTurns: leadX2Atk ? attackTurns : 0,
      x2DefenseOnInstance: leadX2Def ? leadMon.instanceId : null,
      x2DefenseTurns: leadX2Def ? defenseTurns : 0,
    },
  };

  // Mark the first opponent as "used" right away
  if (opts.onBattleMonUsed && oppTeam[0]) opts.onBattleMonUsed(oppTeam[0]);

  // Start battle music
  if (opts.kind === 'gym') {
    const isFinalBoss = opts.leader && opts.leader.name === 'Giovanni';
    GameAudio.startBattleMusic(isFinalBoss ? 'giovanni' : 'gym');
    GameAudio.sfx.gymStart();
  } else if (opts.kind === 'pvp') {
    GameAudio.startBattleMusic('gym');
  } else {
    GameAudio.startBattleMusic('wild');
  }

  GameUI.showBattle(GameBattle.active);
};

GameBattle.renderBattle = function (b) {
  const pMon = b.playerTeam[b.playerActive];
  const oMon = b.oppTeam[b.oppActive];
  if (!pMon || !oMon) return;

  GameUI.el('battleTitle').textContent = b.opponentLabel;
  const teamSize = b.oppTeam ? b.oppTeam.length : 3;
  GameUI.el('battleSubtitle').textContent = b.kind === 'gym'
    ? `Beat all ${teamSize} of their Pokemon`
    : b.kind === 'pvp' ? 'Trainer battle · 3v3' : 'Wild Pokemon battle';

  // Leader sprite shown only for gym battles
  const leaderImg = GameUI.el('battleLeaderSprite');
  if (b.kind === 'gym' && b.opts && b.opts.leader) {
    const leaderId = b.opts.leader.name.toLowerCase();
    leaderImg.src = `sprites/trainers/${leaderId}.png`;
    leaderImg.alt = b.opts.leader.name;
    leaderImg.hidden = false;
    leaderImg.onerror = function () { this.hidden = true; };
  } else {
    leaderImg.hidden = true;
    leaderImg.src = '';
  }

  GameUI.el('oppName').textContent = oMon.name;
  GameUI.el('oppSprite').src = GameData.spriteFront(oMon.speciesId);
  GameUI.el('oppSprite').onerror = function () { this.src = GameData.spriteStatic(oMon.speciesId); };
  GameUI.el('playerName').textContent = pMon.name;
  GameUI.el('playerSprite').src = GameData.spriteBack(pMon.speciesId);
  GameUI.el('playerSprite').onerror = function () { this.src = GameData.spriteStatic(pMon.speciesId); };

  const pPct = Math.max(0, (pMon.hp / pMon.maxHp) * 100);
  const oPct = Math.max(0, (oMon.hp / oMon.maxHp) * 100);
  const pCls = pPct > 50 ? '' : pPct > 20 ? 'mid' : 'low';
  const oCls = oPct > 50 ? '' : oPct > 20 ? 'mid' : 'low';
  GameUI.el('playerHpFill').style.width = pPct + '%';
  GameUI.el('playerHpFill').className = 'hp-fill ' + pCls;
  GameUI.el('playerHpText').textContent = `${Math.max(0, pMon.hp)} / ${pMon.maxHp}`;
  GameUI.el('oppHpFill').style.width = oPct + '%';
  GameUI.el('oppHpFill').className = 'hp-fill ' + oCls;
  GameUI.el('oppHpText').textContent = `${Math.max(0, oMon.hp)} / ${oMon.maxHp}`;

  GameUI.el('battleMessage').textContent = b.message;

  // Move buttons
  const moveRow = GameUI.el('moveRow');
  moveRow.innerHTML = '';
  GameBattle.ensurePP(pMon);
  pMon.moves.forEach((m, idx) => {
    const btn = document.createElement('button');
    const outOfPp = (m.pp || 0) <= 0;
    btn.className = 'move-btn' + (m.gated ? ' gated' : '') + (outOfPp ? ' out-of-pp' : '');
    btn.innerHTML = `
      <div class="mn">${m.name} ${m.gated ? '<span class="badge">STRONG</span>' : ''}</div>
      <div class="mp">${m.type} type · Power ${m.power}</div>
      <div class="mpp">PP <strong>${m.pp}</strong>/${m.maxPp}</div>
    `;
    btn.onclick = () => GameBattle.choosePlayerMove(idx);
    btn.disabled = outOfPp || !!b.opponentPending;
    moveRow.appendChild(btn);
  });

  // Team strip
  const team = GameUI.el('battleTeam');
  team.innerHTML = '';
  b.playerTeam.forEach((m, i) => {
    const s = document.createElement('div');
    s.className = 'team-slot' + (i === b.playerActive ? ' active' : '') + (m.fainted ? ' fainted' : '');
    s.innerHTML = `<img src="${GameData.spriteStatic(m.speciesId)}" title="${m.name}" />`;
    if (!m.fainted && i !== b.playerActive) {
      s.onclick = () => GameBattle.switchTo(i);
    }
    team.appendChild(s);
  });

  GameUI.el('switchBtn').onclick = () => {
    if (b.opponentPending) return;
    const next = b.playerTeam.findIndex((m, i) => !m.fainted && i !== b.playerActive);
    if (next >= 0) GameBattle.switchTo(next);
  };
  GameUI.el('useItemBtn').onclick = () => {
    if (b.opponentPending) return;
    GameBattle.useItemInBattle();
  };
  GameUI.el('forfeitBtn').onclick = () => {
    if (b.opponentPending) return;
    GameBattle.forfeit();
  };
  GameUI.el('switchBtn').disabled = !!b.opponentPending;
  GameUI.el('useItemBtn').disabled = !!b.opponentPending;
  GameUI.el('forfeitBtn').disabled = !!b.opponentPending;
};

GameBattle.choosePlayerMove = function (moveIdx) {
  const b = GameBattle.active;
  if (!b || b.opponentPending) return;
  if (b._spectator) return; // multiplayer spectator view — no interaction
  const pMon = b.playerTeam[b.playerActive];
  const move = pMon.moves[moveIdx];
  GameBattle.ensurePP(pMon);
  if ((move.pp || 0) <= 0) {
    b.message = `${move.name} has no PP left.`;
    GameBattle.renderBattle(b);
    return;
  }
  // Strong moves are no longer gated by a dice roll — PP governs how often
  // they can be used. Resolve every chosen move directly.
  GameBattle.resolveTurn(moveIdx, true);
};

GameBattle.resolveTurn = function (playerMoveIdx, playerLanded) {
  const b = GameBattle.active;
  const pMon = b.playerTeam[b.playerActive];
  const oMon = b.oppTeam[b.oppActive];

  // Decide who goes first by max move power for simplicity? Just go player first.
  if (playerLanded && playerMoveIdx != null) {
    const move = pMon.moves[playerMoveIdx];
    if (move.pp != null) move.pp = Math.max(0, move.pp - 1);
    // X-Attack: +25% damage on outgoing hit, consumes one stacked turn.
    const x2Atk = b.buffs && b.buffs.x2AttackOnInstance === pMon.instanceId && (b.buffs.x2AttackTurns || 0) > 0;
    let dmg = GameBattle.computeDamage(move, pMon, oMon, GameState.currentPlayer().flags.xAttack);
    GameState.currentPlayer().flags.xAttack = false;
    if (x2Atk) {
      dmg = Math.round(dmg * 1.25);
      b.buffs.x2AttackTurns = Math.max(0, b.buffs.x2AttackTurns - 1);
    }
    oMon.hp = Math.max(0, oMon.hp - dmg);
    const remainingAtk = (b.buffs && b.buffs.x2AttackOnInstance === pMon.instanceId) ? (b.buffs.x2AttackTurns || 0) : 0;
    b.message = x2Atk
      ? `${pMon.name} used ${move.name}. Hit for ${dmg} (X-ATK · ${remainingAtk} left).`
      : `${pMon.name} used ${move.name}. Hit for ${dmg}.`;
    if (x2Atk && remainingAtk === 0) {
      GameUI.log(`<strong>${pMon.name}</strong>'s X-Attack buff has expired.`, 'system');
    }
    GameAudio.sfx.hit();
    if (oMon.hp <= 0) {
      oMon.fainted = true;
      GameState.resetMoves(oMon);
      GameAudio.sfx.faint();
      b.message += ` ${oMon.name} fainted!`;
      GameUI.log(`<strong>${oMon.name}</strong> fainted.`, 'win');
      // Advance opponent
      const nextOpp = b.oppTeam.findIndex(m => !m.fainted);
      if (nextOpp < 0) {
        GameBattle.end(true);
        return;
      } else {
        b.oppActive = nextOpp;
        b.message += ` Opponent sent out ${b.oppTeam[nextOpp].name}.`;
        if (b.onBattleMonUsed) b.onBattleMonUsed(b.oppTeam[nextOpp]);
        GameBattle.renderBattle(b);
        return;
      }
    }
  }

  // Opponent turn — lock player input until it resolves.
  b.opponentPending = true;
  setTimeout(() => GameBattle.opponentTurn(), 700);
  GameBattle.renderBattle(b);
};

GameBattle.opponentTurn = function () {
  const b = GameBattle.active;
  const pMon = b.playerTeam[b.playerActive];
  const oMon = b.oppTeam[b.oppActive];
  if (!oMon || oMon.fainted) return;
  GameBattle.ensurePP(oMon);

  // Build candidate move list (PP > 0). If none, Struggle.
  const usable = oMon.moves
    .map((mv, i) => ({ mv, i }))
    .filter(x => (x.mv.pp || 0) > 0);

  let move, moveIdx, struggled = false;
  if (usable.length === 0) {
    struggled = true;
    move = { name: 'Struggle', power: 15, type: 'normal' };
    moveIdx = -1;
  } else {
    // 50/50 mix: weak vs strong, but only from usable moves
    const wantStrong = Math.random() < 0.5;
    const strongCandidate = usable.find(x => x.mv.gated);
    const weakCandidate = usable.find(x => !x.mv.gated) || usable[0];
    const pick = (wantStrong && strongCandidate) ? strongCandidate : weakCandidate;
    move = pick.mv;
    moveIdx = pick.i;
    if (move.pp != null) move.pp = Math.max(0, move.pp - 1);
  }

  // X-Defense: +25% Defense → incoming damage scaled by 1/1.25 = 0.8.
  const x2Def = b.buffs && b.buffs.x2DefenseOnInstance === pMon.instanceId && (b.buffs.x2DefenseTurns || 0) > 0;
  let dmg = GameBattle.computeDamage(move, oMon, pMon, false, GameState.currentPlayer().flags.xDefend);
  GameState.currentPlayer().flags.xDefend = false;
  if (x2Def) {
    dmg = Math.round(dmg * 0.8);
    b.buffs.x2DefenseTurns = Math.max(0, b.buffs.x2DefenseTurns - 1);
  }
  pMon.hp = Math.max(0, pMon.hp - dmg);
  const remainingDef = (b.buffs && b.buffs.x2DefenseOnInstance === pMon.instanceId) ? (b.buffs.x2DefenseTurns || 0) : 0;
  b.message = struggled
    ? `${oMon.name} has no PP and used Struggle! Hit for ${dmg}${x2Def ? ` (X-DEF · ${remainingDef} left)` : ''}.`
    : `${oMon.name} used ${move.name}. Hit for ${dmg}${x2Def ? ` (X-DEF · ${remainingDef} left)` : ''}.`;
  if (x2Def && remainingDef === 0) {
    GameUI.log(`<strong>${pMon.name}</strong>'s X-Defense buff has expired.`, 'system');
  }
  GameAudio.sfx.hit();
  if (pMon.hp <= 0) {
    pMon.fainted = true;
    GameState.resetMoves(pMon);
    GameAudio.sfx.faint();
    b.message += ` ${pMon.name} fainted!`;
    GameUI.log(`<strong>${pMon.name}</strong> fainted!`, 'lose');
    const nextP = b.playerTeam.findIndex(m => !m.fainted);
    if (nextP < 0) {
      GameBattle.end(false);
      return;
    } else {
      b.playerActive = nextP;
      b.message += ` ${GameState.currentPlayer().name} sent out ${b.playerTeam[nextP].name}.`;
    }
  }
  // Sync the real player party HP/fainted state
  GameBattle.syncBackToParty();
  // Opponent has acted; unlock player input.
  b.opponentPending = false;
  GameBattle.renderBattle(b);
};

GameBattle.computeDamage = function (move, attacker, defender, attackerBuff, defenderBuff) {
  let dmg = move.power;
  // Simple STAB bonus
  if (attacker.types && attacker.types.includes(move.type)) dmg = Math.round(dmg * 1.2);
  // Type effectiveness (mini chart)
  const eff = GameBattle.typeEffect(move.type, defender.types);
  dmg = Math.round(dmg * eff);
  // Random variance 85-100%
  dmg = Math.round(dmg * (0.85 + Math.random() * 0.15));
  if (attackerBuff) dmg = Math.round(dmg * 1.25);
  if (defenderBuff) dmg = Math.round(dmg * 0.75);
  if (dmg < 1) dmg = 1;
  return dmg;
};

GameBattle.typeEffect = function (moveType, defTypes) {
  const chart = {
    fire:    { grass: 2, bug: 2, ice: 2, steel: 2, water: 0.5, rock: 0.5, fire: 0.5, dragon: 0.5 },
    water:   { fire: 2, rock: 2, ground: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
    grass:   { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
    electric:{ water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
    ice:     { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    ghost:   { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
    dark:    { psychic: 2, ghost: 2, dark: 0.5, fighting: 0.5, fairy: 0.5 },
    fighting:{ normal: 2, rock: 2, steel: 2, ice: 2, dark: 2, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
    flying:  { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
    rock:    { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
    ground:  { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
    bug:     { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
    poison:  { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    dragon:  { dragon: 2, steel: 0.5, fairy: 0 },
    steel:   { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
    fairy:   { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
    normal:  { rock: 0.5, ghost: 0, steel: 0.5 },
  };
  let mul = 1;
  defTypes.forEach(t => {
    const v = chart[moveType] && chart[moveType][t];
    if (v != null) mul *= v;
  });
  return mul;
};

GameBattle.switchTo = function (idx) {
  const b = GameBattle.active;
  if (b.playerTeam[idx].fainted) return;
  b.playerActive = idx;
  b.message = `${GameState.currentPlayer().name} sent out ${b.playerTeam[idx].name}.`;
  GameBattle.renderBattle(b);
  // Switching uses a turn, opponent attacks
  setTimeout(() => GameBattle.opponentTurn(), 600);
};

GameBattle.useItemInBattle = function () {
  // Multiplayer: this device shouldn't be able to use the active player's
  // items unless they ARE the active player.
  if (GameBattle.active && GameBattle.active._spectator) return;
  if (window.GameMP && GameMP.enabled && !GameMP.isLocalDeviceActive()) return;
  GameUI.showItemPicker(
    item => item.type === 'heal' || item.type === 'revive' || item.type === 'buff',
    'Use item in battle',
    'Heal, revive, or buff during the fight.',
    item => {
      GameItems.applyItem(item, GameState.currentPlayer(), { inBattle: true, battle: GameBattle.active });
      GameBattle.syncBackToParty();
      GameBattle.renderBattle(GameBattle.active);
      // opponent gets a turn
      setTimeout(() => GameBattle.opponentTurn(), 500);
    }
  );
};

GameBattle.forfeit = function () {
  // CPU players skip the confirm dialog (it blocks the event loop and
  // soft-locks the AI watchdog).
  const player = GameState.currentPlayer && GameState.currentPlayer();
  if (player && player.isCpu) {
    GameBattle.end(false);
    return;
  }
  if (!confirm('Forfeit the battle? This counts as a loss.')) return;
  GameBattle.end(false);
};

GameBattle.syncBackToParty = function () {
  const player = GameState.currentPlayer();
  const b = GameBattle.active;
  b.playerTeam.forEach(battleMon => {
    const real = player.party.find(m => m.instanceId === battleMon.instanceId) ||
                 player.party.find(m => m.speciesId === battleMon.speciesId && m.maxHp === battleMon.maxHp);
    if (real) {
      real.hp = battleMon.hp;
      real.fainted = battleMon.fainted;
      // Keep PP synced (in case battle mon array is a different reference)
      if (real !== battleMon && Array.isArray(battleMon.moves) && Array.isArray(real.moves)) {
        battleMon.moves.forEach((mv, i) => {
          if (real.moves[i] && mv.pp != null) {
            real.moves[i].pp = mv.pp;
            real.moves[i].maxPp = mv.maxPp;
          }
        });
      }
    }
  });
};

GameBattle.end = function (won) {
  const b = GameBattle.active;
  GameBattle.syncBackToParty();
  GameUI.hideBattle();
  GameAudio.endBattleMusic();
  if (won) {
    GameAudio.sfx.victory();
    GameUI.log(`<span class="win">VICTORY!</span> ${GameState.currentPlayer().name} defeated ${b.opponentLabel}.`, 'win');
    if (b.onWin) b.onWin();
  } else {
    GameAudio.sfx.gameOver();
    GameUI.log(`${GameState.currentPlayer().name} was defeated by ${b.opponentLabel}.`, 'lose');
    if (b.onLose) b.onLose();
  }
  GameBattle.active = null;
};
