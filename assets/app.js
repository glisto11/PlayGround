import { CARDS, FACTIONS, factionColor } from './cards.js';
import { Duel, MAX_LP, MAX_ENERGY } from './duel.js';
import { Sound } from './audio.js';
import { createFx } from './fx.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmt = (value) => Number(value).toLocaleString('en-US');
const pad = (value) => String(value).padStart(2, '0');
const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function randomCode(length = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
  return null;
}

const sound = new Sound();
const fx = createFx($('#fx'));

/* ------------------------------------------------------------------ */
/* lobby data                                                          */
/* ------------------------------------------------------------------ */
const BOTS = [
  { id: 'b0', name: 'KIRIN', jp: '麒麟', rank: 'S-07', color: '#ff4f9d', glyph: 'KR', room: 'NEO TOKYO', ping: 16, state: 'open' },
  { id: 'b1', name: 'AKARI', jp: '灯里', rank: 'A-12', color: '#53e6ff', glyph: 'AK', room: 'ZERO GRAVE', ping: 24, state: 'busy' },
  { id: 'b2', name: 'REI', jp: '零', rank: 'S-02', color: '#a07bff', glyph: 'RE', room: 'NEON SHRINE', ping: 31, state: 'open' },
  { id: 'b3', name: 'ZEN', jp: '禅', rank: 'A-24', color: '#54e6a5', glyph: 'ZN', room: 'ORBITAL 7', ping: 42, state: 'open' },
  { id: 'b4', name: 'MIKA', jp: '美香', rank: 'B-08', color: '#ffb454', glyph: 'MK', room: 'AKIHABARA-9', ping: 55, state: 'full' },
  { id: 'b5', name: 'KAI', jp: '海', rank: 'A-03', color: '#4ad7ff', glyph: 'KA', room: 'BLACK LOTUS', ping: 38, state: 'busy' },
  { id: 'b6', name: 'YUKI', jp: '雪', rank: 'B-21', color: '#d8e6ff', glyph: 'YK', room: 'STARDUST', ping: 61, state: 'open' },
  { id: 'b7', name: 'RON', jp: '論', rank: 'S-11', color: '#ff7857', glyph: 'RN', room: 'SHINJUKU 24', ping: 29, state: 'open' },
];
const bots = BOTS.map(bot => ({ ...bot }));

const els = {
  lobby: $('#lobbyScreen'),
  duelScreen: $('#duelScreen'),
  boot: $('#boot'),
  bootStatus: $('#bootStatus'),
  roomCode: $('#roomCode'),
  roomList: $('#roomList'),
  onlineCount: $('#onlineCount'),
  callsign: $('#callsign'),
  playerAvatar: $('#playerAvatar'),
  yourRoomName: $('#yourRoomName'),
  opponentSlot: $('#opponentSlot'),
  oppName: $('#oppName'),
  oppMeta: $('#oppMeta'),
  oppReady: $('#oppReady'),
  autoTimer: $('#autoTimer'),
  startBtn: $('#startBtn'),
  copyCode: $('#copyCode'),
  soundBtn: $('#soundBtn'),
  soundBtn2: $('#soundBtn2'),
  toast: $('#toast'),
  banner: $('#banner'),
  board: $('#board'),
  hand: $('#hand'),
  log: $('#log'),
  inspect: $('#inspectBody'),
  arena: $('#arena'),
  fxLayer: $('#fxLayer'),
  turnChip: $('#turnChip'),
  turnLabel: $('#turnLabel'),
  turnCount: $('#turnCount'),
  aiName: $('#aiName'),
  aiRank: $('#aiRank'),
  aiAvatar: $('#aiAvatar'),
  aiLp: $('#aiLp'),
  aiLpFill: $('#aiLpFill'),
  playerLp: $('#playerLp'),
  playerLpFill: $('#playerLpFill'),
  playerName: $('#duelPlayerName'),
  playerDuelAvatar: $('#playerDuelAvatar'),
  energyPips: $('#energyPips'),
  energyNum: $('#energyNum'),
  playerHandCount: $('#playerHandCount'),
  playerDeckCount: $('#playerDeckCount'),
  aiHandCount: $('#aiHandCount'),
  aiDeckCount: $('#aiDeckCount'),
  aiState: $('#aiState'),
  endTurnBtn: $('#endTurnBtn'),
  leaveBtn: $('#leaveBtn'),
  result: $('#result'),
  resultKicker: $('#resultKicker'),
  resultTitle: $('#resultTitle'),
  resultSub: $('#resultSub'),
  resultPlayerLp: $('#resultPlayerLp'),
  resultAiLp: $('#resultAiLp'),
  statTurns: $('#statTurns'),
  statCards: $('#statCards'),
  statDamage: $('#statDamage'),
  rematchBtn: $('#rematchBtn'),
  toLobbyBtn: $('#toLobbyBtn'),
};

/* ------------------------------------------------------------------ */
/* toast / banner                                                      */
/* ------------------------------------------------------------------ */
let toastTimer = 0;
function toast(message, kind = '') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show ${kind}`.trim();
  toastTimer = setTimeout(() => {
    els.toast.className = 'toast';
  }, 2600);
}

function banner(kicker, title, sub, enemy = false) {
  const node = els.banner;
  node.className = `banner ${enemy ? 'ai' : ''}`;
  node.querySelector('.banner-kicker').textContent = kicker;
  node.querySelector('strong').textContent = title;
  node.querySelector('small').textContent = sub;
  void node.offsetWidth;
  node.classList.add('show');
}

/* ------------------------------------------------------------------ */
/* lobby                                                               */
/* ------------------------------------------------------------------ */
const roomCode = `Z24-${randomCode(4)}`;
els.roomCode.textContent = roomCode;

const PREVIEW_IDS = ['nova-wisp', 'pulse-adept', 'neon-ronin', 'aegis-node', 'rift-blade', 'void-seraph'];
function renderDeckPreview() {
  const strip = $('#deckStrip');
  if (!strip) return;
  strip.innerHTML = PREVIEW_IDS.map((id, index) => {
    const card = CARDS.find(entry => entry.id === id);
    if (!card) return '';
    return `
      <div class="mini-card" style="--c:${factionColor(card)};--i:${index}">
        <span class="mc-cost">${card.cost}</span>
        <span class="mc-glyph">${card.glyph}</span>
        <span class="mc-name">${esc(card.name)}</span>
      </div>
    `;
  }).join('');
}

const PREVIEW_UNITS = new Map([
  [5, '#ff4f9d'], [8, '#a07bff'], [10, '#ffb454'], [15, '#53e6ff'], [19, '#54e6a5'], [21, '#ff5d7a'],
]);
function renderZonePreview() {
  const grid = $('#zonePreview');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 24 }, (_, index) => {
    const color = PREVIEW_UNITS.get(index);
    return `<span class="${color ? 'active' : ''}" style="${color ? `--c:${color};--i:${index % 7}` : ''}">${color ? '<b></b>' : ''}</span>`;
  }).join('');
}

let callsign = store('duel24.callsign') || 'ACE-24';
if (!/^[A-Z0-9_-]{2,8}$/i.test(callsign)) callsign = 'ACE-24';
els.callsign.value = callsign;

let currentOpponent = null;
let inviting = null;
let invitedAt = 0;
let autoLeft = 8;
let autoTicker = 0;
let lobbyPingTicker = 0;
let onlineTicker = 0;
let autoStarted = false;

function initials(name) {
  return name.replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || '24';
}

function updateIdentity() {
  const next = els.callsign.value.trim().slice(0, 8).toUpperCase() || 'ACE-24';
  callsign = next;
  els.callsign.value = next;
  store('duel24.callsign', next);
  const mark = initials(next);
  els.playerAvatar.textContent = mark;
  els.playerDuelAvatar.textContent = mark;
  els.playerName.textContent = next;
  els.yourRoomName.textContent = `${next}のルーム`;
  renderRooms();
}

els.callsign.addEventListener('change', updateIdentity);
els.callsign.addEventListener('blur', updateIdentity);
els.callsign.addEventListener('input', () => {
  els.callsign.value = els.callsign.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 8);
  const mark = initials(els.callsign.value);
  els.playerAvatar.textContent = mark;
});

function pingClass(ping) {
  if (ping > 55) return 'bad';
  if (ping > 36) return 'mid';
  return '';
}

function stateLabel(room) {
  if (currentOpponent && currentOpponent.id === room.id) return '参加中';
  if (inviting === room.id) return '接続中';
  if (room.state === 'busy') return '対戦中';
  if (room.state === 'full') return '満室';
  return '待機中';
}

function stateClass(room) {
  if (currentOpponent && currentOpponent.id === room.id) return 'open';
  if (room.state === 'busy' || room.state === 'full') return room.state;
  return 'open';
}

function renderRooms() {
  if (!els.roomList) return;
  const rows = [];

  rows.push(`
    <div class="room-row mine" data-room="mine">
      <div class="row-host">
        <span class="row-avatar" style="--c:#53e6ff">${esc(initials(callsign))}</span>
        <div><strong>${esc(callsign)} <span class="you-mark">YOU</span></strong><small>${esc(callsign)}のルーム · ${esc(roomCode)}</small></div>
      </div>
      <span class="row-rank">A-24</span>
      <span class="row-ping"><span class="ping-bar"><i style="--p:100%"></i></span>0ms</span>
      <span class="row-state open">参加中</span>
      <button class="invite-btn sent" type="button" disabled>HOST</button>
    </div>
  `);

  for (const room of bots) {
    const isCurrent = currentOpponent?.id === room.id;
    const isInviting = inviting === room.id;
    const label = isCurrent ? '参加中' : isInviting ? '接続中' : room.state === 'busy' ? '対戦中' : room.state === 'full' ? '満室' : '待機中';
    const disabled = room.state === 'full' || isCurrent || isInviting;
    const buttonText = isCurrent ? '迎え入れ済' : isInviting ? '···' : room.state === 'full' ? 'FULL' : '招待';
    rows.push(`
      <div class="room-row ${isCurrent ? 'invited' : ''}" data-room="${room.id}">
        <div class="row-host">
          <span class="row-avatar" style="--c:${room.color}">${room.glyph}</span>
          <div><strong>${room.name}</strong><small>${room.room} · ${room.jp}</small></div>
        </div>
        <span class="row-rank">${room.rank}</span>
        <span class="row-ping"><span class="ping-bar"><i class="${pingClass(room.ping)}" style="--p:${clamp(110 - room.ping, 18, 100)}%"></i></span>${room.ping}ms</span>
        <span class="row-state ${stateClass(room)}">${label}</span>
        <button class="invite-btn ${isCurrent ? 'sent' : ''}" type="button" data-invite="${room.id}" ${disabled ? 'disabled' : ''}>${buttonText}</button>
      </div>
    `);
  }
  els.roomList.innerHTML = rows.join('');
}

function setOpponent(bot, auto = false) {
  if (!bot) return;
  currentOpponent = bot;
  inviting = null;
  clearInterval(autoTicker);
  autoTicker = 0;
  els.autoTimer.textContent = '—';
  els.opponentSlot.classList.remove('waiting');
  els.opponentSlot.classList.add('ready');
  els.opponentSlot.innerHTML = `
    <div class="avatar" style="--c:${bot.color}">${bot.glyph}</div>
    <div class="slot-info">
      <span class="slot-label">CHALLENGER / READY</span>
      <strong>${bot.name}</strong>
      <span class="rank">RANK <b>${bot.rank}</b> · ${bot.ping}ms</span>
    </div>
    <span class="ready-tag">READY</span>
  `;
  els.startBtn.querySelector('.btn-sub').textContent = `VS ${bot.name}`;
  els.startBtn.classList.add('ready');
  renderRooms();
  if (!auto) sound.turn();
  toast(`${bot.name} があなたのルームに参加しました`, '');
}

function inviteRoom(id, auto = false) {
  const bot = bots.find(entry => entry.id === id);
  if (!bot) return;
  if (currentOpponent) {
    toast(`${currentOpponent.name} がすでに参加しています`);
    return;
  }
  if (inviting) return;
  inviting = id;
  renderRooms();
  sound.click();
  const delay = auto ? 260 : 720;
  setTimeout(() => {
    if (inviting !== id) return;
    if (currentOpponent) return;
    setOpponent(bot, auto);
    if (auto) {
      setTimeout(() => toast(`${bot.name} がオートマッチングで参加しました`), 700);
    }
  }, delay);
}

function bestOpenRoom() {
  return bots
    .filter(bot => bot.state !== 'full')
    .sort((a, b) => a.ping - b.ping)[0] || bots[0];
}

function startAutoCountdown() {
  if (autoStarted || currentOpponent) return;
  autoStarted = true;
  autoLeft = 8;
  els.autoTimer.textContent = autoLeft;
  autoTicker = setInterval(() => {
    if (currentOpponent) {
      clearInterval(autoTicker);
      autoTicker = 0;
      return;
    }
    autoLeft -= 1;
    if (autoLeft <= 0) {
      clearInterval(autoTicker);
      autoTicker = 0;
      els.autoTimer.textContent = '0';
      inviteRoom(bestOpenRoom().id, true);
      return;
    }
    els.autoTimer.textContent = autoLeft;
  }, 1000);
}

els.roomList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-invite]');
  if (!button) {
    const row = event.target.closest('[data-room="mine"]');
    if (row) toast('あなたはこのルームのホストです');
    return;
  }
  inviteRoom(button.dataset.invite);
});

els.startBtn.addEventListener('click', () => {
  sound.unlock();
  sound.click();
  if (!currentOpponent) {
    const bot = bots.find(entry => entry.id === inviting) || bestOpenRoom();
    setOpponent(bot, true);
    setTimeout(() => game.start(currentOpponent), 260);
    return;
  }
  game.start(currentOpponent);
});

els.copyCode.addEventListener('click', async () => {
  sound.click();
  try {
    await navigator.clipboard.writeText(roomCode);
    toast(`ルームコード ${roomCode} をコピーしました`);
  } catch {
    const temp = document.createElement('textarea');
    temp.value = roomCode;
    document.body.appendChild(temp);
    temp.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    temp.remove();
    toast(`ルームコード ${roomCode} をコピーしました`);
  }
});

/* lobby ambient updates */
function updateRoomPings() {
  for (const bot of bots) {
    const row = els.roomList.querySelector(`.room-row[data-room="${bot.id}"]`);
    const pingCell = row?.querySelector('.row-ping');
    if (!pingCell) continue;
    pingCell.innerHTML = `<span class="ping-bar"><i class="${pingClass(bot.ping)}" style="--p:${clamp(110 - bot.ping, 18, 100)}%"></i></span>${bot.ping}ms`;
  }
}

lobbyPingTicker = setInterval(() => {
  if (document.hidden || els.lobby.classList.contains('hidden')) return;
  for (const bot of bots) {
    bot.ping = clamp(bot.ping + Math.round((Math.random() - 0.5) * 8), 12, 88);
  }
  updateRoomPings();
}, 2800);

onlineTicker = setInterval(() => {
  if (document.hidden) return;
  const current = Number(els.onlineCount.textContent.replaceAll(',', '')) || 1284;
  els.onlineCount.textContent = fmt(clamp(current + Math.round((Math.random() - 0.5) * 14), 1200, 1420));
}, 3000);

/* ------------------------------------------------------------------ */
/* sound toggles                                                       */
/* ------------------------------------------------------------------ */
function paintSound() {
  document.body.classList.toggle('muted', !sound.enabled);
  for (const button of [els.soundBtn, els.soundBtn2]) {
    button.setAttribute('aria-pressed', String(sound.enabled));
    button.title = sound.enabled ? 'サウンド OFF' : 'サウンド ON';
  }
}
for (const button of [els.soundBtn, els.soundBtn2]) {
  button.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    paintSound();
    if (sound.enabled) sound.click();
    toast(sound.enabled ? 'サウンド ON' : 'サウンド OFF');
  });
}
paintSound();
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });

/* ------------------------------------------------------------------ */
/* duel game                                                           */
/* ------------------------------------------------------------------ */
class DuelGame {
  constructor() {
    this.duel = null;
    this.opponent = null;
    this.busy = false;
    this.selectedHand = null;
    this.selectedUnit = null;
    this.logLines = [];
    this.resultTimer = 0;
    this.resultPending = false;
    this.runId = 0;
    this.lastHandKey = '';
    this.leaveArmed = false;
    this.leaveTimer = 0;
    this.built = false;
    this.bound = false;
    this.bind();
  }

  alive(runId) {
    return runId === this.runId;
  }

  bind() {
    if (this.bound) return;
    this.bound = true;

    els.board.addEventListener('click', (event) => this.onBoardClick(event));
    els.hand.addEventListener('click', (event) => this.onHandClick(event));
    els.endTurnBtn.addEventListener('click', () => this.endPlayerTurn());
    els.leaveBtn.addEventListener('click', () => this.onLeave());
    els.rematchBtn.addEventListener('click', () => this.rematch());
    els.toLobbyBtn.addEventListener('click', () => this.toLobby());

    els.hand.addEventListener('pointerover', (event) => {
      const cardEl = event.target.closest('.hand-card');
      if (!cardEl) return;
      const card = this.duel?.hand.player[Number(cardEl.dataset.hand)];
      if (card) this.inspectCard(card);
    });
    els.board.addEventListener('pointerover', (event) => {
      const unitEl = event.target.closest('.unit');
      if (!unitEl) return;
      const zone = this.duel?.zoneById(Number(unitEl.closest('.zone')?.dataset.zone));
      if (zone?.unit) this.inspectUnit(zone.unit);
    });
    els.hand.addEventListener('pointerleave', () => this.clearInspect());
    els.board.addEventListener('pointerleave', () => this.clearInspect());

    window.addEventListener('keydown', (event) => {
      if (els.duelScreen.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        if (this.selectedHand !== null || this.selectedUnit !== null) {
          this.clearSelection();
        }
      } else if (event.key.toLowerCase() === 'e') {
        this.endPlayerTurn();
      } else if (/^[1-8]$/.test(event.key) && !event.metaKey && !event.ctrlKey) {
        const index = Number(event.key) - 1;
        const card = this.duel?.hand.player[index];
        if (card) this.pickHand(index);
      }
    });
  }

  buildBoard() {
    const rows = ['A', 'B', 'C', 'D'];
    els.board.innerHTML = this.duel.zones.map(zone => `
      <div class="zone" role="gridcell" data-zone="${zone.id}" data-row="${zone.row}" data-col="${zone.col}" data-owner="${zone.owner}">
        <span class="zone-tag">${rows[zone.row]}${zone.col + 1}</span>
      </div>
    `).join('');
    this.built = true;
  }

  start(opponent) {
    this.runId += 1;
    this.opponent = opponent;
    this.duel = new Duel();
    this.duel.setup();
    this.busy = true;
    this.selectedHand = null;
    this.selectedUnit = null;
    this.logLines = [];
    this.lastHandKey = '';
    this.resultPending = false;
    this.resultTimer = 0;
    this.leaveArmed = false;
    clearInterval(autoTicker);
    clearTimeout(this.leaveTimer);
    els.result.classList.add('hidden');
    els.result.classList.remove('defeat');
    this.buildBoard();
    this.renderAll();
    this.renderLog();
    this.setAiState('STANDBY');
    this.updateOpponentHud();
    this.showScreen('duel');
    this.clearInspect();
    this.addLog(`ROOM ${roomCode} — DUEL START`, 'sys');
    this.addLog(`CHALLENGER: ${opponent.name} / RANK ${opponent.rank}`, 'sys');
    this.renderLog();
    banner('ROOM MATCH', 'DUEL START', '24 ZONES // LIFE POINT 4000');
    sound.turn();
    const run = this.runId;
    setTimeout(() => {
      if (this.alive(run)) this.beginPlayerTurn(true);
    }, 1050);
  }

  showScreen(name) {
    const inDuel = name === 'duel';
    els.lobby.classList.toggle('hidden', inDuel);
    els.duelScreen.classList.toggle('hidden', !inDuel);
    document.body.classList.toggle('in-duel', inDuel);
    if (!inDuel) {
      els.lobby.scrollTop = 0;
    }
  }

  updateOpponentHud() {
    if (!this.opponent) return;
    els.aiName.textContent = this.opponent.name;
    els.aiRank.textContent = `RANK ${this.opponent.rank}`;
    els.aiAvatar.textContent = this.opponent.glyph;
    els.aiAvatar.style.setProperty('--c', this.opponent.color);
  }

  async beginPlayerTurn(first = false) {
    if (this.duel.over) return;
    const run = this.runId;
    this.busy = true;
    this.setAiState('STANDBY');
    const turn = this.duel.startTurn('player');
    if (!turn) return;
    this.selectedHand = null;
    this.selectedUnit = null;
    this.renderAll();
    this.addLog(`TURN ${pad(turn.globalTurn)} — YOUR PHASE`, 'sys');
    if (turn.drawn.length) {
      this.addLog(`DRAW: ${turn.drawn.map(card => card.name).join(', ')}`, 'good');
      sound.draw();
    }
    this.renderLog();
    banner(`TURN ${pad(turn.turn)}`, 'YOUR TURN', `ENERGY ${turn.energy} // LP ZERO`, false);
    sound.turn();
    await sleep(880);
    if (!this.alive(run)) return;
    this.busy = false;
    this.updateInteractivity();
    this.updateHighlights();
    this.renderBoard();
  }

  onHandClick(event) {
    const cardEl = event.target.closest('.hand-card');
    if (!cardEl || this.busy || !this.duel || this.duel.over) return;
    if (this.duel.active !== 'player') {
      toast('相手のターンです', 'warn');
      sound.deny();
      return;
    }
    const index = Number(cardEl.dataset.hand);
    this.pickHand(index);
  }

  pickHand(index) {
    const card = this.duel.hand.player[index];
    if (!card) return;
    if (this.duel.active !== 'player') {
      toast('相手のターンです', 'warn');
      return;
    }
    if (card.cost > this.duel.energy.player) {
      toast(`ENERGY が足りません（必要 ${card.cost}）`, 'warn');
      sound.deny();
      cardElShake(index);
      return;
    }
    if (this.selectedHand === index) {
      this.selectedHand = null;
    } else {
      this.selectedHand = index;
      this.selectedUnit = null;
      sound.select();
    }
    this.renderAll();
  }

  clearSelection() {
    this.selectedHand = null;
    this.selectedUnit = null;
    this.renderAll();
    this.clearInspect();
  }

  onBoardClick(event) {
    const zoneEl = event.target.closest('.zone');
    if (!zoneEl || this.busy || !this.duel || this.duel.over) return;
    if (this.duel.active !== 'player') {
      toast('相手のターンです', 'warn');
      sound.deny();
      return;
    }
    const zoneId = Number(zoneEl.dataset.zone);
    const zone = this.duel.zoneById(zoneId);
    if (!zone) return;

    if (this.selectedUnit !== null) {
      const unitZone = this.duel.zoneById(this.selectedUnit);
      if (!unitZone?.unit) { this.clearSelection(); return; }
      if (zoneId === this.selectedUnit) { this.clearSelection(); return; }
      if (zone.owner === 'ai' && zone.col === unitZone.col) {
        this.playerAttack(this.selectedUnit, zoneId);
        return;
      }
      if (zone.unit?.owner === 'player') {
        this.selectUnit(zoneId);
        return;
      }
      toast('同じレーンの敵ユニット、または敵LPを選択してください', 'warn');
      return;
    }

    if (this.selectedHand !== null) {
      if (zone.owner === 'player' && !zone.unit) {
        this.playerSummon(this.selectedHand, zoneId);
        return;
      }
      if (zone.unit) toast('このゾーンは使用中です', 'warn');
      else toast('自分のテリトリーを選択してください', 'warn');
      return;
    }

    if (zone.unit?.owner === 'player') {
      this.selectUnit(zoneId);
    } else if (zone.unit?.owner === 'ai') {
      this.inspectUnit(zone.unit);
    } else if (zone.owner === 'player') {
      toast('手札のカードを選択してください');
    }
  }

  selectUnit(zoneId) {
    const zone = this.duel.zoneById(zoneId);
    if (!zone?.unit || zone.unit.owner !== 'player') return;
    if (zone.unit.summonedTurn >= this.duel.turns.player) {
      toast('召喚したターンは攻撃できません', 'warn');
      sound.deny();
      return;
    }
    if (zone.unit.hasAttacked) {
      toast('このユニットはこのターン攻撃済みです', 'warn');
      sound.deny();
      return;
    }
    this.selectedUnit = zoneId;
    this.selectedHand = null;
    sound.select();
    this.renderAll();
  }

  async playerSummon(handIndex, zoneId) {
    const check = this.duel.canPlay('player', handIndex, zoneId);
    if (!check.ok) {
      toast(check.reason, 'warn');
      sound.deny();
      return;
    }
    this.busy = true;
    this.selectedHand = null;
    this.selectedUnit = null;
    this.updateHighlights();
    const card = check.card;
    const run = this.runId;
    const result = this.duel.playCard('player', handIndex, zoneId);
    sound.summon();
    this.renderAll({ summonUid: result.unit.uid });
    const zoneRect = els.board.querySelector(`.zone[data-zone="${zoneId}"]`)?.getBoundingClientRect();
    if (zoneRect) fx.burst(zoneRect.left + zoneRect.width / 2, zoneRect.top + zoneRect.height / 2, factionColor(card), 20, 1.1);
    this.addLog(`YOU SUMMON ${card.name} — ATK ${card.atk} / DEF ${card.def}`, 'good');
    if (result.damage > 0) {
      sound.impact();
      this.shake();
      this.floatOn(els.aiLp, `-${fmt(result.damage)}`, 'bad');
      this.addLog(`FLARE ${card.name} → ${fmt(result.damage)} LP DAMAGE`, 'hot');
    }
    if (result.linked) {
      this.addLog(`LINK: ${result.linked.name} をドロー`, 'good');
      sound.draw();
    }
    this.renderLog();
    this.renderHud();
    this.updateHighlights();
    if (this.duel.over) {
      this.checkOver();
      return;
    }
    await sleep(440);
    if (!this.alive(run)) return;
    this.busy = false;
    this.updateInteractivity();
    this.updateHighlights();
    this.renderBoard();
  }

  async playerAttack(fromZoneId, targetZoneId) {
    if (this.busy || this.duel.over) return;
    const preview = this.duel.previewAttack('player', fromZoneId, targetZoneId);
    if (!preview) {
      toast('その攻撃は実行できません', 'warn');
      sound.deny();
      return;
    }
    this.busy = true;
    this.selectedUnit = null;
    this.selectedHand = null;
    this.updateHighlights();
    const run = this.runId;
    await this.executeAttack(preview, run);
    if (!this.alive(run)) return;
    if (this.duel.over) {
      this.checkOver();
      return;
    }
    this.busy = false;
    this.updateInteractivity();
    this.updateHighlights();
  }

  async executeAttack(preview, run) {
    const owner = preview.owner;
    const attackerEl = els.board.querySelector(`.unit[data-uid="${preview.unit.uid}"]`);
    const defenderEl = preview.defender ? els.board.querySelector(`.unit[data-uid="${preview.defender.uid}"]`) : null;
    const targetEl = defenderEl || (owner === 'player' ? els.aiLp : els.playerLp);
    const fromRect = attackerEl?.getBoundingClientRect();
    const targetRect = targetEl?.getBoundingClientRect();
    const color = owner === 'player' ? '#53e6ff' : '#ff4f9d';

    if (fromRect && targetRect) {
      attackerEl.classList.add('attacking', owner);
      sound.attack();
      this.spawnBeam(fromRect, targetRect, color);
      await sleep(230);
      if (!this.alive(run)) return null;
      this.spawnImpact(targetRect, color);
      fx.burst(targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2, color, 24, 1.4);
      this.shake();
      sound.impact();
    } else {
      await sleep(120);
    }

    const result = this.duel.attack(owner, preview.attackerZoneId, preview.targetZoneId);
    if (!result) return null;

    if (result.destroyDefender && defenderEl) defenderEl.classList.add('destroyed');
    if (result.destroyAttacker && attackerEl) attackerEl.classList.add('destroyed');

    const who = owner === 'player' ? 'YOU' : 'ENEMY';
    if (result.mode === 'direct') {
      this.addLog(`${who} ${result.unit.card.name} → DIRECT ${fmt(result.actualLpDamage)} LP`, owner === 'player' ? 'good' : 'hot');
      this.floatOn(owner === 'player' ? els.aiLp : els.playerLp, `-${fmt(result.actualLpDamage)}`, 'bad');
    } else if (result.destroyAttacker && result.destroyDefender) {
      this.addLog(`${who} ${result.unit.card.name} TRADES with ${result.defender.card.name}`, 'hot');
    } else if (result.destroyAttacker) {
      this.addLog(`${who} ${result.unit.card.name} is destroyed by ${result.defender.card.name}`, owner === 'player' ? 'hot' : 'good');
    } else if (result.destroyDefender) {
      this.addLog(`${who} ${result.unit.card.name} breaks ${result.defender.card.name}`, owner === 'player' ? 'good' : 'hot');
      if (result.actualLpDamage > 0) {
        this.addLog(`PIERCE → ${fmt(result.actualLpDamage)} LP DAMAGE`, owner === 'player' ? 'good' : 'hot');
        this.floatOn(owner === 'player' ? els.aiLp : els.playerLp, `-${fmt(result.actualLpDamage)}`, 'bad');
      }
    }

    if (result.healed > 0) {
      this.addLog(`DRAIN: ${who} recovers ${fmt(result.healed)} LP`, 'good');
      this.floatOn(owner === 'player' ? els.playerLp : els.aiLp, `+${fmt(result.healed)}`, 'heal');
      sound.heal();
    }
    this.renderLog();
    this.renderHud();
    await sleep(390);
    if (!this.alive(run)) return result;
    this.renderAll();
    this.renderHud();
    return result;
  }

  async endPlayerTurn() {
    if (this.busy || this.duel.over || this.duel.active !== 'player') return;
    this.busy = true;
    this.selectedHand = null;
    this.selectedUnit = null;
    this.updateHighlights();
    this.addLog('YOU END THE TURN', 'sys');
    this.renderLog();
    sound.click();
    this.duel.endTurn();
    this.renderAll();
    await sleep(360);
    await this.runAiTurn();
  }

  async runAiTurn() {
    if (this.duel.over) return;
    const run = this.runId;
    this.busy = true;
    this.setAiState('THINKING', true);
    const turn = this.duel.startTurn('ai');
    if (!turn) return;
    this.renderAll();
    this.addLog(`TURN ${pad(turn.globalTurn)} — ENEMY PHASE`, 'hot');
    if (turn.drawn.length) this.addLog(`ENEMY DRAWS 1 CARD`, '');
    this.renderLog();
    banner(`TURN ${pad(turn.turn)}`, 'ENEMY TURN', `ENERGY ${turn.energy} // STANDBY`, true);
    sound.turn();
    await sleep(900);
    if (!this.alive(run)) return;

    for (let i = 0; i < 4; i += 1) {
      if (this.duel.over) break;
      const plan = this.duel.aiPlanCard();
      if (!plan) break;
      await this.aiSummon(plan, run);
      if (!this.alive(run)) return;
      await sleep(360);
      if (!this.alive(run)) return;
    }

    for (let i = 0; i < 12; i += 1) {
      if (this.duel.over) break;
      const plan = this.duel.aiBestAttack();
      if (!plan) break;
      const preview = this.duel.previewAttack('ai', plan.fromZoneId, plan.targetZoneId);
      if (!preview) break;
      await this.executeAttack(preview, run);
      if (!this.alive(run)) return;
      await sleep(320);
      if (!this.alive(run)) return;
    }

    if (this.duel.over) {
      this.checkOver();
      return;
    }
    this.addLog('ENEMY ENDS THE TURN', 'hot');
    this.renderLog();
    this.setAiState('STANDBY');
    this.duel.endTurn();
    this.renderAll();
    await sleep(420);
    if (!this.alive(run)) return;
    this.busy = false;
    await this.beginPlayerTurn(false);
  }

  async aiSummon(plan, run) {
    const check = this.duel.canPlay('ai', plan.handIndex, plan.zoneId);
    if (!check.ok) return;
    const card = check.card;
    const result = this.duel.playCard('ai', plan.handIndex, plan.zoneId);
    sound.summon();
    this.renderAll({ summonUid: result.unit.uid });
    const zoneRect = els.board.querySelector(`.zone[data-zone="${plan.zoneId}"]`)?.getBoundingClientRect();
    if (zoneRect) fx.burst(zoneRect.left + zoneRect.width / 2, zoneRect.top + zoneRect.height / 2, factionColor(card), 18, 1);
    this.addLog(`ENEMY SUMMONS ${card.name} — ATK ${card.atk} / DEF ${card.def}`, 'hot');
    if (result.damage > 0) {
      sound.impact();
      this.shake();
      this.floatOn(els.playerLp, `-${fmt(result.damage)}`, 'bad');
      this.addLog(`FLARE ${card.name} → ${fmt(result.damage)} LP DAMAGE`, 'hot');
    }
    if (result.linked) this.addLog('ENEMY LINK: 1 CARD DRAWN', 'hot');
    this.renderLog();
    this.renderHud();
    await sleep(420);
    if (!this.alive(run)) return;
    if (this.duel.over) this.checkOver();
  }

  inspectCard(card) {
    if (!this.duel) return;
    const color = factionColor(card);
    els.inspect.innerHTML = `
      <div class="inspect-name" style="--c:${color}">${esc(card.name)}</div>
      <div class="inspect-meta" style="--c:${color}"><b>${FACTIONS[card.faction].label}</b><span>COST ${card.cost}</span><span>${esc(card.jp)}</span></div>
      <div class="inspect-stats" style="--c:${color}">
        <div><small>ATK</small><b>${fmt(card.atk)}</b></div>
        <div><small>DEF</small><b>${fmt(card.def)}</b></div>
      </div>
      <div class="inspect-text">${esc(card.text)}</div>
      <div class="inspect-kws" style="--c:${color}">${card.keywords.map(word => `<span>${esc(word)}</span>`).join('') || '<span>NO KEYWORD</span>'}</div>
      <div class="inspect-flavor">“${esc(card.flavor)}”</div>
    `;
  }

  inspectUnit(unit) {
    const card = unit.card;
    const color = factionColor(card);
    const atk = this.duel.effectiveAtk(unit);
    els.inspect.innerHTML = `
      <div class="inspect-name" style="--c:${color}">${esc(card.name)}</div>
      <div class="inspect-meta" style="--c:${color}"><b>${FACTIONS[card.faction].label}</b><span>${unit.owner === 'player' ? 'YOU' : 'ENEMY'}</span><span>${unit.hasAttacked ? 'USED' : (!this.duel.canAttack(unit) ? 'STANDBY' : 'READY')}</span></div>
      <div class="inspect-stats" style="--c:${color}">
        <div><small>ATK</small><b>${fmt(atk)}</b></div>
        <div><small>DEF</small><b>${fmt(card.def)}</b></div>
      </div>
      <div class="inspect-text">${esc(card.text)}</div>
      <div class="inspect-kws" style="--c:${color}">${card.keywords.map(word => `<span>${esc(word)}</span>`).join('') || '<span>VANILLA</span>'}</div>
      <div class="inspect-flavor">“${esc(card.flavor)}”</div>
    `;
  }

  clearInspect() {
    els.inspect.innerHTML = '<div class="inspect-empty">カードにカーソルを合わせると<br />詳細を表示します。</div>';
  }

  renderAll(options = {}) {
    if (!this.duel) return;
    this.renderBoard(options.summonUid);
    this.renderHand();
    this.renderHud();
    this.updateTurnChip();
    this.updateHighlights();
    this.updateInteractivity();
  }

  renderBoard(summonUid = null) {
    if (!this.duel) return;
    for (const zone of this.duel.zones) {
      const zoneEl = els.board.querySelector(`.zone[data-zone="${zone.id}"]`);
      if (!zoneEl) continue;
      const tag = `<span class="zone-tag">${String.fromCharCode(65 + zone.row)}${zone.col + 1}</span>`;
      if (!zone.unit) {
        zoneEl.innerHTML = tag;
        continue;
      }
      const unit = zone.unit;
      const card = unit.card;
      const color = factionColor(card);
      const atk = this.duel.effectiveAtk(unit);
      const buffed = atk > card.atk;
      const canAct = this.duel.canAttack(unit) && !this.busy;
      const classes = [
        'unit',
        unit.owner,
        unit.hasAttacked ? 'used' : '',
        canAct ? 'ready' : '',
        this.selectedUnit === zone.id ? 'selected' : '',
        summonUid && unit.uid === summonUid ? 'summoned' : '',
      ].filter(Boolean).join(' ');
      zoneEl.innerHTML = `
        ${tag}
        <div class="${classes}" data-uid="${unit.uid}" data-zone="${zone.id}" style="--c:${color};--i:${unit.uid % 7}"
             title="${esc(card.name)} / ATK ${fmt(atk)} / DEF ${fmt(card.def)} — ${esc(card.text)}">
          <span class="u-cost">${card.cost}</span>
          <span class="u-kw">${esc(card.keywords.join(' · ') || '')}</span>
          <div class="u-art"><span class="u-glyph">${card.glyph}</span></div>
          <div class="u-name">${esc(card.name)}</div>
          <div class="u-stats"><b class="${buffed ? 'buffed' : ''}">${fmt(atk)}</b><span>${fmt(card.def)}</span></div>
        </div>
      `;
    }
  }

  renderHand() {
    if (!this.duel) return;
    const hand = this.duel.hand.player;
    const key = hand.map(card => card.id).join('|');
    const changed = key !== this.lastHandKey;
    this.lastHandKey = key;
    if (!hand.length) {
      els.hand.innerHTML = '<div class="hand-empty">NO CARDS IN HAND</div>';
      return;
    }
    els.hand.innerHTML = hand.map((card, index) => {
      const color = factionColor(card);
      const affordable = card.cost <= this.duel.energy.player && this.duel.active === 'player' && !this.duel.over;
      const keywords = card.keywords.map(word => `<span>${esc(word)}</span>`).join('');
      return `
        <button type="button" class="hand-card ${affordable ? '' : 'unaffordable'} ${this.selectedHand === index ? 'selected' : ''} ${changed ? '' : 'static'}"
          data-hand="${index}" style="--c:${color};--i:${index}"
          aria-label="${esc(card.name)} COST ${card.cost} ATK ${card.atk} DEF ${card.def}"
          title="${esc(card.name)} — ${esc(card.text)}">
          <span class="hc-cost">${card.cost}</span>
          <span class="hc-faction">${FACTIONS[card.faction].label}</span>
          <span class="hc-art"><span class="hc-glyph">${card.glyph}</span></span>
          <span class="hc-name">${esc(card.name)}</span>
          <span class="hc-stats"><span>ATK <b>${fmt(card.atk)}</b></span><span>DEF ${fmt(card.def)}</span></span>
          <span class="hc-keywords">${keywords}</span>
        </button>
      `;
    }).join('');
  }

  renderHud() {
    if (!this.duel) return;
    const { lp, energy, hand, deck } = this.duel;
    els.aiLp.textContent = fmt(lp.ai);
    els.playerLp.textContent = fmt(lp.player);
    els.aiLpFill.style.width = `${clamp((lp.ai / MAX_LP) * 100, 0, 100)}%`;
    els.playerLpFill.style.width = `${clamp((lp.player / MAX_LP) * 100, 0, 100)}%`;
    els.aiLpFill.classList.toggle('low', lp.ai <= 1000);
    els.playerLpFill.classList.toggle('low', lp.player <= 1000);
    els.energyNum.textContent = energy.player;
    els.energyPips.innerHTML = Array.from({ length: MAX_ENERGY }, (_, index) =>
      `<i class="${index < energy.player ? 'on' : ''}"></i>`).join('');
    els.playerHandCount.textContent = hand.player.length;
    els.aiHandCount.textContent = hand.ai.length;
    els.playerDeckCount.textContent = deck.player.length;
    els.aiDeckCount.textContent = deck.ai.length;
  }

  updateTurnChip() {
    if (!this.duel) return;
    const ai = this.duel.active === 'ai' && !this.duel.over;
    els.turnChip.classList.toggle('ai', ai);
    els.turnLabel.textContent = this.duel.over ? 'DUEL OVER' : ai ? 'ENEMY TURN' : 'YOUR TURN';
    els.turnCount.textContent = `TURN ${pad(this.duel.globalTurn)}`;
    els.endTurnBtn.disabled = this.busy || this.duel.over || this.duel.active !== 'player';
  }

  updateInteractivity() {
    if (!this.duel) return;
    els.endTurnBtn.disabled = this.busy || this.duel.over || this.duel.active !== 'player';
    $$('.hand-card', els.hand).forEach((cardEl, index) => {
      const card = this.duel.hand.player[index];
      if (!card) return;
      cardEl.classList.toggle('unaffordable', card.cost > this.duel.energy.player || this.duel.active !== 'player' || this.duel.over);
    });
  }

  updateHighlights() {
    if (!this.duel) return;
    for (const zoneEl of $$('.zone', els.board)) {
      zoneEl.classList.remove('summonable', 'targetable', 'col-hot', 'lethal');
      zoneEl.querySelector('.target-tag')?.remove();
    }
    if (this.busy || this.duel.over || this.duel.active !== 'player') return;

    if (this.selectedHand !== null) {
      const card = this.duel.hand.player[this.selectedHand];
      if (!card) return;
      if (card.cost <= this.duel.energy.player) {
        for (const zone of this.duel.emptyZones('player')) {
          els.board.querySelector(`.zone[data-zone="${zone.id}"]`)?.classList.add('summonable');
        }
      }
      return;
    }

    if (this.selectedUnit === null) return;
    const zone = this.duel.zoneById(this.selectedUnit);
    if (!zone?.unit) return;
    const preview = this.duel.previewAttack('player', this.selectedUnit, null);
    if (!preview) return;
    els.board.querySelector(`.zone[data-zone="${zone.id}"]`)?.classList.add('col-hot');
    const aiZones = this.duel.zones.filter(entry => entry.owner === 'ai' && entry.col === zone.col);
    for (const entry of aiZones) {
      const el = els.board.querySelector(`.zone[data-zone="${entry.id}"]`);
      el?.classList.add('targetable');
      if (preview.lethal) el?.classList.add('lethal');
    }
    const tagZone = preview.defenderZoneId !== null
      ? preview.defenderZoneId
      : 6 + zone.col;
    const tagEl = els.board.querySelector(`.zone[data-zone="${tagZone}"]`);
    if (tagEl) {
      let label = 'DIRECT';
      if (preview.badTrade) label = 'RISK';
      else if (preview.destroyAttacker && preview.destroyDefender) label = 'TRADE';
      else if (preview.destroyDefender && preview.lpDamage > 0) label = `PIERCE +${fmt(preview.lpDamage)}`;
      else if (preview.destroyDefender) label = 'BREAK';
      else if (preview.lethal) label = 'LETHAL';
      const tag = document.createElement('span');
      tag.className = 'target-tag';
      tag.textContent = label;
      tagEl.appendChild(tag);
    }
  }

  setAiState(label, thinking = false) {
    els.aiState.textContent = label;
    els.aiState.classList.toggle('thinking', thinking);
  }

  addLog(text, kind = '') {
    this.logLines.push({ text, kind, turn: this.duel?.globalTurn ?? 0 });
    if (this.logLines.length > 60) this.logLines.shift();
  }

  renderLog() {
    if (!els.log) return;
    els.log.innerHTML = this.logLines.map(line => `
      <div class="log-line ${line.kind}"><i>${pad(line.turn)}</i><span>${esc(line.text)}</span></div>
    `).join('');
    els.log.scrollTop = els.log.scrollHeight;
  }

  spawnBeam(fromRect, targetRect, color) {
    const x1 = fromRect.left + fromRect.width / 2;
    const y1 = fromRect.top + fromRect.height / 2;
    const x2 = targetRect.left + targetRect.width / 2;
    const y2 = targetRect.top + targetRect.height / 2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const beam = document.createElement('div');
    beam.className = 'beam';
    beam.style.cssText = `left:${x1}px;top:${y1 - 1.5}px;width:${length}px;--r:${angle}rad;--c:${color}`;
    document.body.appendChild(beam);
    setTimeout(() => beam.remove(), 520);
  }

  spawnImpact(rect, color) {
    const ring = document.createElement('div');
    ring.className = 'impact';
    ring.style.cssText = `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;--c:${color}`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 560);
  }

  floatOn(element, text, kind = '') {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const node = document.createElement('div');
    node.className = `float-num ${kind}`.trim();
    node.textContent = text;
    node.style.cssText = `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;--c:${kind === 'heal' ? '#54e6a5' : '#ff4f9d'}`;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1150);
  }

  shake() {
    const app = $('#app');
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
    setTimeout(() => app.classList.remove('shake'), 340);
  }

  checkOver() {
    if (!this.duel?.over) return false;
    if (this.resultPending) return true;
    this.resultPending = true;
    this.busy = true;
    this.selectedHand = null;
    this.selectedUnit = null;
    this.updateHighlights();
    clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(() => this.showResult(), 900);
    return true;
  }

  showResult() {
    const won = this.duel.winner === 'player';
    els.result.classList.remove('hidden');
    els.result.classList.toggle('defeat', !won);
    els.resultKicker.textContent = 'DUEL COMPLETE // 24 ZONES';
    els.resultTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
    els.resultSub.textContent = won ? 'ENEMY LIFE POINT ZERO' : 'YOUR LIFE POINT ZERO';
    els.resultPlayerLp.textContent = fmt(this.duel.lp.player);
    els.resultAiLp.textContent = fmt(this.duel.lp.ai);
    els.statTurns.textContent = this.duel.globalTurn;
    els.statCards.textContent = this.duel.stats.player.played;
    els.statDamage.textContent = fmt(this.duel.stats.player.damage);
    this.addLog(won ? 'VICTORY — ENEMY LP ZERO' : 'DEFEAT — YOUR LP ZERO', won ? 'good' : 'hot');
    this.renderLog();
    banner(won ? 'LP 0' : 'LP 0', won ? 'VICTORY' : 'DEFEAT', won ? 'ENEMY LIFE POINT ZERO' : 'YOUR LIFE POINT ZERO', !won);
    if (won) sound.win(); else sound.lose();
    this.busy = true;
  }

  rematch() {
    if (!this.opponent) return;
    sound.click();
    els.result.classList.add('hidden');
    this.start(this.opponent);
  }

  toLobby() {
    this.runId += 1;
    clearTimeout(this.resultTimer);
    this.resultTimer = 0;
    this.resultPending = false;
    this.busy = false;
    this.selectedHand = null;
    this.selectedUnit = null;
    els.result.classList.add('hidden');
    this.showScreen('lobby');
    this.setAiState('STANDBY');
    renderRooms();
    toast('自分のルームに戻りました');
    sound.click();
  }

  onLeave() {
    if (this.duel?.over) {
      this.toLobby();
      return;
    }
    if (!this.leaveArmed) {
      this.leaveArmed = true;
      clearTimeout(this.leaveTimer);
      this.leaveTimer = setTimeout(() => { this.leaveArmed = false; }, 3000);
      toast('もう一度押すとルームに戻ります（デュエル放棄）', 'warn');
      return;
    }
    this.leaveArmed = false;
    clearTimeout(this.leaveTimer);
    this.toLobby();
  }
}

function cardElShake(index) {
  const el = els.hand.querySelector(`.hand-card[data-hand="${index}"]`);
  if (!el) return;
  el.classList.remove('denied');
  void el.offsetWidth;
  el.classList.add('denied');
  setTimeout(() => el.classList.remove('denied'), 350);
}

const game = new DuelGame();

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
renderRooms();
renderDeckPreview();
renderZonePreview();
updateIdentity();
els.autoTimer.textContent = autoLeft;

setTimeout(() => { els.bootStatus.textContent = 'JOINING YOUR ROOM…'; }, 220);
setTimeout(() => { els.bootStatus.textContent = 'SYNCING 24 ZONES…'; }, 470);
setTimeout(() => {
  els.boot.classList.add('done');
  startAutoCountdown();
}, 780);

/* expose for automated verification */
window.__duel24 = {
  get game() { return game; },
  get duel() { return game.duel; },
  get opponent() { return currentOpponent; },
  start: (botId) => {
    const bot = bots.find(entry => entry.id === botId) || bestOpenRoom();
    setOpponent(bot);
    game.start(bot);
  },
  state: () => ({
    screen: els.duelScreen.classList.contains('hidden') ? 'lobby' : 'duel',
    lp: game.duel ? { ...game.duel.lp } : null,
    active: game.duel?.active ?? null,
    over: game.duel?.over ?? false,
    busy: game.busy,
    turn: game.duel?.globalTurn ?? 0,
    hand: game.duel?.hand.player.length ?? 0,
    deck: game.duel?.deck.player.length ?? 0,
    units: game.duel ? game.duel.units('player').length : 0,
  }),
};
