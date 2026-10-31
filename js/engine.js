import { CARDS, DECK_LIST, cardDef, tributeCount } from './cards.js';

let UID = 0;
const newUid = () => `c${(++UID).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const LP_START = 8000;
const MAX_HAND = 7;

// ────────────────────────────────────────────────────────────── core helpers
const other = p => 1 - p;
const fail = error => ({ ok: false, error });
const ok = game => ({ ok: true, events: game.events });

function log(game, text, kind = 'sys') {
  game.log.push({ turn: game.turnCount, text, kind });
  if (game.log.length > 120) game.log.shift();
}

function emit(game, ev) {
  game.events.push(ev);
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeck(owner) {
  return shuffled(DECK_LIST).map(cardId => ({
    uid: newUid(), cardId, owner, position: 'attack', faceDown: false,
    setTurn: 0, changedTurn: -1, attackedTurn: -1,
  }));
}

function emptyMonsters() { return [null, null, null, null, null]; }

function makePlayer(name, owner) {
  return {
    name, owner, lp: LP_START,
    hand: [], deck: makeDeck(owner), grave: [], banished: [],
    monsters: emptyMonsters(), spells: [null, null, null, null, null],
    field: null, normalSummoned: false,
  };
}

export function createDuel(name0, name1) {
  const game = {
    id: `d${Date.now().toString(36)}`,
    players: [makePlayer(name0, 0), makePlayer(name1, 1)],
    turnPlayer: 0, turnCount: 1, phase: 'main', winner: null,
    log: [], events: [], startedAt: Date.now(),
  };
  log(game, 'デュエル開始 — ライフポイント 8000 / 24ゾーン', 'turn');
  for (const p of [0, 1]) drawCards(game, p, 5, true);
  log(game, `${name0} のターン`, 'turn');
  emit(game, { t: 'turn', p: 0, turnCount: 1 });
  return game;
}

export function cloneGame(game) {
  return JSON.parse(JSON.stringify(game));
}

export function cardAtk(game, p, inst) {
  if (!inst) return 0;
  const card = cardDef(inst);
  if (card.kind !== 'monster') return 0;
  const field = game.players[p].field;
  const boost = field && cardDef(field).effect === 'skyScraper' && !field.faceDown ? 300 : 0;
  return card.atk + boost;
}

export function cardDefOf(inst) { return inst ? cardDef(inst) : null; }

export function atkOf(game, p, inst) { return cardAtk(game, p, inst); }
export function defOf(game, p, inst) { return inst ? cardDef(inst).def : 0; }

export function canAttack(inst) {
  return inst && !inst.faceDown && inst.position === 'attack';
}

// ────────────────────────────────────────────────────────────── drawing
export function drawCards(game, p, n = 1, silent = false) {
  const player = game.players[p];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (!player.deck.length) {
      if (!silent) {
        emit(game, { t: 'deckout', p });
        log(game, `${player.name} はデッキ切れ！`, 'bad');
        finish(game, other(p), 'deckout');
      }
      break;
    }
    const inst = player.deck.pop();
    player.hand.push(inst);
    drawn++;
    emit(game, { t: 'draw', p, uid: inst.uid, cardId: inst.cardId });
    if (!silent) log(game, `${player.name} はカードを1枚ドロー`, 'draw');
  }
  return drawn;
}

function finish(game, winner, reason = 'lp') {
  if (game.winner != null) return;
  game.winner = winner;
  emit(game, { t: 'win', p: winner, reason });
  log(game, `${game.players[winner].name} の勝利！`, 'win');
}

function checkWin(game) {
  if (game.winner != null) return;
  for (const p of [0, 1]) {
    if (game.players[p].lp <= 0) {
      game.players[p].lp = 0;
      finish(game, other(p), 'lp');
      return;
    }
  }
}

function damage(game, p, amount, source = '') {
  if (amount <= 0 || game.winner != null) return;
  const player = game.players[p];
  player.lp = Math.max(0, player.lp - amount);
  emit(game, { t: 'damage', p, amount, lp: player.lp });
  log(game, `${player.name} に ${amount} ダメージ${source ? `（${source}）` : ''}`, 'bad');
  checkWin(game);
}

function heal(game, p, amount) {
  const player = game.players[p];
  const before = player.lp;
  player.lp = Math.min(LP_START, player.lp + amount);
  const gained = player.lp - before;
  emit(game, { t: 'heal', p, amount: gained, lp: player.lp });
  if (gained > 0) log(game, `${player.name} は ${gained} ライフ回復`, 'good');
}

// ────────────────────────────────────────────────────────────── destruction
function destroyMonster(game, p, zoneIndex, reason = '') {
  const player = game.players[p];
  const inst = player.monsters[zoneIndex];
  if (!inst) return;
  player.monsters[zoneIndex] = null;
  player.grave.push(inst);
  emit(game, { t: 'destroy', p, zone: 'monster', zoneIndex, uid: inst.uid, cardId: inst.cardId, reason });
  log(game, `${player.name} の「${cardDef(inst).name}」を破壊`, reason === 'tribute' ? 'sys' : 'bad');
}

function destroySpell(game, p, zoneIndex, reason = '') {
  const player = game.players[p];
  const inst = player.spells[zoneIndex];
  if (!inst) return;
  player.spells[zoneIndex] = null;
  player.grave.push(inst);
  emit(game, { t: 'destroy', p, zone: 'spell', zoneIndex, uid: inst.uid, cardId: inst.cardId, reason });
  log(game, `${player.name} の「${cardDef(inst).name}」を破壊`, 'bad');
}

function destroyField(game, p, reason = '') {
  const player = game.players[p];
  const inst = player.field;
  if (!inst) return;
  player.field = null;
  player.grave.push(inst);
  emit(game, { t: 'destroy', p, zone: 'field', zoneIndex: 0, uid: inst.uid, cardId: inst.cardId, reason });
  log(game, `フィールド魔法「${cardDef(inst).name}」を破壊`, 'bad');
}

// ────────────────────────────────────────────────────────────── traps
function trapFromZone(game, p, zoneIndex, trigger) {
  const player = game.players[p];
  const inst = player.spells[zoneIndex];
  if (!inst || !inst.faceDown) return null;
  const card = cardDef(inst);
  if (card.kind !== 'trap' || card.trigger !== trigger) return null;
  return { inst, card };
}

function activateTrap(game, p, zoneIndex, inst, card) {
  const player = game.players[p];
  player.spells[zoneIndex] = null;
  inst.faceDown = false;
  emit(game, { t: 'trap', p, zone: 'spell', zoneIndex, uid: inst.uid, cardId: inst.cardId });
  log(game, `${player.name} は罠「${card.name}」を発動！`, 'trap');
  player.grave.push(inst);
  emit(game, { t: 'toGrave', p, uid: inst.uid, cardId: inst.cardId });
}

function triggerSummonTraps(game, defender, summonedInst, p) {
  const defenderPlayer = game.players[defender];
  const card = cardDef(summonedInst);
  const order = ['trapHole', 'torrential'];
  for (const effect of order) {
    for (let z = 0; z < 5; z++) {
      const found = trapFromZone(game, defender, z, 'summon');
      if (!found || found.card.effect !== effect) continue;
      const { inst, card: trap } = found;
      if (effect === 'trapHole' && card.atk < 1500) continue;
      activateTrap(game, defender, z, inst, trap);
      if (effect === 'trapHole') {
        const zone = defenderPlayer.monsters.indexOf(summonedInst);
        if (zone >= 0) destroyMonster(game, defender, zone, 'trap');
      } else if (effect === 'torrential') {
        for (const owner of [0, 1]) {
          for (let i = 0; i < 5; i++) {
            if (game.players[owner].monsters[i]) destroyMonster(game, owner, i, 'trap');
          }
        }
      }
      return true;
    }
  }
  return false;
}

function triggerAttackTraps(game, defender, attackerInst, targetInst, attackerP) {
  const order = ['cylinder', 'mirrorForce', 'sakuretsu', 'compulsory'];
  for (const effect of order) {
    for (let z = 0; z < 5; z++) {
      const found = trapFromZone(game, defender, z, 'attack');
      if (!found || found.card.effect !== effect) continue;
      const { inst, card: trap } = found;
      activateTrap(game, defender, z, inst, trap);
      const attackerZone = game.players[attackerP].monsters.indexOf(attackerInst);
      if (effect === 'cylinder') {
        damage(game, attackerP, cardAtk(game, attackerP, attackerInst), '魔法の筒');
      } else if (effect === 'mirrorForce') {
        const own = game.players[attackerP].monsters;
        for (let i = 0; i < 5; i++) {
          if (own[i] && !own[i].faceDown && own[i].position === 'attack') {
            destroyMonster(game, attackerP, i, 'trap');
          }
        }
      } else if (effect === 'sakuretsu') {
        if (attackerZone >= 0) destroyMonster(game, attackerP, attackerZone, 'trap');
      } else if (effect === 'compulsory') {
        if (attackerZone >= 0) {
          game.players[attackerP].monsters[attackerZone] = null;
          game.players[attackerP].hand.push(attackerInst);
          emit(game, { t: 'returnHand', p: attackerP, uid: attackerInst.uid, cardId: attackerInst.cardId });
          log(game, `「${cardDef(attackerInst).name}」は手札に戻された`, 'trap');
        }
      }
      return true;
    }
  }
  return false;
}

// ────────────────────────────────────────────────────────────── actions
function validateTurn(game, p) {
  if (game.winner != null) return 'デュエルは終了しています';
  if (game.turnPlayer !== p) return 'あなたのターンではありません';
  return null;
}

function summon(game, p, handUid, zone, opts = {}) {
  const player = game.players[p];
  const handIndex = player.hand.findIndex(c => c.uid === handUid);
  if (handIndex < 0) return fail('そのカードは手札にありません');
  const inst = player.hand[handIndex];
  const card = cardDef(inst);
  if (card.kind !== 'monster') return fail('モンスターカードではありません');
  if (zone < 0 || zone > 4) return fail('ゾーンが不正です');
  if (player.monsters[zone]) return fail('そのモンスターゾーンは使用中です');
  if (player.normalSummoned) return fail('このターンはすでに召喚しています');
  const need = tributeCount(card);
  const tributes = [...new Set(opts.tributes || [])];
  if (tributes.length !== need) return fail(`生贄が ${need} 体必要です`);
  for (const uid of tributes) {
    const idx = player.monsters.findIndex(m => m && m.uid === uid);
    if (idx < 0) return fail('生贄のモンスターが見つかりません');
  }

  player.hand.splice(handIndex, 1);
  for (const uid of tributes) {
    const idx = player.monsters.findIndex(m => m && m.uid === uid);
    const tribute = player.monsters[idx];
    player.monsters[idx] = null;
    emit(game, { t: 'tribute', p, uid, cardId: tribute.cardId, zoneIndex: idx });
    player.grave.push(tribute);
    log(game, `「${cardDef(tribute).name}」を生贄に捧げた`, 'sys');
  }

  inst.faceDown = !!opts.faceDown;
  inst.position = opts.faceDown ? 'defense' : 'attack';
  inst.setTurn = game.turnCount;
  player.monsters[zone] = inst;
  player.normalSummoned = true;

  emit(game, { t: 'summon', p, uid: inst.uid, cardId: inst.cardId, zone, faceDown: !!opts.faceDown });
  log(game, `${player.name} は「${card.name}」を${opts.faceDown ? 'セット' : '召喚'}`, 'summon');
  triggerSummonTraps(game, other(p), inst, p);
  return ok(game);
}

function setSpell(game, p, handUid, zone) {
  const player = game.players[p];
  const handIndex = player.hand.findIndex(c => c.uid === handUid);
  if (handIndex < 0) return fail('そのカードは手札にありません');
  const inst = player.hand[handIndex];
  const card = cardDef(inst);
  if (card.kind === 'monster') return fail('モンスターはセットできません');
  if (card.field) return fail('フィールド魔法は発動してください');
  if (zone < 0 || zone > 4) return fail('ゾーンが不正です');
  if (player.spells[zone]) return fail('その魔法・罠ゾーンは使用中です');
  player.hand.splice(handIndex, 1);
  inst.faceDown = true;
  inst.position = 'set';
  inst.setTurn = game.turnCount;
  player.spells[zone] = inst;
  emit(game, { t: 'set', p, uid: inst.uid, cardId: inst.cardId, zone });
  log(game, `${player.name} はカードを1枚セット`, 'summon');
  return ok(game);
}

function activateSpell(game, p, handUid) {
  const player = game.players[p];
  const handIndex = player.hand.findIndex(c => c.uid === handUid);
  if (handIndex < 0) return fail('そのカードは手札にありません');
  const inst = player.hand[handIndex];
  const card = cardDef(inst);
  if (card.kind !== 'spell') return fail('魔法カードではありません');
  if (card.field && player.field) destroyField(game, p, 'replaced');
  player.hand.splice(handIndex, 1);

  if (card.field) {
    inst.faceDown = false;
    player.field = inst;
    emit(game, { t: 'activate', p, uid: inst.uid, cardId: inst.cardId, zone: 'field' });
    log(game, `${player.name} はフィールド魔法「${card.name}」を発動！`, 'spell');
  } else {
    emit(game, { t: 'activate', p, uid: inst.uid, cardId: inst.cardId, zone: null });
    log(game, `${player.name} は魔法「${card.name}」を発動！`, 'spell');
    resolveSpell(game, p, card, inst);
    player.grave.push(inst);
    emit(game, { t: 'toGrave', p, uid: inst.uid, cardId: inst.cardId });
  }
  return ok(game);
}

function resolveSpell(game, p, card, inst) {
  const player = game.players[p];
  const opp = game.players[other(p)];
  switch (card.effect) {
    case 'pot':
      drawCards(game, p, 2);
      break;
    case 'charity': {
      drawCards(game, p, 3);
      const sorted = player.hand.slice().sort((a, b) => {
        const ca = cardDef(a), cb = cardDef(b);
        return (ca.atk || 0) - (cb.atk || 0);
      });
      for (let i = 0; i < 2 && sorted.length; i++) {
        const discard = sorted.shift();
        const idx = player.hand.findIndex(c => c.uid === discard.uid);
        if (idx >= 0) {
          player.hand.splice(idx, 1);
          player.grave.push(discard);
          emit(game, { t: 'discard', p, uid: discard.uid, cardId: discard.cardId });
          log(game, `${player.name} は「${cardDef(discard).name}」を捨てた`, 'sys');
        }
      }
      break;
    }
    case 'thunderbolt': {
      for (let i = 0; i < 5; i++) if (opp.monsters[i]) destroyMonster(game, other(p), i, 'spell');
      break;
    }
    case 'blackhole': {
      for (const owner of [0, 1]) {
        for (let i = 0; i < 5; i++) if (game.players[owner].monsters[i]) destroyMonster(game, owner, i, 'spell');
      }
      break;
    }
    case 'reborn': {
      const monsters = player.grave.filter(x => cardDef(x).kind === 'monster');
      if (!monsters.length) {
        log(game, '墓地にモンスターがいない…', 'sys');
        break;
      }
      monsters.sort((a, b) => cardDef(b).atk - cardDef(a).atk);
      const revive = monsters[0];
      const zone = player.monsters.findIndex(x => !x);
      if (zone < 0) {
        log(game, 'モンスターゾーンが満杯だ…', 'sys');
        break;
      }
      player.grave = player.grave.filter(x => x.uid !== revive.uid);
      revive.faceDown = false;
      revive.position = 'attack';
      revive.setTurn = game.turnCount;
      player.monsters[zone] = revive;
      emit(game, { t: 'revive', p, uid: revive.uid, cardId: revive.cardId, zone });
      log(game, `${player.name} は「${cardDef(revive).name}」を特殊召喚！`, 'summon');
      break;
    }
    case 'cyclone': {
      const targets = [];
      opp.spells.forEach((x, i) => { if (x) targets.push({ kind: 'spell', index: i }); });
      if (opp.field) targets.push({ kind: 'field', index: 0 });
      if (!targets.length) { log(game, '破壊できる魔法・罠がない…', 'sys'); break; }
      const t = targets[Math.floor(Math.random() * targets.length)];
      if (t.kind === 'spell') destroySpell(game, other(p), t.index, 'spell');
      else destroyField(game, other(p), 'spell');
      break;
    }
    case 'heavyStorm': {
      for (const owner of [0, 1]) {
        for (let i = 0; i < 5; i++) if (game.players[owner].spells[i]) destroySpell(game, owner, i, 'spell');
        if (game.players[owner].field) destroyField(game, owner, 'spell');
      }
      break;
    }
    case 'fireball':
      damage(game, other(p), 600, '火球');
      break;
    case 'potion':
      heal(game, p, 1000);
      break;
    case 'reinforcements': {
      const idx = player.deck.findIndex(x => {
        const c = cardDef(x);
        return c.kind === 'monster' && c.level <= 4;
      });
      if (idx < 0) { log(game, '該当するモンスターがない…', 'sys'); break; }
      const [found] = player.deck.splice(idx, 1);
      player.hand.push(found);
      emit(game, { t: 'search', p, uid: found.uid, cardId: found.cardId });
      log(game, `${player.name} は「${cardDef(found).name}」を手札に加えた`, 'draw');
      break;
    }
    default:
      break;
  }
}

function changePosition(game, p, uid) {
  const player = game.players[p];
  const idx = player.monsters.findIndex(m => m && m.uid === uid);
  if (idx < 0) return fail('モンスターが見つかりません');
  const inst = player.monsters[idx];
  if (inst.changedTurn === game.turnCount) return fail('このターンはすでに表示形式を変更しています');
  if (inst.faceDown) {
    inst.faceDown = false;
    inst.position = 'attack';
    inst.changedTurn = game.turnCount;
    emit(game, { t: 'reveal', p, uid, cardId: inst.cardId, zoneIndex: idx });
    log(game, `「${cardDef(inst).name}」を反転召喚`, 'summon');
  } else {
    inst.position = inst.position === 'attack' ? 'defense' : 'attack';
    inst.changedTurn = game.turnCount;
    emit(game, { t: 'position', p, uid, position: inst.position });
    log(game, `「${cardDef(inst).name}」を${inst.position === 'attack' ? '攻撃表示' : '守備表示'}に変更`, 'sys');
  }
  return ok(game);
}

function attack(game, p, attackerUid, targetUid) {
  if (game.phase !== 'battle') return fail('バトルフェイズではありません');
  const player = game.players[p];
  const opp = game.players[other(p)];
  const aZone = player.monsters.findIndex(m => m && m.uid === attackerUid);
  if (aZone < 0) return fail('攻撃モンスターが見つかりません');
  const attacker = player.monsters[aZone];
  if (!canAttack(attacker)) return fail('このモンスターは攻撃できません');
  if (attacker.attackedTurn === game.turnCount) return fail('このモンスターは攻撃済みです');

  let target = null, tZone = -1;
  if (targetUid) {
    tZone = opp.monsters.findIndex(m => m && m.uid === targetUid);
    if (tZone < 0) return fail('対象が見つかりません');
    target = opp.monsters[tZone];
  } else {
    if (opp.monsters.some(Boolean)) return fail('相手モンスターが存在します');
  }

  attacker.attackedTurn = game.turnCount;
  emit(game, {
    t: 'attack', p, attackerUid, attackerCardId: attacker.cardId,
    targetUid: target ? target.uid : null, targetCardId: target ? target.cardId : null,
    direct: !target,
  });
  log(game, `「${cardDef(attacker).name}」の${target ? '攻撃' : '直接攻撃'}！`, 'attack');

  const trapTriggered = triggerAttackTraps(game, other(p), attacker, target, p);
  if (trapTriggered) {
    if (game.players[p].monsters[aZone] !== attacker) return ok(game); // destroyed/returned by trap
    // cylinder negates; mirror/sakuretsu/compulsory may leave attacker alive only if not triggered
    return ok(game);
  }

  if (game.winner != null) return ok(game);

  if (target && target.faceDown) {
    target.faceDown = false;
    emit(game, { t: 'reveal', p: other(p), uid: target.uid, cardId: target.cardId, zoneIndex: tZone });
    log(game, `セットモンスター「${cardDef(target).name}」を公開`, 'sys');
  }

  const aAtk = cardAtk(game, p, attacker);
  if (!target) {
    damage(game, other(p), aAtk, '直接攻撃');
    return ok(game);
  }

  const tCard = cardDef(target);
  const tAtk = cardAtk(game, other(p), target);
  const tVal = target.position === 'attack' ? tAtk : tCard.def;

  if (target.position === 'attack') {
    if (aAtk > tVal) {
      destroyMonster(game, other(p), tZone, 'battle');
      damage(game, other(p), aAtk - tVal, '戦闘');
    } else if (aAtk < tVal) {
      destroyMonster(game, p, aZone, 'battle');
      damage(game, p, tVal - aAtk, '戦闘');
    } else {
      destroyMonster(game, other(p), tZone, 'battle');
      destroyMonster(game, p, aZone, 'battle');
    }
  } else {
    if (aAtk > tVal) {
      destroyMonster(game, other(p), tZone, 'battle');
      log(game, `「${tCard.name}」を撃破`, 'attack');
    } else if (aAtk < tVal) {
      damage(game, p, tVal - aAtk, '反撃');
    } else {
      log(game, '攻撃は弾かれた…', 'sys');
    }
  }
  return ok(game);
}

function setPhase(game, p, phase) {
  if (phase !== 'battle') return fail('対応していないフェーズです');
  if (game.phase === 'battle') return fail('すでにバトルフェイズです');
  game.phase = 'battle';
  emit(game, { t: 'phase', phase });
  log(game, 'バトルフェイズ', 'sys');
  return ok(game);
}

function endTurn(game, p) {
  if (game.winner != null) return ok(game);
  const player = game.players[p];
  while (player.hand.length > MAX_HAND) {
    const discard = player.hand.reduce((worst, c) => {
      const a = cardDef(c), b = cardDef(worst);
      return (a.atk || 0) < (b.atk || 0) ? c : worst;
    }, player.hand[0]);
    const idx = player.hand.findIndex(c => c.uid === discard.uid);
    player.hand.splice(idx, 1);
    player.grave.push(discard);
    emit(game, { t: 'discard', p, uid: discard.uid, cardId: discard.cardId });
  }

  const next = other(p);
  game.turnPlayer = next;
  game.turnCount++;
  game.phase = 'main';
  const np = game.players[next];
  np.normalSummoned = false;
  for (const m of np.monsters) if (m) m.changedTurn = -1;
  emit(game, { t: 'turn', p: next, turnCount: game.turnCount });
  log(game, `${np.name} のターン`, 'turn');
  drawCards(game, next, 1);
  return ok(game);
}

export function applyAction(game, action) {
  game.events = [];
  if (!action || typeof action !== 'object') return fail('不正なアクション');
  const p = action.player;
  if (action.type === 'surrender') {
    if (game.winner == null && (p === 0 || p === 1)) finish(game, other(p), 'surrender');
    return ok(game);
  }
  if (p !== 0 && p !== 1) return fail('プレイヤーが不正です');
  const turnError = validateTurn(game, p);
  if (turnError) return fail(turnError);

  switch (action.type) {
    case 'summon':
      return summon(game, p, action.handUid, action.zone, { faceDown: action.faceDown, tributes: action.tributes });
    case 'setSpell':
      return setSpell(game, p, action.handUid, action.zone);
    case 'activateSpell':
      return activateSpell(game, p, action.handUid);
    case 'changePosition':
      return changePosition(game, p, action.uid);
    case 'setPhase':
      return setPhase(game, p, action.phase);
    case 'attack':
      return attack(game, p, action.attackerUid, action.targetUid || null);
    case 'endTurn':
      return endTurn(game, p);
    default:
      return fail('不明なアクション');
  }
}

// ────────────────────────────────────────────────────────────── CPU brain
export function aiNextAction(game, p) {
  if (game.winner != null || game.turnPlayer !== p) return null;
  const me = game.players[p];
  const opp = game.players[other(p)];
  const hand = me.hand.map(inst => ({ inst, card: cardDef(inst) }));
  const oppMonsters = opp.monsters.map((m, i) => ({ inst: m, zone: i })).filter(x => x.inst);
  const myMonsters = me.monsters.map((m, i) => ({ inst: m, zone: i })).filter(x => x.inst);
  const openMonster = me.monsters.findIndex(x => !x);
  const openSpell = me.spells.findIndex(x => !x);
  const act = (type, extra = {}) => ({ type, player: p, ...extra });

  // 1) guaranteed lethal burn
  if (opp.lp <= 600) {
    const fire = hand.find(h => h.card.effect === 'fireball');
    if (fire) return act('activateSpell', { handUid: fire.inst.uid });
  }

  // 2) normal summon / tribute summon
  if (!me.normalSummoned) {
    const low = hand.filter(h => h.card.kind === 'monster' && tributeCount(h.card) === 0)
      .sort((a, b) => b.card.atk - a.card.atk)[0];
    const high = hand.filter(h => h.card.kind === 'monster' && tributeCount(h.card) > 0)
      .filter(h => openMonster >= 0 && myMonsters.length >= tributeCount(h.card))
      .sort((a, b) => b.card.atk - a.card.atk)[0];
    const oppBest = oppMonsters.reduce((max, m) => Math.max(max, cardDef(m.inst).atk), 0);
    if (high && (!low || high.card.atk >= low.card.atk + 400)) {
      const need = tributeCount(high.card);
      const tributes = myMonsters.slice().sort((a, b) => cardDef(a.inst).atk - cardDef(b.inst).atk)
        .slice(0, need).map(x => x.inst.uid);
      return act('summon', { handUid: high.inst.uid, zone: openMonster, tributes });
    }
    if (low) {
      const weak = low.card.atk <= 1500 && oppBest > low.card.atk && oppMonsters.length > 0;
      return act('summon', { handUid: low.inst.uid, zone: openMonster, faceDown: weak });
    }
  }

  // 3) set a trap
  if (openSpell >= 0) {
    const trap = hand.find(h => h.card.kind === 'trap');
    if (trap) return act('setSpell', { handUid: trap.inst.uid, zone: openSpell });
  }

  // 4) spells by priority
  const has = effect => hand.find(h => h.card.effect === effect);
  const spellOrder = ['pot', 'charity', 'reinforcements', 'skyScraper', 'reborn', 'thunderbolt', 'blackhole', 'cyclone', 'heavyStorm', 'potion', 'fireball'];
  for (const effect of spellOrder) {
    const h = has(effect);
    if (!h) continue;
    if (effect === 'pot' && me.hand.length <= 6) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'charity' && me.hand.length <= 5) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'reinforcements' && !hand.some(x => x.card.kind === 'monster' && x.card.level <= 4)) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'skyScraper' && !me.field && myMonsters.length > 0) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'reborn' && openMonster >= 0 && me.grave.some(x => cardDef(x).kind === 'monster')) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'thunderbolt' && oppMonsters.length >= 2) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'blackhole' && oppMonsters.length > 0 && oppMonsters.length > myMonsters.length) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'cyclone' && (opp.spells.some(Boolean) || opp.field)) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'heavyStorm' && opp.spells.filter(Boolean).length >= 2) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'potion' && me.lp <= 5000) return act('activateSpell', { handUid: h.inst.uid });
    if (effect === 'fireball' && (opp.lp <= 1200 || (oppMonsters.length === 0 && me.lp > opp.lp))) return act('activateSpell', { handUid: h.inst.uid });
  }

  // 5) battle
  if (game.phase === 'main') {
    const ready = myMonsters.some(x => canAttack(x.inst));
    if (ready) return act('setPhase', { phase: 'battle' });
    return act('endTurn');
  }

  if (game.phase === 'battle') {
    const attackers = myMonsters.filter(x => canAttack(x.inst) && x.inst.attackedTurn !== game.turnCount)
      .sort((a, b) => cardAtk(game, p, b.inst) - cardAtk(game, p, a.inst));
    if (!attackers.length) return act('endTurn');
    if (!oppMonsters.length) {
      return act('attack', { attackerUid: attackers[0].inst.uid, targetUid: null });
    }
    for (const a of attackers) {
      const aAtk = cardAtk(game, p, a.inst);
      const beatable = oppMonsters.filter(x => {
        if (x.inst.faceDown) return aAtk >= 2000;
        const v = x.inst.position === 'attack' ? cardAtk(game, other(p), x.inst) : cardDef(x.inst).def;
        return aAtk > v;
      }).sort((x, y) => {
        const xv = x.inst.faceDown ? 0 : (x.inst.position === 'attack' ? cardAtk(game, other(p), x.inst) : cardDef(x.inst).def);
        const yv = y.inst.faceDown ? 0 : (y.inst.position === 'attack' ? cardAtk(game, other(p), y.inst) : cardDef(y.inst).def);
        return yv - xv;
      });
      if (beatable.length) {
        return act('attack', { attackerUid: a.inst.uid, targetUid: beatable[0].inst.uid });
      }
      // low-risk chip at a set monster, otherwise hold
    }
    return act('endTurn');
  }

  return act('endTurn');
}
