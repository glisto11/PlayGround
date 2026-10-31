import {
  createGame,
  applyAction,
  aiTurn,
  attackInfo,
  attackTargets,
  playableZones,
  canNormalSummon,
  statsOf,
  monsterZones,
  stZones,
  emptyMonsterZones,
  emptySTZones,
  normalSummonTributes,
  isMonsterSlot,
  isSTSlot,
  isFieldSlot,
  zoneKind,
  zoneLabel,
  zoneName,
  zoneNumber,
  TOTAL_ZONES,
  START_LP,
  EXTRA_ZONE,
  FIELD_ZONE,
  MONSTER_ZONES,
  otherSide,
} from './engine.js';
import { ELEMENTS } from './cards.js';
import { avatarGlyph } from './art.js';
import { Sound } from './audio.js';
import {
  loadProfile,
  saveProfile,
  createOwnRoom,
  createRivalRooms,
  createSoloRoom,
  refreshRooms,
  pickBot,
} from './lobby.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const RARITY = {
  common: '#7d8da3',
  rare: '#3fa9ff',
  epic: '#b06bff',
  legendary: '#ffb84d',
};

const S = {
  profile: null,
  rooms: [],
  ownRoomId: null,
  currentRoomId: null,
  activeRoom: null,
  mode: 'online',
  soloDifficulty: 'normal',
  game: null,
  ui: {
    selectedHand: null,
    selectedZone: null,
    setMode: false,
    tribute: null,
    busy: false,
    auto: false,
    filter: 'all',
    search: '',
    logOpen: false,
    sidebarOpen: false,
    resultShown: false,
    lastHand: new Set(),
    introDone: false,
  },
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ESCAPES[char]);
const escapeAttr = escapeHtml;

function hexA(hex, alpha) {
  const raw = String(hex || '#7d8da3').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const number = parseInt(full, 16);
  if (Number.isNaN(number)) return `rgba(125, 141, 163, ${alpha})`;
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function elementOf(card) {
  return ELEMENTS[card.element] || ELEMENTS.fire;
}

function abilityShort(card) {
  if (!card.ability) return '';
  if (card.ability.type === 'burn') return `BURN ${card.ability.value}`;
  if (card.ability.type === 'heal') return `HEAL ${card.ability.value}`;
  if (card.ability.type === 'destroy') return 'DESTROY 1';
  if (card.ability.type === 'draw') return `DRAW ${card.ability.value}`;
  if (card.ability.type === 'storm') return 'STORM';
  if (card.ability.type === 'mirror') return 'MIRROR';
  if (card.ability.type === 'cylinder') return 'CYLINDER';
  if (card.ability.type === 'field') return `ATK/DEF +${card.ability.value}`;
  return '';
}

function kindBadge(card) {
  if (card.kind === 'monster') return `L${card.level}`;
  if (card.kind === 'spell') return 'SP';
  if (card.kind === 'trap') return 'TR';
  if (card.kind === 'field') return 'FD';
  return '?';
}

function kindLabel(card) {
  if (card.kind === 'monster') return `${card.race}`;
  if (card.kind === 'spell') return '魔法';
  if (card.kind === 'trap') return '罠';
  if (card.kind === 'field') return 'フィールド魔法';
  return '';
}

function padZone(number) {
  return String(number).padStart(2, '0');
}

function isPlayerTurn() {
  return Boolean(S.game && S.game.phase === 'playing' && S.game.turn === 'player');
}

function canAct() {
  return isPlayerTurn() && !S.ui.busy && !S.ui.auto;
}

function rectOf(element) {
  return element ? element.getBoundingClientRect() : null;
}

function getZoneEl(side, zone) {
  return document.querySelector(`.zone[data-side="${side}"][data-zone="${zone}"]`);
}

function getCardEl(side, zone) {
  return document.querySelector(`.zone[data-side="${side}"][data-zone="${zone}"] .field-card`);
}

function getHandEl(uid) {
  return document.querySelector(`[data-hand-uid="${uid}"]`);
}

function getReadyAttackers() {
  if (!S.game || !S.game.battlePhase) return [];
  const field = S.game.sides.player.field;
  return monsterZones(S.game.sides.player)
    .filter(zone => {
      const card = field[zone];
      return card && card.position === 'attack' && !card.faceDown && !card.hasAttacked;
    });
}

function selectedAttackInfo() {
  if (!canAct() || S.ui.selectedZone === null || !S.game.battlePhase) return null;
  const card = S.game.sides.player.field[S.ui.selectedZone];
  if (!card || card.kind !== 'monster' || card.position !== 'attack' || card.faceDown || card.hasAttacked) return null;
  return attackInfo(S.game, 'player', S.ui.selectedZone);
}

function selectedFieldCard() {
  if (!S.game || S.ui.selectedZone === null) return null;
  return S.game.sides.player.field[S.ui.selectedZone] || null;
}

function canTributeSummon(card) {
  if (!card || card.kind !== 'monster') return false;
  return canNormalSummon(S.game, 'player', card);
}

// ------------------------------------------------------------------ boot

function init() {
  S.profile = loadProfile();
  if (!S.profile.roomCode) S.profile.roomCode = createOwnRoom(S.profile).code;
  saveProfile(S.profile);
  Sound.setEnabled(Boolean(S.profile.sound));

  const own = createOwnRoom(S.profile, pickBot());
  S.ownRoomId = own.id;
  S.rooms = createRivalRooms(S.profile, own);
  S.currentRoomId = own.id;

  bindEvents();
  startStars();
  startDuel(own);

  showToast('ROOM CREATED', `自分のルーム #${own.code} を生成し、自動参加しました。`, 'ok', 5200);
  setTimeout(() => {
    showToast('MATCH FOUND', `${own.opponent.name} がルームに参加。LP ${START_LP} / ${TOTAL_ZONES} ZONES。`, 'ok', 4400);
  }, 1100);
  setTimeout(() => {
    S.ui.introDone = true;
    document.body.dataset.ready = 'true';
  }, 1400);

  setInterval(() => {
    const count = 1180 + S.rooms.length * 7 + Math.floor(Math.random() * 96);
    $('#online-count').textContent = count.toLocaleString('en-US');
  }, 9000);
}

function startDuel(room, mode = 'online') {
  const opponent = room.opponent || pickBot();
  room.opponent = opponent;
  room.status = 'dueling';
  room.players = 2;
  S.mode = mode;
  S.activeRoom = room;
  S.currentRoomId = mode === 'online' ? room.id : null;
  S.game = createGame({
    seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
    playerName: S.profile.name,
    enemyName: opponent.name,
    playerRank: S.profile.rank,
    enemyRank: opponent.rank,
  });
  S.ui.selectedHand = null;
  S.ui.selectedZone = null;
  S.ui.setMode = false;
  S.ui.tribute = null;
  S.ui.busy = false;
  S.ui.auto = false;
  S.ui.resultShown = false;
  S.ui.lastHand = new Set();
  $('#result-overlay').hidden = true;
  buildHud('enemy');
  buildHud('player');
  renderAll();
  showBanner('DUEL START', '', 1000);
  Sound.turn();
}

function startSolo(difficulty = S.soloDifficulty) {
  S.soloDifficulty = difficulty;
  const room = createSoloRoom(S.profile, difficulty);
  closeSidebar();
  startDuel(room, 'solo');
  showBanner('SOLO DUEL', 'solo', 1100);
  showToast('SOLO MODE', `${room.opponent.name}（CPU）とのソロ対戦を開始しました。`, 'ok', 3000);
}

// ------------------------------------------------------------------ hud

function buildHud(side) {
  const root = document.getElementById(side === 'enemy' ? 'enemy-hud' : 'player-hud');
  const g = S.game.sides[side];
  const enemy = side === 'enemy';
  root.innerHTML = `
    <div class="avatar">${escapeHtml(avatarGlyph(g.name))}<span class="lv">${enemy ? 'AI' : `LV ${S.profile.level}`}</span></div>
    <div class="hud-main">
      <div class="hud-top">
        <span class="hud-name">${escapeHtml(g.name)}</span>
        <span class="hud-rank">${escapeHtml(g.rank)}</span>
        <span class="hud-tag">DECK <b data-deck>${g.deck.length}</b> / HAND <b data-hand>${g.hand.length}</b> / GY <b data-gy>${g.graveyard.length}</b></span>
      </div>
      <div class="lp-row">
        <span class="lp-label">LP</span>
        <div class="lp-bar" id="${side}-lp-bar"><i class="lp-fill" id="${side}-lp-fill"></i></div>
        <span class="lp-num" id="${side}-lp-num">${g.lp}<small>/${g.maxLp}</small></span>
      </div>
    </div>
    <div class="hud-right">
      <div class="hand-badge"><b data-hand-badge>${g.hand.length}</b><span>HAND</span></div>
    </div>
  `;
  root.classList.toggle('enemy-hud', enemy);
  root.classList.toggle('player-hud', !enemy);
  updateHud(side);
}

function updateHud(side) {
  if (!S.game) return;
  const g = S.game.sides[side];
  const root = document.getElementById(side === 'enemy' ? 'enemy-hud' : 'player-hud');
  const deck = root.querySelector('[data-deck]');
  const hand = root.querySelector('[data-hand]');
  const gy = root.querySelector('[data-gy]');
  const badge = root.querySelector('[data-hand-badge]');
  if (deck) deck.textContent = g.deck.length;
  if (hand) hand.textContent = g.hand.length;
  if (gy) gy.textContent = g.graveyard.length;
  if (badge) badge.textContent = g.hand.length;
  const bar = document.getElementById(`${side}-lp-bar`);
  const fill = document.getElementById(`${side}-lp-fill`);
  const number = document.getElementById(`${side}-lp-num`);
  if (fill) fill.style.width = `${Math.max(0, (g.lp / g.maxLp) * 100)}%`;
  if (number) number.innerHTML = `${Math.max(0, g.lp)}<small>/${g.maxLp}</small>`;
  if (bar) {
    bar.classList.toggle('low', g.lp > 0 && g.lp <= g.maxLp * 0.3);
    bar.classList.toggle('zero', g.lp <= 0);
  }
}

// ---------------------------------------------------------------- render

function renderAll() {
  if (!S.game) return;
  if (S.ui.selectedZone !== null && !S.game.sides.player.field[S.ui.selectedZone]) S.ui.selectedZone = null;
  if (S.ui.selectedHand !== null && !S.game.sides.player.hand.some(card => card.uid === S.ui.selectedHand)) S.ui.selectedHand = null;
  if (S.ui.tribute) {
    const t = S.ui.tribute;
    const stillValid = S.game.sides.player.hand.some(card => card.uid === t.handUid)
      && !S.game.sides.player.field[t.zone];
    if (!stillValid) S.ui.tribute = null;
  }
  updateHud('enemy');
  updateHud('player');
  renderBoard();
  renderHand();
  renderControls();
  renderLog();
  renderMode();
  renderSoloCard();
  renderMyRoom();
  renderRoomList();
  renderProfile();
}

const MONSTER_ROW = [0, 1, 2, 3, 4, EXTRA_ZONE];
const ST_ROW = [5, 6, 7, 8, 9, FIELD_ZONE];

function renderBoard() {
  const board = $('#board');
  const info = selectedAttackInfo();
  const selectedHand = S.ui.selectedHand !== null
    ? S.game.sides.player.hand.find(card => card.uid === S.ui.selectedHand)
    : null;
  const playable = selectedHand && canAct() ? playableZones(S.game, 'player', selectedHand) : [];
  const context = { info, playable, tribute: S.ui.tribute };

  const rows = [
    renderBoardRow('enemy', 'spell', context),
    renderBoardRow('enemy', 'monster', context),
    `<div class="board-mid"><span>ENEMY FIELD</span><b>DUEL 24 / YGO RULES</b><span>PLAYER FIELD</span></div>`,
    renderBoardRow('player', 'monster', context),
    renderBoardRow('player', 'spell', context),
  ];
  board.innerHTML = rows.join('');
}

function renderBoardRow(side, rowKind, context) {
  const zones = rowKind === 'spell' ? ST_ROW : MONSTER_ROW;
  const cells = zones.map(zone => renderZone(side, zone, context));
  const label = rowKind === 'spell' ? '魔法・罠' : 'モンスター';
  const english = rowKind === 'spell' ? 'SPELL / TRAP' : 'MONSTER';
  return `<div class="board-row ${side} ${rowKind}-row">
    <div class="row-label"><span>${label}</span><span>${english}</span></div>
    ${cells.join('')}
  </div>`;
}

function renderZone(side, zone, context) {
  const s = S.game.sides[side];
  const card = s.field[zone];
  const kind = zoneKind(zone);
  const classes = ['zone', `${kind}-zone`];
  if (side === 'enemy') classes.push('enemy-side');
  let extra = '';
  let aria = `${side === 'enemy' ? '相手' : '自分'} ${zoneName(zone)}`;

  if (!card) {
    if (side === 'player' && canAct() && context.playable.includes(zone)) {
      classes.push('playable');
      extra = '<span class="zone-plus">+</span>';
    }
    aria += ' 空きゾーン';
  } else {
    const stats = card.kind === 'monster' ? statsOf(S.game, side, card) : null;
    aria += ` ${card.faceDown ? 'セットカード' : card.name}`;
    if (stats) aria += ` ATK ${stats.atk} DEF ${stats.def}`;
    if (side === 'player' && S.ui.selectedZone === zone) classes.push('selected');
    if (side === 'enemy' && context.info && context.info.targets.includes(zone)) classes.push('attack-target');
    if (side === 'player' && canAct() && S.game.battlePhase && card.kind === 'monster' && card.position === 'attack' && !card.faceDown && !card.hasAttacked) classes.push('ready');
    if (card.hasAttacked) classes.push('exhausted');
    if (card.faceDown) classes.push('face-down');
    if (card.position === 'defense') classes.push('defense');
    if (context.tribute && side === 'player' && isMonsterSlot(zone) && zone !== context.tribute.zone) {
      classes.push('tribute-target');
      if (context.tribute.selected.includes(zone)) classes.push('tribute-selected');
    }
  }

  const content = card ? renderFieldCard(card, side, zone) : extra;
  return `<div class="${classes.join(' ')}" role="button" tabindex="0" data-side="${side}" data-zone="${zone}" aria-label="${escapeAttr(aria)}">
    <span class="zone-no">${padZone(zoneNumber(side, zone))}</span>
    <span class="zone-col">${zoneLabel(zone)}</span>
    ${content}
  </div>`;
}

function renderFieldCard(card, side, zone) {
  const el = elementOf(card);
  const rarity = RARITY[card.rarity] || RARITY.common;
  const floatDelay = `-${((zone * 7) % 11) * 0.31}s`;
  const sheenDelay = `-${((zone * 3) % 7) * 0.7}s`;
  const stats = card.kind === 'monster' ? statsOf(S.game, side, card) : null;
  const position = card.position === 'defense' ? 'DEF' : 'ATK';
  const title = card.faceDown ? 'セットカード' : `${card.name} / ${card.text}`;

  if (card.faceDown) {
    return `<div class="field-card face-down rarity-${card.rarity}"
        data-uid="${card.uid}"
        style="--rarity:${rarity};--element:${el.color};--float-delay:${floatDelay};--sheen-delay:${sheenDelay}"
        title="${escapeAttr(title)}">
      <span class="fc-set">SET</span>
      <span class="fc-pos">${position}</span>
    </div>`;
  }

  return `<div class="field-card rarity-${card.rarity}"
      data-uid="${card.uid}"
      style="--rarity:${rarity};--element:${el.color};--element-soft:${hexA(el.color, 0.17)};--element-glow:${hexA(el.color, 0.3)};--float-delay:${floatDelay};--sheen-delay:${sheenDelay}"
      title="${escapeAttr(title)}">
    <span class="fc-cost">${kindBadge(card)}</span>
    <span class="fc-pos">${card.kind === 'monster' ? position : '—'}</span>
    <div class="fc-name">${escapeHtml(card.name)}</div>
    <div class="fc-el">${escapeHtml(card.kind === 'monster' ? `${el.label} / ${card.race}` : card.race)}</div>
    <div class="fc-stats">
      ${stats
        ? `<span class="fc-atk">${stats.atk}</span><span class="fc-def">${stats.def}</span>`
        : `<span class="fc-kind">${card.kind.toUpperCase()}</span>`}
    </div>
    ${card.ability ? `<span class="fc-ability" title="${escapeAttr(card.text)}">✦</span>` : ''}
  </div>`;
}

function renderHand() {
  const wrap = $('#hand');
  const hand = S.game.sides.player.hand;
  if (!hand.length) {
    wrap.innerHTML = '<div class="hand-empty">手札なし — ターン開始時に1枚ドロー</div>';
    S.ui.lastHand = new Set();
    return;
  }
  const locked = !isPlayerTurn() || S.ui.busy || S.ui.auto || S.game.battlePhase;
  const count = hand.length;
  wrap.innerHTML = hand.map((card, index) => {
    const el = elementOf(card);
    const rarity = RARITY[card.rarity] || RARITY.common;
    const rotation = (index - (count - 1) / 2) * 2.2;
    const lift = Math.abs(index - (count - 1) / 2) * 1.5;
    const isNew = !S.ui.lastHand.has(card.uid);
    const zones = canAct() ? playableZones(S.game, 'player', card) : [];
    const unavailable = locked || zones.length === 0;
    const classes = ['hand-card'];
    if (isNew) classes.push('is-new');
    if (S.ui.selectedHand === card.uid) classes.push('selected');
    if (unavailable) classes.push('unaffordable');
    if (card.kind !== 'monster') classes.push(`kind-${card.kind}`);
    const stats = card.kind === 'monster' ? statsOf(S.game, 'player', card) : null;
    const aria = card.kind === 'monster'
      ? `${card.name} レベル${card.level} ATK${stats.atk} DEF${stats.def}`
      : `${card.name} ${kindLabel(card)}`;
    return `<button class="${classes.join(' ')}" data-hand-uid="${card.uid}"
        style="--rot:${rotation}deg;--lift:${lift}px;--z:${index};--deal-delay:${index * 0.045}s;--rarity:${rarity};--element:${el.color};--element-soft:${hexA(el.color, 0.19)};--element-glow:${hexA(el.color, 0.3)}"
        aria-label="${escapeAttr(aria)}"
        title="${escapeAttr(card.text)}">
      <span class="hc-cost">${kindBadge(card)}</span>
      ${card.ability ? `<span class="hc-ability">${escapeHtml(abilityShort(card))}</span>` : ''}
      <div class="hc-body">
        <div class="hc-name">${escapeHtml(card.name)}</div>
        <div class="hc-en">${escapeHtml(card.en)}</div>
      </div>
      <div class="hc-stats">
        ${stats
          ? `<span class="atk">${stats.atk}<small>ATK</small></span><span class="def">${stats.def}<small>DEF</small></span>`
          : `<span class="kind">${escapeHtml(card.kind.toUpperCase())}</span>`}
      </div>
    </button>`;
  }).join('');
  S.ui.lastHand = new Set(hand.map(card => card.uid));
}

function contextActionState() {
  if (!canAct()) return { label: 'SELECT CARD', disabled: true };
  const card = selectedFieldCard();
  if (!card) return { label: 'SELECT CARD', disabled: true };
  if (card.kind === 'monster') {
    if (card.faceDown) return { label: 'FLIP SUMMON', disabled: card.summonedTurn === S.game.turnNumber };
    return { label: card.position === 'attack' ? 'DEFENSE' : 'ATTACK', disabled: card.summonedTurn === S.game.turnNumber || card.hasChangedPosition || card.hasAttacked };
  }
  if (card.faceDown && isSTSlot(S.ui.selectedZone)) return { label: 'ACTIVATE', disabled: false };
  return { label: 'SELECT CARD', disabled: true };
}

function renderStatus() {
  const s = S.game.sides.player;
  const battle = S.game.battlePhase;
  const context = contextActionState();
  $('#energy-wrap').innerHTML = `
    <div class="energy-head"><span>PHASE</span><b class="${battle ? 'battle' : ''}">${battle ? 'BATTLE' : 'MAIN 1'}</b></div>
    <div class="status-line"><span>NORMAL SUMMON</span><b class="${s.normalSummoned ? 'used' : 'ready'}">${s.normalSummoned ? 'USED' : 'READY'}</b></div>
    <div class="status-line"><span>GRAVEYARD</span><b>${s.graveyard.length}</b></div>
    <button class="context-btn" id="context-action" ${context.disabled ? 'disabled' : ''}>${context.label}</button>
  `;
}

function hasAttackPositionMonsters() {
  return monsterZones(S.game.sides.player).some(zone => {
    const card = S.game.sides.player.field[zone];
    return card && card.position === 'attack' && !card.faceDown && !card.hasAttacked;
  });
}

function renderControls() {
  const playerTurn = isPlayerTurn();
  const over = S.game.phase === 'over';
  const battle = Boolean(S.game.battlePhase);
  const locked = S.ui.busy || S.ui.auto || over;
  const ready = getReadyAttackers();
  const end = $('#end-turn');
  const all = $('#all-attack');
  const setButton = $('#set-mode');
  end.disabled = !playerTurn || locked;
  all.disabled = !playerTurn || locked || (battle ? ready.length === 0 : !hasAttackPositionMonsters());
  all.innerHTML = battle ? '<span>ALL</span><b>ATTACK</b>' : '<span>BATTLE</span><b>PHASE</b>';
  if (setButton) {
    setButton.disabled = !playerTurn || locked || battle;
    setButton.classList.toggle('active', S.ui.setMode);
  }

  const chip = $('#turn-chip');
  chip.textContent = over ? 'DUEL OVER' : playerTurn ? 'YOUR TURN' : 'ENEMY TURN';
  chip.classList.toggle('enemy', !playerTurn && !over);
  chip.classList.toggle('over', over);

  const info = selectedAttackInfo();
  $('#enemy-hud').classList.toggle('attackable', Boolean(info && info.direct));

  const hint = $('#phase-hint');
  if (S.ui.busy) hint.textContent = 'RESOLVING — カードが動いています…';
  else if (over) hint.textContent = 'LP ZERO — デュエル終了';
  else if (!playerTurn) hint.textContent = '相手のターン — 召喚・攻撃を解決中';
  else if (S.ui.tribute) {
    const t = S.ui.tribute;
    hint.textContent = `生贄を選択（${t.selected.length}/${t.needed}）— クリックで決定`;
  } else if (S.ui.selectedHand !== null) {
    const card = S.game.sides.player.hand.find(c => c.uid === S.ui.selectedHand);
    if (card) {
      if (card.kind === 'monster') {
        const req = normalSummonTributes(card.level);
        hint.textContent = req > 0
          ? `${card.name} — 生贄${req}体を選んで召喚`
          : `${card.name} を召喚するゾーンを選択${S.ui.setMode ? '（SET / 守備）' : ''}`;
      } else if (card.kind === 'field') {
        hint.textContent = `${card.name} — フィールド魔法ゾーンを選択`;
      } else if (card.kind === 'trap') {
        hint.textContent = `${card.name} — 魔法・罠ゾーンにセット`;
      } else {
        hint.textContent = `${card.name} — 発動する魔法・罠ゾーンを選択${S.ui.setMode ? '（SET）' : ''}`;
      }
    }
  } else if (S.ui.selectedZone !== null) {
    const card = S.game.sides.player.field[S.ui.selectedZone];
    if (card) {
      if (card.kind === 'monster') {
        hint.textContent = battle
          ? '攻撃対象をクリック / 敵LPを直接攻撃'
          : '表示形式を変更 / BATTLE PHASEで攻撃';
      } else if (card.faceDown) {
        hint.textContent = 'ACTIVATEでセットした魔法を発動';
      } else {
        hint.textContent = 'カードを選択して操作';
      }
    }
  } else if (battle) {
    hint.textContent = '攻撃するモンスターを選択 — ALL ATTACKで一斉攻撃';
  } else {
    hint.textContent = '手札を選び、召喚・発動・セット';
  }
  renderStatus();
}

function renderLog() {
  const body = $('#log-body');
  const lines = S.game.log.slice().reverse();
  body.innerHTML = lines.length
    ? lines.map(line => `<div class="log-line ${line.kind}"><b>T${line.turn}</b><span>${escapeHtml(line.text)}</span></div>`).join('')
    : '<div class="log-line"><b>--</b><span>デュエル開始を待っています。</span></div>';
  $('#log-panel').classList.toggle('open', S.ui.logOpen);
}

function roomStatus(room) {
  if (room.id === S.currentRoomId) return { text: '参加中', className: 'dueling' };
  if (room.isOwn) return { text: '自分のルーム', className: 'full' };
  if (room.status === 'dueling' || room.players >= 2) return { text: '対戦中', className: 'dueling' };
  return { text: '待機中', className: 'waiting' };
}

function renderMyRoom() {
  const own = S.rooms.find(room => room.isOwn);
  const root = $('#my-room-card');
  if (!own) {
    root.innerHTML = '';
    return;
  }
  const current = own.id === S.currentRoomId;
  const solo = S.mode === 'solo';
  const opponent = own.opponent || pickBot();
  const status = roomStatus(own);
  root.classList.toggle('not-current', !current);
  root.innerHTML = `
    <div class="mr-top">
      <span class="mr-label">MY ROOM</span>
      <span class="badge ${current ? '' : solo ? 'solo' : 'amber'}">${current ? '参加中' : solo ? 'ソロ対戦中' : '待機中'}</span>
    </div>
    <div class="mr-name">${escapeHtml(own.name)}</div>
    <div class="mr-code">ROOM CODE <b>#${escapeHtml(own.code)}</b></div>
    <div class="mr-players">
      <span class="mini-avatar">${escapeHtml(avatarGlyph(S.profile.name))}</span>
      <span class="mr-vs">VS</span>
      <span class="mini-avatar enemy">${escapeHtml(avatarGlyph(opponent.name))}</span>
      <span style="margin-left:auto;font:600 7px/1 var(--font-display);letter-spacing:1px;color:var(--muted)">2/2</span>
    </div>
    <div class="mr-meta">
      <span class="mr-chip">${own.zones} ZONES</span>
      <span class="mr-chip">LP <b>${own.lp}</b></span>
      <span class="mr-chip">PING <b>${own.ping}ms</b></span>
      <span class="mr-chip">${escapeHtml(opponent.rank)}</span>
    </div>
    ${current ? '' : '<button class="mr-return" data-action="return-own">自分のルームへ戻る</button>'}
  `;
}

function renderSoloCard() {
  for (const button of $$('[data-action="solo"]')) {
    button.classList.toggle('active', button.dataset.difficulty === S.soloDifficulty);
  }
}

function renderMode() {
  const chip = $('#mode-chip');
  if (chip) {
    chip.textContent = S.mode === 'solo' ? 'SOLO / CPU' : 'ONLINE';
    chip.classList.toggle('solo', S.mode === 'solo');
  }
  const soloButton = $('#solo-duel');
  if (soloButton) soloButton.classList.toggle('active', S.mode === 'solo');
}

function renderRoomList() {
  const list = $('#room-list');
  const query = S.ui.search;
  const filter = S.ui.filter;
  const rooms = S.rooms.filter(room => {
    if (filter === 'waiting' && room.status !== 'waiting' && !room.isOwn) return false;
    if (filter === 'dueling' && room.status !== 'dueling' && !room.isOwn) return false;
    if (!query) return true;
    return [room.name, room.host, room.mode, room.code, room.opponent?.name]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  if (!rooms.length) {
    list.innerHTML = '<div class="hand-empty" style="margin:12px 4px;padding:16px 10px;text-align:center">該当するルームがありません</div>';
    return;
  }

  list.innerHTML = rooms.map(room => {
    const status = roomStatus(room);
    const current = room.id === S.currentRoomId;
    const dueling = !current && !room.isOwn && room.status === 'dueling';
    const pingClass = room.ping < 35 ? 'good' : room.ping < 70 ? 'mid' : '';
    const avatarClass = room.avatarClass || '';
    return `<button class="room-item ${current ? 'current' : ''} ${dueling ? 'dueling' : ''}" data-room-id="${escapeAttr(room.id)}"
        aria-label="${escapeAttr(`${room.name} ${status.text}`)}">
      <span class="ra ${avatarClass}">${escapeHtml(avatarGlyph(room.host))}</span>
      <span class="rmain">
        <span class="rname">${escapeHtml(room.name)}</span>
        <span class="rsub"><b>${escapeHtml(room.host)}</b> · ${escapeHtml(room.mode)} · ${room.zones}Z · ${room.players}/${room.maxPlayers}</span>
      </span>
      <span class="rmeta">
        <span class="rping ${pingClass}">${room.ping}ms</span>
        <span class="rstate ${status.className}">${status.text}</span>
      </span>
    </button>`;
  }).join('');
}

function renderProfile() {
  const profile = S.profile;
  $('#profile').innerHTML = `
    <div class="pav">${escapeHtml(avatarGlyph(profile.name))}</div>
    <div class="pinfo">
      <div class="pname">${escapeHtml(profile.name)}</div>
      <div class="prank">${escapeHtml(profile.rank)} · LV.${profile.level}</div>
    </div>
    <div class="precord"><b>${profile.wins}W</b>${profile.losses}L</div>
  `;
}

// ---------------------------------------------------------------- actions

function selectHand(uid) {
  if (!canAct()) return;
  if (S.game.battlePhase) {
    showToast('BATTLE PHASE', 'バトルフェイズ中は手札を使えません。', 'warn', 2000);
    return;
  }
  if (S.ui.selectedHand === uid) {
    S.ui.selectedHand = null;
  } else {
    S.ui.selectedHand = uid;
    S.ui.selectedZone = null;
    S.ui.tribute = null;
    Sound.select();
    const card = S.game.sides.player.hand.find(item => item.uid === uid);
    if (card) {
      const zones = playableZones(S.game, 'player', card);
      if (!zones.length) {
        const reason = card.kind === 'monster'
          ? (S.game.sides.player.normalSummoned ? '通常召喚は使用済みです。' : '召喚できるゾーンがありません。')
          : '発動できるゾーンがありません。';
        showToast('CANNOT PLAY', `${card.name} — ${reason}`, 'warn', 2400);
      }
    }
  }
  renderBoard();
  renderHand();
  renderControls();
}

function selectZone(zone) {
  if (!canAct()) return;
  if (S.ui.selectedZone === zone) {
    S.ui.selectedZone = null;
    S.ui.selectedHand = null;
  } else {
    S.ui.selectedZone = zone;
    S.ui.selectedHand = null;
    S.ui.tribute = null;
    Sound.select();
  }
  renderBoard();
  renderHand();
  renderControls();
}

function handleHandClick(uid) {
  selectHand(uid);
}

function beginTribute(handUid, zone, needed) {
  S.ui.tribute = { handUid, zone, needed, selected: [] };
  S.ui.selectedHand = null;
  S.ui.selectedZone = null;
  showToast('TRIBUTE SUMMON', `生贄 ${needed} 体を選択してください。`, 'warn', 2400);
  renderBoard();
  renderHand();
  renderControls();
}

function handleTributeClick(side, zone) {
  const tribute = S.ui.tribute;
  if (!tribute || side !== 'player') return;
  if (!isMonsterSlot(zone) || !S.game.sides.player.field[zone] || zone === tribute.zone) {
    showToast('TRIBUTE', '自分のモンスターを生贄に選んでください。', 'warn', 1800);
    return;
  }
  if (tribute.selected.includes(zone)) {
    tribute.selected = tribute.selected.filter(item => item !== zone);
  } else {
    tribute.selected.push(zone);
  }
  if (tribute.selected.length >= tribute.needed) {
    const action = {
      type: 'play',
      side: 'player',
      handUid: tribute.handUid,
      zone: tribute.zone,
      set: S.ui.setMode,
      tributes: tribute.selected.slice(),
    };
    S.ui.tribute = null;
    performAction(action);
    return;
  }
  renderBoard();
  renderControls();
}

function handleZoneClick(side, zone) {
  if (!S.game || !canAct()) return;
  if (S.ui.tribute) {
    handleTributeClick(side, zone);
    return;
  }
  const player = S.game.sides.player;

  if (side === 'enemy') {
    const info = selectedAttackInfo();
    if (info && info.targets.includes(zone)) {
      performAction({ type: 'attack', side: 'player', from: S.ui.selectedZone, targetZone: zone });
      return;
    }
    const card = S.game.sides.enemy.field[zone];
    if (card) {
      if (card.faceDown) {
        showToast('SET CARD', 'セットされたカード — 攻撃でリバースできます。', 'ok', 2200);
      } else if (card.kind === 'monster') {
        const stats = statsOf(S.game, 'enemy', card);
        showToast('ENEMY UNIT', `${card.name} — ATK ${stats.atk} / DEF ${stats.def}`, 'ok', 2200);
      } else {
        showToast('ENEMY CARD', `${card.name} — ${card.race}`, 'ok', 2200);
      }
    }
    return;
  }

  const ownCard = player.field[zone];

  if (S.ui.selectedHand !== null) {
    if (ownCard) {
      selectZone(zone);
      return;
    }
    const handCard = player.hand.find(card => card.uid === S.ui.selectedHand);
    if (!handCard) return;

    if (handCard.kind === 'monster') {
      if (!isMonsterSlot(zone)) {
        showToast('PLACEMENT', 'モンスターはモンスターゾーンへ。', 'warn', 2200);
        return;
      }
      const needed = normalSummonTributes(handCard.level);
      if (needed > 0) {
        beginTribute(handCard.uid, zone, needed);
        return;
      }
      performAction({ type: 'play', side: 'player', handUid: handCard.uid, zone, set: S.ui.setMode });
      return;
    }

    if (handCard.kind === 'field') {
      if (zone !== FIELD_ZONE) {
        showToast('PLACEMENT', 'フィールド魔法はフィールド魔法ゾーンへ。', 'warn', 2200);
        return;
      }
      performAction({ type: 'play', side: 'player', handUid: handCard.uid, zone });
      return;
    }

    if (!isSTSlot(zone)) {
      showToast('PLACEMENT', '魔法・罠は魔法・罠ゾーンへ。', 'warn', 2200);
      return;
    }
    performAction({
      type: 'play',
      side: 'player',
      handUid: handCard.uid,
      zone,
      set: handCard.kind === 'trap' ? true : S.ui.setMode,
    });
    return;
  }

  if (S.ui.selectedZone !== null) {
    if (zone === S.ui.selectedZone) {
      S.ui.selectedZone = null;
      renderBoard();
      renderControls();
      return;
    }
    if (ownCard) {
      selectZone(zone);
      return;
    }
    return;
  }

  if (ownCard) selectZone(zone);
}

function contextAction() {
  if (!canAct()) return;
  const card = selectedFieldCard();
  if (!card) return;
  if (card.kind === 'monster') {
    performAction({ type: 'position', side: 'player', zone: S.ui.selectedZone });
    return;
  }
  if (card.faceDown && isSTSlot(S.ui.selectedZone)) {
    performAction({ type: 'activate', side: 'player', zone: S.ui.selectedZone });
  }
}

async function performAction(action) {
  if (!S.game || S.ui.busy || S.game.phase !== 'playing') return false;
  if (action.side && S.game.turn !== action.side) return false;
  S.ui.busy = true;
  renderControls();
  renderHand();
  try {
    const result = applyAction(S.game, action);
    await animateTransition(S.game, result, action);
    S.game = result.state;
    S.ui.selectedHand = null;
    S.ui.selectedZone = null;
    S.ui.tribute = null;
    if (action.type === 'play') S.ui.setMode = false;
    renderAll();
    if (S.game.phase === 'over') await handleGameOver();
    return true;
  } catch (error) {
    Sound.error();
    showToast('ACTION FAILED', error?.message || 'その操作はできません', 'bad', 2600);
    return false;
  } finally {
    S.ui.busy = false;
    renderControls();
    renderHand();
  }
}

async function endPlayerTurn() {
  if (!isPlayerTurn() || S.ui.busy || S.ui.auto) return;
  S.ui.tribute = null;
  const ok = await performAction({ type: 'end', side: 'player' });
  if (ok && S.game.phase === 'playing' && S.game.turn === 'enemy') {
    runEnemyTurn();
  }
}

function bestAttackTarget(fromZone) {
  const targets = attackTargets(S.game, 'player', fromZone);
  if (!targets.length) return undefined;
  if (targets.length === 1 && targets[0] === null) return null;
  const options = targets.map(zone => {
    const card = S.game.sides.enemy.field[zone];
    const stats = statsOf(S.game, 'enemy', card);
    return { zone, value: card.position === 'attack' ? stats.atk : stats.def };
  });
  options.sort((a, b) => a.value - b.value);
  return options[0].zone;
}

async function allAttack() {
  if (!isPlayerTurn() || S.ui.busy || S.ui.auto) return;
  if (!S.game.battlePhase) {
    const ok = await performAction({ type: 'battle', side: 'player' });
    if (ok) showBanner('BATTLE PHASE', '', 850);
    return;
  }
  S.ui.auto = true;
  renderControls();
  try {
    let guard = 0;
    while (guard < 12) {
      guard += 1;
      const ready = getReadyAttackers();
      if (!ready.length || S.game.phase !== 'playing') break;
      const from = ready[0];
      const targetZone = bestAttackTarget(from);
      if (targetZone === undefined) break;
      const ok = await performAction({ type: 'attack', side: 'player', from, targetZone });
      if (!ok) break;
      await sleep(170);
    }
  } finally {
    S.ui.auto = false;
    renderControls();
    renderHand();
  }
}

async function runEnemyTurn() {
  if (!S.game || S.game.phase !== 'playing' || S.game.turn !== 'enemy') return;
  S.ui.busy = true;
  S.ui.selectedHand = null;
  S.ui.selectedZone = null;
  renderControls();
  renderHand();
  showBanner('ENEMY TURN', 'enemy', 850);
  Sound.enemyTurn();
  await sleep(650);
  try {
    const { steps } = aiTurn(S.game, 'enemy');
    for (const step of steps) {
      if (S.game.phase !== 'playing') break;
      await animateTransition(S.game, step.result, step.action);
      S.game = step.result.state;
      S.ui.selectedHand = null;
      S.ui.selectedZone = null;
      renderAll();
      if (S.game.phase === 'over') break;
      await sleep(step.action.type === 'end' ? 120 : 300);
    }
  } finally {
    S.ui.busy = false;
    renderAll();
  }
  if (S.game.phase === 'over') {
    await handleGameOver();
  } else {
    showBanner('YOUR TURN', '', 850);
    Sound.turn();
  }
}

function joinRoom(roomId) {
  const room = S.rooms.find(item => item.id === roomId);
  if (!room) return;
  if (roomId === S.currentRoomId) {
    showToast('ALREADY JOINED', 'このルームに参加中です。', 'warn', 2200);
    return;
  }
  if (!room.isOwn && (room.status === 'dueling' || room.players >= 2)) {
    showToast('ROOM FULL', 'このルームは現在対戦中です。', 'warn', 2400);
    return;
  }
  const previous = S.rooms.find(item => item.id === S.currentRoomId);
  if (previous && previous.id !== room.id) {
    previous.status = 'waiting';
    previous.players = 1;
  }
  room.status = 'dueling';
  room.players = 2;
  if (!room.opponent) room.opponent = pickBot();
  S.currentRoomId = room.id;
  closeSidebar();
  startDuel(room);
  showToast('ROOM JOINED', `${room.name} / ${room.opponent.name} と接続しました。`, 'ok', 3200);
}

function refreshLobby() {
  const currentId = S.currentRoomId;
  S.rooms = refreshRooms(S.rooms).map(room =>
    room.id === currentId ? { ...room, status: 'dueling', players: 2 } : room
  );
  renderRoomList();
  renderMyRoom();
  showToast('ROOM LIST UPDATED', 'オンラインルームを再スキャンしました。', 'ok', 2200);
}

function returnToOwnRoom() {
  const own = S.rooms.find(room => room.isOwn);
  if (!own) return;
  if (own.id === S.currentRoomId) {
    showToast('ALREADY HOME', '自分のルームに参加中です。', 'warn', 2000);
    return;
  }
  joinRoom(own.id);
}

// ---------------------------------------------------------------- animation

function showBanner(text, kind = '', duration = 900) {
  $$('.turn-banner').forEach(node => node.remove());
  const banner = document.createElement('div');
  banner.className = `turn-banner ${kind}`.trim();
  banner.textContent = text;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), duration + 140);
}

function damagePop(rect, text, kind = '') {
  if (!rect) return;
  const node = document.createElement('div');
  node.className = `damage-pop ${kind}`.trim();
  node.textContent = text;
  node.style.left = `${rect.left + rect.width / 2}px`;
  node.style.top = `${rect.top + rect.height / 2}px`;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 900);
}

function spawnSparks(rect, count = 10, tone = 'cyan') {
  if (!rect) return;
  for (let index = 0; index < count; index += 1) {
    const spark = document.createElement('i');
    spark.className = `spark ${tone === 'pink' ? 'pink' : ''}`.trim();
    spark.style.left = `${rect.left + rect.width / 2}px`;
    spark.style.top = `${rect.top + rect.height / 2}px`;
    spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 110}px`);
    spark.style.setProperty('--dy', `${(Math.random() - 0.5) * 110}px`);
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 560);
  }
}

function slashAt(rect, angle) {
  if (!rect) return;
  const slash = document.createElement('i');
  slash.className = 'slash';
  slash.style.left = `${rect.left + rect.width / 2 - 60}px`;
  slash.style.top = `${rect.top + rect.height / 2}px`;
  slash.style.width = '120px';
  slash.style.setProperty('--rot', `${angle}deg`);
  document.body.appendChild(slash);
  setTimeout(() => slash.remove(), 340);
}

function projectile(fromRect, toRect, tone = 'cyan') {
  if (!fromRect || !toRect) return;
  const dot = document.createElement('i');
  dot.className = 'projectile';
  dot.style.left = `${fromRect.left + fromRect.width / 2}px`;
  dot.style.top = `${fromRect.top + fromRect.height / 2}px`;
  dot.style.background = tone === 'pink' ? 'var(--pink)' : 'var(--cyan)';
  dot.style.boxShadow = `0 0 14px ${tone === 'pink' ? 'var(--pink)' : 'var(--cyan)'}`;
  document.body.appendChild(dot);
  const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
  const dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
  dot.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.2 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.5)`, opacity: 0 },
    ],
    { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
  setTimeout(() => dot.remove(), 330);
}

function shatter(element) {
  if (!element) return;
  const rect = rectOf(element);
  if (!rect) return;
  const ghost = element.cloneNode(true);
  ghost.classList.add('ghost-card');
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = '0';
  document.body.appendChild(ghost);
  ghost.animate(
    [
      { transform: 'rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(2)' },
      { transform: 'rotate(7deg) scale(0.9)', opacity: 0.6, filter: 'brightness(1.2)', offset: 0.35 },
      { transform: 'rotate(-12deg) scale(0.5) translateY(24px)', opacity: 0 },
    ],
    { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
  element.style.opacity = '0';
  setTimeout(() => ghost.remove(), 450);
}

async function animateTransition(oldState, result, action) {
  const events = result.events || [];
  if (action.type === 'play') {
    const summon = events.find(event => event.type === 'summon');
    if (summon) await animateSummon(summon);
    for (const event of events) {
      if (event === summon) continue;
      if (event.type === 'strike') await animateStrike(event, events);
      else if (event.type === 'heal') await animateHeal(event);
      else if (event.type === 'buff') await animateBuff(event);
    }
  } else if (action.type === 'move') {
    await animateMove(events.find(event => event.type === 'move'));
  } else if (action.type === 'attack') {
    await animateAttack(events.find(event => event.type === 'attack'));
  } else if (action.type === 'end') {
    await sleep(220);
  } else {
    await sleep(100);
  }
}

async function animateSummon(event) {
  if (!event) return;
  const side = event.side;
  const zoneEl = getZoneEl(side, event.zone);
  if (!zoneEl) return;
  const targetRect = rectOf(zoneEl);
  const sourceEl = side === 'player' ? getHandEl(event.card.uid) : document.getElementById('enemy-hud');
  const sourceRect = rectOf(sourceEl) || rectOf(document.getElementById(`${side}-hud`));
  zoneEl.classList.add('summon-glow');

  if (sourceEl && sourceRect && targetRect) {
    const ghost = sourceEl.cloneNode(true);
    ghost.classList.add('ghost-card');
    ghost.style.left = `${sourceRect.left}px`;
    ghost.style.top = `${sourceRect.top}px`;
    ghost.style.width = `${sourceRect.width}px`;
    ghost.style.height = `${sourceRect.height}px`;
    ghost.style.margin = '0';
    ghost.style.animation = 'none';
    document.body.appendChild(ghost);
    const dx = (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2);
    const scale = Math.min(targetRect.width / sourceRect.width, targetRect.height / sourceRect.height) * 0.98;
    ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 20}px) scale(${scale * 1.15}) rotate(-2deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, opacity: 0.9 },
      ],
      { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    if (side === 'player') sourceEl.style.opacity = '0';
    Sound.summon();
    await sleep(360);
    ghost.remove();
  } else {
    Sound.summon();
    await sleep(180);
  }
  spawnSparks(targetRect, 7, side === 'player' ? 'cyan' : 'pink');
  setTimeout(() => zoneEl.classList.remove('summon-glow'), 500);
}

async function animateStrike(event, events) {
  if (!event) return;
  const targetSide = otherSide(event.side);
  const sourceRect = rectOf(getZoneEl(event.side, event.zone));
  const targetEl = event.targetZone !== null ? getCardEl(targetSide, event.targetZone) : document.getElementById(`${targetSide}-hud`);
  const targetRect = rectOf(targetEl);
  projectile(sourceRect, targetRect, event.side === 'player' ? 'cyan' : 'pink');
  await sleep(160);
  damagePop(targetRect, `-${event.damage}`, event.targetZone === null ? 'lp' : '');
  spawnSparks(targetRect, 8, targetSide === 'player' ? 'pink' : 'cyan');
  const destroyEvent = events.find(item => item.type === 'destroy' && item.side === targetSide && item.zone === event.targetZone);
  if (destroyEvent) {
    shatter(targetEl);
    Sound.destroy();
  } else {
    Sound.hit();
  }
  if (event.lpDamage > 0) {
    const hud = document.getElementById(`${targetSide}-hud`);
    hud?.querySelector('.lp-bar')?.classList.add('hit');
    setTimeout(() => hud?.querySelector('.lp-bar')?.classList.remove('hit'), 420);
  }
  await sleep(340);
}

async function animateMove(event) {
  if (!event) return;
  const fromEl = getCardEl(event.side, event.from);
  const toEl = getZoneEl(event.side, event.to);
  if (fromEl && toEl) {
    const fromRect = rectOf(fromEl);
    const toRect = rectOf(toEl);
    const ghost = fromEl.cloneNode(true);
    ghost.classList.add('ghost-card');
    ghost.style.left = `${fromRect.left}px`;
    ghost.style.top = `${fromRect.top}px`;
    ghost.style.width = `${fromRect.width}px`;
    ghost.style.height = `${fromRect.height}px`;
    ghost.style.margin = '0';
    ghost.style.animation = 'none';
    document.body.appendChild(ghost);
    const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
    const dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
    const scale = Math.min(toRect.width / fromRect.width, toRect.height / fromRect.height);
    ghost.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.92 },
      ],
      { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    fromEl.style.opacity = '0';
    Sound.move();
    await sleep(290);
    ghost.remove();
  } else {
    Sound.move();
    await sleep(120);
  }
  spawnSparks(rectOf(toEl), 5, 'cyan');
}

async function animateAttack(event) {
  if (!event) return;
  const targetSide = otherSide(event.side);
  const attackerEl = getCardEl(event.side, event.from);
  const targetEl = event.targetZone !== null ? getCardEl(targetSide, event.targetZone) : document.getElementById(`${targetSide}-hud`);
  const targetRect = rectOf(targetEl);
  const attackerRect = rectOf(attackerEl);

  Sound.attack();
  if (attackerEl && attackerRect && targetRect) {
    const dx = (targetRect.left + targetRect.width / 2) - (attackerRect.left + attackerRect.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (attackerRect.top + attackerRect.height / 2);
    const lunge = attackerEl.animate(
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${dx * 0.24}px, ${dy * 0.24}px) scale(1.07)`, offset: 0.45 },
        { transform: 'translate(0,0) scale(1)' },
      ],
      { duration: 330, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    await sleep(130);
    slashAt(targetRect, (Math.atan2(dy, dx) * 180) / Math.PI);
    spawnSparks(targetRect, 12, event.side === 'player' ? 'pink' : 'cyan');
    await lunge.finished.catch(() => {});
  } else {
    await sleep(160);
  }

  damagePop(targetRect, `-${event.damage}`, event.targetZone === null ? 'lp' : '');
  if (event.lpDamage > 0) {
    const hud = document.getElementById(`${targetSide}-hud`);
    setTimeout(() => damagePop(rectOf(hud), `LP -${event.lpDamage}`, 'lp'), 100);
    hud?.querySelector('.lp-bar')?.classList.add('hit');
    setTimeout(() => hud?.querySelector('.lp-bar')?.classList.remove('hit'), 440);
  }
  if (event.target && event.target.hp <= 0) {
    shatter(targetEl);
    Sound.destroy();
  } else if (event.target) {
    Sound.hit();
    targetEl?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 220 }
    );
  }

  if (event.targetZone === null || event.lpDamage > 0) {
    const arena = $('#arena');
    arena?.classList.add('shake');
    setTimeout(() => arena?.classList.remove('shake'), 360);
  }
  await sleep(420);
}

async function animateHeal(event) {
  const targetEl = event.zone !== undefined ? getZoneEl(event.side, event.zone) : document.getElementById(`${event.side}-hud`);
  const rect = rectOf(targetEl);
  damagePop(rect, `+${event.amount} LP`, 'heal');
  spawnSparks(rect, 8, 'cyan');
  Sound.heal();
  await sleep(280);
}

async function animateBuff(event) {
  const targetEl = getCardEl(event.side, event.zone) || getZoneEl(event.side, event.zone);
  const rect = rectOf(targetEl);
  damagePop(rect, `ATK +${event.amount}`, 'buff');
  spawnSparks(rect, 6, 'cyan');
  Sound.buff();
  await sleep(220);
}

// ---------------------------------------------------------------- result

async function handleGameOver() {
  if (S.ui.resultShown) return;
  S.ui.resultShown = true;
  const winner = S.game.winner;
  showBanner('ZERO', 'zero', 1250);
  Sound.zero();
  if (winner === 'player') S.profile.wins += 1;
  else if (winner === 'enemy') S.profile.losses += 1;
  saveProfile(S.profile);
  renderProfile();
  await sleep(950);
  if (winner === 'player') Sound.win();
  else if (winner === 'enemy') Sound.lose();
  showResult(winner);
}

function showResult(winner) {
  const card = $('.result-card');
  card.classList.toggle('lose', winner === 'enemy');
  card.classList.toggle('draw', winner === 'draw');
  const player = S.game.sides.player;
  $('#result-kicker').textContent = S.mode === 'solo' ? 'SOLO DUEL / 24 ZONES' : 'DUEL COMPLETE / 24 ZONES';
  $('#result-title').textContent = 'ZERO';
  $('#result-sub').textContent = winner === 'player' ? 'YOU WIN' : winner === 'enemy' ? 'YOU LOSE' : 'DRAW';
  $('#result-lp').textContent = winner === 'player' ? Math.max(0, S.game.sides.enemy.lp) : Math.max(0, player.lp);
  $('#result-lp').previousElementSibling.textContent = winner === 'player' ? 'ENEMY LP' : 'YOUR LP';
  $('#result-stats').innerHTML = `
    <div><span>TURNS</span><b>${S.game.turnNumber}</b></div>
    <div><span>DAMAGE DEALT</span><b>${player.stats.dealt}</b></div>
    <div><span>CARDS PLAYED</span><b>${player.stats.cardsPlayed}</b></div>
  `;
  $('#result-overlay').hidden = false;
}

// ---------------------------------------------------------------- toast

function showToast(title, message, kind = 'ok', duration = 3000) {
  const stack = $('#toasts');
  const toast = document.createElement('div');
  toast.className = `toast ${kind === 'warn' ? 'warn' : kind === 'bad' ? 'bad' : ''}`.trim();
  const icon = kind === 'bad' ? '×' : kind === 'warn' ? '!' : '✓';
  toast.innerHTML = `<span class="ticon">${icon}</span><div><b>${escapeHtml(title)}</b>${escapeHtml(message)}</div>`;
  stack.appendChild(toast);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

// ---------------------------------------------------------------- sidebar

function openSidebar() {
  S.ui.sidebarOpen = true;
  $('#sidebar').classList.add('open');
  renderRoomList();
  renderMyRoom();
}

function closeSidebar() {
  S.ui.sidebarOpen = false;
  $('#sidebar').classList.remove('open');
}

function toggleSound() {
  S.profile.sound = !S.profile.sound;
  saveProfile(S.profile);
  Sound.setEnabled(S.profile.sound);
  $('#sound-toggle').setAttribute('aria-pressed', String(S.profile.sound));
  if (S.profile.sound) Sound.click();
  showToast('SOUND', S.profile.sound ? 'サウンド ON' : 'サウンド OFF', 'ok', 1600);
}

function toggleHelp(open) {
  const overlay = $('#help-overlay');
  overlay.hidden = !open;
  if (open) Sound.click();
}

function toggleLog(open) {
  S.ui.logOpen = open;
  $('#log-panel').classList.toggle('open', open);
  if (open) renderLog();
}

// ---------------------------------------------------------------- events

function bindEvents() {
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);

  $('#room-search').addEventListener('input', event => {
    S.ui.search = event.target.value.trim().toLowerCase();
    renderRoomList();
  });

  for (const tab of $$('.filter-tab')) {
    tab.addEventListener('click', () => {
      S.ui.filter = tab.dataset.filter;
      for (const item of $$('.filter-tab')) {
        item.classList.toggle('active', item === tab);
        item.setAttribute('aria-selected', String(item === tab));
      }
      renderRoomList();
    });
  }

  $('#help-overlay').addEventListener('click', event => {
    if (event.target === event.currentTarget) toggleHelp(false);
  });
}

function onClick(event) {
  const roomEl = event.target.closest('[data-room-id]');
  if (roomEl) {
    joinRoom(roomEl.dataset.roomId);
    return;
  }

  const handEl = event.target.closest('[data-hand-uid]');
  if (handEl) {
    handleHandClick(Number(handEl.dataset.handUid));
    return;
  }

  if (event.target.closest('#enemy-hud')) {
    const info = selectedAttackInfo();
    if (info && info.direct && canAct()) {
      performAction({ type: 'attack', side: 'player', from: S.ui.selectedZone });
      return;
    }
  }

  const zoneEl = event.target.closest('[data-zone]');
  if (zoneEl) {
    handleZoneClick(zoneEl.dataset.side, Number(zoneEl.dataset.zone));
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    if (actionEl.dataset.action === 'return-own') returnToOwnRoom();
    if (actionEl.dataset.action === 'solo') startSolo(actionEl.dataset.difficulty || 'normal');
    return;
  }

  const button = event.target.closest('button');
  if (!button) {
    if (S.ui.sidebarOpen && !event.target.closest('#sidebar') && !event.target.closest('#rooms-toggle')) closeSidebar();
    return;
  }

  switch (button.id) {
    case 'rooms-toggle':
      if (S.ui.sidebarOpen) closeSidebar();
      else openSidebar();
      break;
    case 'sidebar-close':
      closeSidebar();
      break;
    case 'refresh-rooms':
      refreshLobby();
      break;
    case 'sound-toggle':
      toggleSound();
      break;
    case 'solo-duel':
      startSolo();
      break;
    case 'help-toggle':
      toggleHelp(true);
      break;
    case 'help-close':
      toggleHelp(false);
      break;
    case 'log-toggle':
      toggleLog(!S.ui.logOpen);
      break;
    case 'log-close':
      toggleLog(false);
      break;
    case 'end-turn':
      endPlayerTurn();
      break;
    case 'all-attack':
      allAttack();
      break;
    case 'rematch': {
      $('#result-overlay').hidden = true;
      if (S.mode === 'solo') {
        startSolo(S.soloDifficulty);
        break;
      }
      const room = S.rooms.find(item => item.id === S.currentRoomId) || S.rooms.find(item => item.isOwn);
      if (room) startDuel(room);
      break;
    }
    case 'result-rooms':
      $('#result-overlay').hidden = true;
      openSidebar();
      showToast('ROOM LIST', '参加するルームを選択してください。', 'ok', 2600);
      break;
    default:
      break;
  }

  if (S.ui.sidebarOpen && !event.target.closest('#sidebar') && !event.target.closest('#rooms-toggle')) closeSidebar();
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    if (!$('#help-overlay').hidden) return toggleHelp(false);
    if (S.ui.logOpen) return toggleLog(false);
    if (S.ui.sidebarOpen) return closeSidebar();
    if (S.ui.selectedHand !== null || S.ui.selectedZone !== null) {
      S.ui.selectedHand = null;
      S.ui.selectedZone = null;
      renderBoard();
      renderHand();
      renderControls();
    }
    return;
  }
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === 'e' || event.key === 'E') {
    event.preventDefault();
    endPlayerTurn();
  } else if (event.key === 'a' || event.key === 'A') {
    event.preventDefault();
    allAttack();
  } else if (/^[1-8]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const card = S.game?.sides.player.hand[index];
    if (card) {
      event.preventDefault();
      selectHand(card.uid);
    }
  }
}

// ---------------------------------------------------------------- stars

function startStars() {
  const canvas = $('#stars');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  let width = 0;
  let height = 0;
  let dpr = 1;
  const particles = [];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles.length = 0;
    const count = Math.min(90, Math.floor((width * height) / 18000));
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.4 + Math.random() * 1.4,
        speed: 0.06 + Math.random() * 0.22,
        alpha: 0.18 + Math.random() * 0.55,
        pink: Math.random() < 0.24,
        drift: (Math.random() - 0.5) * 0.08,
      });
    }
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      context.beginPath();
      context.fillStyle = particle.pink
        ? `rgba(255, 90, 160, ${particle.alpha})`
        : `rgba(120, 235, 255, ${particle.alpha})`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
      if (reduced) continue;
      particle.y -= particle.speed;
      particle.x += particle.drift;
      if (particle.y < -6) {
        particle.y = height + 6;
        particle.x = Math.random() * width;
      }
      if (particle.x < -6) particle.x = width + 6;
      if (particle.x > width + 6) particle.x = -6;
    }
    if (!reduced) requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', () => {
    resize();
    if (reduced) draw();
  });
}

// ---------------------------------------------------------------- go

if (new URLSearchParams(window.location.search).has('debug')) {
  window.DUEL24 = {
    get state() { return S; },
    forceResult(winner = 'player') {
      const loser = winner === 'player' ? 'enemy' : 'player';
      S.game.sides[loser].lp = 0;
      S.game.phase = 'over';
      S.game.winner = winner;
      renderAll();
      handleGameOver();
    },
  };
}

init();
