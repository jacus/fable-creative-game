'use strict';
// All sound is synthesised with the Web Audio API: a dreamy pad + pentatonic music box, and little effects.
// Nothing is downloaded. Speech uses the browser's speechSynthesis (optional, offline on most devices).
const Audio = (() => {
  let ctx = null, master = null, musicGain = null, muted = false, musicOn = true, started = false;
  let nextNote = 0, step = 0, timer = null;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  const base = 261.63; // C4
  const freq = (semi) => base * Math.pow(2, semi / 12);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  // simple voice: osc → gain envelope → (optional) filter → dest
  function tone({ f = 440, type = 'sine', t = 0, a = 0.01, d = 0.3, v = 0.3, dest = master, slide = 0, pan = 0 }) {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), ctx.currentTime + t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime + t);
    g.gain.linearRampToValueAtTime(v, ctx.currentTime + t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + a + d);
    let out = g;
    if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(dest);
    o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + a + d + 0.05);
  }
  function noise({ t = 0, d = 0.3, v = 0.2, fc = 1200, q = 1, dest = master }) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * d);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = fc; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = v;
    src.connect(fl); fl.connect(g); g.connect(dest);
    src.start(ctx.currentTime + t);
  }

  // ---- music: a slow pad chord progression + sparkling music-box melody, generated forever
  const CHORDS = [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]];
  let chordI = 0;
  function schedule() {
    if (!ctx || !musicOn) return;
    while (nextNote < ctx.currentTime + 0.6) {
      const beat = 0.42;
      if (step % 16 === 0) {
        const ch = CHORDS[chordI % CHORDS.length]; chordI++;
        for (const s of ch) {
          tone({ f: freq(s - 12), type: 'triangle', t: nextNote - ctx.currentTime, a: 1.2, d: 5.2, v: 0.05, dest: musicGain });
          tone({ f: freq(s) * 1.003, type: 'sine', t: nextNote - ctx.currentTime, a: 1.5, d: 5, v: 0.03, dest: musicGain });
        }
        tone({ f: freq(ch[0] - 24), type: 'sine', t: nextNote - ctx.currentTime, a: 0.3, d: 6, v: 0.12, dest: musicGain });
      }
      if (step % 2 === 0 && Math.random() < 0.7) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)] + (CHORDS[(chordI - 1 + CHORDS.length) % CHORDS.length][0] % 12);
        tone({ f: freq(n + 12), type: 'sine', t: nextNote - ctx.currentTime, a: 0.005, d: 0.9, v: 0.07, dest: musicGain, pan: Math.random() * 0.8 - 0.4 });
        tone({ f: freq(n + 24), type: 'sine', t: nextNote - ctx.currentTime, a: 0.005, d: 0.4, v: 0.02, dest: musicGain });
      }
      nextNote += beat; step++;
    }
  }
  function startMusic() {
    if (!ctx || started) return;
    started = true; nextNote = ctx.currentTime + 0.1; step = 0;
    timer = setInterval(schedule, 200);
  }

  // ---- effects
  const sfx = {
    flap() { noise({ d: 0.18, v: 0.12, fc: 600, q: 0.7 }); },
    star(combo = 0) { const f = freq(PENTA[combo % PENTA.length] + 12); tone({ f, type: 'sine', a: 0.005, d: 0.35, v: 0.25 }); tone({ f: f * 2, type: 'sine', a: 0.005, d: 0.2, v: 0.08 }); },
    ring() { [0, 4, 7, 12].forEach((s, i) => tone({ f: freq(s + 12), type: 'triangle', t: i * 0.07, a: 0.01, d: 0.5, v: 0.18 })); },
    land() { noise({ d: 0.25, v: 0.2, fc: 300, q: 0.5 }); tone({ f: 120, type: 'sine', d: 0.25, v: 0.3, slide: -60 }); },
    good() { [0, 4, 7, 12, 16].forEach((s, i) => { tone({ f: freq(s + 12), type: 'triangle', t: i * 0.09, a: 0.01, d: 0.6, v: 0.22 }); tone({ f: freq(s + 24), type: 'sine', t: i * 0.09, a: 0.01, d: 0.4, v: 0.08 }); }); },
    bad() { tone({ f: 220, type: 'triangle', d: 0.25, v: 0.2, slide: -80 }); tone({ f: 180, type: 'triangle', t: 0.2, d: 0.3, v: 0.2, slide: -60 }); },
    fire() { noise({ d: 0.5, v: 0.35, fc: 900, q: 0.4 }); tone({ f: 90, type: 'sawtooth', d: 0.4, v: 0.1, slide: -40 }); },
    pop() { noise({ d: 0.25, v: 0.3, fc: 1500, q: 0.6 }); [0, 7, 12].forEach((s, i) => tone({ f: freq(s + 19), type: 'sine', t: i * 0.05, d: 0.3, v: 0.15 })); },
    bonk() { tone({ f: 160, type: 'square', d: 0.15, v: 0.12, slide: -90 }); noise({ d: 0.2, v: 0.15, fc: 400 }); },
    unlock() { [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone({ f: freq(s + 12), type: 'triangle', t: i * 0.1, a: 0.01, d: 0.6, v: 0.2 })); },
    click() { tone({ f: 800, type: 'sine', d: 0.08, v: 0.12 }); },
  };

  // ---- speech
  let voiceOn = true;
  function speak(text, lang) {
    if (!voiceOn || muted || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'pl' ? 'pl-PL' : 'en-GB';
      u.rate = 0.92; u.pitch = 1.1;
      const voices = speechSynthesis.getVoices();
      const v = voices.find(v => v.lang.toLowerCase().startsWith(lang === 'pl' ? 'pl' : 'en'));
      if (v) u.voice = v;
      if (lang === 'pl' && !v) return; // don't read Polish with an English voice
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function hasVoice(lang) {
    try { return speechSynthesis.getVoices().some(v => v.lang.toLowerCase().startsWith(lang === 'pl' ? 'pl' : 'en')); } catch (e) { return false; }
  }

  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); if (m) { try { speechSynthesis.cancel(); } catch (e) {} } }
  function setVoice(v) { voiceOn = v; }
  function setMusic(m) { musicOn = m; if (musicGain) musicGain.gain.setTargetAtTime(m ? 0.5 : 0, ctx.currentTime, 0.2); }
  return { init, resume, startMusic, sfx, speak, hasVoice, setMuted, setVoice, setMusic, get muted() { return muted; } };
})();
