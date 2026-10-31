// DUEL 24 — UI, animation choreography, room presence, and CPU opponent.

import { CARDS, ELEMENTS, TYPE_LABEL } from './cards.js'
import {
  START_LP, ZONES, MAX_ENERGY, atkOf, canPlayCard, canAttack, canDirectAttack,
  createGame, playCard, attack, endTurn, cpuNextAction, applyCpuAction, other,
} from './engine.js'
import { Lobby } from './lobby.js'
import { sfx, setSoundEnabled, soundEnabled } from './audio.js'

const $ = id => document.getElementById(id)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const els = {
  bg: $('bg'), arenaShell: $('arenaShell'), board: $('board'),
  foeHud: $('foeHud'), youHud: $('youHud'),
  foeName: $('foeName'), youName: $('youName'), foeBadge: $('foeBadge'),
  foeLp: $('foeLp'), youLp: $('youLp'), foeLpFill: $('foeLpFill'), youLpFill: $('youLpFill'),
  foeHand: $('foeHand'), foeDeck: $('foeDeck'), foeGrave: $('foeGrave'),
  youHand: $('youHand'), youDeck: $('youDeck'), youGrave: $('youGrave'),
  energyPips: $('energyPips'), energyText: $('energyText'),
  hand: $('hand'), deckPile: $('deckPile'), gravePile: $('gravePile'),
  deckCount: $('deckCount'), graveCount: $('graveCount'),
  log: $('log'), turnBadge: $('turnBadge'), phaseLabel: $('phaseLabel'),
  hintLine: $('hintLine'), endTurnBtn: $('endTurnBtn'),
  roomPill: $('roomPill'), roomPillText: $('roomPillText'),
  roomList: $('roomList'), onlineCount: $('onlineCount'),
  selfName: $('selfName'), selfRoomName: $('selfRoomName'), selfStatus: $('selfStatus'),
  selfPlayers: $('selfPlayers'), winsCount: $('winsCount'),
  newRoomBtn: $('newRoomBtn'), leaveRoomBtn: $('leaveRoomBtn'),
  soundBtn: $('soundBtn'), helpBtn: $('helpBtn'), helpModal: $('helpModal'),
  roomsBtn: $('roomsBtn'), logBtn: $('logBtn'), roomsPanel: $('roomsPanel'),
  logPanel: $('logPanel'), drawerScrim: $('drawerScrim'),
  resultModal: $('resultModal'), resultCard: $('resultCard'), resultTitle: $('resultTitle'),
  resultKicker: $('resultKicker'), resultLp: $('resultLp'), resultTurns: $('resultTurns'),
  resultDamage: $('resultDamage'), resultCards: $('resultCards'),
  rematchBtn: $('rematchBtn'), closeResultBtn: $('closeResultBtn'),
  banner: $('banner'), toastStack: $('toastStack'), fxLayer: $('fxLayer'), tooltip: $('cardTooltip'),
}

let game = null
let lobby = null
let busy = false
let cpuRunning = false
let selected = null // {type:'hand', uid} | {type:'unit', zone}
let mySide = 'p'
let foeSide = 'c'
let handSignature = ''
let zoneEls = new Map()
let lastRoomSignature = ''
let resultShown = false
let soundOn = true

// ------------------------------------------------------------------ utils

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function toast(message, kind = 'info', ttl = 4200) {
  const node = document.createElement('div')
  node.className = `toast ${kind}`
  node.textContent = message
  els.toastStack.appendChild(node)
  setTimeout(() => {
    node.classList.add('out')
    setTimeout(() => node.remove(), 320)
  }, ttl)
}

function addLog(html, cls = '') {
  const node = document.createElement('div')
  node.className = `log-line ${cls}`.trim()
  node.innerHTML = html
  els.log.appendChild(node)
  while (els.log.children.length > 80) els.log.firstElementChild.remove()
  els.log.scrollTop = els.log.scrollHeight
}

function who(side) {
  return side === mySide
    ? `<span class="who-p">${escapeHtml(game[mySide].name)}</span>`
    : `<span class="who-c">${escapeHtml(game[foeSide].name)}</span>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

// ------------------------------------------------------------------ board build

const ROW_DEFS = [
  { slot: 'foeBack', cls: 'foe-back' },
  { slot: 'foeFront', cls: 'foe-front' },
  { slot: 'youFront', cls: 'you-front' },
  { slot: 'youBack', cls: 'you-back' },
]

function buildBoard() {
  els.board.innerHTML = ''
  zoneEls = new Map()
  ROW_DEFS.forEach((rowDef, rowIndex) => {
    const row = document.createElement('div')
    row.className = `zone-row ${rowDef.cls}`
    for (let i = 0; i < ZONES; i += 1) {
      const zone = document.createElement('div')
      zone.className = `zone ${rowDef.cls}`
      zone.dataset.slot = rowDef.slot
      zone.dataset.index = String(i)
      zone.setAttribute('role', 'button')
      zone.setAttribute('tabindex', '0')
      zone.setAttribute('aria-label', `${rowDef.slot} ゾーン ${i + 1}`)
      zone.innerHTML = '<span class="zone-plus">+</span><span class="zone-card-slot"></span>'
      row.appendChild(zone)
      zoneEls.set(`${rowDef.slot}-${i}`, zone)
    }
    els.board.appendChild(row)
    if (rowIndex === 1) {
      const center = document.createElement('div')
      center.className = 'board-center'
      center.innerHTML = `
        <span class="center-line"></span>
        <span class="vs-mark">24<span>ZONE</span></span>
        <span class="phase-chip" id="phaseChip">YOUR TURN</span>
        <span class="center-line"></span>`
      els.board.appendChild(center)
    }
  })
}

function buildEnergy() {
  els.energyPips.innerHTML = ''
  for (let i = 0; i < MAX_ENERGY; i += 1) {
    const pip = document.createElement('i')
    els.energyPips.appendChild(pip)
  }
}

function slotSideRow(slot) {
  const side = slot.startsWith('foe') ? foeSide : mySide
  const row = slot.endsWith('Back') ? 'back' : 'front'
  return { side, row }
}

// ------------------------------------------------------------------ cards

function makeCardEl(card, { faceDown = false, hand = false } = {}) {
  const el = document.createElement('div')
  const palette = ELEMENTS[card.element] || ELEMENTS.water
  const hash = hashString(card.uid + card.defId)
  el.className = `card el-${card.element} rarity-${card.rarity} type-${card.type}${hand ? ' in-hand' : ''}`
  el.dataset.uid = card.uid
  el.style.setProperty('--el-a', palette.a)
  el.style.setProperty('--el-b', palette.b)
  el.style.setProperty('--float-dur', `${(3.6 + (hash % 22) / 10).toFixed(1)}s`)
  el.style.setProperty('--float-delay', `-${((hash % 90) / 10).toFixed(1)}s`)

  if (faceDown) {
    el.classList.add('face-down')
    el.innerHTML = '<div class="card-back"><span class="back-hex"></span></div>'
    return el
  }

  const typeLabel = TYPE_LABEL[card.type] || 'CARD'
  const isUnit = card.type === 'unit'
  const artNo = String((hash % 24) + 1).padStart(2, '0')
  const stats = isUnit
    ? `<span class="atk">ATK <b>${atkOf(card)}</b></span><span class="sep">/</span><span class="def">DEF <b>${card.def}</b></span>`
    : `<span class="stat-type">${card.type === 'spell' ? 'MAGIC' : 'SET'}</span>`

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-holo"></div>
      <div class="card-art">
        <span class="card-glyph">${card.glyph}</span>
        <span class="art-index">NO.${artNo}</span>
      </div>
      <div class="card-name">${escapeHtml(card.name)}<small>${escapeHtml(card.en)}</small></div>
      <div class="card-stats">${stats}</div>
      <div class="card-desc">${escapeHtml(card.text)}</div>
      <div class="card-head">
        <span class="card-cost">${card.cost}</span>
        <span class="card-type">${typeLabel}</span>
      </div>
    </div>`
  return el
}

function findCard(uid) {
  if (!game) return null
  for (const side of ['p', 'c']) {
    for (const area of ['hand', 'front', 'back', 'grave', 'deck']) {
      const found = game[side][area].find?.(card => card && card.uid === uid)
      if (found) return found
    }
  }
  return null
}

// ------------------------------------------------------------------ render

function renderAll() {
  if (!game) return
  renderHud()
  renderBoard()
  renderHand()
  renderPiles()
  renderControls()
  renderRoomsFromLobby()
}

function renderHud() {
  const you = game[mySide]
  const foe = game[foeSide]
  els.youName.textContent = you.name
  els.foeName.textContent = foe.name
  els.foeBadge.textContent = foe.name.startsWith('CPU') ? 'CPU' : 'ONLINE'

  setLpVisual(els.youLp, els.youLpFill, you.lp, false)
  setLpVisual(els.foeLp, els.foeLpFill, foe.lp, true)

  els.youHand.textContent = you.hand.length
  els.foeHand.textContent = foe.hand.length
  els.youDeck.textContent = you.deck.length
  els.foeDeck.textContent = foe.deck.length
  els.youGrave.textContent = you.grave.length
  els.foeGrave.textContent = foe.grave.length

  const pips = [...els.energyPips.children]
  pips.forEach((pip, i) => {
    pip.classList.toggle('on', i < you.energy)
    pip.classList.toggle('over', i >= you.energy && i < you.maxEnergy)
  })
  els.energyText.textContent = `${you.energy} / ${you.maxEnergy}`

  els.youHud.classList.toggle('active', game.turnSide === mySide && !game.over)
  els.foeHud.classList.toggle('active', game.turnSide !== mySide && !game.over)
}

function setLpVisual(numberEl, fillEl, lp, isFoe) {
  const pct = clamp((lp / START_LP) * 100, 0, 100)
  fillEl.style.width = `${pct}%`
  fillEl.classList.toggle('low', lp > 0 && lp <= 1000)
  numberEl.textContent = String(lp)
  numberEl.style.color = ''
  if (isFoe) numberEl.classList.toggle('hit', false)
}

function renderBoard() {
  for (const rowDef of ROW_DEFS) {
    const { side, row } = slotSideRow(rowDef.slot)
    for (let i = 0; i < ZONES; i += 1) {
      const zone = zoneEls.get(`${rowDef.slot}-${i}`)
      if (!zone) continue
      const card = game[side][row][i]
      const faceDown = Boolean(card && card.type === 'trap' && card.faceDown)
      const key = card ? `${faceDown ? 'fd' : 'up'}:${card.uid}:${card.atkBonus || 0}` : ''
      const holder = zone.querySelector('.zone-card-slot')
      if (zone.dataset.key !== key) {
        zone.dataset.key = key
        holder.innerHTML = ''
        if (card) {
          const cardEl = makeCardEl(card, { faceDown })
          holder.appendChild(cardEl)
        }
      }
      const cardEl = holder.querySelector('.card')
      if (cardEl && card) {
        cardEl.classList.toggle('exhausted', card.type === 'unit' && card.attacked)
        cardEl.classList.toggle('attacker-selected', selected?.type === 'unit' && selected.zone === i && side === mySide && row === 'front')
      }
    }
  }

  // Selection highlighting.
  const handCard = selected?.type === 'hand' ? game[mySide].hand.find(c => c.uid === selected.uid) : null
  for (const rowDef of ROW_DEFS) {
    const { side, row } = slotSideRow(rowDef.slot)
    for (let i = 0; i < ZONES; i += 1) {
      const zone = zoneEls.get(`${rowDef.slot}-${i}`)
      if (!zone) continue
      let valid = false
      let targetable = false
      if (handCard) valid = canPlayCard(game, mySide, handCard, i) && side === mySide && ((handCard.type === 'unit' && row === 'front') || (handCard.type !== 'unit' && row === 'back'))
      if (selected?.type === 'unit' && side === foeSide && row === 'front' && game[foeSide].front[i]) targetable = true
      zone.classList.toggle('valid', Boolean(valid))
      zone.classList.toggle('targetable', Boolean(targetable))
      zone.classList.toggle('selected-source', Boolean(selected?.type === 'unit' && side === mySide && row === 'front' && selected.zone === i))
      const unit = side === mySide && row === 'front' ? game[mySide].front[i] : null
      zone.classList.toggle('can-attack', Boolean(unit && canAttack(game, mySide, i) && !handCard))
    }
  }

  const direct = selected?.type === 'unit' && canDirectAttack(game, mySide) && !busy && !game.over && game.turnSide === mySide
  els.foeHud.classList.toggle('attackable', Boolean(direct))
}

function renderHand() {
  const hand = game[mySide].hand
  const signature = hand.map(c => c.uid).join(',')
  if (signature !== handSignature) {
    handSignature = signature
    els.hand.innerHTML = ''
    const count = hand.length
    hand.forEach((card, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'hand-card'
      btn.dataset.uid = card.uid
      btn.style.setProperty('--i', String(i))
      btn.style.setProperty('--rot', `${((i - (count - 1) / 2) * 3.1).toFixed(2)}deg`)
      btn.style.setProperty('--dy', `${(Math.abs(i - (count - 1) / 2) * 1.8).toFixed(1)}px`)
      btn.setAttribute('aria-label', `${card.name} コスト${card.cost}${card.type === 'unit' ? ` 攻撃${atkOf(card)} 守備${card.def}` : ''}`)
      btn.appendChild(makeCardEl(card, { hand: true }))
      els.hand.appendChild(btn)
    })
  }

  [...els.hand.children].forEach(btn => {
    const card = hand.find(c => c.uid === btn.dataset.uid)
    if (!card) return
    btn.classList.toggle('selected', selected?.type === 'hand' && selected.uid === card.uid)
    btn.classList.toggle('unaffordable', card.cost > game[mySide].energy)
  })
}

function renderPiles() {
  els.deckCount.textContent = game[mySide].deck.length
  els.graveCount.textContent = game[mySide].grave.length
}

function renderControls() {
  const myTurn = game.turnSide === mySide && !game.over
  const locked = busy || cpuRunning
  els.turnBadge.textContent = `TURN ${Math.ceil(game.turn / 2)}`
  els.phaseLabel.textContent = game.over ? 'DUEL OVER' : myTurn ? 'YOUR MAIN PHASE' : 'ENEMY TURN'
  els.phaseLabel.parentElement.classList.toggle('foe', !myTurn && !game.over)

  const chip = $('phaseChip')
  if (chip) {
    chip.textContent = game.over ? 'DUEL OVER' : myTurn ? 'YOUR TURN' : 'ENEMY TURN'
    chip.classList.toggle('foe', !myTurn && !game.over)
    chip.classList.toggle('busy', locked)
  }

  const label = els.endTurnBtn.querySelector('span')
  if (game.over) {
    label.textContent = '再戦する'
    els.endTurnBtn.disabled = locked
    els.endTurnBtn.classList.remove('foe-turn')
  } else {
    label.textContent = myTurn ? 'ターン終了' : '相手のターン'
    els.endTurnBtn.disabled = locked || !myTurn
    els.endTurnBtn.classList.toggle('foe-turn', !myTurn)
  }

  if (game.over) {
    els.hintLine.textContent = 'ライフがゼロになりました。「再戦する」でもう一度。'
    return
  }
  if (locked) {
    els.hintLine.textContent = cpuRunning ? '相手がカードを動かしています…' : 'カードが動いています…'
    return
  }
  if (!myTurn) {
    els.hintLine.textContent = '相手のターン。カードの動きを追ってください。'
    return
  }
  if (selected?.type === 'hand') {
    const card = game[mySide].hand.find(c => c.uid === selected.uid)
    els.hintLine.textContent = card?.type === 'unit'
      ? '前衛の光るゾーンをタップして召喚。'
      : card?.type === 'trap'
        ? '後衛の光るゾーンに伏せて罠をセット。'
        : '後衛の光るゾーンをタップして発動。'
    return
  }
  if (selected?.type === 'unit') {
    els.hintLine.textContent = canDirectAttack(game, mySide)
      ? '相手プレイヤーをタップして直接攻撃！'
      : '赤く光る相手ユニットをタップして攻撃。'
    return
  }
  els.hintLine.textContent = '手札を選ぶか、攻撃するユニットをタップ。'
}

// ------------------------------------------------------------------ rooms UI

function renderRoomsFromLobby() {
  if (!lobby) return
  const rooms = lobby.rooms
  const currentId = lobby.currentId
  const signature = `${lobby.name}|${lobby.winsCount}|${currentId}|${rooms.map(r => `${r.id}:${r.name}:${r.players.length}:${r.status}`).join(';')}`
  if (signature === lastRoomSignature) return
  lastRoomSignature = signature

  els.onlineCount.textContent = String(rooms.reduce((sum, room) => sum + room.players.length, 0))
  els.selfName.textContent = lobby.name
  els.winsCount.textContent = String(lobby.winsCount)

  const current = rooms.find(room => room.id === currentId)
  els.selfRoomName.textContent = current ? current.name : 'ルームを開設中…'
  els.selfStatus.textContent = current
    ? (current.players.length > 1 ? '対戦相手が接続中' : '参加中・相手を待機')
    : '再接続中…'
  els.selfPlayers.textContent = `${current?.players.length || 0}/${current?.max || 2}`
  els.roomPillText.textContent = current ? current.name : '接続中…'
  els.roomPillText.title = current?.name || ''

  els.roomList.innerHTML = ''
  if (!rooms.length) {
    const empty = document.createElement('li')
    empty.className = 'room-empty'
    empty.textContent = 'オンラインルームを探索中…'
    els.roomList.appendChild(empty)
    return
  }

  for (const room of rooms) {
    const isCurrent = room.id === currentId
    const li = document.createElement('li')
    li.className = `room-item${isCurrent ? ' current' : ''}`
    const pvp = room.players.length > 1 || room.status === 'PVP READY'
    const ping = Math.max(1, Math.min(4, lobby.pingFor(room)))
    li.innerHTML = `
      <div class="room-item-top">
        <span class="room-name">${escapeHtml(room.name)}</span>
        ${isCurrent ? '<span class="room-flag">参加中</span>' : ''}
      </div>
      <div class="room-item-meta">
        <span class="host">HOST ${escapeHtml(room.hostName || '—')}</span>
        <span>${room.players.length}/${room.max || 2} PLAYERS</span>
      </div>
      <div class="room-item-bottom">
        <span class="room-status${pvp ? ' pvp' : ''}">${pvp ? 'PVP READY' : escapeHtml(room.status || 'CPU DUEL')}</span>
        <span class="ping" aria-label="接続状態">${[1, 2, 3, 4].map(n => `<i class="${n > ping ? 'off' : ''}"></i>`).join('')}</span>
        <button type="button" class="room-join" data-join="${room.id}" ${isCurrent ? 'disabled' : ''}>${isCurrent ? '参加中' : '参加'}</button>
      </div>`
    els.roomList.appendChild(li)
  }
}

function openDrawer(which) {
  document.body.classList.toggle('rooms-open', which === 'rooms')
  document.body.classList.toggle('log-open', which === 'log')
  const open = which === 'rooms' ? document.body.classList.contains('rooms-open') : document.body.classList.contains('log-open')
  els.drawerScrim.hidden = !open
}

function closeDrawers() {
  document.body.classList.remove('rooms-open', 'log-open')
  els.drawerScrim.hidden = true
}

// ------------------------------------------------------------------ game lifecycle

function startDuel() {
  game = createGame(lobby?.name || 'DUELIST', 'CPU DUELIST')
  mySide = 'p'
  foeSide = 'c'
  busy = false
  cpuRunning = false
  selected = null
  resultShown = false
  handSignature = ''
  document.body.classList.remove('rooms-open', 'log-open')
  els.drawerScrim.hidden = true
  els.resultModal.hidden = true
  els.helpModal.hidden = true
  els.log.innerHTML = ''
  els.tooltip.hidden = true
  els.hand.innerHTML = ''

  for (const side of ['p', 'c']) {
    for (const row of ['front', 'back']) {
      for (let i = 0; i < ZONES; i += 1) {
        const el = zoneEls.get(`${side === mySide ? 'you' : 'foe'}${row === 'front' ? 'Front' : 'Back'}-${i}`)
        if (el) { el.dataset.key = ''; el.querySelector('.zone-card-slot').innerHTML = '' }
      }
    }
  }

  renderAll()
  addLog(`<b>24ゾーン・デュエル開始。</b> 先攻は ${who(mySide)}。`, 'sys')
  addLog('ライフ4000。相手のライフをゼロにすれば勝利。', 'sys')
  addLog('カードを選び、光るゾーンへ。24ゾーンがあなたを待つ。', 'sys')
  lobby?.setStatus('CPU DUEL')
  if (lobby) toast(`「${lobby.currentRoom?.name || '自分のルーム'}」に自動参加しました`, 'join')
}

// ------------------------------------------------------------------ actions

function clearSelection() {
  selected = null
}

async function execute(action) {
  if (!game || busy || game.over) return false
  busy = true
  clearSelection()
  const layout = captureLayout()
  const result = action()
  if (!result || result.ok === false) {
    busy = false
    renderAll()
    if (result?.reason === 'energy') { toast('エネルギーが足りません', 'error'); sfx('error') }
    return false
  }
  renderAll()
  await playEvents(result.events || [], layout)
  renderAll()
  busy = false
  renderControls()
  if (game.over) scheduleResult()
  return true
}

function scheduleResult() {
  const finished = game
  setTimeout(() => {
    if (game !== finished || !game?.over || resultShown) return
    showResult()
  }, 850)
}

function showResult() {
  if (!game || !game.over || resultShown) return
  resultShown = true
  const win = game.winner === mySide
  const playerDamage = game[mySide].damageDealt
  els.resultCard.classList.toggle('lose', !win)
  els.resultKicker.textContent = win ? 'DUEL COMPLETE — LP ZERO' : 'DUEL COMPLETE — DEFEAT'
  els.resultTitle.textContent = win ? 'VICTORY' : 'DEFEAT'
  els.resultLp.textContent = String(game[foeSide].lp)
  els.resultTurns.textContent = String(Math.ceil(game.turn / 2))
  els.resultDamage.textContent = String(playerDamage)
  els.resultCards.textContent = String(game[mySide].played)
  els.resultModal.hidden = false
  if (win) {
    sfx('win')
    lobby?.recordWin()
  } else {
    sfx('lose')
  }
}

async function runCpu() {
  if (cpuRunning || !game) return
  cpuRunning = true
  renderAll()
  await sleep(480)
  let guard = 0
  while (game && !game.over && game.turnSide === foeSide && guard < 40) {
    guard += 1
    const action = cpuNextAction(game)
    if (!action || action.type === 'end') {
      const ok = await execute(() => endTurn(game))
      if (!ok) break
      break
    }
    const ok = await execute(() => applyCpuAction(game, action))
    if (!ok) break
    await sleep(320)
  }
  cpuRunning = false
  renderAll()
}

// ------------------------------------------------------------------ input

function bindEvents() {
  els.hand.addEventListener('click', async event => {
    const button = event.target.closest('.hand-card')
    if (!button || !game || busy || cpuRunning) return
    if (game.over || game.turnSide !== mySide) {
      if (game.turnSide !== mySide && !game.over) toast('相手のターンです', 'info')
      return
    }
    const card = game[mySide].hand.find(c => c.uid === button.dataset.uid)
    if (!card) return
    if (selected?.type === 'hand' && selected.uid === card.uid) {
      clearSelection()
      renderAll()
      sfx('click')
      return
    }
    if (card.cost > game[mySide].energy) {
      toast(`エネルギーが足りません（必要 ${card.cost}）`, 'error')
      sfx('error')
      return
    }
    const hasZone = card.type === 'unit'
      ? game[mySide].front.some(c => !c)
      : game[mySide].back.some(c => !c)
    if (!hasZone) {
      toast(card.type === 'unit' ? '前衛ゾーンが埋まっています' : '後衛ゾーンが埋まっています', 'error')
      sfx('error')
      return
    }
    selected = { type: 'hand', uid: card.uid }
    sfx('click')
    renderAll()
  })

  els.board.addEventListener('click', async event => {
    const zone = event.target.closest('.zone')
    if (!zone || !game || busy || cpuRunning || game.over) return
    const slot = zone.dataset.slot
    const index = Number(zone.dataset.index)
    const { side, row } = slotSideRow(slot)

    if (game.turnSide !== mySide) {
      toast('相手のターンです', 'info')
      return
    }

    if (selected?.type === 'hand') {
      const card = game[mySide].hand.find(c => c.uid === selected.uid)
      if (!card) { clearSelection(); renderAll(); return }
      if (zone.classList.contains('valid')) {
        const played = card
        const cast = await execute(() => playCard(game, mySide, card.uid, index))
        if (cast) {
          if (slot.endsWith('Back') && played.type === 'spell') {
            // Spell resolved and went to the graveyard.
          }
        }
      } else {
        toast('そのゾーンには置けません', 'error')
        sfx('error')
      }
      return
    }

    if (selected?.type === 'unit') {
      if (side === foeSide && row === 'front' && game[foeSide].front[index]) {
        await execute(() => attack(game, mySide, selected.zone, { kind: 'unit', side: foeSide, zone: index }))
      } else if (side === mySide && row === 'front' && game[mySide].front[index] && canAttack(game, mySide, index)) {
        selected = { type: 'unit', zone: index }
        sfx('click')
        renderAll()
      } else {
        clearSelection()
        renderAll()
      }
      return
    }

    if (side === mySide && row === 'front') {
      const unit = game[mySide].front[index]
      if (unit && canAttack(game, mySide, index)) {
        selected = { type: 'unit', zone: index }
        sfx('click')
        renderAll()
      } else if (unit?.attacked) {
        toast('このユニットはこのターン攻撃済みです', 'info')
      }
    } else if (side === foeSide && row === 'front' && game[foeSide].front[index]) {
      toast('先に自分の攻撃ユニットを選択してください', 'info')
    }
  })

  els.board.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const zone = event.target.closest('.zone')
    if (!zone) return
    event.preventDefault()
    zone.click()
  })

  els.foeHud.addEventListener('click', async () => {
    if (!game || busy || cpuRunning || game.over) return
    if (selected?.type !== 'unit') {
      if (game.turnSide === mySide) toast('先に自分の攻撃ユニットを選択してください', 'info')
      return
    }
    if (!canDirectAttack(game, mySide)) {
      toast('相手のユニットをすべて排除すると直接攻撃できます', 'info')
      return
    }
    await execute(() => attack(game, mySide, selected.zone, { kind: 'player', side: foeSide }))
  })

  els.endTurnBtn.addEventListener('click', async () => {
    if (!game || busy) return
    if (game.over) {
      startDuel()
      return
    }
    if (cpuRunning || game.turnSide !== mySide) return
    const ok = await execute(() => endTurn(game))
    if (ok && game.turnSide === foeSide && !game.over) {
      await runCpu()
    }
  })

  els.deckPile.addEventListener('click', () => {
    if (!game) return
    toast(`山札 ${game[mySide].deck.length}枚 / 墓地 ${game[mySide].grave.length}枚`, 'info', 2600)
  })

  els.gravePile.addEventListener('click', () => {
    if (!game) return
    const grave = game[mySide].grave
    if (!grave.length) { toast('墓地はまだ空です', 'info', 2400); return }
    const names = grave.slice(-4).map(c => c.name).join(' / ')
    toast(`墓地 ${grave.length}枚 — ${names}`, 'info', 4200)
  })

  els.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn
    setSoundEnabled(soundOn)
    try { localStorage.setItem('duel24.sound', soundOn ? 'on' : 'off') } catch { /* ignore */ }
    els.soundBtn.classList.toggle('muted', !soundOn)
    toast(soundOn ? 'サウンド ON' : 'サウンド OFF', 'info', 1800)
    if (soundOn) sfx('click')
  })

  els.helpBtn.addEventListener('click', () => { els.helpModal.hidden = false; sfx('click') })
  els.helpModal.addEventListener('click', event => {
    if (event.target === els.helpModal || event.target.closest('[data-close]')) els.helpModal.hidden = true
  })

  els.rematchBtn.addEventListener('click', () => startDuel())
  els.closeResultBtn.addEventListener('click', () => {
    els.resultModal.hidden = true
    renderControls()
  })
  els.resultModal.addEventListener('click', event => {
    if (event.target === els.resultModal) {
      els.resultModal.hidden = true
      renderControls()
    }
  })

  els.roomsBtn.addEventListener('click', () => {
    const open = document.body.classList.contains('rooms-open')
    openDrawer(open ? '' : 'rooms')
  })
  els.logBtn.addEventListener('click', () => {
    const open = document.body.classList.contains('log-open')
    openDrawer(open ? '' : 'log')
  })
  els.drawerScrim.addEventListener('click', closeDrawers)

  els.roomList.addEventListener('click', event => {
    const button = event.target.closest('[data-join]')
    if (!button || button.disabled) return
    const joined = lobby.joinRoom(button.dataset.join)
    if (joined) {
      closeDrawers()
      toast('ルームに参加しました', 'join')
      sfx('join')
    }
  })

  els.newRoomBtn.addEventListener('click', () => {
    if (!lobby) return
    lobby.createRoom()
    closeDrawers()
    sfx('join')
  })

  els.leaveRoomBtn.addEventListener('click', () => {
    if (!lobby) return
    lobby.leaveRoom()
    closeDrawers()
    sfx('click')
  })

  els.roomsPanel.addEventListener('click', event => {
    if (event.target.closest('button, [data-join]')) return
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!els.helpModal.hidden) { els.helpModal.hidden = true; return }
      if (!els.resultModal.hidden) { els.resultModal.hidden = true; renderControls(); return }
      closeDrawers()
      if (selected) { clearSelection(); renderAll() }
    }
    if (event.key === 'Enter' && !els.resultModal.hidden) {
      startDuel()
    }
  })

  els.board.addEventListener('pointermove', event => {
    const cardEl = event.target.closest('.card[data-uid]')
    if (!cardEl) { els.tooltip.hidden = true; return }
    showTooltip(cardEl, event.clientX, event.clientY)
  })
  els.board.addEventListener('pointerleave', () => { els.tooltip.hidden = true })
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.card[data-uid]')) els.tooltip.hidden = true
  })

}

// ------------------------------------------------------------------ tooltip

function showTooltip(cardEl, x, y) {
  const card = findCard(cardEl.dataset.uid)
  if (!card) { els.tooltip.hidden = true; return }
  const faceDown = card.type === 'trap' && card.faceDown
  if (faceDown) {
    els.tooltip.innerHTML = `
      <div class="tt-kicker">FACE DOWN</div>
      <div class="tt-name">伏せられた罠<small>SET TRAP</small></div>
      <div class="tt-text">相手の攻撃時に自動発動します。正体は発動までわかりません。</div>`
  } else {
    const stats = card.type === 'unit'
      ? `<span class="atk">ATK ${atkOf(card)}</span><span class="def">DEF ${card.def}</span><span>COST ${card.cost}</span>`
      : `<span>COST ${card.cost}</span><span>${TYPE_LABEL[card.type]}</span>`
    els.tooltip.innerHTML = `
      <div class="tt-kicker">${ELEMENTS[card.element]?.label || ''} / ${TYPE_LABEL[card.type]} / ${card.rarity}</div>
      <div class="tt-name">${escapeHtml(card.name)}<small>${escapeHtml(card.en)}</small></div>
      <div class="tt-stats">${stats}</div>
      <div class="tt-text">${escapeHtml(card.text)}</div>`
  }
  els.tooltip.hidden = false
  const rect = els.tooltip.getBoundingClientRect()
  const left = clamp(x + 16, 8, window.innerWidth - rect.width - 8)
  const top = clamp(y - rect.height - 14, 8, window.innerHeight - rect.height - 8)
  els.tooltip.style.left = `${left}px`
  els.tooltip.style.top = `${top}px`
}

// ------------------------------------------------------------------ choreography

function rectOf(el) {
  return el ? el.getBoundingClientRect() : null
}

function captureLayout() {
  const cards = new Map()
  document.querySelectorAll('.card[data-uid]').forEach(el => {
    cards.set(el.dataset.uid, el.getBoundingClientRect())
  })
  return {
    cards,
    deck: rectOf(els.deckPile),
    grave: rectOf(els.gravePile),
    foeHud: rectOf(els.foeHud),
    youHud: rectOf(els.youHud),
  }
}

const centerOf = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })

function addFx(node, ttl = 1600) {
  els.fxLayer.appendChild(node)
  setTimeout(() => node.remove(), ttl)
  return node
}

function spawnRing(x, y, cls = '') {
  const node = document.createElement('div')
  node.className = `fx fx-ring ${cls}`.trim()
  node.style.left = `${x}px`
  node.style.top = `${y}px`
  addFx(node, 900)
}

function spawnSlash(x, y, angle, cls = '') {
  const node = document.createElement('div')
  node.className = `fx fx-slash ${cls}`.trim()
  node.style.left = `${x}px`
  node.style.top = `${y}px`
  node.style.width = '220px'
  node.style.setProperty('--angle', `${angle}deg`)
  addFx(node, 700)
}

function spawnBeam(x, y, length, angle, cls = '') {
  const node = document.createElement('div')
  node.className = `fx fx-beam ${cls}`.trim()
  node.style.left = `${x}px`
  node.style.top = `${y}px`
  node.style.width = `${length}px`
  node.style.setProperty('--angle', `${angle}deg`)
  addFx(node, 900)
}

function spawnDamage(x, y, text, cls = '') {
  const node = document.createElement('div')
  node.className = `fx fx-dmg ${cls}`.trim()
  node.style.left = `${x}px`
  node.style.top = `${y}px`
  node.textContent = text
  addFx(node, 1200)
}

function spawnSparks(x, y, cls = '', count = 10) {
  for (let i = 0; i < count; i += 1) {
    const node = document.createElement('div')
    node.className = `fx fx-spark ${cls}`.trim()
    node.style.left = `${x}px`
    node.style.top = `${y}px`
    const angle = Math.random() * Math.PI * 2
    const distance = 18 + Math.random() * 60
    node.style.setProperty('--dx', `${Math.cos(angle) * distance}px`)
    node.style.setProperty('--dy', `${Math.sin(angle) * distance}px`)
    node.style.animationDelay = `${Math.random() * 0.08}s`
    addFx(node, 900)
  }
}

function flash(kind = 'damage') {
  const node = document.createElement('div')
  node.className = kind === 'heal' ? 'heal-flash' : 'damage-flash'
  addFx(node, 800)
}

function shakeArena() {
  els.arenaShell.classList.remove('shake')
  void els.arenaShell.offsetWidth
  els.arenaShell.classList.add('shake')
  setTimeout(() => els.arenaShell.classList.remove('shake'), 480)
}

function makeGhost(card, rect, cls = '') {
  if (!rect) return null
  const ghost = document.createElement('div')
  ghost.className = `fx-ghost ${cls}`.trim()
  ghost.style.left = `${rect.left}px`
  ghost.style.top = `${rect.top}px`
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  ghost.appendChild(makeCardEl(card))
  els.fxLayer.appendChild(ghost)
  return ghost
}

function animateNumber(el, from, to, duration = 600) {
  const start = performance.now()
  const step = now => {
    const t = clamp((now - start) / duration, 0, 1)
    const eased = 1 - (1 - t) ** 3
    el.textContent = String(Math.round(from + (to - from) * eased))
    if (t < 1) requestAnimationFrame(step)
    else el.textContent = String(to)
  }
  requestAnimationFrame(step)
}

function animateLp(ev) {
  const isYou = ev.side === mySide
  const fill = isYou ? els.youLpFill : els.foeLpFill
  const num = isYou ? els.youLp : els.foeLp
  const hud = isYou ? els.youHud : els.foeHud
  const beforePct = clamp((ev.before / START_LP) * 100, 0, 100)
  const afterPct = clamp((ev.after / START_LP) * 100, 0, 100)
  fill.style.width = `${afterPct}%`
  const anim = fill.animate(
    [{ width: `${beforePct}%` }, { width: `${afterPct}%` }],
    { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
  animateNumber(num, ev.before, ev.after, 620)
  num.classList.remove('hit')
  void num.offsetWidth
  num.classList.add('hit')
  const rect = hud.getBoundingClientRect()
  spawnDamage(rect.left + rect.width * 0.55, rect.top + rect.height * 0.48, `-${ev.amount}`, isYou ? '' : '')
  spawnRing(rect.left + 30, rect.top + rect.height / 2, isYou ? '' : 'foe')
  flash('damage')
  shakeArena()
  sfx('hit')
  setTimeout(() => anim.cancel(), 700)
}

function animateHeal(ev) {
  const isYou = ev.side === mySide
  const fill = isYou ? els.youLpFill : els.foeLpFill
  const num = isYou ? els.youLp : els.foeLp
  const hud = isYou ? els.youHud : els.foeHud
  const beforePct = clamp((ev.before / START_LP) * 100, 0, 100)
  const afterPct = clamp((ev.after / START_LP) * 100, 0, 100)
  fill.style.width = `${afterPct}%`
  const anim = fill.animate(
    [{ width: `${beforePct}%` }, { width: `${afterPct}%` }],
    { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
  animateNumber(num, ev.before, ev.after, 620)
  const rect = hud.getBoundingClientRect()
  spawnDamage(rect.left + rect.width * 0.55, rect.top + rect.height * 0.48, `+${ev.amount}`, 'heal')
  spawnRing(rect.left + 30, rect.top + rect.height / 2, 'gold')
  flash('heal')
  sfx('heal')
  setTimeout(() => anim.cancel(), 700)
}

async function playEvents(events, layout) {
  for (const ev of events) {
    switch (ev.type) {
      case 'turn': {
        const mine = ev.side === mySide
        showBanner(mine ? 'YOUR TURN' : 'ENEMY TURN', mine ? 'MAIN PHASE' : 'OPPONENT TURN', !mine)
        addLog(`<b>TURN ${Math.ceil(game.turn / 2)}</b> — ${who(ev.side)} のターン`, 'sys')
        sfx('turn')
        await sleep(640)
        break
      }
      case 'draw': {
        if (ev.side === mySide) {
          els.deckPile.classList.add('pulse')
          setTimeout(() => els.deckPile.classList.remove('pulse'), 420)
          addLog(`${who(ev.side)} はカードを1枚ドロー。`)
          sfx('draw')
          const node = els.hand.querySelector(`.hand-card[data-uid="${ev.card.uid}"]`)
          if (node && layout.deck) animateNewCard(node, layout.deck)
          await sleep(260)
        }
        break
      }
      case 'summon': {
        animateSummon(ev, layout)
        addLog(`${who(ev.side)} は <b>${escapeHtml(ev.card.name)}</b> を召喚。`, ev.side === mySide ? 'p' : 'c')
        sfx('summon')
        await sleep(420)
        break
      }
      case 'set': {
        animateSet(ev, layout)
        addLog(`${who(ev.side)} は後衛に罠をセット。`, ev.side === mySide ? 'p' : 'c')
        sfx('trap')
        await sleep(340)
        break
      }
      case 'cast': {
        animateCast(ev, layout)
        addLog(`${who(ev.side)} は <b>${escapeHtml(ev.card.name)}</b> を発動！`, ev.side === mySide ? 'p' : 'c')
        sfx('cast')
        await sleep(420)
        break
      }
      case 'attack': {
        await animateAttack(ev, layout)
        if (ev.target.kind === 'player') {
          addLog(`${who(ev.side)} の <b>${escapeHtml(ev.attacker.name)}</b> が直接攻撃！`, ev.side === mySide ? 'p' : 'c')
        } else {
          addLog(`${who(ev.side)} の <b>${escapeHtml(ev.attacker.name)}</b> が <b>${escapeHtml(ev.target.card.name)}</b> を攻撃。`, ev.side === mySide ? 'p' : 'c')
        }
        sfx('attack')
        await sleep(180)
        break
      }
      case 'trap': {
        animateTrap(ev, layout)
        addLog(`${who(ev.side)} の <b>${escapeHtml(ev.card.name)}</b> が発動！攻撃を無効化。`, 'sys')
        sfx('trap')
        await sleep(520)
        break
      }
      case 'battle': {
        addLog(`ATK <span class="num">${ev.atk}</span> vs DEF <span class="num">${ev.def}</span>`, 'sys')
        await sleep(180)
        break
      }
      case 'direct': {
        sfx('attack')
        await sleep(120)
        break
      }
      case 'damage': {
        animateLp(ev)
        addLog(`${who(ev.side)} に <b><span class="num">${ev.amount}</span></b> ダメージ。`, ev.side === mySide ? 'c' : 'p')
        await sleep(520)
        break
      }
      case 'heal': {
        animateHeal(ev)
        addLog(`${who(ev.side)} のライフが <span class="num">${ev.amount}</span> 回復。`, ev.side === mySide ? 'p' : 'c')
        await sleep(460)
        break
      }
      case 'destroy': {
        animateDestroy(ev, layout)
        addLog(`<b>${escapeHtml(ev.card.name)}</b> が破壊された。`, 'sys')
        await sleep(340)
        break
      }
      case 'trapUsed': {
        break
      }
      case 'toGrave': {
        await sleep(80)
        break
      }
      case 'buff': {
        animateBuff(ev)
        addLog(`${who(ev.side)} の全ユニットの攻撃力が <span class="num">+${ev.amount}</span>。`, ev.side === mySide ? 'p' : 'c')
        await sleep(420)
        break
      }
      case 'shuffle': {
        addLog(`${who(ev.side)} の墓地をシャッフルし、山札へ戻した。`, 'sys')
        toast('山札が尽きたため、墓地を再シャッフル。', 'info', 3000)
        spawnRing(window.innerWidth / 2, window.innerHeight / 2, 'gold')
        await sleep(380)
        break
      }
      case 'deckout': {
        addLog(`${who(ev.side)} の山札が枯渇。500ダメージ。`, 'sys')
        await sleep(200)
        break
      }
      case 'burn': {
        addLog(`手札上限のため <b>${escapeHtml(ev.card.name)}</b> は墓地へ。`, 'sys')
        await sleep(200)
        break
      }
      case 'whiff': {
        addLog('効果の対象がいなかった。', 'sys')
        await sleep(160)
        break
      }
      case 'gameover': {
        await sleep(360)
        break
      }
      default:
        break
    }
  }
}

function animateNewCard(node, fromRect) {
  if (!node) return
  const to = node.getBoundingClientRect()
  if (!to.width) return
  const dx = fromRect.left + fromRect.width / 2 - (to.left + to.width / 2)
  const dy = fromRect.top + fromRect.height / 2 - (to.top + to.height / 2)
  node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.35) rotate(-8deg)`, opacity: 0.2 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
}

function animateSummon(ev, layout) {
  const slot = `${ev.side === mySide ? 'you' : 'foe'}Front-${ev.zone}`
  const zone = zoneEls.get(slot)
  const cardEl = zone?.querySelector('.card')
  const from = layout.cards.get(ev.card.uid)
  if (cardEl) {
    const to = cardEl.getBoundingClientRect()
    if (from) {
      const dx = from.left - to.left
      const dy = from.top - to.top
      cardEl.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(0.3, from.width / to.width)})`, opacity: 0.35 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(.16,.85,.25,1)' },
      )
    } else {
      cardEl.animate(
        [{ transform: 'scale(0.3) translateY(-26px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 420, easing: 'cubic-bezier(.16,.85,.25,1)' },
      )
    }
    const c = centerOf(to)
    spawnRing(c.x, c.y, ev.side === mySide ? '' : 'foe')
    spawnSparks(c.x, c.y, ev.side === mySide ? '' : 'foe', 12)
    zone.classList.add('flash')
    setTimeout(() => zone.classList.remove('flash'), 620)
  }
}

function animateSet(ev, layout) {
  const slot = `${ev.side === mySide ? 'you' : 'foe'}Back-${ev.zone}`
  const zone = zoneEls.get(slot)
  const cardEl = zone?.querySelector('.card')
  const from = layout.cards.get(ev.card.uid)
  if (!cardEl) return
  const to = cardEl.getBoundingClientRect()
  if (from) {
    const dx = from.left - to.left
    const dy = from.top - to.top
    cardEl.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(0.3, from.width / to.width)}) rotateY(0deg)`, opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 400, easing: 'cubic-bezier(.16,.85,.25,1)' },
    )
  }
  const c = centerOf(to)
  spawnRing(c.x, c.y, 'gold')
  spawnDamage(c.x, c.y - 6, 'SET', 'gold')
}

function animateCast(ev, layout) {
  const slot = `${ev.side === mySide ? 'you' : 'foe'}Back-${ev.zone}`
  const zone = zoneEls.get(slot)
  if (!zone) return
  const target = zone.getBoundingClientRect()
  const from = layout.cards.get(ev.card.uid)
  const ghost = makeGhost(ev.card, from || target, ev.side === mySide ? '' : 'foe')
  if (!ghost) return
  const to = centerOf(target)
  const start = from ? centerOf(from) : { x: to.x, y: to.y + 30 }
  ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 0.9 },
      { transform: `translate(${to.x - start.x}px, ${to.y - start.y}px) scale(0.55) rotate(8deg)`, opacity: 0.15 },
    ],
    { duration: 440, easing: 'cubic-bezier(.3,.7,.2,1)' },
  )
  setTimeout(() => ghost.remove(), 480)
  setTimeout(() => {
    spawnRing(to.x, to.y, ev.side === mySide ? '' : 'foe')
    spawnSparks(to.x, to.y, ev.side === mySide ? '' : 'foe', 10)
    zone.classList.add('flash')
    setTimeout(() => zone.classList.remove('flash'), 600)
  }, 360)
}

async function animateAttack(ev, layout) {
  const from = layout.cards.get(ev.attacker.uid)
  if (!from) return
  const toRect = ev.target.kind === 'unit'
    ? layout.cards.get(ev.target.card.uid) || zoneEls.get(`${ev.target.side === mySide ? 'you' : 'foe'}Front-${ev.target.zone}`)?.getBoundingClientRect()
    : layout.foeHud
  if (!toRect) return
  const start = centerOf(from)
  const end = centerOf(toRect)
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI
  const ghost = makeGhost(ev.attacker, from, ev.side === mySide ? '' : 'foe')
  if (ghost) {
    const anim = ghost.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
        { transform: `translate(${(end.x - start.x) * 0.12}px, ${(end.y - start.y) * 0.12}px) scale(1.08) rotate(-3deg)`, offset: 0.28 },
        { transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(0.94) rotate(0deg)`, offset: 1 },
      ],
      { duration: 330, easing: 'cubic-bezier(.2,.7,.25,1)' },
    )
    await anim.finished.catch(() => {})
    ghost.remove()
  }
  if (ev.target.kind === 'player') {
    spawnBeam(start.x, start.y, Math.hypot(end.x - start.x, end.y - start.y) * 0.9, angle, ev.side === mySide ? '' : 'foe')
  }
  spawnSlash(end.x, end.y, angle, ev.side === mySide ? '' : 'foe')
  spawnRing(end.x, end.y, ev.side === mySide ? '' : 'foe')
  spawnSparks(end.x, end.y, ev.side === mySide ? '' : 'foe', 8)
  const zone = ev.target.kind === 'unit'
    ? zoneEls.get(`${ev.target.side === mySide ? 'you' : 'foe'}Front-${ev.target.zone}`)
    : null
  if (zone) {
    zone.classList.add('fx-hit')
    setTimeout(() => zone.classList.remove('fx-hit'), 460)
  }
  shakeArena()
}

function animateTrap(ev, layout) {
  const slot = `${ev.side === mySide ? 'you' : 'foe'}Back-${ev.zone}`
  const zone = zoneEls.get(slot)
  const rect = layout.cards.get(ev.card.uid) || zone?.getBoundingClientRect()
  if (!zone) return
  const c = centerOf(zone.getBoundingClientRect())
  const ghost = makeGhost(ev.card, rect, ev.side === mySide ? '' : 'foe')
  if (ghost) {
    ghost.animate(
      [
        { transform: 'rotateY(90deg) scale(0.8)', opacity: 0.2 },
        { transform: 'rotateY(0deg) scale(1.12)', opacity: 1, offset: 0.7 },
        { transform: 'rotateY(0deg) scale(1)', opacity: 1 },
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    setTimeout(() => ghost.remove(), 560)
  }
  spawnRing(c.x, c.y, 'gold')
  spawnSparks(c.x, c.y, 'gold', 14)
  spawnDamage(c.x, c.y - 10, 'TRAP!', 'gold')
  flash('damage')
}

function animateDestroy(ev, layout) {
  const rect = layout.cards.get(ev.card.uid)
  if (!rect) return
  const c = centerOf(rect)
  spawnSparks(c.x, c.y, ev.side === mySide ? '' : 'foe', 16)
  spawnRing(c.x, c.y, ev.side === mySide ? '' : 'foe')
  const target = rectOf(els.gravePile)
  if (target) {
    const ghost = makeGhost(ev.card, rect, ev.side === mySide ? '' : 'foe')
    if (ghost) {
      const end = centerOf(target)
      ghost.animate(
        [
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 0.9 },
          { transform: `translate(${end.x - c.x}px, ${end.y - c.y}px) scale(0.25) rotate(28deg)`, opacity: 0 },
        ],
        { duration: 460, easing: 'cubic-bezier(.3,.6,.3,1)' },
      )
      setTimeout(() => ghost.remove(), 500)
    }
  }
}

function animateBuff(ev) {
  for (const uid of ev.targets || []) {
    const el = document.querySelector(`.card[data-uid="${uid}"]`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    const c = centerOf(rect)
    spawnRing(c.x, c.y, 'gold')
    spawnDamage(c.x, c.y - 8, '+500', 'gold')
    el.animate(
      [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.08)', filter: 'brightness(1.5)' }, { transform: 'scale(1)', filter: 'brightness(1)' }],
      { duration: 500, easing: 'ease-out' },
    )
  }
  flash('heal')
}

function showBanner(main, sub, foe = false) {
  els.banner.className = `banner${foe ? ' foe' : ''}`
  els.banner.innerHTML = `<span class="banner-main">${escapeHtml(main)}</span><span class="banner-sub">${escapeHtml(sub)}</span>`
  void els.banner.offsetWidth
  els.banner.classList.add('show')
}

// ------------------------------------------------------------------ background

function initBackground() {
  const canvas = els.bg
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  let width = 0
  let height = 0
  let dpr = 1
  let particles = []
  let motes = []
  let raf = 0
  let t = 0

  const palette = [
    [55, 244, 255],
    [255, 46, 138],
    [255, 209, 102],
    [118, 160, 255],
  ]

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const count = clamp(Math.floor((width * height) / 18000), 35, 110)
    particles = Array.from({ length: count }, () => {
      const color = palette[Math.floor(Math.random() * palette.length)]
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.5 + Math.random() * 1.6,
        vy: 0.04 + Math.random() * 0.22,
        vx: (Math.random() - 0.5) * 0.12,
        a: 0.12 + Math.random() * 0.45,
        color,
        tw: Math.random() * Math.PI * 2,
      }
    })
    motes = Array.from({ length: Math.floor(count / 3) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 14 + Math.random() * 40,
      speed: 0.4 + Math.random() * 0.9,
      a: 0.04 + Math.random() * 0.09,
      color: palette[Math.floor(Math.random() * palette.length)],
    }))
  }

  function draw(now) {
    t = now / 1000
    ctx.clearRect(0, 0, width, height)
    for (const mote of motes) {
      mote.y -= mote.speed
      if (mote.y < -mote.len) { mote.y = height + mote.len; mote.x = Math.random() * width }
      ctx.strokeStyle = `rgba(${mote.color[0]},${mote.color[1]},${mote.color[2]},${mote.a})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mote.x, mote.y)
      ctx.lineTo(mote.x, mote.y + mote.len)
      ctx.stroke()
    }
    for (const p of particles) {
      p.y -= p.vy
      p.x += p.vx + Math.sin(t * 0.5 + p.tw) * 0.05
      if (p.y < -5) { p.y = height + 5; p.x = Math.random() * width }
      if (p.x < -5) p.x = width + 5
      if (p.x > width + 5) p.x = -5
      const twinkle = 0.55 + Math.sin(t * 1.6 + p.tw) * 0.45
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.a * twinkle})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    raf = requestAnimationFrame(draw)
  }

  resize()
  draw(performance.now())
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf)
    else { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw) }
  })
}

// ------------------------------------------------------------------ boot

function init() {
  buildBoard()
  buildEnergy()
  initBackground()

  try {
    soundOn = localStorage.getItem('duel24.sound') !== 'off'
  } catch { soundOn = true }
  setSoundEnabled(soundOn)
  els.soundBtn.classList.toggle('muted', !soundOn)

  lobby = new Lobby({
    onChange: () => {
      renderRoomsFromLobby()
      renderAll?.()
    },
    onToast: toast,
    onRoomMessage: () => {},
  })
  lobby.start()
  lastRoomSignature = ''
  renderRoomsFromLobby()

  bindEvents()
  startDuel()
}

init()
