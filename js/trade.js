// =============================================================
// trade.js  ·  trading flow between players
//
// Trade modes:
//   - Pokemon-for-Pokemon (classic swap)
//   - Pokemon-for-Items (target offers a bundle of items + balls, any qty)
//
// Anti-spam: every trade goes through a 3-second confirm modal where the
// confirm button is locked for the full countdown. After 3s the button is
// enabled and the user must explicitly press it. Either side can cancel.
// =============================================================
window.GameTrade = {};

GameTrade.state = {
  from: null,
  target: null,
  fromMon: null,
  targetMon: null,
  // targetBundle: { items: { itemId: qty }, balls: { ballId: qty } }
  targetBundle: { items: {}, balls: {} },
  offerMode: 'pokemon', // 'pokemon' | 'items'
  forced: false,
  onDone: null,
};

GameTrade.start = function (onDone) {
  const from = GameState.currentPlayer();
  GameTrade.state = {
    from, target: null, fromMon: null, targetMon: null,
    targetBundle: { items: {}, balls: {} },
    offerMode: 'pokemon', forced: false, onDone,
  };
  const modal = GameUI.el('tradeModal');
  modal.hidden = false;
  GameUI.el('tradeFromName').textContent = `${from.name} offers...`;

  GameTrade.renderPartyGrid('tradeFromParty', from, mon => {
    GameTrade.state.fromMon = mon;
    GameTrade._reflectChoices();
  });

  GameUI.el('tradeOfferTabs').hidden = true;
  GameUI.el('tradeTargetItems').hidden = true;
  GameUI.el('tradeTargetItems').innerHTML = '';
  GameUI.el('tradeTargetParty').innerHTML = '';

  const trainerSelect = GameUI.el('tradeTargetSelect');
  trainerSelect.innerHTML = '';
  GameState.players.forEach(p => {
    if (p === from) return;
    const btn = document.createElement('button');
    btn.className = 'player-chip';
    btn.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.name}`;
    btn.onclick = () => {
      trainerSelect.querySelectorAll('.player-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      GameTrade.state.target = p;
      GameTrade.state.targetMon = null;
      GameTrade.state.targetBundle = { items: {}, balls: {} };
      GameTrade.state.offerMode = 'pokemon';
      GameUI.el('tradeTargetHint').textContent = `${p.name} offers...`;
      GameUI.el('tradeOfferTabs').hidden = false;
      GameTrade._setOfferMode('pokemon');
      GameTrade._reflectChoices();
    };
    trainerSelect.appendChild(btn);
  });

  document.querySelectorAll('#tradeOfferTabs .trade-tab').forEach(tab => {
    tab.onclick = () => GameTrade._setOfferMode(tab.dataset.offer);
  });

  GameUI.el('tradeCancelBtn').onclick = () => {
    modal.hidden = true;
    if (onDone) onDone(false);
  };

  GameUI.el('tradeForceBtn').onclick = () => {
    if (!GameTrade.state.target) {
      alert('Pick a trainer to force the trade with.');
      return;
    }
    const t = GameTrade.state.target;
    if (t.party.length === 0) {
      alert(`${t.name} has no Pokemon to give up.`);
      return;
    }
    const forcedMon = t.party[Math.floor(Math.random() * t.party.length)];
    GameTrade.state.targetMon = forcedMon;
    GameTrade.state.targetBundle = { items: {}, balls: {} };
    GameTrade.state.offerMode = 'pokemon';
    GameTrade.state.forced = true;
    GameTrade._setOfferMode('pokemon');
    GameUI.log(`<span class="actor">${from.name}</span> forced a trade with ${t.name}. ${t.name} gives up <strong>${forcedMon.name}</strong> face down.`);
    GameTrade._reflectChoices();
  };

  GameUI.el('tradeConfirmBtn').onclick = () => {
    const s = GameTrade.state;
    if (!s.fromMon || !s.target) return;
    const okTargetSide = s.offerMode === 'pokemon'
      ? !!s.targetMon
      : GameTrade._bundleHasItems(s.targetBundle);
    if (!okTargetSide) return;
    // Trainers must keep at least one Pokemon. Item trades remove a Pokemon
    // without replacement — block if that would empty the party.
    if (s.offerMode === 'items' && s.from.party.length <= 1) {
      alert('You must keep at least 1 Pokemon. Trade a Pokemon-for-Pokemon instead.');
      return;
    }
    GameTrade._openCountdown();
  };
};

GameTrade._bundleHasItems = function (bundle) {
  const has = (obj) => Object.values(obj || {}).some(n => n > 0);
  return has(bundle.items) || has(bundle.balls);
};

GameTrade._bundleSummary = function (bundle) {
  const parts = [];
  Object.entries(bundle.items || {}).forEach(([id, qty]) => {
    if (qty > 0) {
      const it = GameData.getItem(id);
      if (it) parts.push(`${qty}× ${it.name}`);
    }
  });
  Object.entries(bundle.balls || {}).forEach(([id, qty]) => {
    if (qty > 0) {
      const b = GameData.getPokeball(id);
      if (b) parts.push(`${qty}× ${b.name}`);
    }
  });
  return parts;
};

GameTrade._setOfferMode = function (mode) {
  GameTrade.state.offerMode = mode;
  document.querySelectorAll('#tradeOfferTabs .trade-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.offer === mode);
  });
  const partyEl = GameUI.el('tradeTargetParty');
  const itemsEl = GameUI.el('tradeTargetItems');
  if (mode === 'pokemon') {
    partyEl.hidden = false;
    itemsEl.hidden = true;
    GameTrade.state.targetBundle = { items: {}, balls: {} };
    GameTrade.renderPartyGrid('tradeTargetParty', GameTrade.state.target, mon => {
      GameTrade.state.targetMon = mon;
      GameTrade._reflectChoices();
    });
  } else {
    partyEl.hidden = true;
    itemsEl.hidden = false;
    GameTrade.state.targetMon = null;
    GameTrade._renderItemsGrid('tradeTargetItems', GameTrade.state.target);
  }
  GameTrade._reflectChoices();
};

// Each card has +/- qty controls. State writes go straight into targetBundle.
GameTrade._renderItemsGrid = function (containerId, player) {
  const grid = GameUI.el(containerId);
  grid.innerHTML = '';
  const itemEntries = Object.entries(player.items || {}).filter(([,n]) => n > 0);
  const ballEntries = Object.entries(player.balls || {}).filter(([,n]) => n > 0);
  if (itemEntries.length === 0 && ballEntries.length === 0) {
    grid.innerHTML = `<div class="hint">${player.name} has no items or balls to trade.</div>`;
    return;
  }
  const renderQty = (card, kind, id) => {
    const qtyEl = card.querySelector('.trade-qty-val');
    const bundle = GameTrade.state.targetBundle[kind === 'ball' ? 'balls' : 'items'];
    const qty = bundle[id] || 0;
    qtyEl.textContent = qty;
    card.classList.toggle('selected', qty > 0);
  };
  const makeCard = (id, count, kind, displayName, spritePath) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.tradeKey = kind + ':' + id;
    card.innerHTML = `
      <img class="item-card-sprite" src="${spritePath}" onerror="this.style.display='none'" alt="" />
      <h4>${displayName}</h4>
      <p class="hint">×${count} available</p>
      <div class="trade-qty">
        <button type="button" class="trade-qty-btn" data-delta="-1">−</button>
        <span class="trade-qty-val">0</span>
        <button type="button" class="trade-qty-btn" data-delta="+1">+</button>
      </div>
    `;
    const bucketKey = kind === 'ball' ? 'balls' : 'items';
    const adjust = (delta) => {
      const bundle = GameTrade.state.targetBundle[bucketKey];
      const cur = bundle[id] || 0;
      const next = Math.max(0, Math.min(count, cur + delta));
      if (next === cur) return;
      if (next === 0) delete bundle[id]; else bundle[id] = next;
      renderQty(card, kind, id);
      GameTrade._reflectChoices();
    };
    card.querySelector('[data-delta="-1"]').onclick = (e) => { e.stopPropagation(); adjust(-1); };
    card.querySelector('[data-delta="+1"]').onclick = (e) => { e.stopPropagation(); adjust(+1); };
    // Click anywhere else on the card = +1 (cycles back to 0 when at max)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.trade-qty-btn')) return;
      const bundle = GameTrade.state.targetBundle[bucketKey];
      const cur = bundle[id] || 0;
      if (cur >= count) {
        delete bundle[id];
        renderQty(card, kind, id);
        GameTrade._reflectChoices();
      } else {
        adjust(+1);
      }
    });
    grid.appendChild(card);
    renderQty(card, kind, id);
  };
  itemEntries.forEach(([id, count]) => {
    const it = GameData.getItem(id);
    if (it) makeCard(id, count, 'item', it.name, GameData.spriteItem(id));
  });
  ballEntries.forEach(([id, count]) => {
    const b = GameData.getPokeball(id);
    if (b) makeCard(id, count, 'ball', b.name, GameData.spriteBall(id));
  });
};

GameTrade.renderPartyGrid = function (containerId, player, onPick) {
  const grid = GameUI.el(containerId);
  grid.innerHTML = '';
  if (player.party.length === 0) {
    grid.innerHTML = '<div class="hint">No Pokemon</div>';
    return;
  }
  player.party.forEach(mon => {
    const card = document.createElement('div');
    card.className = 'party-card';
    card.innerHTML = `
      <img src="${GameData.spriteStatic(mon.speciesId)}" />
      <div class="pc-name">${mon.name}</div>
    `;
    card.onclick = () => {
      grid.querySelectorAll('.party-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      onPick(mon);
    };
    grid.appendChild(card);
  });
};

GameTrade._reflectChoices = function () {
  const s = GameTrade.state;
  const targetReady = (s.offerMode === 'pokemon')
    ? !!s.targetMon
    : GameTrade._bundleHasItems(s.targetBundle);
  GameUI.el('tradeConfirmBtn').disabled = !(s.fromMon && s.target && targetReady);
};

// =========== 3-second countdown confirm (no auto-confirm) ===========
GameTrade._openCountdown = function () {
  const s = GameTrade.state;
  const modal = GameUI.el('tradeConfirmModal');
  const goBtn = GameUI.el('tradeConfirmGoBtn');
  const cancelBtn = GameUI.el('tradeConfirmCancelBtn');
  const fromSide = GameUI.el('tradeConfirmFromSide');
  const targetSide = GameUI.el('tradeConfirmTargetSide');
  fromSide.innerHTML = `
    <div class="hint">${s.from.name} gives</div>
    <img src="${GameData.spriteStatic(s.fromMon.speciesId)}" alt="${s.fromMon.name}" style="width:96px;height:96px;image-rendering:pixelated;" />
    <div class="trade-confirm-name">${s.fromMon.name}</div>
  `;
  if (s.offerMode === 'pokemon') {
    targetSide.innerHTML = `
      <div class="hint">${s.target.name} gives</div>
      <img src="${GameData.spriteStatic(s.targetMon.speciesId)}" alt="${s.targetMon.name}" style="width:96px;height:96px;image-rendering:pixelated;" />
      <div class="trade-confirm-name">${s.targetMon.name}${s.forced ? ' <span class="hint">(forced)</span>' : ''}</div>
    `;
    GameUI.el('tradeConfirmSummary').textContent =
      `${s.from.name} ↔ ${s.target.name}: ${s.fromMon.name} for ${s.targetMon.name}.`;
  } else {
    const parts = GameTrade._bundleSummary(s.targetBundle);
    const iconsHtml = [
      ...Object.entries(s.targetBundle.items || {}).map(([id, qty]) =>
        qty > 0 ? `<div class="trade-bundle-tile"><img src="${GameData.spriteItem(id)}" onerror="this.style.display='none'" alt="" /><span>×${qty}</span></div>` : ''),
      ...Object.entries(s.targetBundle.balls || {}).map(([id, qty]) =>
        qty > 0 ? `<div class="trade-bundle-tile"><img src="${GameData.spriteBall(id)}" onerror="this.style.display='none'" alt="" /><span>×${qty}</span></div>` : ''),
    ].join('');
    targetSide.innerHTML = `
      <div class="hint">${s.target.name} gives</div>
      <div class="trade-bundle-grid">${iconsHtml}</div>
      <div class="trade-confirm-name">${parts.join(' · ')}</div>
    `;
    GameUI.el('tradeConfirmSummary').textContent =
      `${s.from.name} ↔ ${s.target.name}: ${s.fromMon.name} for ${parts.join(', ')}.`;
  }

  modal.hidden = false;
  let secs = 3;
  goBtn.disabled = true;
  goBtn.textContent = `Confirming in ${secs}s`;
  if (GameTrade._tickHandle) clearInterval(GameTrade._tickHandle);
  GameTrade._tickHandle = setInterval(() => {
    secs--;
    if (secs > 0) {
      goBtn.textContent = `Confirming in ${secs}s`;
    } else {
      clearInterval(GameTrade._tickHandle);
      GameTrade._tickHandle = null;
      // Button becomes pressable. User must click to confirm — no auto-confirm.
      goBtn.disabled = false;
      goBtn.textContent = 'Confirm now';
    }
  }, 1000);

  goBtn.onclick = () => {
    if (goBtn.disabled) return;
    GameTrade._closeCountdownAndConfirm();
  };
  cancelBtn.onclick = () => GameTrade._cancelCountdown(true);
};

GameTrade._cancelCountdown = function (logIt) {
  if (GameTrade._tickHandle) { clearInterval(GameTrade._tickHandle); GameTrade._tickHandle = null; }
  GameUI.el('tradeConfirmModal').hidden = true;
  if (logIt) GameUI.log('Trade cancelled during the 3-second hold.', 'system');
};

GameTrade._closeCountdownAndConfirm = function () {
  if (GameTrade._tickHandle) { clearInterval(GameTrade._tickHandle); GameTrade._tickHandle = null; }
  GameUI.el('tradeConfirmModal').hidden = true;
  GameTrade.confirm();
};

GameTrade.confirm = function () {
  const s = GameTrade.state;
  const fromIdx = s.from.party.findIndex(m => m.instanceId === s.fromMon.instanceId);
  if (fromIdx < 0) return;
  // Defensive: item trades must leave the source with at least 1 Pokemon.
  if (s.offerMode === 'items' && s.from.party.length <= 1) {
    GameUI.log(`Trade aborted — ${s.from.name} must keep at least 1 Pokemon.`, 'system');
    GameUI.el('tradeModal').hidden = true;
    if (s.onDone) s.onDone(false);
    return;
  }
  const givenMon = s.from.party[fromIdx];
  if (s.offerMode === 'pokemon') {
    const targetIdx = s.target.party.findIndex(m => m.instanceId === s.targetMon.instanceId);
    if (targetIdx < 0) return;
    const receivedMon = s.target.party[targetIdx];
    s.from.party[fromIdx] = receivedMon;
    s.target.party[targetIdx] = givenMon;
    GameUI.log(`<span class="actor">${s.from.name}</span> traded <strong>${givenMon.name}</strong> for <strong>${receivedMon.name}</strong> with ${s.target.name}.`, 'crit');
  } else {
    // Validate the bundle is still satisfiable (counts may have changed).
    const bundle = s.targetBundle;
    for (const [id, qty] of Object.entries(bundle.items || {})) {
      if ((s.target.items[id] || 0) < qty) {
        GameUI.log(`${s.target.name} no longer has ${qty}× ${GameData.getItem(id)?.name || id} — trade aborted.`, 'system');
        GameUI.el('tradeModal').hidden = true;
        if (s.onDone) s.onDone(false);
        return;
      }
    }
    for (const [id, qty] of Object.entries(bundle.balls || {})) {
      if ((s.target.balls[id] || 0) < qty) {
        GameUI.log(`${s.target.name} no longer has ${qty}× ${GameData.getPokeball(id)?.name || id} — trade aborted.`, 'system');
        GameUI.el('tradeModal').hidden = true;
        if (s.onDone) s.onDone(false);
        return;
      }
    }
    // Transfer all bundled items + balls.
    Object.entries(bundle.items || {}).forEach(([id, qty]) => {
      for (let i = 0; i < qty; i++) {
        GameState.consumeItem(s.target, id);
        GameState.giveItem(s.from, id);
      }
    });
    Object.entries(bundle.balls || {}).forEach(([id, qty]) => {
      for (let i = 0; i < qty; i++) {
        GameState.consumeBall(s.target, id);
        GameState.giveBall(s.from, id);
      }
    });
    // Source gives up the Pokemon to the target.
    s.from.party.splice(fromIdx, 1);
    if (s.target.party.length < 6) s.target.party.push(givenMon);
    else GameUI.log(`${s.target.name}'s party was full — released ${givenMon.name}.`, 'system');
    const summary = GameTrade._bundleSummary(bundle).join(' + ');
    GameUI.log(`<span class="actor">${s.from.name}</span> traded <strong>${givenMon.name}</strong> for ${summary} with ${s.target.name}.`, 'crit');
  }
  GameUI.el('tradeModal').hidden = true;
  GameUI.refreshAll();
  if (s.onDone) s.onDone(true);
};
