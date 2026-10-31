import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLS,
  FRONT_ROW,
  GameError,
  ROWS,
  START_LP,
  TOTAL_ZONES,
  ZONES_PER_SIDE,
  aiTurn,
  attack,
  attackInfo,
  createGame,
  endTurn,
  moveCard,
  moveTargets,
  playCard,
  playableZones,
  simulate,
  zoneIndex,
  zoneNumber,
} from '../src/engine.js';

function cardFrom(state, side, typeId) {
  const s = state.sides[side];
  const handIndex = s.hand.findIndex(card => card.typeId === typeId);
  if (handIndex >= 0) return s.hand.splice(handIndex, 1)[0];
  const deckIndex = s.deck.findIndex(card => card.typeId === typeId);
  if (deckIndex >= 0) return s.deck.splice(deckIndex, 1)[0];
  throw new Error(`card ${typeId} not found for ${side}`);
}

function putInHand(state, side, typeId) {
  const card = cardFrom(state, side, typeId);
  state.sides[side].hand.push(card);
  return card;
}

test('createGame builds two 12-zone fields and a 24-zone arena', () => {
  const game = createGame({ seed: 24 });

  assert.equal(COLS, 4);
  assert.equal(ROWS, 3);
  assert.equal(ZONES_PER_SIDE, 12);
  assert.equal(TOTAL_ZONES, 24);
  assert.equal(game.phase, 'playing');
  assert.equal(game.turn, 'player');
  assert.equal(game.turnNumber, 1);

  for (const side of ['player', 'enemy']) {
    const s = game.sides[side];
    assert.equal(s.field.length, ZONES_PER_SIDE);
    assert.equal(s.field.filter(Boolean).length, 0);
    assert.equal(s.lp, START_LP);
    assert.equal(s.hand.length, side === 'player' ? 5 : 4);
    assert.equal(s.deck.length, side === 'player' ? 19 : 20);
  }

  assert.equal(
    new Set([
      ...Array.from({ length: 12 }, (_, zone) => zoneNumber('player', zone)),
      ...Array.from({ length: 12 }, (_, zone) => zoneNumber('enemy', zone)),
    ]).size,
    TOTAL_ZONES,
  );
});

test('zone numbers map player front row to 13-16 and enemy back row to 01-04', () => {
  const playerFront = Array.from({ length: COLS }, (_, col) => zoneNumber('player', zoneIndex(FRONT_ROW, col)));
  assert.deepEqual(playerFront, [13, 14, 15, 16]);
  assert.deepEqual(Array.from({ length: COLS }, (_, col) => zoneNumber('enemy', zoneIndex(0, col))), [1, 2, 3, 4]);
  assert.equal(zoneNumber('player', zoneIndex(0, 0)), 21);
  assert.equal(zoneNumber('enemy', zoneIndex(FRONT_ROW, 3)), 12);
});

test('playCard spends energy, places the card, and keeps the input state pure', () => {
  const game = createGame({ seed: 2 });
  game.sides.player.energy = 10;
  const card = game.sides.player.hand[0];
  const zone = zoneIndex(1, 1);
  const beforeHand = game.sides.player.hand.length;
  const beforeEnergy = game.sides.player.energy;

  const { state, events } = playCard(game, 'player', card.uid, zone);

  assert.equal(state.sides.player.field[zone].uid, card.uid);
  assert.equal(state.sides.player.hand.length, beforeHand - 1);
  assert.equal(state.sides.player.energy, beforeEnergy - card.cost);
  assert.equal(state.sides.player.stats.cardsPlayed, 1);
  assert.ok(events.some(event => event.type === 'summon' && event.zone === zone));

  // The source game was not mutated.
  assert.equal(game.sides.player.field[zone], null);
  assert.equal(game.sides.player.hand.length, beforeHand);
  assert.equal(game.sides.player.energy, beforeEnergy);
});

test('playCard rejects illegal placements and unaffordable cards', () => {
  const game = createGame({ seed: 3 });
  const card = game.sides.player.hand[0];
  game.sides.player.energy = 0;

  assert.throws(() => playCard(game, 'player', card.uid, 0), GameError);
  assert.throws(() => playCard(game, 'enemy', card.uid, 0), GameError);
  assert.throws(() => playCard(game, 'player', card.uid, ZONES_PER_SIDE), GameError);
});

test('on-play strike damages the frontmost enemy in the same column', () => {
  const game = createGame({ seed: 4 });
  const frost = putInHand(game, 'player', 'frost');
  game.sides.player.energy = 10;
  const target = cardFrom(game, 'enemy', 'iron');
  target.hp = 1000;
  game.sides.enemy.field[zoneIndex(FRONT_ROW, 0)] = target;

  const { state, events } = playCard(game, 'player', frost.uid, zoneIndex(0, 0));

  const strike = events.find(event => event.type === 'strike');
  assert.ok(strike);
  assert.equal(strike.targetZone, zoneIndex(FRONT_ROW, 0));
  assert.equal(strike.damage, 200);
  assert.equal(state.sides.enemy.field[zoneIndex(FRONT_ROW, 0)].hp, 800);
});

test('attack deals direct LP damage when the column is empty', () => {
  const game = createGame({ seed: 5 });
  const volt = cardFrom(game, 'player', 'volt');
  game.sides.player.field[zoneIndex(FRONT_ROW, 2)] = { ...volt, hasAttacked: false, hasMoved: false };

  const info = attackInfo(game, 'player', zoneIndex(FRONT_ROW, 2));
  assert.equal(info.direct, true);
  assert.equal(info.lpDamage, volt.atk);

  const { state, events } = attack(game, 'player', zoneIndex(FRONT_ROW, 2));

  assert.equal(state.sides.enemy.lp, START_LP - volt.atk);
  assert.equal(state.sides.player.stats.dealt, volt.atk);
  assert.equal(state.sides.player.stats.attacks, 1);
  assert.ok(events.some(event => event.type === 'direct' && event.damage === volt.atk));
});

test('breakthrough sends overkill damage to the opponent LP', () => {
  const game = createGame({ seed: 6 });
  const volt = cardFrom(game, 'player', 'volt');
  game.sides.player.field[zoneIndex(FRONT_ROW, 1)] = { ...volt, hasAttacked: false, hasMoved: false };
  const target = cardFrom(game, 'enemy', 'shade');
  target.hp = 100;
  game.sides.enemy.field[zoneIndex(FRONT_ROW, 1)] = target;

  const { state, events } = attack(game, 'player', zoneIndex(FRONT_ROW, 1));

  assert.equal(state.sides.enemy.field[zoneIndex(FRONT_ROW, 1)], null);
  assert.equal(state.sides.enemy.lp, START_LP - (volt.atk - 100));
  assert.equal(state.sides.player.stats.kills, 1);
  assert.ok(events.some(event => event.type === 'destroy'));
  assert.ok(events.some(event => event.type === 'breakthrough' && event.amount === volt.atk - 100));
});

test('LP zero ends the duel immediately', () => {
  const game = createGame({ seed: 7 });
  const volt = cardFrom(game, 'player', 'volt');
  game.sides.player.field[zoneIndex(FRONT_ROW, 0)] = { ...volt, hasAttacked: false, hasMoved: false };
  game.sides.enemy.lp = 250;

  const { state, events } = attack(game, 'player', zoneIndex(FRONT_ROW, 0));

  assert.equal(state.sides.enemy.lp, 0);
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 'player');
  assert.ok(events.some(event => event.type === 'gameover' && event.winner === 'player'));
  assert.throws(() => endTurn(state, 'player'), GameError);
});

test('moveCard moves one row, blocks a second move, and resets next turn', () => {
  const game = createGame({ seed: 8 });
  const blaze = cardFrom(game, 'player', 'blaze');
  game.sides.player.field[zoneIndex(0, 0)] = { ...blaze, hasAttacked: false, hasMoved: false };

  assert.deepEqual(moveTargets(game, 'player', zoneIndex(0, 0)), [zoneIndex(1, 0)]);

  const moved = moveCard(game, 'player', zoneIndex(0, 0), zoneIndex(1, 0)).state;
  assert.equal(moved.sides.player.field[zoneIndex(0, 0)], null);
  assert.equal(moved.sides.player.field[zoneIndex(1, 0)].uid, blaze.uid);
  assert.equal(moved.sides.player.field[zoneIndex(1, 0)].hasMoved, true);

  assert.throws(() => moveCard(moved, 'player', zoneIndex(1, 0), zoneIndex(2, 0)), GameError);
  assert.throws(() => moveCard(moved, 'player', zoneIndex(1, 0), zoneIndex(1, 1)), GameError);

  const enemyTurn = endTurn(moved, 'player').state;
  const nextTurn = endTurn(enemyTurn, 'enemy').state;
  assert.equal(nextTurn.sides.player.field[zoneIndex(1, 0)].hasMoved, false);
  assert.ok(moveTargets(nextTurn, 'player', zoneIndex(1, 0)).includes(zoneIndex(2, 0)));
});

test('endTurn restores energy and draws a card', () => {
  const game = createGame({ seed: 9 });
  game.sides.player.energy = 0;
  const deckBefore = game.sides.player.deck.length;
  const handBefore = game.sides.player.hand.length;

  const { state } = endTurn(game, 'player');

  assert.equal(state.turn, 'enemy');
  assert.equal(state.turnNumber, 2);
  assert.equal(state.sides.enemy.energy, state.sides.enemy.maxEnergy);
  assert.equal(state.sides.enemy.deck.length, 19);
  assert.equal(state.sides.enemy.hand.length, 5);
  assert.equal(state.sides.player.deck.length, deckBefore);
  assert.equal(state.sides.player.hand.length, handBefore);
});

test('playableZones only offers empty zones and shrinks as cards are played', () => {
  const game = createGame({ seed: 10 });
  game.sides.player.energy = 10;
  assert.equal(playableZones(game, 'player').length, ZONES_PER_SIDE);

  const card = game.sides.player.hand[0];
  const { state } = playCard(game, 'player', card.uid, zoneIndex(2, 3));
  const zones = playableZones(state, 'player');
  assert.equal(zones.length, ZONES_PER_SIDE - 1);
  assert.ok(!zones.includes(zoneIndex(2, 3)));
});

test('aiTurn plays a full turn and leaves the input untouched', () => {
  const game = createGame({ seed: 11, first: 'enemy' });
  const snapshot = structuredClone(game);

  const { state, steps } = aiTurn(game, 'enemy');

  assert.ok(steps.length > 0);
  assert.equal(game.turn, 'enemy');
  assert.deepEqual(game, snapshot);
  assert.notEqual(state, game);
  assert.equal(state.turn, 'player');
  assert.ok(state.turnNumber >= 2);
  assert.equal(state.phase, 'playing');
});

test('simulate always finishes with a valid 24-zone state', () => {
  const { state, turns } = simulate(2026);

  assert.ok(turns > 0);
  assert.ok(turns <= 80);
  assert.ok(['playing', 'over'].includes(state.phase));
  if (state.phase === 'over') {
    assert.ok(['player', 'enemy', 'draw'].includes(state.winner));
    assert.ok(state.sides.player.lp <= 0 || state.sides.enemy.lp <= 0);
  }
  for (const side of ['player', 'enemy']) {
    assert.equal(state.sides[side].field.length, ZONES_PER_SIDE);
    assert.ok(state.sides[side].lp >= 0);
  }
});
