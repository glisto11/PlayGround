const STORAGE_KEY = 'duel24.sound';

export class Sound {
  constructor() {
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch { /* ignore */ }
    this.ctx = null;
    this.master = null;
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (enabled) {
      this.unlock();
      this.tone(420, 0.08, 'sine', 0.5, 660);
    }
  }

  tone(freq, dur = 0.12, type = 'sine', gain = 0.5, slide = null, delay = 0) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(dur = 0.2, gain = 0.3, filterFreq = 1800, delay = 0) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.Q.value = 0.8;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
  }

  click() { this.tone(620, 0.055, 'triangle', 0.24, 780); }
  select() { this.tone(880, 0.07, 'sine', 0.2, 1180); }
  deny() { this.tone(180, 0.12, 'square', 0.16, 120); }
  draw() { this.tone(520, 0.08, 'triangle', 0.16, 760); this.tone(780, 0.08, 'sine', 0.1, 1020, 0.05); }
  summon() {
    this.tone(260, 0.26, 'sawtooth', 0.13, 660);
    this.tone(660, 0.2, 'sine', 0.16, 990, 0.06);
    this.noise(0.22, 0.16, 2400, 0.02);
  }
  attack() {
    this.noise(0.18, 0.2, 900);
    this.tone(340, 0.16, 'sawtooth', 0.16, 90);
  }
  impact() {
    this.tone(120, 0.3, 'sine', 0.5, 40);
    this.noise(0.3, 0.34, 500);
  }
  damage() {
    this.tone(220, 0.2, 'square', 0.14, 70);
  }
  heal() {
    this.tone(520, 0.16, 'sine', 0.16, 880);
    this.tone(880, 0.18, 'sine', 0.12, 1180, 0.07);
  }
  turn() {
    this.tone(330, 0.14, 'triangle', 0.16, 440);
    this.tone(660, 0.2, 'sine', 0.13, 880, 0.1);
  }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.18, f * 1.01, i * 0.12));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.55, 'sawtooth', 0.12, f * 0.98, i * 0.14));
  }
}
