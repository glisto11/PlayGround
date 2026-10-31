import { CARDS } from './cards.js'
import {
  createDuel, applyAction, aiChooseAction, zoneMonster,
  countMonsters, canSpecialSummon,
} from './engine.js'
import { RoomNet, randomName } from './rooms.js'
import {
  $, esc, renderTopbar, renderSide, renderCenter, renderHand,
  renderOverlay, roomCodeFor,
} from './render.js'
import { renderDrawer, renderModal } from './panels.js'
import { ensureAudio, sfx, playEvents } from './fx.js'

const NAME_KEY = 'duel24.name'
const SOUND_KEY = 'duel24.sound'

function loadName() {
  let name = ''
  try { name = sessionStorage.getItem(NAME_KEY) || '' } catch { /* ignore */ }
  if (!name) {
    name = randomName()
    try { sessionStorage.setItem(NAME_KEY, name) } catch { /* ignore */ }
  }
  return name
}

function makeClientId() {
  try { return `c${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}` } catch { return `c${Math.random().toString(36).slice(2, 12)}` }
}

class DuelApp {
  constructor() {
    this.clientId = makeClientId()
    this.name = loadName()
    this.ownRoomId = null
    this.inRoomId = null
    this.role = 'host'
    this.mode = 'cpu'
    this.mySide = 0
    this.state = null
    this.guestId = null
    this.guestName = null
    this.hostId = null
    this.hostName = null
    this.hostCode = null
    this.lastGuestSeen = 0
    this.sel = null
    this.modal = null
    this.drawerOpen = false
    this.connecting = false
    this.hostGone = false
    this.resultReady = false
    this.soundOn = true
    this.audio = null
    this.cpuTimer = null
    this.joinTimer = null
    this.resultTimer = null
    this.toastTimer = null
    this.cleaned = false
    try { this.soundOn = sessionStorage.getItem(SOUND_KEY) !== 'off' } catch { /* ignore */ }
  }

  init() {
    this.net = new RoomNet({
      clientId: this.clientId,
      name: this.name,
      onMessage: (msg) => this.onMessage(msg),
      onRooms: () => {
        this.renderTopbar()
        if (this.drawerOpen) this.renderDrawerSafe()
      },
    })
    this.bindEvents()

    const own = this.net.ensureOwnRoom()
    this.ownRoomId = own.id
    this.inRoomId = own.id
    this.hostId = this.clientId
    this.hostCode = own.code
    this.startCpuDuel(true)

    this.tickTimer = setInterval(() => {
      this.renderTopbar()
      if (this.drawerOpen) this.renderDrawerSafe()
    }, 2600)

    this.pingTimer = setInterval(() => {
      if (this.role === 'guest' && this.hostId) {
        this.net.send({ type: 'ping', roomId: this.inRoomId, from: this.clientId, to: this.hostId })
      }
    }, 4000)

    this.watchTimer = setInterval(() => this.watchConnections(), 7000)

    const joinId = new URLSearchParams(location.search).get('join')
    if (joinId) {
      try { history.replaceState({}, '', location.pathname + location.hash) } catch { /* ignore */ }
      setTimeout(() => {
        const ok = this.joinRoomById(joinId, true)
        if (!ok) this.toast('指定されたルームが見つかりません。CPU戦を続けます。', 'warn', 4200)
      }, 850)
    } else {
      setTimeout(() => this.toast('自分のルームを自動生成して入室しました。CPUが相手を務めています。', 'info', 4800), 900)
    }
  }

  /* ────────────────────────── RENDER ────────────────────────── */

  renderTopbar() {
    renderTopbar(this)
  }

  render() {
    if (!this.net) return
    this.pruneSelection()
    renderTopbar(this)
    renderSide(this, 1 - this.mySide, 'opponent')
    renderCenter(this)
    renderSide(this, this.mySide, 'self')
    renderHand(this)
    renderOverlay(this)
    if (this.drawerOpen) this.renderDrawerSafe()
    renderModal(this)
  }

  renderDrawerSafe() {
    if (document.activeElement?.id === 'nameInput') return
    renderDrawer(this)
  }

  pruneSelection() {
    const st = this.state
    if (!st) { this.sel = null; return }
    const sel = this.sel
    if (!sel) return
    const my = st.players[this.mySide]
    if (sel.kind === 'hand' || sel.kind === 'place') {
      if (!my.hand.some((c) => c.uid === sel.uid)) this.sel = null
    } else if (sel.kind === 'attacker') {
      if (!zoneMonster(my, sel.zoneKind, sel.zoneIndex)) this.sel = null
    } else if (sel.kind === 'info') {
      const p = st.players[sel.side]
      const inst = this.instAt(sel.side, sel.zoneKind, sel.zoneIndex)
      if (!inst) this.sel = null
    }
  }

  instAt(side, kind, index) {
    const st = this.state
    if (!st) return null
    const p = st.players[side]
    if (kind === 'monster') return p.monsters[index] || null
    if (kind === 'spell') return p.spells[index] || null
    if (kind === 'field') return p.field
    if (kind === 'emz') return p.emz
    return null
  }

  toast(message, tone = 'info', ms = 3000) {
    const el = $('#toast')
    if (!el) return
    clearTimeout(this.toastTimer)
    el.textContent = message
    el.className = `toast show tone-${tone}`
    this.toastTimer = setTimeout(() => { el.className = 'toast' }, ms)
  }

  /* ────────────────────────── EVENTS ────────────────────────── */

  bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]')
      if (!el || el.disabled) return
      this.handleAction(el.dataset.act, el, e)
    })
    document.addEventListener('pointerdown', () => {
      this.audioUnlocked = true
      ensureAudio(this)
    }, { once: true })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.modal) { this.closeModal(); return }
        if (this.drawerOpen) { this.closeDrawer(); return }
        if (this.sel) { this.sel = null; this.render() }
      }
      if (e.key === 'Enter' && e.target?.id === 'nameInput') {
        e.preventDefault()
        this.saveName()
      }
    })
    window.addEventListener('beforeunload', () => this.cleanup())
    window.addEventListener('pagehide', () => this.cleanup())
  }

  handleAction(act, el) {
    switch (act) {
      case 'openDrawer': this.openDrawer(); break
      case 'closeDrawer': this.closeDrawer(); break
      case 'toggleSound': this.toggleSound(); break
      case 'hand': this.selectHand(el.dataset.uid); break
      case 'placeMode': this.placeMode(el.dataset.mode, el.dataset.uid); break
      case 'cancelSel': this.sel = null; this.render(); break
      case 'zone': this.onZone(Number(el.dataset.side), el.dataset.kind, Number(el.dataset.index)); break
      case 'battle': this.doAction({ type: 'toBattle' }); break
      case 'endTurn': this.doAction({ type: 'endTurn' }); break
      case 'extra': this.openExtraModal(); break
      case 'directAttack': this.directAttack(); break
      case 'openPile': this.openPile(Number(el.dataset.side), el.dataset.pile); break
      case 'closeModal': this.closeModal(); break
      case 'specialSummon':
        this.doAction({ type: 'specialSummon', cardId: el.dataset.cardId })
        this.closeModal()
        break
      case 'activateSpell':
        this.doAction({ type: 'activateSpell', handUid: el.dataset.uid })
        break
      case 'activateSet':
        this.doAction({ type: 'activateSet', zone: Number(el.dataset.zone) })
        break
      case 'joinRoom': this.joinRoomById(el.dataset.room); break
      case 'returnRoom': this.returnToOwnRoom(); break
      case 'copyCode': this.copyText(el.dataset.code, el); break
      case 'openTab': this.openOpponentTab(); break
      case 'saveName': this.saveName(); break
      case 'rematch': this.rematch(); break
      case 'surrender': this.surrender(); break
      default: break
    }
  }

  openDrawer() {
    this.drawerOpen = true
    document.body.classList.add('drawer-open')
    renderDrawer(this)
    sfx(this, 'click')
  }

  closeDrawer() {
    this.drawerOpen = false
    document.body.classList.remove('drawer-open')
  }

  openModalState(modal) {
    this.modal = modal
    document.body.classList.add('modal-open')
    renderModal(this)
  }

  closeModal() {
    this.modal = null
    document.body.classList.remove('modal-open')
    renderModal(this)
  }

  openPile(side, pile) {
    if (!this.state) return
    this.openModalState({ type: 'pile', side, pile })
    sfx(this, 'click')
  }

  openExtraModal() {
    if (!this.state) return
    if (!canSpecialSummon(this.state, this.mySide)) {
      this.toast('EX特殊召喚には自分モンスター2体以上・空のEXゾーンが必要です', 'warn')
      return
    }
    if (this.state.active !== this.mySide || this.state.phase !== 'main') {
      this.toast('自分のメインフェイズでEX特殊召喚できます', 'warn')
      return
    }
    this.openModalState({ type: 'pile', side: this.mySide, pile: 'extra' })
  }

  /* ────────────────────────── SELECTION ────────────────────────── */

  selectHand(uid) {
    if (!this.state) return
    if (this.sel?.kind === 'hand' && this.sel.uid === uid) {
      this.sel = null
    } else {
      this.sel = { kind: 'hand', uid }
      sfx(this, 'click')
    }
    this.render()
  }

  placeMode(mode, uid) {
    const st = this.state
    if (!st) return
    const p = st.players[this.mySide]
    const inst = p.hand.find((c) => c.uid === uid)
    if (!inst) return
    if (st.active !== this.mySide) { this.toast('自分のターンではありません', 'warn'); return }
    if (st.phase !== 'main') { this.toast('メインフェイズで配置してください', 'warn'); return }
    if ((mode === 'summon' || mode === 'setMonster') && p.hasSummoned) {
      this.toast('このターンは既に召喚済みです', 'warn')
      return
    }
    this.sel = { kind: 'place', uid, mode }
    sfx(this, 'click')
    this.render()
  }

  onZone(side, kind, index) {
    const st = this.state
    if (!st) return
    const mine = side === this.mySide
    const inst = this.instAt(side, kind, index)
    const sel = this.sel

    if (sel?.kind === 'place' && mine) {
      const expected = sel.mode === 'setSpell' ? 'spell' : 'monster'
      if (kind !== expected) { this.toast(expected === 'spell' ? '魔法・罠ゾーンを選択してください' : 'モンスターゾーンを選択してください', 'warn'); return }
      if (inst) { this.toast('そのゾーンは埋まっています', 'warn'); return }
      const type = sel.mode === 'setSpell' ? 'setSpell' : sel.mode
      this.doAction({ type, handUid: sel.uid, zone: index })
      return
    }

    if (sel?.kind === 'attacker') {
      if (!mine && (kind === 'monster' || kind === 'emz') && inst) {
        this.doAction({
          type: 'attack', zoneKind: sel.zoneKind, zoneIndex: sel.zoneIndex,
          targetKind: kind, targetIndex: index,
        })
        return
      }
      if (mine) {
        this.selectAttacker(side, kind, index)
        return
      }
      return
    }

    if (mine && kind === 'emz' && !inst && st.phase === 'main' && st.active === this.mySide && canSpecialSummon(st, this.mySide)) {
      this.openExtraModal()
      return
    }

    if (st.phase === 'battle' && st.active === this.mySide && mine && !st.noAttacks && inst &&
        !inst.faceDown && inst.pos === 'atk' && !inst.hasAttacked) {
      this.selectAttacker(side, kind, index)
      return
    }

    if (inst) {
      this.sel = { kind: 'info', side, zoneKind: kind, zoneIndex: index }
      sfx(this, 'click')
      this.render()
    } else {
      this.sel = null
      this.render()
    }
  }

  selectAttacker(side, kind, index) {
    const sel = this.sel
    if (sel?.kind === 'attacker' && sel.zoneKind === kind && sel.zoneIndex === index) {
      this.sel = null
    } else {
      this.sel = { kind: 'attacker', zoneKind: kind, zoneIndex: index }
      sfx(this, 'click')
    }
    this.render()
  }

  directAttack() {
    if (this.sel?.kind !== 'attacker') return
    const st = this.state
    if (!st) return
    const attacker = zoneMonster(st.players[this.mySide], this.sel.zoneKind, this.sel.zoneIndex)
    if (!attacker) return
    const foe = st.players[1 - this.mySide]
    if (countMonsters(foe) > 0 && !CARDS[attacker.id].direct) {
      this.toast('相手モンスターがいるため直接攻撃できません', 'warn')
      return
    }
    this.doAction({
      type: 'attack', zoneKind: this.sel.zoneKind, zoneIndex: this.sel.zoneIndex,
      targetKind: 'direct', targetIndex: 0,
    })
  }

  /* ────────────────────────── ACTIONS ────────────────────────── */

  doAction(action) {
    const st = this.state
    if (!st) return false
    if (st.winner != null) { this.toast('デュエルは終了しています'); return false }
    if (this.connecting || this.hostGone) return false
    if (action.type !== 'surrender' && st.active !== this.mySide) { this.toast('相手のターンです', 'warn'); return false }

    if (this.role === 'guest') {
      if (!this.hostId) return false
      this.net.send({
        type: 'action', roomId: this.inRoomId, from: this.clientId, to: this.hostId, action,
      })
      sfx(this, 'click')
      return true
    }
    return this.applyLocal(this.mySide, action)
  }

  applyLocal(side, action) {
    if (!this.state) return false
    const res = applyAction(this.state, side, action)
    if (!res.ok) {
      this.toast(res.error || '実行できません', 'warn')
      sfx(this, 'error')
      return false
    }
    this.sel = null
    this.render()
    playEvents(this, res.events)
    this.afterLocal(res.events)
    return true
  }

  afterLocal(events) {
    if (this.role === 'host' && this.mode === 'online' && this.guestId) this.sendState(events)
    if (this.state?.winner != null) { this.scheduleResult(); return }
    if (this.mode === 'cpu' && this.role === 'host') {
      if (this.state.active === 1 && this.state.players[1].isCPU) this.scheduleCPU()
      else clearTimeout(this.cpuTimer)
    }
  }

  scheduleCPU() {
    clearTimeout(this.cpuTimer)
    if (this.mode !== 'cpu' || this.role !== 'host' || !this.state) return
    if (this.state.winner != null || this.state.active !== 1) return
    if (!this.state.players[1].isCPU) return
    this.cpuTimer = setTimeout(() => {
      if (this.mode !== 'cpu' || this.role !== 'host' || !this.state) return
      if (this.state.winner != null || this.state.active !== 1) return
      if (!this.state.players[1].isCPU) return
      const action = aiChooseAction(this.state, 1) || { type: 'endTurn' }
      const res = applyAction(this.state, 1, action)
      if (!res.ok) {
        const fb = applyAction(this.state, 1, { type: 'endTurn' })
        if (!fb.ok) return
        this.render()
        playEvents(this, fb.events)
        this.afterLocal(fb.events)
        return
      }
      this.sel = null
      this.render()
      playEvents(this, res.events)
      this.afterLocal(res.events)
    }, 920)
  }

  scheduleResult() {
    if (!this.state || this.state.winner == null) { this.resultReady = false; renderOverlay(this); return }
    if (this.resultReady) { renderOverlay(this); return }
    clearTimeout(this.resultTimer)
    this.resultTimer = setTimeout(() => {
      if (!this.state || this.state.winner == null) return
      this.resultReady = true
      renderOverlay(this)
      sfx(this, this.state.winner === this.mySide ? 'win' : 'lose')
    }, 850)
  }

  rematch() {
    if (this.mode === 'online' && this.role === 'guest') {
      if (!this.hostId) return
      this.net.send({ type: 'rematch', roomId: this.inRoomId, from: this.clientId, to: this.hostId })
      this.toast('再戦をホストにリクエストしました', 'info', 3200)
      return
    }
    if (this.mode === 'online' && this.role === 'host' && this.guestId) {
      this.startOnlineDuel(this.guestId, this.guestName)
      return
    }
    this.startCpuDuel()
  }

  surrender() {
    if (!this.state || this.state.winner != null) return
    let ok = false
    try { ok = window.confirm('本当に投了しますか？') } catch { ok = true }
    if (ok) this.doAction({ type: 'surrender' })
  }

  /* ────────────────────────── DUEL LIFECYCLE ────────────────────────── */

  clearTimers() {
    clearTimeout(this.cpuTimer)
    clearTimeout(this.joinTimer)
    clearTimeout(this.resultTimer)
    this.cpuTimer = null
    this.joinTimer = null
    this.resultTimer = null
  }

  startCpuDuel(initial = false) {
    this.clearTimers()
    if (!this.net.ownRoom()) this.net.ensureOwnRoom()
    this.ownRoomId = this.net.ownRoomId
    this.ownRoomId = this.net.ownRoom()?.id || this.ownRoomId
    this.inRoomId = this.ownRoomId
    this.hostId = this.clientId
    this.guestId = null
    this.guestName = null
    this.hostCode = this.net.ownRoom()?.code || null
    this.role = 'host'
    this.mode = 'cpu'
    this.mySide = 0
    this.connecting = false
    this.hostGone = false
    this.resultReady = false
    this.sel = null
    this.modal = null
    document.body.classList.remove('modal-open')

    this.state = createDuel([this.name, 'CPU・デュエリスト'], 0, { cpuOpponent: true, mode: 'cpu' })
    this.net.updateRoom(this.ownRoomId, {
      hostName: this.name, mode: 'cpu', joinable: true, guestId: null, guestName: null,
    })
    this.render()
    playEvents(this, [{ type: 'start' }])
    if (!initial) this.toast('新しいデュエルを開始しました', 'info')
  }

  startOnlineDuel(guestId, guestName) {
    if (!guestId) return
    this.clearTimers()
    const room = this.net.ownRoom()
    this.ownRoomId = room?.id || this.ownRoomId
    this.inRoomId = this.ownRoomId
    this.hostId = this.clientId
    this.guestId = guestId
    this.guestName = guestName || 'RIVAL'
    this.hostCode = room?.code || this.hostCode
    this.role = 'host'
    this.mode = 'online'
    this.mySide = 0
    this.connecting = false
    this.hostGone = false
    this.resultReady = false
    this.sel = null
    this.modal = null
    document.body.classList.remove('modal-open')
    this.lastGuestSeen = Date.now()

    const starter = Math.random() < 0.5 ? 0 : 1
    this.state = createDuel([this.name, this.guestName], starter, { cpuOpponent: false, mode: 'online' })
    this.net.updateRoom(this.ownRoomId, {
      hostName: this.name, mode: 'pvp', joinable: false,
      guestId: this.guestId, guestName: this.guestName,
    })
    this.render()
    this.sendState([{ type: 'start' }])
    playEvents(this, [{ type: 'start' }])
    this.toast(`${this.guestName} が乱入！ 対人デュエル開始`, 'pvp', 3800)
  }

  sendState(events = []) {
    if (!this.guestId) return
    this.net.send({
      type: 'state', roomId: this.ownRoomId, from: this.clientId, to: this.guestId,
      state: this.state, events,
    })
  }

  returnToOwnRoom() {
    if (this.role === 'guest' || this.role === 'guest-pending' || this.role === 'guest-left') {
      if (this.hostId) {
        this.net.send({ type: 'leave', roomId: this.inRoomId, from: this.clientId, name: this.name })
      }
    }
    if (!this.net.ownRoom()) this.net.ensureOwnRoom()
    this.ownRoomId = this.net.ownRoom()?.id || this.net.ownRoomId
    this.net.setAway(false)
    this.net.updateRoom(this.ownRoomId, {
      hostName: this.name, mode: 'cpu', joinable: true, guestId: null, guestName: null,
    })
    this.guestId = null
    this.guestName = null
    this.hostId = this.clientId
    this.hostCode = this.net.ownRoom()?.code || null
    this.hostGone = false
    this.connecting = false
    this.resultReady = false
    this.startCpuDuel()
    this.closeDrawer()
    this.toast('自分のルームに戻りました', 'info')
  }

  /* ────────────────────────── ROOMS ────────────────────────── */

  joinRoomById(roomId, auto = false) {
    if (!roomId) return false
    if (this.connecting) return false
    const rooms = this.net.list()
    const room = rooms.find((r) => r.id === roomId)
    if (!room) {
      this.toast('ルームが見つかりません', 'warn')
      return false
    }
    if (room.hostId === this.clientId) {
      if (!auto) this.toast('これは自分のルームです')
      return false
    }
    if (!this.net.fresh(room)) {
      this.toast('そのルームは応答がありません', 'warn')
      return false
    }
    if (!room.joinable || room.mode === 'pvp' || room.mode === 'away') {
      this.toast('そのルームは満室です', 'warn')
      return false
    }
    if (this.role === 'guest' && this.inRoomId === roomId) {
      this.toast('既にこのルームに入室しています')
      return false
    }
    if (this.name === room.hostName) {
      this.name = randomName()
      try { sessionStorage.setItem(NAME_KEY, this.name) } catch { /* ignore */ }
      this.net.name = this.name
      this.net.updateRoom(this.net.ownRoomId, { hostName: this.name })
    }

    if (this.role === 'guest' && this.hostId && this.inRoomId !== roomId) {
      this.net.send({ type: 'leave', roomId: this.inRoomId, from: this.clientId, name: this.name })
    }

    this.clearTimers()
    this.net.setAway(true)
    this.inRoomId = room.id
    this.hostId = room.hostId
    this.hostName = room.hostName
    this.hostCode = room.code
    this.role = 'guest-pending'
    this.mode = 'online'
    this.mySide = 1
    this.connecting = true
    this.hostGone = false
    this.resultReady = false
    this.sel = null
    this.state = null
    this.modal = null
    document.body.classList.remove('modal-open')
    this.render()
    this.closeDrawer()
    this.net.send({ type: 'join', roomId: room.id, from: this.clientId, name: this.name })

    this.joinTimer = setTimeout(() => {
      if (this.connecting && this.role === 'guest-pending') {
        this.connecting = false
        this.toast('接続できませんでした。自分の部屋に戻ります。', 'warn', 3600)
        this.returnToOwnRoom()
      }
    }, 6000)
    return true
  }

  openOpponentTab() {
    if (this.role === 'guest' || this.role === 'guest-pending') {
      this.toast('自分の部屋に戻ってから開いてください', 'warn')
      return
    }
    const room = this.net.ownRoom()
    if (!room) { this.toast('ルームがありません', 'warn'); return }
    const url = `${location.origin}${location.pathname}?join=${encodeURIComponent(room.id)}`
    let win = null
    try { win = window.open(url, '_blank') } catch { win = null }
    if (!win) {
      this.toast('ポップアップがブロックされました', 'warn', 3600)
    } else {
      this.toast('別タブで対戦相手を開きました。自動でこのルームに参加します。', 'info', 4200)
      this.closeDrawer()
    }
  }

  async copyText(text, el) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      this.toast(`ルームコード ${text} をコピーしました`, 'info')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
        this.toast(`ルームコード ${text}`, 'info')
      } catch {
        this.toast(`ルームコード ${text}`, 'info')
      }
    }
    sfx(this, 'click')
  }

  saveName() {
    const input = $('#nameInput')
    const name = (input?.value || '').trim().slice(0, 16) || randomName()
    this.name = name
    try { sessionStorage.setItem(NAME_KEY, name) } catch { /* ignore */ }
    this.net.name = name
    this.net.updateRoom(this.net.ownRoomId, { hostName: name })
    if (this.state && this.role === 'host') {
      this.state.players[0].name = name
      if (this.mode === 'online' && this.guestId) this.sendState([])
    }
    this.render()
    this.toast(`デュエリスト名を「${name}」に変更しました`, 'info')
  }

  toggleSound() {
    this.soundOn = !this.soundOn
    this.audioUnlocked = true
    try { sessionStorage.setItem(SOUND_KEY, this.soundOn ? 'on' : 'off') } catch { /* ignore */ }
    if (this.soundOn) { ensureAudio(this); sfx(this, 'click') }
    renderTopbar(this)
  }

  /* ────────────────────────── NETWORK ────────────────────────── */

  onMessage(msg) {
    if (!msg || !msg.type) return
    switch (msg.type) {
      case 'join':
        this.onJoin(msg)
        break
      case 'state':
        this.onStateMessage(msg)
        break
      case 'action':
        this.onGuestAction(msg)
        break
      case 'leave':
        if (msg.roomId === this.ownRoomId && msg.from === this.guestId) this.onGuestLeft()
        break
      case 'hostLeft':
        if (msg.to === this.clientId && msg.roomId === this.inRoomId) this.handleHostGone()
        break
      case 'rematch':
        if (msg.to === this.clientId && msg.roomId === this.ownRoomId && msg.from === this.guestId &&
            this.state?.winner != null) {
          this.startOnlineDuel(this.guestId, this.guestName)
        }
        break
      case 'error':
        if (msg.to === this.clientId && msg.error) {
          this.toast(msg.error, 'warn')
          this.connecting = false
          this.render()
        }
        break
      case 'denied':
        if (msg.to === this.clientId) {
          this.toast(msg.reason || '入室が拒否されました', 'warn')
          this.connecting = false
          this.returnToOwnRoom()
        }
        break
      case 'ping':
        if (msg.to === this.clientId && msg.from === this.guestId) this.lastGuestSeen = Date.now()
        break
      case 'rooms':
      case 'heartbeat':
        this.renderTopbar()
        if (this.drawerOpen) this.renderDrawerSafe()
        break
      default:
        break
    }
  }

  onJoin(msg) {
    if (msg.roomId !== this.ownRoomId) return
    if (this.role !== 'host') return
    if (!msg.from || msg.from === this.clientId) return
    if (this.guestId) {
      this.net.send({ type: 'denied', to: msg.from, roomId: msg.roomId, reason: '満室です' })
      return
    }
    const room = this.net.ownRoom()
    if (!room || !room.joinable || room.mode === 'away') {
      this.net.send({ type: 'denied', to: msg.from, roomId: msg.roomId, reason: '受付を終了しました' })
      return
    }
    this.guestId = msg.from
    this.guestName = String(msg.name || 'RIVAL').slice(0, 16)
    this.lastGuestSeen = Date.now()
    this.startOnlineDuel(this.guestId, this.guestName)
  }

  onStateMessage(msg) {
    if (msg.to !== this.clientId) return
    if (msg.roomId !== this.inRoomId) return
    if (this.role !== 'guest' && this.role !== 'guest-pending') return
    if (this.hostId && msg.from !== this.hostId) return
    if (!msg.state) return
    const wasConnecting = this.connecting
    clearTimeout(this.joinTimer)
    this.role = 'guest'
    this.mode = 'online'
    this.mySide = 1
    this.connecting = false
    this.hostGone = false
    this.hostId = msg.from
    this.hostName = msg.state.players?.[0]?.name || this.hostName
    this.state = msg.state
    this.sel = null
    if (this.state.winner == null) {
      this.resultReady = false
      clearTimeout(this.resultTimer)
    }
    this.render()
    playEvents(this, msg.events || [])
    if (this.state.winner != null) this.scheduleResult()
    if (wasConnecting) {
      this.toast('対人デュエルに接続しました', 'pvp', 3000)
      sfx(this, 'turn')
    }
  }

  onGuestAction(msg) {
    if (msg.to !== this.clientId || msg.roomId !== this.ownRoomId) return
    if (!this.guestId || msg.from !== this.guestId) return
    if (!this.state || this.role !== 'host') return
    this.lastGuestSeen = Date.now()
    const res = applyAction(this.state, 1, msg.action)
    if (!res.ok) {
      this.net.send({ type: 'error', to: msg.from, error: res.error || '実行できません' })
      return
    }
    this.sel = null
    this.render()
    playEvents(this, res.events)
    this.afterLocal(res.events)
  }

  onGuestLeft() {
    if (!this.guestId) return
    const name = this.guestName
    this.guestId = null
    this.guestName = null
    this.hostId = this.clientId
    this.mode = 'cpu'
    this.role = 'host'
    this.mySide = 0
    this.lastGuestSeen = 0
    this.net.updateRoom(this.ownRoomId, {
      mode: 'cpu', joinable: true, guestId: null, guestName: null, hostName: this.name,
    })
    if (this.state && this.state.winner == null) {
      const p = this.state.players[1]
      p.name = 'CPU・デュエリスト'
      p.isCPU = true
      this.state.mode = 'cpu'
      this.render()
      if (this.state.active === 1) this.scheduleCPU()
      else clearTimeout(this.cpuTimer)
      this.toast(`${name || '相手'}が退出。CPUがデュエルを引き継ぎます。`, 'warn', 3800)
    } else {
      this.resultReady = true
      this.render()
      renderOverlay(this)
      this.toast(`${name || '相手'}が退出しました`, 'warn', 3200)
    }
  }

  handleHostGone() {
    if (this.hostGone) return
    this.hostGone = true
    this.connecting = false
    this.role = 'guest-left'
    this.clearTimers()
    this.render()
    this.toast('ホストが退出しました', 'warn', 4000)
  }

  watchConnections() {
    if (this.role === 'host' && this.guestId && this.state?.winner == null) {
      if (this.lastGuestSeen && Date.now() - this.lastGuestSeen > 75000) {
        this.toast('相手の接続が切れました', 'warn', 3600)
        this.onGuestLeft()
      }
    }
    if (this.role === 'guest' && !this.hostGone) {
      const host = this.net.list().find((r) => r.id === this.inRoomId)
      if (!host || !this.net.fresh(host)) this.handleHostGone()
    }
  }

  cleanup() {
    if (this.cleaned) return
    this.cleaned = true
    try {
      if ((this.role === 'guest' || this.role === 'guest-pending') && this.hostId) {
        this.net.send({ type: 'leave', roomId: this.inRoomId, from: this.clientId, name: this.name })
      }
      if (this.role === 'host' && this.guestId) {
        this.net.send({ type: 'hostLeft', roomId: this.ownRoomId, to: this.guestId })
      }
      this.net.destroy()
    } catch { /* ignore */ }
  }
}

const app = new DuelApp()
app.init()
window.__duelApp = app
