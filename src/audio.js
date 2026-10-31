// Tiny WebAudio synthesizer: no external assets, works offline.
let ctx = null
let master = null
let enabled = true

export function setSoundEnabled(value) {
  enabled = Boolean(value)
  if (master) master.gain.value = enabled ? 0.5 : 0
}

export function soundEnabled() {
  return enabled
}

function ensure() {
  if (!enabled) return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freq, dur, type = 'sine', gain = 0.15, slide = 0, delay = 0) {
  const audio = ensure()
  if (!audio) return
  const t0 = audio.currentTime + delay
  const osc = audio.createOscillator()
  const amp = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(20, freq), t0)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(amp).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur, gain = 0.12, filter = 1800, delay = 0) {
  const audio = ensure()
  if (!audio) return
  const t0 = audio.currentTime + delay
  const length = Math.max(1, Math.floor(audio.sampleRate * dur))
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const src = audio.createBufferSource()
  src.buffer = buffer
  const bp = audio.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = filter
  bp.Q.value = 0.8
  const amp = audio.createGain()
  amp.gain.value = gain
  src.connect(bp).connect(amp).connect(master)
  src.start(t0)
}

const SFX = {
  click: () => tone(660, 0.05, 'square', 0.05),
  draw: () => { noise(0.12, 0.06, 3200); tone(880, 0.1, 'sine', 0.05, 220) },
  summon: () => { tone(140, 0.35, 'sawtooth', 0.12, 160); noise(0.18, 0.1, 700) },
  attack: () => { noise(0.18, 0.13, 1100); tone(320, 0.16, 'sawtooth', 0.08, -180) },
  hit: () => { noise(0.24, 0.18, 240); tone(90, 0.3, 'sine', 0.16, -40) },
  trap: () => { tone(520, 0.2, 'triangle', 0.1, 600); noise(0.2, 0.08, 2200) },
  heal: () => { tone(520, 0.3, 'sine', 0.08, 360); tone(780, 0.35, 'sine', 0.06, 260, 0.08) },
  cast: () => { tone(360, 0.28, 'triangle', 0.1, 480); noise(0.16, 0.05, 2600) },
  turn: () => { tone(220, 0.18, 'sine', 0.07, 180); tone(330, 0.22, 'sine', 0.05, 220, 0.08) },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, 0, i * 0.12)) },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.45, 'sine', 0.1, -30, i * 0.14)) },
  join: () => { tone(700, 0.09, 'sine', 0.07, 220); tone(980, 0.12, 'sine', 0.06, 160, 0.08) },
  error: () => tone(140, 0.12, 'square', 0.06, -40),
}

export function sfx(name) {
  if (!enabled) return
  const fn = SFX[name]
  if (fn) {
    try { fn() } catch { /* audio is decorative */ }
  }
}
