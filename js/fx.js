import { cardHTML } from './render.js'

const q = (sel) => document.querySelector(sel)
const reduced = () => false

export function ensureAudio(app) {
  if (app.audio) {
    if (app.audio.state === 'suspended') app.audio.resume().catch(() => {})
    return app.audio
  }
  if (!app.audioUnlocked) return null
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) app.audio = new AC()
  } catch {
    app.audio = null
  }
  return app.audio
}

function tone(app, { freq = 440, endFreq = null, dur = 0.12, type = 'sine', vol = 0.04, delay = 0 }) {
  const ctx = app.audio
  if (!ctx) return
  try {
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t0 + dur)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  } catch {
    /* audio is a nice-to-have only */
  }
}

export function sfx(app, kind) {
  if (!app.soundOn) return
  ensureAudio(app)
  if (!app.audio) return
  switch (kind) {
    case 'click':
      tone(app, { freq: 720, dur: 0.045, type: 'triangle', vol: 0.018 })
      break
    case 'draw':
      tone(app, { freq: 360, endFreq: 760, dur: 0.12, type: 'triangle', vol: 0.035 })
      break
    case 'summon':
      tone(app, { freq: 180, endFreq: 520, dur: 0.22, type: 'sawtooth', vol: 0.028 })
      tone(app, { freq: 520, endFreq: 880, dur: 0.2, type: 'sine', vol: 0.03, delay: 0.05 })
      break
    case 'special':
      tone(app, { freq: 220, endFreq: 990, dur: 0.42, type: 'sine', vol: 0.04 })
      break
    case 'attack':
      tone(app, { freq: 220, endFreq: 70, dur: 0.18, type: 'sawtooth', vol: 0.04 })
      break
    case 'damage':
      tone(app, { freq: 110, endFreq: 55, dur: 0.26, type: 'square', vol: 0.035 })
      break
    case 'heal':
      tone(app, { freq: 520, endFreq: 880, dur: 0.25, type: 'sine', vol: 0.03 })
      break
    case 'trap':
      tone(app, { freq: 300, endFreq: 180, dur: 0.32, type: 'triangle', vol: 0.04 })
      break
    case 'turn':
      tone(app, { freq: 440, endFreq: 660, dur: 0.16, type: 'triangle', vol: 0.025 })
      break
    case 'win':
      ;[523, 659, 784, 1046].forEach((f, i) => tone(app, { freq: f, dur: 0.22, type: 'triangle', vol: 0.045, delay: i * 0.1 }))
      break
    case 'lose':
      ;[330, 262, 196].forEach((f, i) => tone(app, { freq: f, dur: 0.3, type: 'sine', vol: 0.04, delay: i * 0.14 }))
      break
    case 'error':
      tone(app, { freq: 160, dur: 0.1, type: 'square', vol: 0.025 })
      break
    default:
      break
  }
}

function anim(el, frames, opts = {}) {
  if (!el) return null
  try {
    const a = el.animate(frames, {
      duration: opts.duration || 360,
      easing: opts.easing || 'cubic-bezier(.2,.9,.2,1)',
      delay: opts.delay || 0,
      fill: 'none',
    })
    if (opts.remove !== false) a.onfinish = () => { try { a.cancel() } catch { /* ignore */ } }
    return a
  } catch {
    return null
  }
}

function cardEl(uid) {
  if (!uid) return null
  const safe = String(uid).replace(/["\\]/g, '')
  return q(`.card[data-uid="${safe}"]`)
}

function zoneEl(side, kind, index) {
  return q(`.zone[data-side="${side}"][data-kind="${kind}"][data-index="${index}"]`)
}

function lpEl(side) {
  return q(`[data-lp-side="${side}"]`)
}

function centerEl() {
  return q('#centerBar')
}

function layer() {
  return q('#fxLayer')
}

function flash(kind = 'hit') {
  const el = layer()
  if (!el) return
  const f = document.createElement('div')
  f.className = `fx-flash ${kind}`
  el.appendChild(f)
  setTimeout(() => f.remove(), 420)
}

function shake(app) {
  const el = q('#app')
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
  setTimeout(() => el.classList.remove('shake'), 380)
}

function glowZone(side, kind, index, cls = 'zone-flash') {
  const el = zoneEl(side, kind, index)
  if (!el) return
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
  setTimeout(() => el.classList.remove(cls), 900)
}

function floatText(app, side, text, cls = 'bad') {
  const anchor = lpEl(side)
  const host = layer()
  if (!anchor || !host) return
  const r = anchor.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = `fx-float ${cls}`
  el.textContent = text
  el.style.left = `${r.left + r.width * 0.5}px`
  el.style.top = `${r.top + 14}px`
  host.appendChild(el)
  anim(el, [
    { transform: 'translate(-50%, 6px) scale(.7)', opacity: 0 },
    { transform: 'translate(-50%, -16px) scale(1.12)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%, -72px) scale(1)', opacity: 0 },
  ], { duration: 950, easing: 'cubic-bezier(.2,.8,.2,1)' })
  setTimeout(() => el.remove(), 1000)
}

function slashAt(el, kind = 'slash') {
  const host = layer()
  if (!host) return
  const target = el || centerEl()
  if (!target) return
  const r = target.getBoundingClientRect()
  const s = document.createElement('div')
  s.className = `fx-slash ${kind}`
  s.style.left = `${r.left + r.width / 2}px`
  s.style.top = `${r.top + r.height / 2}px`
  s.innerHTML = '<i></i><i></i><b></b>'
  host.appendChild(s)
  anim(s, [
    { transform: 'translate(-50%,-50%) scale(.2) rotate(-18deg)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1.15) rotate(0deg)', opacity: 1, offset: 0.3 },
    { transform: 'translate(-50%,-50%) scale(1.5) rotate(6deg)', opacity: 0 },
  ], { duration: 420, easing: 'cubic-bezier(.1,.8,.2,1)' })
  setTimeout(() => s.remove(), 450)
}

function ghostCard(app, ev) {
  const zone = zoneEl(ev.side, ev.kind, ev.index)
  const host = layer()
  if (!host) return
  const r = zone ? zone.getBoundingClientRect() : null
  const ghost = document.createElement('div')
  ghost.className = 'fx-ghost'
  try {
    ghost.innerHTML = cardHTML(app, { uid: `ghost-${Date.now()}`, id: ev.cardId, faceDown: ev.faceDown, pos: 'atk', atkBonus: 0 }, { side: ev.side, index: 0 })
  } catch {
    ghost.innerHTML = ''
  }
  const x = r ? r.left : window.innerWidth / 2 - 40
  const y = r ? r.top : window.innerHeight / 2 - 50
  const w = r ? r.width : 80
  const h = r ? r.height : 112
  ghost.style.left = `${x}px`
  ghost.style.top = `${y}px`
  ghost.style.width = `${w}px`
  ghost.style.height = `${h}px`
  host.appendChild(ghost)
  anim(ghost, [
    { transform: 'scale(1) rotate(0)', opacity: 1, filter: 'brightness(1)' },
    { transform: 'scale(1.12) rotate(-4deg)', opacity: 1, filter: 'brightness(1.8)', offset: 0.2 },
    { transform: 'scale(.6) rotate(14deg) translateY(18px)', opacity: 0, filter: 'brightness(2.4) blur(4px)' },
  ], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' })
  setTimeout(() => ghost.remove(), 650)

  const burst = document.createElement('div')
  burst.className = 'fx-burst'
  burst.style.left = `${x + w / 2}px`
  burst.style.top = `${y + h / 2}px`
  burst.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>'
  host.appendChild(burst)
  setTimeout(() => burst.remove(), 600)
}

function lunge(app, from, to, direct) {
  if (!from) {
    slashAt(to)
    return
  }
  const fr = from.getBoundingClientRect()
  const tr = to ? to.getBoundingClientRect() : centerEl()?.getBoundingClientRect()
  if (!tr) return
  let dx = (tr.left + tr.width / 2) - (fr.left + fr.width / 2)
  let dy = (tr.top + tr.height / 2) - (fr.top + fr.height / 2)
  const max = 190
  const len = Math.hypot(dx, dy) || 1
  if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max }
  anim(from, [
    { transform: 'translate(0,0) scale(1) rotate(0)' },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(1.14) rotate(${direct ? -6 : -4}deg)`, offset: 0.45 },
    { transform: 'translate(0,0) scale(1) rotate(0)' },
  ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' })
  slashAt(to, direct ? 'slash-direct' : 'slash')
}

export function playEvents(app, events) {
  if (!Array.isArray(events)) return
  events.forEach((ev, i) => {
    setTimeout(() => {
      try { playEvent(app, ev) } catch { /* never break the duel for an effect */ }
    }, i * 90)
  })
}

function playEvent(app, ev) {
  if (!ev || !ev.type) return
  switch (ev.type) {
    case 'start': {
      flash('start')
      sfx(app, 'turn')
      break
    }
    case 'draw': {
      sfx(app, 'draw')
      const el = cardEl(ev.uid)
      if (el) {
        anim(el.closest('.hand-card') || el, [
          { transform: 'translateY(32px) scale(.8) rotate(-4deg)', opacity: 0 },
          { transform: 'translateY(0) scale(1) rotate(0)', opacity: 1 },
        ], { duration: 380, easing: 'cubic-bezier(.2,1.2,.4,1)' })
      }
      break
    }
    case 'summon':
    case 'setMonster':
    case 'special': {
      sfx(app, ev.type === 'special' ? 'special' : 'summon')
      const el = cardEl(ev.uid)
      if (el) {
        anim(el, ev.type === 'setMonster'
          ? [
              { transform: 'rotateY(0deg) scale(.8)', opacity: 0.2 },
              { transform: 'rotateY(160deg) scale(1.05)', opacity: 1, offset: 0.7 },
              { transform: 'rotateY(180deg) scale(1)', opacity: 1 },
            ]
          : [
              { transform: 'translateY(34px) scale(.55) rotate(-5deg)', opacity: 0, filter: 'brightness(2)' },
              { transform: 'translateY(0) scale(1.06) rotate(0)', opacity: 1, filter: 'brightness(1.4)', offset: 0.6 },
              { transform: 'scale(1)', filter: 'brightness(1)' },
            ], { duration: 480, easing: 'cubic-bezier(.2,1.1,.4,1)' })
      }
      glowZone(ev.side, ev.zoneKind || 'monster', ev.index || 0, ev.type === 'special' ? 'zone-special' : 'zone-flash')
      flash('summon')
      break
    }
    case 'setSpell': {
      sfx(app, 'click')
      glowZone(ev.side, 'spell', ev.zone, 'zone-set')
      break
    }
    case 'spell':
    case 'trap': {
      sfx(app, ev.type === 'trap' ? 'trap' : 'special')
      if (ev.zone != null) glowZone(ev.side, 'spell', ev.zone, ev.type === 'trap' ? 'zone-trap' : 'zone-spell')
      else {
        const c = centerEl()
        if (c) anim(c, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 420 })
      }
      flash(ev.type === 'trap' ? 'trap' : 'spell')
      break
    }
    case 'field': {
      sfx(app, 'special')
      glowZone(ev.side, 'field', 0, 'zone-field')
      flash('spell')
      break
    }
    case 'attack': {
      sfx(app, 'attack')
      const from = ev.from ? cardEl(ev.from.uid) : null
      let to = null
      if (ev.to) to = cardEl(ev.to.uid) || zoneEl(ev.side === 0 ? 1 : 0, ev.to.kind, ev.to.index)
      if (ev.direct) to = lpEl(ev.side === 0 ? 1 : 0)
      lunge(app, from, to, !!ev.direct)
      break
    }
    case 'damage': {
      sfx(app, 'damage')
      flash('hit')
      shake(app)
      floatText(app, ev.side, `-${ev.amount}`, 'bad')
      const lp = lpEl(ev.side)
      if (lp) anim(lp.querySelector('.lp-fill'), [
        { filter: 'brightness(1)' }, { filter: 'brightness(2.2)' }, { filter: 'brightness(1)' },
      ], { duration: 400 })
      break
    }
    case 'heal': {
      sfx(app, 'heal')
      floatText(app, ev.side, `+${ev.amount}`, 'good')
      break
    }
    case 'destroy': {
      ghostCard(app, ev)
      sfx(app, 'damage')
      shake(app)
      break
    }
    case 'equipLost': {
      glowZone(ev.side, 'spell', ev.zone, 'zone-trap')
      break
    }
    case 'turn': {
      sfx(app, 'turn')
      const c = centerEl()
      if (c) anim(c, [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.7)' },
        { filter: 'brightness(1)' },
      ], { duration: 520 })
      break
    }
    case 'phase': {
      sfx(app, 'click')
      flash('phase')
      break
    }
    case 'result': {
      sfx(app, ev.winner === app.mySide ? 'win' : 'lose')
      flash(ev.winner === app.mySide ? 'win' : 'lose')
      break
    }
    case 'deckout': {
      flash('hit')
      break
    }
    default:
      break
  }
}
