/* Simulated online room list + mandatory personal room on boot. */

import { DECKS } from './cards.js';

const NAMES = [
  'KAIROS', '夜叉', 'LUMEN', '灼熱のタケシ', 'nyx_', '∂elta', 'Mizuki', 'GARO',
  '星屑', 'VANTA', 'シオン', 'Rook', '雨宮', 'ZERO', 'こはく', 'AXIOM', '月影',
  'NEO', 'はるか', 'DUSK', '九条', 'ORBITAL', 'ミナ', 'RUST', '灯', 'FABLE',
  'カイ', 'SABLE', '遠野', 'ECHO', 'しずく', 'VEGA',
];

const RANKS = ['BRONZE III', 'SILVER II', 'GOLD IV', 'GOLD I', 'PLATINUM III', 'DIAMOND II', 'MASTER', 'ROOKIE'];
const TAGS = ['連撃型', '罠師', 'バーン', 'EX特化', '除去型', '速攻', '耐久', 'コンボ'];
const AVATAR_COLORS = ['#4de3ff', '#ff7a45', '#b06bff', '#5dffb0', '#ffcf6b', '#ff5ca8', '#6c8dff', '#9dffd0'];

const STORAGE_KEY = 'duel24.profile.v1';

export const profile = {
  name: 'DUELIST',
  deckId: 'flame',
  wins: 0,
  losses: 0,
  room: null,
};

export const online = { count: 128, rooms: [], myRoom: null, selectedRoomId: null, joinedMyRoom: true };

let listeners = new Set();
let tickTimer = null;
let tickNo = 0;

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const hash = str => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
};

export function avatarColor(name) {
  return AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
}

export function initials(name) {
  const clean = name.replace(/[^\p{L}\p{N}]/gu, '');
  return (clean.slice(0, 2) || 'DU').toUpperCase();
}

export function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `D24-${s}`;
}

function makeHost(name) {
  return {
    name,
    rank: pick(RANKS),
    tag: pick(TAGS),
    color: avatarColor(name),
    ping: 8 + Math.floor(Math.random() * 74),
    deckId: pick(Object.keys(DECKS)),
  };
}

function randomRoom(i) {
  const name = pick(NAMES);
  const host = makeHost(name);
  const statusRoll = Math.random();
  const players = statusRoll > 0.62 ? 2 : 1;
  const status = statusRoll > 0.85 ? 'dueling' : statusRoll > 0.62 ? 'full' : 'open';
  return {
    id: `r${Date.now().toString(36)}${i}${Math.floor(Math.random() * 999)}`,
    code: makeRoomCode(),
    host,
    mode: pick(['RANKED', 'CASUAL', 'RANKED', 'EX ONLY', 'NO IMAGE']),
    lp: pick([8000, 8000, 8000, 6000, 4000]),
    zones: 24,
    players,
    max: 2,
    status,
    mine: false,
    deckId: host.deckId,
    note: pick(['24ゾーン / LP0勝利', '画像なし / テキストカード', 'EXゾーン解放', '伏せ罠あり']),
  };
}

export function getDeckIdFor(room) {
  return room?.host?.deckId || pick(Object.keys(DECKS));
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(profile, JSON.parse(raw));
  } catch { /* ignore */ }
  if (!profile.room || !profile.room.code) {
    profile.room = { code: makeRoomCode(), createdAt: Date.now(), id: `mine-${Math.random().toString(36).slice(2, 8)}` };
  }
  if (!profile.name || profile.name === 'DUELIST') {
    // keep a friendly default but stable
    profile.name = 'DUELIST';
  }
  saveProfile();
}

export function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function renamePlayer(name) {
  const clean = (name || '').trim().slice(0, 18);
  if (!clean) return false;
  profile.name = clean;
  saveProfile();
  emit();
  return true;
}

export function setDeck(deckId) {
  if (!DECKS[deckId]) return;
  profile.deckId = deckId;
  saveProfile();
  emit();
}

export function addResult(result) {
  if (result === 'win') profile.wins += 1;
  else if (result === 'loss') profile.losses += 1;
  saveProfile();
  emit();
}

function buildMyRoom() {
  const challenger = online.myRoom?.challenger || null;
  return {
    id: profile.room.id,
    code: profile.room.code,
    host: {
      name: profile.name,
      rank: 'CHALLENGER',
      tag: 'あなた',
      color: '#ffcf6b',
      ping: 4,
      deckId: profile.deckId,
    },
    mode: 'MY ROOM',
    lp: 8000,
    zones: 24,
    players: challenger ? 2 : 1,
    max: 2,
    status: challenger ? 'full' : 'open',
    mine: true,
    deckId: profile.deckId,
    note: '起動時に自動作成 / 自動参加',
    challenger,
  };
}

export function emit() {
  online.myRoom = buildMyRoom();
  online.rooms = [online.myRoom, ...online.roomPool];
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initRooms() {
  loadProfile();
  online.myRoom = buildMyRoom();
  online.roomPool = Array.from({ length: 8 }, (_, i) => randomRoom(i));
  online.rooms = [online.myRoom, ...online.roomPool];
  online.count = 110 + Math.floor(Math.random() * 90);
  emit();

  if (!tickTimer) {
    tickTimer = setInterval(tick, 4200);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      emit();
    });
  }
}

function tick() {
  tickNo++;
  online.count = Math.max(60, Math.min(260, online.count + Math.floor(Math.random() * 13) - 6));

  for (const room of online.roomPool) {
    if (room.joined) continue;
    if (Math.random() < 0.34) room.host.ping = Math.max(6, Math.min(120, room.host.ping + Math.floor(Math.random() * 11) - 5));
    if (Math.random() < 0.18) {
      const roll = Math.random();
      if (roll < 0.4 && room.players === 1) { room.players = 2; room.status = 'full'; }
      else if (roll < 0.7 && room.players === 2) { room.players = 1; room.status = 'open'; }
      else if (roll < 0.85 && room.status === 'full') room.status = 'dueling';
      else { room.players = 1; room.status = 'open'; }
    }
  }

  if (tickNo % 3 === 0) {
    const open = online.roomPool
      .map((room, i) => ({ room, i }))
      .filter(x => !x.room.joined && !x.room.mine);
    if (open.length) {
      const pickOne = open[Math.floor(Math.random() * open.length)];
      online.roomPool[pickOne.i] = randomRoom(pickOne.i);
    }
  }

  if (tickNo % 2 === 0) {
    const my = online.myRoom;
    if (!my?.challenger && Math.random() < 0.12) {
      const name = pick(NAMES);
      online.myRoom = { ...my, challenger: makeHost(name) };
    }
  }

  emit();
}

export function selectRoom(id) {
  online.selectedRoomId = id;
  emit();
}

export function getRoom(id) {
  return online.rooms.find(r => r.id === id) || null;
}

export function acceptChallenger() {
  if (!online.myRoom) return null;
  if (!online.myRoom.challenger) {
    const host = makeHost(pick(NAMES));
    online.myRoom = { ...online.myRoom, challenger: host, players: 2, status: 'full' };
  }
  emit();
  return online.myRoom.challenger;
}

export function clearChallenger() {
  if (online.myRoom) online.myRoom = { ...online.myRoom, challenger: null, players: 1, status: 'open' };
  emit();
}

export function joinRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  if (room.mine) return room;
  if (room.joined) return room;
  if (room.status === 'dueling' || room.players >= 2) return null;

  // You can only hold one guest seat at a time. Release the previous room.
  const prev = online.joinedOther;
  if (prev && prev !== room) {
    prev.joined = false;
    prev.players = 1;
    prev.status = 'open';
  }

  room.players = 2;
  room.status = 'full';
  room.joined = true;
  online.selectedRoomId = room.id;
  online.joinedOther = room;
  emit();
  return room;
}

export function leaveOtherRoom() {
  const room = online.joinedOther;
  if (room) {
    room.joined = false;
    room.players = 1;
    room.status = 'open';
  }
  online.joinedOther = null;
  online.selectedRoomId = null;
  emit();
}
