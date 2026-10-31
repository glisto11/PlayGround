/* Duel interactions: input, engine actions, AI loop, modals, results. */

import { typeLabel } from './cards.js';
import { aiChoose } from './ai.js';
import { addResult } from './rooms.js';
import {
  $, app, esc, toast, openModal, closeModal, sleep, miniCardHTML, showScreen, cardHTML,
} from './ui-core.js';
import { captureRects, playEvents, sfx, isSoundOn, toggleSound } from './fx.js';
import { startDuel, renderDuel, canDropOn, showTurnBanner } from './duel-render.js';

export { startDuel };

let aiRunning = false;

export function initDuel() {
  app.renderDuel = renderDuel;
  app.runAiTurn = runAiTurn;
  app.showTurnBanner = showTurnBanner;

  $('leaveDuelBtn').addEventListener('click', confirmLeave);
  $('logBtn').addEventListener('click', openLogModal);
  $('soundBtn').addEventListener('click', e => {
    const on = toggleSound();
    updateSoundBtn();
    toast(on ? 'サウンド ON' : 'サウンド OFF', on ? 'good' : '');
  });
  $('extraBtn').addEventListener('click', openExtraModal);
  $('board').addEventListener('click', onBoardClick);
  $('hand').addEventListener('click', onHandClick);
  $('actionTray').addEventListener('click', onTrayClick);
  $('oppLpBlock').addEventListener('click', onDirectAttack);
  $('youPiles').addEventListener('click', onPileClick);
  $('oppPiles').addEventListener('click', onPileClick);

  $('turnBanner').hidden = true;
  updateSoundBtn();

  document.addEventListener('keydown', e => {
    if (app.screen !== 'duel' || e.key !== ' ' || e.target.tagName === 'INPUT') return;
    if (!$('modalRoot').hidden) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    if (app.duel && !app.duel.winner && !app.busy) {
      e.preventDefault();
      perform({ type: 'end' });
    }
  });
}

function updateSoundBtn() {
  const b = $('soundBtn');
  if (!b) return;
  b.textContent = isSoundOn() ? '♪' : '×';
  b.style.opacity = isSoundOn() ? '1' : '.5';
  b.title = isSoundOn() ? 'サウンド ON' : 'サウンド OFF';
}

/* ---------------- input ---------------- */
function onHandClick(e) {
  const d = app.duel;
  const el = e.target.closest('.hand-card');
  if (!d || !el || app.busy || d.winner || d.turn !== 'you') return;
  const uid = el.dataset.uid;
  if (app.sel?.type === 'hand' && app.sel.uid === uid) {
    app.sel = null;
    renderDuel();
    return;
  }
  const card = d.hand.you.find(c => c.uid === uid);
  if (!card) return;
  app.sel = { type: 'hand', uid, card, action: null };
  sfx('select');
  renderDuel();
}

function onBoardClick(e) {
  const zone = e.target.closest('.zone');
  if (!zone || !app.duel) return;
  handleZone(zone.dataset.side, zone.dataset.kind, Number(zone.dataset.idx));
}

function handleZone(side, kind, idx) {
  const d = app.duel;
  if (!d) return;
  if (d.winner) { if (!app.busy) toast('デュエルは終了しています', 'bad'); return; }
  if (app.busy) return;

  const entry = kind === 'emz' ? d.emz[idx] : d.entryAt(side, kind, idx);

  if (app.sel?.type === 'field' && app.sel.attackReady) {
    if (kind === 'emz') {
      if (entry && entry.owner === 'opp') { doAttack({ kind: 'emz', idx }); return; }
      if (entry && entry.owner === 'you') return;
    } else if (side === 'opp' && kind === 'monster' && entry) {
      doAttack({ kind: 'monster', idx });
      return;
    } else if (side === 'opp' && entry) {
      toast('魔法・罠は攻撃対象にできません', 'bad');
      return;
    }
  }

  if (side === 'you' && app.sel && canDropOn('you', kind, idx)) {
    doDrop(kind, idx);
    return;
  }

  if (kind === 'emz') {
    if (!entry) { app.sel = null; renderDuel(); return; }
    if (entry.owner === 'you') selectField('you', 'emz', idx);
    else openCardDetail(entry.card, entry, 'opp');
    return;
  }

  if (entry && side === 'you') { selectField('you', kind, idx); return; }
  if (entry && side === 'opp') { openCardDetail(entry.card, entry, 'opp'); return; }

  app.sel = null;
  renderDuel();
}

function selectField(side, kind, idx) {
  const d = app.duel;
  const entry = d.entryAt(side, kind, idx);
  if (!entry) return;
  app.sel = { type: 'field', side, kind, idx, card: entry.card, attackReady: false };
  sfx('select');
  renderDuel();
}

function doDrop(kind, idx) {
  const sel = app.sel;
  if (!sel) return;
  if (sel.type === 'extra') {
    perform({ type: 'extra', uid: sel.uid, slot: idx });
    return;
  }
  if (sel.type !== 'hand') return;
  if (sel.card.kind === 'monster') {
    perform({ type: 'summon', uid: sel.uid, zone: idx, mode: sel.action === 'set' ? 'set' : 'atk' });
  } else {
    perform({ type: 'set', uid: sel.uid, zone: idx });
  }
}

function doAttack(target) {
  const sel = app.sel;
  if (!sel || sel.type !== 'field') return;
  perform({ type: 'attack', kind: sel.kind, idx: sel.idx, target });
}

function onDirectAttack() {
  const d = app.duel;
  if (!d || app.busy || d.winner) return;
  const sel = app.sel;
  if (!sel || sel.type !== 'field' || !sel.attackReady) return;
  if (d.ownMonsters('opp').length > 0) {
    toast('相手モンスターがいるため直接攻撃できません', 'bad');
    return;
  }
  doAttack({ kind: 'direct' });
}

/* ---------------- tray ---------------- */
function onTrayClick(e) {
  const b = e.target.closest('[data-tray]');
  if (!b || !app.duel) return;
  const t = b.dataset.tray;
  const d = app.duel;
  const sel = app.sel;

  switch (t) {
    case 'end':
      if (d.turn === 'you' && !app.busy) perform({ type: 'end' });
      break;
    case 'summon':
      if (sel?.type === 'hand') { sel.action = 'summon'; renderDuel(); }
      break;
    case 'set':
      if (sel?.type === 'hand') {
        sel.action = sel.card.kind === 'monster' ? 'set' : 'setSpell';
        renderDuel();
      }
      break;
    case 'activate':
      if (sel?.type === 'hand') perform({ type: 'activateSpell', uid: sel.uid });
      break;
    case 'activateSet':
      if (sel?.type === 'field') perform({ type: 'activateSet', zone: sel.idx });
      break;
    case 'attack':
      if (sel?.type === 'field') {
        sel.attackReady = true;
        sfx('select');
        renderDuel();
        toast('攻撃対象をタップ。相手モンスターがいなければ相手LPをタップ', 'gold');
      }
      break;
    case 'cancelAttack':
      if (sel) { sel.attackReady = false; renderDuel(); }
      break;
    case 'positionAtk':
      if (sel?.type === 'field') perform({ type: 'position', kind: sel.kind, idx: sel.idx, to: 'atk' });
      break;
    case 'positionDef':
      if (sel?.type === 'field') perform({ type: 'position', kind: sel.kind, idx: sel.idx, to: 'def' });
      break;
    case 'detail': {
      if (!sel) break;
      if (sel.type === 'extra') openCardDetail(sel.card, null, 'you');
      else if (sel.type === 'hand') openCardDetail(sel.card, null, 'you');
      else {
        const entry = d.entryAt('you', sel.kind, sel.idx);
        if (entry) openCardDetail(entry.card, entry, 'you');
      }
      break;
    }
    case 'extra':
      openExtraModal();
      break;
    case 'cancel':
      app.sel = null;
      renderDuel();
      break;
    case 'result':
      showResult();
      break;
    default:
      break;
  }
}

/* ---------------- engine actions ---------------- */
function runEngine(action, side) {
  const d = app.duel;
  switch (action.type) {
    case 'summon': return d.normalSummon(side, action.uid, action.zone, action.mode);
    case 'extra': return d.extraSummon(side, action.uid, action.slot);
    case 'activateSpell': return d.activateHandSpell(side, action.uid);
    case 'activateSet': return d.activateSetSpell(side, action.zone);
    case 'set': return d.setSpellTrap(side, action.uid, action.zone);
    case 'attack': return d.attack(side, action.kind, action.idx, action.target);
    case 'position': return d.changePosition(side, action.kind, action.idx, action.to);
    case 'end': return d.endTurn(side);
    default: throw new Error('未対応のアクションです');
  }
}

async function perform(action, { ai = false } = {}) {
  const d = app.duel;
  if (!d || d.winner) return false;
  const side = ai ? 'opp' : 'you';

  if (!ai) {
    if (app.busy || d.turn !== 'you') return false;
    app.busy = true;
  }

  const captured = captureRects();
  let events;
  try {
    events = runEngine(action, side);
  } catch (err) {
    if (!ai) {
      app.busy = false;
      toast(err.message || '実行できません', 'bad');
      sfx('click');
      renderDuel();
    }
    return false;
  }

  app.sel = null;
  renderDuel();
  await playEvents(events, captured, { duel: d });
  if (app.duel !== d) return false;

  if (!ai) {
    app.busy = false;
    renderDuel();
    if (d.winner) onDuelEnd();
    else if (d.turn === 'opp') { await sleep(160); runAiTurn(); }
  }
  return true;
}

/* ---------------- AI ---------------- */
async function runAiTurn() {
  const d = app.duel;
  if (!d || d.winner || aiRunning) return;
  const token = app.token;

  aiRunning = true;
  app.busy = true;
  app.sel = null;
  renderDuel();
  showTurnBannerSafe('opp');
  await sleep(800);

  let guard = 0;
  while (app.duel === d && app.token === token && !d.winner && d.turn === 'opp' && guard++ < 50) {
    const action = aiChoose(d, 'opp');
    if (!action || action.type === 'end') {
      await perform({ type: 'end' }, { ai: true });
      break;
    }
    const ok = await perform(action, { ai: true });
    if (!ok) {
      await perform({ type: 'end' }, { ai: true });
      break;
    }
    await sleep(340);
  }

  aiRunning = false;
  if (app.duel !== d || app.token !== token) return;

  app.busy = false;
  renderDuel();
  if (d.winner) onDuelEnd();
  else {
    showTurnBannerSafe('you');
    toast('あなたのターン', 'good');
  }
}

function showTurnBannerSafe(side) {
  showTurnBanner(side);
}

/* ---------------- extra / piles / card detail ---------------- */
function canExtraNow() {
  const d = app.duel;
  return !!d && d.turn === 'you' && !app.busy && !d.winner && !d.flags.extraSummoned
    && d.extra.you.length > 0 && d.ownMonsters('you').length >= 2 && d.emz.some(e => !e);
}

function openExtraModal() {
  const d = app.duel;
  if (!d || d.winner) return;
  const can = canExtraNow();
  const rows = d.extra.you.map((card, i) => `
    <button class="modal-list-card" data-ex="${i}" ${can ? '' : 'disabled'}>
      ${miniCardHTML(card)}
      <span class="mlc-text"><b>${esc(card.name)}</b><span>${typeLabel(card)} · ${esc(card.text)}</span></span>
      <span class="mlc-stat">ATK ${card.atk}</span>
    </button>
  `).join('');
  const body = openModal(`
    <div class="modal-title">EX召喚</div>
    <p class="modal-sub">モンスター2体を生贄に、中央のEXゾーンへ特殊召喚。1ターンに1回。</p>
    ${can ? '' : '<div class="detail-note">条件未達：自分のモンスター2体以上 / 空きEXゾーン / 1ターン1回 / 自分のターンであること。</div>'}
    <div class="modal-list">${rows || '<p class="tiny">EXデッキが空です。</p>'}</div>
    <div class="modal-actions"><button class="secondary-btn" data-close-modal>閉じる</button></div>
  `);
  body.querySelectorAll('[data-ex]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!can) return;
      const card = d.extra.you[Number(btn.dataset.ex)];
      if (!card) return;
      closeModal();
      app.sel = { type: 'extra', uid: card.uid, card };
      renderDuel();
      toast('空いているEXゾーンを選択（生贄2体）', 'gold');
    });
  });
}

function onPileClick(e) {
  const p = e.target.closest('[data-pile]');
  if (!p) return;
  openPile(p.dataset.side, p.dataset.pile);
}

function openPile(side, type) {
  const d = app.duel;
  if (!d) return;
  const labels = { deck: 'デッキ', gy: '墓地', extra: 'EXデッキ', banished: '除外' };
  const cards = type === 'deck' ? [] : type === 'extra' ? d.extra[side] : type === 'gy' ? d.gy[side] : d.banished[side];
  const title = `${side === 'you' ? '自分' : '相手'}の${labels[type] || type}`;

  if (type === 'deck') {
    openModal(`
      <div class="modal-title">${title}</div>
      <p class="modal-sub">山札の内容は非公開です。</p>
      <div class="detail-note">残り ${d.deck[side].length} 枚。ターン開始時に1枚ドローします。0枚でドローすると敗北。</div>
    `);
    return;
  }

  const rows = cards.slice().reverse().map((c, i) => `
    <button class="modal-list-card" data-index="${i}">
      ${miniCardHTML(c)}
      <span class="mlc-text"><b>${esc(c.name)}</b><span>${typeLabel(c)}</span></span>
      <span class="mlc-stat">${c.kind === 'monster' ? `ATK ${c.atk}<br>DEF ${c.def}` : c.rarity}</span>
    </button>
  `).join('');

  const body = openModal(`
    <div class="modal-title">${title}</div>
    <p class="modal-sub">${cards.length} 枚${type === 'extra' ? ' · 生贄2体でEXゾーンへ' : ''}</p>
    <div class="modal-list">${rows || '<p class="tiny">カードがありません。</p>'}</div>
  `);
  const rev = cards.slice().reverse();
  body.querySelectorAll('[data-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      openCardDetail(rev[Number(btn.dataset.index)], null, side);
    });
  });
}

function openCardDetail(card, entry = null, side = 'you') {
  if (!card) return;
  const d = app.duel;

  if (entry?.faceDown && side !== 'you') {
    openModal(`
      <div class="modal-title">伏せられたカード</div>
      <p class="modal-sub">相手のセットカード</p>
      <div class="detail-note">内容は公開されていません。攻撃するか、効果で破壊すると公開されます。</div>
    `);
    return;
  }

  const atk = entry && d ? d.atkOf(side, entry) : card.atk;
  const def = entry && d ? d.defOf(side, entry) : card.def;
  const stats = card.kind === 'monster'
    ? `<div class="detail-stats">
         <div><span>ATK</span><b>${atk}</b></div>
         <div><span>DEF</span><b>${def}</b></div>
         <div><span>LEVEL</span><b>${card.level}</b></div>
       </div>`
    : `<div class="detail-stats">
         <div><span>TYPE</span><b style="font-size:12px">${esc(typeLabel(card))}</b></div>
         <div><span>RARITY</span><b style="font-size:12px">${card.rarity}</b></div>
       </div>`;

  const note = entry?.faceDown
    ? '<div class="detail-note">このカードはセットされています。攻撃すると公開されます。</div>'
    : card.extra
      ? '<div class="detail-note">EXモンスター：モンスター2体を生贄に、空いているEXゾーンへEX召喚します。</div>'
      : '';

  openModal(`
    <div class="card-detail">
      <div class="detail-card">${cardHTML(card, { entry, side, interactive: false })}</div>
      <div class="detail-info">
        <h3>${esc(card.name)}</h3>
        <div class="detail-meta">${esc(typeLabel(card))} · ${card.rarity}</div>
        <p>${esc(card.text)}</p>
        ${stats}
        ${note}
      </div>
    </div>
  `);
}

/* ---------------- log / leave / result ---------------- */
function openLogModal() {
  const d = app.duel;
  if (!d) return;
  const body = openModal(`
    <div class="modal-title">デュエルログ</div>
    <p class="modal-sub">T${d.turnNo} · ${d.logs.length} entries · ${esc(d.mode)}</p>
    <div class="log-full" id="logFull">
      ${d.logs.map(l => `<div class="log-full-row tone-${l.tone}"><span>T${l.turn}</span><p>${esc(l.text)}</p></div>`).join('')}
    </div>
  `);
  const full = body.querySelector('#logFull');
  if (full) full.scrollTop = full.scrollHeight;
}

function confirmLeave() {
  const d = app.duel;
  if (!d || d.winner) { exitDuel(); return; }
  const body = openModal(`
    <div class="modal-title">デュエルを退出しますか？</div>
    <p class="modal-sub">進行状況は保存されません。ルームには参加したままです。</p>
    <div class="modal-actions">
      <button class="primary-btn" id="leaveYes">退出する</button>
      <button class="secondary-btn" data-close-modal>続ける</button>
    </div>
  `);
  body.querySelector('#leaveYes').addEventListener('click', () => {
    closeModal(true);
    exitDuel();
  });
}

function exitDuel() {
  app.token += 1;
  app.duel = null;
  app.sel = null;
  app.busy = false;
  app.resultShown = false;
  aiRunning = false;
  closeModal(true);
  if (app.onExitDuel) app.onExitDuel();
  else showScreen('lobby');
}

function onDuelEnd() {
  if (!app.duel || app.resultShown) return;
  app.resultShown = true;
  addResult(app.duel.winner === 'you' ? 'win' : 'loss');
  setTimeout(() => {
    if (app.duel && app.duel.winner) showResult();
  }, 700);
}

function showResult() {
  const d = app.duel;
  if (!d) return;
  const win = d.winner === 'you';
  const body = openModal(`
    <div class="result-screen">
      <p class="result-eyebrow">DUEL ${win ? 'WON' : 'LOST'} · ${esc(d.mode)}</p>
      <h2 class="result-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</h2>
      <p class="modal-sub">${esc(d.overReason || '')}</p>
      <div class="result-lp">${d.lp.you.toLocaleString('en-US')} <span>LP</span> — ${d.lp.opp.toLocaleString('en-US')} <span>LP</span></div>
      <div class="result-stats">
        <div><span>TURNS</span><b>${d.turnNo}</b></div>
        <div><span>DECK LEFT</span><b>${d.deck.you.length}</b></div>
        <div><span>GRAVEYARD</span><b>${d.gy.you.length}</b></div>
      </div>
      <div class="modal-actions" style="justify-content:center">
        <button class="primary-btn" data-result="rematch">もう一度</button>
        <button class="secondary-btn" data-result="lobby">ロビーへ</button>
      </div>
    </div>
  `, { locked: true });
  body.querySelectorAll('[data-result]').forEach(btn => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.result;
      closeModal(true);
      if (choice === 'rematch' && app.lastConfig) startDuel(app.lastConfig);
      else exitDuel();
    });
  });
  sfx(win ? 'win' : 'lose');
}
