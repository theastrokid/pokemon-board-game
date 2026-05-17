// =============================================================
// audio.js  ·  procedural chiptune music + sfx
// Each region gets a multi-section track (verse / chorus / bridge)
// with melody, harmony, bass, and drum layers that evolve over time.
// Battle music swaps in during fights and the previous track resumes
// when the battle ends.
// =============================================================
window.GameAudio = {
  ctx: null,
  bgEl: null,
  currentTrack: null,
  previousTrack: null,
  musicState: null,
  enabled: true,
};

GameAudio.init = function () {
  GameAudio.bgEl = document.getElementById('bgMusic');
};

GameAudio.ensureCtx = function () {
  if (!GameAudio.ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) GameAudio.ctx = new C();
  }
  return GameAudio.ctx;
};

// ============== NOTE HELPERS ==============
const N = (name, oct) => {
  const names = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return 12 + (oct * 12) + names[name];
};
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Compact note shorthand: "C5:0.5" = C5 for 0.5 beats. "r:1" = rest 1 beat.
const parseNotes = (str) => str.trim().split(/\s+/).map(tok => {
  const [pitch, dur] = tok.split(':');
  const d = parseFloat(dur || '0.5');
  if (pitch === 'r' || pitch === 'R') return { n: 0, d };
  const m = pitch.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!m) return { n: 0, d };
  return { n: N(m[1], parseInt(m[2], 10)), d };
});

// Arpeggio helper: given chord root + type, returns 4 notes
const arpUp = (root, type = 'maj', oct = 4) => {
  const intervals = type === 'min' ? [0, 3, 7, 12] : type === '7' ? [0, 4, 7, 10] : [0, 4, 7, 12];
  return intervals.map(i => N('C', oct) - 60 + root + i + 60);
};

// ============== TRACK DEFINITIONS ==============
// Each track has multiple sections that play in order then loop the whole set.
// Section { bars, melody, harmony, bass, drumPattern }
// Drum patterns are 16-step sequences: K=kick, S=snare, H=hat, .=rest

GameAudio.TRACKS = {

  // ============ PALLET TOWN ============ calm, ethereal, gently playful
  // Soft sine/triangle palette, slow tempo, sparse rim-tap percussion only.
  // Major key with a touch of suspended chords for the ethereal feel.
  pallet: {
    bpm: 88,
    masterGain: 0.05,
    melodyWave: 'sine',
    harmonyWave: 'sine',
    bassWave: 'sine',
    sections: [
      { // A: floating opener
        bars: 4,
        melody: parseNotes('G5:1.5 E5:0.5 C5:2 r:1 A5:1.5 G5:0.5 E5:2 r:1'),
        harmony: parseNotes('C5:2 G4:2 F4:2 C5:2'),
        bass: parseNotes('C3:4 F3:4'),
        drums: '......H.......H.',
      },
      { // B: gentle ascent with arpeggio sparkle
        bars: 4,
        melody: parseNotes('C5:0.5 E5:0.5 G5:0.5 C6:1.5 r:0.5 D6:0.5 C6:0.5 B5:0.5 G5:1.5 r:0.5 A5:0.5 G5:0.5 E5:0.5 C5:1.5 r:0.5'),
        harmony: parseNotes('C4:0.5 E4:0.5 G4:0.5 C5:0.5 G4:0.5 E4:0.5 C4:0.5 G3:0.5 F4:0.5 A4:0.5 C5:0.5 F5:0.5 G4:0.5 B4:0.5 D5:0.5 G5:0.5'),
        bass: parseNotes('C3:2 G2:2 F3:2 G3:2'),
        drums: 'H...H...H...H...',
      },
      { // C: warm playful phrase
        bars: 4,
        melody: parseNotes('E5:1 G5:0.5 A5:0.5 G5:1 E5:1 D5:1 F5:0.5 A5:0.5 G5:1 E5:1'),
        harmony: parseNotes('C5:2 A4:2 G4:2 E5:2'),
        bass: parseNotes('C3:2 A2:2 G3:2 E3:2'),
        drums: '....H.......H...',
      },
      { // D: dreamy resolution with suspended fourth
        bars: 4,
        melody: parseNotes('G5:2 F5:1 E5:1 C5:2 r:1 D5:1 C5:3 r:1'),
        harmony: parseNotes('C5:2 F4:2 G4:2 C5:2'),
        bass: parseNotes('C3:4 G2:4'),
        drums: '......H.......H.',
      },
    ],
  },

  // ============ SEAFOAM ISLANDS ============ mysterious water cave (calm reference)
  seafoam: {
    bpm: 86,
    masterGain: 0.06,
    melodyWave: 'sine',
    harmonyWave: 'sine',
    bassWave: 'sine',
    sections: [
      { // A: descending mystery
        bars: 4,
        melody: parseNotes('A5:1 G5:0.5 E5:0.5 A5:1 r:0.5 C6:1 B5:0.5 G5:0.5 E5:1 r:0.5'),
        harmony: parseNotes('C5:2 B4:2 G4:2 E4:2'),
        bass: parseNotes('A2:2 E3:2 F2:2 C3:2'),
        drums: '......H.......H.',
      },
      { // B: arpeggios up
        bars: 4,
        melody: parseNotes('A4:0.5 C5:0.5 E5:0.5 A5:0.5 E5:0.5 C5:0.5 A4:1 D5:0.5 F5:0.5 A5:0.5 D6:0.5 A5:0.5 F5:0.5 D5:1 E5:0.5 G5:0.5 B5:0.5 E6:1 r:0.5'),
        harmony: parseNotes('A4:2 D5:2 E5:2 A4:2'),
        bass: parseNotes('A2:2 D3:2 E3:2 A2:2'),
        drums: 'H...H...H...H...',
      },
      { // C: low brooding
        bars: 4,
        melody: parseNotes('E5:2 D5:1 C5:1 r:0.5 D5:1 C5:0.5 B4:0.5 A4:2 r:0.5'),
        harmony: parseNotes('A4:1 B4:1 C5:1 D5:1 E5:2 A4:2'),
        bass: parseNotes('A2:4 F2:2 G2:2'),
        drums: '....H.......H...',
      },
      { // D: soft resolution
        bars: 4,
        melody: parseNotes('A5:1.5 E5:0.5 C5:2 A4:2 r:2'),
        harmony: parseNotes('C5:2 A4:2 E5:2 A4:2'),
        bass: parseNotes('A2:4 A2:4'),
        drums: '......H.......H.',
      },
    ],
  },

  // ============ SAFARI ZONE ============ warm jungle dawn (calm)
  safari: {
    bpm: 84,
    masterGain: 0.06,
    melodyWave: 'sine',
    harmonyWave: 'sine',
    bassWave: 'triangle',
    sections: [
      { // A: gentle stroll in D minor
        bars: 4,
        melody: parseNotes('D5:1 F5:0.5 A5:0.5 G5:1 F5:0.5 D5:0.5 E5:2 A5:1 G5:1 F5:2 r:1'),
        harmony: parseNotes('D4:2 A4:2 G4:2 F4:2'),
        bass: parseNotes('D3:4 G3:4'),
        drums: '......H.......H.',
      },
      { // B: lifted chorus
        bars: 4,
        melody: parseNotes('A5:1 G5:0.5 F5:0.5 E5:1 D5:1 r:0.5 A5:0.5 C6:0.5 D6:0.5 A5:1 F5:1.5 r:0.5'),
        harmony: parseNotes('D5:2 C5:2 A4:2 D5:2'),
        bass: parseNotes('D3:2 C3:2 A2:2 D3:2'),
        drums: 'H...H...H...H...',
      },
      { // C: warm pad-like
        bars: 4,
        melody: parseNotes('F5:2 G5:1 A5:1 G5:2 F5:1 D5:1 E5:4'),
        harmony: parseNotes('F4:2 G4:2 D4:2 E4:2'),
        bass: parseNotes('F3:4 D3:4'),
        drums: '....H.......H...',
      },
      { // D: descending resolve
        bars: 4,
        melody: parseNotes('D6:1 C6:1 A5:1 G5:1 F5:1.5 D5:0.5 E5:2 D5:2 r:2'),
        harmony: parseNotes('D5:2 A4:2 F4:2 D4:2'),
        bass: parseNotes('D3:4 A2:4'),
        drums: '......H.......H.',
      },
    ],
  },

  // ============ ANCIENT TEMPLE ============ mystical, calm
  temple: {
    bpm: 76,
    masterGain: 0.06,
    melodyWave: 'sine',
    harmonyWave: 'sine',
    bassWave: 'sine',
    sections: [
      { // A: slow mystical
        bars: 4,
        melody: parseNotes('E5:2 G5:1 B5:1 A5:1.5 G5:0.5 E5:2'),
        harmony: parseNotes('E4:2 G4:2 A4:2 B4:2'),
        bass: parseNotes('E2:4 A2:4'),
        drums: '......H.......H.',
      },
      { // B: rising chant
        bars: 4,
        melody: parseNotes('D5:2 F5:1 A5:1 G5:1.5 F5:0.5 D5:2'),
        harmony: parseNotes('D4:2 F4:2 G4:2 A4:2'),
        bass: parseNotes('D2:4 G2:4'),
        drums: '....H.......H...',
      },
      { // C: ominous descent
        bars: 4,
        melody: parseNotes('B5:1 A5:1 G5:1 E5:1 G5:1 E5:1 D5:1 B4:1'),
        harmony: parseNotes('G4:2 E4:2 B4:2 G4:2'),
        bass: parseNotes('E2:2 G2:2 B2:2 E3:2'),
        drums: '......H.......H.',
      },
      { // D: serene close
        bars: 4,
        melody: parseNotes('E5:1.5 G5:0.5 B5:2 E5:2 A5:2 G5:2 r:2'),
        harmony: parseNotes('E4:2 B4:2 A4:2 G4:2'),
        bass: parseNotes('E2:4 A2:4'),
        drums: '......H.......H.',
      },
    ],
  },

  // ============ WILD BATTLE ============ tense but calm (lo-fi battle)
  wild_battle: {
    bpm: 90,
    masterGain: 0.06,
    melodyWave: 'sine',
    harmonyWave: 'sine',
    bassWave: 'triangle',
    sections: [
      { // A: rolling tension in F# minor
        bars: 4,
        melody: parseNotes('F#5:1 A5:0.5 C#6:0.5 B5:1 A5:0.5 F#5:0.5 E5:2 A5:1 G5:1 F#5:2 r:1'),
        harmony: parseNotes('F#4:2 C#5:2 B4:2 A4:2'),
        bass: parseNotes('F#2:4 B2:4'),
        drums: 'H...H...H...H...',
      },
      { // B: melodic build
        bars: 4,
        melody: parseNotes('C#6:1 B5:0.5 A5:0.5 F#5:1 G5:0.5 A5:0.5 B5:2 A5:1 G5:1 F#5:2 r:1'),
        harmony: parseNotes('A4:2 G4:2 F#4:2 C#5:2'),
        bass: parseNotes('A2:2 G2:2 F#2:2 C#3:2'),
        drums: 'H.K.H.K.H.K.H.K.',
      },
      { // C: melancholy resolution
        bars: 4,
        melody: parseNotes('F#6:2 C#6:1 A5:1 G5:1.5 F#5:0.5 E5:2 r:1'),
        harmony: parseNotes('F#4:2 A4:2 C#5:2 E5:2'),
        bass: parseNotes('F#2:4 A2:4'),
        drums: 'H...H...H...H...',
      },
    ],
  },

  // ============ GYM BATTLE ============ serious but calm
  gym_battle: {
    bpm: 92,
    masterGain: 0.07,
    melodyWave: 'sine',
    harmonyWave: 'triangle',
    bassWave: 'sine',
    sections: [
      { // A: confident A minor
        bars: 4,
        melody: parseNotes('A5:1 G5:0.5 E5:0.5 A5:1 C6:1 B5:0.5 A5:0.5 G5:1 F5:1 E5:2 r:1'),
        harmony: parseNotes('A4:2 E4:2 F4:2 G4:2'),
        bass: parseNotes('A2:4 F2:4'),
        drums: '......H.K.....H.'.replace(/\s/g,''),
      },
      { // B: chord-driven
        bars: 4,
        melody: parseNotes('C6:1 B5:0.5 A5:0.5 G5:1 E5:1 A5:2 G5:1 F5:1 E5:2 r:1'),
        harmony: parseNotes('C5:2 G4:2 F5:2 E5:2'),
        bass: parseNotes('C3:2 G2:2 F3:2 E3:2'),
        drums: 'K...H.K.K...H.K.',
      },
      { // C: rising resolve
        bars: 4,
        melody: parseNotes('A5:0.5 B5:0.5 C6:1 E6:1 D6:0.5 C6:0.5 B5:1 A5:1 G5:1.5 A5:0.5 r:1'),
        harmony: parseNotes('A4:2 C5:2 D5:2 E5:2'),
        bass: parseNotes('A2:2 C3:2 D3:2 E3:2'),
        drums: 'H...H.K.H...H.K.',
      },
    ],
  },

  // ============ GIOVANNI / FINAL BOSS ============ atmospheric and slow
  giovanni_battle: {
    bpm: 80,
    masterGain: 0.07,
    melodyWave: 'sine',
    harmonyWave: 'sine',
    bassWave: 'sine',
    sections: [
      { // A: ominous opening
        bars: 4,
        melody: parseNotes('D5:2 F5:1 A5:1 G5:2 r:2'),
        harmony: parseNotes('D4:2 F4:2 A4:2 G4:2'),
        bass: parseNotes('D2:4 A2:4'),
        drums: 'K.......H.......',
      },
      { // B: mysterious build
        bars: 4,
        melody: parseNotes('A5:1 G5:0.5 F5:0.5 E5:1 D5:1 C6:1 B5:0.5 A5:0.5 G5:1 F5:1 r:1'),
        harmony: parseNotes('D4:2 A4:2 F4:2 C5:2'),
        bass: parseNotes('D2:2 A2:2 F2:2 C3:2'),
        drums: 'K...H...K...H.K.',
      },
      { // C: epic but restrained chorus
        bars: 4,
        melody: parseNotes('D6:1 C6:0.5 A5:0.5 F5:1 G5:1 A5:1.5 D6:0.5 C6:1 A5:2 r:1'),
        harmony: parseNotes('D5:2 F5:2 G5:2 A5:2'),
        bass: parseNotes('D2:2 F2:2 G2:2 A2:2'),
        drums: 'K...H.K.K...H.K.',
      },
      { // D: somber resolution
        bars: 4,
        melody: parseNotes('A5:1.5 G5:0.5 F5:2 E5:1.5 D5:0.5 D5:2 r:2'),
        harmony: parseNotes('A4:2 F4:2 D5:2 D4:2'),
        bass: parseNotes('A2:4 D2:4'),
        drums: 'K.......H.......',
      },
    ],
  },
};

// ============== PLAYER STATE ==============
GameAudio.playArea = function (areaId) {
  if (!GameState.options.music) { GameAudio.stop(); return; }
  if (GameAudio.currentTrack === areaId) return;
  GameAudio.stop();
  GameAudio.currentTrack = areaId;
  GameAudio.startTrack(areaId);
};

GameAudio.startBattleMusic = function (kind) {
  // kind: 'wild' | 'gym' | 'giovanni'
  const trackId = kind === 'giovanni' ? 'giovanni_battle' : kind === 'gym' ? 'gym_battle' : 'wild_battle';
  if (!GameState.options.music) return;
  GameAudio.previousTrack = GameAudio.currentTrack;
  GameAudio.stop();
  GameAudio.currentTrack = trackId;
  GameAudio.startTrack(trackId);
};

GameAudio.endBattleMusic = function () {
  if (!GameAudio.previousTrack) return;
  const prev = GameAudio.previousTrack;
  GameAudio.previousTrack = null;
  GameAudio.stop();
  GameAudio.currentTrack = prev;
  GameAudio.startTrack(prev);
};

GameAudio.stop = function () {
  if (GameAudio.musicState) {
    if (GameAudio.musicState.intervalId) clearInterval(GameAudio.musicState.intervalId);
    if (GameAudio.musicState.masterGain && GameAudio.ctx) {
      try { GameAudio.musicState.masterGain.gain.cancelScheduledValues(GameAudio.ctx.currentTime); } catch (e) {}
      try { GameAudio.musicState.masterGain.gain.linearRampToValueAtTime(0, GameAudio.ctx.currentTime + 0.15); } catch (e) {}
    }
    GameAudio.musicState = null;
  }
  GameAudio.currentTrack = null;
};

GameAudio.startTrack = function (trackId) {
  const track = GameAudio.TRACKS[trackId];
  if (!track) return;
  const ctx = GameAudio.ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const masterGain = ctx.createGain();
  masterGain.gain.value = track.masterGain;
  masterGain.connect(ctx.destination);

  const beatDuration = 60 / track.bpm;
  const sixteenth = beatDuration / 4;
  const LOOKAHEAD = 0.5; // 500ms

  const state = {
    masterGain,
    sectionIdx: 0,
    cursorBeats: 0,
    nextScheduleTime: ctx.currentTime + 0.05,
    intervalId: null,
    bassNextTime: ctx.currentTime + 0.05,
    bassCursorBeats: 0,
    harmonyNextTime: ctx.currentTime + 0.05,
    harmonyCursorBeats: 0,
    drumNextTime: ctx.currentTime + 0.05,
    drumStep: 0,
  };
  GameAudio.musicState = state;

  // Helper to play one layer
  const scheduleLayer = (sectionLayer, nextTimeKey, cursorKey, waveType, volume) => {
    const section = track.sections[state.sectionIdx];
    const layer = section[sectionLayer];
    if (!layer) return;
    while (state[nextTimeKey] < ctx.currentTime + LOOKAHEAD) {
      const beatPos = state[cursorKey];
      // Find note at this beat position within the section
      let pos = 0;
      let chosenNote = null;
      for (const note of layer) {
        if (pos === beatPos || (beatPos > pos && beatPos < pos + note.d)) {
          chosenNote = { note, startOffset: beatPos - pos };
          break;
        }
        pos += note.d;
      }
      if (!chosenNote) break;
      // Schedule note onset only at exact start
      if (chosenNote.startOffset === 0 && chosenNote.note.n > 0) {
        GameAudio.playNote(masterGain, chosenNote.note.n, state[nextTimeKey], chosenNote.note.d * beatDuration * 0.92, waveType, volume);
      }
      // Advance by the next note boundary (or just smallest step)
      const stepBeats = 0.25;
      state[cursorKey] += stepBeats;
      state[nextTimeKey] += stepBeats * beatDuration;
      // Section wrap
      const sectionBeats = section.bars * 4;
      if (state[cursorKey] >= sectionBeats) {
        // Advance section
        state[cursorKey] = 0;
        if (cursorKey === 'cursorBeats') {
          state.sectionIdx = (state.sectionIdx + 1) % track.sections.length;
        }
      }
    }
  };

  // Simpler: schedule each layer independently per section bar
  const schedule = () => {
    if (GameAudio.currentTrack !== trackId) return;
    const ctxNow = ctx.currentTime;

    // ===== Section-based scheduling =====
    // Walk through current section's notes for each layer, advancing per note
    const section = track.sections[state.sectionIdx];
    const sectionBeats = section.bars * 4;

    // MELODY
    while (state.nextScheduleTime < ctxNow + LOOKAHEAD) {
      const idx = state.melodyNoteIdx || 0;
      const notes = section.melody || [];
      if (notes.length === 0) break;
      const note = notes[idx % notes.length];
      if (note.n > 0) {
        GameAudio.playNote(masterGain, note.n, state.nextScheduleTime, note.d * beatDuration * 0.92, track.melodyWave, 0.5);
      }
      state.nextScheduleTime += note.d * beatDuration;
      state.melodyNoteIdx = (idx + 1) % notes.length;
      // Section wrap detection — when we finish one full lap of melody, advance section
      if (state.melodyNoteIdx === 0) {
        state.sectionIdx = (state.sectionIdx + 1) % track.sections.length;
      }
    }

    // BASS — runs on its own counter
    const bassSection = track.sections[state.bassSectionIdx || 0];
    while (state.bassNextTime < ctxNow + LOOKAHEAD) {
      const idx = state.bassNoteIdx || 0;
      const notes = bassSection.bass || [];
      if (notes.length === 0) break;
      const note = notes[idx % notes.length];
      if (note.n > 0) {
        GameAudio.playNote(masterGain, note.n, state.bassNextTime, note.d * beatDuration * 0.95, track.bassWave, 0.55);
      }
      state.bassNextTime += note.d * beatDuration;
      state.bassNoteIdx = (idx + 1) % notes.length;
      if (state.bassNoteIdx === 0) {
        state.bassSectionIdx = ((state.bassSectionIdx || 0) + 1) % track.sections.length;
      }
    }

    // HARMONY
    const harmSection = track.sections[state.harmSectionIdx || 0];
    while (state.harmonyNextTime < ctxNow + LOOKAHEAD) {
      const idx = state.harmNoteIdx || 0;
      const notes = harmSection.harmony || [];
      if (notes.length === 0) break;
      const note = notes[idx % notes.length];
      if (note.n > 0) {
        GameAudio.playNote(masterGain, note.n, state.harmonyNextTime, note.d * beatDuration * 0.88, track.harmonyWave, 0.22);
      }
      state.harmonyNextTime += note.d * beatDuration;
      state.harmNoteIdx = (idx + 1) % notes.length;
      if (state.harmNoteIdx === 0) {
        state.harmSectionIdx = ((state.harmSectionIdx || 0) + 1) % track.sections.length;
      }
    }

    // DRUMS - 16-step pattern per bar
    const drumSection = track.sections[state.drumSectionIdx || 0];
    while (state.drumNextTime < ctxNow + LOOKAHEAD) {
      const pat = drumSection.drums || '';
      if (pat.length === 0) break;
      const step = state.drumStep % pat.length;
      const ch = pat[step];
      if (ch === 'K') GameAudio.playDrum(masterGain, 'kick', state.drumNextTime, 0.5);
      else if (ch === 'S') GameAudio.playDrum(masterGain, 'snare', state.drumNextTime, 0.4);
      else if (ch === 'H') GameAudio.playDrum(masterGain, 'hat', state.drumNextTime, 0.2);
      state.drumStep = (step + 1) % pat.length;
      state.drumNextTime += sixteenth;
      // Section wrap on drum cycle
      if (state.drumStep === 0) {
        state.drumSectionIdx = ((state.drumSectionIdx || 0) + 1) % track.sections.length;
      }
    }
  };

  schedule();
  state.intervalId = setInterval(schedule, 100);
};

// ============== INSTRUMENTS ==============
GameAudio.playNote = function (destGain, midiNote, when, duration, waveType, vol) {
  const ctx = GameAudio.ctx;
  if (!ctx) return;
  const freq = midiToFreq(midiNote);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = waveType || 'square';
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol || 0.5, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, when + Math.max(0.05, duration));
  osc.connect(gain);
  gain.connect(destGain);
  osc.start(when);
  osc.stop(when + duration + 0.05);
};

GameAudio.playDrum = function (destGain, kind, when, vol) {
  const ctx = GameAudio.ctx;
  if (!ctx) return;
  vol = vol || 0.5;
  if (kind === 'kick') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    osc.connect(gain);
    gain.connect(destGain);
    osc.start(when);
    osc.stop(when + 0.2);
  } else if (kind === 'snare') {
    const bufferSize = ctx.sampleRate * 0.07;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.7, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destGain);
    noise.start(when);
  } else if (kind === 'hat') {
    const bufferSize = ctx.sampleRate * 0.04;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.3, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destGain);
    noise.start(when);
  }
};

// ============== SFX ==============
// All SFX route through a shared lowpass + gain bus so harsh harmonics
// (square / sawtooth fizz) get rolled off and overall volume is gentle.
GameAudio._sfxBus = null;
GameAudio.ensureSfxBus = function () {
  const ctx = GameAudio.ensureCtx();
  if (!ctx) return null;
  if (GameAudio._sfxBus) return GameAudio._sfxBus;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3800;  // tames the upper harmonics
  filter.Q.value = 0.5;
  const gain = ctx.createGain();
  gain.gain.value = 0.55;          // global SFX trim
  filter.connect(gain);
  gain.connect(ctx.destination);
  GameAudio._sfxBus = filter;
  return filter;
};

GameAudio.tone = function (freq, durMs, type = 'triangle', vol = 0.08) {
  if (!GameState.options.sfx) return;
  const ctx = GameAudio.ensureCtx();
  if (!ctx) return;
  const bus = GameAudio.ensureSfxBus();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.012);  // gentle attack
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  osc.connect(gain);
  gain.connect(bus || ctx.destination);
  osc.start();
  osc.stop(now + durMs / 1000 + 0.05);
};

GameAudio.slide = function (fromFreq, toFreq, durMs, type = 'triangle', vol = 0.1) {
  if (!GameState.options.sfx) return;
  const ctx = GameAudio.ensureCtx();
  if (!ctx) return;
  const bus = GameAudio.ensureSfxBus();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), now + durMs / 1000);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  osc.connect(gain);
  gain.connect(bus || ctx.destination);
  osc.start();
  osc.stop(now + durMs / 1000 + 0.05);
};

GameAudio.noise = function (durMs, vol = 0.1, filterFreq = 2000) {
  if (!GameState.options.sfx) return;
  const ctx = GameAudio.ensureCtx();
  if (!ctx) return;
  const bus = GameAudio.ensureSfxBus();
  const now = ctx.currentTime;
  const buf = ctx.createBuffer(1, ctx.sampleRate * (durMs / 1000), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(bus || ctx.destination);
  src.start();
};

GameAudio.sfx = {
  encounter: () => {
    // Soft ascending arpeggio (sine, gentler than square)
    [440, 554, 659, 880, 1047].forEach((f, i) => setTimeout(() => GameAudio.tone(f, 90, 'sine', 0.07), i * 80));
  },
  catch: () => {
    // Triumphant rising arpeggio + sparkle (no preamble wobbles — those happen during animation)
    GameAudio.tone(523, 90, 'triangle', 0.09);
    setTimeout(() => GameAudio.tone(659, 90, 'triangle', 0.09), 90);
    setTimeout(() => GameAudio.tone(784, 90, 'triangle', 0.09), 180);
    setTimeout(() => GameAudio.tone(1047, 220, 'triangle', 0.1), 270);
    setTimeout(() => GameAudio.tone(1568, 280, 'sine', 0.08), 470);
    // Add a soft sparkle layer
    setTimeout(() => {
      [1320, 1568, 1760, 2093].forEach((f, i) => setTimeout(() => GameAudio.tone(f, 60, 'sine', 0.05), i * 50));
    }, 480);
  },
  miss: () => {
    // Whoosh (filtered noise sweep + downward slide)
    GameAudio.noise(280, 0.09, 700);
    GameAudio.slide(900, 200, 320, 'sine', 0.07);
    setTimeout(() => GameAudio.noise(180, 0.05, 400), 200);
  },
  hit: () => {
    // Muted thunk + soft body
    GameAudio.tone(180, 80, 'triangle', 0.1);
    GameAudio.noise(60, 0.04, 600);
  },
  critical: () => {
    // Bright but soft double zing (filtered, not piercing)
    GameAudio.tone(900, 70, 'triangle', 0.08);
    setTimeout(() => GameAudio.tone(1200, 100, 'triangle', 0.08), 60);
    GameAudio.noise(100, 0.05, 2500);
  },
  superEffective: () => {
    // Gentle sparkle (sine — already soft)
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => GameAudio.tone(f, 90, 'sine', 0.06), i * 50));
  },
  notVeryEffective: () => {
    // Soft dull double thud
    GameAudio.tone(220, 120, 'sine', 0.08);
    setTimeout(() => GameAudio.tone(170, 180, 'sine', 0.06), 110);
  },
  faint: () => {
    // Slow descending sigh
    GameAudio.slide(440, 110, 700, 'sine', 0.09);
    setTimeout(() => GameAudio.tone(82, 350, 'sine', 0.06), 650);
  },
  victory: () => {
    // Triumphant fanfare (triangle — clear but not abrasive)
    GameAudio.tone(523, 130, 'triangle', 0.08);
    setTimeout(() => GameAudio.tone(659, 130, 'triangle', 0.08), 130);
    setTimeout(() => GameAudio.tone(784, 130, 'triangle', 0.08), 260);
    setTimeout(() => GameAudio.tone(1047, 320, 'triangle', 0.09), 390);
    setTimeout(() => GameAudio.tone(784, 110, 'sine', 0.06), 750);
    setTimeout(() => GameAudio.tone(1047, 420, 'triangle', 0.09), 860);
  },
  dice: () => {
    // Soft rolling patter (filtered noise)
    for (let i = 0; i < 5; i++) {
      setTimeout(() => GameAudio.noise(35, 0.04, 1500 + Math.random() * 1500), i * 55);
    }
    setTimeout(() => GameAudio.tone(440 + Math.random() * 300, 80, 'triangle', 0.06), 320);
  },
  step: () => GameAudio.tone(600 + Math.random() * 200, 30, 'triangle', 0.03),
  item: () => {
    // Gentle two-tone bell
    GameAudio.tone(659, 90, 'triangle', 0.06);
    setTimeout(() => GameAudio.tone(880, 90, 'triangle', 0.06), 90);
    setTimeout(() => GameAudio.tone(1175, 180, 'sine', 0.06), 180);
  },
  fanfare: () => {
    // Big triumph using triangles
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => setTimeout(() => GameAudio.tone(f, 200, 'triangle', 0.08), i * 200));
  },
  heal: () => {
    // Soft chime
    GameAudio.tone(800, 110, 'sine', 0.07);
    setTimeout(() => GameAudio.tone(1000, 110, 'sine', 0.07), 110);
    setTimeout(() => GameAudio.tone(1200, 220, 'sine', 0.07), 220);
  },
  trade: () => {
    // Two opposing slides (sine — smooth)
    GameAudio.slide(440, 880, 320, 'sine', 0.07);
    setTimeout(() => GameAudio.slide(880, 440, 320, 'sine', 0.07), 120);
  },
  branchChoice: () => {
    // Two-tone question (sine)
    GameAudio.tone(523, 110, 'sine', 0.07);
    setTimeout(() => GameAudio.tone(659, 110, 'sine', 0.07), 110);
  },
  gymStart: () => {
    // Soft dramatic rise (triangle, no sawtooth fizz)
    GameAudio.tone(220, 160, 'triangle', 0.09);
    setTimeout(() => GameAudio.tone(330, 160, 'triangle', 0.09), 150);
    setTimeout(() => GameAudio.tone(440, 280, 'triangle', 0.09), 300);
    GameAudio.noise(220, 0.05, 250);
  },
  gameOver: () => {
    // Sad descending sigh
    [440, 392, 349, 294, 220].forEach((f, i) => setTimeout(() => GameAudio.tone(f, 220, 'sine', 0.08), i * 200));
  },
  ballThrow: () => {
    // Whoosh as the ball flies
    GameAudio.slide(200, 700, 350, 'sine', 0.07);
  },
  ballWiggle: () => {
    // Single wiggle: brief rattle
    GameAudio.tone(420 + Math.random() * 60, 80, 'sine', 0.06);
    GameAudio.noise(60, 0.025, 1200);
  },
};
