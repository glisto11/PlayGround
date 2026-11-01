/* Card definitions — text only, no images. */

let UID = 0;
export const nextUid = () => `c${++UID}`;

export const ATTR = {
  fire:   { label: '炎',   color: '#ff7a45', glow: 'rgba(255,90,40,.9)',   glyph: '▲' },
  water:  { label: '水',   color: '#4db8ff', glow: 'rgba(40,150,255,.9)',  glyph: '≈' },
  wind:   { label: '風',   color: '#6bf0c8', glow: 'rgba(40,220,170,.9)',  glyph: '≫' },
  earth:  { label: '地',   color: '#8fd36b', glow: 'rgba(120,190,70,.9)',  glyph: '⬢' },
  light:  { label: '光',   color: '#ffe08a', glow: 'rgba(255,210,100,.9)', glyph: '✧' },
  dark:   { label: '闇',   color: '#b06bff', glow: 'rgba(130,80,255,.9)',  glyph: '☾' },
  spell:  { label: '魔法', color: '#4de3ff', glow: 'rgba(40,190,255,.9)',  glyph: '✦' },
  trap:   { label: '罠',   color: '#ff5ca8', glow: 'rgba(255,50,130,.9)',  glyph: '⊘' },
};

export const CARDS = {
  /* ---------------- monsters ---------------- */
  dragonia: {
    id: 'dragonia', name: '蒼焔竜ドラグニア', kind: 'monster', attribute: 'fire', race: 'ドラゴン',
    level: 7, atk: 2400, def: 1800, rarity: 'UR', glyph: '◈',
    text: '召喚時、相手に600ダメージを与える。蒼い焔で盤面を焼き払う上級竜。',
    effect: { trigger: 'summon', ops: [{ t: 'burn', n: 600 }] },
  },
  ignis: {
    id: 'ignis', name: '紅蓮剣士イグニス', kind: 'monster', attribute: 'fire', race: '戦士',
    level: 4, atk: 1700, def: 1200, rarity: 'R', glyph: '†',
    text: '召喚時、自分フィールドの全モンスターのATKを300上げる。',
    effect: { trigger: 'summon', ops: [{ t: 'buff', n: 300 }] },
  },
  luna: {
    id: 'luna', name: '星詠みの魔女ルナ', kind: 'monster', attribute: 'dark', race: '魔法使い',
    level: 4, atk: 1500, def: 1600, rarity: 'SR', glyph: '☾',
    text: '召喚時、デッキから1枚ドローする。星の導きが手札を増やす。',
    effect: { trigger: 'summon', ops: [{ t: 'draw', n: 1 }] },
  },
  guardian: {
    id: 'guardian', name: '鉄壁のガーディアン', kind: 'monster', attribute: 'earth', race: '岩石',
    level: 4, atk: 800, def: 2200, rarity: 'R', glyph: '⬢',
    text: '召喚時、自分のLPを500回復する。守備力2200の壁。',
    effect: { trigger: 'summon', ops: [{ t: 'heal', n: 500 }] },
  },
  fenrir: {
    id: 'fenrir', name: '疾風のフェンリル', kind: 'monster', attribute: 'wind', race: '獣',
    level: 4, atk: 1900, def: 1200, rarity: 'SR', glyph: '⌁',
    text: '召喚時、相手の魔法・罠ゾーン1枚を破壊する。',
    effect: { trigger: 'summon', ops: [{ t: 'destroyEnemySpell' }] },
  },
  levia: {
    id: 'levia', name: '深海のリヴァイア', kind: 'monster', attribute: 'water', race: '海竜',
    level: 5, atk: 2100, def: 1800, rarity: 'R', glyph: '≋',
    text: '生贄1体。召喚時、相手に500ダメージを与える。',
    effect: { trigger: 'summon', ops: [{ t: 'burn', n: 500 }] },
  },
  nox: {
    id: 'nox', name: '冥府騎士ノクス', kind: 'monster', attribute: 'dark', race: '戦士',
    level: 6, atk: 2300, def: 1700, rarity: 'UR', glyph: '♆',
    text: '生贄1体。召喚時、相手の攻撃力が最も高いモンスター1体を破壊する。',
    effect: { trigger: 'summon', ops: [{ t: 'destroy' }] },
  },
  seraph: {
    id: 'seraph', name: '白光のセラフ', kind: 'monster', attribute: 'light', race: '天使',
    level: 4, atk: 1400, def: 1500, rarity: 'R', glyph: '✧',
    text: '召喚時、自分のLPを800回復する。',
    effect: { trigger: 'summon', ops: [{ t: 'heal', n: 800 }] },
  },
  golem: {
    id: 'golem', name: '大地のゴーレム', kind: 'monster', attribute: 'earth', race: '岩石',
    level: 5, atk: 2000, def: 2400, rarity: 'N', glyph: '⬣',
    text: '生贄1体。守備力2400を誇る重厚な壁。',
    effect: null,
  },
  valkyrie: {
    id: 'valkyrie', name: '雷鳴のヴァルキリー', kind: 'monster', attribute: 'light', race: '戦士',
    level: 4, atk: 1700, def: 1500, rarity: 'R', glyph: '⚡',
    text: '召喚時、相手に400ダメージを与える。',
    effect: { trigger: 'summon', ops: [{ t: 'burn', n: 400 }] },
  },
  assassin: {
    id: 'assassin', name: '影狼のアサシン', kind: 'monster', attribute: 'dark', race: '獣',
    level: 4, atk: 1800, def: 800, rarity: 'SR', glyph: '⩕',
    text: 'このカードが攻撃した時、相手に400ダメージを追加で与える。',
    effect: { trigger: 'attack', ops: [{ t: 'burn', n: 400 }] },
  },
  crow: {
    id: 'crow', name: '機巧忍者クロウ', kind: 'monster', attribute: 'wind', race: '機械',
    level: 4, atk: 1600, def: 1000, rarity: 'R', glyph: '⌬',
    text: 'このカードが攻撃した時、相手に300ダメージを追加で与える。',
    effect: { trigger: 'attack', ops: [{ t: 'burn', n: 300 }] },
  },
  imp: {
    id: 'imp', name: '灼熱の小鬼', kind: 'monster', attribute: 'fire', race: '悪魔',
    level: 3, atk: 1200, def: 800, rarity: 'N', glyph: '⛧',
    text: '召喚時、自分モンスターのATKを200上げる。',
    effect: { trigger: 'summon', ops: [{ t: 'buff', n: 200 }] },
  },
  hound: {
    id: 'hound', name: '深淵の番犬', kind: 'monster', attribute: 'dark', race: '獣',
    level: 3, atk: 1300, def: 1000, rarity: 'N', glyph: '⩕',
    text: '召喚時、自分のLPを200回復する。',
    effect: { trigger: 'summon', ops: [{ t: 'heal', n: 200 }] },
  },
  spirit: {
    id: 'spirit', name: '水晶の精霊', kind: 'monster', attribute: 'water', race: '天使',
    level: 3, atk: 1000, def: 1400, rarity: 'N', glyph: '✧',
    text: '召喚時、自分のLPを300回復する。',
    effect: { trigger: 'summon', ops: [{ t: 'heal', n: 300 }] },
  },
  vd11: {
    id: 'vd11', name: 'u成.VD11', kind: 'monster', attribute: 'light', race: '機械',
    level: 6, atk: 2011, def: 297, rarity: 'UR', glyph: '⌬',
    text: 'このカードは自分フィールドのモンスター1体をリリースした場合のみ特殊召喚できる。'
      + 'このカードの攻撃時のみ、このカードのATKはリリースしたモンスターのDEF分下がる。'
      + 'このカードは戦闘で破壊されず、自分が受けるダメージは代わりに相手が受ける。',
    specialSummon: { release: 1 },
    battle: { indestructible: true, redirectDamage: true },
    attackPenalty: 'releasedDef',
  },
  genbu: {
    id: 'genbu', name: 'ドラシェル玄武', kind: 'monster', attribute: 'water', race: '爬虫類',
    level: 4, atk: 0, def: 2000, rarity: 'R', glyph: '⬢',
    text: '巨大な甲羅で攻撃を受け止める守りの要。ATK 0／DEF 2000の壁モンスター。',
    effect: null,
  },

  /* ---------------- extra deck ---------------- */
  ex_arcadia: {
    id: 'ex_arcadia', name: '双星竜アルカディア', kind: 'monster', attribute: 'light', race: 'ドラゴン',
    level: 8, atk: 3000, def: 2500, rarity: 'UR', glyph: '❖', extra: true,
    text: 'EX召喚時、相手に1000ダメージを与える。24ゾーンの中央を制する双星竜。',
    effect: { trigger: 'summon', ops: [{ t: 'burn', n: 1000 }] },
  },
  ex_hades: {
    id: 'ex_hades', name: '冥王竜ハデス', kind: 'monster', attribute: 'dark', race: 'ドラゴン',
    level: 8, atk: 2800, def: 2600, rarity: 'UR', glyph: '❖', extra: true,
    text: 'EX召喚時、相手の攻撃力が最も高いモンスター1体を破壊する。',
    effect: { trigger: 'summon', ops: [{ t: 'destroy' }] },
  },
  ex_gigant: {
    id: 'ex_gigant', name: '機神帝ギガント', kind: 'monster', attribute: 'earth', race: '機械',
    level: 10, atk: 3500, def: 3000, rarity: 'UR', glyph: '❖', extra: true,
    text: 'EX召喚時、自分のLPを500回復し、相手に300ダメージを与える。',
    effect: { trigger: 'summon', ops: [{ t: 'heal', n: 500 }, { t: 'burn', n: 300 }] },
  },

  /* ---------------- spells ---------------- */
  breath: {
    id: 'breath', name: '蒼焔の息吹', kind: 'spell', attribute: 'spell', spellType: 'normal',
    rarity: 'R', glyph: '✦',
    text: '相手に800ダメージを与える。',
    effect: { trigger: 'activate', ops: [{ t: 'burn', n: 800 }] },
  },
  guidance: {
    id: 'guidance', name: '星の導き', kind: 'spell', attribute: 'spell', spellType: 'normal',
    rarity: 'R', glyph: '✧',
    text: 'デッキから2枚ドローする。',
    effect: { trigger: 'activate', ops: [{ t: 'draw', n: 2 }] },
  },
  wave: {
    id: 'wave', name: '破滅の波動', kind: 'spell', attribute: 'spell', spellType: 'normal',
    rarity: 'SR', glyph: '≋',
    text: '相手の攻撃力が最も高いモンスター1体を破壊する。',
    effect: { trigger: 'activate', ops: [{ t: 'destroy' }] },
  },
  scorched: {
    id: 'scorched', name: '灼熱の大地', kind: 'spell', attribute: 'spell', spellType: 'field',
    rarity: 'SR', glyph: '▲',
    text: 'フィールド魔法。自分フィールドの全モンスターのATKを300上げる。',
    effect: { trigger: 'activate', ops: [] },
    field: { atk: 300, def: 0 },
  },
  spring: {
    id: 'spring', name: '深淵の泉', kind: 'spell', attribute: 'spell', spellType: 'field',
    rarity: 'R', glyph: '≈',
    text: 'フィールド魔法。発動時にLPを500回復し、自分モンスターのATKを200、DEFを200上げる。',
    effect: { trigger: 'activate', ops: [{ t: 'heal', n: 500 }] },
    field: { atk: 200, def: 200 },
  },
  thunder: {
    id: 'thunder', name: '迅雷の一撃', kind: 'spell', attribute: 'spell', spellType: 'normal',
    rarity: 'R', glyph: '⚡',
    text: '相手に500ダメージを与え、1枚ドローする。',
    effect: { trigger: 'activate', ops: [{ t: 'burn', n: 500 }, { t: 'draw', n: 1 }] },
  },
  greed: {
    id: 'greed', name: '貪欲な宝札', kind: 'spell', attribute: 'spell', spellType: 'normal',
    rarity: 'SR', glyph: '❖',
    text: '2枚ドローする。その後、自分のLPを800失う。',
    effect: { trigger: 'activate', ops: [{ t: 'draw', n: 2 }, { t: 'selfDamage', n: 800 }] },
  },
  fortify: {
    id: 'fortify', name: '鉄壁の陣形', kind: 'spell', attribute: 'spell', spellType: 'normal',
    rarity: 'N', glyph: '⬢',
    text: '自分のLPを1000回復する。',
    effect: { trigger: 'activate', ops: [{ t: 'heal', n: 1000 }] },
  },

  /* ---------------- traps ---------------- */
  blast: {
    id: 'blast', name: '炸裂する罠', kind: 'trap', attribute: 'trap', rarity: 'R', glyph: '⊘',
    text: '相手の攻撃宣言時に発動。相手に1000ダメージを与える。',
    effect: { trigger: 'attack', ops: [{ t: 'burn', n: 1000 }] },
  },
  pit: {
    id: 'pit', name: '落とし穴', kind: 'trap', attribute: 'trap', rarity: 'SR', glyph: '⊘',
    text: '相手の攻撃宣言時に発動。攻撃してきたモンスターを破壊する。',
    effect: { trigger: 'attack', ops: [{ t: 'destroyAttacker' }] },
  },
  barrier: {
    id: 'barrier', name: '聖なる障壁', kind: 'trap', attribute: 'trap', rarity: 'R', glyph: '✧',
    text: '相手の攻撃宣言時に発動。自分のLPを1200回復する。',
    effect: { trigger: 'attack', ops: [{ t: 'heal', n: 1200 }] },
  },
  counter: {
    id: 'counter', name: '反撃の狼煙', kind: 'trap', attribute: 'trap', rarity: 'R', glyph: '⚑',
    text: '相手の攻撃宣言時に発動。相手に800ダメージを与え、1枚ドローする。',
    effect: { trigger: 'attack', ops: [{ t: 'burn', n: 800 }, { t: 'draw', n: 1 }] },
  },
  mirror: {
    id: 'mirror', name: '鏡像の盾', kind: 'trap', attribute: 'trap', rarity: 'N', glyph: '◇',
    text: '相手の攻撃宣言時に発動。LPを800回復し、自分モンスターのATKを200上げる。',
    effect: { trigger: 'attack', ops: [{ t: 'heal', n: 800 }, { t: 'buff', n: 200 }] },
  },
};

/* Every deck must be exactly this many main-deck cards. */
export const DECK_SIZE = 27;

export const DECKS = {
  flame: {
    id: 'flame', name: '蒼焔の章', short: '蒼焔', accent: '#ff7a45',
    desc: '高火力ドラゴンとバーンで押し切る。攻め切るための赤いデッキ。',
    main: {
      dragonia: 1, ignis: 2, luna: 1, guardian: 1, fenrir: 1, levia: 1, nox: 1,
      valkyrie: 2, assassin: 1, crow: 1, vd11: 3, genbu: 3,
      breath: 2, guidance: 1, wave: 1, scorched: 1, thunder: 1,
      blast: 2, counter: 1,
    },
    extra: ['ex_arcadia', 'ex_gigant', 'ex_hades'],
  },
  abyss: {
    id: 'abyss', name: '深淵の章', short: '深淵', accent: '#b06bff',
    desc: '除去と回復で盤面を支配。罠と冥府騎士で相手の攻撃をいなす。',
    main: {
      luna: 3, nox: 2, guardian: 2, fenrir: 1, seraph: 1, assassin: 2, hound: 1,
      spirit: 1, levia: 1, genbu: 3,
      guidance: 2, wave: 1, breath: 1, spring: 1, greed: 1,
      pit: 2, barrier: 1, counter: 1,
    },
    extra: ['ex_hades', 'ex_arcadia', 'ex_gigant'],
  },
  gear: {
    id: 'gear', name: '機巧の章', short: '機巧', accent: '#4de3ff',
    desc: '低コストを並べてEX召喚。連続攻撃とドローで畳みかける。',
    main: {
      crow: 3, valkyrie: 1, fenrir: 1, ignis: 2, guardian: 1, golem: 1, levia: 1,
      dragonia: 1, imp: 2, hound: 1, vd11: 3,
      scorched: 1, thunder: 2, breath: 1, guidance: 1, fortify: 1,
      blast: 2, mirror: 1, counter: 1,
    },
    extra: ['ex_gigant', 'ex_arcadia', 'ex_hades'],
  },
};

export const DECK_LIST = Object.values(DECKS);

export function createCard(id) {
  const def = CARDS[id];
  if (!def) throw new Error(`unknown card: ${id}`);
  return { ...def, uid: nextUid() };
}

export function deckSize(deck) {
  return Object.values(deck.main).reduce((a, b) => a + b, 0);
}

export function makeDeck(deckId) {
  const deck = DECKS[deckId];
  if (!deck) throw new Error(`unknown deck: ${deckId}`);
  const size = deckSize(deck);
  if (size !== DECK_SIZE) {
    throw new Error(`${deck.name} は ${DECK_SIZE} 枚ちょうどである必要があります（現在 ${size} 枚）`);
  }
  const main = [];
  for (const [id, n] of Object.entries(deck.main)) {
    for (let i = 0; i < n; i++) main.push(createCard(id));
  }
  const extra = deck.extra.map(createCard);
  return { main, extra };
}

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function typeLabel(card) {
  if (card.kind === 'monster') return `${card.race}／${ATTR[card.attribute].label}${card.extra ? '／EX' : ''}`;
  if (card.kind === 'spell') return card.spellType === 'field' ? 'フィールド魔法' : '魔法カード';
  return '罠カード';
}

export function cardAccent(card) {
  return ATTR[card.attribute]?.color || '#4de3ff';
}

export function levelStars(card) {
  return card.kind === 'monster' ? '★'.repeat(card.level || 0) : '';
}
