/* Lobby, player profile, online room list, room detail. */

import { DECKS, DECK_LIST, deckSize } from './cards.js';
import {
  profile, online, subscribe, renamePlayer, setDeck, addResult, getRoom,
  joinRoom, acceptChallenger, avatarColor, initials, leaveOtherRoom,
} from './rooms.js';
import {
  $, app, esc, toast, showScreen, openModal, closeModal, sleep,
} from './ui-core.js';
import { startDuel } from './ui-duel.js';
import { sfx } from './fx.js';

export function initLobby() {
  app.onExitDuel = showLobby;

  $('myRoomBtn').addEventListener('click', () => openRoomDetail('mine'));
  $('enterRoomBtn').addEventListener('click', () => openRoomDetail('mine'));
  $('roomBackBtn').addEventListener('click', () => showLobby());

  $('nameBtn').addEventListener('click', openNameModal);

  $('deckOptions').addEventListener('click', e => {
    const btn = e.target.closest('[data-deck]');
    if (!btn) return;
    setDeck(btn.dataset.deck);
    renderDeckPicker();
    renderMyRoom();
    sfx('select');
    toast(`${DECKS[btn.dataset.deck].name} に変更しました`, 'good');
  });

  $('roomList').addEventListener('click', e => {
    const join = e.target.closest('[data-join]');
    if (join) { e.stopPropagation(); onJoinRoom(join.dataset.join); return; }
    const row = e.target.closest('[data-open-room]');
    if (row) openRoomDetail(row.dataset.openRoom);
  });

  renderLobbyAll();
  showScreen('lobby');
  subscribe(onRoomsUpdate);
}

export function showLobby() {
  showScreen('lobby');
  renderLobbyAll();
}

function onRoomsUpdate() {
  renderOnline();
  if (app.screen === 'lobby') {
    renderProfile();
    renderMyRoom();
    renderRecord();
    renderRooms();
  } else if (app.screen === 'room') {
    const current = app.roomRef?.mine ? online.myRoom : getRoom(app.roomRef?.id);
    if (!current) return;
    const key = roomKey(current);
    if (app.roomKey !== key) {
      app.roomKey = key;
      renderRoomDetail(current);
    }
  }
}

function roomKey(room) {
  return [
    room.id,
    room.challenger?.name || '',
    room.players,
    room.status,
  ].join('|');
}

/* ---------------- profile ---------------- */
function openNameModal() {
  const body = openModal(`
    <div class="modal-title">プレイヤー名</div>
    <p class="modal-sub">ルームリストとデュエル画面に表示されます。</p>
    <input class="text-input" id="nameInput" maxlength="18" value="${esc(profile.name)}" autocomplete="off" spellcheck="false">
    <div class="modal-actions">
      <button class="primary-btn" id="saveNameBtn">保存する</button>
      <button class="secondary-btn" data-close-modal>キャンセル</button>
    </div>
  `);
  const input = body.querySelector('#nameInput');
  input.focus();
  input.select();
  const save = () => {
    if (renamePlayer(input.value)) {
      renderProfile();
      renderMyRoom();
      closeModal();
      toast('プレイヤー名を変更しました', 'good');
      sfx('select');
    } else {
      toast('名前を入力してください', 'bad');
    }
  };
  body.querySelector('#saveNameBtn').addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}

function renderProfile() {
  $('myName').textContent = profile.name;
  const av = $('myAvatar');
  av.textContent = initials(profile.name);
  av.style.background = `linear-gradient(140deg, ${avatarColor(profile.name)}, #6c8dff)`;
  renderRecord();
}

function renderRecord() {
  const total = profile.wins + profile.losses;
  const rate = total ? Math.round((profile.wins / total) * 100) : 0;
  $('recordBody').innerHTML = `
    <div class="record-item win"><b>${profile.wins}</b><span>WINS</span></div>
    <div class="record-item loss"><b>${profile.losses}</b><span>LOSSES</span></div>
    <div class="record-item rate"><b>${total ? rate + '%' : '—'}</b><span>WIN RATE</span></div>
  `;
  $('recordSub').textContent = total ? `${total} DUELS` : 'ONLINE';
}

/* ---------------- decks ---------------- */
function renderDeckPicker() {
  const current = DECKS[profile.deckId] || DECKS.flame;
  $('deckOptions').innerHTML = DECK_LIST.map(d => `
    <button class="deck-option ${d.id === profile.deckId ? 'selected' : ''}" data-deck="${d.id}" style="--accent:${d.accent}">
      <b>${d.name}</b>
      <span><i>●</i> ${deckSize(d)}枚 + EX ${d.extra.length}</span>
    </button>
  `).join('');
  $('deckCount').textContent = `${deckSize(current)}枚 + EX ${current.extra.length}`;
  $('deckDesc').textContent = current.desc;
}

/* ---------------- my room ---------------- */
function renderMyRoom() {
  const my = online.myRoom;
  if (!my) return;
  $('myRoomCode').textContent = my.code;
  const created = new Date(profile.room.createdAt);
  const time = created.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  $('myRoomSub').textContent = `${time} に自動作成 · あなたがホスト`;

  const challenger = my.challenger;
  $('myRoomBody').innerHTML = `
    <div class="room-occupant">
      <span class="avatar" style="background:linear-gradient(140deg, ${avatarColor(profile.name)}, #6c8dff)">${initials(profile.name)}</span>
      <div class="who"><b>${esc(profile.name)}</b><span>HOST / あなた</span></div>
      <span class="ready-chip">参加中</span>
    </div>
    ${challenger ? `
      <div class="room-occupant">
        <span class="avatar" style="background:${challenger.color}">${initials(challenger.name)}</span>
        <div class="who"><b>${esc(challenger.name)}</b><span>CHALLENGER · ${challenger.rank}</span></div>
        <span class="ready-chip">準備OK</span>
      </div>` : `
      <div class="room-occupant" style="border-style:dashed; opacity:.75">
        <span class="avatar" style="background:#20283f; color:#7f8db0">?</span>
        <div class="who"><b>挑戦者を待っています</b><span>SLOT 2 / OPEN</span></div>
        <span class="ready-chip" style="color:#ffcf9d;border-color:rgba(255,207,107,.25);background:rgba(255,207,107,.06)">募集中</span>
      </div>`}
    <div class="my-room-row"><span>ルール</span><b>LP 8000 · 24 ZONES · LP0勝利</b></div>
    <div class="my-room-row"><span>デッキ</span><b>${esc((DECKS[profile.deckId] || DECKS.flame).name)}</b></div>
  `;
  $('autoJoinNote').textContent = '起動と同時に自動作成・自動参加。退出しても次回起動時に再作成されます。';
}

/* ---------------- online room list ---------------- */
function renderOnline() {
  const el = $('onlineCount');
  if (el) el.textContent = online.count;
  const rc = $('roomOnlineCount');
  if (rc) rc.textContent = online.count;
}

function renderRooms() {
  const list = $('roomList');
  if (!list) return;
  $('roomCount').textContent = online.rooms.length;
  if (!online.rooms.length) {
    list.innerHTML = `<div class="room-empty">
      <b>参加できるオンラインルームはありません</b>
      <span>自分のルームコードを共有して、挑戦者を待ちましょう。</span>
    </div>`;
    return;
  }
  const fresh = [];
  list.innerHTML = online.rooms.map(room => {
    const isNew = !app.seenRooms.has(room.id);
    if (isNew) fresh.push(room.id);
    return roomRowHTML(room, isNew);
  }).join('');
  for (const id of fresh) app.seenRooms.add(id);
}

function roomRowHTML(room, fresh) {
  const status = room.mine
    ? { label: '参加中', cls: 'open' }
    : room.joined ? { label: '参加中', cls: 'open' }
      : room.status === 'open' ? { label: '募集中', cls: 'open' }
        : room.status === 'full' ? { label: '満室', cls: 'full' }
          : { label: '対戦中', cls: 'dueling' };
  const joinLabel = room.mine ? '入室中' : room.joined ? '入室中' : room.status === 'open' ? '参加' : room.status === 'full' ? '満室' : '対戦中';
  const disabled = !room.mine && !room.joined && room.status !== 'open';
  const host = room.host;
  const openable = room.mine || room.joined;

  return `<div class="room-row ${room.mine || room.joined ? 'mine' : ''} ${fresh ? 'fresh' : ''}" ${openable ? `data-open-room="${room.id}"` : ''} title="${esc(room.note || '')}">
    <div class="room-host">
      <span class="host-avatar" style="background:${host.color}">${initials(host.name)}</span>
      <div class="room-host-text">
        <b>${esc(host.name)} ${room.mine ? '<span class="crown">♛</span>' : ''}</b>
        <span>${room.code} · ${room.mine ? 'あなたのルーム' : room.joined ? '参加中' : host.rank} · ${host.ping}ms</span>
      </div>
    </div>
    <div class="room-mode-chip">${room.mode}</div>
    <div class="room-cell mono">${room.lp}</div>
    <div class="room-cell mono">${room.zones}Z</div>
    <div class="room-cell mono">${room.players}/${room.max}</div>
    <div><span class="room-status ${status.cls}"><i></i>${status.label}</span></div>
    <button class="room-join ${room.mine || room.joined ? 'mine' : ''}" data-join="${room.id}" ${disabled ? 'disabled' : ''}>${joinLabel}</button>
  </div>`;
}

function onJoinRoom(id) {
  if (id === online.myRoom?.id) { openRoomDetail('mine'); return; }
  const room = getRoom(id);
  if (!room) { toast('ルームが見つかりません', 'bad'); return; }
  if (room.joined) { openRoomDetail(room); return; }
  if (room.status !== 'open' || room.players >= 2) {
    toast('このルームは満室です', 'bad');
    return;
  }
  const joined = joinRoom(id);
  if (!joined) { toast('参加できませんでした', 'bad'); return; }
  toast(`${room.host.name} のルームに参加しました`, 'good');
  sfx('select');
  openRoomDetail(joined);
}

/* ---------------- room detail ---------------- */
export function openRoomDetail(id) {
  let room = typeof id === 'object' && id ? id : id === 'mine' ? online.myRoom : getRoom(id);
  if (!room && online.joinedOther && (id === online.joinedOther.id || id === 'joined' || id === online.joinedOther)) room = online.joinedOther;
  if (!room) { toast('ルームが見つかりません', 'bad'); return; }
  app.roomId = room.id;
  app.roomRef = room;
  app.roomKey = roomKey(room);
  renderRoomDetail(room);
  showScreen('room');
}

function renderRoomDetail(room) {
  if (room.mine) room = online.myRoom;
  app.roomRef = room;
  $('roomHeadCode').textContent = room.code;

  const isMine = !!room.mine;
  const host = isMine
    ? { name: profile.name, rank: 'HOST', tag: 'あなた', color: avatarColor(profile.name) }
    : room.host;
  const guest = isMine
    ? room.challenger
    : { name: profile.name, rank: 'CHALLENGER', tag: 'あなた', color: avatarColor(profile.name) };
  const startLabel = isMine
    ? (guest ? `${esc(guest.name)} とデュエル` : '挑戦者を募集してデュエル')
    : `${esc(host.name)} とデュエル`;

  const deckOpts = DECK_LIST.map(d => `
    <button class="room-deck-opt ${d.id === profile.deckId ? 'selected' : ''}" data-deck="${d.id}" style="--accent:${d.accent}">
      <span class="dot"></span>
      <b>${d.name}</b>
      <span>${deckSize(d)}枚</span>
    </button>
  `).join('');

  $('roomDetailBody').innerHTML = `
    <section class="room-hero">
      <div>
        <p class="eyebrow"><span class="eyebrow-dot"></span>${isMine ? 'YOUR ROOM / AUTO JOINED' : room.mode + ' ROOM / JOINED'}</p>
        <h1>${isMine ? 'あなたのルームで' : 'このルームで'}<br><span>LPを0にしろ。</span></h1>
        <p>${isMine
          ? '起動時に自動で作成されたあなたのルームです。挑戦者を迎えて、24ゾーンのデュエルを開始します。'
          : `${esc(host.name)} のルームに参加しています。24ゾーン・カード画像なし・相手LPを0にすれば勝利。`}</p>
      </div>
      <div class="room-hero-side">
        <div class="room-code-big">${room.code}</div>
        <div class="room-code-actions">
          <button class="chip-btn" id="copyRoomBtn">コードをコピー</button>
          <button class="chip-btn" id="roomOnlineChip"><i class="pulse-dot"></i> ${online.count} online</button>
        </div>
        <span class="tiny">${isMine ? '自動参加中 · 退出不可（常時参加）' : '参加済み · 準備完了'}</span>
      </div>
    </section>

    <div class="room-grid">
      <section class="panel room-info-panel">
        <div class="panel-head"><h2>ルール</h2><span class="muted">FIXED</span></div>
        <div class="room-rules">
          <div class="rule-tile"><span>LIFE POINT</span><b><em>${room.lp}</em> スタート</b></div>
          <div class="rule-tile"><span>FIELD</span><b><em>24</em> ゾーン</b></div>
          <div class="rule-tile"><span>WIN CONDITION</span><b>相手LPを<em>0</em>に</b></div>
          <div class="rule-tile"><span>CARD IMAGE</span><b><em>0</em> 枚 / テキスト</b></div>
        </div>
        <div class="panel-head" style="margin-top:6px"><h2>プレイヤー</h2><span class="muted">2 SLOTS</span></div>
        <div class="room-players">
          <div class="player-slot">
            <span class="avatar" style="background:${host.color}">${initials(host.name)}</span>
            <div class="ps-text"><b>${esc(host.name)} ${isMine ? '♛' : ''}</b><span>${isMine ? 'HOST / あなた' : 'HOST'}</span></div>
            <span class="ready-chip">READY</span>
          </div>
          ${guest ? `
            <div class="player-slot">
              <span class="avatar" style="background:${guest.color}">${initials(guest.name)}</span>
              <div class="ps-text"><b>${esc(guest.name)}</b><span>CHALLENGER / あなた</span></div>
              <span class="ready-chip">READY</span>
            </div>` : `
            <div class="player-slot empty">
              <span class="avatar" style="background:#20283f;color:#7f8db0">?</span>
              <div class="ps-text"><b>挑戦者募集中</b><span>SLOT 2 / OPEN</span></div>
              <span class="ready-chip" style="color:#ffcf9d;border-color:rgba(255,207,107,.25);background:rgba(255,207,107,.06)">WAITING</span>
            </div>`}
        </div>
      </section>

      <aside class="panel room-side-panel">
        <div class="panel-head"><h2>使用デッキ</h2><span class="muted">${deckSize(DECKS[profile.deckId] || DECKS.flame)} + EX</span></div>
        <div class="room-deck-pick" id="roomDeckPick">${deckOpts}</div>
        <div class="room-actions">
          <button class="primary-btn wide" id="startRoomDuel">${startLabel}</button>
          ${isMine ? '' : '<button class="secondary-btn wide" id="leaveRoomBtn">ルームを退出</button>'}
        </div>
        <p class="tiny" style="padding:10px 18px 0">${isMine
          ? 'ルームマッチはオンライン専用です。開始すると挑戦者が入室し、そのままデュエルが始まります。'
          : 'ルームマッチはオンライン専用です。デュエル開始でホストとの対戦が始まります。'}</p>
      </aside>
    </div>
  `;

  const startBtn = $('startRoomDuel');
  startBtn.addEventListener('click', () => startFromRoom(room));
  $('leaveRoomBtn')?.addEventListener('click', () => {
    leaveOtherRoom();
    toast('ルームを退出しました', 'good');
    showLobby();
  });
  $('copyRoomBtn').addEventListener('click', () => copyCode(room.code));
  $('roomOnlineChip').addEventListener('click', () => toast(`現在 ${online.count} 人がオンライン`, 'good'));

  $('roomDeckPick').addEventListener('click', e => {
    const btn = e.target.closest('[data-deck]');
    if (!btn) return;
    setDeck(btn.dataset.deck);
    renderDeckPicker();
    renderRoomDetail(room);
    sfx('select');
  });
}

function copyCode(code) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => toast(`ルームコード ${code} をコピーしました`, 'good')).catch(() => toast(`ルームコード: ${code}`, 'gold'));
  } else {
    toast(`ルームコード: ${code}`, 'gold');
  }
}

function startFromRoom(room) {
  if (!room) return;
  if (room.mine) room = online.myRoom;
  app.roomRef = room;
  app.token += 1;

  let oppName;
  let oppDeckId;
  if (room.mine) {
    const challenger = acceptChallenger() || online.myRoom?.challenger;
    oppName = challenger?.name || 'CHALLENGER';
    oppDeckId = challenger?.deckId || otherDeck();
    toast(`${oppName} がルームに入室しました`, 'good');
  } else {
    oppName = room.host.name;
    oppDeckId = room.host.deckId || otherDeck();
  }

  startDuel({
    oppName,
    oppDeckId,
    modeLabel: room.mine ? 'MY ROOM' : 'ONLINE ROOM',
    roomCode: room.code,
    lp: room.lp || 8000,
  });
}

function otherDeck() {
  const ids = Object.keys(DECKS).filter(id => id !== profile.deckId);
  return ids[Math.floor(Math.random() * ids.length)] || 'abyss';
}

export function renderLobbyAll() {
  renderProfile();
  renderDeckPicker();
  renderMyRoom();
  renderRecord();
  renderRooms();
  renderOnline();
}
