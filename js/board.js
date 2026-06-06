// =============================================================
// board.js  ·  renders the board SVG over the real board image
// Coordinates are in 1200x1200 image-pixel space. The SVG
// viewBox matches the image so tile markers sit on top of the
// real tiles in the photo.
//
// Tile positions are approximate first-draft mappings. Use the
// "Calibrate" toggle in-game to drag markers onto the correct
// tile in the photo and save back to board.json.
// =============================================================
window.GameBoard = {
  svg: null,
  tilePositions: {},
  branchPositions: {},
  debugMode: false,
  calibrateMode: false,
  draggingTile: null,
};

const TILE_SIZE = 70;
const IMG_SIZE = 1200;
const TILE_PAD = 6;

// Approximate layout matching the real 1200x1200 board image.
// Tiles are placed in zones that correspond to the photo, but exact
// positions need calibration. Use the in-game Calibrate mode to drag
// them and export updated positions.
//
// Coordinates are in image pixel space (0-1200, 0-1200). The SVG
// viewBox matches so they overlay the image cleanly.
GameBoard.layout = function () {
  // Allow board.json to override positions if user has calibrated.
  if (GameData.board.tilePositions) {
    GameBoard.tilePositions = GameData.board.tilePositions;
    return;
  }

  const pos = {};

  // ===== PALLET TOWN (bottom strip) — tiles 0..26 =====
  // Bottom-most row: tiles 0..12 going left to right
  for (let n = 0; n <= 12; n++) {
    pos[n] = { x: 85 + n * 86, y: 1130 };
  }
  // Turn up the right edge
  pos[13] = { x: 1130, y: 1045 };
  pos[14] = { x: 1130, y: 960 };
  // Pallet-Town row above (going left): tiles 15..23
  for (let n = 15; n <= 23; n++) {
    pos[n] = { x: 1130 - (n - 14) * 86, y: 960 };
  }
  pos[24] = { x: 280, y: 960 };
  pos[25] = { x: 195, y: 960 };
  // Brock gym at left edge of Pallet/Seafoam border
  pos[26] = { x: 110, y: 960 };

  // ===== SEAFOAM ISLANDS — tiles 27..50 =====
  // Bottom row of Seafoam going right
  pos[27] = { x: 195, y: 870 };
  pos[28] = { x: 280, y: 870 };
  pos[29] = { x: 365, y: 870 };
  pos[30] = { x: 450, y: 870 };
  pos[31] = { x: 535, y: 870 };
  pos[32] = { x: 620, y: 870 };
  // Misty's gym is mid-board
  pos[33] = { x: 705, y: 870 };  // pokecentre near misty
  pos[34] = { x: 790, y: 870 };  // fainted near misty (mid-board fainted)
  // Branch at 35: choose lower (more pokemon) or upper (items/master)
  pos[35] = { x: 875, y: 870 };
  // Lower branch 36..40 going up-right
  pos[36] = { x: 960, y: 870 };
  pos[37] = { x: 1045, y: 870 };
  pos[38] = { x: 1130, y: 870 };  // snorlax
  pos[39] = { x: 1130, y: 780 };
  pos[40] = { x: 1045, y: 780 };  // joins next at 46
  // Upper branch 41..45
  pos[41] = { x: 960, y: 780 };
  pos[42] = { x: 875, y: 780 };
  pos[43] = { x: 790, y: 780 };  // master ball
  pos[44] = { x: 705, y: 780 };
  pos[45] = { x: 620, y: 780 };  // joins next at 46
  // Converge
  pos[46] = { x: 535, y: 780 };
  pos[47] = { x: 450, y: 780 };
  pos[48] = { x: 365, y: 780 };  // lapras specific
  pos[49] = { x: 280, y: 780 };
  pos[50] = { x: 195, y: 780 };  // misty gym

  // ===== SAFARI ZONE — tiles 51..70 =====
  // Going up through the desert
  pos[51] = { x: 195, y: 690 };
  pos[52] = { x: 280, y: 690 };
  pos[53] = { x: 365, y: 690 };
  pos[54] = { x: 450, y: 690 };  // kangaskhan specific
  pos[55] = { x: 535, y: 690 };
  pos[56] = { x: 620, y: 690 };
  pos[57] = { x: 705, y: 690 };  // trade before blaine
  // Branch at 58
  pos[58] = { x: 790, y: 690 };
  // Lower (faintsville) 59..63
  pos[59] = { x: 875, y: 690 };  // fainted
  pos[60] = { x: 960, y: 690 };  // master ball
  pos[61] = { x: 1045, y: 690 };  // fainted
  pos[62] = { x: 1130, y: 690 };
  pos[63] = { x: 1130, y: 600 };
  // Upper 64..67
  pos[64] = { x: 875, y: 600 };
  pos[65] = { x: 960, y: 600 };
  pos[66] = { x: 1045, y: 600 };
  pos[67] = { x: 1130, y: 510 };  // scyther specific
  // Converge
  pos[68] = { x: 1045, y: 510 };
  pos[69] = { x: 960, y: 510 };  // pokecentre
  pos[70] = { x: 875, y: 510 };  // blaine gym

  // ===== ANCIENT TEMPLE — tiles 71..94 =====
  // Working backward (right to left, top)
  pos[71] = { x: 790, y: 510 };
  pos[72] = { x: 705, y: 510 };  // battle
  pos[73] = { x: 620, y: 510 };
  pos[74] = { x: 535, y: 510 };  // item
  pos[75] = { x: 450, y: 510 };
  pos[76] = { x: 365, y: 510 };  // moltres specific
  pos[77] = { x: 280, y: 510 };  // pokeball
  // Branch at 78
  pos[78] = { x: 195, y: 420 };
  // Lower 79..82
  pos[79] = { x: 280, y: 420 };  // zapdos specific
  pos[80] = { x: 365, y: 420 };  // battle
  pos[81] = { x: 450, y: 420 };  // articuno specific
  pos[82] = { x: 535, y: 420 };
  // Upper 83..86
  pos[83] = { x: 280, y: 330 };  // master ball
  pos[84] = { x: 365, y: 330 };  // battle
  pos[85] = { x: 450, y: 330 };  // fainted
  pos[86] = { x: 535, y: 330 };
  // Converge at 87
  pos[87] = { x: 620, y: 330 };  // mewtwo specific
  pos[88] = { x: 705, y: 330 };
  pos[89] = { x: 790, y: 330 };  // item
  pos[90] = { x: 875, y: 330 };
  pos[91] = { x: 960, y: 330 };  // battle
  pos[92] = { x: 1045, y: 330 };
  pos[93] = { x: 1045, y: 195 };  // pokecentre near giovanni
  pos[94] = { x: 1130, y: 110 };  // giovanni gym at top-right

  GameBoard.tilePositions = pos;
};

GameBoard.tileIconForType = function (tile) {
  const map = {
    pokemon: '?',
    item: '★',
    pokeball: '●',
    trade: '⇄',
    gym: 'G',
    pokecentre: '+',
    fainted: '☠',
    masterball: 'M',
    battle: '⚔',
    specific: '✦',
    branch: '⑂',
    start: '▶',
  };
  return map[tile.type] || '·';
};

GameBoard.tileColorForType = function (tile) {
  const area = GameData.getArea(tile.area);
  const baseAreaColor = area.color;
  const typeColors = {
    pokemon: baseAreaColor,
    item: '#4a90e2',
    pokeball: '#e25555',
    trade: '#9b59b6',
    gym: '#cc4422',
    pokecentre: '#22cc66',
    fainted: '#222831',
    masterball: '#7838f8',
    battle: '#d65b3a',
    specific: '#facc15',
    branch: '#6b46c1',
    start: '#10b981',
  };
  return typeColors[tile.type] || baseAreaColor;
};

GameBoard.render = function () {
  const svg = document.getElementById('boardSvg');
  GameBoard.svg = svg;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${IMG_SIZE} ${IMG_SIZE}`);
  GameBoard.layout();

  // Defs (filters and gradients)
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="tileShadow"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-opacity="0.4" /></filter>
    <filter id="tileGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  `;
  svg.appendChild(defs);

  // Background board image
  const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  img.setAttribute('href', 'assets/board-1200.png');
  img.setAttribute('x', 0);
  img.setAttribute('y', 0);
  img.setAttribute('width', IMG_SIZE);
  img.setAttribute('height', IMG_SIZE);
  img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.appendChild(img);

  // Decorative animated sprites overlay (placed at empty spots in board art).
  // Always animating at native speed, sized 60% of the previous default (~48px).
  if (Array.isArray(GameData.board.decorativeSprites)) {
    const decoLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    decoLayer.setAttribute('class', 'deco-layer');
    GameData.board.decorativeSprites.forEach((s, idx) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'deco-sprite' + (GameBoard.calibrateMode ? ' calibrate' : ''));
      g.setAttribute('data-deco-idx', idx);
      const size = s.size || 48;
      g.setAttribute('transform', `translate(${s.x}, ${s.y})`);

      const sp = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      sp.setAttribute('href', GameData.spriteFront(s.speciesId));
      sp.setAttribute('x', -size / 2);
      sp.setAttribute('y', -size / 2);
      sp.setAttribute('width', size);
      sp.setAttribute('height', size);
      sp.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      sp.setAttribute('style', 'image-rendering: pixelated; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));');
      g.appendChild(sp);

      // Edit-mode handle (dashed outline + species ID badge)
      if (GameBoard.calibrateMode) {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', -size / 2);
        handle.setAttribute('y', -size / 2);
        handle.setAttribute('width', size);
        handle.setAttribute('height', size);
        handle.setAttribute('fill', 'rgba(255, 203, 5, 0.1)');
        handle.setAttribute('stroke', '#ffcb05');
        handle.setAttribute('stroke-width', 1);
        handle.setAttribute('stroke-dasharray', '4 3');
        g.appendChild(handle);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', -size / 2 + 2);
        label.setAttribute('y', -size / 2 + 12);
        label.setAttribute('class', 'board-tile-label');
        label.setAttribute('font-size', '10');
        const p = GameData.getPokemon(s.speciesId);
        label.textContent = `${s.speciesId} ${p ? p.name : ''}`;
        g.appendChild(label);

        g.addEventListener('mousedown', (e) => GameBoard.startDecoDrag(e, idx));
      } else {
        sp.setAttribute('pointer-events', 'none');
      }
      decoLayer.appendChild(g);
    });
    svg.appendChild(decoLayer);
  }

  // Path lines between sequential tiles (subtle, only in debug)
  if (GameBoard.debugMode) {
    GameData.board.tiles.forEach((tile) => {
      const a = GameBoard.tilePositions[tile.i];
      if (!a) return;
      if (tile.type === 'branch') {
        tile.branchTo.forEach(b => {
          const bp = GameBoard.tilePositions[b];
          if (bp) GameBoard._drawLine(a, bp);
        });
      } else {
        const nextIdx = tile.joinNext != null ? tile.joinNext : tile.i + 1;
        const np = GameBoard.tilePositions[nextIdx];
        if (np) GameBoard._drawLine(a, np);
      }
    });
  }

  // Tiles overlay (semi-transparent markers on top of photo)
  GameData.board.tiles.forEach(tile => {
    const pos = GameBoard.tilePositions[tile.i];
    if (!pos) return;
    const isBranch = Array.isArray(tile.branchTo) && tile.branchTo.length;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'board-tile' + (GameBoard.calibrateMode ? ' calibrate' : '') + (isBranch ? ' branch-tile' : ''));
    g.setAttribute('data-tile-i', tile.i);
    g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

    if (isBranch) {
      const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      pulse.setAttribute('r', 28);
      pulse.setAttribute('class', 'branch-pulse');
      g.appendChild(pulse);
    }

    // Tile markers are now invisible by default — the painted board art
    // already shows tile types. Branch tiles and gyms keep a subtle glow so
    // players can spot them. No numbered overlays.
    if (isBranch) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 18);
      circle.setAttribute('fill', '#b388ff');
      circle.setAttribute('opacity', 0.18);
      circle.setAttribute('stroke', '#d8c2ff');
      circle.setAttribute('stroke-width', 1.5);
      g.appendChild(circle);
    } else if (tile.type === 'gym') {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 20);
      circle.setAttribute('fill', GameBoard.tileColorForType(tile));
      circle.setAttribute('opacity', 0.0);
      circle.setAttribute('stroke', '#ffcb05');
      circle.setAttribute('stroke-width', 1.5);
      circle.setAttribute('stroke-opacity', 0.55);
      g.appendChild(circle);
    }

    // Snorlax-specific tiles: draw the Snorlax sprite directly on the square
    // so players can SEE the sleeping blocker (matches the iconic "Snorlax
    // blocks the route" moment in the original games).
    if (tile.type === 'specific' && tile.speciesId === 143) {
      const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      sprite.setAttribute('href', GameData.spriteStatic(143));
      sprite.setAttribute('x', -22);
      sprite.setAttribute('y', -22);
      sprite.setAttribute('width', 44);
      sprite.setAttribute('height', 44);
      sprite.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      sprite.setAttribute('class', 'snorlax-tile-sprite');
      sprite.setAttribute('style', 'image-rendering:pixelated;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));pointer-events:none;');
      g.appendChild(sprite);
    }

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      if (GameBoard.calibrateMode) return; // drag handled separately
      if (window.onTileClick) window.onTileClick(tile);
    });

    if (GameBoard.calibrateMode) {
      g.addEventListener('mousedown', (e) => GameBoard.startDrag(e, tile));
    }

    svg.appendChild(g);
  });

  // Legendary spawn overlay layer (sits between tiles and tokens so the
  // player token can move over it without z-fighting).
  const legendaryLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  legendaryLayer.setAttribute('id', 'legendaryLayer');
  svg.appendChild(legendaryLayer);

  // Tokens layer (added on top, updated separately)
  const tokenLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  tokenLayer.setAttribute('id', 'tokenLayer');
  svg.appendChild(tokenLayer);
  GameBoard.renderLegendaryOverlay();

  // Calibrate mode SVG-wide listeners
  if (GameBoard.calibrateMode) {
    svg.addEventListener('mousemove', GameBoard.dragMove);
    svg.addEventListener('mouseup', GameBoard.endDrag);
    svg.addEventListener('click', GameBoard.handleSvgClick);
    svg.style.cursor = 'crosshair';
  } else {
    svg.style.cursor = '';
  }

  GameBoard.renderTokens();
};

GameBoard.tileLabelForType = function (tile) {
  const map = {
    pokemon: 'WILD',
    item: 'ITEM',
    pokeball: 'BALL',
    trade: 'TRADE',
    gym: tile.leader ? GameData.getGymLeader(tile.leader).name.toUpperCase() : 'GYM',
    pokecentre: 'PC',
    fainted: 'FAINT',
    masterball: 'MSTR',
    battle: 'PVP',
    specific: tile.speciesId ? GameData.getPokemon(tile.speciesId).name.slice(0, 6) : 'SPEC',
    branch: 'BRANCH',
    start: 'START',
  };
  return map[tile.type] || tile.type;
};

// ============== CALIBRATE / EDITOR MODE ==============
GameBoard.toggleDebug = function () {
  GameBoard.debugMode = !GameBoard.debugMode;
  GameBoard.render();
};

GameBoard.toggleCalibrate = function () {
  GameBoard.calibrateMode = !GameBoard.calibrateMode;
  if (GameBoard.calibrateMode) GameBoard.debugMode = true;
  GameBoard.render();
  GameBoard.updateBanner();
};

GameBoard.updateBanner = function () {
  let banner = document.getElementById('calibrateBanner');
  if (!GameBoard.calibrateMode) {
    if (banner) banner.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'calibrateBanner';
    banner.className = 'calibrate-banner';
    document.getElementById('boardPane').appendChild(banner);
  }
  banner.innerHTML = `
    <strong>Editor mode ON</strong><br/>
    <kbd>drag</kbd> tile or sprite to move<br/>
    <kbd>click</kbd> tile to edit type / branches<br/>
    <kbd>click</kbd> sprite to change Pokemon or delete<br/>
    <kbd>shift+click</kbd> empty area to add tile<br/>
    <kbd>⤓</kbd> button exports full board.json
  `;
};

GameBoard.startDrag = function (e, tile) {
  e.preventDefault();
  e.stopPropagation();
  GameBoard.draggingTile = tile;
  GameBoard.dragMoved = false;
};

GameBoard.startDecoDrag = function (e, idx) {
  e.preventDefault();
  e.stopPropagation();
  GameBoard.draggingDeco = idx;
  GameBoard.dragMoved = false;
};

GameBoard.dragMove = function (e) {
  if (GameBoard.draggingTile) {
    const pt = GameBoard.svgPoint(e);
    GameBoard.tilePositions[GameBoard.draggingTile.i] = { x: Math.round(pt.x), y: Math.round(pt.y) };
    GameBoard.dragMoved = true;
    const g = document.querySelector(`.board-tile[data-tile-i="${GameBoard.draggingTile.i}"]`);
    if (g) g.setAttribute('transform', `translate(${pt.x}, ${pt.y})`);
  } else if (GameBoard.draggingDeco != null) {
    const pt = GameBoard.svgPoint(e);
    const s = GameData.board.decorativeSprites[GameBoard.draggingDeco];
    s.x = Math.round(pt.x);
    s.y = Math.round(pt.y);
    GameBoard.dragMoved = true;
    const g = document.querySelector(`.deco-sprite[data-deco-idx="${GameBoard.draggingDeco}"]`);
    if (g) g.setAttribute('transform', `translate(${s.x}, ${s.y})`);
  }
};

GameBoard.endDrag = function (e) {
  if (GameBoard.draggingTile) {
    const wasDrag = GameBoard.dragMoved;
    const tile = GameBoard.draggingTile;
    GameBoard.draggingTile = null;
    GameBoard.dragMoved = false;
    if (!wasDrag) GameBoard.openTileEditor(tile);
    return;
  }
  if (GameBoard.draggingDeco != null) {
    const wasDrag = GameBoard.dragMoved;
    const idx = GameBoard.draggingDeco;
    GameBoard.draggingDeco = null;
    GameBoard.dragMoved = false;
    if (!wasDrag) GameBoard.openDecoEditor(idx);
  }
};

GameBoard.openDecoEditor = function (idx) {
  const s = GameData.board.decorativeSprites[idx];
  if (!s) return;
  const newId = prompt(`Decorative sprite #${idx}\nCurrent: ${s.speciesId} (${GameData.getPokemon(s.speciesId)?.name || '?'})\n\nEnter new Pokemon ID (1-251), or 'delete' to remove, or blank to keep.`, s.speciesId);
  if (newId == null) return;
  if (newId.toLowerCase() === 'delete') {
    GameData.board.decorativeSprites.splice(idx, 1);
    GameBoard.render();
    return;
  }
  const id = parseInt(newId, 10);
  if (!isNaN(id) && GameData.getPokemon(id)) {
    s.speciesId = id;
    GameBoard.render();
  }
};

GameBoard.handleSvgClick = function (e) {
  if (!GameBoard.calibrateMode) return;
  if (!e.shiftKey) return;
  // Only fire if click was on the SVG background, not a tile
  if (e.target.closest('.board-tile')) return;
  const pt = GameBoard.svgPoint(e);
  GameBoard.addNewTile(Math.round(pt.x), Math.round(pt.y));
};

GameBoard.svgPoint = function (e) {
  const svg = GameBoard.svg;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
};

GameBoard.addNewTile = function (x, y) {
  // Pick the next free tile ID
  const ids = GameData.board.tiles.map(t => t.i);
  const newId = Math.max(...ids) + 1;
  // Default area: closest to existing tiles by y
  let area = 'pallet';
  if (y < 320) area = 'temple';
  else if (y < 540) area = 'safari';
  else if (y < 880) area = 'seafoam';
  const newTile = { i: newId, area, type: 'pokemon' };
  GameData.board.tiles.push(newTile);
  GameBoard.tilePositions[newId] = { x, y };
  GameBoard.render();
  // Open editor for the new tile
  GameBoard.openTileEditor(newTile);
};

GameBoard.openTileEditor = function (tile) {
  const modal = document.getElementById('tileEditModal');
  modal.hidden = false;
  document.getElementById('tileEditTitle').textContent = `Tile ${tile.i}`;
  document.getElementById('tileEditHint').textContent = `Drag this modal closed without saving to cancel.`;

  const typeSel = document.getElementById('tileEditType');
  const areaSel = document.getElementById('tileEditArea');
  const speciesSel = document.getElementById('tileEditSpecies');
  const leaderSel = document.getElementById('tileEditLeader');
  const branchToInp = document.getElementById('tileEditBranchTo');
  const branchLabelsInp = document.getElementById('tileEditBranchLabels');
  const joinNextInp = document.getElementById('tileEditJoinNext');
  const xInp = document.getElementById('tileEditX');
  const yInp = document.getElementById('tileEditY');

  // Populate species dropdown if not yet
  if (speciesSel.options.length === 0) {
    Object.entries(GameData.pokemon).forEach(([id, p]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${id}. ${p.name}`;
      speciesSel.appendChild(opt);
    });
  }

  typeSel.value = tile.type;
  areaSel.value = tile.area;
  speciesSel.value = tile.speciesId || '';
  leaderSel.value = tile.leader || 'brock';
  branchToInp.value = (tile.branchTo || []).join(', ');
  branchLabelsInp.value = (tile.labels || []).join(', ');
  joinNextInp.value = tile.joinNext != null ? tile.joinNext : '';
  const pos = GameBoard.tilePositions[tile.i] || { x: 0, y: 0 };
  xInp.value = pos.x;
  yInp.value = pos.y;

  GameBoard.refreshConditionalRows(typeSel.value);
  typeSel.onchange = () => GameBoard.refreshConditionalRows(typeSel.value);

  document.getElementById('tileEditSave').onclick = () => {
    tile.type = typeSel.value;
    tile.area = areaSel.value;
    if (tile.type === 'specific') tile.speciesId = Number(speciesSel.value);
    else delete tile.speciesId;
    if (tile.type === 'gym') tile.leader = leaderSel.value;
    else delete tile.leader;
    if (tile.type === 'branch') {
      tile.branchTo = branchToInp.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const labels = branchLabelsInp.value.split(',').map(s => s.trim()).filter(Boolean);
      if (labels.length) tile.labels = labels;
    } else {
      delete tile.branchTo;
      delete tile.labels;
    }
    const jn = parseInt(joinNextInp.value, 10);
    if (!isNaN(jn)) tile.joinNext = jn; else delete tile.joinNext;
    GameBoard.tilePositions[tile.i] = { x: Number(xInp.value), y: Number(yInp.value) };
    modal.hidden = true;
    GameBoard.render();
  };

  document.getElementById('tileEditDelete').onclick = () => {
    if (!confirm(`Delete tile ${tile.i}?`)) return;
    GameData.board.tiles = GameData.board.tiles.filter(t => t.i !== tile.i);
    delete GameBoard.tilePositions[tile.i];
    modal.hidden = true;
    GameBoard.render();
  };

  document.getElementById('tileEditCancel').onclick = () => {
    modal.hidden = true;
  };
};

GameBoard.refreshConditionalRows = function (type) {
  document.getElementById('tileEditSpeciesRow').hidden = type !== 'specific';
  document.getElementById('tileEditLeaderRow').hidden = type !== 'gym';
  document.getElementById('tileEditBranchRow').hidden = type !== 'branch';
  document.getElementById('tileEditBranchLabelsRow').hidden = type !== 'branch';
};

GameBoard.exportPositions = function () {
  // Export full board.json including decorativeSprites
  const board = {
    _note: GameData.board._note,
    areas: GameData.board.areas,
    gymLeaders: GameData.board.gymLeaders,
    tiles: GameData.board.tiles,
    tilePositions: GameBoard.tilePositions,
    decorativeSprites: GameData.board.decorativeSprites,
  };
  const json = JSON.stringify(board, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'board.json';
  a.click();
  URL.revokeObjectURL(url);
  return json;
};

GameBoard._drawLine = function (a, b) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', a.x);
  l.setAttribute('y1', a.y);
  l.setAttribute('x2', b.x);
  l.setAttribute('y2', b.y);
  l.setAttribute('class', 'board-path');
  GameBoard.svg.appendChild(l);
};

// Render (or clear) the legendary spawn overlay — a glowing sprite floating
// above the affected tile with a pulse animation. Called from endTurn after
// spawn checks AND when a legendary is consumed.
GameBoard.renderLegendaryOverlay = function () {
  const layer = document.getElementById('legendaryLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const spawn = GameState.legendarySpawn;
  if (!spawn) return;
  const pos = GameBoard.tilePositions[spawn.tileIdx];
  if (!pos) return;
  const ns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('class', 'legendary-overlay');
  group.setAttribute('transform', `translate(${pos.x}, ${pos.y - 40})`);
  // Pulsing aura
  const aura = document.createElementNS(ns, 'circle');
  aura.setAttribute('r', '36');
  aura.setAttribute('fill', 'url(#legendaryAura)');
  aura.setAttribute('class', 'legendary-aura');
  group.appendChild(aura);
  // Sprite
  const img = document.createElementNS(ns, 'image');
  img.setAttribute('href', GameData.spriteFront(spawn.speciesId));
  img.setAttribute('x', '-30'); img.setAttribute('y', '-30');
  img.setAttribute('width', '60'); img.setAttribute('height', '60');
  img.setAttribute('class', 'legendary-sprite');
  img.setAttribute('style', 'image-rendering:pixelated;');
  group.appendChild(img);
  // Badge
  const badge = document.createElementNS(ns, 'text');
  badge.setAttribute('x', '0'); badge.setAttribute('y', '34');
  badge.setAttribute('text-anchor', 'middle');
  badge.setAttribute('class', 'legendary-badge');
  badge.setAttribute('fill', '#ffd54a');
  badge.setAttribute('style', 'font-size:11px;font-weight:bold;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.9));');
  const turnsLeft = Math.max(0, spawn.expiresAtTurn - GameState.turnCount + 1);
  badge.textContent = `★ LEGENDARY · ${turnsLeft}T`;
  group.appendChild(badge);
  // Ensure aura gradient defs exist
  let defs = layer.ownerSVGElement.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(ns, 'defs');
    layer.ownerSVGElement.insertBefore(defs, layer.ownerSVGElement.firstChild);
  }
  if (!defs.querySelector('#legendaryAura')) {
    const grad = document.createElementNS(ns, 'radialGradient');
    grad.setAttribute('id', 'legendaryAura');
    grad.innerHTML = '<stop offset="0%" stop-color="#ffd54a" stop-opacity="0.85"/><stop offset="60%" stop-color="#ff9d00" stop-opacity="0.4"/><stop offset="100%" stop-color="#ff9d00" stop-opacity="0"/>';
    defs.appendChild(grad);
  }
  layer.appendChild(group);
};

GameBoard.renderTokens = function (opts) {
  opts = opts || {};
  const layer = document.getElementById('tokenLayer');
  if (!layer) return;

  // Build the desired set of token configs
  const groups = {};
  GameState.players.forEach(p => {
    if (!groups[p.tile]) groups[p.tile] = [];
    groups[p.tile].push(p);
  });
  const desired = {};
  Object.entries(groups).forEach(([tileI, players]) => {
    const pos = GameBoard.tilePositions[tileI];
    if (!pos) return;
    players.forEach((p, i) => {
      const angle = (i / Math.max(players.length, 1)) * 2 * Math.PI;
      const r = players.length > 1 ? 22 : 0;
      desired[p.id] = {
        player: p,
        cx: pos.x + Math.cos(angle) * r,
        cy: pos.y + Math.sin(angle) * r,
      };
    });
  });

  // Update or create tokens in place — preserves CSS transitions so movement animates
  GameState.players.forEach(p => {
    const cfg = desired[p.id];
    if (!cfg) return;
    let g = layer.querySelector(`[data-player-id="${p.id}"]`);
    const isActive = (p === GameState.currentPlayer());
    if (!g) {
      g = GameBoard._buildToken(p, isActive);
      layer.appendChild(g);
    } else {
      // Update active class if it changed
      const wasActive = g.classList.contains('token-active');
      if (wasActive !== isActive) {
        g.remove();
        g = GameBoard._buildToken(p, isActive);
        layer.appendChild(g);
      }
    }
    g.setAttribute('transform', `translate(${cfg.cx}, ${cfg.cy})`);
    if (opts.hop && isActive) {
      const inner = g.querySelector('.token-inner');
      if (inner) {
        inner.classList.remove('token-hop');
        void inner.getBoundingClientRect(); // force reflow to restart anim
        inner.classList.add('token-hop');
      }
    }
  });

  // Remove tokens for players no longer present
  Array.from(layer.children).forEach(child => {
    const pid = child.getAttribute('data-player-id');
    if (pid && !desired[pid]) child.remove();
  });
};

GameBoard._buildToken = function (p, isActive) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'token' + (isActive ? ' token-active' : ''));
  g.setAttribute('data-player-id', p.id);

  const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  inner.setAttribute('class', 'token-inner');

  const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  disc.setAttribute('r', 22);
  disc.setAttribute('fill', p.color);
  disc.setAttribute('stroke', isActive ? '#ffcb05' : '#fff');
  disc.setAttribute('stroke-width', isActive ? 3 : 2);
  disc.setAttribute('opacity', 0.92);
  inner.appendChild(disc);

  if (p.trainerSprite) {
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('href', `sprites/trainers/${p.trainerSprite}.png`);
    img.setAttribute('x', -20);
    img.setAttribute('y', -20);
    img.setAttribute('width', 40);
    img.setAttribute('height', 40);
    img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    img.setAttribute('style', 'image-rendering: pixelated; pointer-events: none;');
    inner.appendChild(img);
  } else {
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('y', 6);
    label.setAttribute('class', 'token-label');
    label.setAttribute('font-size', '20');
    label.textContent = String(p.idx + 1);
    inner.appendChild(label);
  }

  const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  badge.setAttribute('cx', 17);
  badge.setAttribute('cy', -17);
  badge.setAttribute('r', 8);
  badge.setAttribute('fill', p.color);
  badge.setAttribute('stroke', '#fff');
  badge.setAttribute('stroke-width', 1.5);
  inner.appendChild(badge);

  const badgeNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  badgeNum.setAttribute('x', 17);
  badgeNum.setAttribute('y', -14);
  badgeNum.setAttribute('class', 'token-label');
  badgeNum.setAttribute('font-size', '11');
  badgeNum.setAttribute('font-weight', 'bold');
  badgeNum.textContent = String(p.idx + 1);
  inner.appendChild(badgeNum);

  if (isActive) {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('r', 26);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#ffcb05');
    ring.setAttribute('stroke-width', '3');
    ring.setAttribute('stroke-dasharray', '6 4');
    ring.setAttribute('class', 'token-pulse-ring');
    inner.appendChild(ring);
  }

  g.appendChild(inner);
  return g;
};

// Compute the next tile index given current tile and a "step direction".
// For branches (tiles with branchTo), returns null and caller must choose.
GameBoard.nextTileFrom = function (currentI, branchChoice) {
  const tile = GameData.getTile(currentI);
  if (!tile) return null;
  if (Array.isArray(tile.branchTo) && tile.branchTo.length) {
    if (branchChoice != null) return branchChoice;
    return null;
  }
  if (tile.joinNext != null) return tile.joinNext;
  return currentI + 1;
};

GameBoard.maxTileIndex = function () {
  return GameData.board.tiles[GameData.board.tiles.length - 1].i;
};

// ============== BRANCH PATH PREVIEW / HIGHLIGHT ==============
// Tiles you'd step onto if you take `steps` total steps starting with `firstNextI`.
// Stops early at a gym (absolute stop), the board end, or another branch (can't
// preview past a second fork). The last entry is the tile you'd LAND on.
GameBoard.previewPath = function (firstNextI, steps) {
  const path = [];
  const max = GameBoard.maxTileIndex();
  let cur = firstNextI, left = Math.max(1, steps || 1), guard = 0;
  while (cur != null && left > 0 && guard++ < 80) {
    if (cur > max) { path.push(max); break; }
    path.push(cur);
    left--;
    const t = GameData.getTile(cur);
    if (t && t.type === 'gym') break;                                   // gym = absolute stop
    if (left <= 0) break;
    if (t && Array.isArray(t.branchTo) && t.branchTo.length) break;     // don't preview past another fork
    cur = GameBoard.nextTileFrom(cur);
  }
  return path;
};

GameBoard.clearBranchHighlights = function () {
  const l = document.getElementById('branchHighlightLayer');
  if (l && l.parentNode) l.parentNode.removeChild(l);
};

// paths: [{ tiles:[idx,...], color, label }]. Draws a translucent dot on every
// tile in each path and a bright labelled ring on the landing tile.
GameBoard.highlightBranchPaths = function (paths) {
  GameBoard.clearBranchHighlights();
  const svg = document.getElementById('boardSvg');
  if (!svg || !Array.isArray(paths)) return;
  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(NS, 'g');
  layer.setAttribute('id', 'branchHighlightLayer');
  const posOf = (ti) => GameBoard.tilePositions[ti] || (GameData.board.tilePositions && GameData.board.tilePositions[ti]);
  paths.forEach(p => {
    (p.tiles || []).forEach((ti, idx) => {
      const pos = posOf(ti);
      if (!pos) return;
      const landing = idx === p.tiles.length - 1;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pos.x); c.setAttribute('cy', pos.y);
      c.setAttribute('r', landing ? 30 : 20);
      c.setAttribute('fill', p.color);
      c.setAttribute('fill-opacity', landing ? 0.38 : 0.16);
      c.setAttribute('stroke', p.color);
      c.setAttribute('stroke-width', landing ? 5 : 2.5);
      c.setAttribute('class', 'branch-hl' + (landing ? ' landing' : ''));
      layer.appendChild(c);
      if (landing && p.label) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', pos.x); t.setAttribute('y', pos.y - 40);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'branch-hl-label');
        t.setAttribute('fill', p.color);
        t.textContent = p.label;
        layer.appendChild(t);
      }
    });
  });
  svg.appendChild(layer);
};
