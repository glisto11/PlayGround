/* Shared UI state, modal, toast, card markup. */

import { ATTR, typeLabel } from './cards.js';

export const $ = id => document.getElementById(id);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const app = {
  screen: 'lobby',
  duel: null,
  sel: null,
  busy: false,
  token: 0,
  roomId: null,
  roomRef: null,
  resultShown: false,
  deal: false,
  lastConfig: null,
  seenRooms: new Set(),
  onExitDuel: null,
  onProfileChange: null,
};

let toastTimer = null;

export function toast(text, kind = '', ms = 2600) {
  const host = $('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  host.appendChild(el);
  while (host.childElementCount > 4) host.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === screenId(name)));
  app.screen = name;
  document.body.classList.toggle('duel-open', name === 'duel');
  window.scrollTo(0, 0);
}

function screenId(name) {
  if (name === 'duel') return 'duelScreen';
  if (name === 'room') return 'roomScreen';
  return 'lobby';
}

/* ---------------- modal ---------------- */
export function openModal(html, { locked = false } = {}) {
  const root = $('modalRoot');
  $('modalBody').innerHTML = html;
  root.hidden = false;
  root.dataset.locked = locked ? '1' : '';
  return $('modalBody');
}

export function closeModal(force = false) {
  const root = $('modalRoot');
  if (!root || root.hidden) return;
  if (root.dataset.locked === '1' && !force) return;
  root.hidden = true;
  root.dataset.locked = '';
  $('modalBody').innerHTML = '';
}

export function initCore() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('modalRoot').hidden) closeModal();
      else if (app.sel) {
        app.sel = null;
        if (app.screen === 'duel' && app.renderDuel) app.renderDuel();
      }
    }
  });
}

/* ---------------- card markup ---------------- */
const hash = str => {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  return h;
};

export function cardHTML(card, opts = {}) {
  const {
    hand = false, entry = null, side = 'you', interactive = true, compact = false,
  } = opts;
  const duel = app.duel;
  const hidden = entry?.faceDown && side !== 'you';
  const attr = ATTR[card.attribute] || ATTR.spell;
  const uidAttr = interactive ? ` data-uid="${card.uid}"` : '';
  const delay = `style="--delay:${((hash(card.uid) % 9) * 0.33).toFixed(2)}s"`;

  if (hidden) {
    return `<div class="card card-back"${uidAttr} ${delay}>
      <div class="card-inner">
        <span class="back-emblem">24<span>Z</span></span>
        <span class="back-label">DUEL 24</span>
      </div>
    </div>`;
  }

  const isMonster = card.kind === 'monster';
  const atk = entry && duel ? duel.atkOf(side, entry) : card.atk;
  const def = entry && duel ? duel.defOf(side, entry) : card.def;
  const boosted = isMonster && atk > card.atk;
  const lowered = isMonster && atk < card.atk;
  const setCls = entry?.faceDown ? ' is-set' : '';
  const posBadge = entry && isMonster && !hand
    ? `<span class="pos-badge ${entry.faceDown ? 'def' : entry.position}">${entry.faceDown ? 'SET' : entry.position.toUpperCase()}</span>`
    : '';
  const stars = isMonster ? '★'.repeat(Math.min(card.level || 0, 10)) : '';
  const kindClass = card.kind === 'monster' ? 'card-monster' : card.kind === 'spell' ? 'card-spell' : 'card-trap';
  const typeText = typeLabel(card);
  const foot = isMonster
    ? `<div class="card-foot">
         <span>ATK <b class="${boosted ? 'boost' : lowered ? 'down' : ''}">${atk}</b></span>
         <span>DEF <b>${def}</b></span>
       </div>`
    : `<div class="card-foot"><span>${card.spellType === 'field' ? 'FIELD' : card.kind === 'trap' ? 'TRAP' : 'SPELL'}</span><span>${card.rarity}</span></div>`;

  return `<div class="card ${kindClass} attr-${card.attribute}${setCls}"${uidAttr} ${delay}>
    <div class="card-inner">
      <div class="card-top">
        <span class="card-name">${esc(card.name)}</span>
        <span class="card-stars">${stars}</span>
      </div>
      <div class="card-art">
        <span class="card-rank ${card.rarity === 'UR' ? '' : card.rarity.toLowerCase()}">${card.rarity}</span>
        <span class="card-glyph">${card.glyph || attr.glyph}</span>
      </div>
      <div class="card-type">${typeText}</div>
      ${hand ? `<div class="card-text">${esc(card.text)}</div>` : ''}
      ${foot}
    </div>
    ${posBadge}
  </div>`;
}

export function cardBackHTML() {
  return `<div class="card card-back"><div class="card-inner">
    <span class="back-emblem">24<span>Z</span></span><span class="back-label">DUEL 24</span>
  </div></div>`;
}

export function miniCardHTML(card) {
  const attr = ATTR[card.attribute] || ATTR.spell;
  return `<span class="mini-type" style="--glow:${attr.color}">${card.glyph || attr.glyph}</span>`;
}
