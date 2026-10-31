// Card catalogue for DUEL 24.
// Every card is defined once; decks are built from DECK_LIST so both duelists
// use the same 24-card pool.

export const ELEMENTS = {
  fire: { label: '炎', a: '#ff6a3d', b: '#ffb03a' },
  water: { label: '水', a: '#2ea8ff', b: '#69e6ff' },
  ice: { label: '氷', a: '#7fdfff', b: '#d7fbff' },
  wind: { label: '風', a: '#55f2a6', b: '#b8ffd9' },
  light: { label: '光', a: '#ffd45e', b: '#fff3b0' },
  thunder: { label: '雷', a: '#b58bff', b: '#e6d4ff' },
  earth: { label: '地', a: '#c8935a', b: '#edd0a2' },
  dark: { label: '闇', a: '#9a5cff', b: '#d9b3ff' },
  machine: { label: '機', a: '#8fb4e8', b: '#e2edff' },
}

export const TYPE_LABEL = {
  unit: 'UNIT',
  spell: 'SPELL',
  trap: 'TRAP',
}

export const CARDS = {
  // ---- 18 units -----------------------------------------------------------
  slime: {
    id: 'slime', name: '水晶スライム', en: 'CRYSTAL SLIME', type: 'unit',
    cost: 1, atk: 500, def: 900, element: 'water', glyph: '晶', rarity: 'C',
    text: '澄んだ結晶の身体で、攻撃を受け止める。',
  },
  wolf: {
    id: 'wolf', name: '影狼フェンリル', en: 'SHADOW WOLF', type: 'unit',
    cost: 2, atk: 1100, def: 800, element: 'dark', glyph: '狼', rarity: 'C',
    text: '影から影へ。素早い牙が隙を突く。',
  },
  imp: {
    id: 'imp', name: '炎の小鬼イグニ', en: 'EMBER IMP', type: 'unit',
    cost: 2, atk: 900, def: 700, element: 'fire', glyph: '鬼', rarity: 'C',
    text: '小さな火種ほど、油断ならない。',
  },
  ninja: {
    id: 'ninja', name: '風刃の忍者ハヤテ', en: 'GALE NINJA', type: 'unit',
    cost: 3, atk: 1500, def: 1100, element: 'wind', glyph: '忍', rarity: 'R',
    text: '風を裂く一閃。残るのは刃の音だけ。',
  },
  priest: {
    id: 'priest', name: '聖光の司祭ルミナ', en: 'LUMINA PRIESTESS', type: 'unit',
    cost: 3, atk: 1200, def: 1700, element: 'light', glyph: '光', rarity: 'R',
    text: '聖なる光が味方を包み、闇を退ける。',
  },
  guardian: {
    id: 'guardian', name: '森の守護者ガイア', en: 'FOREST GUARDIAN', type: 'unit',
    cost: 3, atk: 1400, def: 1500, element: 'earth', glyph: '守', rarity: 'R',
    text: '古き森の意志が、大地とともに立ち上がる。',
  },
  golem: {
    id: 'golem', name: '鉄壁のゴーレム', en: 'IRONWALL GOLEM', type: 'unit',
    cost: 4, atk: 800, def: 2600, element: 'earth', glyph: '壁', rarity: 'R',
    text: 'その守りは城壁。正面から崩すことは難しい。',
  },
  knight: {
    id: 'knight', name: '紅蓮の騎士カイ', en: 'CRIMSON KNIGHT', type: 'unit',
    cost: 4, atk: 1800, def: 1600, element: 'fire', glyph: '騎', rarity: 'R',
    text: '燃え上がる剣を掲げ、戦場を駆け抜ける。',
  },
  raigo: {
    id: 'raigo', name: '雷帝ライゴウ', en: 'THUNDER EMPEROR', type: 'unit',
    cost: 4, atk: 1900, def: 1500, element: 'thunder', glyph: '雷', rarity: 'SR',
    text: '天を裂く雷霆。その一撃は帝の裁き。',
  },
  gigant: {
    id: 'gigant', name: '機神ギガント', en: 'MACHINE GOD GIGANT', type: 'unit',
    cost: 5, atk: 2400, def: 2000, element: 'machine', glyph: '機', rarity: 'SR',
    text: '起動した鋼の巨人は、戦場の均衡を破壊する。',
  },
  queen: {
    id: 'queen', name: '氷華の女王グレイス', en: 'FROST QUEEN GRACE', type: 'unit',
    cost: 5, atk: 2100, def: 2300, element: 'ice', glyph: '氷', rarity: 'SR',
    text: '凍てつく王座に座し、すべてを静寂へ還す。',
  },
  dragon: {
    id: 'dragon', name: '蒼焔龍ヴェル', en: 'AZURE FLAME DRAGON', type: 'unit',
    cost: 6, atk: 2900, def: 2200, element: 'fire', glyph: '龍', rarity: 'UR',
    text: '蒼い焔を纏う古龍。24ゾーンを制する力。',
  },

  // ---- 6 spells / traps ---------------------------------------------------
  chain: {
    id: 'chain', name: '電撃連鎖', en: 'CHAIN LIGHTNING', type: 'spell',
    cost: 2, element: 'thunder', glyph: '雷', rarity: 'R',
    text: '相手に800ダメージ。カードを1枚引く。',
  },
  meteor: {
    id: 'meteor', name: '煉獄の業火', en: 'INFERNO METEOR', type: 'spell',
    cost: 4, element: 'fire', glyph: '獄', rarity: 'SR',
    text: '相手に1200ダメージ。相手の攻撃力が最も高いユニットを破壊する。',
  },
  grace: {
    id: 'grace', name: '天啓の光', en: 'DIVINE GRACE', type: 'spell',
    cost: 3, element: 'light', glyph: '啓', rarity: 'R',
    text: 'ライフを1200回復し、カードを1枚引く。',
  },
  command: {
    id: 'command', name: '戦陣の号令', en: 'WAR CRY', type: 'spell',
    cost: 3, element: 'earth', glyph: '令', rarity: 'R',
    text: '自分の全ユニットの攻撃力を500アップする。',
  },
  mirage: {
    id: 'mirage', name: '鏡牢ミラージュ', en: 'MIRAGE PRISON', type: 'trap',
    cost: 2, element: 'water', glyph: '鏡', rarity: 'SR',
    text: '相手の攻撃を無効にし、相手に800ダメージを与える。',
  },
  barrier: {
    id: 'barrier', name: '爆裂障壁', en: 'BLAST BARRIER', type: 'trap',
    cost: 2, element: 'fire', glyph: '壁', rarity: 'SR',
    text: '相手の攻撃を無効にし、攻撃ユニットを破壊する。',
  },
}

// Exactly 24 cards: 18 units + 6 spells/traps.
export const DECK_LIST = [
  ['slime', 2],
  ['wolf', 2],
  ['imp', 1],
  ['ninja', 2],
  ['priest', 2],
  ['guardian', 2],
  ['golem', 1],
  ['knight', 2],
  ['raigo', 1],
  ['gigant', 1],
  ['queen', 1],
  ['dragon', 1],
  ['chain', 1],
  ['meteor', 1],
  ['grace', 1],
  ['command', 1],
  ['mirage', 1],
  ['barrier', 1],
]

export const CARD_COUNT = DECK_LIST.reduce((sum, [, n]) => sum + n, 0)

export function cardIds() {
  return DECK_LIST.flatMap(([id, n]) => Array.from({ length: n }, () => id))
}
