/* Gridiron Kings — synthesized sound (Web Audio, no asset files). */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const A = { ctx: null, master: null, on: true, crowd: null, crowdGain: null, noise: null };

  function ensure() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.on ? 0.9 : 0;
      A.master.connect(A.ctx.destination);
      const len = A.ctx.sampleRate * 2, buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.2; } // brown-ish noise
      A.noise = buf;
      return true;
    } catch (e) { return false; }
  }

  function env(g, t, a, peak, dur) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!A.on || !ensure()) return;
    const t = A.ctx.currentTime + (delay || 0);
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.008, vol || 0.2, dur);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dur, vol, freq, q, slideTo, delay) {
    if (!A.on || !ensure()) return;
    const t = A.ctx.currentTime + (delay || 0);
    const s = A.ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq || 1000, t); f.Q.value = q || 0.8;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = A.ctx.createGain(); env(g, t, Math.min(0.15, dur * 0.3), vol || 0.3, dur);
    s.connect(f); f.connect(g); g.connect(A.master); s.start(t, Math.random()); s.stop(t + dur + 0.2);
  }

  A.unlock = ensure;
  A.setOn = function (on) { A.on = on; if (A.master) A.master.gain.value = on ? 0.9 : 0; };

  A.click = () => tone(660, 0.06, 'triangle', 0.12, 880);
  A.back = () => tone(520, 0.07, 'triangle', 0.1, 360);
  A.coin = () => { tone(1320, 0.09, 'square', 0.07); tone(1760, 0.16, 'square', 0.07, null, 0.07); };
  A.error = () => tone(180, 0.18, 'sawtooth', 0.1, 120);
  A.kick = (s) => { tone(150 + s * 60, 0.11, 'sine', 0.35 + s * 0.3, 55); burst(0.05, 0.25, 2400, 0.7); };
  A.bounce = () => tone(120, 0.07, 'sine', 0.16, 70);
  A.post = () => { tone(880, 0.5, 'triangle', 0.3, 860); tone(1245, 0.4, 'sine', 0.16); A.ooh(); };
  A.tackle = () => burst(0.12, 0.3, 500, 0.6, 200);
  A.whistle = (long) => {
    if (!A.on || !ensure()) return;
    const n = long ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const t = A.ctx.currentTime + i * 0.42, dur = long && i === n - 1 ? 0.8 : 0.3;
      [2350, 2540].forEach((fq) => {
        const o = A.ctx.createOscillator(), g = A.ctx.createGain(), lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq; lfo.frequency.value = 38; lg.gain.value = 60;
        lfo.connect(lg); lg.connect(o.frequency);
        env(g, t, 0.015, 0.11, dur);
        o.connect(g); g.connect(A.master); o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
      });
    }
  };
  A.ooh = () => burst(1.1, 0.35, 500, 0.5, 300);
  A.hike = () => { burst(0.09, 0.35, 700, 2.5, 500); tone(150, 0.09, 'sawtooth', 0.06, 110); burst(0.1, 0.4, 750, 2.5, 520, 0.28); tone(160, 0.1, 'sawtooth', 0.07, 115, 0.28); };
  A.hit = (big) => { tone(big ? 70 : 95, big ? 0.32 : 0.18, 'sine', big ? 0.7 : 0.45, 40); burst(big ? 0.3 : 0.16, big ? 0.6 : 0.35, 380, 0.7, 160); if (big) A.ooh(); };
  A.throw = () => burst(0.35, 0.18, 1400, 1.2, 500);
  A.catchPop = () => { tone(240, 0.06, 'triangle', 0.25, 160); burst(0.05, 0.25, 1800, 1); };
  A.boot = () => { tone(110, 0.14, 'sine', 0.55, 50); burst(0.08, 0.4, 2000, 0.8); };
  A.horn = () => { [174, 220, 261].forEach((f, i) => tone(f, 1.1, 'sawtooth', 0.06, null, i * 0.02)); };
  A.cheer = () => { burst(3.6, 0.9, 900, 0.35, 1500); burst(3.2, 0.5, 2200, 0.5, 2600, 0.1); };
  A.groan = () => burst(1.8, 0.4, 380, 0.5, 220);

  A.crowdStart = function () {
    if (!ensure() || A.crowd) return;
    const s = A.ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.35;
    const g = A.ctx.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.16, A.ctx.currentTime + 1.5);
    s.connect(f); f.connect(g); g.connect(A.master); s.start();
    A.crowd = s; A.crowdGain = g;
  };
  A.crowdLevel = function (v) { if (A.crowdGain) A.crowdGain.gain.setTargetAtTime(0.1 + v * 0.22, A.ctx.currentTime, 0.4); };
  A.crowdStop = function () {
    if (!A.crowd) return;
    const s = A.crowd, g = A.crowdGain;
    g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.3);
    setTimeout(() => { try { s.stop(); } catch (e) { /* already stopped */ } }, 1200);
    A.crowd = null; A.crowdGain = null;
  };

  /* pack opening */
  A.packShake = () => { tone(90, 0.9, 'sawtooth', 0.12, 420); burst(0.9, 0.2, 300, 1, 3000); };
  A.packBurst = () => { burst(0.7, 0.6, 1800, 0.4, 300); tone(70, 0.5, 'sine', 0.5, 35); };
  A.flip = () => burst(0.12, 0.2, 2600, 0.8, 900);
  A.reveal = (rank) => {
    const base = [392, 440, 494, 523, 587, 659][rank] || 392;
    const n = rank >= 3 ? 5 : rank >= 2 ? 3 : 1;
    for (let i = 0; i < n; i++) tone(base * [1, 1.26, 1.5, 2, 2.52][i], 0.28 + (i === n - 1 ? 0.3 : 0), 'triangle', 0.13, null, i * 0.07);
    if (rank >= 4) burst(1.4, 0.3, 4000, 1.2, 7000, 0.2);
  };

  FG.audio = A;
})();
