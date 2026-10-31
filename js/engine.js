// DUEL 24 ZONES — deterministic, host-authoritative duel engine.
// All state is plain JSON so it can be mirrored to online guests.

import { CARDS, DECK_RECIPE, EXTRA_RECIPE } from './cards.js'

export const MAX_LP = 8000
export const ZONES = 5

let UID = 1
const nextUid = () => `u${UID++}`

function makeInst(id) {
  return {
    uid: nextUid(),
    id,
    faceDown: false,
    pos: 'atk',
    hasAttacked: false,
    atkBonus: 0,
    setTurn: 0,
    equippedUid: null,
  }
}

function shuffle(list) {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const memo = (id) => CARDS[id]

export function addLog(st, text, tone = 'system') {
  st.log.push({ turn: st.turn, text, tone })
  if (st.log.length > 80) st.log.splice(0, st.log.length - 80)
}

export function fieldBuff(st, side) {
  const f = st.players[side].field
  if (!f) return 0
  const c = CARDS[f.id]
  return c.effect && c.effect.kind === 'field' ? c.effect.amount : 0
}

export function atkOf(st, side, inst) {
  if (!inst) return 0
  return Math.max(0, (CARDS[inst.id].atk || 0) + (inst.atkBonus || 0) + fieldBuff(st, side))
}

export function defOf(st, side, inst) {
  if (!inst) return 0
  return Math.max(0, (CARDS[inst.id].def || 0) + (inst.atkBonus || 0) + fieldBuff(st, side))
}

export function countMonsters(p) {
  let n = 0
  for (const z of p.monsters) if (z) n++
  if (p.emz) n++
  return n
}

export function zoneMonster(p, kind, index) {
  if (kind === 'emz') return p.emz
  if (kind === 'monster') return p.monsters[index] || null
  return null
}

export function setZoneMonster(p, kind, index, inst) {
  if (kind === 'emz') p.emz = inst
  else p.monsters[index] = inst
}

export function clearZoneMonster(p, kind, index) {
  if (kind === 'emz') p.emz = null
  else p.monsters[index] = null
}

export function firstFreeMonsterZone(p) {
  return p.monsters.findIndex((z) => !z)
}

export function firstFreeSpellZone(p) {
  return p.spells.findIndex((z) => !z)
}

export function strongestMonster(st, side) {
  const p = st.players[side]
  let best = null
  p.monsters.forEach((inst, index) => {
    if (!inst) return
    const val = atkOf(st, side, inst)
    if (!best || val > best.atk) best = { kind: 'monster', index, inst, atk: val, def: defOf(st, side, inst) }
  })
  if (p.emz) {
    const val = atkOf(st, side, p.emz)
    if (!best || val > best.atk) best = { kind: 'emz', index: 0, inst: p.emz, atk: val, def: defOf(st, side, p.emz) }
  }
  return best
}

export function attackersOf(st, side) {
  const p = st.players[side]
  const out = []
  p.monsters.forEach((inst, index) => {
    if (inst && !inst.faceDown && inst.pos === 'atk' && !inst.hasAttacked) {
      out.push({ kind: 'monster', index, inst })
    }
  })
  if (p.emz && !p.emz.faceDown && p.emz.pos === 'atk' && !p.emz.hasAttacked) {
    out.push({ kind: 'emz', index: 0, inst: p.emz })
  }
  return out
}

/* ───────────────────────────── SETUP ───────────────────────────── */

export function createDuel(names, starter = 0, opts = {}) {
  const players = names.map((name, i) => ({
    name,
    isCPU: i === 1 ? !!opts.cpuOpponent : false,
    lp: MAX_LP,
    deck: [],
    extra: [],
    hand: [],
    gy: [],
    banished: [],
    monsters: Array(ZONES).fill(null),
    spells: Array(ZONES).fill(null),
    field: null,
    emz: null,
    hasSummoned: false,
    extraUsed: false,
    lpLost: 0,
  }))

  players.forEach((p) => {
    p.deck = shuffle(DECK_RECIPE)
    p.extra = shuffle(EXTRA_RECIPE)
    for (let i = 0; i < 5; i++) p.hand.push(makeInst(p.deck.pop()))
  })

  const st = {
    v: 2,
    mode: opts.mode || 'cpu',
    turn: 1,
    active: starter,
    phase: 'main',
    winner: null,
    winReason: '',
    noAttacks: false,
    rev: 0,
    log: [],
    players,
    startedAt: Date.now(),
  }

  addLog(st, `DUEL START — ${names[starter]} が先攻`, 'system')
  addLog(st, '24ゾーン展開完了。カードは常に動き続ける。', 'system')
  return st
}

/* ─────────────────────────── PRIMITIVES ─────────────────────────── */

function damage(st, side, amount, ev) {
  if (st.winner) return
  amount = Math.max(0, Math.round(amount))
  if (!amount) return
  const p = st.players[side]
  p.lp = Math.max(0, p.lp - amount)
  p.lpLost = (p.lpLost || 0) + amount
  ev.push({ type: 'damage', side, amount, lp: p.lp, cardId: null })
  addLog(st, `${p.name} に ${amount} ダメージ（LP ${p.lp}）`, side === 0 ? 'p0' : 'p1')
  if (p.lp <= 0) endDuel(st, 1 - side, 'LPが0になった', ev)
}

function heal(st, side, amount, ev) {
  const p = st.players[side]
  const before = p.lp
  p.lp = Math.min(MAX_LP, p.lp + amount)
  const gained = p.lp - before
  ev.push({ type: 'heal', side, amount: gained, lp: p.lp })
  if (gained) addLog(st, `${p.name} は ${gained} LP回復（LP ${p.lp}）`, side === 0 ? 'p0' : 'p1')
}

function drawCards(st, side, amount, ev) {
  const p = st.players[side]
  for (let i = 0; i < amount; i++) {
    if (!p.deck.length) {
      ev.push({ type: 'deckout', side })
      addLog(st, `${p.name} のデッキが尽きた`, 'system')
      endDuel(st, 1 - side, 'デッキ切れ', ev)
      return
    }
    const inst = makeInst(p.deck.pop())
    p.hand.push(inst)
    ev.push({ type: 'draw', side, uid: inst.uid, cardId: inst.id })
  }
}

function endDuel(st, winner, reason, ev) {
  if (st.winner != null) return
  st.winner = winner
  st.winReason = reason
  ev.push({ type: 'result', winner, reason })
  addLog(st, `DUEL終了 — ${st.players[winner].name} の勝利（${reason}）`, 'system')
}

function removeEquipFor(st, side, uid, ev) {
  const p = st.players[side]
  p.spells.forEach((s, i) => {
    if (s && s.equippedUid === uid) {
      p.spells[i] = null
      p.gy.push(s)
      ev.push({ type: 'equipLost', side, zone: i, uid: s.uid, cardId: s.id })
    }
  })
}

export function destroyAt(st, side, kind, index, ev) {
  const p = st.players[side]
  const inst = zoneMonster(p, kind, index)
  if (!inst) return null
  clearZoneMonster(p, kind, index)
  const wasFaceDown = inst.faceDown
  inst.faceDown = false
  removeEquipFor(st, side, inst.uid, ev)
  p.gy.push(inst)
  ev.push({
    type: 'destroy', side, kind, index,
    uid: inst.uid, cardId: inst.id, faceDown: wasFaceDown,
  })
  addLog(st, `${p.name} の ${CARDS[inst.id].name} が破壊された`, side === 0 ? 'p0' : 'p1')
  return inst
}

/* ─────────────────────────── TRAP WINDOWS ─────────────────────────── */

function trapReady(st, inst) {
  return !!(inst && inst.faceDown && inst.setTurn < st.turn)
}

function triggerSummonTraps(st, defenderSide, targetSide, kind, index, inst, ev) {
  if (CARDS[inst.id].atk < 1500) return false
  const p = st.players[defenderSide]
  for (let i = 0; i < ZONES; i++) {
    const trap = p.spells[i]
    if (!trapReady(st, trap)) continue
    const c = CARDS[trap.id]
    if (c.type !== 'trap' || c.trigger !== 'summon') continue
    p.spells[i] = null
    p.gy.push(trap)
    ev.push({ type: 'trap', side: defenderSide, zone: i, cardId: trap.id, effect: 'destroySummoned', targetUid: inst.uid })
    addLog(st, `${p.name} は ${c.name} を発動！ ${CARDS[inst.id].name} を破壊`, defenderSide === 0 ? 'p0' : 'p1')
    destroyAt(st, targetSide, kind, index, ev)
    return true
  }
  return false
}

function triggerBattleTraps(st, defenderSide, ev) {
  const p = st.players[defenderSide]
  for (let i = 0; i < ZONES; i++) {
    const trap = p.spells[i]
    if (!trapReady(st, trap)) continue
    const c = CARDS[trap.id]
    if (c.type !== 'trap' || c.trigger !== 'battle') continue
    p.spells[i] = null
    p.gy.push(trap)
    st.noAttacks = true
    ev.push({ type: 'trap', side: defenderSide, zone: i, cardId: trap.id, effect: 'lockAttacks' })
    addLog(st, `${p.name} は ${c.name} を発動！ このターンの攻撃を封じた`, defenderSide === 0 ? 'p0' : 'p1')
    return true
  }
  return false
}

// returns true when the attack is negated
function triggerAttackTraps(st, defenderSide, attackerSide, ev) {
  const p = st.players[defenderSide]
  for (let i = 0; i < ZONES; i++) {
    const trap = p.spells[i]
    if (!trapReady(st, trap)) continue
    const c = CARDS[trap.id]
    if (c.type !== 'trap' || c.trigger !== 'attack') continue
    p.spells[i] = null
    p.gy.push(trap)
    ev.push({ type: 'trap', side: defenderSide, zone: i, cardId: trap.id, effect: 'negateAttack' })
    addLog(st, `${p.name} は ${c.name} を発動！ 攻撃を無効化`, defenderSide === 0 ? 'p0' : 'p1')
    damage(st, attackerSide, c.effect.amount || 0, ev)
    return true
  }
  for (let i = 0; i < ZONES; i++) {
    const trap = p.spells[i]
    if (!trapReady(st, trap)) continue
    const c = CARDS[trap.id]
    if (c.type !== 'trap' || c.trigger !== 'attacked') continue
    p.spells[i] = null
    p.gy.push(trap)
    ev.push({ type: 'trap', side: defenderSide, zone: i, cardId: trap.id, effect: 'draw' })
    addLog(st, `${p.name} は ${c.name} を発動！ 1枚ドロー`, defenderSide === 0 ? 'p0' : 'p1')
    drawCards(st, defenderSide, c.effect.amount || 1, ev)
    break
  }
  return false
}

/* ─────────────────────────── SUMMONING ─────────────────────────── */

function onSummonEffect(st, side, inst, ev) {
  if (st.winner) return
  const c = CARDS[inst.id]
  if (!c.onSummon) return
  const foe = 1 - side
  if (c.onSummon.kind === 'burn') {
    addLog(st, `${c.name} の召喚効果が発動`, side === 0 ? 'p0' : 'p1')
    damage(st, foe, c.onSummon.amount, ev)
  } else if (c.onSummon.kind === 'draw') {
    drawCards(st, side, c.onSummon.amount, ev)
  } else if (c.onSummon.kind === 'destroyEnemy') {
    const target = strongestMonster(st, foe)
    if (target) {
      addLog(st, `${c.name} の召喚効果で ${CARDS[target.inst.id].name} を破壊`, side === 0 ? 'p0' : 'p1')
      destroyAt(st, foe, target.kind, target.index, ev)
    }
  }
}

function summonMonster(st, side, handUid, zone, faceDown, ev) {
  const p = st.players[side]
  const idx = p.hand.findIndex((c) => c.uid === handUid)
  if (idx < 0) return 'そのカードは手札にない'
  const inst = p.hand[idx]
  const c = CARDS[inst.id]
  if (c.type !== 'monster') return 'モンスターではない'
  if (c.extra) return 'EXモンスターは特殊召喚専用'
  if (p.hasSummoned) return 'このターンは既に召喚済み'
  if (zone < 0 || zone >= ZONES) return 'ゾーン指定が不正'
  if (p.monsters[zone]) return 'そのゾーンは埋まっている'

  p.hand.splice(idx, 1)
  inst.faceDown = !!faceDown
  inst.pos = faceDown ? 'def' : 'atk'
  inst.hasAttacked = false
  inst.setTurn = st.turn
  p.monsters[zone] = inst
  p.hasSummoned = true
  ev.push({
    type: faceDown ? 'setMonster' : 'summon',
    side, zoneKind: 'monster', index: zone,
    uid: inst.uid, cardId: inst.id, faceDown: !!faceDown,
  })
  addLog(st, `${p.name} は ${faceDown ? 'モンスターをセット' : `${c.name} を召喚`}`, side === 0 ? 'p0' : 'p1')

  const destroyed = triggerSummonTraps(st, 1 - side, side, 'monster', zone, inst, ev)
  if (!destroyed && !faceDown) onSummonEffect(st, side, inst, ev)
  return null
}

function specialSummonExtra(st, side, cardId, ev) {
  const p = st.players[side]
  if (countMonsters(p) < 2) return 'モンスターが2体以上必要'
  if (p.emz) return 'EXゾーンが埋まっている'
  if (p.extraUsed) return 'このターンは既にEX召喚済み'
  const idx = p.extra.indexOf(cardId)
  if (idx < 0) return 'EXデッキにそのカードはない'
  p.extra.splice(idx, 1)
  const inst = makeInst(cardId)
  inst.setTurn = st.turn
  p.emz = inst
  p.extraUsed = true
  ev.push({ type: 'special', side, zoneKind: 'emz', index: 0, uid: inst.uid, cardId, from: 'extra' })
  addLog(st, `${p.name} は ${CARDS[cardId].name} をEXゾーンに特殊召喚！`, side === 0 ? 'p0' : 'p1')
  triggerSummonTraps(st, 1 - side, side, 'emz', 0, inst, ev)
  return null
}

function reviveMonster(st, side, ev) {
  const p = st.players[side]
  if (p.emz) return 'EXゾーンが埋まっている'
  const candidates = p.gy.filter((c) => {
    const cd = CARDS[c.id]
    return cd.type === 'monster' && !cd.extra
  })
  if (!candidates.length) return '墓地にモンスターがいない'
  candidates.sort((a, b) => atkOf(st, side, b) - atkOf(st, side, a))
  const inst = candidates[0]
  p.gy.splice(p.gy.indexOf(inst), 1)
  inst.faceDown = false
  inst.pos = 'atk'
  inst.hasAttacked = false
  inst.atkBonus = inst.atkBonus || 0
  inst.equippedUid = null
  p.emz = inst
  ev.push({ type: 'special', side, zoneKind: 'emz', index: 0, uid: inst.uid, cardId: inst.id, from: 'gy' })
  addLog(st, `${p.name} は ${CARDS[inst.id].name} をEXゾーンに蘇生！`, side === 0 ? 'p0' : 'p1')
  triggerSummonTraps(st, 1 - side, side, 'emz', 0, inst, ev)
}

/* ─────────────────────────── SPELLS ─────────────────────────── */

function resolveSpellEffect(st, side, inst, ev) {
  const c = CARDS[inst.id]
  if (!c.effect) return
  const foe = 1 - side
  const p = st.players[side]
  switch (c.effect.kind) {
    case 'draw':
      drawCards(st, side, c.effect.amount, ev)
      break
    case 'burn':
      damage(st, foe, c.effect.amount, ev)
      break
    case 'heal':
      heal(st, side, c.effect.amount, ev)
      break
    case 'destroy': {
      const target = strongestMonster(st, foe)
      if (target) {
        addLog(st, `${c.name} で ${CARDS[target.inst.id].name} を破壊`, side === 0 ? 'p0' : 'p1')
        destroyAt(st, foe, target.kind, target.index, ev)
      } else {
        addLog(st, `${c.name} は対象がいなかった`, side === 0 ? 'p0' : 'p1')
      }
      break
    }
    case 'revive': {
      const err = reviveMonster(st, side, ev)
      if (err) addLog(st, `${c.name} は不発に終わった（${err}）`, side === 0 ? 'p0' : 'p1')
      break
    }
    case 'field': {
      if (p.field) {
        p.gy.push(p.field)
        ev.push({ type: 'fieldLost', side, uid: p.field.uid, cardId: p.field.id })
      }
      p.field = inst
      inst.faceDown = false
      inst.setTurn = st.turn
      ev.push({ type: 'field', side, uid: inst.uid, cardId: inst.id })
      addLog(st, `${p.name} はフィールド魔法 ${c.name} を発動`, side === 0 ? 'p0' : 'p1')
      break
    }
    default:
      break
  }
}

function spellIsUsable(st, side, inst) {
  const c = CARDS[inst.id]
  const p = st.players[side]
  if (c.effect.kind === 'equip') return countMonsters(p) > 0 && firstFreeSpellZone(p) >= 0
  if (c.effect.kind === 'revive') return !p.emz && p.gy.some((g) => {
    const cd = CARDS[g.id]
    return cd.type === 'monster' && !cd.extra
  })
  return true
}

function activateSpellFromHand(st, side, handUid, spellZone, ev) {
  const p = st.players[side]
  const idx = p.hand.findIndex((c) => c.uid === handUid)
  if (idx < 0) return 'そのカードは手札にない'
  const inst = p.hand[idx]
  const c = CARDS[inst.id]
  if (c.type !== 'spell') return '魔法カードではない'
  if (!spellIsUsable(st, side, inst)) return '発動条件を満たしていない'

  p.hand.splice(idx, 1)
  if (c.effect.kind === 'equip') {
    if (spellZone < 0 || p.spells[spellZone]) return '魔法ゾーンが空いていない'
    const target = strongestMonster(st, side)
    if (!target) return '装備対象がいない'
    inst.faceDown = false
    inst.equippedUid = target.inst.uid
    inst.setTurn = st.turn
    p.spells[spellZone] = inst
    target.inst.atkBonus = (target.inst.atkBonus || 0) + c.effect.amount
    ev.push({ type: 'spell', side, cardId: inst.id, effect: 'equip', targetUid: target.inst.uid, atk: c.effect.amount })
    addLog(st, `${p.name} は ${c.name} を ${CARDS[target.inst.id].name} に装備（ATK+${c.effect.amount}）`, side === 0 ? 'p0' : 'p1')
    return null
  }

  if (c.effect.kind === 'field') {
    resolveSpellEffect(st, side, inst, ev)
    return null
  }

  ev.push({ type: 'spell', side, cardId: inst.id, effect: c.effect.kind })
  addLog(st, `${p.name} は魔法カード ${c.name} を発動`, side === 0 ? 'p0' : 'p1')
  resolveSpellEffect(st, side, inst, ev)
  p.gy.push(inst)
  return null
}

function activateSetSpell(st, side, zone, ev) {
  const p = st.players[side]
  const inst = p.spells[zone]
  if (!inst || !inst.faceDown) return 'セットされた魔法カードがない'
  if (inst.setTurn >= st.turn) return 'セットしたターンには発動できない'
  const c = CARDS[inst.id]
  if (c.type !== 'spell') return '魔法カードではない'
  if (!spellIsUsable(st, side, inst)) return '発動条件を満たしていない'

  if (c.effect.kind === 'equip') {
    const target = strongestMonster(st, side)
    if (!target) return '装備対象がいない'
    inst.faceDown = false
    inst.equippedUid = target.inst.uid
    target.inst.atkBonus = (target.inst.atkBonus || 0) + c.effect.amount
    ev.push({ type: 'spell', side, cardId: inst.id, effect: 'equip', targetUid: target.inst.uid, atk: c.effect.amount })
    addLog(st, `${p.name} はセットした ${c.name} を発動`, side === 0 ? 'p0' : 'p1')
    return null
  }

  p.spells[zone] = null
  inst.faceDown = false
  ev.push({ type: 'spell', side, cardId: inst.id, effect: c.effect.kind })
  addLog(st, `${p.name} はセットした ${c.name} を発動`, side === 0 ? 'p0' : 'p1')
  if (c.effect.kind === 'field') {
    resolveSpellEffect(st, side, inst, ev)
  } else {
    resolveSpellEffect(st, side, inst, ev)
    p.gy.push(inst)
  }
  return null
}

/* ─────────────────────────── ATTACKS ─────────────────────────── */

function resolveAttack(st, side, action, ev) {
  const p = st.players[side]
  const foe = 1 - side
  const o = st.players[foe]
  const attacker = zoneMonster(p, action.zoneKind, action.zoneIndex)
  if (!attacker) return '攻撃するモンスターがいない'
  if (attacker.faceDown || attacker.pos !== 'atk') return '攻撃表示のモンスターではない'
  if (attacker.hasAttacked) return 'そのモンスターは既に攻撃した'
  if (st.phase !== 'battle') return 'バトルフェイズではない'
  if (st.noAttacks) return 'このターンは攻撃できない'

  const direct = action.targetKind === 'direct'
  const oppHas = countMonsters(o) > 0
  const attackerCard = CARDS[attacker.id]
  if (direct) {
    if (oppHas && !attackerCard.direct) return '相手モンスターが存在する'
  } else {
    if (!oppHas) return '相手モンスターがいない（直接攻撃）'
    const target = zoneMonster(o, action.targetKind, action.targetIndex)
    if (!target) return '攻撃対象がいない'
  }

  attacker.hasAttacked = true
  const atk = atkOf(st, side, attacker)
  const from = { kind: action.zoneKind, index: action.zoneIndex, uid: attacker.uid, cardId: attacker.id, atk }
  if (direct) {
    ev.push({ type: 'attack', side, from, to: null, direct: true, atk, damage: atk })
    addLog(st, `${p.name} の ${attackerCard.name} が直接攻撃！（${atk}）`, side === 0 ? 'p0' : 'p1')
    const negated = triggerAttackTraps(st, foe, side, ev)
    if (!negated) damage(st, foe, atk, ev)
    return null
  }

  const target = zoneMonster(o, action.targetKind, action.targetIndex)
  const targetCard = CARDS[target.id]
  const wasFaceDown = target.faceDown
  const targetPos = target.faceDown ? 'def' : target.pos
  target.faceDown = false
  ev.push({
    type: 'attack', side, from,
    to: { kind: action.targetKind, index: action.targetIndex, uid: target.uid, cardId: target.id, faceDown: wasFaceDown },
    direct: false, atk, targetPos,
  })
  addLog(st, `${p.name} の ${attackerCard.name} が ${targetCard.name} に攻撃`, side === 0 ? 'p0' : 'p1')
  const negated = triggerAttackTraps(st, foe, side, ev)
  if (negated) return null

  if (targetPos === 'def') {
    const def = defOf(st, foe, target)
    if (atk > def) {
      destroyAt(st, foe, action.targetKind, action.targetIndex, ev)
    } else if (atk < def) {
      damage(st, side, def - atk, ev)
    } else {
      addLog(st, '攻撃は弾かれた', 'system')
    }
  } else {
    const targetAtk = atkOf(st, foe, target)
    if (atk > targetAtk) {
      destroyAt(st, foe, action.targetKind, action.targetIndex, ev)
    } else if (atk < targetAtk) {
      damage(st, side, targetAtk - atk, ev)
      destroyAt(st, side, action.zoneKind, action.zoneIndex, ev)
    } else {
      destroyAt(st, foe, action.targetKind, action.targetIndex, ev)
      destroyAt(st, side, action.zoneKind, action.zoneIndex, ev)
      addLog(st, '相打ち！ 双方のモンスターが消滅', 'system')
    }
  }
  return null
}

/* ─────────────────────────── MAIN ENTRY ─────────────────────────── */

export function applyAction(st, side, action) {
  const ev = []
  if (!st || st.winner != null) return { ok: false, error: 'デュエルは終了している', events: ev }
  if (!action || !action.type) return { ok: false, error: '不正な操作', events: ev }
  if (action.type === 'surrender') {
    endDuel(st, 1 - side, '降参', ev)
    st.rev = (st.rev || 0) + 1
    return { ok: true, events: ev }
  }
  if (side !== st.active) return { ok: false, error: '相手のターン中です', events: ev }
  const p = st.players[side]
  const o = st.players[1 - side]
  let error = null

  switch (action.type) {
    case 'summon':
      if (st.phase !== 'main') { error = 'メインフェイズではない'; break }
      error = summonMonster(st, side, action.handUid, Number(action.zone), false, ev)
      break
    case 'setMonster':
      if (st.phase !== 'main') { error = 'メインフェイズではない'; break }
      error = summonMonster(st, side, action.handUid, Number(action.zone), true, ev)
      break
    case 'activateSpell': {
      if (st.phase !== 'main') { error = 'メインフェイズではない'; break }
      error = activateSpellFromHand(st, side, action.handUid, Number(action.zone ?? firstFreeSpellZone(p)), ev)
      break
    }
    case 'setSpell': {
      if (st.phase !== 'main') { error = 'メインフェイズではない'; break }
      const idx = p.hand.findIndex((c) => c.uid === action.handUid)
      if (idx < 0) { error = 'そのカードは手札にない'; break }
      const card = CARDS[p.hand[idx].id]
      if (card.type !== 'spell' && card.type !== 'trap') { error = '魔法・罠カードではない'; break }
      const zone = Number(action.zone)
      if (zone < 0 || zone >= ZONES || p.spells[zone]) { error = '魔法・罠ゾーンが空いていない'; break }
      if (!p.spells.some((s) => !s)) { error = '魔法・罠ゾーンが空いていない'; break }
      const inst = p.hand.splice(idx, 1)[0]
      inst.faceDown = true
      inst.setTurn = st.turn
      p.spells[zone] = inst
      ev.push({ type: 'setSpell', side, zone, uid: inst.uid, cardId: inst.id, cardType: card.type })
      addLog(st, `${p.name} は ${card.name} をセット`, side === 0 ? 'p0' : 'p1')
      break
    }
    case 'activateSet': {
      if (st.phase !== 'main') { error = 'メインフェイズではない'; break }
      error = activateSetSpell(st, side, Number(action.zone), ev)
      break
    }
    case 'specialSummon': {
      if (st.phase !== 'main') { error = 'メインフェイズではない'; break }
      error = specialSummonExtra(st, side, action.cardId, ev)
      break
    }
    case 'toBattle': {
      if (st.phase !== 'main') { error = '既にバトルフェイズ'; break }
      st.phase = 'battle'
      ev.push({ type: 'phase', phase: 'battle', side })
      addLog(st, `${p.name} はバトルフェイズに移行`, side === 0 ? 'p0' : 'p1')
      triggerBattleTraps(st, 1 - side, ev)
      break
    }
    case 'attack': {
      if (st.phase !== 'battle') { error = 'バトルフェイズではない'; break }
      error = resolveAttack(st, side, action, ev)
      break
    }
    case 'endTurn': {
      if (st.winner != null) break
      p.hasSummoned = false
      o.hasSummoned = false
      p.extraUsed = false
      o.extraUsed = false
      st.active = 1 - side
      st.turn++
      st.phase = 'main'
      st.noAttacks = false
      st.players.forEach((pl) => {
        pl.monsters.forEach((m) => { if (m) m.hasAttacked = false })
        if (pl.emz) pl.emz.hasAttacked = false
      })
      ev.push({ type: 'turn', side: st.active, turn: st.turn })
      addLog(st, `── TURN ${st.turn} · ${st.players[st.active].name} ──`, 'system')
      drawCards(st, st.active, 1, ev)
      break
    }
    case 'surrender': {
      endDuel(st, 1 - side, '降参', ev)
      break
    }
    default:
      error = '不明な操作'
  }

  if (error) return { ok: false, error, events: [] }
  st.rev = (st.rev || 0) + 1
  return { ok: true, events: ev }
}

/* ─────────────────────────── CPU DUELIST ─────────────────────────── */

const effectKind = (inst) => (CARDS[inst.id].effect && CARDS[inst.id].effect.kind) || ''

export function aiChooseAction(st, side = 1) {
  if (!st || st.winner != null || st.active !== side) return null
  const p = st.players[side]
  const o = st.players[1 - side]
  const hand = p.hand
  const spells = hand.filter((c) => CARDS[c.id].type === 'spell')
  const traps = hand.filter((c) => CARDS[c.id].type === 'trap')
  const monsters = hand.filter((c) => CARDS[c.id].type === 'monster')
  const myCount = countMonsters(p)
  const oppCount = countMonsters(o)
  const oppBest = strongestMonster(st, 1 - side)
  const myBest = strongestMonster(st, side)

  if (st.phase === 'main') {
    /* field spell */
    if (!p.field) {
      const field = spells.find((c) => effectKind(c) === 'field')
      if (field) return { type: 'activateSpell', handUid: field.uid }
    }

    /* draw power */
    const drawSpell = spells.find((c) => effectKind(c) === 'draw')
    if (drawSpell && p.deck.length >= 2) return { type: 'activateSpell', handUid: drawSpell.uid }

    /* lethal burn */
    const burns = spells.filter((c) => effectKind(c) === 'burn')
    if (burns.length) {
      const sorted = burns.sort((a, b) => CARDS[b.id].effect.amount - CARDS[a.id].effect.amount)
      if (CARDS[sorted[0].id].effect.amount >= o.lp) {
        return { type: 'activateSpell', handUid: sorted[0].uid }
      }
    }

    /* destroy a threat */
    if (oppBest && oppBest.atk >= 2000) {
      const removal = spells.find((c) => effectKind(c) === 'destroy')
      if (removal) return { type: 'activateSpell', handUid: removal.uid }
    }

    /* heal when low */
    if (p.lp <= 2800) {
      const healSpell = spells.find((c) => effectKind(c) === 'heal')
      if (healSpell) return { type: 'activateSpell', handUid: healSpell.uid }
    }

    /* burn when it matters or the hand is clogged */
    if (burns.length && (o.lp <= 3000 || hand.length >= 6)) {
      const best = burns.sort((a, b) => CARDS[b.id].effect.amount - CARDS[a.id].effect.amount)[0]
      if (myCount > 0 || o.lp <= 3000) return { type: 'activateSpell', handUid: best.uid }
    }

    /* revive a fallen boss */
    if (!p.emz && p.gy.some((g) => CARDS[g.id].type === 'monster' && !CARDS[g.id].extra)) {
      const revive = spells.find((c) => effectKind(c) === 'revive')
      if (revive) return { type: 'activateSpell', handUid: revive.uid }
    }

    /* equip the biggest body */
    if (myBest && firstFreeSpellZone(p) >= 0) {
      const equip = spells.find((c) => effectKind(c) === 'equip')
      if (equip) return { type: 'activateSpell', handUid: equip.uid }
    }

    /* normal summon / set */
    const freeMonster = firstFreeMonsterZone(p)
    if (!p.hasSummoned && freeMonster >= 0 && monsters.length) {
      const byAtk = monsters.slice().sort((a, b) => CARDS[b.id].atk - CARDS[a.id].atk)
      const best = byAtk[0]
      const bestAtk = CARDS[best.id].atk
      if (myCount === 0 && oppBest && bestAtk < oppBest.atk && bestAtk < 1800) {
        const byDef = monsters.slice().sort((a, b) => CARDS[b.id].def - CARDS[a.id].def)
        const setter = byDef[0]
        return { type: 'setMonster', handUid: setter.uid, zone: freeMonster }
      }
      return { type: 'summon', handUid: best.uid, zone: freeMonster }
    }

    /* extra deck */
    if (myCount >= 2 && !p.emz && !p.extraUsed && p.extra.length) {
      const bestExtra = p.extra.slice().sort((a, b) => CARDS[b].atk - CARDS[a].atk)[0]
      return { type: 'specialSummon', cardId: bestExtra }
    }

    /* set traps, max two face-down */
    const setTraps = p.spells.filter((s) => s && CARDS[s.id].type === 'trap').length
    if (setTraps < 2 && traps.length && firstFreeSpellZone(p) >= 0) {
      return { type: 'setSpell', handUid: traps[0].uid, zone: firstFreeSpellZone(p) }
    }

    /* battle */
    if (attackersOf(st, side).length) return { type: 'toBattle' }
    return { type: 'endTurn' }
  }

  if (st.phase === 'battle') {
    if (st.noAttacks) return { type: 'endTurn' }
    const attackers = attackersOf(st, side)
    if (!attackers.length) return { type: 'endTurn' }
    attackers.sort((a, b) => atkOf(st, side, b.inst) - atkOf(st, side, a.inst))

    const enemies = []
    o.monsters.forEach((inst, index) => {
      if (inst) enemies.push({ kind: 'monster', index, inst })
    })
    if (o.emz) enemies.push({ kind: 'emz', index: 0, inst: o.emz })

    for (const at of attackers) {
      const aAtk = atkOf(st, side, at.inst)
      const card = CARDS[at.inst.id]
      if (!enemies.length) {
        return { type: 'attack', zoneKind: at.kind, zoneIndex: at.index, targetKind: 'direct', targetIndex: 0 }
      }
      const beatable = enemies
        .map((e) => {
          const eAtk = atkOf(st, 1 - side, e.inst)
          const eDef = defOf(st, 1 - side, e.inst)
          const defense = e.inst.faceDown || e.inst.pos === 'def'
          return { ...e, eAtk, eDef, defense }
        })
        .filter((e) => (e.defense ? aAtk > e.eDef : aAtk > e.eAtk))
        .sort((a, b) => (b.defense ? b.eDef : b.eAtk) - (a.defense ? a.eDef : a.eAtk))

      if (beatable.length) {
        const target = beatable[0]
        return {
          type: 'attack', zoneKind: at.kind, zoneIndex: at.index,
          targetKind: target.kind, targetIndex: target.index,
        }
      }
      if (card.direct) {
        return { type: 'attack', zoneKind: at.kind, zoneIndex: at.index, targetKind: 'direct', targetIndex: 0 }
      }
    }
    return { type: 'endTurn' }
  }
  return null
}

/* ─────────────────────────── UI HELPERS ─────────────────────────── */

export function canSpecialSummon(st, side) {
  const p = st.players[side]
  return countMonsters(p) >= 2 && !p.emz && !p.extraUsed && p.extra.length > 0
}

export function spellUsable(st, side, inst) {
  return spellIsUsable(st, side, inst)
}

export function canActivateSet(st, side, zone) {
  const p = st.players[side]
  const inst = p.spells[zone]
  if (!inst || !inst.faceDown) return false
  if (CARDS[inst.id].type !== 'spell') return false
  if (inst.setTurn >= st.turn) return false
  return spellIsUsable(st, side, inst)
}
