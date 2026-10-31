// Tiny WebAudio synth. No files, no autoplay: every sound follows a gesture.

let ctx = null;
let master = null;
let noiseBuffer = null;
let enabled = true;
let unlocked = false;

function ensure() {
  if (!enabled || !unlocked) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  const length = Math.floor(ctx.sampleRate * 0.35);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.18, delay = 0, attack = 0.008, release = null }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (release || dur));
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ dur = 0.15, gain = 0.12, delay = 0, freq = 1200, q = 0.8, type = 'bandpass' }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const Sound = {
  setEnabled(value) {
    enabled = Boolean(value);
    if (master) master.gain.value = enabled ? 0.22 : 0;
  },
  get enabled() { return enabled; },
  unlock() {
    unlocked = true;
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  },
  click() { tone({ freq: 620, to: 760, dur: 0.05, type: 'square', gain: 0.05 }); },
  select() { tone({ freq: 880, dur: 0.04, type: 'triangle', gain: 0.06 }); },
  error() { tone({ freq: 150, to: 100, dur: 0.16, type: 'sawtooth', gain: 0.08 }); },
  summon() {
    tone({ freq: 170, to: 520, dur: 0.22, type: 'triangle', gain: 0.11 });
    tone({ freq: 340, to: 1040, dur: 0.18, type: 'sine', gain: 0.05, delay: 0.03 });
    noise({ dur: 0.18, gain: 0.05, freq: 1800 });
  },
  move() { tone({ freq: 420, to: 620, dur: 0.09, type: 'triangle', gain: 0.06 }); },
  attack() {
    noise({ dur: 0.12, gain: 0.11, freq: 2400, q: 1.4 });
    tone({ freq: 220, to: 70, dur: 0.18, type: 'sawtooth', gain: 0.09 });
  },
  hit() {
    noise({ dur: 0.16, gain: 0.14, freq: 600, q: 0.5 });
    tone({ freq: 120, to: 55, dur: 0.14, type: 'square', gain: 0.1 });
  },
  destroy() {
    noise({ dur: 0.32, gain: 0.16, freq: 380, q: 0.4, type: 'lowpass' });
    tone({ freq: 180, to: 45, dur: 0.3, type: 'sawtooth', gain: 0.08 });
  },
  heal() {
    [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.05, delay: i * 0.06 }));
  },
  buff() {
    [392, 523, 659].forEach((f, i) => tone({ freq: f, to: f * 1.08, dur: 0.14, type: 'triangle', gain: 0.045, delay: i * 0.04 }));
  },
  turn() {
    tone({ freq: 330, dur: 0.12, type: 'triangle', gain: 0.06 });
    tone({ freq: 495, dur: 0.16, type: 'triangle', gain: 0.05, delay: 0.08 });
  },
  enemyTurn() {
    tone({ freq: 220, dur: 0.14, type: 'triangle', gain: 0.06 });
    tone({ freq: 165, dur: 0.2, type: 'triangle', gain: 0.05, delay: 0.1 });
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.32, type: 'triangle', gain: 0.075, delay: i * 0.1 }));
    noise({ dur: 0.5, gain: 0.05, freq: 3000, delay: 0.1 });
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, to: f * 0.94, dur: 0.35, type: 'sawtooth', gain: 0.05, delay: i * 0.13 }));
  },
  zero() {
    tone({ freq: 880, to: 55, dur: 0.65, type: 'sawtooth', gain: 0.1 });
    noise({ dur: 0.6, gain: 0.09, freq: 900, q: 0.3 });
  },
};
