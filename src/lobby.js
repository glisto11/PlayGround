// Cross-tab room lobby.
//
// The harness has no server, so "online" presence is shared between tabs of the
// same origin with localStorage + BroadcastChannel. Opening the game in a second
// tab really does create a second duelist and updates this room list.

const REGISTRY_KEY = 'duel24.rooms.v3'
const PROFILE_KEY = 'duel24.profile.v3'
const SESSION_KEY = 'duel24.session.v3'
const LOBBY_CHANNEL = 'duel24.lobby.v3'
const STALE_MS = 9000
const BEAT_MS = 1800
const MAX_PLAYERS = 2

const ADJECTIVES = ['NOVA', 'ZERO', 'ASTRA', 'KAI', 'LUMA', 'VOLT', 'NEON', 'RYU', 'ECHO', 'ORBIT']
const SUFFIX = '0123456789ABCDEF'

function randomId(prefix = 'r') {
  const bytes = new Uint8Array(8)
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

function randomHandle() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const tail = Array.from({ length: 2 }, () => SUFFIX[Math.floor(Math.random() * SUFFIX.length)]).join('')
  return `${adj}-${tail}`
}

function readRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{"rooms":[]}')
    return Array.isArray(parsed.rooms) ? parsed.rooms : []
  } catch {
    return []
  }
}

function writeRegistry(rooms) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify({ rooms }))
  } catch {
    /* storage can be unavailable in private mode */
  }
}

function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
    if (raw && typeof raw.name === 'string' && raw.name) return raw
  } catch { /* ignore */ }
  return null
}

function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) } catch { /* ignore */ }
}

function loadSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || ''
  } catch {
    return ''
  }
}

export class Lobby {
  constructor({ onChange, onToast, onRoomMessage } = {}) {
    this.onChange = onChange || (() => {})
    this.onToast = onToast || (() => {})
    this.onRoomMessage = onRoomMessage || (() => {})
    this.clientId = loadSession() || randomId('d')
    try { sessionStorage.setItem(SESSION_KEY, this.clientId) } catch { /* ignore */ }

    const profile = loadProfile()
    this.name = profile?.name || randomHandle()
    this.wins = profile?.wins || 0
    this.profile = { name: this.name, wins: this.wins }

    this.rooms = []
    this.currentId = ''
    this.channel = null
    this.roomChannel = null
    this.beat = null
  }

  start() {
    try {
      this.channel = new BroadcastChannel(LOBBY_CHANNEL)
      this.channel.onmessage = () => this.refresh()
    } catch { /* BroadcastChannel is optional */ }

    // Always own a room at startup, and always be joined to it.
    const reused = this.findReusableOwnRoom()
    if (reused) {
      this.currentId = reused.id
      this.touchRoom(this.currentId)
    } else {
      this.createRoom({ silent: true })
    }
    this.openRoomChannel()
    this.beat = window.setInterval(() => this.heartbeat(), BEAT_MS)
    window.addEventListener('beforeunload', () => this.detach())
    this.refresh(true)
  }

  removePlayer(rooms, roomId) {
    return rooms
      .map(room => {
        if (room.id !== roomId) return room
        const hadHost = room.hostId === this.clientId
        room.players = room.players.filter(p => p.id !== this.clientId)
        if (!room.players.length) return null
        if (hadHost) {
          room.hostId = room.players[0].id
          room.hostName = room.players[0].name
        }
        return room
      })
      .filter(Boolean)
  }

  findReusableOwnRoom() {
    const now = Date.now()
    return readRegistry().find(room => (
      room.hostId === this.clientId
      && now - room.updatedAt < STALE_MS
      && room.players.some(p => p.id === this.clientId)
    )) || null
  }

  get profileName() {
    return this.name
  }

  get currentRoom() {
    return this.rooms.find(r => r.id === this.currentId) || null
  }

  get winsCount() {
    return this.wins
  }

  recordWin() {
    this.wins += 1
    this.profile.wins = this.wins
    saveProfile(this.profile)
    this.onChange(this.rooms, this.currentId)
  }

  randomizeName() {
    this.name = randomHandle()
    this.profile.name = this.name
    saveProfile(this.profile)
    this.onChange(this.rooms, this.currentId)
  }

  prune(rooms, now = Date.now()) {
    return rooms.filter(room => {
      if (!room || !Array.isArray(room.players)) return false
      if (!room.players.length) return false
      if (now - room.updatedAt > STALE_MS) return false
      if (room.players.length === 1 && room.players[0].id !== this.clientId && now - room.updatedAt > STALE_MS / 2) {
        // Give silent tabs a little room before deleting their room.
        return now - room.updatedAt <= STALE_MS
      }
      return true
    }).map(room => ({
      ...room,
      players: room.players.filter(p => now - (p.seen || room.updatedAt) < STALE_MS),
    })).filter(room => room.players.length)
  }

  refresh(force = false) {
    const now = Date.now()
    const rooms = this.prune(readRegistry(), now)
    rooms.sort((a, b) => {
      if (a.id === this.currentId) return -1
      if (b.id === this.currentId) return 1
      return b.updatedAt - a.updatedAt
    })
    const changed = force
      || rooms.length !== this.rooms.length
      || JSON.stringify(rooms.map(r => [r.id, r.updatedAt, r.players.length, r.status]))
        !== JSON.stringify(this.rooms.map(r => [r.id, r.updatedAt, r.players.length, r.status]))
    this.rooms = rooms
    if (!rooms.find(r => r.id === this.currentId)) {
      // The room vanished (host tab closed): land in a fresh personal room.
      this.createRoom({ silent: true, noRefresh: true })
      return
    }
    if (changed) this.onChange(rooms, this.currentId)
  }

  createRoom({ silent = false, noRefresh = false } = {}) {
    const previous = this.currentId
    const now = Date.now()
    const room = {
      id: randomId('room'),
      name: `${this.name} のルーム`,
      hostId: this.clientId,
      hostName: this.name,
      players: [{ id: this.clientId, name: this.name, seen: now }],
      status: 'CPU DUEL',
      max: MAX_PLAYERS,
      createdAt: now,
      updatedAt: now,
      seed: Math.floor(Math.random() * 1e9),
    }
    let rooms = this.prune(readRegistry(), now)
    if (previous) {
      rooms = this.removePlayer(rooms, previous)
    }
    rooms.unshift(room)
    writeRegistry(rooms)
    this.currentId = room.id
    this.openRoomChannel()
    this.broadcastSync()
    if (!silent) this.onToast(`ルーム「${room.name}」を開設しました`, 'join')
    if (!noRefresh) this.refresh(true)
    return room
  }

  joinRoom(roomId) {
    const now = Date.now()
    let rooms = this.prune(readRegistry(), now)
    const target = rooms.find(r => r.id === roomId)
    if (!target) {
      this.onToast('そのルームはもう存在しません', 'error')
      this.refresh(true)
      return false
    }
    if (target.id === this.currentId) {
      this.onToast('すでにこのルームに参加しています', 'info')
      return true
    }
    if (target.players.some(p => p.id === this.clientId)) {
      this.currentId = target.id
      this.openRoomChannel()
      this.refresh(true)
      return true
    }
    if (target.players.length >= (target.max || MAX_PLAYERS)) {
      this.onToast('ルームが満員です（2/2）', 'error')
      return false
    }
    // Leave the previous room.
    const previous = this.currentId
    if (previous) {
      rooms = this.removePlayer(rooms, previous)
    }
    target.players.push({ id: this.clientId, name: this.name, seen: now })
    target.updatedAt = now
    target.status = target.players.length > 1 ? 'PVP READY' : 'CPU DUEL'
    writeRegistry(rooms)
    this.currentId = target.id
    this.openRoomChannel()
    this.onToast(`「${target.name}」に参加しました`, 'join')
    this.broadcastSync()
    this.refresh(true)
    return true
  }

  leaveRoom() {
    // Always keep the player inside a personal room after leaving.
    this.onToast('自分のルームへ戻りました', 'info')
    return this.createRoom()
  }

  touchRoom(roomId) {
    const now = Date.now()
    const rooms = this.prune(readRegistry(), now)
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    const player = room.players.find(p => p.id === this.clientId)
    if (!player) return
    player.seen = now
    player.name = this.name
    room.updatedAt = now
    if (room.hostId === this.clientId) room.hostName = this.name
    writeRegistry(rooms)
  }

  setStatus(status) {
    const now = Date.now()
    const rooms = this.prune(readRegistry(), now)
    const room = rooms.find(r => r.id === this.currentId)
    if (!room) return
    room.status = status
    room.updatedAt = now
    writeRegistry(rooms)
    this.broadcastSync()
    this.onChange(this.rooms, this.currentId)
  }

  heartbeat() {
    const now = Date.now()
    let rooms = this.prune(readRegistry(), now)
    let touched = false
    for (const room of rooms) {
      const player = room.players.find(p => p.id === this.clientId)
      if (!player) continue
      player.seen = now
      player.name = this.name
      room.updatedAt = now
      if (room.hostId === this.clientId) room.hostName = this.name
      touched = true
    }
    if (touched) {
      writeRegistry(rooms)
      this.broadcastSync()
    }
    this.refresh()
  }

  detach() {
    if (this.beat) window.clearInterval(this.beat)
    try {
      const rooms = readRegistry()
      const room = rooms.find(r => r.id === this.currentId)
      if (room) {
        room.players = room.players.filter(p => p.id !== this.clientId)
        if (!room.players.length) rooms.splice(rooms.indexOf(room), 1)
        writeRegistry(rooms)
      }
      this.channel?.close()
      this.roomChannel?.close()
    } catch { /* ignore */ }
    this.broadcastSync()
  }

  openRoomChannel() {
    try {
      this.roomChannel?.close()
    } catch { /* ignore */ }
    this.roomChannel = null
    if (!this.currentId) return
    try {
      this.roomChannel = new BroadcastChannel(`duel24.room.${this.currentId}`)
      this.roomChannel.onmessage = event => this.onRoomMessage(event.data, event)
    } catch { /* ignore */ }
  }

  sendRoom(payload) {
    try { this.roomChannel?.postMessage(payload) } catch { /* ignore */ }
  }

  broadcastSync() {
    try { this.channel?.postMessage({ type: 'sync', from: this.clientId, at: Date.now() }) } catch { /* ignore */ }
  }

  // Seconds since this room last reported a heartbeat, rendered as ping.
  pingFor(room) {
    const age = Math.max(0, Date.now() - room.updatedAt)
    return Math.min(4, 1 + Math.floor(age / 2500))
  }
}
