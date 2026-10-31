// Cross-tab room registry and realtime transport.
// Rooms live in localStorage (shared instantaneously between tabs) and
// live messages travel over BroadcastChannel.

const ROOM_KEY = 'duel24.rooms.v3'
const CHANNEL_NAME = 'duel24.net.v3'
const STALE_MS = 45000

export function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function randomName() {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `DUELIST-${n}`
}

function readAll() {
  try {
    const raw = localStorage.getItem(ROOM_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(rooms) {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify(rooms))
  } catch {
    /* storage might be unavailable; rooms still work inside this tab */
  }
}

export class RoomNet {
  constructor({ clientId, name, onMessage, onRooms }) {
    this.clientId = clientId
    this.name = name
    this.onMessage = onMessage || (() => {})
    this.onRooms = onRooms || (() => {})
    this.ownRoomId = null
    this.channel = null
    this.heartbeatTimer = null
    this.lastSeen = {}
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event) => {
        if (event.data) this.onMessage(event.data)
      }
    } catch {
      this.channel = null
    }
    window.addEventListener('storage', (event) => {
      if (event.key === ROOM_KEY) this.onRooms()
    })
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 4000)
  }

  ensureOwnRoom() {
    const rooms = readAll()
    let room = this.ownRoomId ? rooms[this.ownRoomId] : null
    if (!room) {
      const id = `r${Math.random().toString(36).slice(2, 10)}`
      room = {
        id,
        code: randomCode(),
        hostId: this.clientId,
        hostName: this.name,
        guestId: null,
        guestName: null,
        mode: 'cpu',
        joinable: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      // prune truly abandoned rooms from earlier sessions
      for (const [key, value] of Object.entries(rooms)) {
        if (!value || Date.now() - (value.updatedAt || 0) > 120000) delete rooms[key]
      }
      rooms[id] = room
      writeAll(rooms)
      this.ownRoomId = id
      this.broadcast({ type: 'rooms' })
    } else {
      this.ownRoomId = room.id
      this.updateRoom(room.id, { hostName: this.name })
    }
    this.onRooms()
    return this.ownRoom()
  }

  ownRoom() {
    if (!this.ownRoomId) return null
    return readAll()[this.ownRoomId] || null
  }

  updateRoom(id, patch, broadcast = true) {
    const rooms = readAll()
    const room = rooms[id]
    if (!room) return null
    Object.assign(room, patch, { updatedAt: Date.now() })
    rooms[id] = room
    writeAll(rooms)
    if (broadcast) this.broadcast({ type: 'rooms' })
    this.onRooms()
    return room
  }

  setAway(away) {
    if (!this.ownRoomId) return
    this.updateRoom(this.ownRoomId, {
      mode: away ? 'away' : 'cpu',
      joinable: !away,
      guestId: null,
      guestName: null,
    })
  }

  removeRoom(id) {
    const rooms = readAll()
    if (!rooms[id]) return
    delete rooms[id]
    writeAll(rooms)
    this.broadcast({ type: 'rooms' })
    this.onRooms()
  }

  list() {
    const rooms = readAll()
    return Object.values(rooms)
      .filter((room) => room && room.id && room.hostId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }

  fresh(room, windowMs = STALE_MS) {
    return !!room && Date.now() - (room.updatedAt || 0) < windowMs
  }

  heartbeat() {
    if (!this.ownRoomId) return
    const rooms = readAll()
    const room = rooms[this.ownRoomId]
    if (!room) return
    room.updatedAt = Date.now()
    room.hostName = this.name
    writeAll(rooms)
    this.broadcast({ type: 'heartbeat', roomId: this.ownRoomId, from: this.clientId, name: this.name })
  }

  send(message) {
    if (!this.channel) return
    try {
      this.channel.postMessage(message)
    } catch {
      /* ignore */
    }
  }

  broadcast(message) {
    this.send(message)
  }

  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.ownRoomId) this.removeRoom(this.ownRoomId)
    if (this.channel) {
      try { this.channel.close() } catch { /* ignore */ }
      this.channel = null
    }
  }
}
