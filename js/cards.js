// DUEL 24 ZONES — card database
// No card artwork is used anywhere: every "illustration" is typographic/CSS only.

export const ATTR_LABEL = {
  light: '光',
  dark: '闇',
  fire: '炎',
  water: '水',
  wind: '風',
  earth: '地',
  spell: '魔法',
  trap: '罠',
}

export const CARDS = {
  /* ───────────────────────── MONSTERS ───────────────────────── */
  blueEyes: {
    name: '蒼眼の白龍', type: 'monster', attr: 'light', race: 'ドラゴン', level: 8,
    atk: 3000, def: 2500, glyph: '龍', rarity: 'ur',
    onSummon: { kind: 'burn', amount: 500 },
    text: '召喚時、相手に500ダメージを与える。蒼き眼光が戦場を貫く。',
  },
  redEyes: {
    name: '真紅の黒龍', type: 'monster', attr: 'dark', race: 'ドラゴン', level: 7,
    atk: 2800, def: 2400, glyph: '闇', rarity: 'ur',
    onSummon: { kind: 'burn', amount: 400 },
    text: '召喚時、相手に400ダメージを与える。紅い焔が大地を焦がす。',
  },
  abyssKing: {
    name: '深淵の王', type: 'monster', attr: 'dark', race: '悪魔', level: 8,
    atk: 2600, def: 2200, glyph: '王', rarity: 'ur',
    onSummon: { kind: 'destroyEnemy' },
    text: '召喚時、相手モンスター1体を破壊する。深淵より這い出る絶対王。',
  },
  twinDragon: {
    name: '双頭の竜', type: 'monster', attr: 'wind', race: 'ドラゴン', level: 6,
    atk: 2200, def: 1800, glyph: '双', rarity: 'sr',
    text: '二つの頭で敵陣を薙ぎ払う、嵐を呼ぶ双頭の竜。',
  },
  steelGod: {
    name: '鋼鉄の機神', type: 'monster', attr: 'earth', race: '機械', level: 6,
    atk: 2400, def: 2000, glyph: '鋼', rarity: 'sr',
    text: '鋼の装甲と歯車の心臓を持つ、古代文明の守護機神。',
  },
  galeKnight: {
    name: '疾風の騎士', type: 'monster', attr: 'wind', race: '戦士', level: 4,
    atk: 1800, def: 1200, glyph: '風', rarity: 'r',
    text: '疾風のように駆け抜け、剣閃で敵を切り裂く若き騎士。',
  },
  flameMage: {
    name: '紅蓮の魔術師', type: 'monster', attr: 'fire', race: '魔法使い', level: 4,
    atk: 1600, def: 1000, glyph: '炎', rarity: 'r',
    onSummon: { kind: 'burn', amount: 400 },
    text: '召喚時、相手に400ダメージを与える。紅蓮の杖が火球を放つ。',
  },
  rockGiant: {
    name: '岩壁の巨人', type: 'monster', attr: 'earth', race: '岩石', level: 4,
    atk: 1200, def: 2000, glyph: '岩', rarity: 'n',
    text: '動かぬ岩の巨躯。その守りは城壁よりも堅い。',
  },
  thunderBeast: {
    name: '電光の獣', type: 'monster', attr: 'light', race: '雷', level: 3,
    atk: 1400, def: 800, glyph: '雷', rarity: 'n',
    text: '雷を纏って疾走する獣。その爪は光よりも速い。',
  },
  moonNinja: {
    name: '月影の忍者', type: 'monster', attr: 'dark', race: '戦士', level: 3,
    atk: 1000, def: 1500, glyph: '忍', rarity: 'r', direct: true,
    text: '相手モンスターを無視して直接攻撃できる。月夜に影が踊る。',
  },
  guardianAngel: {
    name: '聖なる守護者', type: 'monster', attr: 'light', race: '天使', level: 4,
    atk: 800, def: 2200, glyph: '聖', rarity: 'n',
    text: '聖なる光で味方を守る天使。攻め手よりも盾に生きる。',
  },
  spiritFox: {
    name: '精霊の狐', type: 'monster', attr: 'light', race: '獣', level: 2,
    atk: 600, def: 900, glyph: '狐', rarity: 'r',
    onSummon: { kind: 'draw', amount: 1 },
    text: '召喚時、デッキからカードを1枚ドローする。森の知恵を運ぶ精霊。',
  },

  /* ───────────────────────── EXTRA DECK ───────────────────────── */
  ultimateDragon: {
    name: '究極の白龍', type: 'monster', attr: 'light', race: 'ドラゴン', level: 10,
    atk: 4500, def: 3800, glyph: '極', rarity: 'ur', extra: true,
    text: 'EXゾーンに特殊召喚できる究極竜。2体以上のモンスターが必要。',
  },
  blazeOverlord: {
    name: '紅蓮の覇龍', type: 'monster', attr: 'fire', race: 'ドラゴン', level: 9,
    atk: 3800, def: 3000, glyph: '覇', rarity: 'ur', extra: true,
    text: 'EXゾーンに特殊召喚できる覇王竜。2体以上のモンスターが必要。',
  },
  steelFortress: {
    name: '鋼鉄要塞', type: 'monster', attr: 'earth', race: '機械', level: 9,
    atk: 3200, def: 3400, glyph: '城', rarity: 'ur', extra: true,
    text: 'EXゾーンに特殊召喚できる移動要塞。2体以上のモンスターが必要。',
  },

  /* ───────────────────────── SPELLS ───────────────────────── */
  potGreed: {
    name: '強欲の壺', type: 'spell', attr: 'spell', spellType: 'normal', glyph: '壺', rarity: 'sr',
    effect: { kind: 'draw', amount: 2 },
    text: 'デッキからカードを2枚ドローする。欲深き壺は知識を吐き出す。',
  },
  fireball: {
    name: '火球', type: 'spell', attr: 'spell', spellType: 'normal', glyph: '球', rarity: 'n',
    effect: { kind: 'burn', amount: 800 },
    text: '相手に800ダメージを与える。放たれた火球は避けられない。',
  },
  lightning: {
    name: '雷撃', type: 'spell', attr: 'spell', spellType: 'normal', glyph: '撃', rarity: 'r',
    effect: { kind: 'burn', amount: 1200 },
    text: '相手に1200ダメージを与える。天より落ちる裁きの雷。',
  },
  evilSword: {
    name: '魔剣の装備', type: 'spell', attr: 'spell', spellType: 'equip', glyph: '剣', rarity: 'r',
    effect: { kind: 'equip', amount: 700 },
    text: '自分のモンスター1体に装備し、ATKを700アップする。',
  },
  destructionRay: {
    name: '破壊光線', type: 'spell', attr: 'spell', spellType: 'normal', glyph: '光', rarity: 'sr',
    effect: { kind: 'destroy' },
    text: '相手モンスター1体を破壊する。指向性の光が敵を消し飛ばす。',
  },
  angelGift: {
    name: '天使の施し', type: 'spell', attr: 'spell', spellType: 'normal', glyph: '癒', rarity: 'n',
    effect: { kind: 'heal', amount: 1200 },
    text: '自分のLPを1200回復する。天使の羽が傷を癒す。',
  },
  magicCity: {
    name: '魔導都市', type: 'spell', attr: 'spell', spellType: 'field', glyph: '都', rarity: 'sr',
    effect: { kind: 'field', amount: 300 },
    text: 'フィールド魔法。自分のモンスターのATK/DEFを300アップする。',
  },
  reviveLight: {
    name: '蘇生の光', type: 'spell', attr: 'spell', spellType: 'normal', glyph: '生', rarity: 'sr',
    effect: { kind: 'revive' },
    text: '自分の墓地のモンスター1体をEXゾーンに特殊召喚する。',
  },

  /* ───────────────────────── TRAPS ───────────────────────── */
  mirrorForce: {
    name: '聖なるバリア −ミラーフォース−', type: 'trap', attr: 'trap', glyph: '鏡', rarity: 'ur',
    trigger: 'attack', effect: { kind: 'negateAttack', amount: 600 },
    text: '相手の攻撃を無効にし、相手に600ダメージを与える。',
  },
  pitfall: {
    name: '落とし穴', type: 'trap', attr: 'trap', glyph: '穴', rarity: 'r',
    trigger: 'summon', effect: { kind: 'destroySummoned' },
    text: '相手がATK1500以上のモンスターを召喚した時、そのモンスターを破壊する。',
  },
  roar: {
    name: '威嚇する咆哮', type: 'trap', attr: 'trap', glyph: '吼', rarity: 'r',
    trigger: 'battle', effect: { kind: 'lockAttacks' },
    text: '相手がバトルフェイズに入った時、このターン相手は攻撃できない。',
  },
  backup: {
    name: '補充要員', type: 'trap', attr: 'trap', glyph: '補', rarity: 'n',
    trigger: 'attacked', effect: { kind: 'draw', amount: 1 },
    text: '相手の攻撃宣言時、デッキからカードを1枚ドローする。',
  },
}

export const DECK_RECIPE = [
  'blueEyes',
  'redEyes',
  'abyssKing',
  'twinDragon', 'twinDragon',
  'steelGod', 'steelGod',
  'galeKnight', 'galeKnight', 'galeKnight',
  'flameMage', 'flameMage',
  'rockGiant',
  'thunderBeast', 'thunderBeast',
  'moonNinja', 'moonNinja',
  'guardianAngel',
  'spiritFox', 'spiritFox',
  'potGreed', 'potGreed',
  'fireball', 'fireball',
  'lightning',
  'evilSword',
  'destructionRay',
  'angelGift',
  'magicCity',
  'reviveLight',
  'mirrorForce', 'mirrorForce',
  'pitfall',
  'roar',
  'backup',
]

export const EXTRA_RECIPE = ['ultimateDragon', 'blazeOverlord', 'steelFortress']

export const RARITY_LABEL = { ur: 'UR', sr: 'SR', r: 'R', n: 'N' }

export function cardTypeLabel(card) {
  if (!card) return ''
  if (card.type === 'monster') {
    return card.extra ? 'EXモンスター' : `Lv.${card.level} / ${card.race}`
  }
  if (card.type === 'spell') {
    return card.spellType === 'field' ? 'フィールド魔法' : card.spellType === 'equip' ? '装備魔法' : '通常魔法'
  }
  return '罠カード'
}
