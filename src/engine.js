// DUEL 24 — Yu-Gi-Oh!-style deterministic duel engine.
// Pure actions: every exported action clones the incoming state and returns
// { state, events }. The UI animates the events, then adopts the new state.
//
// Field layout (12 zones per side / 24 total):
//   0-4   MONSTER  M1-M5
//   5-9   SPELL/TRAP S1-S5
//   10    EXTRA MONSTER
//   11    FIELD SPELL
// There is no cost and no HP. Monsters have ATK / DEF and levels.

import { CARD_TYPES } from './cards.js';

export const MONSTER_ZONES = 5;
export const ST_ZONES = 5;
export const EXTRA_ZONE = 10;
export const FIELD_ZONE = 11;
export const ZONES_PER_SIDE = 12;
export const TOTAL_ZONES = ZONES_PER_SIDE * 2; // 24
export const START_LP = 8000;
export const HAND_LIMIT = 6;
export const MAX_LOG = 100;

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

export const otherSide = side => (side === 'player' ? 'enemy' : 'player');

export const isMonsterSlot = zone => (zone >= 0 && zone < MONSTER_ZONES) || zone === EXTRA_ZONE;
export const isSTSlot = zone => zone >= MONSTER_ZONES && zone < MONSTER_ZONES + ST_ZONES;
export const isFieldSlot = zone => zone === FIELD_ZONE;
export const isMonsterZone = zone => isMonsterSlot(zone);

export function zoneKind(zone) {
  if (zone >= 0 && zone < MONSTER_ZONES) return 'monster';
  if (zone >= MONSTER_ZONES && zone < MONSTER_ZONES + ST_ZONES) return 'spell';
  if (zone === EXTRA_ZONE) return 'extra';
  if (zone === FIELD_ZONE) return 'field';
  return 'unknown';
}

export function zoneLabel(zone) {
  if (zone >= 0 && zone < MONSTER_ZONES) return `M${zone + 1}`;
  if (zone >= MONSTER_ZONES && zone < MONSTER_ZONES + ST_ZONES) return `S${zone - MONSTER_ZONES + 1}`;
  if (zone === EXTRA_ZONE) return 'EX';
  if (zone === FIELD_ZONE) return 'FIELD';
  return '—';
}

export function zoneName(zone) {
  const kind = zoneKind(zone);
  if (kind === 'monster') return `モンスターゾーン ${zone + 1}`;
  if (kind === 'spell') return `魔法・罠ゾーン ${zone - MONSTER_ZONES + 1}`;
  if (kind === 'extra') return 'エクストラモンスターゾーン';
  if (kind === 'field') return 'フィールド魔法ゾーン';
  return '不明なゾーン';
}

export const zoneNumber = (side, zone) => (side === 'enemy' ? zone + 1 : zone + 13);

export const normalSummonTributes = level => (level >= 7 ? 2 : level >= 5 ? 1 : 0);

function cloneState(state) {
  return structuredClone(state);
}

function nextRandom(state) {
  let t = state.rngState >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  state.rngState = t;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

function shuffled(state, values) {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeCard(state, type) {
  return {
    uid: state.nextUid++,
    typeId: type.id,
    name: type.name,
    en: type.en,
    kind: type.kind,
    level: type.level,
    atk: type.atk,
    def: type.def,
    rarity: type.rarity,
    element: type.element,
    race: type.race,
    ability: type.ability ? { ...type.ability } : null,
    text: type.text,
    position: type.kind === 'monster' ? 'attack' : null,
    faceDown: false,
    hasAttacked: false,
    hasChangedPosition: false,
    summonedTurn: 0,
  };
}

function buildDeck(state) {
  const cards = [];
  for (const type of CARD_TYPES) {
    cards.push(makeCard(state, type));
    cards.push(makeCard(state, type));
  }
  return shuffled(state, cards);
}

function log(state, text, kind = 'info') {
  state.log.push({
    id: state.log.length ? state.log[state.log.length - 1].id + 1 : 1,
    turn: state.turnNumber,
    text,
    kind,
  });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

function emit(state, event) {
  state.events.push(event);
  return event;
}

export function monsterZones(sideState) {
  return [0, 1, 2, 3, 4, EXTRA_ZONE].filter(zone => sideState.field[zone]);
}

export function stZones(sideState) {
  return [5, 6, 7, 8, 9].filter(zone => sideState.field[zone]);
}

export function emptyMonsterZones(sideState) {
  return [0, 1, 2, 3, 4, EXTRA_ZONE].filter(zone => !sideState.field[zone]);
}

export function emptySTZones(sideState) {
  return [5, 6, 7, 8, 9].filter(zone => !sideState.field[zone]);
}

export function statsOf(state, side, card) {
  if (!card || card.kind !== 'monster') return { atk: 0, def: 0 };
  const fieldCard = state.sides[side].field[FIELD_ZONE];
  const bonus = fieldCard && !fieldCard.faceDown && fieldCard.ability?.type === 'field'
    ? fieldCard.ability.value
    : 0;
  return { atk: card.atk + bonus, def: card.def + bonus };
}

export function fieldBonus(state, side) {
  const fieldCard = state.sides[side].field[FIELD_ZONE];
  return fieldCard && !fieldCard.faceDown && fieldCard.ability?.type === 'field'
    ? fieldCard.ability.value
    : 0;
}

function checkWin(state) {
  if (state.phase === 'over') return state.winner;
  const p = state.sides.player.lp;
  const e = state.sides.enemy.lp;
  if (p <= 0 || e <= 0) {
    state.phase = 'over';
    state.winner = p <= 0 && e <= 0 ? 'draw' : p <= 0 ? 'enemy' : 'player';
    state.reason = 'lp';
    emit(state, { type: 'gameover', winner: state.winner, reason: 'lp' });
    log(state, state.winner === 'draw' ? '両者LPゼロ — DRAW' : `${state.sides[state.winner].name} の勝利 — LP ZERO`, 'finish');
  }
  return state.winner;
}

function loseByDeckOut(state, side) {
  if (state.phase === 'over') return;
  const winner = otherSide(side);
  state.phase = 'over';
  state.winner = winner;
  state.reason = 'deckout';
  emit(state, { type: 'deckout', side, winner });
  emit(state, { type: 'gameover', winner, reason: 'deckout' });
  log(state, `${state.sides[side].name} はデッキ切れ — ${state.sides[winner].name} の勝利`, 'finish');
}

function drawCards(state, side, count) {
  const s = state.sides[side];
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    if (state.phase === 'over') break;
    if (!s.deck.length) {
      loseByDeckOut(state, side);
      break;
    }
    const card = s.deck.shift();
    s.hand.push(card);
    drawn.push(card);
    emit(state, { type: 'draw', side, card });
  }
  return drawn;
}

function beginTurn(state, side, { initial = false } = {}) {
  const s = state.sides[side];
  state.turn = side;
  if (!initial) state.turnNumber += 1;
  state.battlePhase = false;
  s.normalSummoned = false;
  for (const card of s.field) {
    if (!card || card.kind !== 'monster') continue;
    card.hasAttacked = false;
    card.hasChangedPosition = false;
  }
  emit(state, { type: 'turn', side, turnNumber: state.turnNumber });
  if (!initial) drawCards(state, side, 1);
  if (state.phase === 'playing') {
    log(state, `${s.name} のターン — MAIN PHASE`, 'turn');
  }
}

export function createGame({
  seed = Date.now(),
  playerName = 'YOU',
  enemyName = 'KAI',
  playerRank = 'SILVER III',
  enemyRank = 'GOLD II',
  first = 'player',
} = {}) {
  const state = {
    seed: seed >>> 0,
    rngState: seed >>> 0,
    nextUid: 1,
    turn: first,
    turnNumber: 1,
    phase: 'playing',
    battlePhase: false,
    winner: null,
    reason: null,
    events: [],
    log: [],
    sides: {},
  };

  for (const side of ['player', 'enemy']) {
    state.sides[side] = {
      id: side,
      name: side === 'player' ? playerName : enemyName,
      rank: side === 'player' ? playerRank : enemyRank,
      lp: START_LP,
      maxLp: START_LP,
      hand: [],
      deck: buildDeck(state),
      field: Array(ZONES_PER_SIDE).fill(null),
      graveyard: [],
      banished: [],
      normalSummoned: false,
      stats: { dealt: 0, taken: 0, kills: 0, cardsPlayed: 0, attacks: 0, summons: 0, tributes: 0 },
    };
  }

  for (const side of ['player', 'enemy']) drawCards(state, side, 5);
  beginTurn(state, first, { initial: true });
  log(state, `DUEL START — ${state.sides[first].name} が先攻 / 24 ZONES / LP ${START_LP}`, 'system');
  state.events = [];
  return state;
}

export function assertTurn(state, side) {
  if (state.phase !== 'playing') throw new GameError('デュエルは終了しています');
  if (state.turn !== side) throw new GameError(side === 'player' ? '相手のターンです' : '自分のターンではありません');
}

export function canNormalSummon(state, side, card) {
  if (!card || card.kind !== 'monster') return false;
  const s = state.sides[side];
  if (s.normalSummoned) return false;
  const required = normalSummonTributes(card.level);
  if (!emptyMonsterZones(s).length) return false;
  if (monsterZones(s).length < required) return false;
  return true;
}

export function playableZones(state, side, card) {
  if (!card) return [];
  const s = state.sides[side];
  if (card.kind === 'monster') return canNormalSummon(state, side, card) ? emptyMonsterZones(s) : [];
  if (card.kind === 'field') return s.field[FIELD_ZONE] ? [] : [FIELD_ZONE];
  return emptySTZones(s);
}

function destroyMonster(state, side, zone, reason = 'battle') {
  const s = state.sides[side];
  const card = s.field[zone];
  if (!card) return null;
  s.field[zone] = null;
  s.graveyard.push(card);
  emit(state, { type: 'destroy', side, zone, card, reason });
  log(state, `${card.name} は破壊された`, 'danger');
  return card;
}

function destroySpellTrap(state, side, zone, reason = 'effect') {
  const s = state.sides[side];
  const card = s.field[zone];
  if (!card) return null;
  s.field[zone] = null;
  s.graveyard.push(card);
  emit(state, { type: 'destroy-spell', side, zone, card, reason });
  log(state, `${card.name} は破壊された`, 'danger');
  return card;
}

function damageLp(state, side, amount, sourceSide, kind = 'battle') {
  const s = state.sides[side];
  const value = Math.max(0, amount);
  s.lp = Math.max(0, s.lp - value);
  const source = state.sides[sourceSide];
  if (source) {
    source.stats.dealt += value;
    s.stats.taken += value;
  }
  emit(state, { type: 'damage', side, amount: value, lpAfter: s.lp, sourceSide, kind });
  return value;
}

function applyOnSummon(state, side, zone, card) {
  const ability = card.ability;
  if (!ability) return;
  const s = state.sides[side];
  const foeSide = otherSide(side);
  const foe = state.sides[foeSide];

  if (ability.type === 'burn') {
    damageLp(state, foeSide, ability.value, side, 'effect');
    emit(state, { type: 'burn', side, targetSide: foeSide, zone, amount: ability.value, lpAfter: foe.lp, card });
    log(state, `${card.name} の効果 — 相手に ${ability.value} ダメージ`, 'damage');
  }

  if (ability.type === 'heal') {
    const before = s.lp;
    s.lp = Math.min(s.maxLp, s.lp + ability.value);
    const amount = s.lp - before;
    emit(state, { type: 'heal', side, amount, lpAfter: s.lp, zone, card });
    log(state, `${card.name} の効果 — LPを ${amount} 回復`, 'heal');
  }

  if (ability.type === 'destroy') {
    const targets = monsterZones(foe);
    if (targets.length) {
      targets.sort((a, b) => statsOf(state, foeSide, foe.field[b]).atk - statsOf(state, foeSide, foe.field[a]).atk);
      const targetZone = targets[0];
      const target = foe.field[targetZone];
      emit(state, { type: 'effect-destroy', side, targetSide: foeSide, zone, targetZone, card, target });
      destroyMonster(state, foeSide, targetZone, 'effect');
      s.stats.kills += 1;
    }
  }

  if (ability.type === 'draw') {
    drawCards(state, side, ability.value || 1);
  }

  checkWin(state);
}

function resolveSpell(state, side, zone, card) {
  const ability = card.ability;
  const s = state.sides[side];
  const foeSide = otherSide(side);
  const foe = state.sides[foeSide];

  if (!ability) return;
  if (ability.type === 'draw') {
    drawCards(state, side, ability.value || 1);
    log(state, `${card.name} — ${ability.value || 1}枚ドロー`, 'draw');
  }

  if (ability.type === 'storm') {
    for (const targetSide of ['player', 'enemy']) {
      const target = state.sides[targetSide];
      for (const targetZone of [...stZones(target), ...(target.field[FIELD_ZONE] ? [FIELD_ZONE] : [])]) {
        destroySpellTrap(state, targetSide, targetZone, 'storm');
      }
    }
    log(state, `${card.name} — 魔法・罠・フィールドをすべて破壊`, 'danger');
  }

  if (ability.type === 'field') {
    log(state, `${card.name} — フィールド魔法が展開された`, 'summon');
  }

  // Normal spells go to the graveyard after resolution. Field spells stay.
  if (card.kind === 'spell' && s.field[zone] === card) {
    s.field[zone] = null;
    s.graveyard.push(card);
    emit(state, { type: 'resolve-spell', side, zone, card });
  }
}

export function playCard(game, side, handUid, zone, options = {}) {
  const state = cloneState(game);
  state.events = [];
  assertTurn(state, side);
  if (state.battlePhase) throw new GameError('バトルフェイズ中は召喚・発動できません');
  const s = state.sides[side];
  const index = s.hand.findIndex(card => card.uid === handUid);
  if (index < 0) throw new GameError('そのカードは手札にありません');
  const card = s.hand[index];
  if (!Number.isInteger(zone) || zone < 0 || zone >= ZONES_PER_SIDE) throw new GameError('ゾーンが不正です');

  if (card.kind === 'monster') {
    if (!canNormalSummon(state, side, card)) throw new GameError('このターンは通常召喚できません');
    if (!isMonsterSlot(zone)) throw new GameError('モンスターはモンスターゾーンにしか置けません');
    if (s.field[zone]) throw new GameError('そのゾーンは埋まっています');
    const required = normalSummonTributes(card.level);
    const tributes = Array.isArray(options.tributes) ? [...new Set(options.tributes)] : [];
    if (tributes.length !== required) throw new GameError(`生贄が${required}体必要です`);
    for (const tributeZone of tributes) {
      if (!isMonsterSlot(tributeZone) || tributeZone === zone || !s.field[tributeZone]) {
        throw new GameError('生贄の選択が不正です');
      }
    }
    for (const tributeZone of tributes) {
      const tribute = s.field[tributeZone];
      s.field[tributeZone] = null;
      s.graveyard.push(tribute);
      emit(state, { type: 'tribute', side, zone: tributeZone, card: tribute });
      log(state, `${tribute.name} を生贄に捧げた`, 'tribute');
    }
    s.hand.splice(index, 1);
    const set = Boolean(options.set);
    const instance = {
      ...card,
      position: set ? 'defense' : 'attack',
      faceDown: set,
      hasAttacked: false,
      hasChangedPosition: set,
      summonedTurn: state.turnNumber,
    };
    s.field[zone] = instance;
    s.normalSummoned = true;
    s.stats.cardsPlayed += 1;
    s.stats.summons += 1;
    s.stats.tributes += required;
    emit(state, {
      type: set ? 'set' : 'summon',
      side,
      zone,
      card: instance,
      tributes: tributes.length,
    });
    log(state, `${s.name} — ${card.name} を${set ? 'セット' : '召喚'}（${zoneLabel(zone)}）`, 'summon');
    if (!set) applyOnSummon(state, side, zone, instance);
    checkWin(state);
    return { state, events: state.events };
  }

  if (card.kind === 'field') {
    if (zone !== FIELD_ZONE) throw new GameError('フィールド魔法はフィールドゾーンへ');
    if (s.field[FIELD_ZONE]) throw new GameError('フィールド魔法ゾーンは埋まっています');
    s.hand.splice(index, 1);
    s.field[zone] = { ...card, faceDown: false };
    s.stats.cardsPlayed += 1;
    emit(state, { type: 'activate', side, zone, card: s.field[zone], kind: 'field' });
    resolveSpell(state, side, zone, s.field[zone]);
    log(state, `${s.name} — フィールド魔法 ${card.name} を発動`, 'summon');
    checkWin(state);
    return { state, events: state.events };
  }

  if (card.kind === 'trap') {
    if (!isSTSlot(zone)) throw new GameError('罠は魔法・罠ゾーンへセットします');
    if (s.field[zone]) throw new GameError('そのゾーンは埋まっています');
    s.hand.splice(index, 1);
    s.field[zone] = { ...card, faceDown: true };
    s.stats.cardsPlayed += 1;
    emit(state, { type: 'set', side, zone, card: s.field[zone], trap: true });
    log(state, `${s.name} — 罠カードをセット`, 'set');
    checkWin(state);
    return { state, events: state.events };
  }

  // Spell.
  if (!isSTSlot(zone)) throw new GameError('魔法カードは魔法・罠ゾーンへ');
  if (s.field[zone]) throw new GameError('そのゾーンは埋まっています');
  s.hand.splice(index, 1);
  s.stats.cardsPlayed += 1;
  if (options.set) {
    s.field[zone] = { ...card, faceDown: true };
    emit(state, { type: 'set', side, zone, card: s.field[zone], trap: false });
    log(state, `${s.name} — 魔法カードをセット`, 'set');
  } else {
    s.field[zone] = { ...card, faceDown: false };
    emit(state, { type: 'activate', side, zone, card: s.field[zone], kind: 'spell' });
    log(state, `${s.name} — 魔法 ${card.name} を発動`, 'summon');
    resolveSpell(state, side, zone, s.field[zone]);
  }
  checkWin(state);
  return { state, events: state.events };
}

export function activateSet(game, side, zone) {
  const state = cloneState(game);
  state.events = [];
  assertTurn(state, side);
  if (state.battlePhase) throw new GameError('バトルフェイズ中は発動できません');
  const s = state.sides[side];
  const card = s.field[zone];
  if (!card) throw new GameError('そのゾーンにカードがありません');
  if (!isSTSlot(zone)) throw new GameError('魔法・罠ゾーンのカードではありません');
  if (!card.faceDown) throw new GameError('セットされたカードではありません');
  if (card.kind === 'trap') throw new GameError('罠カードは相手の攻撃時に自動発動します');
  card.faceDown = false;
  emit(state, { type: 'activate', side, zone, card, kind: 'spell' });
  log(state, `${s.name} — セットした魔法 ${card.name} を発動`, 'summon');
  resolveSpell(state, side, zone, card);
  checkWin(state);
  return { state, events: state.events };
}

export function changePosition(game, side, zone) {
  const state = cloneState(game);
  state.events = [];
  assertTurn(state, side);
  if (state.battlePhase) throw new GameError('表示形式の変更はメインフェイズのみです');
  const s = state.sides[side];
  const card = s.field[zone];
  if (!card || card.kind !== 'monster') throw new GameError('そのゾーンにモンスターがいません');
  if (card.summonedTurn === state.turnNumber) throw new GameError('召喚・セットしたターンは表示形式を変更できません');
  if (card.hasAttacked) throw new GameError('攻撃したモンスターは表示形式を変更できません');

  if (card.faceDown) {
    card.faceDown = false;
    card.position = 'defense';
    card.hasChangedPosition = true;
    emit(state, { type: 'position', side, zone, card, position: 'defense', flip: true });
    log(state, `${card.name} をリバース（守備表示）`, 'position');
    return { state, events: state.events };
  }

  if (card.hasChangedPosition) throw new GameError('このモンスターはこのターン表示形式を変更済みです');
  card.position = card.position === 'attack' ? 'defense' : 'attack';
  card.hasChangedPosition = true;
  emit(state, { type: 'position', side, zone, card, position: card.position, flip: false });
  log(state, `${card.name} を${card.position === 'attack' ? '攻撃' : '守備'}表示に変更`, 'position');
  return { state, events: state.events };
}

export function enterBattlePhase(game, side) {
  const state = cloneState(game);
  state.events = [];
  assertTurn(state, side);
  if (state.battlePhase) throw new GameError('すでにバトルフェイズです');
  state.battlePhase = true;
  emit(state, { type: 'battle', side });
  log(state, `${state.sides[side].name} — BATTLE PHASE`, 'turn');
  return { state, events: state.events };
}

export function attackTargets(state, side, fromZone) {
  const s = state.sides[side];
  const card = s.field[fromZone];
  if (!state.battlePhase || !card || card.kind !== 'monster' || card.position !== 'attack' || card.faceDown || card.hasAttacked) {
    return [];
  }
  const foe = state.sides[otherSide(side)];
  const targets = monsterZones(foe);
  return targets.length ? targets : [null];
}

export function attackInfo(state, side, fromZone) {
  const s = state.sides[side];
  const card = s.field[fromZone];
  if (!card || card.kind !== 'monster') return null;
  const stats = statsOf(state, side, card);
  const targets = attackTargets(state, side, fromZone);
  const direct = targets.length === 1 && targets[0] === null;
  return {
    card,
    stats,
    targets,
    direct,
    canAttack: Boolean(state.battlePhase && card.position === 'attack' && !card.faceDown && !card.hasAttacked),
    lpDamage: direct ? stats.atk : 0,
  };
}

function activateTrap(state, side, zone, card, attackerSide, attackerZone) {
  const s = state.sides[side];
  const attacker = state.sides[attackerSide].field[attackerZone];
  const ability = card.ability;
  if (!ability) return false;
  card.faceDown = false;
  emit(state, { type: 'trap', side, zone, card, attackerSide, attackerZone });
  log(state, `${s.name} — 罠発動 ${card.name}`, 'trap');

  if (ability.type === 'mirror') {
    const victims = monsterZones(state.sides[attackerSide]).filter(zoneId => {
      const monster = state.sides[attackerSide].field[zoneId];
      return monster && monster.position === 'attack' && !monster.faceDown;
    });
    for (const victimZone of victims) {
      destroyMonster(state, attackerSide, victimZone, 'mirror');
    }
    log(state, `ミラーフォース — 攻撃表示モンスター${victims.length}体を破壊`, 'danger');
  }

  if (ability.type === 'cylinder' && attacker) {
    const amount = statsOf(state, attackerSide, attacker).atk;
    damageLp(state, attackerSide, amount, side, 'effect');
    emit(state, { type: 'burn', side, targetSide: attackerSide, zone, amount, lpAfter: state.sides[attackerSide].lp, card });
    log(state, `魔法の筒 — 攻撃を無効にし ${amount} ダメージ`, 'danger');
  }

  s.field[zone] = null;
  s.graveyard.push(card);
  emit(state, { type: 'resolve-trap', side, zone, card });
  return true;
}

function tryDefenderTrap(state, defenderSide, attackerSide, attackerZone) {
  const defender = state.sides[defenderSide];
  for (const zone of stZones(defender)) {
    const card = defender.field[zone];
    if (card && card.kind === 'trap' && card.faceDown) {
      return activateTrap(state, defenderSide, zone, card, attackerSide, attackerZone);
    }
  }
  return false;
}

export function attack(game, side, fromZone, targetZone = null) {
  const state = cloneState(game);
  state.events = [];
  assertTurn(state, side);
  if (!state.battlePhase) throw new GameError('バトルフェイズではありません');
  const s = state.sides[side];
  const foeSide = otherSide(side);
  const foe = state.sides[foeSide];
  const attacker = s.field[fromZone];
  if (!attacker || attacker.kind !== 'monster') throw new GameError('そのゾーンにモンスターがいません');
  if (attacker.faceDown || attacker.position !== 'attack') throw new GameError('攻撃表示のモンスターしか攻撃できません');
  if (attacker.hasAttacked) throw new GameError('このモンスターはこのターンすでに攻撃しました');

  const foeMonsters = monsterZones(foe);
  if (targetZone === null) {
    if (foeMonsters.length) throw new GameError('相手モンスターを攻撃対象に選んでください');
  } else {
    if (!isMonsterSlot(targetZone) || !foe.field[targetZone]) throw new GameError('攻撃対象が不正です');
  }

  attacker.hasAttacked = true;
  s.stats.attacks += 1;
  const attackerStats = statsOf(state, side, attacker);

  if (targetZone === null) {
    damageLp(state, foeSide, attackerStats.atk, side, 'battle');
    emit(state, {
      type: 'attack',
      side,
      from: fromZone,
      targetZone: null,
      target: null,
      damage: attackerStats.atk,
      lpDamage: attackerStats.atk,
      lpAfter: foe.lp,
      card: attacker,
      stats: attackerStats,
    });
    emit(state, { type: 'direct', side, from: fromZone, damage: attackerStats.atk, lpAfter: foe.lp, card: attacker });
    log(state, `${attacker.name} の直接攻撃 — ${attackerStats.atk} ダメージ`, 'damage');
    checkWin(state);
    return { state, events: state.events };
  }

  // Defender's set trap responds before damage calculation.
  if (tryDefenderTrap(state, foeSide, side, fromZone)) {
    checkWin(state);
    return { state, events: state.events };
  }

  const target = foe.field[targetZone];
  if (target.faceDown) {
    target.faceDown = false;
    emit(state, { type: 'flip', side: foeSide, zone: targetZone, card: target });
    log(state, `${target.name} をリバース`, 'position');
  }

  const targetStats = statsOf(state, foeSide, target);
  const attackEvent = emit(state, {
    type: 'attack',
    side,
    from: fromZone,
    targetZone,
    target,
    damage: attackerStats.atk,
    targetStats,
    lpDamage: 0,
    lpAfter: foe.lp,
    card: attacker,
    stats: attackerStats,
  });

  if (target.position === 'attack') {
    if (attackerStats.atk > targetStats.atk) {
      const damage = attackerStats.atk - targetStats.atk;
      destroyMonster(state, foeSide, targetZone, 'battle');
      s.stats.kills += 1;
      damageLp(state, foeSide, damage, side, 'battle');
      attackEvent.lpDamage = damage;
      attackEvent.lpAfter = foe.lp;
      log(state, `${attacker.name} が ${target.name} を戦闘破壊 — ${damage} ダメージ`, 'damage');
    } else if (attackerStats.atk < targetStats.atk) {
      const damage = targetStats.atk - attackerStats.atk;
      destroyMonster(state, side, fromZone, 'battle');
      foe.stats.kills += 1;
      damageLp(state, side, damage, foeSide, 'battle');
      attackEvent.lpDamage = damage;
      attackEvent.lpAfter = s.lp;
      log(state, `${target.name} が ${attacker.name} を戦闘破壊 — ${damage} ダメージ`, 'damage');
    } else {
      destroyMonster(state, foeSide, targetZone, 'battle');
      destroyMonster(state, side, fromZone, 'battle');
      s.stats.kills += 1;
      foe.stats.kills += 1;
      log(state, `${attacker.name} と ${target.name} が相打ち`, 'danger');
    }
  } else {
    if (attackerStats.atk > targetStats.def) {
      destroyMonster(state, foeSide, targetZone, 'battle');
      s.stats.kills += 1;
      log(state, `${attacker.name} が守備表示の ${target.name} を破壊`, 'damage');
    } else if (attackerStats.atk < targetStats.def) {
      const damage = targetStats.def - attackerStats.atk;
      damageLp(state, side, damage, foeSide, 'battle');
      attackEvent.lpDamage = damage;
      attackEvent.lpAfter = s.lp;
      log(state, `守備力を突破できず ${damage} ダメージ`, 'damage');
    } else {
      log(state, `${attacker.name} と ${target.name} は互角 — 破壊なし`, 'info');
    }
  }

  checkWin(state);
  return { state, events: state.events };
}

export function endTurn(game, side) {
  const state = cloneState(game);
  state.events = [];
  assertTurn(state, side);
  const s = state.sides[side];
  while (s.hand.length > HAND_LIMIT) {
    const card = s.hand.pop();
    s.graveyard.push(card);
    emit(state, { type: 'discard', side, card });
    log(state, `${s.name} は手札上限のため ${card.name} を捨てた`, 'danger');
  }
  const next = otherSide(side);
  beginTurn(state, next);
  checkWin(state);
  return { state, events: state.events };
}

export function applyAction(game, action) {
  switch (action.type) {
    case 'play':
      return playCard(game, action.side, action.handUid, action.zone, {
        set: action.set,
        tributes: action.tributes,
      });
    case 'activate':
      return activateSet(game, action.side, action.zone);
    case 'position':
      return changePosition(game, action.side, action.zone);
    case 'battle':
      return enterBattlePhase(game, action.side);
    case 'attack':
      return attack(game, action.side, action.from, action.targetZone ?? null);
    case 'end':
      return endTurn(game, action.side);
    default:
      throw new GameError(`未知のアクション: ${action.type}`);
  }
}

function chooseAiAction(state, side) {
  const s = state.sides[side];
  const foeSide = otherSide(side);
  const foe = state.sides[foeSide];

  if (!state.battlePhase) {
    const fieldCard = s.hand.find(card => card.kind === 'field');
    if (fieldCard && !s.field[FIELD_ZONE]) {
      return { type: 'play', side, handUid: fieldCard.uid, zone: FIELD_ZONE };
    }

    const pot = s.hand.find(card => card.typeId === 'pot');
    const emptyST = emptySTZones(s);
    if (pot && emptyST.length) {
      return { type: 'play', side, handUid: pot.uid, zone: emptyST[0] };
    }

    const storm = s.hand.find(card => card.typeId === 'storm');
    const foeBackrow = stZones(foe).length + (foe.field[FIELD_ZONE] ? 1 : 0);
    if (storm && foeBackrow > 0 && emptyST.length) {
      return { type: 'play', side, handUid: storm.uid, zone: emptyST[0] };
    }

    const trap = s.hand.find(card => card.kind === 'trap');
    if (trap && emptyST.length) {
      return { type: 'play', side, handUid: trap.uid, zone: emptyST[0], set: true };
    }

    if (!s.normalSummoned) {
      const emptyMonsters = emptyMonsterZones(s);
      const monsters = s.hand
        .filter(card => card.kind === 'monster')
        .sort((a, b) => (b.level - a.level) || (b.atk - a.atk));
      for (const card of monsters) {
        if (!emptyMonsters.length) break;
        const required = normalSummonTributes(card.level);
        if (required > 0) {
          const tributes = monsterZones(s).slice(0, required);
          if (tributes.length < required) continue;
          return {
            type: 'play',
            side,
            handUid: card.uid,
            zone: emptyMonsters[0],
            tributes,
          };
        }
        return { type: 'play', side, handUid: card.uid, zone: emptyMonsters[0] };
      }
    }

    const ready = monsterZones(s).some(zone => {
      const card = s.field[zone];
      return card && card.position === 'attack' && !card.faceDown && !card.hasAttacked;
    });
    if (ready) return { type: 'battle', side };
    return null;
  }

  // Battle phase: pick a good attack.
  const attackers = monsterZones(s).filter(zone => {
    const card = s.field[zone];
    return card && card.position === 'attack' && !card.faceDown && !card.hasAttacked;
  });

  for (const zone of attackers) {
    const attacker = s.field[zone];
    const attackerStats = statsOf(state, side, attacker);
    const targets = monsterZones(foe);
    if (!targets.length) {
      return { type: 'attack', side, from: zone, targetZone: null };
    }
    const scored = targets.map(targetZone => {
      const target = foe.field[targetZone];
      const targetStats = statsOf(state, foeSide, target);
      const defense = target.position === 'attack' ? targetStats.atk : targetStats.def;
      return { targetZone, defense, canDestroy: attackerStats.atk > defense };
    }).filter(item => item.canDestroy);
    if (scored.length) {
      scored.sort((a, b) => a.defense - b.defense);
      return { type: 'attack', side, from: zone, targetZone: scored[0].targetZone };
    }
  }

  return null;
}

export function aiTurn(game, side = 'enemy') {
  let state = game;
  const steps = [];
  let guard = 0;
  while (state.phase === 'playing' && state.turn === side && guard < 64) {
    guard += 1;
    const action = chooseAiAction(state, side);
    if (!action) break;
    const before = state;
    const result = applyAction(before, action);
    steps.push({ action, before, result });
    state = result.state;
    if (state.phase === 'over') break;
  }
  if (state.phase === 'playing' && state.turn === side) {
    const before = state;
    const result = endTurn(before, side);
    steps.push({ action: { type: 'end', side }, before, result });
    state = result.state;
  }
  return { state, steps };
}

export function simulate(seed = 1) {
  let state = createGame({ seed });
  let turns = 0;
  while (state.phase === 'playing' && turns < 100) {
    turns += 1;
    const side = state.turn;
    const { state: next, steps } = aiTurn(state, side);
    if (!steps.length) break;
    state = next;
  }
  return { state, turns };
}
