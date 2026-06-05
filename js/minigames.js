// =============================================================
// minigames.js  ·  post-game mini-games (after the Hall of Fame)
//   1. Battle Gauntlet — endless escalating survival with a champion team
//   2. Who's That Pokémon? — silhouette guessing
//   3. Type Master — type-effectiveness quiz
// High scores persist in localStorage (pbg.minigames).
// =============================================================
window.GameMinigames = {};

GameMinigames.scores = { gauntlet: 0, whosThat: 0, typeMaster: 0 };
GameMinigames.loadScores = function () {
  try {
    const s = JSON.parse(localStorage.getItem('pbg.minigames')) || {};
    GameMinigames.scores = Object.assign({ gauntlet: 0, whosThat: 0, typeMaster: 0 }, s);
  } catch (e) { GameMinigames.scores = { gauntlet: 0, whosThat: 0, typeMaster: 0 }; }
  return GameMinigames.scores;
};
GameMinigames._recordScore = function (key, value) {
  GameMinigames.loadScores();
  const best = Math.max(GameMinigames.scores[key] || 0, value);
  GameMinigames.scores[key] = best;
  localStorage.setItem('pbg.minigames', JSON.stringify(GameMinigames.scores));
  return best;
};

GameMinigames._el = function (id) { return document.getElementById(id); };
GameMinigames._timer = null;
GameMinigames._clearTimer = function () { if (GameMinigames._timer) { clearTimeout(GameMinigames._timer); GameMinigames._timer = null; } };
GameMinigames._hide = function (id) { const m = GameMinigames._el(id); if (m) m.hidden = true; };
GameMinigames._randomDexId = function () {
  const ids = Object.keys(GameData.pokemon);
  return Number(ids[Math.floor(Math.random() * ids.length)]);
};

// ============================== HUB ==============================
GameMinigames.showHub = function () {
  GameMinigames.loadScores();
  GameMinigames._clearTimer();
  const modal = GameMinigames._el('minigamesModal');
  if (!modal) return;
  modal.hidden = false;
  const grid = GameMinigames._el('minigamesGrid');
  grid.innerHTML = '';
  const champs = (function () { GameState.loadHallOfFame(); return GameState.hallOfFame.length; })();
  const games = [
    { key: 'gauntlet',   icon: '⚔️', name: 'Battle Gauntlet', desc: 'Survive endless escalating battles with a champion team. HP carries over.', best: GameMinigames.scores.gauntlet, bestLabel: 'Best wave', locked: champs < 1, lockMsg: 'Enter the Hall of Fame first.' },
    { key: 'whosThat',   icon: '❓', name: "Who's That Pokémon?", desc: 'Name the Pokémon from its silhouette. How long a streak can you get?', best: GameMinigames.scores.whosThat, bestLabel: 'Best streak' },
    { key: 'typeMaster', icon: '🧠', name: 'Type Master', desc: 'Rapid-fire type-effectiveness quiz. Know your matchups!', best: GameMinigames.scores.typeMaster, bestLabel: 'Best streak' },
  ];
  games.forEach(g => {
    const card = document.createElement('div');
    card.className = 'mg-card' + (g.locked ? ' locked' : '');
    card.innerHTML = `
      <div class="mg-icon">${g.icon}</div>
      <div class="mg-info">
        <div class="mg-name">${g.name}</div>
        <div class="hint">${g.desc}</div>
        <div class="mg-best">${g.bestLabel}: <strong>${g.best || 0}</strong></div>
      </div>
      <button class="mg-play" type="button" ${g.locked ? 'disabled' : ''}>${g.locked ? '🔒' : 'Play'}</button>
    `;
    if (!g.locked) {
      card.querySelector('.mg-play').onclick = () => {
        modal.hidden = true;
        if (g.key === 'gauntlet') GameMinigames.openGauntlet();
        else if (g.key === 'whosThat') GameMinigames.startWhosThat();
        else if (g.key === 'typeMaster') GameMinigames.startTypeMaster();
      };
    } else {
      card.title = g.lockMsg;
    }
    grid.appendChild(card);
  });
  GameMinigames._el('minigamesCloseBtn').onclick = () => { modal.hidden = true; };
};

// ====================== WHO'S THAT POKÉMON? ======================
GameMinigames._wt = { streak: 0, answer: null, locked: false };
GameMinigames.startWhosThat = function () {
  GameMinigames._clearTimer();
  GameMinigames._wt = { streak: 0, answer: null, locked: false };
  GameMinigames._el('whosThatModal').hidden = false;
  GameMinigames._el('wtBest').textContent = GameMinigames.loadScores().whosThat || 0;
  GameMinigames._el('wtQuitBtn').onclick = () => GameMinigames._wtQuit();
  GameMinigames._wtNext();
};
GameMinigames._wtNext = function () {
  const wt = GameMinigames._wt;
  wt.locked = false;
  GameMinigames._el('wtStreak').textContent = wt.streak;
  GameMinigames._el('wtResult').textContent = '';
  GameMinigames._el('wtResult').className = 'wt-result';
  const answerId = GameMinigames._randomDexId();
  wt.answer = answerId;
  const sprite = GameMinigames._el('wtSprite');
  sprite.className = 'wt-sprite silhouette';
  sprite.src = GameData.spriteFront(answerId);
  sprite.onerror = function () { this.onerror = null; this.src = GameData.spriteStatic(answerId); };
  // Build 4 options: the answer + 3 distinct wrong names.
  const options = [answerId];
  let guard = 0;
  while (options.length < 4 && guard++ < 50) {
    const cand = GameMinigames._randomDexId();
    if (!options.includes(cand) && GameData.getPokemon(cand).name !== GameData.getPokemon(answerId).name) options.push(cand);
  }
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = options[i]; options[i] = options[j]; options[j] = t; }
  const optsEl = GameMinigames._el('wtOptions');
  optsEl.innerHTML = '';
  options.forEach(id => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wt-option';
    btn.textContent = GameData.getPokemon(id).name;
    btn.onclick = () => GameMinigames._wtAnswer(id, btn);
    optsEl.appendChild(btn);
  });
};
GameMinigames._wtAnswer = function (id, btn) {
  const wt = GameMinigames._wt;
  if (wt.locked) return;
  wt.locked = true;
  const correct = id === wt.answer;
  GameMinigames._el('wtSprite').className = 'wt-sprite revealed';
  if (correct) {
    btn.classList.add('right');
    wt.streak++;
    GameMinigames._el('wtStreak').textContent = wt.streak;
    GameMinigames._el('wtResult').textContent = `Yes! It's ${GameData.getPokemon(id).name}!`;
    GameMinigames._el('wtResult').className = 'wt-result good';
    if (GameAudio.sfx && GameAudio.sfx.item) GameAudio.sfx.item();
    GameMinigames._timer = setTimeout(() => GameMinigames._wtNext(), 850);
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('#wtOptions .wt-option').forEach(b => { if (b.textContent === GameData.getPokemon(wt.answer).name) b.classList.add('right'); });
    const best = GameMinigames._recordScore('whosThat', wt.streak);
    GameMinigames._el('wtResult').innerHTML = `It was <strong>${GameData.getPokemon(wt.answer).name}</strong>. Final streak: <strong>${wt.streak}</strong> (best ${best}).`;
    GameMinigames._el('wtResult').className = 'wt-result bad';
    if (GameAudio.sfx && GameAudio.sfx.miss) GameAudio.sfx.miss();
    GameMinigames._wtShowReplay();
  }
};
GameMinigames._wtShowReplay = function () {
  const optsEl = GameMinigames._el('wtOptions');
  const bar = document.createElement('div');
  bar.className = 'mg-replay';
  bar.innerHTML = `<button type="button" class="primary-btn" id="wtAgain">Play again</button>`;
  optsEl.appendChild(bar);
  GameMinigames._el('wtAgain').onclick = () => GameMinigames.startWhosThat();
};
GameMinigames._wtQuit = function () {
  GameMinigames._clearTimer();
  if (GameMinigames._wt.streak > 0) GameMinigames._recordScore('whosThat', GameMinigames._wt.streak);
  GameMinigames._hide('whosThatModal');
  GameMinigames.showHub();
};

// ========================== TYPE MASTER ==========================
GameMinigames.ALL_TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
GameMinigames._tm = { streak: 0, answer: null, locked: false };
GameMinigames.startTypeMaster = function () {
  GameMinigames._clearTimer();
  GameMinigames._tm = { streak: 0, answer: null, locked: false };
  GameMinigames._el('typeMasterModal').hidden = false;
  GameMinigames._el('tmBest').textContent = GameMinigames.loadScores().typeMaster || 0;
  GameMinigames._el('tmQuitBtn').onclick = () => GameMinigames._tmQuit();
  GameMinigames._tmNext();
};
GameMinigames._tmCategory = function (eff) {
  if (eff === 0) return 'no-effect';
  if (eff >= 2) return 'super';
  if (eff < 1) return 'resisted';
  return 'neutral';
};
GameMinigames._tmNext = function () {
  const tm = GameMinigames._tm;
  tm.locked = false;
  GameMinigames._el('tmStreak').textContent = tm.streak;
  GameMinigames._el('tmResult').textContent = '';
  GameMinigames._el('tmResult').className = 'tm-result';
  const defId = GameMinigames._randomDexId();
  const def = GameData.getPokemon(defId);
  const moveType = GameMinigames.ALL_TYPES[Math.floor(Math.random() * GameMinigames.ALL_TYPES.length)];
  const eff = GameBattle.typeEffect(moveType, def.types);
  tm.answer = GameMinigames._tmCategory(eff);
  GameMinigames._el('tmSprite').src = GameData.spriteFront(defId);
  GameMinigames._el('tmSprite').onerror = function () { this.onerror = null; this.src = GameData.spriteStatic(defId); };
  GameMinigames._el('tmTypePill').innerHTML = `<span class="tm-attack-label">Attacking move:</span> ${GameUI.typePill(moveType)}`;
  GameMinigames._el('tmQuestion').innerHTML = `A <strong>${moveType}</strong> move hits <strong>${def.name}</strong> (${(def.types || []).map(t => GameUI.typePill(t)).join('')}). How effective?`;
  const opts = [
    { cls: 'super', label: 'Super effective (2×+)' },
    { cls: 'neutral', label: 'Neutral (1×)' },
    { cls: 'resisted', label: 'Not very effective (½×)' },
    { cls: 'no-effect', label: 'No effect (0×)' },
  ];
  const optsEl = GameMinigames._el('tmOptions');
  optsEl.innerHTML = '';
  opts.forEach(o => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-option';
    btn.textContent = o.label;
    btn.onclick = () => GameMinigames._tmAnswer(o.cls, btn);
    optsEl.appendChild(btn);
  });
};
GameMinigames._tmAnswer = function (cls, btn) {
  const tm = GameMinigames._tm;
  if (tm.locked) return;
  tm.locked = true;
  const correct = cls === tm.answer;
  if (correct) {
    btn.classList.add('right');
    tm.streak++;
    GameMinigames._el('tmStreak').textContent = tm.streak;
    GameMinigames._el('tmResult').textContent = 'Correct!';
    GameMinigames._el('tmResult').className = 'tm-result good';
    if (GameAudio.sfx && GameAudio.sfx.item) GameAudio.sfx.item();
    GameMinigames._timer = setTimeout(() => GameMinigames._tmNext(), 750);
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('#tmOptions .tm-option').forEach((b, i) => {
      const order = ['super', 'neutral', 'resisted', 'no-effect'];
      if (order[i] === tm.answer) b.classList.add('right');
    });
    const labelMap = { super: 'super effective', neutral: 'neutral', resisted: 'not very effective', 'no-effect': 'no effect' };
    const best = GameMinigames._recordScore('typeMaster', tm.streak);
    GameMinigames._el('tmResult').innerHTML = `It was <strong>${labelMap[tm.answer]}</strong>. Final streak: <strong>${tm.streak}</strong> (best ${best}).`;
    GameMinigames._el('tmResult').className = 'tm-result bad';
    if (GameAudio.sfx && GameAudio.sfx.miss) GameAudio.sfx.miss();
    const bar = document.createElement('div');
    bar.className = 'mg-replay';
    bar.innerHTML = `<button type="button" class="primary-btn" id="tmAgain">Play again</button>`;
    GameMinigames._el('tmOptions').appendChild(bar);
    GameMinigames._el('tmAgain').onclick = () => GameMinigames.startTypeMaster();
  }
};
GameMinigames._tmQuit = function () {
  GameMinigames._clearTimer();
  if (GameMinigames._tm.streak > 0) GameMinigames._recordScore('typeMaster', GameMinigames._tm.streak);
  GameMinigames._hide('typeMasterModal');
  GameMinigames.showHub();
};

// ========================== BATTLE GAUNTLET ==========================
GameMinigames.gauntletState = null;
GameMinigames.openGauntlet = function () {
  GameState.loadHallOfFame();
  const modal = GameMinigames._el('gauntletModal');
  modal.hidden = false;
  GameMinigames._el('gauntletTitle').textContent = '⚔️ Battle Gauntlet';
  GameMinigames._el('gauntletSub').textContent = 'Pick a champion team and survive as many waves as you can. HP carries over; PP refreshes and you heal a little between waves. Opponents get tougher every round.';
  const body = GameMinigames._el('gauntletBody');
  body.innerHTML = '';
  const champs = GameState.hallOfFame || [];
  if (!champs.length) {
    body.innerHTML = `<div class="hint">No champions yet — beat Giovanni to unlock the Gauntlet.</div>`;
  } else {
    const ranked = champs.map(e => ({ e, score: GameState.hofScore(e) })).sort((a, b) => b.score - a.score);
    ranked.forEach(({ e }) => {
      const sprites = (e.party || []).map(m => `<img src="${GameData.spriteStatic(m.speciesId)}" alt="" />`).join('');
      const card = document.createElement('div');
      card.className = 'gauntlet-team';
      card.innerHTML = `
        <div class="gauntlet-team-head">
          <div class="gauntlet-team-name" style="color:${e.color || '#fff'}">${e.name}</div>
          <button class="gauntlet-start-btn" type="button">Start</button>
        </div>
        <div class="gauntlet-team-sprites">${sprites}</div>
      `;
      card.querySelector('.gauntlet-start-btn').onclick = () => GameMinigames.startGauntlet(e);
      body.appendChild(card);
    });
  }
  GameMinigames._el('gauntletCloseBtn').onclick = () => { modal.hidden = true; GameMinigames.showHub(); };
};

GameMinigames.startGauntlet = function (entry) {
  const you = {
    id: 'gauntlet-you', idx: 0, name: entry.name, color: entry.color || '#3b82f6', isCpu: false,
    party: GameState.arenaTeamFromEntry(entry),
    items: { potion: 3, super_potion: 2, revive: 1 }, balls: {}, flags: {}, badges: [], eggs: [], money: 0, tile: 0, completed: false,
  };
  GameMinigames._pre = { players: GameState.players, active: GameState.activePlayerIdx };
  GameState.players = [you];
  GameState.activePlayerIdx = 0;
  GameState.busy = false;
  GameState.pendingTileResolution = false;
  GameMinigames.gauntletState = { entry, wave: 1, you };
  GameMinigames._hide('gauntletModal');
  GameMinigames._gauntletRound();
};

GameMinigames._gauntletSkill = function (wave) {
  return {
    mul: 1 + wave * 0.1,
    hyperPotions: Math.min(3, Math.floor(wave / 4)),
    maxRevives: wave >= 8 ? 1 : 0,
    smartMoves: wave >= 3,
  };
};
GameMinigames._genGauntletTeam = function (wave) {
  const size = Math.min(6, 2 + Math.floor(wave / 3));
  const scale = 1 + wave * 0.12;
  const team = [];
  for (let i = 0; i < size; i++) {
    const id = GameMinigames._randomDexId();
    const base = GameData.getPokemon(id);
    team.push({
      speciesId: id, name: base.name, types: base.types.slice(),
      moves: base.moves.map(m => Object.assign({}, m, { power: Math.round((m.power || 0) * scale), pp: m.gated ? 3 : 20, maxPp: m.gated ? 3 : 20 })),
      hp: Math.round(base.hp * scale), maxHp: Math.round(base.hp * scale), fainted: false,
    });
  }
  return team;
};
GameMinigames._gauntletRound = function () {
  const st = GameMinigames.gauntletState;
  if (!st) return;
  const wave = st.wave;
  GameBattle.start({
    kind: 'arena',
    oppTeam: GameMinigames._genGauntletTeam(wave),
    opponentLabel: `🌀 Wave ${wave}`,
    opponentColor: '#7c3aed',
    arenaSkill: GameMinigames._gauntletSkill(wave),
    onWin: () => GameMinigames._gauntletWin(),
    onLose: () => GameMinigames._gauntletLose(),
  });
};
GameMinigames._gauntletWin = function () {
  const st = GameMinigames.gauntletState;
  if (!st) return;
  // syncBackToParty already wrote post-battle HP onto st.you.party. Reset PP and
  // give a small heal to surviving mons, then send in the next (tougher) wave.
  st.you.party.forEach(m => {
    if (!m.fainted) m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.25));
    GameState.resetMoves(m); // PP only — not HP
  });
  st.wave++;
  if (GameUI.showTileEventToast) GameUI.showTileEventToast(`Wave ${st.wave - 1} cleared! Wave ${st.wave} incoming…`);
  GameMinigames._clearTimer();
  GameMinigames._timer = setTimeout(() => GameMinigames._gauntletRound(), 1100);
};
GameMinigames._gauntletLose = function () {
  const st = GameMinigames.gauntletState;
  if (!st) return;
  const reached = st.wave;
  const best = GameMinigames._recordScore('gauntlet', reached);
  GameMinigames._gauntletRestore();
  GameMinigames.gauntletState = null;
  GameMinigames._showGauntletResult(reached, best);
};
GameMinigames._gauntletRestore = function () {
  const pre = GameMinigames._pre || { players: [], active: 0 };
  GameState.players = pre.players || [];
  GameState.activePlayerIdx = pre.active || 0;
  GameState.busy = false;
  GameState.pendingTileResolution = false;
  GameMinigames._pre = null;
};
GameMinigames._showGauntletResult = function (reached, best) {
  const modal = GameMinigames._el('gauntletModal');
  modal.hidden = false;
  GameMinigames._el('gauntletTitle').textContent = '⚔️ Gauntlet Over';
  GameMinigames._el('gauntletSub').textContent = '';
  const newBest = reached >= best;
  GameMinigames._el('gauntletBody').innerHTML = `
    <div class="gauntlet-result">
      <div class="gr-wave">You reached <strong>Wave ${reached}</strong></div>
      <div class="hint">${newBest ? '🏆 New best!' : `Best: Wave ${best}`}</div>
      <button type="button" class="primary-btn" id="gauntletAgain" style="margin-top:14px;">Back to Gauntlet</button>
    </div>
  `;
  GameMinigames._el('gauntletAgain').onclick = () => GameMinigames.openGauntlet();
  GameMinigames._el('gauntletCloseBtn').onclick = () => { modal.hidden = true; GameMinigames.showHub(); };
  if (GameAudio.sfx && GameAudio.sfx.gameOver) GameAudio.sfx.gameOver();
};
