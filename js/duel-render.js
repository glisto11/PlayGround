/* Duel board rendering, start duel, tray, turn banner. */

import { ATTR, DECKS } from './cards.js';
import { Duel } from './engine.js';
import { profile, avatarColor, initials } from './rooms.js';
import {
  $, app, esc, cardHTML, showScreen, toast, sleep,
} from './ui-core.js';
import { sfx } from './fx.js';

/* ---------------- start ---------------- */
export function startDuel({ oppName, oppDeckId, modeLabel = 'SOLO', roomCode = 'SOLO', lp = 8000 }) {
  const deckId = DECKS[profile.deckId] ? profile.deckId : 'flame';
  const duel = new Duel({
    playerName: profile.name,
    oppName,
    deckId,
    oppDeckId: DECKS[oppDeckId] ? oppDeckId : 'abyss',
    lp,
    mode: modeLabel,
  });

  app.token += 1;
  app.duel = duel;
  app.sel = null;
  app.busy = false;
  app.resultShown = false;
  app.deal = true;
  app.lastConfig = { oppName, oppDeckId, modeLabel, roomCode, lp };

  showScreen('duel');
  $('duelModeLabel').textContent = modeLabel;
  $('duelRoomLabel').textContent = roomCode === 'SOLO' ? 'SOLO TRAINING' : `ROOM ${roomCode}`;
  $('turnBanner').hidden = true;

  renderDuel();
  showTurnBanner(duel.turn);
  toast(`デュエル開始 — ${oppName}`, 'gold');
  setTimeout(() => { app.deal = false; }, 1100);

  if (duel.turn === 'opp') setTimeout(() => app.runAiTurn?.(), 1050);
}

/* ---------------- render ---------------- */
export function renderDuel() {
  const d = app.duel;
  if (!d) return;
  renderNames(d);
  renderSide('opp', d);
  renderSide('you', d);
  $('oppFieldSlot').innerHTML = zoneHTML('opp', 'field', 0, d.field.opp.field);
  $('youFieldSlot').innerHTML = zoneHTML('you', 'field', 0, d.field.you.field);
  renderEmz(d);
  renderLP(d);
  renderPiles(d);
  renderHand(d);
  renderLog(d);
  renderTurn(d);
  renderTray(d);
  $('oppLpBlock').classList.toggle(
    'targetable',
    !!(app.sel?.type === 'field' && app.sel.attackReady && d.ownMonsters('opp').length === 0 && !d.winner),
  );
  $('handTip').textContent = d.winner
    ? 'デュエル終了'
    : app.busy ? '処理中…'
      : d.turn === 'opp' ? '相手のターン'
        : app.sel?.action === 'special'
          ? (app.sel.release ? '空きモンスターゾーンを選択' : 'リリースするモンスターを選択')
          : app.sel?.action ? '光っているゾーンを選択'
            : 'カードをタップして選択';
}

function renderNames(d) {
  $('youName').textContent = d.names.you;
  $('youTag').textContent = 'CHALLENGER';
  $('oppName').textContent = d.names.opp;
  $('oppTag').textContent = d.mode === 'SOLO' ? 'SOLO CPU' : 'ONLINE DUELIST';
  const ya = $('youAvatar');
  ya.textContent = initials(d.names.you);
  ya.style.background = `linear-gradient(140deg, ${avatarColor(d.names.you)}, #6c8dff)`;
  const oa = $('oppAvatar');
  oa.textContent = initials(d.names.opp);
  oa.style.background = `linear-gradient(140deg, ${avatarColor(d.names.opp)}, #ff5ca8)`;
}

function renderSide(side, d) {
  const monsters = d.field[side].monster.map((e, i) => zoneHTML(side, 'monster', i, e)).join('');
  const spells = d.field[side].spell.map((e, i) => zoneHTML(side, 'spell', i, e)).join('');
  const m = `<div class="zone-row">${monsters}</div>`;
  const s = `<div class="zone-row">${spells}</div>`;
  $(side + 'Rows').innerHTML = side === 'opp' ? s + m : m + s;
}

function renderEmz(d) {
  $('emzArea').innerHTML = [0, 1].map(i => {
    const entry = d.emz[i];
    const owner = entry?.owner || 'you';
    return `<div class="emz-slot-wrap">
      ${zoneHTML(owner, 'emz', i, entry)}
      <span class="emz-caption">EX ${i + 1}</span>
    </div>`;
  }).join('');
}

function zoneNumber(side, kind, idx) {
  if (kind === 'monster') return (side === 'you' ? 1 : 12) + idx;
  if (kind === 'spell') return (side === 'you' ? 6 : 17) + idx;
  if (kind === 'field') return side === 'you' ? 11 : 22;
  return 23 + idx;
}

function zoneHTML(side, kind, idx, entry) {
  const d = app.duel;
  const znum = zoneNumber(side, kind, idx);
  const state = zoneState(side, kind, idx, entry);
  const cls = ['zone'];
  if (kind === 'field') cls.push('zone-field');
  if (kind === 'emz') cls.push('zone-emz');
  if (state.valid) cls.push('valid');
  if (state.targetable) cls.push('targetable');
  if (state.selected) cls.push('selected');
  if (state.releaseable) cls.push('releaseable');
  if (state.releasePicked) cls.push('release-picked');
  if (entry) cls.push('hoverable');

  const emptyLabel = kind === 'monster' ? ['MON', '+'] : kind === 'spell' ? ['S/T', '+'] : kind === 'field' ? ['FIELD', 'F'] : ['EX', 'EX'];
  const body = entry
    ? cardHTML(entry.card, { entry, side, interactive: true })
    : `<div class="zone-empty-label"><b>${emptyLabel[1]}</b>${emptyLabel[0]}</div>`;

  return `<div class="${cls.join(' ')}" data-side="${side}" data-kind="${kind}" data-idx="${idx}" role="button" aria-label="ゾーン${znum} ${kind}">
    <span class="znum">Z${String(znum).padStart(2, '0')}</span>${body}
  </div>`;
}

function zoneState(side, kind, idx, entry) {
  const d = app.duel;
  let valid = false;
  let targetable = false;
  let selected = false;
  let releaseable = false;
  let releasePicked = false;
  if (!d) return { valid, targetable, selected, releaseable, releasePicked };

  valid = canDropOn(side, kind, idx);
  if (app.sel?.type === 'field' && app.sel.attackReady) {
    if (kind === 'emz') targetable = !!entry && entry.owner === 'opp';
    else if (side === 'opp' && kind === 'monster' && entry) targetable = true;
  }
  if (app.sel?.type === 'field' && !app.sel.attackReady) {
    if (kind === 'emz') selected = !!entry && entry.owner === 'you' && app.sel.kind === 'emz' && app.sel.idx === idx;
    else selected = side === 'you' && app.sel.kind === kind && app.sel.idx === idx;
  }
  if (app.sel?.type === 'hand' && app.sel.action === 'special') {
    const ownMonster = side === 'you' && entry && !entry.faceDown
      && (kind === 'monster' || (kind === 'emz' && entry.owner === 'you'));
    const picked = app.sel.release
      && app.sel.release.kind === kind && app.sel.release.idx === idx;
    if (picked) releasePicked = true;
    else if (ownMonster) releaseable = true;
  }
  return { valid, targetable, selected, releaseable, releasePicked };
}

export function canDropOn(side, kind, idx) {
  const d = app.duel;
  if (!d || !app.sel || side !== 'you' || d.turn !== 'you' || app.busy || d.winner) return false;
  const empty = kind === 'emz' ? !d.emz[idx] : !d.entryAt('you', kind, idx);
  if (!empty) return false;
  if (app.sel.type === 'extra') return kind === 'emz';
  if (app.sel.type !== 'hand' || !app.sel.action) return false;
  if (app.sel.action === 'special') {
    return kind === 'monster' && app.sel.card.kind === 'monster' && !!app.sel.release;
  }
  if (app.sel.action === 'summon' || app.sel.action === 'set') {
    return kind === 'monster' && app.sel.card.kind === 'monster' && !app.sel.card.specialSummon;
  }
  if (app.sel.action === 'setSpell') return kind === 'spell';
  return false;
}

/* ---------------- LP / piles / hand ---------------- */
function renderLP(d) {
  for (const side of ['you', 'opp']) {
    const lp = d.lp[side];
    const pct = Math.max(0, Math.min(100, (lp / Math.max(1, d.startLp)) * 100));
    $(side + 'Lp').textContent = lp.toLocaleString('en-US');
    $(side + 'LpFill').style.width = `${pct}%`;
    $(side + 'LpBlock').classList.toggle('danger', lp <= 2000);
  }
}

function pileHTML(side, type, label, count, cls) {
  return `<button class="pile ${cls}" data-pile="${type}" data-side="${side}" title="${label}">
    <span>${label}</span><b>${count}</b>
  </button>`;
}

function renderPiles(d) {
  for (const side of ['you', 'opp']) {
    $(side + 'Piles').innerHTML =
      pileHTML(side, 'deck', 'DECK', d.deck[side].length, 'deck') +
      pileHTML(side, 'gy', 'GY', d.gy[side].length, 'gy') +
      pileHTML(side, 'extra', 'EX', d.extra[side].length, 'extra') +
      pileHTML(side, 'banished', 'BAN', d.banished[side].length, 'banished');
  }
}

function renderHand(d) {
  $('handCount').textContent = d.hand.you.length;
  $('exCount').textContent = d.extra.you.length;
  const cards = d.hand.you;
  if (!cards.length) {
    $('hand').innerHTML = '<div class="hand-empty">手札なし<br>相手のターンを待つ</div>';
    return;
  }
  $('hand').style.setProperty('--hand-n', cards.length);
  $('hand').innerHTML = cards.map(c => {
    const selected = app.sel?.type === 'hand' && app.sel.uid === c.uid;
    return `<button class="hand-card ${selected ? 'selected' : ''}" data-uid="${c.uid}" aria-label="${esc(c.name)}">
      ${cardHTML(c, { hand: true, interactive: false })}
    </button>`;
  }).join('');

  if (app.deal) {
    [...$('hand').children].forEach((el, i) => {
      el.classList.add('anim-draw');
      el.style.animationDelay = `${i * 65}ms`;
    });
    setTimeout(() => {
      [...$('hand').children].forEach(el => {
        el.classList.remove('anim-draw');
        el.style.animationDelay = '';
      });
    }, 1000);
  }
}

/* ---------------- log / turn / tray ---------------- */
function renderLog(d) {
  const logs = d.logs.slice(-3);
  $('logStrip').innerHTML = logs.map(l => `<div class="log-item"><span>${esc(l.text)}</span></div>`).join('')
    + `<span class="log-turn">T${d.turnNo} · ${d.logs.length} LOG</span>`;
}

function renderTurn(d) {
  const pill = $('turnPill');
  pill.classList.toggle('opp', !d.winner && d.turn === 'opp');
  pill.classList.toggle('over', !!d.winner);
  pill.querySelector('span').textContent = d.winner ? 'DUEL OVER' : d.turn === 'you' ? 'YOUR TURN' : 'OPPONENT TURN';
  $('turnNo').textContent = `T${d.turnNo}`;
}

function chipHTML(card) {
  const color = ATTR[card.attribute]?.color || '#4de3ff';
  return `<span class="tray-card-name" style="--accent:${color}"><span class="dot"></span><span>${esc(card.name)}</span></span>`;
}

function btn(label, key, cls = '', disabled = false) {
  return `<button class="tray-btn ${cls}" data-tray="${key}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}

function canEx() {
  const d = app.duel;
  return !!d && d.turn === 'you' && !app.busy && !d.winner && !d.flags.extraSummoned
    && d.extra.you.length > 0 && d.ownMonsters('you').length >= 2 && d.emz.some(e => !e);
}

function renderTray(d) {
  const tray = $('actionTray');
  if (!d) { tray.innerHTML = ''; return; }
  if (d.winner) {
    tray.innerHTML = `<span class="tray-hint"><i></i>デュエル終了 — ${d.winner === 'you' ? '勝利' : '敗北'}</span><span class="tray-spacer"></span>${btn('結果を見る', 'result', 'gold')}`;
    return;
  }
  if (app.busy) {
    tray.innerHTML = `<span class="tray-hint"><i></i>${d.turn === 'you' ? 'カードを処理中…' : '相手が考えています…'}</span><span class="tray-spacer"></span>${btn('EX召喚', 'none', '', true)}${btn('ターン終了', 'none', 'gold', true)}`;
    return;
  }
  if (d.turn !== 'you') {
    tray.innerHTML = `<span class="tray-hint"><i></i>相手のターン — カードが動きます</span><span class="tray-spacer"></span>${btn('EX召喚', 'none', '', true)}${btn('ターン終了', 'none', 'gold', true)}`;
    return;
  }

  const sel = app.sel;
  if (!sel) {
    tray.innerHTML = `<span class="tray-hint"><i></i>カードをタップして選択</span><span class="tray-spacer"></span>
      ${btn('EX召喚', 'extra', '', !canEx())}${btn('ターン終了', 'end', 'gold')}`;
    return;
  }

  if (sel.type === 'hand') {
    const c = sel.card;
    if (sel.action === 'special') {
      const rel = sel.release;
      const releaseEntry = rel ? d.entryAt('you', rel.kind, rel.idx) : null;
      const label = rel ? '空きモンスターゾーンを選択' : 'リリースする自分のモンスターを選択';
      const note = releaseEntry
        ? `リリース：${esc(releaseEntry.card.name)}（DEF ${d.defOf('you', releaseEntry)}）`
        : 'モンスター1体をリリース';
      tray.innerHTML = `${chipHTML(c)}<span class="tray-hint"><i></i>${label}</span>
        ${btn('キャンセル', 'cancel')}<span class="tray-spacer"></span><span class="tray-turn">${note}</span>`;
      return;
    }
    if (sel.action) {
      const label = sel.action === 'setSpell' ? '魔法・罠ゾーンを選択' : 'モンスターゾーンを選択';
      tray.innerHTML = `${chipHTML(c)}<span class="tray-hint"><i></i>${label}</span><span class="tray-spacer"></span>${btn('キャンセル', 'cancel')}`;
      return;
    }
    if (c.kind === 'monster') {
      if (c.specialSummon) {
        const check = d.canSpecialSummon('you', c.uid);
        const note = check.ok ? `リリース${check.need}体 → 特殊召喚` : check.reason;
        tray.innerHTML = `${chipHTML(c)}
          ${btn('特殊召喚', 'special', 'primary', !check.ok)}${btn('詳細', 'detail')}
          <span class="tray-spacer"></span><span class="tray-turn">${esc(note)}</span>`;
        return;
      }
      const need = d.tributesNeeded(c.level);
      const enough = d.ownMonsters('you').length >= need;
      const dis = d.flags.summoned || !enough;
      const note = d.flags.summoned ? 'このターン召喚済み' : !enough ? `生贄${need}体が必要` : need ? `生贄 ${need}体（自動）` : '召喚可';
      tray.innerHTML = `${chipHTML(c)}
        ${btn('召喚', 'summon', 'primary', dis)}${btn('セット', 'set', '', dis)}
        ${btn('詳細', 'detail')}<span class="tray-spacer"></span><span class="tray-turn">${note}</span>`;
      return;
    }
    if (c.kind === 'spell') {
      const canSet = c.spellType !== 'field';
      tray.innerHTML = `${chipHTML(c)}${btn('発動', 'activate', 'primary')}
        ${canSet ? btn('セット', 'set') : ''}${btn('詳細', 'detail')}
        <span class="tray-spacer"></span><span class="tray-turn">魔法${c.spellType === 'field' ? '／フィールド' : ''}</span>`;
      return;
    }
    tray.innerHTML = `${chipHTML(c)}${btn('セット', 'set', 'primary')}${btn('詳細', 'detail')}<span class="tray-spacer"></span><span class="tray-turn">罠</span>`;
    return;
  }

  if (sel.type === 'extra') {
    tray.innerHTML = `${chipHTML(sel.card)}<span class="tray-hint"><i></i>空いているEXゾーンを選択（生贄2体）</span><span class="tray-spacer"></span>${btn('キャンセル', 'cancel')}`;
    return;
  }

  if (sel.type === 'field') {
    const entry = d.entryAt('you', sel.kind, sel.idx);
    if (!entry) { app.sel = null; renderTray(d); return; }
    const card = entry.card;

    if (card.kind === 'monster') {
      if (sel.attackReady) {
        tray.innerHTML = `${chipHTML(card)}<span class="tray-hint"><i></i>攻撃対象をタップ（相手LPで直接攻撃）</span><span class="tray-spacer"></span>${btn('やめる', 'cancelAttack')}${btn('詳細', 'detail')}`;
        return;
      }
      const canAtk = !entry.faceDown && entry.position === 'atk' && !entry.attacked;
      const canPos = entry.summonedTurn !== d.turnNo;
      const posBtn = canPos
        ? (entry.position === 'atk' && !entry.faceDown
          ? btn('守備表示', 'positionDef')
          : btn('攻撃表示', 'positionAtk'))
        : '';
      const note = entry.attacked ? '攻撃済み' : entry.faceDown ? 'セット' : entry.position === 'atk' ? `ATK ${d.atkOf('you', entry)}` : `DEF ${d.defOf('you', entry)}`;
      tray.innerHTML = `${chipHTML(card)}
        ${canAtk ? btn('攻撃', 'attack', 'primary') : ''}
        ${posBtn}${btn('詳細', 'detail')}${btn('キャンセル', 'cancel')}
        <span class="tray-spacer"></span><span class="tray-turn">${note}</span>`;
      return;
    }

    if (card.kind === 'spell' && entry.faceDown) {
      tray.innerHTML = `${chipHTML(card)}${btn('発動', 'activateSet', 'primary')}${btn('詳細', 'detail')}${btn('キャンセル', 'cancel')}<span class="tray-spacer"></span><span class="tray-turn">伏せ魔法</span>`;
      return;
    }
    if (card.kind === 'trap') {
      tray.innerHTML = `${chipHTML(card)}<span class="tray-hint"><i></i>伏せ罠 — 相手の攻撃時に自動発動</span><span class="tray-spacer"></span>${btn('詳細', 'detail')}${btn('キャンセル', 'cancel')}`;
      return;
    }
    tray.innerHTML = `${chipHTML(card)}${btn('詳細', 'detail')}${btn('キャンセル', 'cancel')}<span class="tray-spacer"></span><span class="tray-turn">${card.spellType === 'field' ? 'フィールド魔法 発動中' : 'セット済み'}</span>`;
  }
}

/* ---------------- banner ---------------- */
export function showTurnBanner(side) {
  const d = app.duel;
  const el = $('turnBanner');
  if (!d || !el) return;
  el.hidden = false;
  el.className = `turn-banner ${side === 'you' ? 'you' : 'opp'}`;
  el.querySelector('span').textContent = `TURN ${d.turnNo}`;
  el.querySelector('b').textContent = side === 'you' ? 'YOUR TURN' : 'OPPONENT TURN';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.hidden = true; }, 1150);
  sfx('select');
}

let bannerTimer = null;
