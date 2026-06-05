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

// Defensive: backfill HP on any mon that's missing a usable maxHp/hp (legacy
// saves, old Hall of Fame entries). Without this, an undefined maxHp shows as
// "NaN / undefined" and the mon can never faint (NaN <= 0 is false).
GameBattle.ensureHP = function (mon) {
  if (!mon) return;
  if (!(typeof mon.maxHp === 'number' && isFinite(mon.maxHp) && mon.maxHp > 0)) {
    const base = GameData.getPokemon(mon.speciesId) || {};
    const hp = (typeof mon.hp === 'number' && isFinite(mon.hp) && mon.hp > 0) ? mon.hp : 0;
    mon.maxHp = hp || Number(base.hp) || 50;
  }
  if (!(typeof mon.hp === 'number' && isFinite(mon.hp))) mon.hp = mon.maxHp;
  mon.hp = Math.max(0, Math.min(mon.hp, mon.maxHp));
};

// All gym leaders hit 25% harder (HP + move power). Team Rocket reuses this
// battle engine but isn't a gym leader, so it's excluded from the bump.
GameBattle.GYM_STRENGTH_MULT = 1.25;
GameBattle.gymBoost = function (leader, spec) {
  const mul = Number(leader && leader.scaleMultiplier) || 1;
  let boost = (typeof spec.scale === 'number')
    ? spec.scale
    : (1 + (spec.level / 50) * 0.6) * mul;
  if (!leader || leader.name !== 'Team Rocket') boost *= GameBattle.GYM_STRENGTH_MULT;
  return boost;
};

GameBattle.start = function (opts) {
  // opts: { kind: 'gym'|'pvp', leader, opponentPlayer, prizePokemon, onWin, onLose }
  const player = GameState.currentPlayer();
  // Battle uses the WHOLE party (up to 6) in party order. The first non-fainted
  // leads. For wild battles, just use the active non-fainted Pokemon.
  const playerTeam = (opts.kind === 'gym' || opts.kind === 'pvp' || opts.kind === 'arena')
    ? player.party.slice(0, 6)
    : player.party.filter(m => !m.fainted);
  let oppTeam;
  let opponentLabel;
  let opponentColor;

  if (opts.kind === 'gym') {
    const leader = opts.leader;
    oppTeam = leader.team.map(spec => {
      const base = GameData.getPokemon(spec.id);
      // HP + move power scaled by the gym boost: per-mon scale (or the
      // level curve × the gym's own multiplier) × the global +25% gym
      // difficulty bump. See GameBattle.gymBoost.
      const lvlBoost = GameBattle.gymBoost(leader, spec);
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
    oppTeam = opp.party.filter(m => !m.fainted).slice(0, 6).map(m => ({
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
  } else if (opts.kind === 'arena') {
    // Champion Arena: opponent team is pre-built from a Hall of Fame entry.
    oppTeam = opts.oppTeam || [];
    opponentLabel = opts.opponentLabel || 'Champion';
    opponentColor = opts.opponentColor || '#a855f7';
  }

  // Callers may override the displayed opponent label (e.g. Team Rocket reuses
  // the gym battle engine but shouldn't read "Gym Leader Team Rocket").
  if (opts.opponentLabel) opponentLabel = opts.opponentLabel;

  // Defensive: backfill PP + HP on any mon that's missing it (legacy saves,
  // pre-maxHp Hall of Fame entries).
  playerTeam.forEach(m => { GameBattle.ensurePP(m); GameBattle.ensureHP(m); });
  oppTeam.forEach(m => { GameBattle.ensurePP(m); GameBattle.ensureHP(m); });

  // Use the whole party for gym/pvp/arena, or all non-fainted for wild
  let teamForBattle = playerTeam;
  if (opts.kind === 'gym' || opts.kind === 'pvp' || opts.kind === 'arena') {
    // Find the first non-fainted to send out first
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
    // Final-boss mechanic: gym leaders may carry a Hyper Potion allowance
    // (Giovanni = 2). Arena champions get theirs from arenaSkill. Decremented
    // as they're spent mid-fight.
    oppHyperPotionsLeft: (opts.kind === 'gym' && opts.leader && opts.leader.hyperPotions)
      ? (Number(opts.leader.hyperPotions) || 0)
      : (opts.arenaSkill ? (opts.arenaSkill.hyperPotions || 0) : 0),
    // Arena AI extras: a one-shot Max Revive, smarter move choice, and a
    // higher heal threshold (heal at <30% HP, not just <10).
    oppMaxRevivesLeft: opts.arenaSkill ? (opts.arenaSkill.maxRevives || 0) : 0,
    oppSmartMoves: opts.arenaSkill ? !!opts.arenaSkill.smartMoves : false,
    oppHealBelowFrac: opts.arenaSkill ? 0.3 : 0,
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
  } else if (opts.kind === 'pvp' || opts.kind === 'arena') {
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
    : b.kind === 'arena' ? `Champion match · beat all ${teamSize}`
    : b.kind === 'pvp' ? 'Trainer battle' : 'Wild Pokemon battle';

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

  // Opponent team progress (gym / trainer / Team Rocket): which numbered
  // Pokemon they're on, with a clear flag when it's their LAST one.
  const statusEl = GameUI.el('oppTeamStatus');
  if (statusEl) {
    if ((b.kind === 'gym' || b.kind === 'pvp' || b.kind === 'arena') && b.oppTeam && b.oppTeam.length > 1) {
      const total = b.oppTeam.length;
      const defeated = b.oppTeam.filter(m => m.fainted).length;
      const current = Math.min(defeated + 1, total);
      const isLast = (total - defeated) === 1;
      const pips = b.oppTeam.map((m, i) => {
        const cls = m.fainted ? 'fainted' : (i === b.oppActive ? 'active' : 'alive');
        return `<span class="opp-pip ${cls}"></span>`;
      }).join('');
      statusEl.innerHTML = `<span class="opp-pips">${pips}</span><span class="opp-count${isLast ? ' last' : ''}">${isLast ? '⚠️ LAST POKÉMON!' : `Pokémon ${current} of ${total}`}</span>`;
      statusEl.hidden = false;
    } else {
      statusEl.hidden = true;
      statusEl.innerHTML = '';
    }
  }

  const msgEl = GameUI.el('battleMessage');
  msgEl.textContent = b.message;
  msgEl.className = 'battle-message' + (b._effectClass ? ' ' + b._effectClass : '');

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
  // Speed-based turn order: the faster active Pokemon strikes first, via a
  // speed-weighted coin flip (equal speed = 50/50). If the opponent wins, it
  // attacks first and the player's chosen move lands afterward.
  const oMon = b.oppTeam[b.oppActive];
  const pSpd = GameBattle._speedOf(pMon), oSpd = GameBattle._speedOf(oMon);
  const playerFirst = Math.random() < pSpd / (pSpd + oSpd);
  if (playerFirst) {
    GameBattle.resolveTurn(moveIdx, true);
  } else {
    b._queuedPlayerMove = moveIdx;
    b._queuedPlayerMonId = pMon.instanceId;
    b.opponentPending = true;
    b.message = `${oMon.name} is faster and moves first!`;
    GameBattle.renderBattle(b);
    setTimeout(() => GameBattle.opponentTurn(), 500);
  }
};

// Base species Speed stat (added to pokemon.json from the official base stats).
GameBattle._speedOf = function (mon) {
  if (!mon) return 50;
  const base = GameData.getPokemon(mon.speciesId);
  return Math.max(1, (base && base.speed) || 50);
};

GameBattle.resolveTurn = function (playerMoveIdx, playerLanded, skipOpponent) {
  const b = GameBattle.active;
  const pMon = b.playerTeam[b.playerActive];
  const oMon = b.oppTeam[b.oppActive];
  b._effectClass = '';

  // The player's chosen move resolves here. skipOpponent=true means the
  // opponent already struck first this exchange (speed order), so no counter.
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
    const critTag = GameBattle._lastCrit ? ' ⚡CRIT!' : '';
    b.message = x2Atk
      ? `${pMon.name} used ${move.name}. Hit for ${dmg}${critTag} (X-ATK · ${remainingAtk} left).`
      : `${pMon.name} used ${move.name}. Hit for ${dmg}${critTag}.`;
    GameBattle._applyEffectiveness(b);
    GameBattle._shakeSprite('opp');
    if (GameBattle._lastCrit) { GameUI.log(`<span class="crit">⚡ Critical hit!</span> ${pMon.name}'s ${move.name} hit for ${dmg}.`, 'crit'); GameBattle._flashCrit(); }
    if (x2Atk && remainingAtk === 0) {
      GameUI.log(`<strong>${pMon.name}</strong>'s X-Attack buff has expired.`, 'system');
    }
    GameAudio.sfx.hit();
    if (oMon.hp <= 0) {
      // Arena Max Revive: a one-shot clutch save — the champion brings their
      // downed Pokemon straight back to full HP instead of losing it.
      if ((b.oppMaxRevivesLeft || 0) > 0) {
        b.oppMaxRevivesLeft -= 1;
        oMon.hp = oMon.maxHp;
        b.message += ` ${b.opponentLabel} used a MAX REVIVE — ${oMon.name} is back at full HP!`;
        GameUI.log(`<span class="crit">🧪 ${b.opponentLabel} used a MAX REVIVE on ${oMon.name}!</span>`, 'crit');
        if (GameAudio.sfx && GameAudio.sfx.heal) GameAudio.sfx.heal();
        if (skipOpponent) {
          b.opponentPending = false;
          GameBattle.renderBattle(b);
        } else {
          b.opponentPending = true;
          setTimeout(() => GameBattle.opponentTurn(), 700);
          GameBattle.renderBattle(b);
        }
        return;
      }
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
        // Control returns to the player vs the freshly-sent mon. If this KO
        // came from a queued move (opponent moved first this exchange),
        // opponentPending was left TRUE by _finishOpponentTurn — clear it or
        // the player's input stays locked forever ("no options").
        b.opponentPending = false;
        GameBattle.renderBattle(b);
        return;
      }
    }
  }

  // If the opponent already moved first this exchange, just finish — no counter.
  if (skipOpponent) {
    b.opponentPending = false;
    GameBattle.renderBattle(b);
    return;
  }
  // Opponent turn — lock player input until it resolves.
  b.opponentPending = true;
  setTimeout(() => GameBattle.opponentTurn(), 700);
  GameBattle.renderBattle(b);
};

// Unlock after the opponent acts, and — if the opponent moved FIRST this
// exchange — resolve the player's queued move (same Pokemon, still conscious).
GameBattle._finishOpponentTurn = function () {
  const b = GameBattle.active;
  if (!b) return;
  b.opponentPending = false;
  GameBattle.renderBattle(b);
  if (b._queuedPlayerMove == null) return;
  const moveIdx = b._queuedPlayerMove;
  const monId = b._queuedPlayerMonId;
  b._queuedPlayerMove = null;
  b._queuedPlayerMonId = null;
  const curMon = b.playerTeam[b.playerActive];
  if (curMon && !curMon.fainted && curMon.instanceId === monId) {
    const mv = curMon.moves[moveIdx];
    if (mv && (mv.pp || 0) > 0) {
      b.opponentPending = true;
      GameBattle.renderBattle(b);
      setTimeout(() => GameBattle.resolveTurn(moveIdx, true, true), 600);
    }
  }
};

GameBattle.opponentTurn = function () {
  const b = GameBattle.active;
  const pMon = b.playerTeam[b.playerActive];
  const oMon = b.oppTeam[b.oppActive];
  if (!oMon || oMon.fainted) { GameBattle._finishOpponentTurn(); return; }
  GameBattle.ensurePP(oMon);
  b._effectClass = '';

  // ===== Final-boss Hyper Potion (Giovanni) =====
  // If the leader still has Hyper Potions and their active Pokemon is
  // critically low (below 10 HP) but still conscious and not already full,
  // spend one INSTEAD of attacking. Never wasted on a fainted or full mon;
  // capped by oppHyperPotionsLeft (Giovanni = 2 total). Uses the turn.
  const healTrigger = oMon.hp < 10 || (b.oppHealBelowFrac > 0 && oMon.hp < oMon.maxHp * b.oppHealBelowFrac);
  if ((b.oppHyperPotionsLeft || 0) > 0 && oMon.hp > 0 && healTrigger && oMon.hp < oMon.maxHp) {
    const healItem = (window.GameData && GameData.getItem && GameData.getItem('hyper_potion'));
    const healAmt = (healItem && healItem.amount) || 120;
    oMon.hp = Math.min(oMon.maxHp, oMon.hp + healAmt);
    b.oppHyperPotionsLeft -= 1;
    const left = b.oppHyperPotionsLeft;
    b.message = `${b.opponentLabel} used a Hyper Potion on ${oMon.name}! HP restored to ${oMon.hp}/${oMon.maxHp}.${left > 0 ? ` (${left} left)` : ''}`;
    GameUI.log(`<span class="crit">💉 ${b.opponentLabel} used a HYPER POTION on ${oMon.name}! HP → ${oMon.hp}/${oMon.maxHp}.</span>`, 'crit');
    if (GameAudio.sfx && GameAudio.sfx.heal) GameAudio.sfx.heal();
    GameBattle._finishOpponentTurn();
    return;
  }

  // Build candidate move list (PP > 0). If none, Struggle.
  const usable = oMon.moves
    .map((mv, i) => ({ mv, i }))
    .filter(x => (x.mv.pp || 0) > 0);

  let move, moveIdx, struggled = false;
  if (usable.length === 0) {
    struggled = true;
    move = { name: 'Struggle', power: 15, type: 'normal' };
    moveIdx = -1;
  } else if (b.oppSmartMoves) {
    // Skilled arena champions favour their highest-expected-damage move
    // (power × type effectiveness × STAB) against the player's active mon.
    const score = (mv) => {
      const eff = GameBattle.typeEffect(mv.type, pMon.types || []);
      const stab = (oMon.types || []).includes(mv.type) ? 1.2 : 1;
      return (mv.power || 0) * eff * stab;
    };
    const best = usable.slice().sort((a, c) => score(c.mv) - score(a.mv))[0];
    move = best.mv;
    moveIdx = best.i;
    if (move.pp != null) move.pp = Math.max(0, move.pp - 1);
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
  const oppCritTag = GameBattle._lastCrit ? ' ⚡CRIT!' : '';
  b.message = struggled
    ? `${oMon.name} has no PP and used Struggle! Hit for ${dmg}${oppCritTag}${x2Def ? ` (X-DEF · ${remainingDef} left)` : ''}.`
    : `${oMon.name} used ${move.name}. Hit for ${dmg}${oppCritTag}${x2Def ? ` (X-DEF · ${remainingDef} left)` : ''}.`;
  GameBattle._applyEffectiveness(b);
  GameBattle._shakeSprite('player');
  if (GameBattle._lastCrit) { GameUI.log(`<span class="crit">⚡ Critical hit!</span> ${oMon.name}'s ${move.name} struck for ${dmg}.`, 'crit'); GameBattle._flashCrit(); }
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
  // Opponent has acted; unlock + resolve the player's queued move if the
  // opponent went first this exchange.
  GameBattle._finishOpponentTurn();
};

// Set by computeDamage so the caller can announce a crit + type effectiveness.
GameBattle._lastCrit = false;
GameBattle._lastEffect = 1;

// Turn a type-effectiveness multiplier into a message suffix + colour class.
GameBattle._effectivenessLabel = function (eff) {
  if (eff === 0) return { text: ' It had no effect…', cls: 'no-effect' };
  if (eff >= 2) return { text: " It's super effective!", cls: 'super' };
  if (eff > 0 && eff < 1) return { text: " It's not very effective…", cls: 'resisted' };
  return { text: '', cls: '' };
};

// Applied by resolveTurn / opponentTurn after a damaging hit: appends the
// "super effective" text to b.message, tags the colour class, and flashes the
// arena. Returns nothing.
GameBattle._applyEffectiveness = function (b) {
  const eff = GameBattle._effectivenessLabel(GameBattle._lastEffect);
  b._effectClass = eff.cls;
  if (eff.text) {
    b.message += eff.text;
    GameBattle._flashEffect(eff.cls);
    if (eff.cls === 'super') GameUI.log(`<span class="crit">It's super effective!</span>`, 'crit');
    else if (eff.cls === 'no-effect') GameUI.log(`It had no effect…`, 'system');
  }
};

// Visual cue helpers — flash the arena on crits, shake the struck sprite.
GameBattle._flashCrit = function () {
  const holder = document.getElementById('critFlashHolder');
  if (!holder) return;
  const existing = document.getElementById('critFlash');
  if (existing) existing.remove();
  const flash = document.createElement('div');
  flash.id = 'critFlash';
  holder.appendChild(flash);
  setTimeout(() => flash.remove(), 500);
};
GameBattle._flashEffect = function (cls) {
  const holder = document.getElementById('critFlashHolder');
  if (!holder || !cls) return;
  const existing = document.getElementById('effectFlash');
  if (existing) existing.remove();
  const flash = document.createElement('div');
  flash.id = 'effectFlash';
  flash.className = 'effect-flash ' + cls;
  holder.appendChild(flash);
  setTimeout(() => flash.remove(), 450);
};
GameBattle._shakeSprite = function (which) {
  const el = document.getElementById(which === 'opp' ? 'oppSprite' : 'playerSprite');
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 350);
};
GameBattle.CRIT_CHANCE = 1 / 16;
GameBattle.computeDamage = function (move, attacker, defender, attackerBuff, defenderBuff) {
  GameBattle._lastCrit = false;
  let dmg = move.power;
  // Simple STAB bonus
  if (attacker.types && attacker.types.includes(move.type)) dmg = Math.round(dmg * 1.2);
  // Type effectiveness (mini chart) — remembered so the caller can announce
  // "super effective" / "not very effective".
  const eff = GameBattle.typeEffect(move.type, defender.types);
  GameBattle._lastEffect = eff;
  dmg = Math.round(dmg * eff);
  // Random variance 85-100%
  dmg = Math.round(dmg * (0.85 + Math.random() * 0.15));
  if (attackerBuff) dmg = Math.round(dmg * 1.25);
  if (defenderBuff) dmg = Math.round(dmg * 0.75);
  // Critical hit: guaranteedCrit flag (from Good Omen tile event) forces one
  // even if RNG didn't pop. Consumes the flag on use.
  const attackingPlayer = GameState.currentPlayer && GameState.currentPlayer();
  const forced = attackingPlayer && attackingPlayer.flags && attackingPlayer.flags.guaranteedCrit;
  if (forced || Math.random() < GameBattle.CRIT_CHANCE) {
    dmg = Math.round(dmg * 1.5);
    GameBattle._lastCrit = true;
    if (forced) attackingPlayer.flags.guaranteedCrit = false;
  }
  // Shiny attacker note: the +25% move power is baked into mon.moves at catch
  // time (see encounter.js), so no extra multiplier needed here. Keeping the
  // branch as a hook in case we want to layer a defensive bonus later.
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
    item => GameBattle._applyItemAction(item)
  );
};

// In-battle item-use handlers. Each one applies the effect first and ONLY
// THEN hands the turn to the opponent — the old code called the generic
// GameItems.applyItem (which opens an async target picker) and then
// immediately scheduled opponentTurn(), so for heals/revives the opponent
// attacked before the player had picked a target. Result: heals never
// landed in time and the player died with a potion still in hand.
GameBattle._applyItemAction = function (item) {
  const b = GameBattle.active;
  if (!b) return;
  const player = GameState.currentPlayer();
  if (item.type === 'heal') return GameBattle._healInBattle(item, player, b);
  if (item.type === 'revive') return GameBattle._reviveInBattle(item, player, b);
  if (item.type === 'buff') return GameBattle._buffInBattle(item, player, b);
};

GameBattle._yieldToOpponent = function (b) {
  b.opponentPending = true;
  GameBattle.renderBattle(b);
  setTimeout(() => GameBattle.opponentTurn(), 500);
};

GameBattle._healInBattle = function (item, player, b) {
  // In battle, the only legal heal target is the active mon — no picker,
  // so the opponent can't sneak in a hit between "click potion" and "pick
  // who to heal".
  const target = b.playerTeam[b.playerActive];
  if (!target || target.fainted) {
    GameUI.log(`No active Pokemon to heal.`, 'system');
    return; // no turn consumed
  }
  if (target.hp >= target.maxHp) {
    GameUI.log(`${target.name} is already at full HP.`, 'system');
    return; // no turn consumed
  }
  if (item.amount >= 999) target.hp = target.maxHp;
  else target.hp = Math.min(target.maxHp, target.hp + item.amount);
  if (target.hp >= target.maxHp) GameState.resetMoves(target);
  GameState.consumeItem(player, item.id);
  GameUI.log(`${player.name} used <strong>${item.name}</strong> on ${target.name}. HP now ${target.hp}/${target.maxHp}.`);
  GameAudio.sfx.heal();
  GameBattle.syncBackToParty();
  GameUI.refreshAll();
  GameBattle._yieldToOpponent(b);
};

GameBattle._reviveInBattle = function (item, player, b) {
  const fainted = b.playerTeam.filter(m => m.fainted);
  if (fainted.length === 0) {
    GameUI.log(`No fainted Pokemon to revive.`, 'system');
    return; // no turn consumed
  }
  const applyTo = (target) => {
    target.fainted = false;
    target.hp = Math.max(1, Math.round(target.maxHp * (item.amount || 0.5)));
    if (target.hp >= target.maxHp) GameState.resetMoves(target);
    GameState.consumeItem(player, item.id);
    GameUI.log(`${player.name} revived ${target.name}. HP ${target.hp}/${target.maxHp}.`);
    GameAudio.sfx.heal();
    GameBattle.syncBackToParty();
    GameUI.refreshAll();
    GameBattle._yieldToOpponent(b);
  };
  if (fainted.length === 1) return applyTo(fainted[0]);
  // Multiple fainted — show picker. Opponent only acts after a real pick;
  // if the player cancels (Done), no item is consumed and no turn passes.
  GameItems.promptPickPartyMember(fainted, applyTo, {
    title: `Use ${item.name}`,
    hint: 'Pick a fainted Pokemon to revive — Cancel to back out.',
  });
};

GameBattle._buffInBattle = function (item, player, b) {
  if (item.stat === 'attack') {
    player.flags.xAttack = true;
    GameUI.log(`${player.name} powered up with ${item.name}. Next move deals +25%.`);
  } else if (item.stat === 'defense') {
    player.flags.xDefend = true;
    GameUI.log(`${player.name} braced with ${item.name}. Next hit incoming takes -25%.`);
  }
  GameState.consumeItem(player, item.id);
  GameUI.refreshAll();
  GameBattle._yieldToOpponent(b);
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
