// DUEL 24 — card database. No artwork, no image files: every card is drawn with CSS.
export const ATTR = {
  LIGHT: { label: '光', color: '#ffe08a', sigil: '光' },
  DARK: { label: '闇', color: '#b98bff', sigil: '闇' },
  FIRE: { label: '炎', color: '#ff7a45', sigil: '炎' },
  WATER: { label: '水', color: '#4fc3ff', sigil: '水' },
  WIND: { label: '風', color: '#6bf0b0', sigil: '風' },
  EARTH: { label: '地', color: '#d3aa73', sigil: '地' },
  DIVINE: { label: '神', color: '#ffd257', sigil: '神' },
};

const M = (id, name, level, atk, def, attr, race, sigil, tier = 'normal', text = '') => ({
  id, name, kind: 'monster', level, atk, def, attr, race, sigil, tier, text: text || `${race}／${ATTR[attr].label}属性`,
});

export const CARDS = {
  // ── MONSTERS ─────────────────────────────────────────────────────────────
  bwd: M('bwd', '青眼の白龍', 8, 3000, 2500, 'LIGHT', 'ドラゴン族', '龍', 'legend', '高い攻撃力を誇る伝説のドラゴン。どんな相手にも屈しない。'),
  redEyes: M('redEyes', '真紅眼の黒竜', 7, 2400, 2000, 'DARK', 'ドラゴン族', '竜', 'legend', '真紅の眼を持つ黒き竜。その咆哮は戦場を震わせる。'),
  darkMagician: M('darkMagician', 'ブラック・マジシャン', 7, 2500, 2100, 'DARK', '魔法使い族', '魔', 'legend', '闇の力を操る最高位の魔術師。'),
  gaia: M('gaia', '暗黒騎士ガイア', 7, 2300, 2100, 'EARTH', '戦士族', '騎', 'rare', '風を切り裂いて駆ける、闇の騎士。'),
  summonedSkull: M('summonedSkull', 'デーモンの召喚', 6, 2500, 1200, 'DARK', '悪魔族', '悪', 'rare', '闇の力で呼び出される、雷を操る悪魔。'),
  jinzo: M('jinzo', '人造人間－サイコ・ショッカー', 6, 2400, 1500, 'DARK', '機械族', '機', 'rare', '罠を封じるサイコパワーを持つ機械兵士。'),
  cyberDragon: M('cyberDragon', 'サイバー・ドラゴン', 5, 2100, 1600, 'LIGHT', '機械族', '鋼', 'rare', '光を纏う機械竜。その翼は未来を映す。'),
  darkMagicianGirl: M('darkMagicianGirl', 'ブラック・マジシャン・ガール', 6, 2000, 1700, 'DARK', '魔法使い族', '巫', 'rare', '魔術師の弟子。可憐な姿に強大な魔力を秘める。'),
  goblin: M('goblin', 'ゴブリン突撃部隊', 4, 2300, 0, 'EARTH', '戦士族', '突', 'normal', '攻撃力は高いが、守りはからっきしの突撃兵。'),
  axeRaider: M('axeRaider', 'アックス・レイダー', 4, 1700, 1150, 'EARTH', '戦士族', '斧', 'normal', '巨大な斧を振り回す、荒々しい戦士。'),
  celtic: M('celtic', 'エルフの剣士', 4, 1400, 1200, 'EARTH', '戦士族', '剣', 'normal', '剣の腕は確かな、森に生きるエルフの戦士。'),
  harpy: M('harpy', 'ハーピィ・レディ', 4, 1300, 1400, 'WIND', '鳥獣族', '翼', 'normal', '舞うように空を駆ける、美しき鳥人。'),
  mysticElf: M('mysticElf', '聖なる魔術師', 4, 800, 2000, 'LIGHT', '魔法使い族', '聖', 'normal', '聖なる光で身を守る、心優しき魔術師。'),
  giantSoldier: M('giantSoldier', '岩石の巨兵', 3, 1300, 2000, 'EARTH', '岩石族', '岩', 'normal', '動く岩の巨人。その守りは鉄壁。'),
  flameCerberus: M('flameCerberus', 'フレイム・ケルベロス', 4, 1400, 1500, 'FIRE', '獣族', '炎', 'normal', '灼熱の炎を纏った三頭の魔犬。'),
  kuriboh: M('kuriboh', 'クリボー', 1, 300, 200, 'DARK', '悪魔族', '毛', 'normal', 'ふわふわした小さな精霊。意外な活躍を見せる。'),
  obelisk: M('obelisk', 'オベリスクの巨神兵', 10, 4000, 4000, 'DIVINE', '幻神獣族', '神', 'legend', '三体の生贄を捧げることで降臨する、破壊の巨神。'),

  // ── SPELLS ──────────────────────────────────────────────────────────────
  pot: { id: 'pot', name: '強欲な壺', kind: 'spell', effect: 'pot', tier: 'rare', sigil: '欲', text: 'デッキからカードを2枚ドローする。' },
  thunderbolt: { id: 'thunderbolt', name: 'サンダーボルト', kind: 'spell', effect: 'thunderbolt', tier: 'legend', sigil: '雷', text: '相手フィールドのモンスターを全て破壊する。' },
  blackhole: { id: 'blackhole', name: 'ブラックホール', kind: 'spell', effect: 'blackhole', tier: 'legend', sigil: '虚', text: 'フィールド上のモンスターを全て破壊する。' },
  reborn: { id: 'reborn', name: '死者蘇生', kind: 'spell', effect: 'reborn', tier: 'legend', sigil: '蘇', text: '自分の墓地のモンスター1体を自分フィールドに特殊召喚する。' },
  cyclone: { id: 'cyclone', name: 'サイクロン', kind: 'spell', effect: 'cyclone', tier: 'normal', sigil: '嵐', text: '相手フィールドの魔法・罠カード1枚を破壊する。' },
  heavyStorm: { id: 'heavyStorm', name: '大嵐', kind: 'spell', effect: 'heavyStorm', tier: 'rare', sigil: '颶', text: 'フィールド上の魔法・罠カードを全て破壊する。' },
  fireball: { id: 'fireball', name: '火球', kind: 'spell', effect: 'fireball', tier: 'normal', sigil: '球', text: '相手に600ポイントのダメージを与える。' },
  potion: { id: 'potion', name: 'ゴブリンの秘薬', kind: 'spell', effect: 'potion', tier: 'normal', sigil: '薬', text: '自分は1000ライフポイント回復する。' },
  reinforcements: { id: 'reinforcements', name: '増援', kind: 'spell', effect: 'reinforcements', tier: 'normal', sigil: '援', text: 'デッキからレベル4以下のモンスター1体を手札に加える。' },
  skyScraper: { id: 'skyScraper', name: '摩天楼', kind: 'spell', effect: 'skyScraper', tier: 'rare', sigil: '楼', field: true, text: 'フィールド魔法。自分のモンスターの攻撃力は300アップする。' },
  charity: { id: 'charity', name: '天使の施し', kind: 'spell', effect: 'charity', tier: 'rare', sigil: '恵', text: 'デッキから3枚ドローし、手札を2枚捨てる。' },

  // ── TRAPS ───────────────────────────────────────────────────────────────
  trapHole: { id: 'trapHole', name: '落とし穴', kind: 'trap', trigger: 'summon', tier: 'normal', sigil: '穴', text: '相手が攻撃力1500以上のモンスターを召喚した時、そのモンスターを破壊する。' },
  mirrorForce: { id: 'mirrorForce', name: '聖なるバリア －ミラーフォース－', kind: 'trap', trigger: 'attack', tier: 'legend', sigil: '鏡', text: '相手モンスターの攻撃宣言時、相手の攻撃表示モンスターを全て破壊する。' },
  cylinder: { id: 'cylinder', name: '魔法の筒', kind: 'trap', trigger: 'attack', tier: 'rare', sigil: '筒', text: '相手モンスターの攻撃を無効にし、その攻撃力分のダメージを相手に与える。' },
  sakuretsu: { id: 'sakuretsu', name: '炸裂装甲', kind: 'trap', trigger: 'attack', tier: 'rare', sigil: '甲', text: '相手モンスターの攻撃宣言時、そのモンスターを破壊する。' },
  torrential: { id: 'torrential', name: '激流葬', kind: 'trap', trigger: 'summon', tier: 'rare', sigil: '激', text: '相手がモンスターを召喚した時、フィールド上のモンスターを全て破壊する。' },
  compulsory: { id: 'compulsory', name: '強制脱出装置', kind: 'trap', trigger: 'attack', tier: 'normal', sigil: '脱', text: '相手モンスターの攻撃宣言時、そのモンスターを手札に戻す。' },
};

// 40 cards: 22 monsters / 12 spells / 6 traps
export const DECK_LIST = [
  'bwd', 'redEyes', 'darkMagician', 'darkMagician', 'gaia', 'gaia',
  'summonedSkull', 'jinzo', 'cyberDragon', 'cyberDragon', 'darkMagicianGirl',
  'goblin', 'goblin', 'axeRaider', 'axeRaider', 'celtic', 'celtic',
  'harpy', 'giantSoldier', 'mysticElf', 'mysticElf', 'kuriboh', 'obelisk',
  'pot', 'pot', 'thunderbolt', 'blackhole', 'reborn', 'reborn',
  'cyclone', 'cyclone', 'fireball', 'potion', 'reinforcements', 'skyScraper', 'charity',
  'trapHole', 'mirrorForce', 'cylinder', 'sakuretsu', 'torrential', 'compulsory',
];

export const deckCount = () => DECK_LIST.length;

export function cardDef(instOrId) {
  const id = typeof instOrId === 'string' ? instOrId : instOrId.cardId;
  return CARDS[id];
}

export function attrOf(card) {
  return card.attr ? ATTR[card.attr] : ATTR.DIVINE;
}

export function kindLabel(card) {
  if (card.kind === 'monster') return card.race;
  if (card.kind === 'spell') return card.field ? 'フィールド魔法' : '魔法カード';
  return '罠カード';
}

export function isMonster(card) { return card.kind === 'monster'; }
export function tributeCount(card) {
  if (!card || card.kind !== 'monster') return 0;
  if (card.level >= 9) return 3;
  if (card.level >= 7) return 2;
  if (card.level >= 5) return 1;
  return 0;
}

// Short label for the card's stat line
export function cardPower(card) {
  if (card.kind === 'monster') return `ATK ${card.atk} / DEF ${card.def}`;
  return card.kind === 'spell' ? 'SPELL' : 'TRAP';
}
