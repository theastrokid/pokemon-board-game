// =============================================================
// ui.js  ·  DOM rendering for player panel, log, modals, etc.
// =============================================================
window.GameUI = {};

GameUI.el = function (id) { return document.getElementById(id); };

// Helper: every show*() function should call this first to clear any
// leftover spectator marking + re-enable buttons. Without it, if THIS
// device was previously spectating a peer's modal, opening our own copy
// inherits data-spectator="1" + disabled buttons → unclickable Continue.
GameUI._unspectate = function (modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  if (el.dataset.spectator) delete el.dataset.spectator;
  el.querySelectorAll('button').forEach(b => { b.disabled = false; });
};

// Which players this device may interactively mutate (release / use items /
// rearrange party).
//  - Single-device: only the active player (preserves classic pass-and-play).
//  - Multiplayer: just the slot this device claimed (plus CPUs if you're host).
GameUI.isLocallyOwned = function (p, slotIdx) {
  if (!p) return false;
  if (!window.GameMP || !GameMP.enabled) {
    return p === GameState.currentPlayer();
  }
  if (GameMP.localSlot != null && slotIdx === GameMP.localSlot) return true;
  if (p.isCpu && GameMP.isHost) return true;
  return false;
};

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
      const isBattleSlot = true; // whole party (up to 6) fights now
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
  // refreshAll (not renderParty) so the visible trainer panel updates AND
  // the multiplayer broadcast fires — without this, a peer reorder stays
  // invisible to other devices until some other mutation triggers a sync.
  GameUI.refreshAll();
  if (clampedTo === 0 && fromIdx !== 0) {
    GameUI.log(`${player.name} moved <strong>${moved.name}</strong> to the front of the battle lineup.`, 'system');
  }
};

GameUI.discardPartyMember = function (player, idx) {
  const mon = player.party[idx];
  if (!mon) return;
  if (player.party.length === 1) {
    alert('You cannot release your last Pokemon.');
    return;
  }
  const bonus = GameItems.computeDiscardBonus(mon.speciesId, mon.isShiny);
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
    // Title carries the released mon's sprite + name so the synced showDraws
    // capture (which ships drawTitle.innerHTML to spectators) tells them
    // exactly WHO was released — not just that some Pokemon was.
    const releasedSpriteHtml = `<img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.onerror=null;this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" style="width:56px;height:56px;image-rendering:pixelated;vertical-align:middle;margin-right:10px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));" />`;
    const bonusHtml = n > 1 ? ` <span class="crit">· ×${n} bonus</span>` : '';
    const title = `${releasedSpriteHtml}${player.name} released <strong>${mon.name}</strong>${bonusHtml}`;
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
  GameState.players.forEach((p, slotIdx) => {
    const isActive = p === active;
    const owned = GameUI.isLocallyOwned(p, slotIdx);
    const panel = document.createElement('div');
    panel.className = 'trainer-panel' + (isActive ? ' active' : '') + (owned ? ' owned' : '');
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
          <div class="tp-name" style="color:${p.color}">${p.name}${p.isCpu ? ' <span class="tp-cpu-tag">🤖 CPU</span>' : ''}${owned && window.GameMP && GameMP.enabled ? ' <span class="tp-me-tag">YOU</span>' : ''}${isActive ? ' <span class="tp-active-tag">YOUR TURN</span>' : ''}${(p.catchStreak || 0) > 1 ? ` <span class="tp-streak">🔥 ×${p.catchStreak}</span>` : ''}</div>
          <div class="tp-pos">${area ? area.name : '?'} · Tile ${tileLabel}${p.completed ? ' · 🏆' : ''}</div>
        </div>
        <div class="tp-counts">
          <span class="tp-count-pill">${p.party.length}/6</span>
        </div>
      </div>
      <div class="tp-party"></div>
      <div class="tp-status" hidden></div>
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
        card.className = 'tp-mon battle-slot' + (mon.fainted ? ' fainted' : '') + (mon.isShiny ? ' shiny' : '');
        card.draggable = owned;
        card.dataset.partyIdx = i;
        card.innerHTML = `
          <div class="tp-mon-slot">${i + 1}</div>
          <img src="${GameData.spriteStatic(mon.speciesId)}" alt="${mon.name}" draggable="false" />
          <div class="tp-mon-name">${mon.isShiny ? '✨ ' : ''}${mon.name}</div>
          <div class="tp-mon-hp"><div class="tp-mon-hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
          ${owned ? '<button class="tp-mon-x" title="Release">✕</button>' : ''}
        `;
        card.addEventListener('click', (e) => {
          if (e.target.closest('.tp-mon-x')) return;
          if (GameUI._suppressClickIfJustDragged(card)) return;
          GameUI.showPokemonDetail(mon, p);
        });
        const x = card.querySelector('.tp-mon-x');
        if (x) x.addEventListener('click', (e) => { e.stopPropagation(); GameUI.discardPartyMember(p, i); });
        if (owned) GameUI._attachPartyDragHandlers(card, p, i);
        partyEl.appendChild(card);
      } else {
        const empty = document.createElement('div');
        empty.className = 'tp-mon empty' + (i < 3 ? ' battle-slot' : '');
        empty.dataset.partyIdx = i;
        empty.textContent = '+';
        if (owned) GameUI._attachPartyDragHandlers(empty, p, i, true);
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
          <span class="tp-inv-right"><span class="tp-count">×${count}</span>${owned ? `<button class="tp-use" data-item="${itemId}">USE</button>` : ''}</span>
        `;
        const useBtn = li.querySelector('.tp-use');
        if (useBtn) useBtn.addEventListener('click', () => GameItems.useItem(itemId, p));
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
    // Status row: active Lucky Egg multiplier + Eggs with hatch countdown.
    const statusEl = panel.querySelector('.tp-status');
    const statusBits = [];
    if (p.flags && p.flags.luckyEgg) {
      statusBits.push(`<span class="tp-status-chip lucky-egg-chip" title="Your next gym leader's reward is doubled">🍀 Lucky Egg active · 2× next gym reward</span>`);
    }
    (p.eggs || []).forEach(egg => {
      const left = egg.turnsLeft || 0;
      const ready = left <= 0;
      const label = ready ? 'ready to hatch!' : `${left} turn${left === 1 ? '' : 's'} left`;
      statusBits.push(
        `<span class="tp-status-chip egg-chip${ready ? ' ready' : ''}" title="Hatches into a shiny Pokémon">` +
        `<span class="egg-chip-egg">🥚<span class="egg-chip-count">${ready ? '★' : left}</span></span>` +
        ` Egg · ${label}</span>`
      );
    });
    statusEl.innerHTML = statusBits.join('');
    statusEl.hidden = statusBits.length === 0;
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
  const moneyEl = GameUI.el('moneyAmount');
  if (moneyEl) moneyEl.textContent = (active && active.money != null) ? active.money : 0;
};

GameUI.refreshAll = function () {
  GameUI.renderPlayerPanel();
  GameBoard.renderTokens();
  if (window.GameBoard && GameBoard.renderLegendaryOverlay) GameBoard.renderLegendaryOverlay();
  GameUI._refreshTapHint();
  // Push state to peers in multiplayer mode. Guarded against re-entry when
  // we're applying a remote update (so we don't echo it back). fromMutation=true
  // so the receiver knows to defend our own slot from races with stale peer
  // broadcasts in flight.
  if (window.GameMP && GameMP.enabled) GameMP.broadcastState(true);
};

// Small ephemeral toast for tile events ("A trainer gives you a Potion!").
GameUI.showTileEventToast = function (msg) {
  // Replace any existing toast so back-to-back events don't pile up.
  const old = document.querySelector('.tile-event-toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.className = 'tile-event-toast';
  toast.textContent = '🎁 ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
};

// ============================== ENCOUNTER ==============================
GameUI.showEncounter = function (speciesId, ctx) {
  GameUI._unspectate('encounterModal');
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
    // Fleeing breaks the catch streak — same as missing on purpose.
    if (player.catchStreak) {
      GameUI.log(`<span class="lose">Catch streak broken at ×${player.catchStreak} (fled).</span>`, 'lose');
      GameState.resetCatchStreak(player);
    }
    GameUI.hideEncounter();
    GameGame.afterTileResolved();
  };

  GameAudio.sfx.encounter();
};

// ============================== GYM LEADER INTRO ==============================
// Brief cinematic shown right before a gym fight: the leader, then the exact
// Pokemon they will use (the team already drawn in startGymBattle). Auto-
// advances after the reveal plays; tapping "Battle!" skips ahead. `leader`
// must already carry the selected `.team`.
GameUI.showGymIntro = function (leader, onDone) {
  const modal = GameUI.el('gymIntroModal');
  if (!modal || !leader || !leader.team) { if (onDone) onDone(); return; }
  GameUI._unspectate('gymIntroModal');
  const team = leader.team;
  const leaderId = leader.name.toLowerCase();
  const sprite = GameUI.el('gymIntroLeaderSprite');
  sprite.style.display = '';
  sprite.src = `sprites/trainers/${leaderId}.png`;
  sprite.onerror = function () { this.style.display = 'none'; };
  GameUI.el('gymIntroName').textContent = `Gym Leader ${leader.name}`;
  GameUI.el('gymIntroCity').textContent = leader.city || '';
  GameUI.el('gymIntroSubtitle').textContent = `is about to send out ${team.length} Pokémon!`;
  const card = modal.querySelector('.gym-intro-card');
  if (card) card.style.setProperty('--leader-color', leader.color || '#cc4422');
  const teamEl = GameUI.el('gymIntroTeam');
  teamEl.innerHTML = '';
  team.forEach((spec, i) => {
    const p = GameData.getPokemon(spec.id);
    if (!p) return;
    const mon = document.createElement('div');
    mon.className = 'gym-intro-mon';
    mon.style.animationDelay = (0.3 + i * 0.22) + 's';
    mon.innerHTML = `
      <div class="gi-order">${i + 1}</div>
      <img src="${GameData.spriteFront(spec.id)}" onerror="this.onerror=null;this.src='${GameData.spriteStatic(spec.id)}'" alt="${p.name}" />
      <div class="gi-name">${p.name}</div>
    `;
    teamEl.appendChild(mon);
  });
  modal.hidden = false;
  if (GameAudio.sfx && GameAudio.sfx.gymStart) GameAudio.sfx.gymStart();

  // Single-fire finish guard: auto-advance OR skip button, never both.
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (GameUI._gymIntroTimer) { clearTimeout(GameUI._gymIntroTimer); GameUI._gymIntroTimer = null; }
    modal.hidden = true;
    if (onDone) onDone();
  };
  const holdMs = Math.min(4200, 1500 + team.length * 220 + 700);
  GameUI._gymIntroTimer = setTimeout(finish, holdMs);
  const skipBtn = GameUI.el('gymIntroSkipBtn');
  if (skipBtn) skipBtn.onclick = finish;
};

// ============================== GYM LEADER PREVIEW ==============================
// Opens a modal showing the gym leader's team in battle order. Read-only —
// just a scouting tool so players can plan which Pokemon to use.
GameUI.showGymPreview = function (tile) {
  const leader = GameData.getGymLeader(tile.leader);
  if (!leader) return;
  const modal = document.getElementById('gymPreviewModal');
  if (!modal) return;
  const leaderId = leader.name.toLowerCase();
  document.getElementById('gymPreviewLeaderSprite').src = `sprites/trainers/${leaderId}.png`;
  document.getElementById('gymPreviewLeaderSprite').onerror = function () { this.style.display = 'none'; };
  document.getElementById('gymPreviewName').textContent = `${leader.name}'s Gym`;
  document.getElementById('gymPreviewCity').textContent = leader.city || '';
  const team = document.getElementById('gymPreviewTeam');
  team.innerHTML = '';
  const mul = Number(leader.scaleMultiplier) || 1;
  // Leaders now field a random subset of a larger pool each battle. Show the
  // whole pool so players can scout possibilities; note how many are drawn.
  const roster = leader.pool || leader.team || [];
  const teamSize = leader.teamSize || roster.length;
  const subtitleEl = document.getElementById('gymPreviewSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = (leader.pool && teamSize < roster.length)
      ? `Pool of ${roster.length} — ${teamSize} chosen at random each battle:`
      : 'Team in battle order:';
  }
  roster.forEach((spec, i) => {
    const p = GameData.getPokemon(spec.id);
    if (!p) return;
    const lvlBoost = (typeof spec.scale === 'number') ? spec.scale : (1 + (spec.level / 50) * 0.6) * mul;
    const scaledHp = Math.round(p.hp * lvlBoost);
    const card = document.createElement('div');
    card.className = 'gym-preview-mon';
    card.innerHTML = `
      <img src="${GameData.spriteFront(spec.id)}" onerror="this.onerror=null;this.src='${GameData.spriteStatic(spec.id)}'" alt="${p.name}" />
      <div class="mn">${p.name}</div>
      <div class="ml">Lv ${spec.level} · ~HP ${scaledHp}</div>
      <div class="mt">${(p.types || []).map(t => GameUI.typePill(t)).join('')}</div>
    `;
    team.appendChild(card);
  });
  // Meta line: reward + failure penalty
  const r = leader.reward || {};
  const rewardLine = r.endsGame
    ? '<strong>WIN:</strong> Game over · Hall of Fame'
    : `<strong>WIN:</strong> ${r.items || 0} items + ${r.pokeballs || 0} pokeballs`;
  const PENALTY_DESC = {
    back8: 'sent back 8 tiles', back32: 'sent back to tile 32',
    back56: 'sent back to tile 56', back75: 'sent back to tile 75',
    templeStart: 'forced back to start of Ancient Temple',
  };
  const failLine = leader.failPenalty ? `<strong>LOSE:</strong> ${PENALTY_DESC[leader.failPenalty] || leader.failPenalty} (party fully healed)` : '';
  document.getElementById('gymPreviewMeta').innerHTML = `${rewardLine}<br />${failLine}`;
  modal.hidden = false;
  document.getElementById('gymPreviewClose').onclick = () => { modal.hidden = true; };
};

// ============================== PRE-GYM PARTY PREP ==============================
// Shown when the active player lands on a gym. Lets them rearrange their
// party (top 3 fight) and study the leader's team side-by-side before
// committing to the battle. Click-to-pick + click-to-place swap UI.
GameUI.showGymPrep = function (leader, onFight) {
  const player = GameState.currentPlayer();
  if (!leader || !player) { if (onFight) onFight(); return; }
  const modal = document.getElementById('gymPrepModal');
  if (!modal) { if (onFight) onFight(); return; }
  const leaderId = leader.name.toLowerCase();
  const sprite = document.getElementById('gymPrepLeaderSprite');
  sprite.style.display = '';
  sprite.src = leader.prepSprite || `sprites/trainers/${leaderId}.png`;
  sprite.onerror = function () { this.style.display = 'none'; };
  // prepLabel lets non-gym callers (Team Rocket) override "Gym Leader X".
  document.getElementById('gymPrepTitle').textContent = `${player.name} vs ${leader.prepLabel || ('Gym Leader ' + leader.name)}`;

  // Render opponent's team in battle order
  const oppRow = document.getElementById('gymPrepOppTeam');
  oppRow.innerHTML = '';
  leader.team.forEach((spec, i) => {
    const p = GameData.getPokemon(spec.id);
    if (!p) return;
    const mini = document.createElement('div');
    mini.className = 'opp-mini';
    mini.innerHTML = `
      <img src="${GameData.spriteFront(spec.id)}" onerror="this.onerror=null;this.src='${GameData.spriteStatic(spec.id)}'" alt="${p.name}" />
      <strong>${i + 1}. ${p.name}</strong>
      <span>Lv ${spec.level}</span>
    `;
    oppRow.appendChild(mini);
  });

  let selectedIdx = null;
  const renderParty = () => {
    const grid = document.getElementById('gymPrepPartyGrid');
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const mon = player.party[i];
      const slot = document.createElement('div');
      const isBattle = !!mon; // all party Pokemon fight now
      slot.className = 'gym-prep-slot' + (isBattle ? ' battle-slot' : '') + (mon ? '' : ' empty') + (mon && mon.fainted ? ' fainted' : '') + (i === selectedIdx ? ' selected' : '');
      slot.dataset.idx = i;
      if (mon) {
        slot.innerHTML = `
          <div class="slot-num">${i + 1}</div>
          <img src="${GameData.spriteStatic(mon.speciesId)}" alt="${mon.name}" />
          <div class="gp-name">${mon.isShiny ? '✨ ' : ''}${mon.name}</div>
          <div class="gp-hp">${mon.hp}/${mon.maxHp}${mon.fainted ? ' · FAINTED' : ''}</div>
        `;
      } else {
        slot.innerHTML = `<div class="slot-num">${i + 1}</div><div style="margin-top:30px;font-size:24px;color:#3a516e;">+</div>`;
      }
      slot.onclick = () => {
        if (!mon && selectedIdx == null) return;
        if (selectedIdx == null) { selectedIdx = i; renderParty(); return; }
        if (selectedIdx === i) { selectedIdx = null; renderParty(); return; }
        // Swap: move party[selectedIdx] into slot i (push others down using
        // the existing reorder helper).
        const fromIdx = selectedIdx;
        selectedIdx = null;
        if (player.party[fromIdx]) GameUI.reorderPartyByDrop(player, fromIdx, i);
        renderParty();
      };
      grid.appendChild(slot);
    }
  };
  renderParty();

  document.getElementById('gymPrepFightBtn').onclick = () => {
    modal.hidden = true;
    if (onFight) onFight();
  };
  modal.hidden = false;
};

// Big in-board dice — shown on the right side of the board pane whenever the
// active player rolls. Tumbles for ~600ms, lands on the final number with a
// satisfying bounce, then fades out after a short hold so movement can play.
GameUI.runBigDice = function (finalRoll, onSettled) {
  const dice = document.getElementById('bigDice');
  const face = document.getElementById('bigDiceFace');
  const caption = document.getElementById('bigDiceCaption');
  if (!dice || !face) { if (onSettled) onSettled(); return; }
  dice.hidden = false;
  dice.className = 'big-dice tumbling';
  caption.textContent = 'Rolling...';
  face.textContent = String(GameState.rollD6 ? GameState.rollD6() : (1 + Math.floor(Math.random() * 6)));
  if (GameUI._bigDiceCycle) clearInterval(GameUI._bigDiceCycle);
  GameUI._bigDiceCycle = setInterval(() => {
    face.textContent = String(GameState.rollD6 ? GameState.rollD6() : (1 + Math.floor(Math.random() * 6)));
  }, 80);
  const tumbleMs = 700;
  setTimeout(() => {
    clearInterval(GameUI._bigDiceCycle);
    GameUI._bigDiceCycle = null;
    face.textContent = String(finalRoll);
    dice.className = 'big-dice settled';
    const playerName = (GameState.currentPlayer && GameState.currentPlayer())?.name || '';
    caption.textContent = playerName ? `${playerName} rolled ${finalRoll}` : `Rolled ${finalRoll}`;
    if (GameAudio && GameAudio.sfx && GameAudio.sfx.item) GameAudio.sfx.item();
    if (onSettled) onSettled();
    // Hide after a hold so movement gets the spotlight
    setTimeout(() => {
      dice.hidden = true;
      dice.className = 'big-dice';
    }, 1400);
  }, tumbleMs);
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
  GameUI._unspectate('battleModal');
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
  GameUI._unspectate('branchModal');
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
  GameUI._unspectate('drawModal');
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
  const slotIdx = GameState.players.indexOf(player);
  const owned = GameUI.isLocallyOwned(player, slotIdx);
  const currentPartyIdx = player.party.findIndex(m => m.instanceId === mon.instanceId);
  // Position buttons let the user tap to move a mon into another party slot.
  // All party Pokemon (up to 6) fight; the lower the slot number, the sooner
  // it's sent out. Empty slots beyond the party are clamped down by reorder.
  const canReorder = owned && player.party.length > 1 && currentPartyIdx >= 0;
  // Offer a Release button inside the detail modal so tapping a party
  // Pokemon gives a clear discard path — the small ✕ overlay on the party
  // card itself is easy to miss on tablet/mobile.
  const canRelease = owned && player.party.length > 1 && !mon.fainted;
  const cannotReleaseReason = !owned
    ? null
    : (player.party.length <= 1 ? 'Cannot release your last Pokemon.'
        : (mon.fainted ? 'Revive before releasing.' : null));
  const positionRowHtml = canReorder ? (() => {
    const buttons = [];
    for (let i = 0; i < 6; i++) {
      const isCurrent = i === currentPartyIdx;
      const beyondParty = i > player.party.length - 1;
      const label = `Slot ${i + 1}`;
      const bg = isCurrent ? '#0ea5e9' : '#f59e0b22';
      const border = isCurrent ? '#0ea5e9' : '#f59e0b';
      const color = isCurrent ? '#fff' : '#fbbf24';
      buttons.push(`
        <button type="button" class="pos-btn" data-target-slot="${i}" ${isCurrent ? 'disabled' : ''}
          style="flex:1;min-width:60px;background:${bg};border:1.5px solid ${border};color:${color};
                 padding:8px 4px;border-radius:6px;font-size:11px;font-weight:bold;
                 ${beyondParty ? 'opacity:0.7;' : ''}
                 ${isCurrent ? 'cursor:default;' : 'cursor:pointer;'}">
          ${label}${isCurrent ? '<br><span style="font-size:9px;opacity:0.8;">(here)</span>' : ''}
        </button>
      `);
    }
    return `
      <div style="margin-top:16px;">
        <h3 style="margin:0 0 8px;color:var(--pop);font-size:14px;">PARTY POSITION</h3>
        <p class="hint" style="margin:0 0 8px;font-size:11px;">All your Pokémon fight; lower slot = sent out sooner. Tap a slot to move ${mon.name} there.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${buttons.join('')}</div>
      </div>
    `;
  })() : '';
  const html = `
    <div style="display:flex;gap:16px;align-items:center;">
      <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" style="width:96px;height:96px;image-rendering:pixelated;" />
      <div>
        <div style="font-weight:bold;font-size:18px;">${mon.name}</div>
        <div style="margin-top:4px;">${mon.types.map(GameUI.typePill).join('')}</div>
        <div style="margin-top:6px;font-size:13px;">HP: <strong>${mon.hp} / ${mon.maxHp}</strong></div>
        ${mon.fainted ? '<div style="color:#f87171;font-weight:bold;margin-top:4px;">FAINTED</div>' : ''}
        ${currentPartyIdx >= 0 ? `<div style="margin-top:4px;font-size:11px;color:var(--ink-dim);">Battle order ${currentPartyIdx + 1}</div>` : ''}
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
    ${positionRowHtml}
    ${canRelease ? `
      <div style="margin-top:16px;text-align:center;">
        <button id="pokemonDetailReleaseBtn" class="primary-btn" style="background:#dc2626;border-color:#b91c1c;color:#fff;font-weight:bold;padding:10px 20px;">
          Release ${mon.name}
        </button>
      </div>
    ` : (cannotReleaseReason ? `
      <div style="margin-top:16px;text-align:center;color:var(--ink-dim);font-size:12px;">
        ${cannotReleaseReason}
      </div>
    ` : '')}
  `;
  GameUI.showTileInfo({ title: mon.name, description: `${player.name}'s Pokemon` }, html);
  if (canRelease) {
    const btn = document.getElementById('pokemonDetailReleaseBtn');
    if (btn) {
      btn.onclick = () => {
        GameUI.el('tileModal').hidden = true;
        const idx = player.party.findIndex(m => m.instanceId === mon.instanceId);
        if (idx >= 0) GameUI.discardPartyMember(player, idx);
      };
    }
  }
  if (canReorder) {
    document.querySelectorAll('#tileBody .pos-btn').forEach(btn => {
      btn.onclick = () => {
        const target = Number(btn.dataset.targetSlot);
        if (Number.isNaN(target) || target === currentPartyIdx) return;
        GameUI.el('tileModal').hidden = true;
        GameUI.reorderPartyByDrop(player, currentPartyIdx, target);
      };
    });
  }
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

// ============================== SHOP (POKÉ MART) ==============================
// Buy / sell items + balls with the active player's money. Selling pays half
// the buy price. Only the active, locally-owned (non-CPU) player may shop.
GameUI.showShop = function () {
  const player = GameState.currentPlayer();
  if (!player || player.isCpu) return;
  const slotIdx = GameState.players.indexOf(player);
  if (!GameUI.isLocallyOwned(player, slotIdx)) return;
  if (GameBattle.active) return;
  // Only at a safe point — the start of your turn, before rolling — so closing
  // the shop never strands the auto-advance mid-turn-resolution.
  const rollBtn = document.getElementById('rollMoveBtn');
  if (GameState.busy || GameState.pendingTileResolution || (rollBtn && rollBtn.disabled)) {
    GameUI.log('Visit the Poké Mart at the start of your turn, before you roll.', 'system');
    return;
  }
  const modal = GameUI.el('shopModal');
  GameUI._unspectate('shopModal');
  modal.hidden = false;
  let tab = 'buy';
  const render = () => {
    GameUI.el('shopMoney').textContent = player.money || 0;
    GameUI.el('shopHint').textContent = tab === 'buy'
      ? 'Buy items & balls. (Sell tab pays about half the buy price.)'
      : 'Sell surplus items & balls for cash. Eggs can\'t be sold.';
    document.querySelectorAll('#shopModal .shop-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const grid = GameUI.el('shopGrid');
    grid.innerHTML = '';
    if (tab === 'buy') {
      const entries = [
        ...GameData.items.map(it => ({ kind: 'item', id: it.id, name: it.name, desc: it.description, price: it.price || 0, sprite: GameData.spriteItem(it.id) })),
        ...GameData.pokeballs.map(b => ({ kind: 'ball', id: b.id, name: b.name, desc: 'Poke Ball', price: b.price || 0, sprite: GameData.spriteBall(b.id) })),
      ].filter(e => e.price > 0).sort((a, b) => a.price - b.price);
      entries.forEach(e => {
        const afford = (player.money || 0) >= e.price;
        const card = document.createElement('div');
        card.className = 'shop-item' + (afford ? '' : ' unaffordable');
        card.innerHTML = `
          <img class="shop-item-sprite" src="${e.sprite}" onerror="this.style.display='none'" alt="" />
          <div class="shop-item-info"><div class="shop-item-name">${e.name}</div><div class="hint">${e.desc}</div></div>
          <button class="shop-buy-btn" ${afford ? '' : 'disabled'}>₽${e.price}</button>
        `;
        const btn = card.querySelector('.shop-buy-btn');
        btn.onclick = () => {
          if (GameState.buy(player, e.kind, e.id)) {
            GameUI.log(`${player.name} bought <strong>${e.name}</strong> for ₽${e.price}.`, 'system');
            if (GameAudio.sfx && GameAudio.sfx.item) GameAudio.sfx.item();
            GameUI.refreshAll();
            render();
          }
        };
        grid.appendChild(card);
      });
    } else {
      const owned = [
        ...Object.entries(player.items || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ kind: 'item', id, n, def: GameData.getItem(id), sprite: GameData.spriteItem(id) })),
        ...Object.entries(player.balls || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ kind: 'ball', id, n, def: GameData.getPokeball(id), sprite: GameData.spriteBall(id) })),
      ].filter(e => e.def);
      if (owned.length === 0) { grid.innerHTML = '<div class="hint">Nothing to sell.</div>'; return; }
      owned.forEach(e => {
        const price = GameState.sellPrice(e.kind, e.id);
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `
          <img class="shop-item-sprite" src="${e.sprite}" onerror="this.style.display='none'" alt="" />
          <div class="shop-item-info"><div class="shop-item-name">${e.def.name} <span class="hint">×${e.n}</span></div><div class="hint">Sell for ₽${price} each</div></div>
          <button class="shop-sell-btn">Sell ₽${price}</button>
        `;
        card.querySelector('.shop-sell-btn').onclick = () => {
          const got = GameState.sell(player, e.kind, e.id);
          if (got) {
            GameUI.log(`${player.name} sold a <strong>${e.def.name}</strong> for ₽${got}.`, 'system');
            if (GameAudio.sfx && GameAudio.sfx.item) GameAudio.sfx.item();
            GameUI.refreshAll();
            render();
          }
        };
        grid.appendChild(card);
      });
    }
  };
  document.querySelectorAll('#shopModal .shop-tab').forEach(t => {
    t.onclick = () => { tab = t.dataset.tab; render(); };
  });
  GameUI.el('shopCloseBtn').onclick = () => { modal.hidden = true; };
  render();
};

// ============================== DICE PICKER (Loaded Dice) ==============================
GameUI.showDicePicker = function (onPick) {
  const modal = GameUI.el('dicePickerModal');
  if (!modal) return;
  GameUI._unspectate('dicePickerModal');
  const grid = GameUI.el('dicePickGrid');
  grid.innerHTML = '';
  for (let n = 1; n <= 6; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dice-pick-btn';
    btn.textContent = n;
    btn.onclick = () => { modal.hidden = true; if (onPick) onPick(n); };
    grid.appendChild(btn);
  }
  GameUI.el('dicePickCancel').onclick = () => { modal.hidden = true; };
  modal.hidden = false;
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
  GameUI._unspectate('faintedModal');
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
GameUI._ordinal = function (n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

GameUI.showVictory = function (player, defeatedLeader, hofEntry) {
  GameUI._unspectate('victoryModal');
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

  // Hall of Fame ranking: team strength × speed bonus → leaderboard position.
  if (hofEntry && GameState.rankInHallOfFame) {
    const r = GameState.rankInHallOfFame(hofEntry);
    const stats = GameState.hofTeamStats(hofEntry);
    const mul = GameState.hofTurnMultiplier(hofEntry.turns);
    const isTop = r.rank === 1;
    const panel = document.createElement('div');
    panel.className = 'victory-rank' + (isTop ? ' top' : '');
    panel.innerHTML = `
      <div class="vr-headline">${isTop
        ? `🏆 #1 CHAMPION${r.total > 1 ? ' on the leaderboard!' : '!'}`
        : `Hall of Fame rank <strong>${GameUI._ordinal(r.rank)}</strong> of ${r.total}`}</div>
      <div class="vr-score">Score <strong>${r.score.toLocaleString()}</strong></div>
      <div class="vr-breakdown">${stats.toLocaleString()} team stats × <strong>${mul.toFixed(2)}×</strong> speed bonus · finished in <strong>${hofEntry.turns}</strong> turn${hofEntry.turns === 1 ? '' : 's'}</div>
      <button type="button" class="vr-view-btn" id="victoryViewHofBtn">🏆 View full leaderboard</button>
    `;
    winnerName.appendChild(panel);
    const viewBtn = panel.querySelector('#victoryViewHofBtn');
    if (viewBtn) viewBtn.onclick = () => { if (GameUI.showHallOfFame) GameUI.showHallOfFame(hofEntry); };
  }

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
GameUI.showEvolutionPicker = function (eligible, onPick, player) {
  const modal = GameUI.el('evolvePickerModal');
  modal.hidden = false;
  const candies = (player && player.items && player.items.rare_candy) || 0;
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
      // Fully evolved — stat-boost option. Tier 1 = +25% (1 candy); tier 2 =
      // +50% total (3 candies). Capped at two boosts.
      const bc = mon.boostCount || 0;
      const maxed = bc >= 2;
      const tier2 = bc === 1;                 // next boost is the +50% upgrade
      const cost = bc === 0 ? 1 : 3;
      const canAfford = candies >= cost;
      const row = document.createElement('div');
      row.className = 'evolve-row' + (maxed || !canAfford ? ' disabled' : '');
      if (maxed) {
        row.innerHTML = `
          <div class="evolve-from">
            <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
            <div class="evolve-name">${mon.name} <span class="hint">(MAXED)</span></div>
            <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
          </div>
          <div class="evolve-arrow" style="color:#555;">✗</div>
          <div class="evolve-to">
            <div class="evolve-name" style="color:#888;">Fully boosted (+50%)</div>
            <div class="hint">Each Pokemon can take at most two boosts</div>
          </div>
        `;
      } else {
        const mul = tier2 ? 1.2 : 1.25;
        const newMaxHp = Math.max(mon.maxHp + 1, Math.round(mon.maxHp * mul));
        const pct = tier2 ? '+50%' : '+25%';
        const boostLabel = tier2 ? '+50% UPGRADE' : 'STAT BOOST';
        const costLabel = `${cost} Rare Cand${cost > 1 ? 'ies' : 'y'}`;
        row.innerHTML = `
          <div class="evolve-from">
            <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
            <div class="evolve-name">${mon.name}${tier2 ? ' <span class="hint">(+25%)</span>' : ''}</div>
            <div class="hint">HP ${mon.hp}/${mon.maxHp}</div>
          </div>
          <div class="evolve-arrow" style="color:var(--pop);font-weight:bold;">${pct}</div>
          <div class="evolve-to">
            <img src="${GameData.spriteFront(mon.speciesId)}" onerror="this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" style="filter:drop-shadow(0 0 8px var(--pop));" />
            <div class="evolve-name">${boostLabel}</div>
            <div class="hint">HP → ${newMaxHp} · moves ${pct} · costs ${costLabel}${canAfford ? '' : ` — need ${cost}`}</div>
          </div>
        `;
        if (canAfford) {
          row.addEventListener('click', () => {
            modal.hidden = true;
            onPick(mon, null);
          });
        }
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
  GameUI._unspectate('evolveAnimModal');
  const modal = GameUI.el('evolveAnimModal');
  // Stash the species IDs on the modal so the multiplayer modal-capture can
  // ship them across the wire — spectators need them to render the right
  // before/after sprites (without, they'd see whatever was in the img tags
  // from a previous animation, or empty).
  modal.dataset.fromSpeciesId = String(fromSpeciesId);
  modal.dataset.toSpeciesId = String(toSpeciesId);
  modal.dataset.fromName = fromName || '';
  modal.dataset.toName = toName || '';
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

// ============================== EGG HATCH ==============================
// Reveal animation for a hatching Egg, shown on the owner's turn. The egg
// wobbles ~2.2s, then the shiny hatchling is revealed and added to the party.
// GameState.busy is held true for the duration so the player can't roll into a
// half-resolved state; it's released only when they tap Continue.
GameUI.showEggHatch = function (player, egg, onComplete) {
  const modal = GameUI.el('eggHatchModal');
  if (!modal) {
    // No modal available — finalize immediately so we never soft-lock.
    const mon = GameState.makeHatchling(player, egg.speciesId);
    GameUI.log(`<span class="crit">✨ ${player.name}'s Egg hatched into a SHINY ${mon ? mon.name : 'Pokemon'}!</span>`, 'crit');
    GameUI.refreshAll();
    if (onComplete) onComplete();
    return;
  }
  GameUI._unspectate('eggHatchModal');
  const poke = GameData.getPokemon(egg.speciesId);
  const eggEl = GameUI.el('eggHatchEgg');
  const spriteEl = GameUI.el('eggHatchSprite');
  const msgEl = GameUI.el('eggHatchMessage');
  const actions = GameUI.el('eggHatchActions');
  const titleEl = GameUI.el('eggHatchTitle');
  // Reset to "wobbling egg" state.
  titleEl.textContent = 'Your Egg is hatching!';
  msgEl.innerHTML = `${player.name}'s Egg is wobbling…`;
  eggEl.hidden = false;
  eggEl.className = 'egg-hatch-egg';
  spriteEl.hidden = true;
  spriteEl.className = 'egg-hatch-sprite';
  actions.hidden = true;
  modal.hidden = false;
  void eggEl.offsetWidth;
  eggEl.classList.add('hatching');
  GameState.busy = true; // block rolling while the hatch plays out
  if (GameAudio.sfx && GameAudio.sfx.encounter) GameAudio.sfx.encounter();

  let finished = false;
  const reveal = () => {
    if (finished) return;
    finished = true;
    eggEl.hidden = true;
    // Add the shiny hatchling now (room guaranteed by tickEggsTurnStart).
    const mon = GameState.makeHatchling(player, egg.speciesId);
    spriteEl.src = GameData.spriteFront(egg.speciesId);
    spriteEl.onerror = function () { this.onerror = null; this.src = GameData.spriteStatic(egg.speciesId); };
    spriteEl.hidden = false;
    void spriteEl.offsetWidth;
    spriteEl.classList.add('revealed');
    titleEl.textContent = 'Congratulations!';
    msgEl.innerHTML = `✨ It's a <strong>SHINY ${(mon && mon.name) || (poke && poke.name) || 'Pokémon'}</strong>! It joined ${player.name}'s party.`;
    if (GameAudio.sfx && GameAudio.sfx.fanfare) GameAudio.sfx.fanfare();
    GameUI.refreshAll();
    actions.hidden = false;
    GameUI.el('eggHatchContinueBtn').onclick = () => {
      modal.hidden = true;
      GameState.busy = false;
      if (onComplete) onComplete();
    };
  };
  setTimeout(reveal, 2200);
};

// ============================== TEAM ROCKET ==============================
// Cinematic appearance, styled like a gym loading screen. Plays ~1.8s then
// calls onReady (the caller starts the battle or runs the theft). Holds
// GameState.busy so the player can't roll mid-cinematic.
GameUI.showTeamRocketIntro = function (mode, onReady) {
  const modal = GameUI.el('teamRocketModal');
  if (!modal) { if (onReady) onReady(); return; }
  GameUI._unspectate('teamRocketModal');
  GameUI.el('teamRocketSubtitle').textContent = mode === 'battle' ? '…wants to battle!' : '…is after your items!';
  GameUI.el('teamRocketActions').hidden = true;
  const card = modal.querySelector('.team-rocket-card');
  if (card) { card.classList.remove('tr-animate'); void card.offsetWidth; card.classList.add('tr-animate'); }
  modal.hidden = false;
  GameState.busy = true;
  if (GameAudio.sfx && GameAudio.sfx.gymStart) GameAudio.sfx.gymStart();
  if (GameUI._trTimer) clearTimeout(GameUI._trTimer);
  GameUI._trTimer = setTimeout(() => {
    GameState.busy = false;
    if (onReady) onReady();
  }, 1800);
};

GameUI.hideTeamRocket = function () {
  const m = GameUI.el('teamRocketModal');
  if (m) m.hidden = true;
};

// Theft result view — reuses the Team Rocket modal, adds a Continue button.
GameUI.showTeamRocketResult = function (message, didSteal, onDone) {
  const modal = GameUI.el('teamRocketModal');
  if (!modal) { if (onDone) onDone(); return; }
  modal.hidden = false;
  GameUI.el('teamRocketSubtitle').textContent = message;
  GameUI.el('teamRocketActions').hidden = false;
  if (GameAudio.sfx) {
    const cue = didSteal ? GameAudio.sfx.gameOver : GameAudio.sfx.item;
    if (cue) cue();
  }
  GameUI.el('teamRocketContinueBtn').onclick = () => {
    modal.hidden = true;
    if (onDone) onDone();
  };
};

// ============================== HALL OF FAME ==============================
// Leaderboard ranked by hofScore (team stats × speed bonus). `highlightEntry`
// (the run just completed) is scrolled to + outlined.
GameUI.showHallOfFame = function (highlightEntry) {
  GameState.loadHallOfFame();
  const modal = GameUI.el('hofModal');
  modal.hidden = false;
  const list = GameUI.el('hofList');
  list.innerHTML = '';
  if (GameState.hallOfFame.length === 0) {
    list.innerHTML = `<div class="hint">No champions yet. Beat Giovanni to enter the Hall.</div>`;
    GameUI.el('hofCloseBtn').onclick = () => { modal.hidden = true; };
    return;
  }
  // Rank by score (best first), keeping each entry's original index for the
  // detail lookup (showHallOfFameDetail reads GameState.hallOfFame[idx]).
  const ranked = GameState.hallOfFame
    .map((entry, origIdx) => ({ entry, origIdx, score: GameState.hofScore(entry) }))
    .sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  // loadHallOfFame() re-parsed localStorage into fresh objects, so match the
  // "this run" highlight by a stable key (date + name + turns), not reference.
  const sameRun = (a, b) => !!a && !!b && a.date === b.date && a.name === b.name && a.turns === b.turns;
  let highlightEl = null;
  ranked.forEach((item, rankIdx) => {
    const entry = item.entry;
    const entryIdx = item.origIdx;
    const rank = rankIdx + 1;
    const isMine = sameRun(entry, highlightEntry);
    const div = document.createElement('div');
    div.className = 'hof-entry' + (isMine ? ' hof-you' : '') + (rank === 1 ? ' hof-champ' : '');
    if (isMine) highlightEl = div;
    const date = new Date(entry.date).toLocaleDateString();
    const trainerImg = entry.trainerSprite
      ? `<img class="hof-trainer-sprite" src="sprites/trainers/${entry.trainerSprite}.png" alt="${entry.name}" onerror="this.style.display='none'" />`
      : '';
    const stats = GameState.hofTeamStats(entry);
    const mul = GameState.hofTurnMultiplier(entry.turns);
    const itemTotal = Object.values(entry.itemsUsed || {}).reduce((s, n) => s + n, 0);
    const ballTotal = Object.values(entry.ballsUsed || {}).reduce((s, n) => s + n, 0);
    const ribbonBits = [];
    if (entry.turns) ribbonBits.push(`<span>${entry.turns} turns · ${mul.toFixed(2)}× speed</span>`);
    ribbonBits.push(`<span>${stats.toLocaleString()} team stats</span>`);
    if (itemTotal) ribbonBits.push(`<span>${itemTotal} items used</span>`);
    if (ballTotal) ribbonBits.push(`<span>${ballTotal} balls thrown</span>`);
    if (entry.bestCatchStreak) ribbonBits.push(`<span>🔥 best streak ×${entry.bestCatchStreak}</span>`);
    const ribbon = `<div class="hof-ribbon">${ribbonBits.join(' · ')}</div>`;
    div.innerHTML = `
      <div class="hof-entry-head">
        <div class="hof-rank">${medals[rankIdx] || '#' + rank}</div>
        ${trainerImg}
        <div class="hof-headinfo">
          <h3 style="color:${entry.color};">${entry.name}${isMine ? ' <span class="hof-you-tag">YOU</span>' : ''}</h3>
          <div class="hof-date">Champion on ${date}</div>
        </div>
        <div class="hof-score-badge"><span class="hof-score-num">${item.score.toLocaleString()}</span><span class="hof-score-lbl">score</span></div>
      </div>
      ${ribbon}
      <div class="hof-team"></div>
    `;
    const teamRow = div.querySelector('.hof-team');
    entry.party.forEach((m, monIdx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hof-mon-btn' + (m.isShiny ? ' shiny' : '');
      card.title = `${m.isShiny ? '✨ ' : ''}${m.name} — click for stats`;
      card.innerHTML = `<img src="${GameData.spriteFront(m.speciesId)}" onerror="this.onerror=null;this.src='${GameData.spriteStatic(m.speciesId)}'" alt="${m.name}" />`;
      card.onclick = () => GameUI.showHallOfFameDetail(entryIdx, monIdx);
      teamRow.appendChild(card);
    });
    list.appendChild(div);
  });
  GameUI.el('hofCloseBtn').onclick = () => { modal.hidden = true; };
  // Scroll the player's own run into view.
  if (highlightEl) setTimeout(() => { try { highlightEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }, 60);
};

// Detail view: a single champion's Pokemon + the trainer's item usage during
// the championship run. Opens on top of the HoF list.
GameUI.showHallOfFameDetail = function (entryIdx, monIdx) {
  const entry = GameState.hallOfFame[entryIdx];
  if (!entry) return;
  const mon = entry.party[monIdx];
  if (!mon) return;
  let modal = document.getElementById('hofDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hofDetailModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-card hof-detail-card">
        <div id="hofDetailBody"></div>
        <div style="text-align:right;margin-top:12px;">
          <button id="hofDetailClose" class="primary-btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  // Build mon block
  const types = (mon.types || []).map(t => GameUI.typePill(t)).join('');
  const moves = (mon.moves || []).map(mv => {
    const maxPp = mv.maxPp != null ? mv.maxPp : (mv.gated ? 3 : 20);
    return `
      <div class="hof-move">
        <div class="hof-move-name">${mv.name}${mv.gated ? ' <span class="badge" style="font-size:9px;background:var(--pop);color:var(--bg);padding:1px 4px;border-radius:4px;">STRONG</span>' : ''}</div>
        <div class="hof-move-sub">${mv.type} type · Power ${mv.power} · PP ${maxPp}</div>
      </div>
    `;
  }).join('');
  // Build item-usage tally — sorted by count desc, link names through GameData
  const itemRows = Object.entries(entry.itemsUsed || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const it = GameData.getItem(id);
      const name = it ? it.name : id;
      const desc = it ? it.description : '';
      return `
        <li>
          <img src="${GameData.spriteItem(id)}" onerror="this.style.display='none'" alt="" />
          <span class="hof-use-name">${name}</span>
          <span class="hof-use-count">×${n}</span>
          <span class="hof-use-desc">${desc}</span>
        </li>
      `;
    }).join('');
  const ballRows = Object.entries(entry.ballsUsed || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const ball = GameData.getPokeball(id);
      const name = ball ? ball.name : id;
      return `
        <li>
          <img src="${GameData.spriteBall(id)}" onerror="this.style.display='none'" alt="" />
          <span class="hof-use-name">${name}</span>
          <span class="hof-use-count">×${n}</span>
        </li>
      `;
    }).join('');
  const badgeChips = (entry.badges || []).map(b => `<span class="hof-badge-chip">🏅 ${b}</span>`).join('');
  const headlineStats = [];
  if (mon.boostCount && mon.boostCount > 0) headlineStats.push(`<span class="hof-mon-flag">+25% Rare Candy boost</span>`);
  if (mon.isShiny) headlineStats.push(`<span class="hof-mon-flag shiny-flag">✨ Shiny</span>`);
  document.getElementById('hofDetailBody').innerHTML = `
    <div class="hof-detail-head">
      <img class="hof-detail-sprite${mon.isShiny ? ' shiny' : ''}" src="${GameData.spriteFront(mon.speciesId)}" onerror="this.onerror=null;this.src='${GameData.spriteStatic(mon.speciesId)}'" alt="${mon.name}" />
      <div>
        <h2 style="margin:0;color:${entry.color};">${mon.isShiny ? '✨ ' : ''}${mon.name}</h2>
        <div class="hint">${entry.name}'s champion team</div>
        <div style="margin-top:6px;">${types}</div>
        <div style="margin-top:4px;font-size:13px;">HP <strong>${mon.maxHp}</strong></div>
        <div class="hof-mon-flags">${headlineStats.join('')}</div>
      </div>
    </div>
    <div class="hof-detail-section">
      <h3>Moves</h3>
      ${moves}
    </div>
    <div class="hof-detail-section">
      <h3>${entry.name}'s career report</h3>
      ${badgeChips ? `<div class="hof-badge-row">${badgeChips}</div>` : ''}
      <div class="hof-use-cols">
        <div>
          <h4>Items used (${Object.values(entry.itemsUsed || {}).reduce((s,n)=>s+n,0)})</h4>
          <ul class="hof-use-list">${itemRows || '<li class="hint">No items used.</li>'}</ul>
        </div>
        <div>
          <h4>Pokeballs thrown (${Object.values(entry.ballsUsed || {}).reduce((s,n)=>s+n,0)})</h4>
          <ul class="hof-use-list">${ballRows || '<li class="hint">No balls used.</li>'}</ul>
        </div>
      </div>
    </div>
  `;
  modal.hidden = false;
  document.getElementById('hofDetailClose').onclick = () => { modal.hidden = true; };
};

// ============================== CHAMPION ARENA ==============================
// Battle saved Hall of Fame teams. You pick one champion as YOUR team and
// fight another (CPU-controlled, difficulty scaled by its score). A global +
// per-opponent win/loss record is kept.
GameUI._arenaYourKey = null;
GameUI.showArena = function (resultMsg) {
  GameState.loadHallOfFame();
  GameState.loadArena();
  const modal = GameUI.el('arenaModal');
  if (!modal) return;
  GameUI._unspectate('arenaModal');
  modal.hidden = false;
  const champs = GameState.hallOfFame || [];
  // Default YOUR team to the highest-scoring champion.
  if (!GameUI._arenaYourKey || !champs.some(e => GameState.arenaKey(e) === GameUI._arenaYourKey)) {
    const best = champs.slice().sort((a, b) => GameState.hofScore(b) - GameState.hofScore(a))[0];
    GameUI._arenaYourKey = best ? GameState.arenaKey(best) : null;
  }
  GameUI.el('arenaRecord').textContent = `Overall record: ${GameState.arena.wins}W – ${GameState.arena.losses}L`;
  const resultEl = GameUI.el('arenaResult');
  resultEl.innerHTML = resultMsg || '';
  resultEl.hidden = !resultMsg;
  const list = GameUI.el('arenaList');
  list.innerHTML = '';
  if (champs.length < 2) {
    list.innerHTML = `<div class="hint">You need at least 2 Hall of Fame champions to hold a match. Beat Giovanni a few more times!</div>`;
  } else {
    const ranked = champs.map((e) => ({ e, score: GameState.hofScore(e) })).sort((a, b) => b.score - a.score);
    const medals = ['🥇', '🥈', '🥉'];
    ranked.forEach(({ e }, rankIdx) => {
      const key = GameState.arenaKey(e);
      const isYours = key === GameUI._arenaYourKey;
      const skill = GameState.arenaSkill(e);
      const vs = GameState.arena.vs[key] || { wins: 0, losses: 0 };
      const sprites = (e.party || []).map(m => `<img src="${GameData.spriteStatic(m.speciesId)}" title="${m.name}" alt="" />`).join('');
      const vsTxt = (vs.wins || vs.losses) ? ` · you ${vs.wins}W-${vs.losses}L` : '';
      const div = document.createElement('div');
      div.className = 'arena-entry' + (isYours ? ' arena-yours' : '');
      div.innerHTML = `
        <div class="arena-entry-head">
          <div class="hof-rank">${medals[rankIdx] || '#' + (rankIdx + 1)}</div>
          <div class="arena-info">
            <div class="arena-name" style="color:${e.color || '#fff'}">${e.name}${isYours ? ' <span class="hof-you-tag">YOUR TEAM</span>' : ''}</div>
            <div class="hint">${e.turns} turns · score ${GameState.hofScore(e).toLocaleString()} · AI: <strong>${skill.tier}</strong>${vsTxt}</div>
          </div>
          ${isYours ? '<span class="arena-pick-hint">your team</span>' : `<button class="arena-fight-btn" type="button">⚔️ Fight</button>`}
        </div>
        <div class="arena-team">${sprites}</div>
      `;
      if (!isYours) {
        const setMine = () => { GameUI._arenaYourKey = key; GameUI.showArena(); };
        div.querySelector('.arena-info').onclick = setMine;
        div.querySelector('.arena-team').onclick = setMine;
        div.querySelector('.arena-fight-btn').onclick = (ev) => {
          ev.stopPropagation();
          const yourEntry = champs.find(c => GameState.arenaKey(c) === GameUI._arenaYourKey);
          if (yourEntry) GameUI.startArenaBattle(yourEntry, e);
        };
      }
      list.appendChild(div);
    });
    const tip = document.createElement('div');
    tip.className = 'hint';
    tip.style.cssText = 'margin-top:8px;text-align:center;';
    tip.textContent = 'Tap a champion to make it YOUR team, or hit ⚔️ Fight to battle it.';
    list.appendChild(tip);
  }
  GameUI.el('arenaCloseBtn').onclick = () => { modal.hidden = true; };
};

GameUI.startArenaBattle = function (yourEntry, oppEntry) {
  // Build two temp "players" and run a battle. There's no live game on the home
  // screen, so save/restore GameState.players around the match.
  const mkPlayer = (entry, idx, isCpu) => ({
    id: 'arena-' + idx, idx, name: entry.name, color: entry.color || (isCpu ? '#a855f7' : '#3b82f6'),
    isCpu, party: GameState.arenaTeamFromEntry(entry),
    items: {}, balls: {}, flags: {}, badges: [], eggs: [], money: 0, tile: 0, completed: false,
  });
  const you = mkPlayer(yourEntry, 0, false);
  const opp = mkPlayer(oppEntry, 1, true);
  GameUI._preArena = { players: GameState.players, active: GameState.activePlayerIdx, busy: GameState.busy, pending: GameState.pendingTileResolution };
  GameState.players = [you, opp];
  GameState.activePlayerIdx = 0;
  GameState.busy = false;
  GameState.pendingTileResolution = false;
  const skill = GameState.arenaSkill(oppEntry);
  const oppTeam = opp.party.map(m => ({
    speciesId: m.speciesId, name: m.name, types: m.types.slice(),
    moves: GameState.cloneMoves(m.moves), hp: m.maxHp, maxHp: m.maxHp, fainted: false,
  }));
  GameUI.el('arenaModal').hidden = true;
  GameBattle.start({
    kind: 'arena',
    oppTeam,
    opponentLabel: '🏆 ' + oppEntry.name,
    opponentColor: opp.color,
    arenaSkill: skill,
    onWin: () => GameUI._endArena(oppEntry, true),
    onLose: () => GameUI._endArena(oppEntry, false),
  });
};

GameUI._endArena = function (oppEntry, won) {
  GameState.recordArenaResult(oppEntry, won);
  // Restore whatever (if anything) was running before the match.
  const pre = GameUI._preArena || { players: [], active: 0 };
  GameState.players = pre.players || [];
  GameState.activePlayerIdx = pre.active || 0;
  GameState.busy = false;
  GameState.pendingTileResolution = false;
  GameUI._preArena = null;
  const msg = won
    ? `<span class="win">🏆 You defeated <strong>${oppEntry.name}</strong>!</span>`
    : `<span class="lose">💥 <strong>${oppEntry.name}</strong> defeated you. Try a different team!</span>`;
  setTimeout(() => GameUI.showArena(msg), 400);
};
