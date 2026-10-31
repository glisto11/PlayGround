/* Simple heuristic CPU opponent. Returns one action per call. */

const other = s => (s === 'you' ? 'opp' : 'you');

function emptyZone(arr) {
  const i = arr.findIndex(z => !z);
  return i;
}

function handOfKind(duel, side, kind) {
  return duel.hand[side].filter(c => c.kind === kind);
}

export function aiChoose(duel, side = 'opp') {
  if (!duel || duel.winner || duel.turn !== side) return { type: 'end' };
  const enemy = other(side);
  const own = duel.ownMonsters(side);
  const enemyMons = duel.ownMonsters(enemy);
  const hand = duel.hand[side];

  /* 1. Extra summon when the board is wide enough */
  if (!duel.flags.extraSummoned && duel.extra[side].length && own.length >= 3) {
    const slot = duel.emz.findIndex(e => !e);
    if (slot >= 0) {
      const ex = duel.extra[side].slice().sort((a, b) => b.atk - a.atk)[0];
      return { type: 'extra', uid: ex.uid, slot };
    }
  }

  /* 2. Release-based special summon (u成.VD11) */
  const specialCard = hand.find(c => c.kind === 'monster' && c.specialSummon);
  if (specialCard) {
    const zone = emptyZone(duel.field[side].monster);
    const check = duel.canSpecialSummon(side, specialCard.uid);
    if (zone >= 0 && check.ok) {
      const release = own
        .slice()
        .sort((a, b) => duel.defOf(side, a.entry) - duel.defOf(side, b.entry))[0];
      const releasedDef = release ? duel.defOf(side, release.entry) : 0;
      const worthIt = release && releasedDef <= 1200 && (own.length >= 2 || releasedDef <= 800);
      if (worthIt) {
        return {
          type: 'special', uid: specialCard.uid, zone,
          releaseKind: release.kind, releaseIdx: release.idx,
        };
      }
    }
  }

  /* 3. Normal summon — pick the strongest affordable monster */
  if (!duel.flags.summoned) {
    const zone = emptyZone(duel.field[side].monster);
    if (zone >= 0) {
      const candidates = hand
        .filter(c => c.kind === 'monster' && !c.extra && !c.specialSummon)
        .map(c => {
          const need = duel.tributesNeeded(c.level);
          const tributes = own
            .filter(m => m.kind === 'monster')
            .slice()
            .sort((a, b) => duel.atkOf(side, a.entry) - duel.atkOf(side, b.entry))
            .slice(0, need);
          const cost = tributes.reduce((sum, t) => sum + duel.atkOf(side, t.entry), 0);
          return { card: c, need, cost, affordable: own.length >= need && tributes.length === need };
        })
        .filter(x => x.affordable)
        .filter(x => x.need === 0 || x.card.atk + duel.fieldBonus(side).atk > x.cost + 400)
        .sort((a, b) => (b.card.atk - b.cost) - (a.card.atk - a.cost));
      if (candidates.length) {
        const pick = candidates[0];
        return { type: 'summon', uid: pick.card.uid, zone, mode: 'atk' };
      }
    }
  }

  /* 4. Field spell if none active */
  if (!duel.field[side].field) {
    const fieldSpell = handOfKind(duel, side, 'spell').find(c => c.spellType === 'field');
    if (fieldSpell) return { type: 'activateSpell', uid: fieldSpell.uid };
  }

  /* 5. Activate a useful normal spell */
  const spells = handOfKind(duel, side, 'spell').filter(c => c.spellType !== 'field');
  const sorted = spells.slice().sort((a, b) => spellScore(duel, side, b) - spellScore(duel, side, a));
  for (const spell of sorted) {
    if (spellScore(duel, side, spell) > 0) return { type: 'activateSpell', uid: spell.uid };
  }

  /* 6. Set one trap if we have none face-down */
  const hasTrapSet = duel.field[side].spell.some(e => e && e.faceDown && e.card.kind === 'trap');
  if (!hasTrapSet) {
    const trap = handOfKind(duel, side, 'trap')[0];
    const zone = emptyZone(duel.field[side].spell);
    if (trap && zone >= 0) return { type: 'set', uid: trap.uid, zone };
  }

  /* 7. Reveal a set spell */
  const setSpell = duel.field[side].spell
    .map((e, i) => ({ e, i }))
    .find(x => x.e && x.e.faceDown && x.e.card.kind === 'spell');
  if (setSpell) return { type: 'activateSet', zone: setSpell.i };

  /* 8. Attacks */
  const attackers = own
    .filter(m => !m.entry.faceDown && m.entry.position === 'atk' && !m.entry.attacked)
    .sort((a, b) => duel.atkForAttack(side, b.entry) - duel.atkForAttack(side, a.entry));

  if (attackers.length) {
    if (!enemyMons.length) {
      return { type: 'attack', kind: attackers[0].kind, idx: attackers[0].idx, target: { kind: 'direct' } };
    }
    let best = null;
    for (const a of attackers) {
      const atk = duel.atkForAttack(side, a.entry);
      const immune = !!a.entry.card.battle?.indestructible;
      const redirect = !!a.entry.card.battle?.redirectDamage;
      for (const t of enemyMons) {
        const tAtk = duel.atkOf(enemy, t.entry);
        const tDef = duel.defOf(enemy, t.entry);
        let score = -999;
        let damage = 0;
        if (t.entry.faceDown || t.entry.position === 'def') {
          if (atk > tDef) score = 520 + atk * 0.1;
          else if (immune) { score = 300 + (tDef - atk) * 0.5; damage = tDef - atk; }
          else score = -200 - (tDef - atk);
        } else {
          const diff = atk - tAtk;
          if (diff > 0) { score = 700 + diff; damage = diff; }
          else if (diff === 0) score = immune ? 450 : (atk >= 2500 ? 300 : -300);
          else if (immune) { score = 300 + (-diff) * 0.5; damage = -diff; }
          else score = -400 + diff;
        }
        if (redirect && damage > 0) score += 60;
        if (a.entry.card.effect?.trigger === 'attack') score += 180;
        if (score > (best?.score ?? 0)) best = { a, t, score, damage };
      }
    }
    if (best && best.score > 0) {
      return { type: 'attack', kind: best.a.kind, idx: best.a.idx, target: { kind: best.t.kind, idx: best.t.idx } };
    }
  }

  return { type: 'end' };
}

function spellScore(duel, side, card) {
  const enemy = other(side);
  const ops = card.effect?.ops || [];
  let score = 50;
  for (const op of ops) {
    if (op.t === 'burn') {
      score += 80 + op.n / 10;
      if (duel.lp[enemy] <= op.n) score += 500;
    }
    if (op.t === 'heal') {
      if (duel.lp[side] < 4000) score += 40 + op.n / 20;
      else score -= 20;
    }
    if (op.t === 'draw') score += 35 * op.n;
    if (op.t === 'selfDamage') {
      score -= op.n / 8;
      if (duel.lp[side] <= op.n + 500) score -= 1000;
    }
    if (op.t === 'destroy') {
      const enemyMons = duel.ownMonsters(enemy);
      if (enemyMons.length) {
        const top = Math.max(...enemyMons.map(m => duel.atkOf(enemy, m.entry)));
        if (top >= 2000) score += 90;
        else score += 20;
      } else score -= 200;
    }
  }
  if (card.spellType === 'field') score += 40;
  return score;
}
