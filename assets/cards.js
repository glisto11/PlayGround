export const FACTIONS = {
  solar:   { label: 'SOLAR',   color: '#ffb454' },
  void:    { label: 'VOID',    color: '#a07bff' },
  tide:    { label: 'TIDE',    color: '#4ad7ff' },
  ember:   { label: 'EMBER',   color: '#ff5d7a' },
  verdant: { label: 'VERDANT', color: '#54e6a5' },
  steel:   { label: 'STEEL',   color: '#a8bdd9' },
};

export const CARDS = [
  {
    id: 'nova-wisp', name: 'Nova Wisp', jp: 'ノヴァ・ウィスプ', cost: 1, atk: 1000, def: 600,
    faction: 'solar', glyph: '✦', keywords: ['FLARE 200'], flare: 200,
    text: '召喚時、相手のライフポイントに200ダメージ。',
    flavor: '星のかけらが、最初の一撃を運ぶ。',
  },
  {
    id: 'pulse-adept', name: 'Pulse Adept', jp: 'パルス・アデプト', cost: 1, atk: 900, def: 900,
    faction: 'tide', glyph: '≈', keywords: ['DRAIN 200'], drain: 200,
    text: 'このユニットがLPダメージを与えた時、自分は200LP回復。',
    flavor: '鼓動は波。波は還流する。',
  },
  {
    id: 'neon-ronin', name: 'Neon Ronin', jp: 'ネオン・ロウニン', cost: 1, atk: 1200, def: 400,
    faction: 'ember', glyph: '刃', keywords: ['PIERCE'], pierce: true,
    text: '戦闘で相手を破壊した時、超過ダメージを相手LPに与える。',
    flavor: '鞘に収まるのは、光だけじゃない。',
  },
  {
    id: 'aegis-node', name: 'Aegis Node', jp: 'イージス・ノード', cost: 1, atk: 500, def: 1300,
    faction: 'steel', glyph: '⬡', keywords: ['AURA 150'], aura: 150,
    text: '同じ列の隣接する味方のATKを150上昇させる。',
    flavor: '守ることは、攻めることの別名だ。',
  },
  {
    id: 'iron-bulwark', name: 'Iron Bulwark', jp: 'アイアン・バルワーク', cost: 2, atk: 700, def: 1800,
    faction: 'steel', glyph: '▣', keywords: ['AURA 300'], aura: 300,
    text: '同じ列の隣接する味方のATKを300上昇させる。',
    flavor: 'この壁を越えるには、歴史を書き換えろ。',
  },
  {
    id: 'rift-blade', name: 'Rift Blade', jp: 'リフト・ブレイド', cost: 2, atk: 1600, def: 800,
    faction: 'void', glyph: '⌁', keywords: ['PIERCE'], pierce: true,
    text: '戦闘で相手を破壊した時、超過ダメージを相手LPに与える。',
    flavor: '空間ごと、斬り裂け。',
  },
  {
    id: 'cryo-sentinel', name: 'Cryo Sentinel', jp: 'クライオ・センチネル', cost: 2, atk: 1100, def: 1600,
    faction: 'tide', glyph: '❄', keywords: ['LINK'], link: true,
    text: '召喚時、カードを1枚ドローする。',
    flavor: '凍結した時間に、戦況は棲む。',
  },
  {
    id: 'ember-duelist', name: 'Ember Duelist', jp: 'エンバー・デュエリスト', cost: 2, atk: 1500, def: 1000,
    faction: 'ember', glyph: '⚔', keywords: [],
    text: '攻守のバランスに優れた前線の切り込み役。',
    flavor: '炎は、決闘者の呼吸に従う。',
  },
  {
    id: 'chrono-witch', name: 'Chrono Witch', jp: 'クロノ・ウィッチ', cost: 2, atk: 1300, def: 1300,
    faction: 'solar', glyph: '⧖', keywords: ['LINK'], link: true,
    text: '召喚時、カードを1枚ドローする。',
    flavor: '未来の手札は、すでに彼女の掌の中。',
  },
  {
    id: 'graviton', name: 'Graviton', jp: 'グラビトン', cost: 3, atk: 2100, def: 1200,
    faction: 'void', glyph: '◎', keywords: [],
    text: '重力を操る重装アタッカー。単体火力は随一。',
    flavor: '落ちるのではない。落とされるのだ。',
  },
  {
    id: 'void-seraph', name: 'Void Seraph', jp: 'ヴォイド・セラフ', cost: 3, atk: 1800, def: 1500,
    faction: 'void', glyph: '✧', keywords: ['FLARE 300'], flare: 300,
    text: '召喚時、相手のライフポイントに300ダメージ。',
    flavor: '羽ばたきのたび、星がひとつ消える。',
  },
  {
    id: 'storm-herald', name: 'Storm Herald', jp: 'ストーム・ヘラルド', cost: 3, atk: 1700, def: 1100,
    faction: 'tide', glyph: '⚡', keywords: ['DRAIN 400'], drain: 400,
    text: 'このユニットがLPダメージを与えた時、自分は400LP回復。',
    flavor: '嵐の後に残るのは、静寂と回復だけ。',
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map(card => [card.id, card]));

export function createDeck(rng = Math.random) {
  const deck = [];
  for (const card of CARDS) {
    deck.push(card, card);
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function factionColor(card) {
  return FACTIONS[card.faction]?.color || '#53e6ff';
}

export function statLine(card) {
  return `ATK ${card.atk} / DEF ${card.def}`;
}
