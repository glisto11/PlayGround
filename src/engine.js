// Pure-ish duel engine for DUEL 24.
//
// The engine mutates a serialisable state object and returns an event list.
// The UI replays those events as animation cues, which keeps rules and
// presentation separate and makes a network mirror (host -> guest) possible.

import { CARDS, cardIds } from './cards.js'

export const START_LP = 4000
export const HAND_LIMIT = 9
export const MAX_ENERGY = 10
export const ZONES = 6
export const DECK_SIZE = 24

let uidCounter = 0
const nextUid = () => `u${++uidCounter}`

export const other = side => (side === 'p' ? 'c' : 'p')
export const atkOf = card => (card ? card.atk + (card.atkBonus || 0) : 0)
export const defOf = card => (card ? card.def : 0)

export function shuffle(list) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function makeCard(defId, owner) {
  const def = CARDS[defId]
  if (!def) throw new Error(`Unknown card: ${defId}`)
  return {
    uid: nextUid(),
    defId,
    owner,
    name: def.name,
    en: def.en,
    type: def.type,
    cost: def.cost,
    atk: def.atk || 0,
    def: def.def || 0,
    element: def.element,
    glyph: def.glyph,
    rarity: def.rarity,
    text: def.text,
    atkBonus: 0,
    attacked: false,
    faceDown: def.type === 'trap',
    turnSet: 0,
  }
}

function buildDeck(owner) {
  return shuffle(cardIds().map(id => makeCard(id, owner)))
}

function newSide(name) {
  return {
    name,
    lp: START_LP,
    energy: 3,
    maxEnergy: 3,
    turns: 0,
    deck: [],
    hand: [],
    front: Array(ZONES).fill(null),
    back: Array(ZONES).fill(null),
    grave: [],
    damageDealt: 0,
    destroyed: 0,
    played: 0,
  }
}

export function createGame(playerName = 'DUELIST', cpuName = 'CPU DUELIST') {
  const p = newSide(playerName)
  const c = newSide(cpuName)
  p.deck = buildDeck('p')
  c.deck = buildDeck('c')
  // Opening hands.
  for (let i = 0; i < 5; i += 1) {
    p.hand.push(p.deck.pop())
    c.hand.push(c.deck.pop())
  }
  p.turns = 1
  p.maxEnergy = 3
  p.energy = 3
  c.turns = 0
  c.maxEnergy = 3
  c.energy = 3
  return {
    turn: 1,
    turnSide: 'p',
    over: false,
    winner: null,
    p,
    c,
  }
}

function checkWin(state, events) {
  if (state.over) return
  for (const side of ['p', 'c']) {
    if (state[side].lp <= 0) {
      state.over = true
      state.winner = other(side)
      events.push({ type: 'gameover', loser: side, winner: other(side) })
      return
    }
  }
}

function damage(state, side, amount, source, by, events) {
  if (amount <= 0) return
  const target = state[side]
  const before = target.lp
  target.lp = Math.max(0, target.lp - amount)
  if (by && state[by]) state[by].damageDealt += before - target.lp
  events.push({
    type: 'damage', side, amount: before - target.lp, before, after: target.lp, source, by: by || null,
  })
  checkWin(state, events)
}

function heal(state, side, amount, events) {
  const target = state[side]
  const before = target.lp
  target.lp = Math.min(START_LP, target.lp + amount)
  events.push({ type: 'heal', side, amount: target.lp - before, before, after: target.lp })
}

export function drawCards(state, side, count, events) {
  const s = state[side]
  for (let i = 0; i < count; i += 1) {
    if (!s.deck.length) {
      if (s.grave.length) {
        s.deck = shuffle(s.grave.splice(0, s.grave.length))
        events.push({ type: 'shuffle', side })
      }
    }
    if (!s.deck.length) {
      events.push({ type: 'deckout', side, amount: 500 })
      damage(state, side, 500, 'deckout', other(side), events)
      if (state.over) return
      continue
    }
    const card = s.deck.pop()
    if (s.hand.length >= HAND_LIMIT) {
      s.grave.push(card)
      events.push({ type: 'burn', side, card })
    } else {
      s.hand.push(card)
      events.push({ type: 'draw', side, card })
    }
  }
}

export function destroyUnit(state, side, zone, events, reason = 'battle') {
  const s = state[side]
  const card = s.front[zone]
  if (!card) return
  s.front[zone] = null
  s.grave.push(card)
  events.push({ type: 'destroy', side, row: 'front', zone, card, reason })
}

function removeTrap(state, side, zone, events) {
  const s = state[side]
  const card = s.back[zone]
  if (!card) return null
  s.back[zone] = null
  card.faceDown = false
  s.grave.push(card)
  events.push({ type: 'trapUsed', side, zone, card })
  return card
}

function applySpell(state, side, card, events) {
  const foe = other(side)
  const s = state[side]
  switch (card.defId) {
    case 'chain':
      damage(state, foe, 800, 'spell', side, events)
      if (!state.over) drawCards(state, side, 1, events)
      break
    case 'meteor': {
      damage(state, foe, 1200, 'spell', side, events)
      if (!state.over) {
        const units = state[foe].front
          .map((c, zone) => (c ? { c, zone } : null))
          .filter(Boolean)
          .sort((a, b) => atkOf(b.c) - atkOf(a.c))
        if (units.length) destroyUnit(state, foe, units[0].zone, events, 'meteor')
      }
      break
    }
    case 'grace':
      heal(state, side, 1200, events)
      drawCards(state, side, 1, events)
      break
    case 'command': {
      const own = s.front.filter(Boolean)
      if (own.length) {
        for (const unit of own) unit.atkBonus += 500
        events.push({ type: 'buff', side, amount: 500, targets: own.map(u => u.uid) })
      } else {
        events.push({ type: 'whiff', side, card })
      }
      break
    }
    default:
      break
  }
}

export function canPlayCard(state, side, card, zone) {
  if (state.over || state.turnSide !== side) return false
  if (!card || card.cost > state[side].energy) return false
  if (zone < 0 || zone >= ZONES) return false
  if (card.type === 'unit') return !state[side].front[zone]
  return !state[side].back[zone]
}

export function playCard(state, side, uid, zone) {
  const s = state[side]
  if (state.over || state.turnSide !== side) return { ok: false, reason: 'turn' }
  const index = s.hand.findIndex(c => c.uid === uid)
  if (index < 0) return { ok: false, reason: 'hand' }
  const card = s.hand[index]
  if (card.cost > s.energy) return { ok: false, reason: 'energy' }
  const events = []
  if (card.type === 'unit') {
    if (s.front[zone]) return { ok: false, reason: 'zone' }
    s.hand.splice(index, 1)
    s.energy -= card.cost
    s.played += 1
    card.attacked = false
    s.front[zone] = card
    events.push({ type: 'summon', side, card, zone })
  } else if (card.type === 'spell') {
    if (s.back[zone]) return { ok: false, reason: 'zone' }
    s.hand.splice(index, 1)
    s.energy -= card.cost
    s.played += 1
    events.push({ type: 'cast', side, card, zone })
    applySpell(state, side, card, events)
    s.grave.push(card)
    events.push({ type: 'toGrave', side, card, from: 'back', zone })
  } else {
    if (s.back[zone]) return { ok: false, reason: 'zone' }
    s.hand.splice(index, 1)
    s.energy -= card.cost
    s.played += 1
    card.faceDown = true
    card.turnSet = state.turn
    s.back[zone] = card
    events.push({ type: 'set', side, card, zone })
  }
  return { ok: true, events }
}

export function canAttack(state, side, zone) {
  if (state.over || state.turnSide !== side) return false
  const unit = state[side].front[zone]
  return Boolean(unit && !unit.attacked)
}

export function canDirectAttack(state, side) {
  return state[other(side)].front.every(c => !c)
}

export function attack(state, side, fromZone, target) {
  const s = state[side]
  if (state.over || state.turnSide !== side) return { ok: false, reason: 'turn' }
  const attacker = s.front[fromZone]
  if (!attacker) return { ok: false, reason: 'unit' }
  if (attacker.attacked) return { ok: false, reason: 'used' }
  const foeSide = other(side)
  const foe = state[foeSide]

  let targetCard = null
  if (target.kind === 'unit') {
    if (target.side !== foeSide) return { ok: false, reason: 'target' }
    targetCard = foe.front[target.zone]
    if (!targetCard) return { ok: false, reason: 'target' }
  } else if (target.kind === 'player') {
    if (!canDirectAttack(state, side)) return { ok: false, reason: 'blocked' }
  } else {
    return { ok: false, reason: 'target' }
  }

  const events = []
  const atk = atkOf(attacker)
  attacker.attacked = true
  const attackEvent = {
    type: 'attack',
    side,
    fromZone,
    attacker,
    target: targetCard
      ? { kind: 'unit', side: foeSide, zone: target.zone, card: targetCard }
      : { kind: 'player', side: foeSide },
    negated: false,
  }
  events.push(attackEvent)

  // Traps fire before battle. The oldest set trap is consumed.
  const trapIndex = foe.back.findIndex(c => c && c.type === 'trap' && c.faceDown)
  if (trapIndex >= 0) {
    const trap = foe.back[trapIndex]
    attackEvent.negated = true
    events.push({ type: 'trap', side: foeSide, zone: trapIndex, card: trap })
    removeTrap(state, foeSide, trapIndex, events)
    if (trap.defId === 'mirage') {
      damage(state, side, 800, 'trap', foeSide, events)
    } else if (trap.defId === 'barrier') {
      destroyUnit(state, side, fromZone, events, 'trap')
      state[side].destroyed += 1
    }
    return { ok: true, events }
  }

  if (targetCard) {
    const defenderDef = defOf(targetCard)
    events.push({
      type: 'battle', side, fromZone, targetZone: target.zone, atk, def: defenderDef,
    })
    if (atk > defenderDef) {
      destroyUnit(state, foeSide, target.zone, events)
      state[side].destroyed += 1
      damage(state, foeSide, atk - defenderDef, 'battle', side, events)
    } else if (atk === defenderDef) {
      destroyUnit(state, side, fromZone, events)
      destroyUnit(state, foeSide, target.zone, events)
      state[side].destroyed += 1
      state[foeSide].destroyed += 1
    } else {
      destroyUnit(state, side, fromZone, events)
      state[foeSide].destroyed += 1
    }
  } else {
    events.push({ type: 'direct', side, targetSide: foeSide, amount: atk })
    damage(state, foeSide, atk, 'direct', side, events)
  }
  return { ok: true, events }
}

function startTurn(state, side, events) {
  const s = state[side]
  s.turns += 1
  s.maxEnergy = Math.min(MAX_ENERGY, 2 + s.turns)
  s.energy = s.maxEnergy
  for (const unit of s.front) if (unit) unit.attacked = false
  events.push({ type: 'turn', side, number: state.turn })
  drawCards(state, side, 1, events)
}

export function endTurn(state) {
  if (state.over) return { ok: false, reason: 'over' }
  const events = []
  state.turnSide = other(state.turnSide)
  state.turn += 1
  startTurn(state, state.turnSide, events)
  return { ok: true, events }
}

// ---- opponent AI ----------------------------------------------------------

const CENTER_FIRST = [2, 3, 1, 4, 0, 5]

function firstEmptyFront(s) {
  for (const i of CENTER_FIRST) if (!s.front[i]) return i
  return -1
}

function firstEmptyBack(s) {
  for (const i of CENTER_FIRST) if (!s.back[i]) return i
  return -1
}

function handCard(s, defId) {
  return s.hand.find(c => c.defId === defId) || null
}

function bestUnit(s, energy) {
  return s.hand
    .filter(c => c.type === 'unit' && c.cost <= energy)
    .sort((a, b) => (b.cost * 100 + b.atk) - (a.cost * 100 + a.atk))[0] || null
}

function bestAttack(state) {
  const s = state.c
  const foe = state.p
  const ready = s.front
    .map((c, zone) => (c && !c.attacked ? { card: c, zone } : null))
    .filter(Boolean)
    .sort((a, b) => atkOf(b.card) - atkOf(a.card))
  if (!ready.length) return null

  if (canDirectAttack(state, 'c')) {
    const best = ready[0]
    return { zone: best.zone, target: { kind: 'player', side: 'p' } }
  }

  const targets = foe.front
    .map((c, zone) => (c ? { card: c, zone } : null))
    .filter(Boolean)
  let best = null
  for (const attacker of ready) {
    const atk = atkOf(attacker.card)
    for (const target of targets) {
      if (atk > target.card.def) {
        const score = atkOf(target.card) + (atk - target.card.def) + (target.card.cost * 50)
        if (!best || score > best.score) {
          best = {
            score,
            zone: attacker.zone,
            target: { kind: 'unit', side: 'p', zone: target.zone },
          }
        }
      }
    }
  }
  return best ? { zone: best.zone, target: best.target } : null
}

export function cpuNextAction(state) {
  if (state.over || state.turnSide !== 'c') return { type: 'end' }
  const s = state.c
  const foe = state.p
  const frontZone = firstEmptyFront(s)
  const backZone = firstEmptyBack(s)

  // Finish the player when possible.
  if (foe.lp <= 800 && backZone >= 0 && s.energy >= 2) {
    const chain = handCard(s, 'chain')
    if (chain) return { type: 'play', uid: chain.uid, zone: backZone }
  }
  if (foe.lp <= 1200 && backZone >= 0 && s.energy >= 4) {
    const meteor = handCard(s, 'meteor')
    if (meteor) return { type: 'play', uid: meteor.uid, zone: backZone }
  }

  // Develop the board first.
  if (frontZone >= 0) {
    const unit = bestUnit(s, s.energy)
    if (unit) return { type: 'play', uid: unit.uid, zone: frontZone }
  }

  // Then cards that improve the current board.
  if (backZone >= 0) {
    const grace = handCard(s, 'grace')
    if (grace && s.energy >= grace.cost && s.lp <= 1600) {
      return { type: 'play', uid: grace.uid, zone: backZone }
    }
    const command = handCard(s, 'command')
    const ownUnits = s.front.filter(Boolean).length
    if (command && s.energy >= command.cost && ownUnits >= 2) {
      return { type: 'play', uid: command.uid, zone: backZone }
    }
    const trap = s.hand.find(c => c.type === 'trap' && c.cost <= s.energy)
    if (trap && (s.energy >= trap.cost + 1 || !bestUnit(s, s.energy) || s.hand.length > 5)) {
      return { type: 'play', uid: trap.uid, zone: backZone }
    }
  }

  if (backZone >= 0) {
    const chain = handCard(s, 'chain')
    if (chain && s.energy >= chain.cost && (foe.lp <= 2000 || s.energy >= 6)) {
      return { type: 'play', uid: chain.uid, zone: backZone }
    }
    const meteor = handCard(s, 'meteor')
    if (meteor && s.energy >= meteor.cost && (foe.front.some(Boolean) || foe.lp <= 1600)) {
      return { type: 'play', uid: meteor.uid, zone: backZone }
    }
  }

  const hit = bestAttack(state)
  if (hit) return { type: 'attack', zone: hit.zone, target: hit.target }
  return { type: 'end' }
}

export function applyCpuAction(state, action) {
  if (action.type === 'play') return playCard(state, 'c', action.uid, action.zone)
  if (action.type === 'attack') return attack(state, 'c', action.zone, action.target)
  return endTurn(state)
}
