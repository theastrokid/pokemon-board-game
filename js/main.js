// =============================================================
// main.js  ·  entry point. sets up listeners and boots game.
// =============================================================
(async function () {
  await GameData.load();
  GameAudio.init();
  GameState.loadHallOfFame();

  // Starter Pokemon — fixed roster Damon wants
  const STARTER_IDS = [1, 4, 7, 152, 155, 158, 25]; // Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil, Totodile, Pikachu

  // Trainer sprites available (filename → display label)
  const TRAINERS = [
    { id: 'red',     label: 'Red'       },
    { id: 'leaf',    label: 'Leaf'      },
    { id: 'ethan',   label: 'Ethan'     },
    { id: 'lyra',    label: 'Lyra'      },
    { id: 'brendan', label: 'Brendan'   },
    { id: 'may',     label: 'May'       },
    { id: 'cynthia', label: 'Cynthia'   },
    { id: 'ace_m',   label: 'Ace M'     },
    { id: 'hiker',   label: 'Hiker'     },
    { id: 'lass',    label: 'Lass'      },
  ];

  setupScreenInit();
  bindGlobalListeners();
  setupMultiplayer();

  function setupScreenInit() {
    const countBtns = document.querySelectorAll('#playerCountButtons .count-btn');
    countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        countBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTrainerSetup(Number(btn.dataset.count));
      });
    });
    renderTrainerSetup(3);

    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('loadSaveBtn').addEventListener('click', () => {
      if (GameState.load() && GameState.players.length > 0) {
        enterGame();
      } else {
        alert('No saved game found.');
      }
    });
    document.getElementById('hallOfFameBtn').addEventListener('click', () => GameUI.showHallOfFame());
    const arenaBtn = document.getElementById('arenaBtn');
    if (arenaBtn) arenaBtn.addEventListener('click', () => { if (GameUI.showArena) GameUI.showArena(); });
    const minigamesBtn = document.getElementById('minigamesBtn');
    if (minigamesBtn) minigamesBtn.addEventListener('click', () => { if (window.GameMinigames) GameMinigames.showHub(); });

    document.getElementById('optMusic').addEventListener('change', e => {
      GameState.options.music = e.target.checked;
    });
    document.getElementById('optSfx').addEventListener('change', e => {
      GameState.options.sfx = e.target.checked;
    });
  }

  function renderTrainerSetup(n) {
    const wrap = document.getElementById('trainerSetup');
    wrap.innerHTML = '';
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
    // Saved Hall of Fame champions — selectable as a CPU "ghost" that emulates
    // that run's winning team.
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const champions = (window.GameState && GameState.loadHallOfFame) ? GameState.loadHallOfFame() : [];
    const ghostOptionsHtml = champions.map((e, gi) => `<option value="${gi}">👻 ${esc(e.name)} · ${(e.party || []).length} mon · ${e.turns || '?'}t</option>`).join('');
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'trainer-row-v';
      row.dataset.idx = i;
      row.dataset.trainer = TRAINERS[i % TRAINERS.length].id;
      row.dataset.starter = STARTER_IDS[i % STARTER_IDS.length];

      const trainerPickerHtml = TRAINERS.map((t, ti) => `
        <button type="button" class="trainer-sprite-pick ${t.id === row.dataset.trainer ? 'selected' : ''}" data-trainer="${t.id}" title="${t.label}">
          <img src="sprites/trainers/${t.id}.png" alt="${t.label}" />
        </button>
      `).join('');

      const starterPickerHtml = STARTER_IDS.map(id => `
        <button type="button" class="starter-pick ${id == row.dataset.starter ? 'selected' : ''}" data-starter="${id}" title="${GameData.getPokemon(id).name}">
          <img src="sprites/static/${id}.png" alt="${GameData.getPokemon(id).name}" />
          <span>${GameData.getPokemon(id).name}</span>
        </button>
      `).join('');

      // Default the trainer's name to the sprite label so the setup row
      // reads "Red" / "Leaf" / "Cynthia" out of the box instead of the
      // dull "Trainer 1". Still editable — and a custom-typed name is
      // preserved across sprite changes.
      const initialTrainer = TRAINERS.find(t => t.id === row.dataset.trainer) || TRAINERS[i % TRAINERS.length];
      const defaultName = initialTrainer.label;
      row.innerHTML = `
        <div class="trainer-row-header">
          <span class="trainer-color" style="background:${colors[i]}"></span>
          <input type="text" class="trainer-name-input" placeholder="${defaultName}" value="${defaultName}" />
          <label class="cpu-toggle">
            <input type="checkbox" class="cpu-toggle-input" />
            <span class="cpu-toggle-label">🤖 CPU</span>
          </label>
          <select class="ghost-select" title="Emulate a Hall of Fame champion's winning team" hidden ${champions.length ? '' : 'disabled'}>
            <option value="">Fresh CPU</option>
            ${ghostOptionsHtml}
          </select>
        </div>
        <div class="trainer-pick-section">
          <h4>Sprite</h4>
          <div class="trainer-sprite-grid">${trainerPickerHtml}</div>
        </div>
        <div class="trainer-pick-section starter-choice-section">
          <h4>Starter</h4>
          <div class="starter-choice" data-state="choice">
            <button type="button" class="starter-choice-card egg-choice" title="Hatch a random early-route Pokemon">
              <div class="scc-emoji">🥚</div>
              <div class="scc-title">Lucky Starter Egg</div>
              <div class="scc-sub">Hatch a surprise Pokémon</div>
            </button>
            <button type="button" class="starter-choice-card question-choice" title="Reveal the classic starter picks">
              <div class="scc-emoji">❓</div>
              <div class="scc-title">Choose a Starter</div>
              <div class="scc-sub">Reveal the classic picks</div>
            </button>
          </div>
          <div class="starter-egg-hatch" hidden>
            <div class="egg-shake">🥚</div>
            <div class="hatch-caption">Hatching…</div>
          </div>
          <div class="starter-grid-wrap" hidden>
            <div class="starter-grid">${starterPickerHtml}</div>
          </div>
          <div class="starter-chosen" hidden>
            <img class="starter-chosen-img" alt="" />
            <div class="starter-chosen-text"><span class="starter-chosen-name"></span><span class="starter-chosen-tag"></span></div>
            <button type="button" class="starter-rechoose">Change</button>
          </div>
        </div>
      `;
      wrap.appendChild(row);

      const nameInput = row.querySelector('.trainer-name-input');
      const cpuInput = row.querySelector('.cpu-toggle-input');
      // Track every "default-shape" name we've ever shown for this row, so
      // we can tell whether the input still holds a default we may safely
      // overwrite vs. a user-typed value we must preserve.
      const knownDefaults = new Set([defaultName]);
      const isDefaultName = () => knownDefaults.has(nameInput.value);
      const setDefault = (name) => {
        if (isDefaultName()) {
          nameInput.value = name;
          nameInput.placeholder = name;
        }
        knownDefaults.add(name);
      };

      // Sprite click → select + update name if still on a default
      row.querySelectorAll('.trainer-sprite-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.trainer-sprite-pick').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          row.dataset.trainer = btn.dataset.trainer;
          const pickedLabel = TRAINERS.find(t => t.id === btn.dataset.trainer)?.label || nameInput.value;
          const baseName = cpuInput.checked ? `CPU ${pickedLabel}` : pickedLabel;
          setDefault(baseName);
        });
      });
      // ===== Starter choice: egg (random) vs question-mark (classic picks) =====
      const choiceWrap   = row.querySelector('.starter-choice');
      const hatchWrap    = row.querySelector('.starter-egg-hatch');
      const gridWrap     = row.querySelector('.starter-grid-wrap');
      const chosenWrap   = row.querySelector('.starter-chosen');
      const showChoice = () => {
        choiceWrap.hidden = false;
        hatchWrap.hidden = true;
        gridWrap.hidden = true;
        chosenWrap.hidden = true;
      };
      const showChosen = (speciesId, tag) => {
        const poke = GameData.getPokemon(speciesId);
        if (!poke) return;
        row.dataset.starter = String(speciesId);
        choiceWrap.hidden = true;
        hatchWrap.hidden = true;
        gridWrap.hidden = true;
        chosenWrap.hidden = false;
        chosenWrap.querySelector('.starter-chosen-img').src = `sprites/static/${speciesId}.png`;
        chosenWrap.querySelector('.starter-chosen-name').textContent = poke.name;
        chosenWrap.querySelector('.starter-chosen-tag').textContent = tag || '';
      };

      // Egg: ~2s hatch animation, then reveal a random pre-first-gym Pokemon.
      row.querySelector('.egg-choice').addEventListener('click', () => {
        choiceWrap.hidden = true;
        gridWrap.hidden = true;
        chosenWrap.hidden = true;
        hatchWrap.hidden = false;
        const egg = hatchWrap.querySelector('.egg-shake');
        const cap = hatchWrap.querySelector('.hatch-caption');
        egg.classList.remove('hatching'); void egg.offsetWidth; egg.classList.add('hatching');
        cap.textContent = 'Hatching…';
        if (window.GameAudio && GameAudio.sfx && GameAudio.sfx.encounter) GameAudio.sfx.encounter();
        const speciesId = GameData.randomPreGym1SpeciesId();
        setTimeout(() => {
          if (window.GameAudio && GameAudio.sfx && GameAudio.sfx.fanfare) GameAudio.sfx.fanfare();
          showChosen(speciesId, '🥚 hatched!');
        }, 2000);
      });

      // Question mark: reveal the classic starter grid.
      row.querySelector('.question-choice').addEventListener('click', () => {
        choiceWrap.hidden = true;
        hatchWrap.hidden = true;
        chosenWrap.hidden = true;
        gridWrap.hidden = false;
      });

      row.querySelector('.starter-rechoose').addEventListener('click', () => {
        row.dataset.starter = String(STARTER_IDS[i % STARTER_IDS.length]);
        row.querySelectorAll('.starter-pick').forEach(b => b.classList.remove('selected'));
        showChoice();
      });

      row.querySelectorAll('.starter-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.starter-pick').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          showChosen(Number(btn.dataset.starter), 'classic starter');
        });
      });
      // CPU toggle: visual state + name swap (only if still on a default).
      cpuInput.addEventListener('change', () => {
        row.dataset.cpu = cpuInput.checked ? '1' : '0';
        row.classList.toggle('is-cpu', cpuInput.checked);
        const currentTrainer = TRAINERS.find(t => t.id === row.dataset.trainer) || initialTrainer;
        const baseName = cpuInput.checked ? `CPU ${currentTrainer.label}` : currentTrainer.label;
        setDefault(baseName);
        // The ghost (emulate-a-champion) picker only applies to CPUs.
        if (ghostSelect) {
          ghostSelect.hidden = !(cpuInput.checked && champions.length > 0);
          if (!cpuInput.checked) { ghostSelect.value = ''; row.dataset.ghost = ''; }
        }
      });

      // Ghost pick → emulate that champion (sets the row's name/sprite to match).
      const ghostSelect = row.querySelector('.ghost-select');
      if (ghostSelect) {
        ghostSelect.addEventListener('change', () => {
          row.dataset.ghost = ghostSelect.value;
          const e = ghostSelect.value !== '' ? champions[Number(ghostSelect.value)] : null;
          if (e) {
            setDefault(`${e.name} 👻`);
            if (e.trainerSprite) {
              row.dataset.trainer = e.trainerSprite;
              row.querySelectorAll('.trainer-sprite-pick').forEach(b => b.classList.toggle('selected', b.dataset.trainer === e.trainerSprite));
            }
          }
        });
      }
    }
  }

  let mpMode = 'local'; // 'local' | 'host' | 'join'

  function setupMultiplayer() {
    document.querySelectorAll('.mp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        mpMode = tab.dataset.mode;
        document.getElementById('mpJoinPanel').hidden = mpMode !== 'join';
        document.getElementById('mpHostPanel').hidden = mpMode !== 'host';
        // Change Start button text + behavior for join
        const startBtn = document.getElementById('startGameBtn');
        if (mpMode === 'join') startBtn.textContent = 'Joining requires the room code (use Join button)';
        else if (mpMode === 'host') startBtn.textContent = 'Host & start adventure';
        else startBtn.textContent = 'Start adventure';
        startBtn.disabled = mpMode === 'join';
      });
    });

    document.getElementById('mpJoinBtn').addEventListener('click', async () => {
      const code = document.getElementById('mpJoinCode').value.trim().toUpperCase();
      const status = document.getElementById('mpJoinStatus');
      status.textContent = 'Connecting...';
      try {
        await GameMP.joinRoom(code);
        status.textContent = `Connected to ${code}. Waiting for host to share the game state...`;
        // Hide setup, show game (state will arrive via WS)
        document.getElementById('setup').hidden = true;
        document.getElementById('game').hidden = false;
        document.getElementById('app').classList.remove('screen-setup');
        showMpRoomPill(code);
        // Render an empty board while we wait for the host's first state push.
        if (window.GameBoard) GameBoard.render();
        if (window.GameCpu) GameCpu.start();
      } catch (e) {
        status.textContent = 'Failed: ' + e.message;
      }
    });
  }

  function showMpRoomPill(code) {
    const pill = document.getElementById('mpRoomPill');
    if (!pill) return;
    pill.hidden = false;
    document.getElementById('mpRoomCode').textContent = code;
  }

  // Poll every 150ms so turn handoffs (and the CPU button gate) feel snappy.
  setInterval(() => {
    const banner = document.getElementById('mpWaitingBanner');
    if (banner && window.GameMP) {
      const msg = GameMP.statusBanner && GameMP.statusBanner();
      if (msg) { banner.textContent = msg; banner.hidden = false; }
      else { banner.hidden = true; }
    }
    // Gate the Roll button when this device isn't the active player.
    const rollBtn = document.getElementById('rollMoveBtn');
    if (rollBtn && window.GameMP && GameMP.enabled) {
      const localActive = GameMP.isLocalDeviceActive();
      if (!localActive) {
        rollBtn.disabled = true;
      } else if (!GameState.busy && !GameState.pendingTileResolution) {
        rollBtn.disabled = false;
      }
    }
  }, 150);

  // The species that evolves INTO `id` (single + multi evolution lines), or null.
  function preEvoOf(id) {
    const E = (window.GameItems && GameItems.evolutions) || {};
    const M = (window.GameItems && GameItems.multiEvolutions) || {};
    for (const from in E) { if (Number(E[from]) === id) return Number(from); }
    for (const from in M) { if ((M[from] || []).map(Number).indexOf(id) >= 0) return Number(from); }
    return null;
  }
  // A ghost's "wishlist": the champion's final team species PLUS each one's
  // pre-evolution ancestors, so the ghost recognises a base form as on-path to
  // the proven team. Returned as a plain array (MP-state-sync safe).
  function buildGhostTargets(entry) {
    const set = new Set();
    (entry.party || []).forEach(m => {
      let id = Number(m.speciesId);
      if (!id) return;
      set.add(id);
      let cur = id, guard = 0;
      while (guard++ < 5) { const pre = preEvoOf(cur); if (pre == null) break; set.add(pre); cur = pre; }
    });
    return Array.from(set);
  }

  async function startGame() {
    const rows = document.querySelectorAll('#trainerSetup .trainer-row-v');
    GameState.reset();
    rows.forEach((row, i) => {
      const name = row.querySelector('.trainer-name-input').value.trim() || `Trainer ${i + 1}`;
      const starter = Number(row.dataset.starter);
      const trainer = row.dataset.trainer || 'red';
      const isCpu = row.dataset.cpu === '1';
      const p = GameState.makePlayer(i, name, starter);
      p.trainerSprite = trainer;
      p.isCpu = isCpu;
      // Ghost CPU: emulate a saved Hall of Fame champion's winning team.
      const ghostIdx = row.dataset.ghost;
      if (isCpu && ghostIdx) {
        const entry = (GameState.loadHallOfFame() || [])[Number(ghostIdx)];
        if (entry) {
          p.isGhost = true;
          p.ghostName = entry.name;
          p.color = entry.color || p.color;
          if (entry.trainerSprite) p.trainerSprite = entry.trainerSprite;
          p.ghostTargets = buildGhostTargets(entry);
          p.ghostTeam = (entry.party || []).map(m => m.name);
        }
      }
      GameState.giveItem(p, 'potion');
      GameState.giveItem(p, 'potion');
      GameState.giveItem(p, 'super_potion');
      GameState.giveItem(p, 'revive');
      GameState.giveItem(p, 'rare_candy');
      for (let j = 0; j < 5; j++) GameState.giveBall(p, 'pokeball');
      // Everyone begins with an Egg that hatches into a shiny after 5 of their turns.
      GameState.giveEgg(p);
      GameState.players.push(p);
    });
    // Host an online room if requested
    if (mpMode === 'host') {
      try {
        const code = await GameMP.hostRoom();
        showMpRoomPill(code);
        // Tiny alert so the host knows their code (so they can read it to friends)
        alert(`Room code: ${code}\n\nShare this with the other trainers — they pick "Join with code" on the setup screen.`);
        // Broadcast initial state once joiners connect (the DO caches it too)
        setTimeout(() => GameMP.broadcastState(), 300);
      } catch (e) {
        alert('Could not host room: ' + e.message + '\nStarting in local mode instead.');
      }
    }
    enterGame();
  }

  function enterGame() {
    document.getElementById('setup').hidden = true;
    document.getElementById('game').hidden = false;
    document.getElementById('app').classList.remove('screen-setup');
    GameBoard.render();
    GameGame.start();
    // Announce any champion ghosts so players see whose winning team is being emulated.
    (GameState.players || []).forEach(pl => {
      if (pl.isGhost && GameUI.log) {
        GameUI.log(`<span class="actor">${pl.name}</span> is emulating champion <strong>${pl.ghostName}</strong>'s team: ${(pl.ghostTeam || []).join(', ') || '—'}.`, 'system');
      }
    });
    if (window.GameCpu) GameCpu.start();
  }

  function bindGlobalListeners() {
    // Anti-spam helper: disable the clicked button for `ms` ms.
    // GameState.busy + pendingTileResolution catch the long-running cases;
    // this also defends against rapid double-clicks within a single tick.
    const guardSpam = (btn, fn, ms) => {
      if (btn.disabled || btn.dataset._guardLock === '1') return;
      btn.dataset._guardLock = '1';
      btn.disabled = true;
      try { fn(); } finally {
        setTimeout(() => {
          btn.disabled = false;
          delete btn.dataset._guardLock;
        }, ms || 350);
      }
    };
    const rollBtn = document.getElementById('rollMoveBtn');
    rollBtn.addEventListener('click', () => guardSpam(rollBtn, () => GameGame.rollAndMove()));
    document.querySelectorAll('#manualDiceRow .dice-btn').forEach(btn => {
      btn.addEventListener('click', () => guardSpam(btn, () => GameGame.rollAndMove(Number(btn.dataset.roll))));
    });
    const endBtn = document.getElementById('endTurnBtn');
    endBtn.addEventListener('click', () => guardSpam(endBtn, () => GameGame.endTurn()));
    document.getElementById('saveBtn').addEventListener('click', () => {
      GameState.save();
      GameUI.log('Game saved.', 'system');
    });
    const shopBtn = document.getElementById('shopBtn');
    if (shopBtn) shopBtn.addEventListener('click', () => { if (GameUI.showShop) GameUI.showShop(); });
    document.getElementById('audioToggle').addEventListener('click', () => {
      GameState.options.music = !GameState.options.music;
      if (!GameState.options.music) GameAudio.stop();
      else GameAudio.playArea(GameData.getTile(GameState.currentPlayer().tile).area);
    });
    document.getElementById('quitBtn').addEventListener('click', () => {
      if (confirm('Quit to setup screen? Game will be saved.')) {
        GameState.save();
        location.reload();
      }
    });

    // Fullscreen toggle — works in topbar AND setup screen
    const toggleFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen).call(el).catch(() => {});
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen).call(document).catch(() => {});
      }
    };
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    const setupFsBtn = document.getElementById('setupFullscreenBtn');
    if (setupFsBtn) setupFsBtn.addEventListener('click', toggleFullscreen);

    // Tap the board (outside tiles) to roll the dice. Same guards as the
    // big Roll button — busy / pending tile resolution / any modal open.
    const boardPane = document.getElementById('boardPane');
    boardPane.addEventListener('click', (e) => {
      // Ignore taps on tiles (they have their own handlers) or on the SVG
      // tile groups.
      if (e.target.closest('.board-tile, .token, button')) return;
      const rollBtn = document.getElementById('rollMoveBtn');
      if (!rollBtn || rollBtn.disabled) return;
      if (GameState.busy || GameState.pendingTileResolution) return;
      const anyModalOpen = Array.from(document.querySelectorAll('.modal'))
        .some(m => !m.hidden);
      if (anyModalOpen) return;
      rollBtn.click();
    });
  }

  // Expose for tile clicks if needed
  window.onTileClick = function (tile) {
    // Gym tile: rich leader preview (sprite + team in battle order + meta)
    if (tile.type === 'gym' && tile.leader && GameUI.showGymPreview) {
      GameUI.showGymPreview(tile);
      return;
    }
    // Otherwise just info hint
    const html = `
      <div><strong>Tile ${tile.i}</strong> · ${GameData.getArea(tile.area).name}</div>
      ${tile.speciesId ? `<div>Specific: ${GameData.getPokemon(tile.speciesId).name}</div>` : ''}
    `;
    GameUI.showTileInfo(tile, html);
  };

})();
