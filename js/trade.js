// =============================================================
// trade.js  ·  trading flow between players
//
// Trade modes:
//   - Pokemon-for-Pokemon (classic swap)
//   - Pokemon-for-Items (target offers a bundle of items + balls, any qty)
//
// Two-step confirm: the initiator (active player) builds the proposal and
// hits Confirm — that just SENDS the proposal. The recipient (target) sees
// a prompt with Accept / Decline and must explicitly agree before the
// transfer executes. Either side can decline / cancel, in which case the
// trade fails and the active player's turn proceeds normally. CPU
// recipients auto-accept after a short delay.
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

// In-flight trade proposal (one global at a time — only the active player
// can initiate, and we only allow one trade per tile resolution).
GameTrade._pendingProposal = null;

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
    GameTrade._proposeTradeToTarget();
  };
};

GameTrade._bundleHasItems = function (bundle) {
  if (!bundle) return false;
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

// =========== Two-player proposal / accept flow ===========

// Whether the player at idx is "owned" by THIS device — i.e., we drive
// their UI. In single-device mode every slot is local. In MP, only our
// claimed slot (plus host-driven CPUs) is local.
GameTrade._isPlayerLocal = function (idx) {
  if (!window.GameMP || !GameMP.enabled) return true;
  const player = GameState.players[idx];
  if (!player) return false;
  if (GameMP.localSlot === idx) return true;
  if (player.isCpu && GameMP.isHost) return true;
  return false;
};

GameTrade._proposeTradeToTarget = function () {
  const s = GameTrade.state;
  // Build a network-safe proposal payload. References are stable IDs so
  // both sides re-resolve against the live GameState at execute time.
  const proposal = {
    fromIdx: GameState.players.indexOf(s.from),
    targetIdx: GameState.players.indexOf(s.target),
    fromMonInstanceId: s.fromMon.instanceId,
    // Human-built proposals always give a Pokemon from the initiator, so the
    // from-side bundle stays empty. CPU offers (below) may populate it.
    fromBundle: null,
    targetMonInstanceId: s.targetMon ? s.targetMon.instanceId : null,
    targetBundle: JSON.parse(JSON.stringify(s.targetBundle || { items: {}, balls: {} })),
    offerMode: s.offerMode,
    forced: !!s.forced,
  };
  GameTrade._pendingProposal = proposal;
  // Hide the trade-builder modal so the focus shifts to the confirm modal.
  GameUI.el('tradeModal').hidden = true;
  GameTrade._showInitiatorWaiting(proposal);
  // Send the proposal across the wire so the target's device can render
  // their accept prompt.
  if (window.GameMP && GameMP.enabled) {
    GameMP.send({ type: 'trade-proposal', proposal, ts: Date.now() });
  }
  // If the target is local (single-device, or host-driven CPU), also pop
  // the recipient prompt here. Slight delay so the initiator's "waiting"
  // UI paints first — clarifies whose action is needed next.
  if (GameTrade._isPlayerLocal(proposal.targetIdx)) {
    setTimeout(() => GameTrade._receiveProposal(proposal), 80);
  }
};

// Icon grid HTML for an item/ball bundle (shared by both trade sides).
GameTrade._bundleTilesHtml = function (bundle) {
  return [
    ...Object.entries((bundle && bundle.items) || {}).map(([id, qty]) =>
      qty > 0 ? `<div class="trade-bundle-tile"><img src="${GameData.spriteItem(id)}" onerror="this.style.display='none'" alt="" /><span>×${qty}</span></div>` : ''),
    ...Object.entries((bundle && bundle.balls) || {}).map(([id, qty]) =>
      qty > 0 ? `<div class="trade-bundle-tile"><img src="${GameData.spriteBall(id)}" onerror="this.style.display='none'" alt="" /><span>×${qty}</span></div>` : ''),
  ].join('');
};

// Render one trade side — a Pokemon or an item/ball bundle.
GameTrade._sideHtml = function (player, label, spec) {
  if (spec.bundle && GameTrade._bundleHasItems(spec.bundle)) {
    return `
      <div class="hint">${player.name} ${label}</div>
      <div class="trade-bundle-grid">${GameTrade._bundleTilesHtml(spec.bundle)}</div>
      <div class="trade-confirm-name">${GameTrade._bundleSummary(spec.bundle).join(' · ')}</div>
    `;
  }
  const mon = spec.monInstanceId ? player.party.find(m => m.instanceId === spec.monInstanceId) : null;
  return mon ? `
    <div class="hint">${player.name} ${label}</div>
    <img src="${GameData.spriteStatic(mon.speciesId)}" alt="${mon.name}" style="width:96px;height:96px;image-rendering:pixelated;" />
    <div class="trade-confirm-name">${mon.name}${spec.forced ? ' <span class="hint">(forced pick)</span>' : ''}</div>
  ` : `<div class="hint">${player.name}'s offered ${spec.bundle ? 'items are' : 'Pokemon is'} no longer available.</div>`;
};

GameTrade._renderConfirmSides = function (proposal) {
  const from = GameState.players[proposal.fromIdx];
  const target = GameState.players[proposal.targetIdx];
  if (!from || !target) return;
  GameUI.el('tradeConfirmFromSide').innerHTML = GameTrade._sideHtml(from, 'gives', {
    monInstanceId: proposal.fromMonInstanceId,
    bundle: proposal.fromBundle,
  });
  GameUI.el('tradeConfirmTargetSide').innerHTML = GameTrade._sideHtml(target, 'gives', {
    monInstanceId: proposal.targetMonInstanceId,
    bundle: proposal.offerMode === 'pokemon' ? null : proposal.targetBundle,
    forced: proposal.forced,
  });
};

GameTrade._showInitiatorWaiting = function (proposal) {
  const modal = GameUI.el('tradeConfirmModal');
  const target = GameState.players[proposal.targetIdx];
  GameTrade._renderConfirmSides(proposal);
  GameUI.el('tradeConfirmTitle').textContent = `Waiting for ${target.name}...`;
  GameUI.el('tradeConfirmSummary').textContent = `Proposal sent. ${target.name} must accept before the trade completes.`;
  GameUI.el('tradeConfirmNote').textContent = 'Tap Cancel proposal to withdraw the offer.';
  const goBtn = GameUI.el('tradeConfirmGoBtn');
  goBtn.hidden = true;
  goBtn.disabled = true;
  goBtn.onclick = null;
  const cancelBtn = GameUI.el('tradeConfirmCancelBtn');
  cancelBtn.hidden = false;
  cancelBtn.disabled = false;
  cancelBtn.textContent = 'Cancel proposal';
  cancelBtn.onclick = () => GameTrade._initiatorCancelProposal();
  modal.hidden = false;
};

GameTrade._showRecipientPrompt = function (proposal) {
  const modal = GameUI.el('tradeConfirmModal');
  const from = GameState.players[proposal.fromIdx];
  GameTrade._renderConfirmSides(proposal);
  GameUI.el('tradeConfirmTitle').textContent = `${from.name} wants to trade with you`;
  const summaryText = proposal.offerMode === 'pokemon'
    ? `${from.name} is offering ${proposal.fromMonInstanceId ? 'their Pokemon' : 'a Pokemon'} for one of yours.`
    : `${from.name} is offering their Pokemon for items from your bag.`;
  GameUI.el('tradeConfirmSummary').textContent = summaryText;
  GameUI.el('tradeConfirmNote').textContent = 'Accept to complete the swap, or Decline to refuse.';
  const goBtn = GameUI.el('tradeConfirmGoBtn');
  goBtn.hidden = false;
  goBtn.disabled = false;
  goBtn.textContent = 'Accept trade';
  goBtn.onclick = () => GameTrade._respondToProposal('accept');
  const cancelBtn = GameUI.el('tradeConfirmCancelBtn');
  cancelBtn.hidden = false;
  cancelBtn.disabled = false;
  cancelBtn.textContent = 'Decline';
  cancelBtn.onclick = () => GameTrade._respondToProposal('decline');
  modal.hidden = false;
};

// Called when this device is the recipient of an incoming proposal. The
// initiator might be us too (single-device or host-driven CPU sender —
// not currently used, since CPU never initiates trades).
GameTrade._receiveProposal = function (proposal) {
  // Ignore duplicate / outdated proposals if we already have one in flight
  // pointing at the same target.
  GameTrade._pendingProposal = proposal;
  GameTrade._showRecipientPrompt(proposal);
  const target = GameState.players[proposal.targetIdx];
  if (target && target.isCpu) {
    // CPU recipients auto-accept after a short delay so the human can see
    // what just happened. (Future hook: AI evaluation could decline.)
    setTimeout(() => {
      // Only respond if we still own the pending — it might have been
      // cancelled in the meantime.
      if (GameTrade._pendingProposal === proposal) {
        GameTrade._respondToProposal('accept');
      }
    }, 900);
  }
};

GameTrade._respondToProposal = function (response) {
  const proposal = GameTrade._pendingProposal;
  if (!proposal) return;
  // Close the recipient modal locally.
  GameUI.el('tradeConfirmModal').hidden = true;
  // Send the response back to the initiator.
  if (window.GameMP && GameMP.enabled) {
    GameMP.send({ type: 'trade-response', response, ts: Date.now() });
  }
  // If the initiator is local (single-device, or we're hosting and the
  // initiator slot is local), handle their side here too.
  const initiatorLocal = GameTrade._isPlayerLocal(proposal.fromIdx);
  if (initiatorLocal) {
    GameTrade._handleResponseAsInitiator(response, proposal);
  } else {
    // We're only the recipient. Clear pending here since the initiator
    // path won't run on this device.
    GameTrade._pendingProposal = null;
  }
};

// Initiator-side: own cancel button pressed while waiting for response.
GameTrade._initiatorCancelProposal = function () {
  const proposal = GameTrade._pendingProposal;
  if (!proposal) return;
  if (window.GameMP && GameMP.enabled) {
    GameMP.send({ type: 'trade-cancel', ts: Date.now() });
  }
  GameTrade._handleResponseAsInitiator('cancel', proposal);
};

// Handle a response from the recipient (or our own cancel). Runs on the
// initiator's device only.
GameTrade._handleResponseAsInitiator = function (response, proposal) {
  // Defensive: only act if we're still expecting THIS proposal.
  if (GameTrade._pendingProposal !== proposal) return;
  GameTrade._pendingProposal = null;
  GameUI.el('tradeConfirmModal').hidden = true;
  GameUI.el('tradeModal').hidden = true;
  const onDone = GameTrade.state && GameTrade.state.onDone;
  if (response === 'accept') {
    GameTrade._executeProposal(proposal);
    if (onDone) onDone(true);
    return;
  }
  if (response === 'decline') {
    const target = GameState.players[proposal.targetIdx];
    GameUI.log(`${target ? target.name : 'Recipient'} declined the trade.`, 'system');
  } else {
    GameUI.log('Trade proposal cancelled.', 'system');
  }
  if (onDone) onDone(false);
};

// Recipient-side: initiator withdrew before we responded. Close the prompt.
GameTrade._cancelledByInitiator = function () {
  if (!GameTrade._pendingProposal) return;
  GameTrade._pendingProposal = null;
  GameUI.el('tradeConfirmModal').hidden = true;
  GameUI.log('Trade proposal withdrawn by initiator.', 'system');
};

// Inbound message dispatcher — wired from mp.js _onMessage.
GameTrade.onNetMessage = function (msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'trade-proposal') {
    const proposal = msg.proposal;
    if (!proposal) return;
    // Only the addressed target's device should render the recipient prompt.
    if (!GameTrade._isPlayerLocal(proposal.targetIdx)) return;
    GameTrade._receiveProposal(proposal);
    return;
  }
  if (msg.type === 'trade-response') {
    const proposal = GameTrade._pendingProposal;
    if (!proposal) return;
    // Only the initiator's device should execute on a response.
    if (!GameTrade._isPlayerLocal(proposal.fromIdx)) return;
    GameTrade._handleResponseAsInitiator(msg.response, proposal);
    return;
  }
  if (msg.type === 'trade-cancel') {
    const proposal = GameTrade._pendingProposal;
    if (!proposal) return;
    // Only the recipient's device should react to the initiator's cancel.
    if (!GameTrade._isPlayerLocal(proposal.targetIdx)) return;
    GameTrade._cancelledByInitiator();
    return;
  }
};

// Execute the agreed-upon proposal. Resolves all references (player, mons)
// against the LIVE GameState — never against the captured `state` from the
// builder UI — because MP state sync may have moved things since.
// Is an item/ball bundle available in full from this player?
GameTrade._bundleAvailable = function (player, bundle) {
  for (const [id, qty] of Object.entries((bundle && bundle.items) || {})) {
    if ((player.items[id] || 0) < qty) return false;
  }
  for (const [id, qty] of Object.entries((bundle && bundle.balls) || {})) {
    if ((player.balls[id] || 0) < qty) return false;
  }
  return true;
};

// Move an item/ball bundle from src to dst (assumes availability validated).
GameTrade._moveBundle = function (src, dst, bundle) {
  Object.entries((bundle && bundle.items) || {}).forEach(([id, qty]) => {
    for (let i = 0; i < qty; i++) { GameState.consumeItem(src, id); GameState.giveItem(dst, id); }
  });
  Object.entries((bundle && bundle.balls) || {}).forEach(([id, qty]) => {
    for (let i = 0; i < qty; i++) { GameState.consumeBall(src, id); GameState.giveBall(dst, id); }
  });
};

GameTrade._executeProposal = function (proposal) {
  const from = GameState.players[proposal.fromIdx];
  const target = GameState.players[proposal.targetIdx];
  if (!from || !target) {
    GameUI.log('Trade aborted — a participant is missing.', 'system');
    return;
  }
  // Initiator gives an item/ball bundle (CPU-only shapes: items↔mon, items↔items).
  if (GameTrade._bundleHasItems(proposal.fromBundle)) {
    GameTrade._executeGeneralized(proposal, from, target);
    return;
  }
  const fromIdxInParty = from.party.findIndex(m => m.instanceId === proposal.fromMonInstanceId);
  if (fromIdxInParty < 0) {
    GameUI.log(`Trade aborted — ${from.name} no longer has the offered Pokemon.`, 'system');
    return;
  }
  // Defensive: item trades must leave the source with at least 1 Pokemon.
  if (proposal.offerMode === 'items' && from.party.length <= 1) {
    GameUI.log(`Trade aborted — ${from.name} must keep at least 1 Pokemon.`, 'system');
    return;
  }
  const givenMon = from.party[fromIdxInParty];
  if (proposal.offerMode === 'pokemon') {
    const targetIdxInParty = target.party.findIndex(m => m.instanceId === proposal.targetMonInstanceId);
    if (targetIdxInParty < 0) {
      GameUI.log(`Trade aborted — ${target.name} no longer has the offered Pokemon.`, 'system');
      return;
    }
    const receivedMon = target.party[targetIdxInParty];
    from.party[fromIdxInParty] = receivedMon;
    target.party[targetIdxInParty] = givenMon;
    GameUI.log(`<span class="actor">${from.name}</span> traded <strong>${givenMon.name}</strong> for <strong>${receivedMon.name}</strong> with ${target.name}.`, 'crit');
  } else {
    const bundle = proposal.targetBundle || { items: {}, balls: {} };
    for (const [id, qty] of Object.entries(bundle.items || {})) {
      if ((target.items[id] || 0) < qty) {
        GameUI.log(`${target.name} no longer has ${qty}× ${GameData.getItem(id)?.name || id} — trade aborted.`, 'system');
        return;
      }
    }
    for (const [id, qty] of Object.entries(bundle.balls || {})) {
      if ((target.balls[id] || 0) < qty) {
        GameUI.log(`${target.name} no longer has ${qty}× ${GameData.getPokeball(id)?.name || id} — trade aborted.`, 'system');
        return;
      }
    }
    Object.entries(bundle.items || {}).forEach(([id, qty]) => {
      for (let i = 0; i < qty; i++) {
        GameState.consumeItem(target, id);
        GameState.giveItem(from, id);
      }
    });
    Object.entries(bundle.balls || {}).forEach(([id, qty]) => {
      for (let i = 0; i < qty; i++) {
        GameState.consumeBall(target, id);
        GameState.giveBall(from, id);
      }
    });
    from.party.splice(fromIdxInParty, 1);
    if (target.party.length < 6) target.party.push(givenMon);
    else GameUI.log(`${target.name}'s party was full — released ${givenMon.name}.`, 'system');
    const summary = GameTrade._bundleSummary(bundle).join(' + ');
    GameUI.log(`<span class="actor">${from.name}</span> traded <strong>${givenMon.name}</strong> for ${summary} with ${target.name}.`, 'crit');
  }
  GameUI.refreshAll();
};

// Execute a proposal whose INITIATOR gives an item/ball bundle. Target gives
// either a Pokemon (offerMode 'pokemon') or its own bundle (offerMode 'items').
// Resolves all references against the live GameState.
GameTrade._executeGeneralized = function (proposal, from, target) {
  const fromBundle = proposal.fromBundle || { items: {}, balls: {} };
  const targetGivesMon = proposal.offerMode === 'pokemon' && !!proposal.targetMonInstanceId;
  const targetBundle = proposal.targetBundle || { items: {}, balls: {} };

  if (!GameTrade._bundleAvailable(from, fromBundle)) {
    GameUI.log(`Trade aborted — ${from.name} no longer has the offered items.`, 'system');
    return;
  }
  let targetMon = null;
  if (targetGivesMon) {
    targetMon = target.party.find(m => m.instanceId === proposal.targetMonInstanceId);
    if (!targetMon) {
      GameUI.log(`Trade aborted — ${target.name} no longer has the offered Pokemon.`, 'system');
      return;
    }
    if (target.party.length <= 1) {
      GameUI.log(`Trade aborted — ${target.name} must keep at least 1 Pokemon.`, 'system');
      return;
    }
  } else if (!GameTrade._bundleAvailable(target, targetBundle)) {
    GameUI.log(`Trade aborted — ${target.name} no longer has the offered items.`, 'system');
    return;
  }

  // Execute — initiator's bundle goes to the target first.
  GameTrade._moveBundle(from, target, fromBundle);
  let targetLabel;
  if (targetGivesMon) {
    const idx = target.party.findIndex(m => m.instanceId === proposal.targetMonInstanceId);
    const mon = target.party.splice(idx, 1)[0];
    if (from.party.length < 6) from.party.push(mon);
    else GameUI.log(`${from.name}'s party was full — released ${mon.name}.`, 'system');
    targetLabel = `<strong>${mon.name}</strong>`;
  } else {
    GameTrade._moveBundle(target, from, targetBundle);
    targetLabel = GameTrade._bundleSummary(targetBundle).join(' + ');
  }
  const fromLabel = GameTrade._bundleSummary(fromBundle).join(' + ');
  GameUI.log(`<span class="actor">${from.name}</span> traded ${fromLabel} for ${targetLabel} with ${target.name}.`, 'crit');
  GameUI.refreshAll();
};

// ===================== CPU-INITIATED TRADE OFFERS =====================
// A rough "worth" for a Pokemon: HP + 2×best move power, nudged up for shiny
// and for later evolution stages. Used only to keep CPU offers roughly fair.
GameTrade._monValue = function (mon) {
  if (!mon) return 0;
  const maxMove = (mon.moves || []).reduce((mx, mv) => Math.max(mx, mv.power || 0), 0);
  let v = (mon.maxHp || 0) + 2 * maxMove;
  if (mon.isShiny) v = Math.round(v * 1.3);
  if (window.GameItems && GameItems.getEvolutionStage) {
    const stage = GameItems.getEvolutionStage(mon.speciesId);
    v = Math.round(v * (1 + 0.12 * (stage - 1)));
  }
  return v;
};

GameTrade._itemUnitValue = function (id, kind) {
  const def = kind === 'ball' ? GameData.getPokeball(id) : GameData.getItem(id);
  return (def && def.value) || 5;
};

// Flatten a player's items + balls into one unit per count, for greedy bundling.
GameTrade._inventoryUnits = function (player) {
  const units = [];
  Object.entries(player.items || {}).forEach(([id, n]) => {
    for (let i = 0; i < n; i++) units.push({ id, kind: 'item', value: GameTrade._itemUnitValue(id, 'item') });
  });
  Object.entries(player.balls || {}).forEach(([id, n]) => {
    for (let i = 0; i < n; i++) units.push({ id, kind: 'ball', value: GameTrade._itemUnitValue(id, 'ball') });
  });
  return units;
};

GameTrade._bundleFromUnits = function (units) {
  const bundle = { items: {}, balls: {} };
  units.forEach(u => {
    const bucket = u.kind === 'ball' ? bundle.balls : bundle.items;
    bucket[u.id] = (bucket[u.id] || 0) + 1;
  });
  return bundle;
};

// Greedily assemble a bundle from a player's inventory approaching targetValue
// (or just `maxUnits` random units when targetValue <= 0). Returns null if the
// player has nothing.
GameTrade._buildBundleNear = function (player, targetValue, maxUnits) {
  const units = GameTrade._inventoryUnits(player);
  if (units.length === 0) return null;
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = units[i]; units[i] = units[j]; units[j] = tmp;
  }
  const chosen = [];
  let total = 0;
  for (const u of units) {
    if (chosen.length >= maxUnits) break;
    if (targetValue > 0 && total >= targetValue) break;
    chosen.push(u);
    total += u.value;
  }
  if (chosen.length === 0) return null;
  return { bundle: GameTrade._bundleFromUnits(chosen), value: total };
};

// Build a fair-ish CPU trade proposal from `from` to `target`, or null if no
// reasonable offer exists. Mixes the four shapes (mon↔mon, mon↔items,
// items↔mon, items↔items) with light randomness so play feels varied.
GameTrade._buildCpuProposal = function (from, target) {
  const fromMons = (from.party || []).slice();
  const targetMons = (target.party || []).slice();
  const fromUnits = GameTrade._inventoryUnits(from);
  const targetUnits = GameTrade._inventoryUnits(target);

  const mk = (fromMonId, fromBundle, targetMonId, targetBundle, offerMode) => ({
    fromIdx: GameState.players.indexOf(from),
    targetIdx: GameState.players.indexOf(target),
    fromMonInstanceId: fromMonId || null,
    fromBundle: fromBundle || null,
    targetMonInstanceId: targetMonId || null,
    targetBundle: targetBundle || { items: {}, balls: {} },
    offerMode,
    forced: false,
  });
  // Offer a "spare" mon: never the single strongest while the party has depth.
  const pickSpareMon = (party) => {
    if (party.length === 0) return null;
    const sorted = party.slice().sort((a, b) => GameTrade._monValue(a) - GameTrade._monValue(b));
    const pickable = party.length > 1 ? sorted.slice(0, sorted.length - 1) : sorted;
    return pickable[Math.floor(Math.random() * pickable.length)];
  };
  const fair = (give, get) => get >= give * 0.6 && get <= give * 1.5;

  const tryMonMon = () => {
    if (fromMons.length === 0 || targetMons.length === 0) return null;
    const fMon = pickSpareMon(fromMons);
    if (!fMon) return null;
    const fv = GameTrade._monValue(fMon);
    const cands = targetMons.filter(m => fair(fv, GameTrade._monValue(m)));
    const pool = cands.length ? cands : targetMons;
    const tMon = pool[Math.floor(Math.random() * pool.length)];
    return mk(fMon.instanceId, null, tMon.instanceId, null, 'pokemon');
  };
  const tryMonItems = () => {
    if (fromMons.length < 2 || targetUnits.length === 0) return null; // from keeps >=1
    const fMon = pickSpareMon(fromMons);
    const fv = GameTrade._monValue(fMon);
    const built = GameTrade._buildBundleNear(target, fv, 4);
    if (!built || !fair(fv, built.value)) return null;
    return mk(fMon.instanceId, null, null, built.bundle, 'items');
  };
  const tryItemsMon = () => {
    if (targetMons.length < 2 || fromUnits.length === 0) return null; // target keeps >=1
    const tMon = pickSpareMon(targetMons);
    const tv = GameTrade._monValue(tMon);
    const built = GameTrade._buildBundleNear(from, tv, 4);
    if (!built || !fair(built.value, tv)) return null;
    return mk(null, built.bundle, tMon.instanceId, null, 'pokemon');
  };
  const tryItemsItems = () => {
    if (fromUnits.length === 0 || targetUnits.length === 0) return null;
    const fromBuilt = GameTrade._buildBundleNear(from, 0, 1 + Math.floor(Math.random() * 2));
    if (!fromBuilt) return null;
    const targetBuilt = GameTrade._buildBundleNear(target, fromBuilt.value, 3);
    if (!targetBuilt || !fair(fromBuilt.value, targetBuilt.value)) return null;
    return mk(null, fromBuilt.bundle, null, targetBuilt.bundle, 'items');
  };

  const r = Math.random();
  const order = r < 0.55 ? [tryMonMon, tryItemsItems, tryMonItems, tryItemsMon]
              : r < 0.75 ? [tryItemsItems, tryMonMon, tryItemsMon, tryMonItems]
              : r < 0.88 ? [tryMonItems, tryMonMon, tryItemsItems, tryItemsMon]
                         : [tryItemsMon, tryItemsItems, tryMonMon, tryMonItems];
  for (const fn of order) {
    const p = fn();
    if (p) return p;
  }
  return null;
};

// Entry point used by game.js when a CPU lands on a trade tile. Builds an offer
// and routes it through the SAME propose/accept flow humans use, so a human
// target sees an explicit Accept / Decline prompt and a CPU target auto-accepts.
GameTrade.startCpuOffer = function (onDone) {
  const from = GameState.currentPlayer();
  const targets = GameState.players.filter(p => p !== from);
  if (targets.length === 0) { if (onDone) onDone(false); return; }
  const target = targets[Math.floor(Math.random() * targets.length)];
  const proposal = GameTrade._buildCpuProposal(from, target);
  if (!proposal) {
    GameUI.log(`<span class="actor">${from.name}</span> looked for a trade with ${target.name} but had nothing fair to offer.`, 'system');
    if (onDone) onDone(false);
    return;
  }
  // Seed state so the shared response handler can find onDone + names.
  GameTrade.state = {
    from, target, fromMon: null, targetMon: null,
    targetBundle: proposal.targetBundle, offerMode: proposal.offerMode,
    forced: false, onDone,
  };
  GameTrade._pendingProposal = proposal;
  GameUI.el('tradeModal').hidden = true;
  GameUI.log(`<span class="actor">${from.name}</span> offers ${target.name} a trade.`, 'system');
  GameTrade._showInitiatorWaiting(proposal);
  if (window.GameMP && GameMP.enabled) {
    GameMP.send({ type: 'trade-proposal', proposal, ts: Date.now() });
  }
  // If the target is driven by this device (single-device, or host-run CPU),
  // pop their recipient prompt. Humans must click Accept/Decline; CPUs auto-accept.
  if (GameTrade._isPlayerLocal(proposal.targetIdx)) {
    setTimeout(() => GameTrade._receiveProposal(proposal), 120);
  }
};

// Kept as a thin wrapper for any legacy caller that still invokes the old
// confirm path (no current callers, but plays it safe if anything was bound
// before this refactor).
GameTrade.confirm = function () {
  const s = GameTrade.state;
  if (!s || !s.fromMon || !s.target) return;
  GameTrade._proposeTradeToTarget();
};

// ===================== SOLO NPC TRADE OFFERS =====================
// In solo play there's no other trainer to trade with, so landing on a trade
// tile summons a wandering NPC who proposes a respectable swap — a Pokemon or
// item bundle of SIMILAR value to what they ask for, with a little variance.
// Reuses the shared tradeConfirmModal for the Accept / Decline prompt.

GameTrade.NPC_NAMES = ['A Hiker', 'A Bug Catcher', 'A Picnicker', 'A wandering Ace Trainer',
  'A Youngster', 'A Gentleman', 'A Veteran', 'A Fisher', 'A Lass', 'A Black Belt'];

// Legendaries are reserved for Giovanni — an NPC never hands one out.
GameTrade.NPC_EXCLUDE_IDS = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251];

// Worth of a freshly-built instance of a species (mirrors _monValue's basis).
GameTrade._npcSpeciesValue = function (id) {
  const base = GameData.getPokemon(id);
  if (!base) return 0;
  const maxMove = (base.moves || []).reduce((mx, mv) => Math.max(mx, mv.power || 0), 0);
  let v = (base.hp || 0) + 2 * maxMove;
  if (window.GameItems && GameItems.getEvolutionStage) {
    const stage = GameItems.getEvolutionStage(id);
    v = Math.round(v * (1 + 0.12 * (stage - 1)));
  }
  return v;
};

// Build a battle-ready NPC Pokemon whose worth lands near targetValue (±variance),
// excluding legendaries and (optionally) the species the player is giving up.
GameTrade._buildNpcMon = function (targetValue, excludeSpeciesId) {
  const tv = Math.max(30, Number(targetValue) || 0);
  const all = Object.keys(GameData.pokemon).map(Number)
    .filter(id => GameTrade.NPC_EXCLUDE_IDS.indexOf(id) < 0 && id !== Number(excludeSpeciesId))
    .map(id => ({ id, v: GameTrade._npcSpeciesValue(id) }))
    .filter(x => x.v > 0);
  if (!all.length) return null;
  let cands = all.filter(x => x.v >= tv * 0.85 && x.v <= tv * 1.35);
  if (!cands.length) {
    all.sort((a, b) => Math.abs(a.v - tv) - Math.abs(b.v - tv));
    cands = all.slice(0, 10);
  }
  const pick = cands[Math.floor(Math.random() * cands.length)];
  const base = GameData.getPokemon(pick.id);
  return {
    speciesId: pick.id,
    name: base.name,
    types: base.types.slice(),
    hp: base.hp,
    maxHp: base.hp,
    moves: GameState.cloneMoves(base.moves),
    fainted: false,
    isShiny: false,
    instanceId: 'npc-' + Math.random().toString(36).slice(2, 8),
  };
};

// Item/ball catalog the NPC can offer (everything except the special Egg).
GameTrade._npcGiveableCatalog = function () {
  const cat = [];
  Object.keys(GameData.items || {}).forEach(id => {
    if (id === 'egg') return;
    const it = GameData.items[id];
    if (it) cat.push({ id, kind: 'item', value: it.value || 5 });
  });
  Object.keys(GameData.pokeballs || {}).forEach(id => {
    const b = GameData.pokeballs[id];
    if (b) cat.push({ id, kind: 'ball', value: b.value || 8 });
  });
  return cat;
};

// Assemble an NPC item/ball bundle totalling ~targetValue from the catalog.
// Only ever picks items that keep the running total under the ceiling (tv×1.4),
// so a single pricey item (e.g. a Master Ball) can't blow a small budget and
// make the trade lopsided. Falls back to the cheapest item if nothing fits.
GameTrade._buildNpcBundle = function (targetValue) {
  const cat = GameTrade._npcGiveableCatalog();
  if (!cat.length) return null;
  const tv = Math.max(8, Number(targetValue) || 0);
  const ceiling = tv * 1.4;
  const cheapest = cat.reduce((a, b) => (a.value <= b.value ? a : b));
  const bundle = { items: {}, balls: {} };
  let total = 0, guard = 0;
  while (total < tv * 0.9 && guard++ < 20) {
    let pickable = cat.filter(c => total + c.value <= ceiling);
    if (!pickable.length) break;
    const c = pickable[Math.floor(Math.random() * pickable.length)];
    const bucket = c.kind === 'ball' ? bundle.balls : bundle.items;
    bucket[c.id] = (bucket[c.id] || 0) + 1;
    total += c.value;
  }
  if (total === 0) {
    (cheapest.kind === 'ball' ? bundle.balls : bundle.items)[cheapest.id] = 1;
    total = cheapest.value;
  }
  return { bundle, value: total };
};

// A spare mon to give up — never the single strongest while the party has depth.
GameTrade._pickSpareMonForNpc = function (player) {
  const party = (player.party || []).slice();
  if (party.length <= 1) return party[0] || null;
  const sorted = party.sort((a, b) => GameTrade._monValue(a) - GameTrade._monValue(b));
  const pickable = sorted.slice(0, sorted.length - 1);
  return pickable[Math.floor(Math.random() * pickable.length)];
};

GameTrade._npcPending = null;

// Entry point: game.js calls this when a SOLO player lands on a trade tile.
GameTrade.startNpcOffer = function (onDone) {
  const player = GameState.currentPlayer();
  const npcName = GameTrade.NPC_NAMES[Math.floor(Math.random() * GameTrade.NPC_NAMES.length)];

  const canGiveMon = (player.party || []).length >= 2;   // must keep at least 1
  const canGiveItems = GameTrade._inventoryUnits(player).length >= 1;

  // Shapes the player can fulfil. Mon-for-mon is the headline trade.
  const shapes = [];
  if (canGiveMon) shapes.push('mon_mon', 'mon_mon', 'mon_items');
  if (canGiveItems) shapes.push('items_items');
  if (!shapes.length) {
    GameUI.log(`${npcName} wanted to trade, but ${player.name} had nothing to spare.`, 'system');
    if (onDone) onDone(false);
    return;
  }
  const shape = shapes[Math.floor(Math.random() * shapes.length)];

  let give = null, get = null;
  if (shape === 'mon_mon' || shape === 'mon_items') {
    const giveMon = GameTrade._pickSpareMonForNpc(player);
    if (!giveMon) { if (onDone) onDone(false); return; }
    const v = GameTrade._monValue(giveMon);
    give = { kind: 'mon', mon: giveMon };
    if (shape === 'mon_mon') {
      const npcMon = GameTrade._buildNpcMon(v, giveMon.speciesId);
      if (!npcMon) { if (onDone) onDone(false); return; }
      get = { kind: 'mon', mon: npcMon };
    } else {
      const built = GameTrade._buildNpcBundle(v) || { bundle: { items: {}, balls: {} }, value: 0 };
      get = { kind: 'bundle', bundle: built.bundle, value: built.value };
    }
  } else { // items_items — swap a small bundle of the player's items for different ones
    const built = GameTrade._buildBundleNear(player, 0, 1 + Math.floor(Math.random() * 2));
    if (!built) { if (onDone) onDone(false); return; }
    give = { kind: 'bundle', bundle: built.bundle, value: built.value };
    const npcBuilt = GameTrade._buildNpcBundle(built.value) || { bundle: { items: {}, balls: {} }, value: 0 };
    get = { kind: 'bundle', bundle: npcBuilt.bundle, value: npcBuilt.value };
  }

  GameTrade._npcPending = { player, npcName, shape, give, get, onDone, done: false };
  GameTrade._showNpcPrompt(GameTrade._npcPending);
};

GameTrade._npcSideHtml = function (label, side) {
  if (side.kind === 'mon') {
    const mon = side.mon;
    return `
      <div class="hint">${label}</div>
      <img src="${GameData.spriteStatic(mon.speciesId)}" alt="${mon.name}" style="width:96px;height:96px;image-rendering:pixelated;" />
      <div class="trade-confirm-name">${mon.name}${mon.isShiny ? ' ✨' : ''}</div>
    `;
  }
  return `
    <div class="hint">${label}</div>
    <div class="trade-bundle-grid">${GameTrade._bundleTilesHtml(side.bundle)}</div>
    <div class="trade-confirm-name">${GameTrade._bundleSummary(side.bundle).join(' · ') || '—'}</div>
  `;
};

GameTrade._npcSummary = function (np) {
  const giveTxt = np.give.kind === 'mon' ? np.give.mon.name : GameTrade._bundleSummary(np.give.bundle).join(' + ');
  const getTxt = np.get.kind === 'mon' ? np.get.mon.name : GameTrade._bundleSummary(np.get.bundle).join(' + ');
  return `Give ${giveTxt} → receive ${getTxt}.`;
};

GameTrade._showNpcPrompt = function (np) {
  const modal = GameUI.el('tradeConfirmModal');
  if (!modal) { GameTrade._resolveNpc(false); return; }
  GameUI.el('tradeConfirmFromSide').innerHTML = GameTrade._npcSideHtml('You give', np.give);
  GameUI.el('tradeConfirmTargetSide').innerHTML = GameTrade._npcSideHtml(`${np.npcName} gives`, np.get);
  GameUI.el('tradeConfirmTitle').textContent = `${np.npcName} offers a trade!`;
  GameUI.el('tradeConfirmSummary').textContent = GameTrade._npcSummary(np);
  GameUI.el('tradeConfirmNote').textContent = 'Accept to swap, or Decline to keep what you have.';
  const goBtn = GameUI.el('tradeConfirmGoBtn');
  goBtn.hidden = false; goBtn.disabled = false; goBtn.textContent = 'Accept trade';
  goBtn.onclick = () => GameTrade._resolveNpc(true);
  const cancelBtn = GameUI.el('tradeConfirmCancelBtn');
  cancelBtn.hidden = false; cancelBtn.disabled = false; cancelBtn.textContent = 'Decline';
  cancelBtn.onclick = () => GameTrade._resolveNpc(false);
  modal.hidden = false;
};

GameTrade._resolveNpc = function (accept) {
  const np = GameTrade._npcPending;
  if (!np || np.done) return;
  np.done = true;
  GameTrade._npcPending = null;
  const modal = GameUI.el('tradeConfirmModal');
  if (modal) modal.hidden = true;
  if (accept) GameTrade._executeNpc(np);
  else GameUI.log(`${np.player.name} declined ${np.npcName}'s trade offer.`, 'system');
  if (np.onDone) np.onDone(accept);
};

GameTrade._giveBundleToPlayer = function (player, bundle) {
  Object.entries((bundle && bundle.items) || {}).forEach(([id, qty]) => { for (let i = 0; i < qty; i++) GameState.giveItem(player, id); });
  Object.entries((bundle && bundle.balls) || {}).forEach(([id, qty]) => { for (let i = 0; i < qty; i++) GameState.giveBall(player, id); });
};
GameTrade._takeBundleFromPlayer = function (player, bundle) {
  Object.entries((bundle && bundle.items) || {}).forEach(([id, qty]) => { for (let i = 0; i < qty; i++) GameState.consumeItem(player, id); });
  Object.entries((bundle && bundle.balls) || {}).forEach(([id, qty]) => { for (let i = 0; i < qty; i++) GameState.consumeBall(player, id); });
};

GameTrade._executeNpc = function (np) {
  const player = np.player;
  if (np.give.kind === 'mon') {
    const idx = player.party.findIndex(m => m.instanceId === np.give.mon.instanceId);
    if (idx < 0) { GameUI.log('Trade fell through — that Pokemon was no longer available.', 'system'); return; }
    if (np.get.kind === 'mon') {
      player.party[idx] = np.get.mon;          // swap in place
    } else {
      player.party.splice(idx, 1);             // mon → items
      GameTrade._giveBundleToPlayer(player, np.get.bundle);
    }
  } else {
    GameTrade._takeBundleFromPlayer(player, np.give.bundle);
    if (np.get.kind === 'mon') {
      if (player.party.length < 6) player.party.push(np.get.mon);
      else GameUI.log(`${player.name}'s party was full — released ${np.get.mon.name}.`, 'system');
    } else {
      GameTrade._giveBundleToPlayer(player, np.get.bundle);
    }
  }
  const giveLabel = np.give.kind === 'mon' ? `<strong>${np.give.mon.name}</strong>` : GameTrade._bundleSummary(np.give.bundle).join(' + ');
  const getLabel = np.get.kind === 'mon' ? `<strong>${np.get.mon.name}</strong>` : GameTrade._bundleSummary(np.get.bundle).join(' + ');
  GameUI.log(`<span class="actor">${player.name}</span> traded ${giveLabel} to ${np.npcName} for ${getLabel}.`, 'crit');
  if (window.GameAudio && GameAudio.sfx && GameAudio.sfx.item) GameAudio.sfx.item();
  if (GameUI.refreshAll) GameUI.refreshAll();
};
