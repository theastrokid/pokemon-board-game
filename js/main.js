// =============================================================
// main.js  ·  entry point. sets up listeners and boots game.
// =============================================================
(async function () {
  await GameData.load();
  GameAudio.init();
  GameState.loadHallOfFame();

  // Starter Pokemon — fixed roster Damon wants
  const STARTER_IDS = [25, 1, 4, 7, 39]; // Pikachu, Bulbasaur, Charmander, Squirtle, Jigglypuff

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

      row.innerHTML = `
        <div class="trainer-row-header">
          <span class="trainer-color" style="background:${colors[i]}"></span>
          <input type="text" class="trainer-name-input" placeholder="Trainer ${i + 1}" value="Trainer ${i + 1}" />
          <label class="cpu-toggle">
            <input type="checkbox" class="cpu-toggle-input" />
            <span class="cpu-toggle-label">🤖 CPU</span>
          </label>
        </div>
        <div class="trainer-pick-section">
          <h4>Sprite</h4>
          <div class="trainer-sprite-grid">${trainerPickerHtml}</div>
        </div>
        <div class="trainer-pick-section">
          <h4>Starter</h4>
          <div class="starter-grid">${starterPickerHtml}</div>
        </div>
      `;
      wrap.appendChild(row);

      // Bind clicks
      row.querySelectorAll('.trainer-sprite-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.trainer-sprite-pick').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          row.dataset.trainer = btn.dataset.trainer;
        });
      });
      row.querySelectorAll('.starter-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.starter-pick').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          row.dataset.starter = btn.dataset.starter;
        });
      });
      // CPU toggle: visual state + label name suggestion
      const cpuInput = row.querySelector('.cpu-toggle-input');
      const nameInput = row.querySelector('.trainer-name-input');
      cpuInput.addEventListener('change', () => {
        row.dataset.cpu = cpuInput.checked ? '1' : '0';
        row.classList.toggle('is-cpu', cpuInput.checked);
        // If the user hasn't customized the name, set a CPU-flavored one.
        if (cpuInput.checked && nameInput.value === `Trainer ${i + 1}`) {
          nameInput.value = `CPU ${i + 1}`;
        } else if (!cpuInput.checked && nameInput.value === `CPU ${i + 1}`) {
          nameInput.value = `Trainer ${i + 1}`;
        }
      });
    }
  }

  function startGame() {
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
      // Starting inventory per Damon's rules
      GameState.giveItem(p, 'potion');
      GameState.giveItem(p, 'potion');
      GameState.giveItem(p, 'super_potion');
      GameState.giveItem(p, 'revive');
      GameState.giveItem(p, 'rare_candy');
      for (let j = 0; j < 5; j++) GameState.giveBall(p, 'pokeball');
      GameState.players.push(p);
    });
    enterGame();
  }

  function enterGame() {
    document.getElementById('setup').hidden = true;
    document.getElementById('game').hidden = false;
    document.getElementById('app').classList.remove('screen-setup');
    GameBoard.render();
    GameGame.start();
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
    // Show tile info as a hint (read only)
    const html = `
      <div><strong>Tile ${tile.i}</strong> · ${GameData.getArea(tile.area).name}</div>
      ${tile.speciesId ? `<div>Specific: ${GameData.getPokemon(tile.speciesId).name}</div>` : ''}
      ${tile.leader ? `<div>Gym Leader: ${GameData.getGymLeader(tile.leader).name}</div>` : ''}
    `;
    GameUI.showTileInfo(tile, html);
  };

})();
