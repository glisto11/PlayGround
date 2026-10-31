/* Visual effects: FLIP-style ghosts, particles, damage numbers, synth SFX. */

const layer = () => document.getElementById('fxLayer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let audioCtx = null;
let soundOn = true;
try { soundOn = localStorage.getItem('duel24.sound') !== 'off'; } catch { /* ignore */ }

export function isSoundOn() { return soundOn; }

export function toggleSound() {
  soundOn = !soundOn;
  try { localStorage.setItem('duel24.sound', soundOn ? 'on' : 'off'); } catch { /* ignore */ }
  if (soundOn) sfx('click');
  return soundOn;
}

function ensureAudio() {
  if (!soundOn) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, dur, type = 'sine', vol = 0.06, slide = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur = 0.18, vol = 0.05) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

export function sfx(kind) {
  if (!soundOn) return;
  switch (kind) {
    case 'click': tone(520, 0.05, 'square', 0.025, -180); break;
    case 'select': tone(700, 0.06, 'triangle', 0.03, 120); break;
    case 'summon': tone(120, 0.22, 'sawtooth', 0.05, -50); noise(0.16, 0.03); break;
    case 'extra': tone(180, 0.3, 'sawtooth', 0.06, 120); tone(360, 0.35, 'sine', 0.04, 240); break;
    case 'set': tone(300, 0.07, 'square', 0.03, -80); break;
    case 'draw': tone(820, 0.07, 'triangle', 0.025, 260); break;
    case 'attack': tone(300, 0.12, 'sawtooth', 0.04, -160); noise(0.12, 0.045); break;
    case 'hit': noise(0.2, 0.07); tone(90, 0.18, 'square', 0.05, -40); break;
    case 'destroy': noise(0.3, 0.06); tone(70, 0.25, 'sawtooth', 0.04, -30); break;
    case 'heal': tone(660, 0.18, 'sine', 0.04, 220); tone(880, 0.22, 'sine', 0.03, 120); break;
    case 'buff': tone(520, 0.12, 'triangle', 0.03, 160); break;
    case 'trap': tone(420, 0.1, 'square', 0.045, -240); noise(0.12, 0.03); break;
    case 'win': tone(523, 0.3, 'triangle', 0.05); setTimeout(() => tone(659, 0.3, 'triangle', 0.05), 110); setTimeout(() => tone(784, 0.5, 'triangle', 0.055), 220); break;
    case 'lose': tone(220, 0.5, 'sawtooth', 0.04, -80); break;
    default: break;
  }
}

/* ---------------- ambient ---------------- */
export function initParticles() {
  const host = document.getElementById('particles');
  if (!host || host.childElementCount) return;
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.bottom = `-${Math.random() * 20}%`;
    p.style.animationDuration = `${12 + Math.random() * 18}s`;
    p.style.animationDelay = `${-Math.random() * 30}s`;
    p.style.opacity = String(0.2 + Math.random() * 0.6);
    host.appendChild(p);
  }
}

/* ---------------- capture ---------------- */
export function captureRects() {
  const map = new Map();
  document.querySelectorAll('[data-uid]').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2) return;
    map.set(el.dataset.uid, { el, rect });
  });
  return map;
}

function rectOf(sel) {
  const el = document.querySelector(sel);
  return el ? el.getBoundingClientRect() : null;
}

function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

function addGhost(captured, uid) {
  const rec = captured.get(uid);
  if (!rec) return null;
  const el = rec.el.cloneNode(true);
  el.querySelectorAll('.anim-slam, .anim-set, .anim-draw, .anim-flip, .anim-hit, .anim-lunge, .anim-buff')
    .forEach(n => n.classList.remove('anim-slam', 'anim-set', 'anim-draw', 'anim-flip', 'anim-hit', 'anim-lunge', 'anim-buff'));
  el.classList.add('ghost-card');
  el.style.left = `${rec.rect.left}px`;
  el.style.top = `${rec.rect.top}px`;
  el.style.width = `${rec.rect.width}px`;
  el.style.height = `${rec.rect.height}px`;
  el.style.position = 'fixed';
  layer().appendChild(el);
  return el;
}

function ringAt(x, y, color = '#4de3ff', size = 110) {
  const el = document.createElement('div');
  el.className = 'fx-ring';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `${x - size / 2}px`;
  el.style.top = `${y - size / 2}px`;
  el.style.borderColor = color;
  el.style.boxShadow = `0 0 26px ${color}, inset 0 0 26px ${color}55`;
  layer().appendChild(el);
  const anim = el.animate([
    { transform: 'scale(.15)', opacity: 0.95 },
    { transform: 'scale(1.35)', opacity: 0.35, offset: 0.7 },
    { transform: 'scale(1.8)', opacity: 0 },
  ], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
  anim.finished.then(() => el.remove()).catch(() => el.remove());
}

function sparks(x, y, color = '#ffcf6b', count = 9) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fx-spark';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = color;
    el.style.boxShadow = `0 0 9px ${color}`;
    layer().appendChild(el);
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 24 + Math.random() * 58;
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(.2)`, opacity: 0 },
    ], { duration: 380 + Math.random() * 240, easing: 'cubic-bezier(.1,.7,.3,1)' });
    anim.finished.then(() => el.remove()).catch(() => el.remove());
  }
}

function floatText(text, x, y, cls = 'damage') {
  const el = document.createElement('div');
  el.className = `float-text ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer().appendChild(el);
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(.55)', opacity: 0 },
    { transform: 'translate(-50%,-64%) scale(1.12)', opacity: 1, offset: 0.22 },
    { transform: 'translate(-50%,-135%) scale(1)', opacity: 0 },
  ], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
  anim.finished.then(() => el.remove()).catch(() => el.remove());
}

export function shakeBoard() {
  const board = document.getElementById('board');
  if (!board) return;
  board.classList.remove('shake-board');
  void board.offsetWidth;
  board.classList.add('shake-board');
  setTimeout(() => board.classList.remove('shake-board'), 380);
}

export function flash(color = 'rgba(255,80,100,.22)') {
  const el = document.createElement('div');
  el.className = 'fx-flash';
  el.style.background = `radial-gradient(circle at 50% 50%, ${color}, transparent 68%)`;
  layer().appendChild(el);
  setTimeout(() => el.remove(), 500);
}

function pulseLp(side, cls) {
  const block = document.getElementById(`${side}LpBlock`);
  if (!block) return;
  block.classList.remove(cls);
  void block.offsetWidth;
  block.classList.add(cls);
  setTimeout(() => block.classList.remove(cls), 700);
}

function lpPoint(side) {
  const el = document.getElementById(`${side}LpBlock`);
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * 0.72, y: r.top + r.height / 2 };
}

function elementFor(uid) {
  return document.querySelector(`[data-uid="${uid}"]`);
}

/* ---------------- event playback ---------------- */
export async function playEvents(events, captured, { duel } = {}) {
  const jobs = [];
  const duration = 520;

  for (const ev of events) {
    switch (ev.type) {
      case 'draw': {
        const el = elementFor(ev.uid);
        if (el) { el.classList.remove('anim-draw'); void el.offsetWidth; el.classList.add('anim-draw'); }
        sfx('draw');
        break;
      }
      case 'summon':
      case 'extraSummon': {
        const el = elementFor(ev.uid);
        if (el) {
          const rect = el.getBoundingClientRect();
          el.classList.remove('anim-slam');
          void el.offsetWidth;
          el.classList.add('anim-slam');
          ringAt(rect.left + rect.width / 2, rect.top + rect.height / 2, ev.type === 'extraSummon' ? '#b06bff' : '#4de3ff', ev.type === 'extraSummon' ? 150 : 110);
          sparks(rect.left + rect.width / 2, rect.top + rect.height / 2, ev.type === 'extraSummon' ? '#d0b3ff' : '#7df1ff', 10);
          if (ev.type === 'extraSummon') flash('rgba(160,123,255,.24)');
        }
        sfx(ev.type === 'extraSummon' ? 'extra' : 'summon');
        break;
      }
      case 'set': {
        const el = elementFor(ev.uid);
        if (el) { el.classList.add('anim-set'); }
        sfx('set');
        break;
      }
      case 'activate': {
        const rec = captured.get(ev.uid);
        if (rec) {
          const ghost = addGhost(captured, ev.uid);
          if (ghost) {
            const c = center(rec.rect);
            const anim = ghost.animate([
              { transform: 'translate(0,0) scale(1)', opacity: 1 },
              { transform: `translate(${window.innerWidth / 2 - c.x}px, ${window.innerHeight * 0.42 - c.y}px) scale(1.35) rotate(3deg)`, opacity: 1, offset: 0.55 },
              { transform: `translate(${window.innerWidth / 2 - c.x}px, ${window.innerHeight * 0.42 - c.y}px) scale(.4)`, opacity: 0 },
            ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
            anim.finished.then(() => ghost.remove()).catch(() => ghost.remove());
          }
          const c = center(rec.rect);
          ringAt(window.innerWidth / 2, window.innerHeight * 0.42, '#4de3ff', 160);
          sparks(c.x, c.y, '#7df1ff', 7);
        }
        flash('rgba(77,227,255,.12)');
        sfx('summon');
        break;
      }
      case 'reveal':
      case 'position': {
        const el = elementFor(ev.uid);
        if (el) {
          el.classList.remove('anim-flip');
          void el.offsetWidth;
          el.classList.add('anim-flip');
        }
        sfx('select');
        break;
      }
      case 'attack': {
        if (ev.cancelled) {
          flash('rgba(255,207,107,.18)');
          sfx('trap');
          break;
        }
        const rec = captured.get(ev.attackerUid);
        let targetPoint = null;
        if (ev.target?.kind === 'direct') {
          const p = lpPoint(ev.side === 'you' ? 'opp' : 'you');
          targetPoint = p;
        } else if (ev.targetUid) {
          const tr = captured.get(ev.targetUid);
          if (tr) targetPoint = center(tr.rect);
        }
        if (rec && targetPoint) {
          const ghost = addGhost(captured, ev.attackerUid);
          if (ghost) {
            const c = center(rec.rect);
            const dx = targetPoint.x - c.x;
            const dy = targetPoint.y - c.y;
            const anim = ghost.animate([
              { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
              { transform: 'translate(0,6px) scale(1.1) rotate(-3deg)', opacity: 1, offset: 0.2 },
              { transform: `translate(${dx}px, ${dy}px) scale(1.28) rotate(7deg)`, opacity: 1, offset: 0.62 },
              { transform: `translate(${dx}px, ${dy}px) scale(.55) rotate(12deg)`, opacity: 0 },
            ], { duration: 440, easing: 'cubic-bezier(.2,.85,.2,1)' });
            anim.finished.then(() => ghost.remove()).catch(() => ghost.remove());
          }
          setTimeout(() => {
            ringAt(targetPoint.x, targetPoint.y, '#ff5c6c', ev.direct ? 190 : 130);
            sparks(targetPoint.x, targetPoint.y, '#ffb36b', ev.direct ? 18 : 12);
            shakeBoard();
            sfx('hit');
            if (ev.damage > 0) floatText(`-${ev.damage}`, targetPoint.x, targetPoint.y - 16, 'damage');
          }, 250);
        }
        sfx('attack');
        break;
      }
      case 'damage': {
        const p = lpPoint(ev.side);
        jobs.push((async () => {
          await sleep(120);
          pulseLp(ev.side, 'hit');
          pulseLp(ev.side, 'danger');
          floatText(`-${ev.amount}`, p.x, p.y, 'damage');
          sfx('hit');
        })());
        break;
      }
      case 'heal': {
        const p = lpPoint(ev.side);
        jobs.push((async () => {
          await sleep(120);
          pulseLp(ev.side, 'heal');
          floatText(`+${ev.amount}`, p.x, p.y, 'heal');
          sfx('heal');
        })());
        break;
      }
      case 'buff': {
        const el = elementFor(ev.uid);
        if (el) {
          el.classList.remove('anim-buff');
          void el.offsetWidth;
          el.classList.add('anim-buff');
          const r = el.getBoundingClientRect();
          floatText(`ATK +${ev.amount}`, r.left + r.width / 2, r.top + r.height / 2, 'buff');
        }
        sfx('buff');
        break;
      }
      case 'destroy': {
        const rec = captured.get(ev.uid);
        if (rec) {
          const ghost = addGhost(captured, ev.uid);
          if (ghost) {
            const anim = ghost.animate([
              { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(2)' },
              { transform: 'translate(0,-6px) scale(1.08) rotate(-4deg)', opacity: 1, offset: 0.25, filter: 'brightness(2.4)' },
              { transform: 'translate(0,26px) scale(.72) rotate(16deg)', opacity: 0, filter: 'blur(3px) brightness(.4)' },
            ], { duration: 480, easing: 'cubic-bezier(.3,.1,.6,1)' });
            anim.finished.then(() => ghost.remove()).catch(() => ghost.remove());
          }
          const c = center(rec.rect);
          ringAt(c.x, c.y, '#ffcf6b', 90);
          sparks(c.x, c.y, '#ffcf6b', 8);
        }
        sfx('destroy');
        break;
      }
      case 'toGY': {
        const rec = captured.get(ev.uid);
        if (rec) {
          const gy = rectOf(`#${ev.side}Piles .gy`);
          const ghost = addGhost(captured, ev.uid);
          if (gy && ghost) {
            const from = center(rec.rect);
            const to = center(gy);
            const anim = ghost.animate([
              { transform: 'translate(0,0) scale(1)', opacity: 0.9 },
              { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.28) rotate(-10deg)`, opacity: 0 },
            ], { duration: 420, easing: 'cubic-bezier(.3,.1,.6,1)' });
            anim.finished.then(() => ghost.remove()).catch(() => ghost.remove());
          }
        }
        break;
      }
      case 'win': {
        flash(ev.winner === 'you' ? 'rgba(93,255,176,.3)' : 'rgba(255,77,157,.3)');
        sfx(ev.winner === 'you' ? 'win' : 'lose');
        break;
      }
      case 'deckout': {
        flash('rgba(255,207,107,.2)');
        break;
      }
      default: break;
    }
  }

  await Promise.all([sleep(duration), ...jobs.map(p => p.catch(() => {}))]);
}
