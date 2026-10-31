// Lobby data: a persistent profile, the player's always-on room, and a
// believable online room list populated by rival duelists.

const PROFILE_KEY = 'duel24.profile.v1';

export const BOTS = [
  { name: 'KAI', rank: 'GOLD II', avatarClass: 'pink', mode: 'CASUAL', difficulty: 'normal', line: '前衛を制する者が24を制す。' },
  { name: 'SORA', rank: 'DIAMOND IV', avatarClass: '', mode: 'RANKED', difficulty: 'hard', line: '空を斬る剣は、ゼロまで届く。' },
  { name: 'VEX', rank: 'PLATINUM I', avatarClass: 'pink', mode: 'CASUAL', difficulty: 'normal', line: 'ネオンの中では、影がよく見える。' },
  { name: 'MOMO', rank: 'GOLD IV', avatarClass: 'green', mode: 'CASUAL', difficulty: 'easy', line: '初心者歓迎！でも手は抜かないよ。' },
  { name: 'KURO', rank: 'MASTER', avatarClass: 'gold', mode: 'RANKED', difficulty: 'hard', line: '深夜のLPは、ゼロがよく似合う。' },
  { name: 'NOVA', rank: 'SILVER I', avatarClass: '', mode: 'CASUAL', difficulty: 'easy', line: '24ゾーン、全部使って勝つ。' },
  { name: 'GIGA', rank: 'DIAMOND II', avatarClass: 'gold', mode: 'RANKED', difficulty: 'hard', line: '鋼の前衛は、そう簡単には崩れない。' },
  { name: 'RIN', rank: 'PLATINUM III', avatarClass: 'green', mode: 'RANKED', difficulty: 'normal', line: '風を読めば、突破は見える。' },
];

const ROOM_NAMES = [
  '蒼穹の決闘場',
  'NEON UNDERGROUND',
  '初心者歓迎！24ZONE',
  '深夜のゼロポイント',
  'DUEL ROOM 024',
  'TITAN ARENA',
  '星海のラウンジ',
  'ZERO POINT CAFE',
  '紅蓮のゲート',
];

const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length = 4) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODES[Math.floor(Math.random() * CODES.length)];
  return out;
}

export function loadProfile() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
  } catch {
    stored = null;
  }
  const base = {
    name: 'YOU',
    rank: 'SILVER III',
    level: 24,
    wins: 12,
    losses: 7,
    sound: true,
    roomCode: randomCode(),
    createdAt: Date.now(),
  };
  return { ...base, ...(stored || {}) };
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can be unavailable in private modes; the duel still works.
  }
}

export function pickBot(seed = Math.random()) {
  return BOTS[Math.floor(seed * BOTS.length) % BOTS.length];
}

export function pickSoloBot(difficulty = 'normal') {
  const pool = BOTS.filter(bot => bot.difficulty === difficulty);
  return pool[Math.floor(Math.random() * pool.length)] || pickBot();
}

export function createSoloRoom(profile, difficulty = 'normal') {
  const bot = pickSoloBot(difficulty);
  const labels = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };
  return {
    id: `solo-${randomCode(6)}`,
    code: 'SOLO',
    name: `SOLO DUEL / ${labels[difficulty] || 'NORMAL'}`,
    host: 'CPU',
    hostRank: bot.rank,
    hostInitial: 'C',
    avatarClass: bot.avatarClass,
    mode: 'SOLO',
    ping: 0,
    status: 'dueling',
    players: 2,
    maxPlayers: 2,
    zones: 24,
    lp: 3000,
    isOwn: false,
    isSolo: true,
    difficulty,
    opponent: bot,
    live: false,
  };
}

export function createOwnRoom(profile, bot = pickBot()) {
  return {
    id: `own-${profile.roomCode || randomCode()}`,
    code: profile.roomCode || randomCode(),
    name: '自分のルーム',
    host: profile.name,
    hostRank: profile.rank,
    hostInitial: (profile.name[0] || 'Y').toUpperCase(),
    avatarClass: 'own',
    mode: 'CASUAL',
    ping: 6 + Math.floor(Math.random() * 9),
    status: 'dueling',
    players: 2,
    maxPlayers: 2,
    zones: 24,
    lp: 3000,
    isOwn: true,
    opponent: bot,
    live: true,
  };
}

export function createRivalRooms(profile, ownRoom) {
  const bots = BOTS.slice();
  // Rotate the roster so the room list has a fresh cast each boot.
  const offset = Math.floor(Math.random() * bots.length);
  const rotated = bots.slice(offset).concat(bots.slice(0, offset));
  const rooms = [];
  for (let i = 0; i < 7; i += 1) {
    const bot = rotated[i % rotated.length];
    const dueling = i % 3 !== 1;
    rooms.push({
      id: `rival-${i}-${randomCode(3)}`,
      code: randomCode(4),
      name: ROOM_NAMES[(i + offset) % ROOM_NAMES.length],
      host: bot.name,
      hostRank: bot.rank,
      hostInitial: bot.name[0],
      avatarClass: bot.avatarClass,
      mode: bot.mode,
      ping: 9 + Math.floor(Math.random() * 78),
      status: dueling ? 'dueling' : 'waiting',
      players: dueling ? 2 : 1,
      maxPlayers: 2,
      zones: 24,
      lp: 3000,
      isOwn: false,
      opponent: bot,
      live: i < 2,
    });
  }
  return [ownRoom, ...rooms];
}

export function refreshRooms(rooms) {
  return rooms.map(room => {
    if (room.isOwn) {
      return {
        ...room,
        ping: Math.max(4, room.ping + Math.floor(Math.random() * 5) - 2),
      };
    }
    const ping = Math.max(7, Math.min(120, room.ping + Math.floor(Math.random() * 13) - 6));
    let status = room.status;
    let players = room.players;
    if (!room.isOwn && Math.random() < 0.16) {
      if (status === 'waiting') {
        status = 'dueling';
        players = 2;
      } else {
        status = 'waiting';
        players = 1;
      }
    }
    return { ...room, ping, status, players };
  });
}

export function rankForName(name) {
  return BOTS.find(bot => bot.name === name)?.rank || 'GOLD II';
}
