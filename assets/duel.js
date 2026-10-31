import { createDeck } from './cards.js';

export const MAX_LP = 4000;
export const MAX_ENERGY = 6;
export const BOARD_ZONES = 24;

export class Duel {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.lp = { player: MAX_LP, ai: MAX_LP };
    this.zones = Array.from({ length: BOARD_ZONES }, (_, id) => ({
      id,
      row: Math.floor(id / 6),
      col: id % 6,
      owner: Math.floor(id / 6) < 2 ? 'ai' : 'player',
      unit: null,
    }));
    this.deck = { player: [], ai: [] };
    this.hand = { player: [], ai: [] };
    this.grave = { player: [], ai: [] };
    this.energy = { player: 0, ai: 0 };
    this.turns = { player: 0, ai: 0 };
    this.globalTurn = 0;
    this.active = 'player';
    this.over = false;
    this.winner = null;
    this.uid = 0;
    this.stats = {
      player: { played: 0, damage: 0, destroyed: 0, lost: 0, healed: 0 },
      ai: { played: 0, damage: 0, destroyed: 0, lost: 0, healed: 0 },
    };
  }

  setup() {
    this.deck.player = createDeck(this.rng);
    this.deck.ai = createDeck(this.rng);
    this.hand.player = [];
    this.hand.ai = [];
    this.draw('player', 5);
    this.draw('ai', 5);
    return this;
  }

  other(owner) {
    return owner === 'player' ? 'ai' : 'player';
  }

  zoneById(id) {
    return this.zones[id] || null;
  }

  units(owner) {
    return this.zones.filter(zone => zone.owner === owner && zone.unit).map(zone => zone.unit);
  }

  emptyZones(owner) {
    return this.zones.filter(zone => zone.owner === owner && !zone.unit);
  }

  draw(owner, count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i += 1) {
      if (!this.deck[owner].length) break;
      const card = this.deck[owner].pop();
      if (this.hand[owner].length >= 8) {
        this.grave[owner].push(card);
      } else {
        this.hand[owner].push(card);
        drawn.push(card);
      }
    }
    return drawn;
  }

  startTurn(owner) {
    if (this.over) return null;
    this.active = owner;
    this.turns[owner] += 1;
    this.globalTurn += 1;
    this.energy[owner] = Math.min(MAX_ENERGY, 2 + this.turns[owner]);
    for (const unit of this.units(owner)) unit.hasAttacked = false;
    const drawn = this.draw(owner, 1);
    return {
      owner,
      turn: this.turns[owner],
      globalTurn: this.globalTurn,
      energy: this.energy[owner],
      drawn,
    };
  }

  endTurn() {
    this.active = this.other(this.active);
    return this.active;
  }

  canPlay(owner, handIndex, zoneId) {
    if (this.over) return { ok: false, reason: 'デュエルは終了しています。' };
    if (this.active !== owner) return { ok: false, reason: 'あなたのターンではありません。' };
    const zone = this.zoneById(zoneId);
    if (!zone) return { ok: false, reason: 'ゾーンが存在しません。' };
    if (zone.owner !== owner) return { ok: false, reason: '相手のテリトリーには配置できません。' };
    if (zone.unit) return { ok: false, reason: 'このゾーンは使用中です。' };
    const card = this.hand[owner][handIndex];
    if (!card) return { ok: false, reason: 'カードがありません。' };
    if (card.cost > this.energy[owner]) return { ok: false, reason: 'ENERGY が足りません。' };
    return { ok: true, card };
  }

  playCard(owner, handIndex, zoneId) {
    const check = this.canPlay(owner, handIndex, zoneId);
    if (!check.ok) throw new Error(check.reason);
    const card = check.card;
    const zone = this.zoneById(zoneId);
    this.hand[owner].splice(handIndex, 1);
    this.energy[owner] -= card.cost;
    const unit = {
      uid: ++this.uid,
      owner,
      card,
      zoneId,
      hasAttacked: false,
      summonedTurn: this.turns[owner],
    };
    zone.unit = unit;
    this.stats[owner].played += 1;

    const event = {
      owner,
      unit,
      card,
      zoneId,
      damage: 0,
      linked: null,
      heal: 0,
    };

    if (card.flare) {
      event.damage = this.damage(owner, card.flare);
      event.heal = 0;
    }
    if (card.link && !this.over) {
      const drawn = this.draw(owner, 1);
      event.linked = drawn[0] || null;
    }
    this.checkOver();
    return event;
  }

  auraBonus(unit) {
    const zone = this.zoneById(unit.zoneId);
    if (!zone) return 0;
    let bonus = 0;
    for (const other of this.zones) {
      if (other.row !== zone.row || other.owner !== unit.owner) continue;
      if (!other.unit || other.unit.uid === unit.uid) continue;
      if (Math.abs(other.col - zone.col) !== 1) continue;
      bonus += other.unit.card.aura || 0;
    }
    return bonus;
  }

  effectiveAtk(unit) {
    return unit.card.atk + this.auraBonus(unit);
  }

  canAttack(unit) {
    if (!unit || this.over) return false;
    if (unit.owner !== this.active) return false;
    if (unit.hasAttacked) return false;
    if (unit.summonedTurn >= this.turns[unit.owner]) return false;
    return true;
  }

  findDefender(owner, col) {
    const rows = owner === 'player' ? [1, 0] : [2, 3];
    for (const row of rows) {
      const zone = this.zones[row * 6 + col];
      if (zone?.unit) return zone.unit;
    }
    return null;
  }

  previewAttack(owner, fromZoneId, targetZoneId = null) {
    if (this.over) return null;
    if (this.active !== owner) return null;
    const fromZone = this.zoneById(fromZoneId);
    if (!fromZone?.unit || fromZone.unit.owner !== owner) return null;
    const unit = fromZone.unit;
    if (!this.canAttack(unit)) return null;

    if (targetZoneId !== null) {
      const targetZone = this.zoneById(targetZoneId);
      if (!targetZone || targetZone.owner === owner || targetZone.col !== fromZone.col) return null;
    }

    const defender = this.findDefender(owner, fromZone.col);
    const atk = this.effectiveAtk(unit);
    const def = defender?.card.def ?? 0;
    const opponent = this.other(owner);
    let destroyAttacker = false;
    let destroyDefender = false;
    let lpDamage = 0;
    let mode = 'direct';

    if (defender) {
      mode = 'unit';
      if (atk > def) {
        destroyDefender = true;
        lpDamage = unit.card.pierce ? atk - def : 0;
      } else if (atk === def) {
        destroyDefender = true;
        destroyAttacker = true;
      } else {
        destroyAttacker = true;
      }
    } else {
      lpDamage = atk;
    }

    const heal = lpDamage > 0 && unit.card.drain
      ? Math.min(unit.card.drain, this.lp[opponent], MAX_LP - this.lp[owner])
      : 0;

    return {
      owner,
      unit,
      attackerZoneId: fromZoneId,
      defender,
      defenderZoneId: defender ? defender.zoneId : null,
      targetZoneId: defender ? defender.zoneId : null,
      atk,
      def,
      mode,
      lpDamage,
      heal,
      destroyAttacker,
      destroyDefender,
      lethal: lpDamage > 0 && lpDamage >= this.lp[opponent],
      badTrade: destroyAttacker && !destroyDefender,
    };
  }

  destroyUnit(unit) {
    const zone = this.zoneById(unit.zoneId);
    if (!zone || zone.unit?.uid !== unit.uid) return;
    zone.unit = null;
    this.grave[unit.owner].push(unit.card);
    this.stats[unit.owner].lost += 1;
    this.stats[this.other(unit.owner)].destroyed += 1;
  }

  damage(sourceOwner, amount) {
    const target = this.other(sourceOwner);
    const actual = Math.min(this.lp[target], Math.max(0, amount));
    this.lp[target] -= actual;
    this.stats[sourceOwner].damage += actual;
    this.checkOver();
    return actual;
  }

  heal(owner, amount) {
    if (this.over) return 0;
    const actual = Math.min(Math.max(0, amount), MAX_LP - this.lp[owner]);
    this.lp[owner] += actual;
    this.stats[owner].healed += actual;
    return actual;
  }

  attack(owner, fromZoneId, targetZoneId = null) {
    const preview = this.previewAttack(owner, fromZoneId, targetZoneId);
    if (!preview) return null;
    const unit = preview.unit;
    unit.hasAttacked = true;

    if (preview.destroyDefender && preview.defender) this.destroyUnit(preview.defender);
    if (preview.destroyAttacker) this.destroyUnit(unit);

    let actualLpDamage = 0;
    let healed = 0;
    if (preview.lpDamage > 0) {
      actualLpDamage = this.damage(owner, preview.lpDamage);
      if (actualLpDamage > 0 && unit.card.drain) {
        healed = this.heal(owner, unit.card.drain);
      }
    }
    this.checkOver();
    return { ...preview, actualLpDamage, healed };
  }

  checkOver() {
    if (this.over) return this.winner;
    if (this.lp.ai <= 0) {
      this.lp.ai = 0;
      this.over = true;
      this.winner = 'player';
    } else if (this.lp.player <= 0) {
      this.lp.player = 0;
      this.over = true;
      this.winner = 'ai';
    }
    return this.winner;
  }

  /* ------------------------- AI ------------------------- */

  aiCardValue(card) {
    return (
      card.atk * 1.0
      + card.def * 0.34
      + (card.flare || 0) * 0.9
      + (card.drain || 0) * 0.4
      + (card.link ? 260 : 0)
      + (card.pierce ? 220 : 0)
      + (card.aura || 0) * 0.55
    ) / Math.max(1, card.cost);
  }

  aiPlanCard() {
    if (this.over || this.active !== 'ai') return null;
    const options = this.hand.ai
      .map((card, handIndex) => ({ card, handIndex }))
      .filter(option => option.card.cost <= this.energy.ai)
      .sort((a, b) => this.aiCardValue(b.card) - this.aiCardValue(a.card));
    if (!options.length) return null;

    const empty = this.emptyZones('ai');
    if (!empty.length) return null;

    const front = empty.filter(zone => zone.row === 1);
    const back = empty.filter(zone => zone.row === 0);
    const contest = front.filter(zone => {
      const target = this.zones[2 * 6 + zone.col]?.unit || this.zones[3 * 6 + zone.col]?.unit;
      return Boolean(target);
    });

    let pool = contest.length ? contest : front.length ? front : back;
    if (!pool.length) pool = empty;
    const zone = pool[Math.floor(this.rng() * pool.length)] || pool[0];
    return { handIndex: options[0].handIndex, card: options[0].card, zoneId: zone.id };
  }

  aiBestAttack() {
    if (this.over || this.active !== 'ai') return null;
    let best = null;
    for (const unit of this.units('ai')) {
      if (!this.canAttack(unit)) continue;
      const zone = this.zoneById(unit.zoneId);
      const defender = this.findDefender('ai', zone.col);
      const atk = this.effectiveAtk(unit);
      let score = -1;
      if (!defender) {
        score = 500 + atk / 8;
        if (atk >= this.lp.player) score += 100000;
      } else if (atk > defender.card.def) {
        const overflow = unit.card.pierce ? atk - defender.card.def : 0;
        score = 700 + (atk - defender.card.def) / 10 + defender.card.atk / 16 + overflow / 6;
        if (overflow >= this.lp.player) score += 100000;
      } else if (atk === defender.card.def) {
        score = 250 + defender.card.atk / 18;
      } else {
        score = -1000;
      }
      if (score > (best?.score ?? -Infinity)) {
        best = {
          fromZoneId: unit.zoneId,
          targetZoneId: defender ? defender.zoneId : null,
          col: zone.col,
          score,
          defender,
          atk,
        };
      }
    }
    return best && best.score > 0 ? best : null;
  }
}
