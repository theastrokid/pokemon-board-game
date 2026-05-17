// =============================================================
// encounter.js  ·  wild Pokemon encounter flow
// =============================================================
window.GameEncounter = {};

GameEncounter.start = function (speciesId, areaId, opts) {
  opts = opts || {};
  const ctx = {
    area: areaId,
    title: opts.title,
    onCaught: opts.onCaught,
    onMissed: opts.onMissed,
    attemptsUsed: 0,
    maxAttempts: 3,
  };
  GameUI.showEncounter(speciesId, ctx);
};

GameEncounter.resolveCatch = function (speciesId, ballId, roll, ctx) {
  // Defensive: refuse re-entry if a previous throw already resolved this
  // encounter. Without this, a queued click can sneak a second catch through.
  if (ctx.resolved) return;
  ctx.resolved = true;
  const player = GameState.currentPlayer();
  const area = GameData.getArea(ctx.area);
  const threshold = area.catchRates[ballId];
  const ball = GameData.getPokeball(ballId);
  const poke = GameData.getPokemon(speciesId);
  if (ballId !== 'masterball') ctx.attemptsUsed = (ctx.attemptsUsed || 0) + 1;
  const success = ballId === 'masterball' ? true : roll <= threshold;

  // Consume the ball
  GameState.consumeBall(player, ballId);

  const resultEl = GameUI.el('encounterResult');

  GameUI.finishBallAnimation(success);
  if (success) {
    GameAudio.sfx.catch();
    resultEl.className = 'encounter-result caught';
    if (ballId === 'masterball') {
      resultEl.textContent = `Caught! Master Ball — guaranteed capture.`;
      GameUI.log(`<span class="actor">${player.name}</span> caught <strong>${poke.name}</strong> with a Master Ball (guaranteed).`, 'win');
    } else {
      resultEl.textContent = `Caught! Rolled ${roll}, needed 1-${threshold}.`;
      GameUI.log(`<span class="actor">${player.name}</span> caught <strong>${poke.name}</strong> with a ${ball.name} (rolled ${roll}/1-${threshold}).`, 'win');
    }

    if (player.party.length < 6) {
      GameState.addPokemonToParty(player, speciesId);
      setTimeout(() => {
        GameUI.hideEncounter();
        GameUI.refreshAll();
        if (ctx.onCaught) ctx.onCaught();
        else GameGame.afterTileResolved();
      }, 900);
    } else {
      // Party full, force discard
      resultEl.textContent += ' Party full. Discard a Pokemon to make room (you will gain 1 item + 1 pokeball), or skip.';
      setTimeout(() => {
        GameUI.hideEncounter();
        GameItems.promptDiscardForRoom(speciesId, () => {
          GameUI.refreshAll();
          if (ctx.onCaught) ctx.onCaught();
          else GameGame.afterTileResolved();
        }, () => {
          // skip keeping caught pokemon
          GameUI.log(`<span class="actor">${player.name}</span> released <strong>${poke.name}</strong> (party full).`, 'lose');
          GameUI.refreshAll();
          if (ctx.onMissed) ctx.onMissed();
          else GameGame.afterTileResolved();
        });
      }, 1200);
    }
  } else {
    GameAudio.sfx.miss();
    resultEl.className = 'encounter-result missed';
    resultEl.textContent = `Missed! Rolled ${roll}, needed 1-${threshold}. The ${ball.name} was consumed.`;
    GameUI.log(`<span class="actor">${player.name}</span> threw a ${ball.name} at <strong>${poke.name}</strong> but missed (rolled ${roll}/1-${threshold}).`, 'lose');
    GameUI.renderInventory();

    // Allow another throw if (a) they still have balls AND (b) under 3 attempts
    setTimeout(() => {
      const hasMore = Object.values(player.balls).some(v => v > 0);
      const attemptsLeft = (ctx.maxAttempts || 3) - (ctx.attemptsUsed || 0);
      if (!hasMore) {
        resultEl.textContent += ' No more balls. The wild Pokemon escaped.';
        GameUI.log(`Out of balls. <strong>${poke.name}</strong> escaped.`, 'lose');
        // Final escape — play run-off animation
        GameUI.runWildEscapeAnimation();
        setTimeout(() => {
          GameUI.hideEncounter();
          if (ctx.onMissed) ctx.onMissed(); else GameGame.afterTileResolved();
        }, 1200);
      } else if (attemptsLeft <= 0) {
        resultEl.textContent += ` Out of attempts (3 max). The wild ${poke.name} ran away.`;
        GameUI.log(`<strong>${poke.name}</strong> ran away after 3 failed attempts.`, 'lose');
        // 3rd unsuccessful attempt — play run-off animation
        GameUI.runWildEscapeAnimation();
        setTimeout(() => {
          GameUI.hideEncounter();
          if (ctx.onMissed) ctx.onMissed(); else GameGame.afterTileResolved();
        }, 1400);
      } else {
        // Show remaining attempts and re-enable the ball picker
        resultEl.textContent += ` Attempts left: ${attemptsLeft}/3.`;
        // Re-auto-select most-populous ball
        let autoSelected = null;
        let maxCount = 0;
        ['pokeball', 'greatball', 'ultraball'].forEach(bid => {
          const c = player.balls[bid] || 0;
          if (c > maxCount) { maxCount = c; autoSelected = bid; }
        });
        if (!autoSelected && (player.balls.masterball || 0) > 0) autoSelected = 'masterball';
        GameState.pendingEncounterBall = (autoSelected && autoSelected !== 'masterball') ? autoSelected : null;
        document.querySelectorAll('#ballRow .ball-btn').forEach(b => {
          b.classList.remove('selected');
          const bid = b.dataset.ball;
          b.disabled = !player.balls[bid];
          const ball = GameData.getPokeball(bid);
          b.innerHTML = `<span class="ball-icon"></span> ${ball.name} (${player.balls[bid] || 0})`;
          if (bid === autoSelected && bid !== 'masterball') b.classList.add('selected');
        });
        // Unlock for the next throw — a fresh attempt is now allowed.
        ctx.resolved = false;
        ctx.inFlight = false;
        GameUI.el('encounterAutoRollBtn').disabled = false;
        GameUI.el('encounterFleeBtn').disabled = false;
      }
    }, 900);
  }
};
