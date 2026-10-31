// Room lobby + host-authoritative duel sync over BroadcastChannel.
// Works across tabs/windows of the same browser without any server.
const CHANNEL = 'duel24-online-lobby-v1';

export function randomRoomId() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export class RoomNet {
  constructor({ name, onRooms, onJoinRequest, onStart, onState, onAction, onGuestLeft, onHostLeft }) {
    this.id = `${name}-${Math.random().toString(36).slice(2, 7)}`;
    this.name = name;
    this.onRooms = onRooms;
    this.onJoinRequest = onJoinRequest;
    this.onStart = onStart;
    this.onState = onState;
    this.onAction = onAction;
    this.onGuestLeft = onGuestLeft;
    this.onHostLeft = onHostLeft;
    this.peers = new Map();
    this.pendingJoin = null;
    this.onlineRoom = null;
    this.viewer = 0;
    this.seq = 0;

    this.room = {
      id: randomRoomId(),
      hostId: this.id,
      hostName: name,
      guestId: null,
      guestName: null,
      status: 'waiting',
      createdAt: Date.now(),
      seen: Date.now(),
    };

    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = e => this.handle(e.data);
    this.timer = setInterval(() => {
      this.broadcastRoom();
      this.prune();
    }, 2500);
    window.addEventListener('beforeunload', () => this.leaveAll());
    setTimeout(() => this.broadcastRoom(), 60);
  }

  post(msg) {
    try { this.channel.postMessage(msg); } catch { /* channel closed */ }
  }

  broadcastRoom() {
    this.room.seen = Date.now();
    this.post({ type: 'hello', room: this.room });
    this.emitRooms();
  }

  prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > 7000) { this.peers.delete(id); changed = true; }
    }
    if (changed) this.emitRooms();
  }

  rooms() {
    const own = { ...this.room, self: true, players: this.room.guestId ? 2 : 1 };
    const list = [own];
    for (const peer of this.peers.values()) {
      if (peer.room.hostId === this.id) continue;
      list.push({
        ...peer.room,
        self: false,
        players: peer.room.guestId ? 2 : 1,
        online: Date.now() - peer.lastSeen < 7000,
      });
    }
    return list;
  }

  emitRooms() {
    this.onRooms?.(this.rooms(), this.peers.size + 1);
  }

  handle(msg) {
    if (!msg || msg.senderId === this.id) return;
    if (msg.type === 'hello') {
      if (!msg.room || msg.room.hostId === this.id) return;
      this.peers.set(msg.senderId, { room: msg.room, lastSeen: Date.now() });
      this.emitRooms();
      return;
    }
    if (msg.type === 'bye') {
      if (this.peers.delete(msg.senderId)) this.emitRooms();
      if (this.room.guestId === msg.senderId) {
        this.room.guestId = null;
        this.room.guestName = null;
        if (this.room.status === 'online') this.room.status = 'waiting';
        this.onlineRoom = null;
        this.broadcastRoom();
        this.onGuestLeft?.(msg.name || '対戦相手');
      }
      if (this.onlineRoom && msg.hostId === this.onlineRoom) {
        this.onHostLeft?.(msg.name || 'ホスト');
      }
      return;
    }
    if (msg.type === 'join') {
      if (msg.roomId !== this.room.id) return;
      if (this.room.guestId) return;
      this.room.guestId = msg.senderId;
      this.room.guestName = msg.name;
      this.room.status = 'online';
      this.onlineRoom = this.room.id;
      this.viewer = 0;
      this.broadcastRoom();
      this.post({
        type: 'start', roomId: this.room.id, senderId: this.id, senderName: this.name,
        hostId: this.id, hostName: this.name, guestId: msg.senderId, guestName: msg.name,
      });
      this.onStart?.({ hostName: this.name, guestName: msg.name, guestId: msg.senderId, viewer: 0 });
      return;
    }
    if (msg.type === 'start') {
      if (msg.guestId !== this.id) return;
      this.pendingJoin = null;
      this.onlineRoom = msg.roomId;
      this.viewer = 1;
      this.onStart?.({ hostName: msg.hostName, guestName: this.name, guestId: this.id, viewer: 1 });
      return;
    }
    if (msg.type === 'state') {
      if (msg.roomId !== this.onlineRoom) return;
      if (msg.viewer === this.viewer) return;
      this.onState?.(msg.game, msg.events || [], msg.seq);
      return;
    }
    if (msg.type === 'action') {
      if (msg.roomId !== this.onlineRoom) return;
      if (msg.senderId !== this.room.guestId) return;
      this.onAction?.(msg.action);
      return;
    }
    if (msg.type === 'room-gone') {
      if (this.pendingJoin === msg.roomId) {
        this.pendingJoin = null;
        this.onHostLeft?.(msg.name || 'ホスト');
      }
    }
  }

  join(roomId) {
    if (this.room.status === 'online') return false;
    this.pendingJoin = roomId;
    this.post({ type: 'join', roomId, senderId: this.id, senderName: this.name, name: this.name });
    return true;
  }

  pushState(game, events = []) {
    if (this.viewer !== 0 || !this.onlineRoom) return;
    this.seq++;
    this.post({
      type: 'state', roomId: this.onlineRoom, senderId: this.id, senderName: this.name,
      viewer: 0, seq: this.seq, game, events,
    });
  }

  sendAction(action) {
    if (!this.onlineRoom) return;
    this.post({
      type: 'action', roomId: this.onlineRoom, senderId: this.id, senderName: this.name,
      action: { ...action, player: 1 },
    });
  }

  setStatus(status) {
    this.room.status = status;
    this.broadcastRoom();
  }

  leaveOnline() {
    if (this.onlineRoom) this.post({ type: 'bye', senderId: this.id, name: this.name, hostId: this.onlineRoom });
    this.onlineRoom = null;
    this.pendingJoin = null;
    if (this.room.status === 'online') this.room.status = 'waiting';
    this.broadcastRoom();
  }

  newRoom() {
    this.leaveOnline();
    this.room.id = randomRoomId();
    this.room.guestId = null;
    this.room.guestName = null;
    this.room.status = 'waiting';
    this.room.createdAt = Date.now();
    this.viewer = 0;
    this.broadcastRoom();
    return this.room.id;
  }

  leaveAll() {
    this.post({ type: 'bye', senderId: this.id, name: this.name, hostId: this.onlineRoom || '' });
    clearInterval(this.timer);
    try { this.channel.close(); } catch { /* noop */ }
  }
}
