// =============================================================
// ui.js  ·  DOM rendering for player panel, log, modals, etc.
// =============================================================
window.GameUI = {};

GameUI.el = function (id) { return document.getElementById(id); };

// Toggle the "Tap board to roll" hint based on whether the player can roll.
GameUI._refreshTapHint = function () {
  const pane = GameUI.el('boardPane');
  if (!pane) return;
  const rollBtn = GameUI.el('rollMoveBtn');
  const anyModalOpen = Array.from(document.querySelectorAll('.modal'))
    .some(m => !m.hidden);
  const canRoll = rollBtn && !rollBtn.disabled
    && !GameState.busy
    && !GameState.pendingTileResolution
    && !anyModalOpen;
  pane.classList.toggle('can-roll', !!canRoll);
};

// Poll every 400ms so the hint stays accurate during async flows
// (animations, modals opening/closing, auto-end-turn busy window, etc.).
setInterval(() => { GameUI._refreshTapHint(); }, 400);

GameUI.log = function (msg, cls) {
  const log = GameUI.el('log');
  const entry = document.createElement('div');
  entry.className = 'entry' + (cls ? ' ' + cls : '');
  entry.innerHTML = msg;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
};

GameUI.typePill = function (t) {
  return `<span class="type-pill type-${t}">${t}</span>`;
};

GameUI.renderPlayerStrip = function () {
  const strip = GameUI.el('playerStrip');
  strip.innerHTML = '';
  GameState.players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (p === GameState.currentPlayer() ? ' active' : '');
    const spriteHtml = p.trainerSprite ? `<img class="player-chip-img" src="sprites/trainers/${p.trainerSprite}.png" />` : `<span class="dot" style="background:${p.color}"></span>`;
    chip.innerHTML = `${spriteHtml}${p.name}`;
    chip.addEventListener('click', () => {
      GameUI.renderPlayerPanel(p, true);
    });
    strip.appendChild(chip);
  });
};

GameUI.renderCurrentPlayerCard = function () {
  const p = GameState.currentPlayer();
  if (!p) return;
  const tile = GameData.getTile(p.tile);
  const area = GameData.getArea(tile.area);
  const card = GameUI.el('currentPlayerCard');
  const spriteHtml = p.trainerSprite
    ? `<img class="cp-trainer-img" src="sprites/trainers/${p.trainerSprite}.png" alt="${p.name}" />`
    : `<div class="cp-color" style="background:${p.color}"></div>`;
  const tileLabel = tile.displayLabel || tile.i;
  card.innerHTML = `
    ${spriteHtml}
    <div>
      <div class="cp-name" style="color:${p.color}">${p.name}</div>
      <div class="cp-pos">${area.name} · Tile ${tileLabel}</div>
    </div>
  `;
  GameUI.el('areaPill').textContent = area.name;
  GameUI.el('areaPill').style.background = `linear-gradient(90deg, ${area.color}, ${area.color}aa)`;
  GameUI.el('turnPill').textContent = `Turn ${GameState.turnCount}`;
};

GameUI.renderParty = function (player) {
  player = player || GameState.currentPlayer();
  const grid = GameUI.el('partyGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const mon = player.party[i];
    if (mon) {
      const hpPct = Math.max(0, Math.round((mon.hp / mon.maxHp) * 100));
      const hpClass = hpPct > 50 ? '' : hpPct > 20 ? 'mid' : 'low';
      const isBattleSlot = i < 3;
      const card = document.createElement('div');
      card.className = 'party-card draggable' + (mon.fainted ? ' fainted' : '') + (isBattleSlot ? ' battle-slot' : '');
      card.dataset.partyIdx = i;
      card.draggable = true;
      card.innerHTML = `
        ${isBattleSlot ? `<div class="battle-slot-badge">${i + 1}</div>` : ''}
        <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
        <img src="${GameData.spriteStatic(mon.speciesId)}" onerror="this.style.opacity=0.3" alt="${mon.name}" draggable="false" />
        <div class="pc-name">${mon.name}</div>
        <div class="pc-hp"><div class="pc-hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
        <div class="pc-types">${mon.types.map(GameUI.typePill).join('')}</div>
        <button class="pc-btn pc-discard" title="Release this Pokemon (gives 1 item + 1 ball)">✕</button>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.pc-btn')) return;
        if (e.target.closest('.drag-handle')) return;
        GameUI.showPokemonDetail(mon, player);
      });
      const discardBtn = card.querySelector('.pc-discard');
      if (discardBtn) discardBtn.addEventListener('click', (e) => { e.stopPropagation(); GameUI.discardPartyMember(player, i); });
      GameUI._attachPartyDragHandlers(card, player, i);
      grid.appendChild(card);
    } else {
      const empty = document.createElement('div');
      empty.className = 'party-card empty droppable' + (i < 3 ? ' battle-slot' : '');
      empty.textContent = '+';
      empty.dataset.partyIdx = i;
      GameUI._attachPartyDragHandlers(empty, player, i, /*isEmpty*/ true);
      grid.appendChild(empty);
    }
  }
  GameUI.el('partyCount').textContent = `${player.party.length} / 6`;
};

GameUI._attachPartyDragHandlers = function (el, player, idx, isEmpty) {
  // ===== Desktop HTML5 drag-and-drop =====
  el.addEventListener('dragstart', (e) => {
    if (isEmpty) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.tp-mon.drag-over, .party-card.drag-over').forEach(c => c.classList.remove('drag-over'));
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(fromIdx) || fromIdx === idx) return;
    GameUI.reorderPartyByDrop(player, fromIdx, idx);
  });

  // ===== Touch drag (mobile / tablet) — long-press to start, drag to swap =====
  if (isEmpty) return;
  let startX = 0, startY = 0;
  let dragging = false;
  let hoverEl = null;
  let pressTimer = null;
  const PRESS_MS = 220;    // hold this long before drag mode engages
  const MOVE_THRESHOLD = 8; // px movement before treating as drag

  const beginDrag = () => {
    dragging = true;
    el.classList.add('dragging');
  };

  const clearHover = () => {
    document.querySelectorAll('.tp-mon.drag-over').forEach(c => c.classList.remove('drag-over'));
    hoverEl = null;
  };

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    dragging = false;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(beginDrag, PRESS_MS);
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dist = Math.hypot(dx, dy);
    if (!dragging) {
      // Cancel the long-press if user scrolls before holding long enough.
      if (dist > MOVE_THRESHOLD) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      }
      return;
    }
    // Active drag — stop the page from scrolling while we move the mon.
    e.preventDefault();
    const target = document.elementFromPoint(t.clientX, t.clientY);
    const slot = target && target.closest('.tp-mon');
    if (slot && slot !== el) {
      if (hoverEl && hoverEl !== slot) hoverEl.classList.remove('drag-over');
      slot.classList.add('drag-over');
      hoverEl = slot;
    } else if (!slot && hoverEl) {
      clearHover();
    }
  }, { passive: false });

  const endTouch = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    el.classList.remove('dragging');
    if (!dragging) { clearHover(); return; }
    if (hoverEl) {
      const toIdx = parseInt(hoverEl.dataset.partyIdx, 10);
      if (!isNaN(toIdx) && toIdx !== idx) {
        // Mark so the subsequent synthetic click on this mon doesn't open the
        // Pokemon detail modal.
        el.dataset.justDragged = String(Date.now());
      }
      clearHover();
      if (!isNaN(toIdx) && toIdx !== idx) GameUI.reorderPartyByDrop(player, idx, toIdx);
    } else {
      clearHover();
    }
    dragging = false;
  };
  el.addEventListener('touchend', endTouch);
  el.addEventListener('touchcancel', endTouch);
};

// Suppress the synthetic click that fires after a touch-drag finishes
// (otherwise dropping on the same / nearby card opens the detail modal).
GameUI._suppressClickIfJustDragged = function (el) {
  const stamp = Number(el.dataset.justDragged || 0);
  if (!stamp) return false;
  const dt = Date.now() - stamp;
  if (dt < 500) {
    delete el.dataset.justDragged;
    return true;
  }
  delete el.dataset.justDragged;
  return false;
};

GameUI.reorderPartyByDrop = function (player, fromIdx, toIdx) {
  if (fromIdx < 0 || fromIdx >= player.party.length) return;
  const [moved] = player.party.splice(fromIdx, 1);
  // Clamp toIdx if it now exceeds bounds (when dropping into an empty slot beyond party)
  const clampedTo = Math.min(toIdx, player.party.length);
  player.party.splice(clampedTo, 0, moved);
  GameUI.renderParty(player);
  const fromWasBattle = fromIdx < 3;
  const toIsBattle = clampedTo < 3;
  if (fromWasBattle !== toIsBattle) {
    const swapInOut = toIsBattle ? 'into' : 'out of';
    GameUI.log(`${player.name} moved <strong>${moved.name}</strong> ${swapInOut} the battle 3.`, 'system');
  }
};

GameUI.discardPartyMember = function (player, idx) {
  const mon = player.party[idx];
  if (!mon) return;
  if (player.party.length === 1) {
    alert('You cannot release your last Pokemon.');
    return;
  }
  const bonus = GameItems.computeDiscardBonus(mon.speciesId);
  const n = bonus.multiplier;
  GameUI._openReleaseModal(mon, n, bonus, () => {
    // Confirmed — perform the release
    player.party.splice(idx, 1);
    const draws = [];
    for (let i = 0; i < n; i++) {
      const it = GameData.pickItemCard();
      GameState.giveItem(player, it.id);
      draws.push({ kind: 'item', itemId: it.id, name: it.name, description: it.description });
    }
    for (let i = 0; i < n; i++) {
      const ball = GameData.pickPokeballCard();
      GameState.giveBall(player, ball.id);
      draws.push({ kind: 'pokeball', ballId: ball.id, name: ball.name });
    }
    const bonusTag = n > 1 ? ` <span class="crit">(×${n} ${bonus.reasons.join(' + ')})</span>` : '';
    GameUI.log(`${player.name} released <strong>${mon.name}</strong>. Drew ${n} item${n>1?'s':''} + ${n} pokeball${n>1?'s':''}${bonusTag}.`, 'crit');
    GameUI.refreshAll();
    const title = n > 1 ? `Reward for releasing · ×${n} bonus` : 'Reward for releasing';
    GameUI.showDraws(title, draws);
  });
};

GameUI._openReleaseModal = function (mon, n, bonus, onConfirm) {
  const modal = GameUI.el('releaseModal');
  GameUI.el('releaseTitle').textContent = `Say goodbye to ${mon.name}?`;
  const sprite = GameUI.el('releaseSprite');
  sprite.src = GameData.spriteFront(mon.speciesId);
  sprite.onerror = function () { this.src = GameData.spriteStatic(mon.speciesId); };
  GameUI.el('releaseMessage').textContent = `${mon.name} will leave your party forever.`;
  const rewardText = `+${n} item${n>1?'s':''}  ·  +${n} pokeball${n>1?'s':''}`;
  GameUI.el('releaseReward').textContent = rewardText;
  const bonusEl = GameUI.el('releaseBonus');
  if (n > 1 && bonus.reasons.length) {
    bonusEl.innerHTML = `<span class="release-bonus-badge">×${n} bonus</span> ${bonus.reasons.join(' · ')}`;
    bonusEl.hidden = false;
  } else {
    bonusEl.hidden = true;
  }
  modal.hidden = false;
  // Re-trigger the wave animation on every open
  sprite.classList.remove('waving');
  void sprite.offsetWidth;
  sprite.classList.add('waving');
  GameUI.el('releaseCancelBtn').onclick = () => { modal.hidden = true; };
  GameUI.el('releaseGoBtn').onclick = () => {
    modal.hidden = true;
    onConfirm();
  };
};

GameUI.renderInventory = function () {
  const p = GameState.currentPlayer();
  const itemList = GameUI.el('itemList');
  const ballList = GameUI.el('ballList');
  itemList.innerHTML = '';
  ballList.innerHTML = '';

  if (Object.keys(p.items).length === 0) {
    itemList.innerHTML = `<li class="hint">No items</li>`;
  } else {
    Object.entries(p.items).forEach(([itemId, count]) => {
      const item = GameData.getItem(itemId);
      if (!item) return;
      const li = document.createElement('li');
      li.innerHTML = `<span class="inv-name"><img class="inv-sprite" src="${GameData.spriteItem(itemId)}" onerror="this.style.display='none'" alt="" />${item.name}</span><span><span class="count">×${count}</span><button class="use" data-item="${itemId}">USE</button></span>`;
      li.querySelector('.use').addEventListener('click', () => GameItems.useItem(itemId));
      itemList.appendChild(li);
    });
  }

  if (Object.keys(p.balls).length === 0 || Object.values(p.balls).every(v => v <= 0)) {
    ballList.innerHTML = `<li class="hint">No balls</li>`;
  } else {
    Object.entries(p.balls).forEach(([ballId, count]) => {
      if (count <= 0) return;
      const ball = GameData.getPokeball(ballId);
      if (!ball) return;
      const li = document.createElement('li');
      li.innerHTML = `<span class="inv-name"><img class="inv-sprite" src="${GameData.spriteBall(ballId)}" onerror="this.style.display='none'" alt="" />${ball.name}</span><span class="count">×${count}</span>`;
      ballList.appendChild(li);
    });
  }
};

// Renders ALL trainers in the side pane. Each panel shows party + items + balls.
// The currently-active trainer gets a pulsing glow and its item USE / discard
// buttons are interactive; non-active panels are read-only.
GameUI.renderPlayerPanel = function () {
  const wrap = GameUI.el('trainerPanels');
  if (!wrap) return;
  wrap.innerHTML = '';
  const active = GameState.currentPlayer();
  GameState.players.forEach((p) => {
    const isActive = p === active;
    const panel = document.createElement('div');
    panel.className = 'trainer-panel' + (isActive ? ' active' : '');
    panel.dataset.playerId = p.id;
    const tile = GameData.getTile(p.tile);
    const area = tile ? GameData.getArea(tile.area) : null;
    const tileLabel = tile ? (tile.displayLabel || tile.i) : '?';
    const sprite = p.trainerSprite
      ? `<img class="tp-sprite" src="sprites/trainers/${p.trainerSprite}.png" alt="${p.name}" />`
      : `<div class="tp-color" style="background:${p.color}"></div>`;
    panel.innerHTML = `
      <div class="tp-header">
        ${sprite}
        <div class="tp-headinfo">
          <div class="tp-name" style="color:${p.color}">${p.name}${p.isCpu ? ' <span class="tp-cpu-tag">🤖 CPU</span>' : ''}${isActive ? ' <span class="tp-active-tag">YOUR TURN</span>' : ''}</div>
          <div class="tp-pos">${area ? area.name : '?'} · Tile ${tileLabel}${p.completed ? ' · 🏆' : ''}</div>
        </div>
        <div class="tp-counts">
          <span class="tp-count-pill">${p.party.length}/6</span>
        </div>
      </div>
      <div class="tp-party"></div>
      <div class="tp-inv">
        <div class="tp-inv-section"><h4>Items</h4><ul class="tp-list tp-items"></ul></div>
        <div class="tp-inv-section"><h4>Balls</h4><ul class="tp-list tp-balls"></ul></div>
      </div>
    `;
    // Party grid
    const partyEl = panel.querySelector('.tp-party');
    for (let i = 0; i < 6; i++) {
      const mon = p.party[i];
      if (mon) {
        const hpPct = Math.max(0, Math.round((mon.hp / mon.maxHp) * 100));
        const hpClass = hpPct > 50 ? '' : hpPct > 20 ? 'mid' : 'low';
        const card = document.createElement('div');
        card.className = 'tp-mon' + (mon.fainted ? ' fainted' : '') + (i < 3 ? ' battle-slot' : '');
        card.draggable = isActive;
        card.dataset.partyIdx = i;
        card.innerHTML = `
          ${i < 3 ? `<div class="tp-mon-slot">${i + 1}</div>` : ''}
          <img src="${GameData.spriteStatic(mon.speciesId)}" alt="${mon.name}" draggable="false" />
          <div class="tp-mon-name">${mon.name}</div>
          <div class="tp-mon-hp"><div class="tp-mon-hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
          ${isActive ? '<button class="tp-mon-x" title="Release">✕</button>' : ''}
        `;
        card.addEventListener('click', (e) => {
          if (e.target.closest('.tp-mon-x')) return;
          if (GameUI._suppressClickIfJustDragged(card)) return;
          GameUI.showPokemonDetail(mon, p);
        });
        const x = card.querySelector('.tp-mon-x');
        if (x) x.addEventListener('click', (e) => { e.stopPropagation(); GameUI.discardPartyMember(p, i); });
        if (isActive) GameUI._attachPartyDragHandlers(card, p, i);
        partyEl.appendChild(card);
      } else {
        const empty = document.createElement('div');
        empty.className = 'tp-mon empty' + (i < 3 ? ' battle-slot' : '');
        empty.dataset.partyIdx = i;
        empty.textContent = '+';
        if (isActive) GameUI._attachPartyDragHandlers(empty, p, i, true);
        partyEl.appendChild(empty);
      }
    }
    // Items
    const itemsEl = panel.querySelector('.tp-items');
    const itemEntries = Object.entries(p.items || {}).filter(([,n]) => n > 0);
    if (itemEntries.length === 0) {
      itemsEl.innerHTML = `<li class="hint">—</li>`;
    } else {
      itemEntries.forEach(([itemId, count]) => {
        const item = GameData.getItem(itemId);
        if (!item) return;
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="tp-inv-name"><img class="tp-inv-sprite" src="${GameData.spriteItem(itemId)}" onerror="this.style.display='none'" alt="" />${item.name}</span>
          <span class="tp-inv-right"><span class="tp-count">×${count}</span>${isActive ? `<button class="tp-use" data-item="${itemId}">USE</button>` : ''}</span>
        `;
        const useBtn = li.querySelector('.tp-use');
        if (useBtn) useBtn.addEventListener('click', () => GameItems.useItem(itemId));
        itemsEl.appendChild(li);
      });
    }
    // Balls
    const ballsEl = panel.querySelector('.tp-balls');
    const ballEntries = Object.entries(p.balls || {}).filter(([,n]) => n > 0);
    if (ballEntries.length === 0) {
      ballsEl.innerHTML = `<li class="hint">—</li>`;
    } else {
      ballEntries.forEach(([ballId, count]) => {
        const ball = GameData.getPokeball(ballId);
        if (!ball) return;
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="tp-inv-name"><img class="tp-inv-sprite" src="${GameData.spriteBall(ballId)}" onerror="this.style.display='none'" alt="" />${ball.name}</span>
          <span class="tp-count">×${count}</span>
        `;
        ballsEl.appendChild(li);
      });
    }
    wrap.appendChild(panel);
  });
  // Topbar area pill + turn pill from active player
  const tile = GameData.getTile(active.tile);
  if (tile) {
    const area = GameData.getArea(tile.area);
    GameUI.el('areaPill').textContent = area.name;
    GameUI.el('areaPill').style.background = `linear-gradient(90deg, ${area.color}, ${area.color}aa)`;
  }
  GameUI.el('turnPill').textContent = `Turn ${GameState.turnCount}`;
};

GameUI.refreshAll = function () {
  GameUI.renderPlayerPanel();
  GameBoard.renderTokens();
  GameUI._refreshTapHint();
  // Push state to peers in multiplayer mode. Guarded against re-entry when
  // we're applying a remote update (so we don't echo it back).
  if (window.GameMP && GameMP.enabled) GameMP.broadcastState();
};

// ============================== ENCOUNTER ==============================
GameUI.showEncounter = function (speciesId, ctx) {
  const modal = GameUI.el('encounterModal');
  modal.hidden = false;
  const p = GameData.getPokemon(speciesId);
  GameUI.el('encounterTitle').textContent = ctx.title || `A wild ${p.name} appeared!`;
  GameUI.el('encounterName').textContent = p.name;
  GameUI.el('encounterSprite').src = GameData.spriteFront(speciesId);
  GameUI.el('encounterSprite').onerror = function () { this.src = GameData.spriteStatic(speciesId); };
  GameUI.el('encounterSprite').className = 'wild-sprite';  // reset any leftover anim class
  GameUI.el('encounterTypes').innerHTML = p.types.map(GameUI.typePill).join('');
  GameUI.el('encounterResult').textContent = '';
  GameUI.el('encounterResult').className = 'encounter-result';

  // Region backdrop
  const stage = document.querySelector('#encounterModal .encounter-stage');
  if (stage) {
    stage.classList.remove('region-pallet', 'region-seafoam', 'region-safari', 'region-temple');
    if (ctx.area) stage.classList.add('region-' + ctx.area);
  }

  const player = GameState.currentPlayer();
  const area = GameData.getArea(ctx.area);
  const rates = area.catchRates;
  const rateLines = ['pokeball', 'greatball', 'ultraball', 'masterball'].map(b => {
    const ball = GameData.getPokeball(b);
    const have = player.balls[b] || 0;
    return `<div>${ball.name}: roll <strong>1-${rates[b]}</strong> · you have <strong>${have}</strong></div>`;
  }).join('');
  GameUI.el('catchRateDisplay').innerHTML = rateLines;

  const ballRow = GameUI.el('ballRow');
  ballRow.innerHTML = '';
  // Auto-select the ball type the player has the most of (excluding Master Ball — that auto-catches on click).
  const ballOrder = ['pokeball', 'greatball', 'ultraball', 'masterball'];
  let autoSelected = null;
  let maxCount = 0;
  ['pokeball', 'greatball', 'ultraball'].forEach(bid => {
    const c = player.balls[bid] || 0;
    if (c > maxCount) { maxCount = c; autoSelected = bid; }
  });
  // If they only have Master Balls, fall back to that
  if (!autoSelected && (player.balls.masterball || 0) > 0) autoSelected = 'masterball';
  ballOrder.forEach(bid => {
    const ball = GameData.getPokeball(bid);
    const btn = document.createElement('button');
    btn.className = 'ball-btn' + (bid === autoSelected && bid !== 'masterball' ? ' selected' : '');
    btn.dataset.ball = bid;
    btn.innerHTML = `<span class="ball-icon"></span> ${ball.name} (${player.balls[bid] || 0})`;
    btn.disabled = !player.balls[bid];
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      if (ctx.inFlight) return; // a throw is in progress
      ballRow.querySelectorAll('.ball-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      GameState.pendingEncounterBall = bid;
      // Master Ball auto-catches. Lock the WHOLE encounter UI before firing
      // resolveCatch so any queued click (including another masterball or any
      // other ball mid-window) can't trigger a second catch.
      if (bid === 'masterball') {
        ctx.inFlight = true;
        ballRow.querySelectorAll('.ball-btn').forEach(b => b.disabled = true);
        GameUI.el('encounterAutoRollBtn').disabled = true;
        GameUI.el('encounterFleeBtn').disabled = true;
        GameEncounter.resolveCatch(speciesId, 'masterball', 1, ctx);
      }
    });
    ballRow.appendChild(btn);
  });
  // Seed pendingEncounterBall with the auto-selected ball (so Roll fires straight away)
  if (autoSelected && autoSelected !== 'masterball') GameState.pendingEncounterBall = autoSelected;

  GameUI.el('encounterAutoRollBtn').disabled = false;
  GameUI.el('encounterAutoRollBtn').onclick = () => {
    const rollBtn = GameUI.el('encounterAutoRollBtn');
    if (rollBtn.disabled) return;
    if (ctx.inFlight) return;
    if (!GameState.pendingEncounterBall) {
      GameUI.el('encounterResult').textContent = 'Pick a ball first.';
      GameUI.el('encounterResult').className = 'encounter-result missed';
      return;
    }
    // Lock the entire encounter UI for the duration of this throw + catch
    // resolution. Re-enable happens on the "next attempt" re-render or never
    // (if the encounter closes via success or all attempts exhausted).
    ctx.inFlight = true;
    rollBtn.disabled = true;
    GameUI.el('encounterFleeBtn').disabled = true;
    document.querySelectorAll('#ballRow .ball-btn').forEach(b => b.disabled = true);
    const roll = GameState.rollDice();
    const ballId = GameState.pendingEncounterBall;
    GameAudio.sfx.dice();
    GameUI.log(`<span class="actor">${player.name}</span> rolled <strong>${roll}</strong>.`);
    GameUI.startDiceTumble();
    GameUI.runBallThrowAnimation(ballId, () => {
      GameUI.settleDice(roll);
      GameEncounter.resolveCatch(speciesId, ballId, roll, ctx);
    });
  };

  // Flee
  GameUI.el('encounterFleeBtn').disabled = false;
  GameUI.el('encounterFleeBtn').onclick = () => {
    if (ctx.inFlight) return;
    GameUI.log(`<span class="actor">${player.name}</span> ran from the wild <strong>${p.name}</strong>.`);
    GameUI.hideEncounter();
    GameGame.afterTileResolved();
  };

  GameAudio.sfx.encounter();
};

// Dice roll animation: rapidly cycles 1-6 then settles on the final number,
// fires onSettled callback when complete (~1.2s total).
GameUI.runDiceRollAnimation = function (finalRoll, onSettled, opts) {
  opts = opts || {};
  const tumbleMs = opts.tumbleMs != null ? opts.tumbleMs : 425;
  const settleMs = opts.settleMs != null ? opts.settleMs : 175;
  const dice = GameUI.el('diceRollAnim');
  if (!dice) { if (onSettled) onSettled(); return; }
  dice.hidden = false;
  dice.className = 'dice-roll tumbling';
  dice.style.animationDuration = (tumbleMs / 1000) + 's';
  dice.textContent = String(GameState.rollD6());
  const cycle = setInterval(() => {
    dice.textContent = String(GameState.rollD6());
    if (Math.random() < 0.4) GameAudio.noise(20, 0.03, 2500);
  }, 40);
  setTimeout(() => {
    clearInterval(cycle);
    dice.textContent = String(finalRoll);
    dice.classList.remove('tumbling');
    dice.style.animationDuration = '';
    void dice.offsetWidth;
    dice.classList.add('settled');
    GameAudio.sfx.item();
  }, tumbleMs);
  setTimeout(() => {
    dice.hidden = true;
    dice.className = 'dice-roll';
    if (onSettled) onSettled();
  }, tumbleMs + settleMs);
};

// Open-ended dice tumble — keeps cycling numbers until GameUI.settleDice() is called.
// Used when running the dice in parallel with the pokeball throw so the dice settles
// exactly when the ball reveals catch/break (no spoiler).
GameUI.startDiceTumble = function () {
  const dice = GameUI.el('diceRollAnim');
  if (!dice) return;
  dice.hidden = false;
  dice.className = 'dice-roll tumbling';
  dice.style.animationDuration = '';
  dice.textContent = String(GameState.rollD6());
  if (GameUI._diceCycle) clearInterval(GameUI._diceCycle);
  GameUI._diceCycle = setInterval(() => {
    dice.textContent = String(GameState.rollD6());
    if (Math.random() < 0.4) GameAudio.noise(20, 0.03, 2500);
  }, 60);
};

GameUI.settleDice = function (finalRoll, onHidden) {
  const dice = GameUI.el('diceRollAnim');
  if (!dice) { if (onHidden) onHidden(); return; }
  if (GameUI._diceCycle) { clearInterval(GameUI._diceCycle); GameUI._diceCycle = null; }
  dice.textContent = String(finalRoll);
  dice.classList.remove('tumbling');
  dice.style.animationDuration = '';
  void dice.offsetWidth;
  dice.classList.add('settled');
  GameAudio.sfx.item();
  setTimeout(() => {
    dice.hidden = true;
    dice.className = 'dice-roll';
    if (onHidden) onHidden();
  }, 600);
};

// Plays the pokeball throw → Pokemon shrinks into ball → 3 wiggles. Calls back
// when wiggles finish so the catch resolver can swap the ball + sprite into
// 'caught' or 'broken' state.
GameUI.runBallThrowAnimation = function (ballId, onWigglesDone) {
  const ball = GameUI.el('ballThrowAnim');
  const wild = GameUI.el('encounterSprite');
  ball.hidden = false;
  ball.className = 'ball-throw';
  if (wild) wild.className = 'wild-sprite';
  const fills = {
    pokeball:   'linear-gradient(180deg, #ff3030 0%, #ff3030 48%, #1a1a1a 48%, #1a1a1a 52%, #f5f5f5 52%, #f5f5f5 100%)',
    greatball:  'linear-gradient(180deg, #2050ff 0%, #2050ff 48%, #1a1a1a 48%, #1a1a1a 52%, #f5f5f5 52%, #f5f5f5 100%)',
    ultraball:  'linear-gradient(180deg, #f8c700 0%, #1a1a1a 30%, #1a1a1a 52%, #f5f5f5 52%, #f5f5f5 100%)',
    masterball: 'linear-gradient(180deg, #a020f0 0%, #a020f0 48%, #1a1a1a 48%, #1a1a1a 52%, #f5f5f5 52%, #f5f5f5 100%)',
  };
  ball.style.background = fills[ballId] || fills.pokeball;
  void ball.offsetWidth;
  ball.classList.add('throwing');
  GameAudio.sfx.ballThrow();

  // Snappier timing: throw 0.4s, shrink Pokemon at 0.3s, wiggle 0.32s each x3
  setTimeout(() => {
    if (wild) {
      wild.classList.add('shrinking');
      GameAudio.sfx.ballWiggle();
    }
  }, 300);

  setTimeout(() => {
    ball.classList.remove('throwing');
    const doWiggle = (n) => {
      ball.classList.remove('wiggling');
      void ball.offsetWidth;
      ball.classList.add('wiggling');
      GameAudio.sfx.ballWiggle();
      if (n > 1) {
        setTimeout(() => doWiggle(n - 1), 360);
      } else {
        setTimeout(() => {
          ball.classList.remove('wiggling');
          if (onWigglesDone) onWigglesDone();
        }, 320);
      }
    };
    doWiggle(3);
  }, 420);
};

GameUI.finishBallAnimation = function (caught) {
  const ball = GameUI.el('ballThrowAnim');
  const wild = GameUI.el('encounterSprite');
  if (!ball || ball.hidden) return;
  if (caught) {
    // Pokemon stays disappeared, ball glows gold
    ball.classList.add('caught');
    setTimeout(() => {
      ball.hidden = true;
      ball.className = 'ball-throw';
      if (wild) wild.className = 'wild-sprite';
    }, 1100);
  } else {
    // Ball breaks. Pokemon bounces back into frame and stays there
    // (it only runs off if this was the FINAL attempt — handled separately).
    ball.classList.add('broken');
    if (wild) {
      wild.classList.remove('shrinking');
      void wild.offsetWidth;
      wild.classList.add('reappearing');
      setTimeout(() => {
        wild.classList.remove('reappearing');
        // Reset to base class so sprite stays in place for next attempt
        wild.className = 'wild-sprite';
      }, 350);
    }
    setTimeout(() => {
      ball.hidden = true;
      ball.className = 'ball-throw';
    }, 600);
  }
};

// Plays the wild-Pokemon-runs-off animation. Called only when the encounter
// truly ends (out of balls or out of 3 attempts).
GameUI.runWildEscapeAnimation = function () {
  const wild = GameUI.el('encounterSprite');
  if (!wild) return;
  wild.className = 'wild-sprite';
  void wild.offsetWidth;
  wild.classList.add('running-off');
};

GameUI.hideEncounter = function () {
  GameUI.el('encounterModal').hidden = true;
  GameState.pendingEncounterBall = null;
};

// ============================== BATTLE UI ==============================
GameUI.showBattle = function (battleState) {
  const modal = GameUI.el('battleModal');
  modal.hidden = false;
  GameBattle.renderBattle(battleState);
};

GameUI.hideBattle = function () {
  GameUI.el('battleModal').hidden = true;
};

// ============================== TILE INFO MODAL ==============================
GameUI.showTileInfo = function (tile, body, resolveFn) {
  GameUI.el('tileTitle').textContent = tile.title || GameUI.tileTitle(tile);
  GameUI.el('tileDescription').textContent = tile.description || GameUI.tileDescription(tile);
  GameUI.el('tileBody').innerHTML = body || '';
  GameUI.el('tileResolveBtn').onclick = () => {
    GameUI.el('tileModal').hidden = true;
    if (resolveFn) resolveFn();
  };
  GameUI.el('tileModal').hidden = false;
};

GameUI.tileTitle = function (tile) {
  const titles = {
    pokemon: 'Wild Pokemon Tile',
    item: 'Item Tile',
    pokeball: 'Pokeball Tile',
    trade: 'Trade Tile',
    gym: 'Gym Battle',
    pokecentre: 'Pokemon Center',
    fainted: 'All Pokemon Fainted',
    masterball: 'Master Ball Tile',
    battle: 'Trainer Battle',
    specific: 'Pokemon Encounter',
    branch: 'Branching Path',
  };
  return titles[tile.type] || 'Unknown';
};

GameUI.tileDescription = function (tile) {
  const desc = {
    pokemon: 'A random wild Pokemon from this area.',
    item: 'Draw 2 item cards.',
    pokeball: 'Draw 3 pokeball cards.',
    trade: 'Choose a trainer to trade Pokemon with.',
    gym: 'Battle three of the gym leader\'s Pokemon.',
    pokecentre: 'All of your Pokemon are healed to full HP.',
    fainted: 'Your party returns to the last Pokemon Center.',
    masterball: 'Receive one Master Ball.',
    battle: 'Challenge another trainer to a 3-vs-3 battle.',
    specific: 'A specific Pokemon encounter.',
    branch: 'Choose which path to take.',
  };
  return desc[tile.type] || '';
};

// ============================== BRANCH MODAL ==============================
GameUI.showBranch = function (tile, onPick) {
  const modal = GameUI.el('branchModal');
  modal.hidden = false;
  const optsEl = GameUI.el('branchOptions');
  optsEl.innerHTML = '';
  tile.branchTo.forEach((nextI, idx) => {
    const opt = document.createElement('div');
    opt.className = 'branch-option';
    opt.innerHTML = `
      <h3>${tile.labels && tile.labels[idx] ? tile.labels[idx] : `Path ${idx + 1}`}</h3>
      <p class="hint">Continue to tile ${nextI}</p>
    `;
    opt.addEventListener('click', () => {
      modal.hidden = true;
      onPick(nextI);
    });
    optsEl.appendChild(opt);
  });
};

// ============================== DRAW REVEAL ==============================
GameUI.showDraws = function (title, draws, onContinue) {
  const modal = GameUI.el('drawModal');
  modal.hidden = false;
  // Allow HTML in the title so callers can embed a leader sprite.
  GameUI.el('drawTitle').innerHTML = title;
  const reveal = GameUI.el('drawReveal');
  reveal.innerHTML = '';
  draws.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'draw-card-item';
    card.style.animationDelay = (i * 0.15) + 's';
    if (d.kind === 'pokeball') {
      const ballId = d.ballId || (d.name || '').toLowerCase().replace(/\s+/g, '').replace('pokeball', 'pokeball');
      card.innerHTML = `<img src="${GameData.spriteBall(ballId)}" onerror="this.style.display='none'" alt="" /><div class="dn">${d.name}</div><div class="dt">Pokeball</div>`;
    } else if (d.kind === 'item') {
      const itemId = d.itemId || '';
      card.innerHTML = `<img src="${GameData.spriteItem(itemId)}" onerror="this.style.display='none'" alt="" /><div class="dn">${d.name}</div><div class="dt">${d.description}</div>`;
    } else if (d.kind === 'pokemon') {
      card.innerHTML = `<img src="${GameData.spriteStatic(d.speciesId)}" /><div class="dn">${d.name}</div><div class="dt">Pokemon</div>`;
    }
    reveal.appendChild(card);
  });
  GameUI.el('drawContinueBtn').onclick = () => {
    modal.hidden = true;
    if (onContinue) onContinue();
  };
  GameAudio.sfx.item();
};

// ============================== POKEMON DETAIL ==============================
GameUI.showPokemonDetail = function (mon, player) {
  const html = `
    <div style="display:flex;gap:16px;align-items:center;">
      <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" style="width:96px;height:96px;image-rendering:pixelated;" />
      <div>
        <div style="font-weight:bold;font-size:18px;">${mon.name}</div>
        <div style="margin-top:4px;">${mon.types.map(GameUI.typePill).join('')}</div>
        <div style="margin-top:6px;font-size:13px;">HP: <strong>${mon.hp} / ${mon.maxHp}</strong></div>
        ${mon.fainted ? '<div style="color:#f87171;font-weight:bold;margin-top:4px;">FAINTED</div>' : ''}
      </div>
    </div>
    <div style="margin-top:16px;">
      <h3 style="margin:0 0 8px;color:var(--pop);font-size:14px;">MOVES</h3>
      ${mon.moves.map(m => {
        const maxPp = m.maxPp != null ? m.maxPp : (m.gated ? 3 : 20);
        const pp = m.pp != null ? m.pp : maxPp;
        return `
        <div style="background:var(--bg-3);padding:8px;border-radius:6px;margin-bottom:6px;">
          <div style="font-weight:bold;">${m.name}${m.gated ? ' <span class="badge" style="font-size:9px;background:var(--pop);color:var(--bg);padding:1px 4px;border-radius:4px;">STRONG</span>' : ''}</div>
          <div style="font-size:11px;color:var(--ink-dim);">${m.type} type · Power ${m.power} · PP ${pp}/${maxPp}</div>
        </div>
      `;}).join('')}
    </div>
  `;
  GameUI.showTileInfo({ title: mon.name, description: `${player.name}'s Pokemon` }, html);
};

// ============================== ITEM PICKER ==============================
GameUI.showItemPicker = function (filterFn, title, hint, onPick) {
  const modal = GameUI.el('itemPickerModal');
  modal.hidden = false;
  GameUI.el('itemPickerTitle').textContent = title || 'Pick an item';
  GameUI.el('itemPickerHint').textContent = hint || '';
  const grid = GameUI.el('itemPickerGrid');
  grid.innerHTML = '';
  const player = GameState.currentPlayer();
  Object.entries(player.items).forEach(([itemId, count]) => {
    const item = GameData.getItem(itemId);
    if (!item) return;
    if (filterFn && !filterFn(item)) return;
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `<img class="item-card-sprite" src="${GameData.spriteItem(itemId)}" onerror="this.style.display='none'" alt="" /><h4>${item.name} ×${count}</h4><p>${item.description}</p>`;
    card.addEventListener('click', () => {
      modal.hidden = true;
      onPick(item);
    });
    grid.appendChild(card);
  });
  if (grid.children.length === 0) {
    grid.innerHTML = `<div class="hint">No matching items in inventory.</div>`;
  }
  GameUI.el('itemPickerCancel').onclick = () => { modal.hidden = true; };
};

// ============================== OUT OF BALLS POPUP ==============================
GameUI.showOutOfBallsPopup = function (pokemonName, onClose) {
  const modal = GameUI.el('noBallsModal');
  modal.hidden = false;
  GameUI.el('noBallsMessage').textContent = `A wild ${pokemonName} appeared, but you have no balls left! It got away.`;
  GameAudio.sfx.miss();
  setTimeout(() => {
    modal.hidden = true;
    if (onClose) onClose();
  }, 1400);
};

// ============================== FAINTED POPUP ==============================
GameUI.showFaintedPopup = function (player, returnTile, onClose) {
  const modal = GameUI.el('faintedModal');
  modal.hidden = false;
  // Pick the lead Pokemon to display fainted
  const lead = player.party[0];
  if (lead) {
    GameUI.el('faintedSprite').src = GameData.spriteFront(lead.speciesId);
    GameUI.el('faintedSprite').onerror = function () { this.src = GameData.spriteStatic(lead.speciesId); };
  }
  const returnLabel = GameData.getTile(returnTile)?.displayLabel || returnTile;
  GameUI.el('faintedMessage').textContent = `Returning ${player.name} to tile ${returnLabel}...`;
  setTimeout(() => {
    modal.hidden = true;
    if (onClose) onClose();
  }, 1400);
};

// ============================== VICTORY ==============================
GameUI.showVictory = function (player, defeatedLeader) {
  const modal = GameUI.el('victoryModal');
  modal.hidden = false;
  const winnerName = GameUI.el('winnerName');
  winnerName.innerHTML = '';
  // Show winner vs defeated-leader side by side when a leader was beaten.
  if (defeatedLeader) {
    const versus = document.createElement('div');
    versus.className = 'victory-versus';
    const winnerSpriteHtml = player.trainerSprite
      ? `<img src="sprites/trainers/${player.trainerSprite}.png" alt="${player.name}" />`
      : `<span class="victory-color-dot" style="background:${player.color}"></span>`;
    versus.innerHTML = `
      <div class="victory-vs-side winner">
        ${winnerSpriteHtml}
        <div class="hint" style="color:#fff;">Winner</div>
      </div>
      <div class="victory-vs-arrow">defeated</div>
      <div class="victory-vs-side defeated">
        <img src="sprites/trainers/${defeatedLeader.name.toLowerCase()}.png" alt="${defeatedLeader.name}" onerror="this.style.display='none'" />
        <div class="hint">${defeatedLeader.name}</div>
      </div>
    `;
    winnerName.appendChild(versus);
  } else if (player.trainerSprite) {
    const tImg = document.createElement('img');
    tImg.src = `sprites/trainers/${player.trainerSprite}.png`;
    tImg.alt = player.name;
    tImg.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;display:block;margin:0 auto 8px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));';
    winnerName.appendChild(tImg);
  }
  const nameSpan = document.createElement('span');
  nameSpan.textContent = player.name;
  nameSpan.style.cssText = `color:${player.color};`;
  winnerName.appendChild(nameSpan);
  const team = GameUI.el('winnerTeam');
  team.innerHTML = '';
  player.party.forEach(m => {
    const img = document.createElement('img');
    img.src = GameData.spriteFront(m.speciesId);
    img.onerror = () => { img.src = GameData.spriteStatic(m.speciesId); };
    img.title = m.name;
    team.appendChild(img);
  });
  GameAudio.sfx.fanfare();
  // Count remaining (non-completed) players to set the button label
  const remaining = GameState.players.filter(p => !p.completed).length;
  const btn = GameUI.el('victoryContinueBtn');
  btn.textContent = remaining > 0 ? 'Continue (next player)' : 'Return to title';
  btn.onclick = () => {
    modal.hidden = true;
    if (remaining > 0) {
      // Skip past completed players to find the next active turn
      GameGame.endTurn();
    } else {
      GameGame.endGame();
    }
  };
};

// ============================== EVOLUTION PICKER ==============================
GameUI.showEvolutionPicker = function (eligible, onPick) {
  const modal = GameUI.el('evolvePickerModal');
  modal.hidden = false;
  const grid = GameUI.el('evolvePickerGrid');
  grid.innerHTML = '';
  eligible.forEach(mon => {
    const options = GameItems.getEvolutionOptions(mon.speciesId);
    // Per-Pokemon Rare Candy cap this turn — render as disabled instead of clickable.
    if (GameState.candiedInstancesThisTurn && GameState.candiedInstancesThisTurn[mon.instanceId]) {
      const row = document.createElement('div');
      row.className = 'evolve-row disabled';
      row.innerHTML = `
        <div class="evolve-from">
          <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
          <div class="evolve-name">${mon.name}</div>
          <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
        </div>
        <div class="evolve-arrow" style="color:#555;">⏳</div>
        <div class="evolve-to">
          <div class="evolve-name" style="color:#888;">Used candy this turn</div>
          <div class="hint">Only 1 Rare Candy per Pokemon per turn — try again next turn</div>
        </div>
      `;
      grid.appendChild(row);
      return;
    }
    if (options.length === 0) {
      // Fully evolved — show stat-boost option (one per Pokemon).
      const alreadyBoosted = (mon.boostCount || 0) >= 1;
      const row = document.createElement('div');
      row.className = 'evolve-row' + (alreadyBoosted ? ' disabled' : '');
      if (alreadyBoosted) {
        row.innerHTML = `
          <div class="evolve-from">
            <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
            <div class="evolve-name">${mon.name} <span class="hint">(MAXED)</span></div>
            <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
          </div>
          <div class="evolve-arrow" style="color:#555;">✗</div>
          <div class="evolve-to">
            <div class="evolve-name" style="color:#888;">Already boosted</div>
            <div class="hint">Each Pokemon can only take 1 Rare Candy boost</div>
          </div>
        `;
        // Not clickable
      } else {
        const newMaxHp = Math.max(mon.maxHp + 1, Math.round(mon.maxHp * 1.25));
        row.innerHTML = `
          <div class="evolve-from">
            <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
            <div class="evolve-name">${mon.name}</div>
            <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
          </div>
          <div class="evolve-arrow" style="color:var(--pop);font-weight:bold;">+25%</div>
          <div class="evolve-to">
            <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" style="filter:drop-shadow(0 0 8px var(--pop));" />
            <div class="evolve-name">STAT BOOST</div>
            <div class="hint">HP → ${newMaxHp} · moves +25% power · PP 40/5</div>
          </div>
        `;
        row.addEventListener('click', () => {
          modal.hidden = true;
          onPick(mon, null);
        });
      }
      grid.appendChild(row);
    } else if (options.length === 1) {
      // Single evolution path — one clickable row
      const evolvedId = options[0];
      const evolvedData = GameData.getPokemon(evolvedId);
      const row = document.createElement('div');
      row.className = 'evolve-row';
      row.innerHTML = `
        <div class="evolve-from">
          <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
          <div class="evolve-name">${mon.name}</div>
          <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
        </div>
        <div class="evolve-arrow">→</div>
        <div class="evolve-to">
          <img src="${GameData.spriteFront(evolvedId)}" onerror="this.src='${GameData.spriteStatic(evolvedId)}'" alt="${evolvedData.name}" />
          <div class="evolve-name">${evolvedData.name}</div>
          <div class="hint">${evolvedData.types.join(' / ')} · HP ${evolvedData.hp}</div>
        </div>
      `;
      row.addEventListener('click', () => {
        modal.hidden = true;
        onPick(mon, evolvedId);
      });
      grid.appendChild(row);
    } else {
      // Multi-evolution path (Eevee) — show source, then a row of each evolution
      const wrap = document.createElement('div');
      wrap.className = 'evolve-multi';
      const optionsHtml = options.map(evolvedId => {
        const evolvedData = GameData.getPokemon(evolvedId);
        return `
          <button class="evolve-option" data-evo-id="${evolvedId}">
            <img src="${GameData.spriteFront(evolvedId)}" onerror="this.src='${GameData.spriteStatic(evolvedId)}'" alt="${evolvedData.name}" />
            <div class="evolve-name">${evolvedData.name}</div>
            <div class="hint">${evolvedData.types.join(' / ')}</div>
          </button>
        `;
      }).join('');
      const optionsHtmlNoTypes = options.map(evolvedId => {
        const evolvedData = GameData.getPokemon(evolvedId);
        return `
          <button class="evolve-option" data-evo-id="${evolvedId}" title="${evolvedData.name} · ${evolvedData.types.join(' / ')}">
            <img src="${GameData.spriteFront(evolvedId)}" onerror="this.src='${GameData.spriteStatic(evolvedId)}'" alt="${evolvedData.name}" />
            <div class="evolve-name">${evolvedData.name}</div>
          </button>
        `;
      }).join('');
      wrap.innerHTML = `
        <div class="evolve-multi-source">
          <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
          <div class="evolve-name">${mon.name}</div>
          <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
        </div>
        <div class="evolve-arrow">→</div>
        <div class="evolve-multi-options">${optionsHtmlNoTypes}</div>
      `;
      wrap.querySelectorAll('.evolve-option').forEach(btn => {
        btn.addEventListener('click', () => {
          modal.hidden = true;
          onPick(mon, Number(btn.dataset.evoId));
        });
      });
      grid.appendChild(wrap);
    }
  });
  GameUI.el('evolvePickerCancel').onclick = () => { modal.hidden = true; };
};

// ============================== EVOLUTION ANIMATION ==============================
GameUI.playEvolutionAnimation = function (fromSpeciesId, toSpeciesId, fromName, toName, onComplete) {
  const modal = GameUI.el('evolveAnimModal');
  const before = GameUI.el('evolveSpriteBefore');
  const after = GameUI.el('evolveSpriteAfter');
  const stage = modal.querySelector('.evolve-stage');
  const message = GameUI.el('evolveAnimMessage');
  const title = GameUI.el('evolveAnimTitle');

  before.src = GameData.spriteFront(fromSpeciesId);
  before.onerror = () => { before.src = GameData.spriteStatic(fromSpeciesId); };
  after.src = GameData.spriteFront(toSpeciesId);
  after.onerror = () => { after.src = GameData.spriteStatic(toSpeciesId); };

  title.textContent = `What?`;
  message.textContent = `${fromName} is evolving!`;
  stage.classList.remove('evolve-running');
  modal.hidden = false;

  // Force reflow then add running class to restart animations
  void stage.offsetWidth;
  stage.classList.add('evolve-running');

  // Audio cue: rising tone series
  GameAudio.tone(440, 100, 'square');
  setTimeout(() => GameAudio.tone(523, 100, 'square'), 200);
  setTimeout(() => GameAudio.tone(659, 100, 'square'), 400);
  setTimeout(() => GameAudio.tone(880, 250, 'square'), 1600);

  // Mid-animation message swap
  setTimeout(() => {
    title.textContent = `Congratulations!`;
    message.textContent = `${fromName} evolved into ${toName}!`;
  }, 1700);

  // End of animation
  setTimeout(() => {
    modal.hidden = true;
    stage.classList.remove('evolve-running');
    if (onComplete) onComplete();
  }, 2800);
};

// ============================== HALL OF FAME ==============================
GameUI.showHallOfFame = function () {
  GameState.loadHallOfFame();
  const modal = GameUI.el('hofModal');
  modal.hidden = false;
  const list = GameUI.el('hofList');
  list.innerHTML = '';
  if (GameState.hallOfFame.length === 0) {
    list.innerHTML = `<div class="hint">No champions yet. Beat Giovanni to enter the Hall.</div>`;
  } else {
    GameState.hallOfFame.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'hof-entry';
      const date = new Date(entry.date).toLocaleDateString();
      div.innerHTML = `
        <h3 style="color:${entry.color};">${entry.name}</h3>
        <div class="hof-date">Champion on ${date}</div>
        <div class="hof-team">${entry.party.map(m => `<img src="${GameData.spriteStatic(m.speciesId)}" title="${m.name}" />`).join('')}</div>
      `;
      list.appendChild(div);
    });
  }
  GameUI.el('hofCloseBtn').onclick = () => { modal.hidden = true; };
};
