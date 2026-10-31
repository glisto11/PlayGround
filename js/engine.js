/* Duel engine — deterministic rules, 24 zones, LP0 victory. */

import { makeDeck, shuffle } from './cards.js';

export class DuelError extends Error {}

const other = s => (s === 'you' ? 'opp' : 'you');

export const ZONE_COUNT = 24;

export const ZONE_MAP = {
  youMonster: [1, 2, 3, 4, 5],
  youSpell: [6, 7, 8, 9, 10],
  youField: 11,
  oppMonster: [12, 13, 14, 15, 16],
  oppSpell: [17, 18, 19, 20, 21],
  oppField: 22,
  emz: [23, 24],
};

export class Duel {
  constructor({ playerName = 'YOU', oppName = 'OPPONENT', deckId = 'flame', oppDeckId = 'abyss', lp = 8000, mode = 'solo', first = null } = {}) {
    this.mode = mode;
    this.names = { you: playerName, opp: oppName };
    this.deckIds = { you: deckId, opp: oppDeckId };
    this.startLp = lp;

    const playerDeck = makeDeck(deckId);
    const oppDeck = makeDeck(oppDeckId);

    this.deck = { you: shuffle(playerDeck.main), opp: shuffle(oppDeck.main) };
    this.extra = { you: shuffle(playerDeck.extra), opp: shuffle(oppDeck.extra) };
    this.hand = { you: [], opp: [] };
    this.gy = { you: [], opp: [] };
    this.banished = { you: [], opp: [] };

    this.field = {
      you: { monster: Array(5).fill(null), spell: Array(5).fill(null), field: null },
      opp: { monster: Array(5).fill(null), spell: Array(5).fill(null), field: null },
    };
    this.emz = [null, null];

    this.lp = { you: lp, opp: lp };
    this.turn = first || (Math.random() < 0.5 ? 'you' : 'opp');
    this.turnNo = 1;
    this.flags = { summoned: false, extraSummoned: false };
    this.winner = null;
    this.logs = [];
    this.overReason = null;

    this.log(`デュエル開始 — 24ゾーン / LP0勝利`, 'system');
    this.log(`${this.names[this.turn]} が先攻`, 'system');
    this.draw('you', 5);
    this.draw('opp', 5);
    this.log('双方5枚をドローして開始', 'system');
  }

  /* ---------------- helpers ---------------- */
  get currentName() { return this.names[this.turn]; }
  lpOf(side) { return Math.max(0, Math.round(this.lp[side])); }
  enemy(side) { return other(side); }

  log(text, tone = 'info') {
    this.logs.push({ text, tone, turn: this.turnNo, side: this.turn });
    if (this.logs.length > 240) this.logs.shift();
  }

  requireTurn(side) {
    if (this.winner) throw new DuelError('デュエルは終了しています');
    if (this.turn !== side) throw new DuelError('相手のターンです');
  }

  handCard(side, uid) {
    return this.hand[side].find(c => c.uid === uid) || null;
  }

  entryAt(side, kind, idx) {
    if (kind === 'monster') return this.field[side].monster[idx] || null;
    if (kind === 'spell') return this.field[side].spell[idx] || null;
    if (kind === 'field') return this.field[side].field;
    if (kind === 'emz') {
      const e = this.emz[idx];
      return e && e.owner === side ? e : null;
    }
    return null;
  }

  zoneEmptyFor(side, kind, idx) {
    if (kind === 'monster') return !this.field[side].monster[idx];
    if (kind === 'spell') return !this.field[side].spell[idx];
    if (kind === 'field') return true;
    if (kind === 'emz') return !this.emz[idx];
    return false;
  }

  ownMonsters(side) {
    const out = [];
    this.field[side].monster.forEach((e, i) => { if (e) out.push({ kind: 'monster', idx: i, entry: e }); });
    this.emz.forEach((e, i) => { if (e && e.owner === side) out.push({ kind: 'emz', idx: i, entry: e }); });
    return out;
  }

  enemyMonsters(side) { return this.ownMonsters(other(side)); }

  fieldBonus(side) {
    const f = this.field[side].field;
    return (f && f.card.field) || { atk: 0, def: 0 };
  }

  atkOf(side, entry) {
    if (!entry) return 0;
    return Math.max(0, (entry.card.atk || 0) + (entry.atkMod || 0) + this.fieldBonus(side).atk);
  }

  defOf(side, entry) {
    if (!entry) return 0;
    return Math.max(0, (entry.card.def || 0) + (entry.defMod || 0) + this.fieldBonus(side).def);
  }

  tributesNeeded(level) {
    if (level >= 7) return 2;
    if (level >= 5) return 1;
    return 0;
  }

  canExtraSummon(side) {
    return !this.winner && this.turn === side && !this.flags.extraSummoned
      && this.extra[side].length > 0
      && this.ownMonsters(side).length >= 2
      && this.emz.some(e => !e);
  }

  /* ---------------- core mutations ---------------- */
  damage(side, amount, ev = [], reason = 'damage') {
    const n = Math.max(0, Math.round(amount));
    if (!n || this.winner) return;
    this.lp[side] = Math.max(0, this.lp[side] - n);
    ev.push({ type: 'damage', side, amount: n, lp: this.lp[side], reason });
    this.log(`${this.names[side]} に ${n} ダメージ（LP ${this.lp[side]}）`, 'damage');
    this.checkWin(ev);
  }

  heal(side, amount, ev = []) {
    const n = Math.max(0, Math.round(amount));
    if (!n || this.winner) return;
    this.lp[side] = Math.min(99999, this.lp[side] + n);
    ev.push({ type: 'heal', side, amount: n, lp: this.lp[side] });
    this.log(`${this.names[side]} は ${n} LP回復（LP ${this.lp[side]}）`, 'heal');
  }

  checkWin(ev) {
    if (this.winner) return;
    for (const side of ['you', 'opp']) {
      if (this.lp[side] <= 0) {
        this.winner = other(side);
        this.overReason = `${this.names[side]}のLPが0`;
        ev.push({ type: 'win', winner: this.winner, loser: side, reason: this.overReason });
        this.log(`${this.names[side]} のLPが0 — ${this.names[this.winner]} の勝利`, 'win');
        return;
      }
    }
  }

  draw(side, n = 1, ev = []) {
    for (let i = 0; i < n; i++) {
      if (this.winner) break;
      if (!this.deck[side].length) {
        this.winner = other(side);
        this.overReason = `${this.names[side]}のデッキ切れ`;
        ev.push({ type: 'deckout', side });
        ev.push({ type: 'win', winner: this.winner, loser: side, reason: this.overReason });
        this.log(`${this.names[side]} はデッキ切れ — ${this.names[this.winner]} の勝利`, 'win');
        break;
      }
      const card = this.deck[side].pop();
      this.hand[side].push(card);
      ev.push({ type: 'draw', side, card, uid: card.uid });
    }
    return ev;
  }

  destroyEntry(side, kind, idx, ev = [], reason = 'effect') {
    const entry = this.entryAt(side, kind, idx);
    if (!entry) return null;
    if (kind === 'monster') this.field[side].monster[idx] = null;
    else if (kind === 'spell') this.field[side].spell[idx] = null;
    else if (kind === 'field') this.field[side].field = null;
    else if (kind === 'emz') this.emz[idx] = null;
    else return null;
    this.gy[side].push(entry.card);
    ev.push({ type: 'destroy', side, kind, idx, card: entry.card, uid: entry.card.uid, reason });
    return entry;
  }

  sendToGy(side, entry, ev = [], reason = 'activate') {
    this.gy[side].push(entry.card);
    ev.push({ type: 'toGY', side, card: entry.card, uid: entry.card.uid, reason });
  }

  resolveOps(side, ops = [], ev = [], ctx = {}) {
    const enemy = other(side);
    for (const op of ops) {
      if (this.winner) break;
      switch (op.t) {
        case 'burn':
          this.damage(enemy, op.n, ev, 'effect');
          break;
        case 'selfDamage':
          this.damage(side, op.n, ev, 'effect');
          break;
        case 'heal':
          this.heal(side, op.n, ev);
          break;
        case 'draw':
          this.draw(side, op.n, ev);
          break;
        case 'buff': {
          const targets = this.ownMonsters(side).filter(m => !m.entry.faceDown);
          if (!targets.length) { this.log('ATKを上げるモンスターがいない', 'info'); break; }
          for (const m of targets) {
            m.entry.atkMod = (m.entry.atkMod || 0) + op.n;
            ev.push({ type: 'buff', side, kind: m.kind, idx: m.idx, uid: m.entry.card.uid, amount: op.n });
          }
          this.log(`自分モンスター${targets.length}体のATKが${op.n}アップ`, 'buff');
          break;
        }
        case 'destroy': {
          const all = this.ownMonsters(enemy);
          if (!all.length) { this.log('破壊できるモンスターがいない', 'info'); break; }
          const top = all.slice().sort((a, b) => this.atkOf(enemy, b.entry) - this.atkOf(enemy, a.entry))[0];
          this.log(`効果で ${top.entry.card.name} を破壊`, 'destroy');
          this.destroyEntry(enemy, top.kind, top.idx, ev, 'effect');
          break;
        }
        case 'destroyEnemySpell': {
          const zones = this.field[enemy].spell;
          let hit = -1;
          for (let i = 0; i < zones.length; i++) if (zones[i]) { hit = i; break; }
          if (hit < 0) { this.log('破壊できる魔法・罠がない', 'info'); break; }
          this.log(`効果で ${this.field[enemy].spell[hit].card.name} を破壊`, 'destroy');
          this.destroyEntry(enemy, 'spell', hit, ev, 'effect');
          break;
        }
        case 'destroyAttacker': {
          const a = ctx.attacker;
          if (a && this.entryAt(a.side, a.kind, a.idx)?.card.uid === a.uid) {
            this.log(`罠で攻撃モンスター ${this.entryAt(a.side, a.kind, a.idx).card.name} を破壊`, 'destroy');
            this.destroyEntry(a.side, a.kind, a.idx, ev, 'trap');
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /* ---------------- summoning ---------------- */
  normalSummon(side, uid, zoneIdx, mode = 'atk', ev = []) {
    this.requireTurn(side);
    if (this.flags.summoned) throw new DuelError('このターンは既に通常召喚しています');
    const handIdx = this.hand[side].findIndex(c => c.uid === uid);
    if (handIdx < 0) throw new DuelError('そのカードは手札にありません');
    const card = this.hand[side][handIdx];
    if (card.kind !== 'monster') throw new DuelError('モンスターカードではありません');
    if (card.extra) throw new DuelError('EXモンスターはEX召喚でのみ出せます');
    if (zoneIdx < 0 || zoneIdx > 4) throw new DuelError('ゾーン指定が不正です');
    if (this.field[side].monster[zoneIdx]) throw new DuelError('そのモンスターゾーンは使用中です');

    const need = this.tributesNeeded(card.level);
    const own = this.ownMonsters(side);
    if (own.length < need) throw new DuelError(`このカードの召喚には生贄が${need}体必要です`);

    if (need > 0) {
      const picks = own
        .slice()
        .sort((a, b) => this.atkOf(side, a.entry) - this.atkOf(side, b.entry))
        .slice(0, need);
      for (const p of picks) {
        const name = p.entry.card.name;
        this.destroyEntry(side, p.kind, p.idx, ev, 'tribute');
        this.log(`${name} を生贄に捧げた`, 'tribute');
      }
    }

    this.hand[side].splice(handIdx, 1);
    const entry = {
      card, position: mode === 'set' ? 'def' : 'atk', faceDown: mode === 'set',
      atkMod: 0, defMod: 0, attacked: false, summonedTurn: this.turnNo, owner: side,
    };
    this.field[side].monster[zoneIdx] = entry;
    this.flags.summoned = true;
    ev.push({ type: 'summon', side, card, uid: card.uid, kind: 'monster', idx: zoneIdx, mode, tributes: need });
    this.log(mode === 'set' ? `${card.name} をセット（守備）` : `${card.name} を召喚（ATK ${this.atkOf(side, entry)}）`, 'summon');

    if (mode !== 'set' && card.effect?.trigger === 'summon') this.resolveOps(side, card.effect.ops, ev, { entry });
    this.checkWin(ev);
    return ev;
  }

  extraSummon(side, extraUid, slot, ev = []) {
    this.requireTurn(side);
    if (this.flags.extraSummoned) throw new DuelError('このターンは既にEX召喚しています');
    const exIdx = this.extra[side].findIndex(c => c.uid === extraUid);
    if (exIdx < 0) throw new DuelError('EXデッキにそのカードはありません');
    if (slot !== 0 && slot !== 1) throw new DuelError('EXゾーン指定が不正です');
    if (this.emz[slot]) throw new DuelError('そのEXゾーンは使用中です');
    const own = this.ownMonsters(side);
    if (own.length < 2) throw new DuelError('EX召喚にはモンスター2体の生贄が必要です');

    const picks = own.slice().sort((a, b) => this.atkOf(side, a.entry) - this.atkOf(side, b.entry)).slice(0, 2);
    for (const p of picks) {
      const name = p.entry.card.name;
      this.destroyEntry(side, p.kind, p.idx, ev, 'tribute');
      this.log(`${name} をEX召喚の生贄に捧げた`, 'tribute');
    }

    const [card] = this.extra[side].splice(exIdx, 1);
    const entry = {
      card, position: 'atk', faceDown: false, atkMod: 0, defMod: 0,
      attacked: false, summonedTurn: this.turnNo, owner: side,
    };
    this.emz[slot] = entry;
    this.flags.extraSummoned = true;
    ev.push({ type: 'extraSummon', side, card, uid: card.uid, kind: 'emz', idx: slot, mode: 'atk' });
    this.log(`EX召喚！ ${card.name} が中央ゾーンに降臨（ATK ${this.atkOf(side, entry)}）`, 'summon');
    if (card.effect?.trigger === 'summon') this.resolveOps(side, card.effect.ops, ev, { entry });
    this.checkWin(ev);
    return ev;
  }

  /* ---------------- spells / traps ---------------- */
  setSpellTrap(side, uid, zoneIdx, ev = []) {
    this.requireTurn(side);
    const handIdx = this.hand[side].findIndex(c => c.uid === uid);
    if (handIdx < 0) throw new DuelError('そのカードは手札にありません');
    const card = this.hand[side][handIdx];
    if (card.kind !== 'spell' && card.kind !== 'trap') throw new DuelError('魔法・罠カードではありません');
    if (card.spellType === 'field') throw new DuelError('フィールド魔法はセットできません');
    if (zoneIdx < 0 || zoneIdx > 4) throw new DuelError('ゾーン指定が不正です');
    if (this.field[side].spell[zoneIdx]) throw new DuelError('その魔法・罠ゾーンは使用中です');

    this.hand[side].splice(handIdx, 1);
    this.field[side].spell[zoneIdx] = {
      card, position: 'set', faceDown: true, atkMod: 0, defMod: 0,
      summonedTurn: this.turnNo, owner: side,
    };
    ev.push({ type: 'set', side, card, uid: card.uid, kind: 'spell', idx: zoneIdx, cardKind: card.kind });
    this.log(`${card.name} をセット`, 'set');
    return ev;
  }

  activateHandSpell(side, uid, zoneIdx = -1, ev = []) {
    this.requireTurn(side);
    const handIdx = this.hand[side].findIndex(c => c.uid === uid);
    if (handIdx < 0) throw new DuelError('そのカードは手札にありません');
    const card = this.hand[side][handIdx];
    if (card.kind !== 'spell') throw new DuelError('魔法カードではありません');
    if (card.spellType === 'field') {
      this.hand[side].splice(handIdx, 1);
      const old = this.field[side].field;
      if (old) {
        this.gy[side].push(old.card);
        ev.push({ type: 'toGY', side, card: old.card, uid: old.card.uid, reason: 'replace' });
      }
      this.field[side].field = {
        card, position: 'atk', faceDown: false, atkMod: 0, defMod: 0,
        summonedTurn: this.turnNo, owner: side,
      };
      ev.push({ type: 'activate', side, card, uid: card.uid, kind: 'field', idx: 0, field: true });
      this.log(`フィールド魔法「${card.name}」を発動`, 'spell');
      if (card.effect?.trigger === 'activate') this.resolveOps(side, card.effect.ops, ev, {});
      this.checkWin(ev);
      return ev;
    }

    if (zoneIdx < 0 || zoneIdx > 4) {
      zoneIdx = this.field[side].spell.findIndex(z => !z);
      if (zoneIdx < 0) zoneIdx = 0;
    }
    this.hand[side].splice(handIdx, 1);
    ev.push({ type: 'activate', side, card, uid: card.uid, kind: 'spell', idx: zoneIdx });
    this.log(`魔法「${card.name}」を発動`, 'spell');
    if (card.effect?.trigger === 'activate') this.resolveOps(side, card.effect.ops, ev, {});
    this.gy[side].push(card);
    ev.push({ type: 'toGY', side, card, uid: card.uid, reason: 'activate' });
    this.checkWin(ev);
    return ev;
  }

  activateSetSpell(side, zoneIdx, ev = []) {
    this.requireTurn(side);
    const entry = this.field[side].spell[zoneIdx];
    if (!entry) throw new DuelError('そのゾーンにカードがありません');
    if (!entry.faceDown) throw new DuelError('裏側のカードではありません');
    if (entry.card.kind !== 'spell') throw new DuelError('伏せた罠は相手の攻撃時に自動発動します');
    if (entry.card.spellType === 'field') throw new DuelError('フィールド魔法はセットできません');

    entry.faceDown = false;
    ev.push({ type: 'reveal', side, kind: 'spell', idx: zoneIdx, card: entry.card, uid: entry.card.uid });
    this.field[side].spell[zoneIdx] = null;
    this.log(`伏せていた魔法「${entry.card.name}」を発動`, 'spell');
    if (entry.card.effect?.trigger === 'activate') this.resolveOps(side, entry.card.effect.ops, ev, {});
    this.gy[side].push(entry.card);
    ev.push({ type: 'toGY', side, card: entry.card, uid: entry.card.uid, reason: 'activate' });
    this.checkWin(ev);
    return ev;
  }

  triggerTrap(side, attackerRef, ev) {
    const zones = this.field[side].spell;
    for (let i = 0; i < zones.length; i++) {
      const entry = zones[i];
      if (!entry || !entry.faceDown || entry.card.kind !== 'trap') continue;
      entry.faceDown = false;
      ev.push({ type: 'reveal', side, kind: 'spell', idx: i, card: entry.card, uid: entry.card.uid });
      this.log(`${this.names[side]} が罠「${entry.card.name}」を発動！`, 'trap');
      if (entry.card.effect?.trigger === 'attack') {
        this.resolveOps(side, entry.card.effect.ops, ev, { attacker: attackerRef });
      }
      this.field[side].spell[i] = null;
      this.gy[side].push(entry.card);
      ev.push({ type: 'toGY', side, card: entry.card, uid: entry.card.uid, reason: 'trap' });
      return entry.card;
    }
    return null;
  }

  /* ---------------- battle ---------------- */
  attack(side, kind, idx, target, ev = []) {
    this.requireTurn(side);
    const entry = this.entryAt(side, kind, idx);
    if (!entry) throw new DuelError('攻撃するモンスターがいません');
    if (entry.faceDown || entry.position !== 'atk') throw new DuelError('攻撃表示のモンスターでのみ攻撃できます');
    if (entry.attacked) throw new DuelError('このモンスターはこのターン既に攻撃しました');

    const enemy = other(side);
    const enemyMons = this.ownMonsters(enemy);
    if (target.kind === 'direct' && enemyMons.length > 0) {
      throw new DuelError('相手モンスターがいるため直接攻撃できません');
    }
    if (target.kind !== 'direct') {
      const dentry = this.entryAt(enemy, target.kind, target.idx);
      if (!dentry) throw new DuelError('攻撃対象がいません');
    }

    const attackerRef = { side, kind, idx, uid: entry.card.uid };
    const trap = this.triggerTrap(enemy, attackerRef, ev);

    if (this.winner) return ev;

    if (!this.entryAt(side, kind, idx)) {
      ev.push({ type: 'attack', side, kind, idx, attackerUid: entry.card.uid, target, cancelled: true, atk: entry.card.atk });
      this.log('罠によって攻撃が阻止された', 'trap');
      this.checkWin(ev);
      return ev;
    }

    entry.attacked = true;

    if (target.kind === 'direct') {
      const atk = this.atkOf(side, entry);
      this.log(`${entry.card.name} の直接攻撃！ ${atk}ダメージ`, 'attack');
      ev.push({
        type: 'attack', side, kind, idx, attackerUid: entry.card.uid,
        target: { kind: 'direct' }, direct: true, atk, damage: atk, trap: !!trap,
      });
      this.damage(enemy, atk, ev, 'battle');
      this.afterAttack(side, kind, idx, entry, ev);
      return ev;
    }

    const dentry = this.entryAt(enemy, target.kind, target.idx);
    if (!dentry) { ev.push({ type: 'attack', side, kind, idx, attackerUid: entry.card.uid, target, cancelled: true, atk: this.atkOf(side, entry) }); return ev; }
    if (dentry.faceDown) {
      dentry.faceDown = false;
      ev.push({ type: 'reveal', side: enemy, kind: target.kind, idx: target.idx, card: dentry.card, uid: dentry.card.uid });
      this.log(`伏せていた ${dentry.card.name} を公開`, 'reveal');
    }

    const atk = this.atkOf(side, entry);
    const targetAtk = this.atkOf(enemy, dentry);
    const targetDef = this.defOf(enemy, dentry);
    const defPosition = dentry.position === 'def';

    let damage = 0;
    let destroyTarget = false;
    let destroyAttacker = false;

    if (defPosition) {
      if (atk > targetDef) { destroyTarget = true; damage = 0; }
      else if (atk < targetDef) { destroyAttacker = true; damage = targetDef - atk; }
    } else {
      const diff = atk - targetAtk;
      if (diff > 0) { destroyTarget = true; damage = diff; }
      else if (diff < 0) { destroyAttacker = true; damage = -diff; }
      else { destroyAttacker = true; destroyTarget = true; damage = 0; }
    }

    ev.push({
      type: 'attack', side, kind, idx, attackerUid: entry.card.uid, target,
      direct: false, atk, targetAtk, targetDef, defPosition,
      damage, destroyAttacker, destroyTarget, trap: !!trap,
      targetUid: dentry.card.uid,
    });

    if (damage > 0) {
      if (destroyAttacker) this.damage(side, damage, ev, 'battle');
      else this.damage(enemy, damage, ev, 'battle');
    }

    if (destroyTarget) {
      this.log(`${dentry.card.name} を破壊`, 'destroy');
      this.destroyEntry(enemy, target.kind, target.idx, ev, 'battle');
    }
    if (destroyAttacker) {
      this.log(`${entry.card.name} が戦闘で破壊された`, 'destroy');
      this.destroyEntry(side, kind, idx, ev, 'battle');
    }

    if (destroyTarget || destroyAttacker) {
      this.log('戦闘終了', 'battle');
    } else {
      this.log('戦闘では破壊されなかった', 'battle');
    }

    this.afterAttack(side, kind, idx, entry, ev);
    return ev;
  }

  afterAttack(side, kind, idx, entry, ev) {
    const still = this.entryAt(side, kind, idx);
    if (still && still.card.uid === entry.card.uid && entry.card.effect?.trigger === 'attack') {
      this.resolveOps(side, entry.card.effect.ops, ev, {});
    }
    this.checkWin(ev);
  }

  /* ---------------- positions / turn ---------------- */
  changePosition(side, kind, idx, to, ev = []) {
    this.requireTurn(side);
    const entry = this.entryAt(side, kind, idx);
    if (!entry) throw new DuelError('モンスターがいません');
    if (entry.summonedTurn === this.turnNo) throw new DuelError('召喚・セットしたターンは表示形式を変更できません');
    const targetPos = to === 'def' ? 'def' : 'atk';

    if (entry.faceDown) {
      entry.faceDown = false;
      entry.position = targetPos;
      ev.push({ type: 'position', side, kind, idx, uid: entry.card.uid, position: entry.position, flip: true });
      this.log(`${entry.card.name} を反転（${entry.position === 'atk' ? '攻撃' : '守備'}表示）`, 'position');
      if (entry.card.effect?.trigger === 'summon') this.resolveOps(side, entry.card.effect.ops, ev, { entry });
      this.checkWin(ev);
      return ev;
    }

    if (entry.position === targetPos) throw new DuelError('既にその表示形式です');
    entry.position = targetPos;
    ev.push({ type: 'position', side, kind, idx, uid: entry.card.uid, position: targetPos });
    this.log(`${entry.card.name} を${targetPos === 'atk' ? '攻撃' : '守備'}表示に変更`, 'position');
    return ev;
  }

  endTurn(side, ev = []) {
    this.requireTurn(side);
    const next = other(side);
    this.turn = next;
    this.turnNo += 1;
    this.flags = { summoned: false, extraSummoned: false };
    for (const m of this.ownMonsters(next)) m.entry.attacked = false;
    ev.push({ type: 'turn', side: next, turnNo: this.turnNo });
    this.log(`--- ${this.names[next]} のターン（T${this.turnNo}） ---`, 'turn');
    this.draw(next, 1, ev);
    this.checkWin(ev);
    return ev;
  }

  /* ---------------- misc ---------------- */
  totalZones() { return 24; }

  remainingDeck(side) { return this.deck[side].length; }
}
