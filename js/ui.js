import { CARDS, ATTR, cardDef, kindLabel } from './cards.js';
import { cardAtk } from './engine.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function nameOf(game, owner) { return esc(game.players[owner].name); }

function attrBadge(card) {
  if (!card.attr) return '';
  const a = ATTR[card.attr];
  return `<span class="attr-badge" style="--attr:${a.color}">${a.label}</span>`;
}

export function cardHTML(inst, opts = {}) {
  const card = cardDef(inst);
  const faceDown = !!opts.faceDown;
  if (faceDown) {
    return `<div class="card card-back${opts.small ? ' small' : ''}"${opts.uidAttr === false ? '' : ` data-card-uid="${inst.uid || ''}"`}>
      <div class="card-inner"><div class="back-lines"></div><div class="back-mark">24</div><div class="back-sub">DUEL ZONE</div></div>
    </div>`;
  }
  const isMon = card.kind === 'monster';
  const atk = opts.atk != null ? opts.atk : card.atk;
  const def = opts.def != null ? opts.def : card.def;
  const boosted = isMon && opts.atk != null && opts.atk !== card.atk;
  const level = isMon ? '★'.repeat(card.level) : '';
  const cls = [
    'card', `card-${card.kind}`, card.tier ? `tier-${card.tier}` : '',
    opts.selected ? 'is-selected' : '', opts.valid ? 'is-valid' : '', opts.small ? 'small' : '',
  ].filter(Boolean).join(' ');

  return `<div class="${cls}"${opts.uidAttr === false ? '' : ` data-card-uid="${inst.uid || ''}"`} data-kind="${card.kind}" ${card.attr ? `data-attr="${card.attr}"` : ''}>
    <div class="card-inner">
      <div class="card-frame">
        <div class="card-head">
          <span class="card-level">${level}</span>
          ${attrBadge(card)}
        </div>
        <div class="card-art">
          <div class="art-burst"></div>
          <div class="art-ring"></div>
          <span class="art-glyph">${card.sigil || '★'}</span>
          <span class="art-zone">ZONE</span>
        </div>
        <div class="card-name">${esc(card.name)}</div>
        <div class="card-sub">${esc(kindLabel(card))}</div>
        <div class="card-stats">
          ${isMon
            ? `<span class="atk ${boosted ? 'boosted' : ''}">ATK <b>${atk}</b></span><span class="def">DEF <b>${def}</b></span>`
            : `<span class="card-tag">${card.field ? 'FIELD' : card.kind === 'spell' ? 'SPELL' : 'TRAP'}</span>`}
        </div>
      </div>
      <span class="card-shine"></span>
    </div>
  </div>`;
}

function miniBack(i) {
  return `<div class="mini-back" style="--i:${i}"><span>24</span></div>`;
}

export function handHTML(app) {
  const { game, viewer } = app;
  const me = game.players[viewer];
  const selected = app.ui.selected;
  const n = me.hand.length;
  const mid = (n - 1) / 2;
  const slots = me.hand.map((inst, i) => {
    const rot = (i - mid) * 3.1;
    const dy = Math.abs(i - mid) * 4;
    return `<div class="hand-slot" data-card-uid="${inst.uid}" data-from="hand" style="--rot:${rot}deg;--dy:${dy}px;--z:${i};z-index:${i + 1}">
      ${cardHTML(inst, { selected: selected && selected.uid === inst.uid, small: n > 6 })}
    </div>`;
  }).join('');
  return `<div class="hand-fan ${n > 6 ? 'crowded' : ''}" style="--n:${n}">${slots || '<div class="hand-empty">手札がありません</div>'}</div>`;
}

function zoneContent(app, owner, kind, index, num) {
  const { game, viewer } = app;
  const me = owner === viewer;
  const p = game.players[owner];
  const inst = kind === 'monster' ? p.monsters[index] : kind === 'spell' ? p.spells[index] : kind === 'field' ? p.field : null;
  if (kind === 'grave') {
    const top = p.grave[p.grave.length - 1];
    return `<div class="grave-inner" data-grave-owner="${owner}">
      ${top ? `<div class="grave-card">${cardHTML(top, { faceDown: false, small: true, uidAttr: false })}</div>` : '<span class="zone-mark">⌁</span>'}
      <span class="grave-count">${p.grave.length}</span>
      <span class="zone-label">GRAVE</span>
    </div>`;
  }
  if (inst) {
    const faceDown = inst.faceDown && !me ? true : inst.faceDown;
    return `${cardHTML(inst, {
      faceDown: inst.faceDown,
      atk: kind === 'monster' ? cardAtk(game, owner, inst) : null,
      def: kind === 'monster' ? cardDef(inst).def : null,
      selected: app.ui.selected && app.ui.selected.uid === inst.uid,
    })}${inst.position === 'defense' && !inst.faceDown ? '<span class="pos-badge def">DEF</span>' : ''}${inst.position === 'attack' && !inst.faceDown && kind === 'monster' ? '<span class="pos-badge atk">ATK</span>' : ''}${inst.faceDown ? '<span class="pos-badge set">SET</span>' : ''}`;
  }
  const labels = { monster: 'MONSTER', spell: 'SPELL / TRAP', field: 'FIELD' };
  const marks = { monster: '◇', spell: '▽', field: '◈' };
  return `<span class="zone-mark">${marks[kind] || ''}</span><span class="zone-label">${labels[kind] || ''}</span>`;
}

function zoneClass(app, owner, kind, index) {
  const { game, viewer } = app;
  const cls = ['zone', `zone-${kind}`];
  const p = game.players[owner];
  const inst = kind === 'monster' ? p.monsters[index] : kind === 'spell' ? p.spells[index] : kind === 'field' ? p.field : null;
  if (inst) cls.push('occupied');
  if (app.ui.selected && app.ui.selected.uid && inst && app.ui.selected.uid === inst.uid) cls.push('selected-zone');
  const pend = app.ui.pending;
  if (pend && owner === viewer) {
    if (pend.type === 'summon' && kind === 'monster' && !inst && game.turnPlayer === viewer) cls.push('valid');
    if (pend.type === 'setSpell' && kind === 'spell' && !inst && game.turnPlayer === viewer) cls.push('valid');
    if (pend.type === 'field' && kind === 'field' && game.turnPlayer === viewer) cls.push('valid');
  }
  const atk = app.ui.attacker;
  if (atk && owner !== viewer && kind === 'monster' && inst && game.phase === 'battle' && game.turnPlayer === viewer) cls.push('target');
  if (app.ui.tributes.includes(inst?.uid)) cls.push('tribute-picked');
  return cls.join(' ');
}

function zoneHTML(app, owner, kind, index, num) {
  return `<div class="${zoneClass(app, owner, kind, index)}" data-zone-kind="${kind}" data-owner="${owner}" data-zone-index="${index}" data-num="${String(num).padStart(2, '0')}">
    <span class="zone-num">${String(num).padStart(2, '0')}</span>
    ${zoneContent(app, owner, kind, index, num)}
  </div>`;
}

function sideHTML(app, owner, isMe) {
  const { game } = app;
  const p = game.players[owner];
  const nums = isMe ? { monster: 13, spell: 18, field: 23, grave: 24 } : { monster: 1, spell: 6, field: 11, grave: 12 };
  const monsterRow = `<div class="zone-row monster-row">${[0, 1, 2, 3, 4].map(i => zoneHTML(app, owner, 'monster', i, nums.monster + i)).join('')}</div>`;
  const spellRow = `<div class="zone-row spell-row">${[0, 1, 2, 3, 4].map(i => zoneHTML(app, owner, 'spell', i, nums.spell + i)).join('')}</div>`;
  return `<div class="board-side ${isMe ? 'me' : 'opp'} ${isMe ? 'side-bottom' : 'side-top'}">
    <div class="rail rail-left">
      ${zoneHTML(app, owner, 'grave', 0, nums.grave)}
      <div class="deck-stack" data-deck-owner="${owner}">
        <div class="deck-inner"><span class="deck-count">${p.deck.length}</span><span class="deck-label">DECK</span></div>
      </div>
    </div>
    <div class="zone-grid">${isMe ? spellRow + monsterRow : monsterRow + spellRow}</div>
    <div class="rail rail-right">
      ${zoneHTML(app, owner, 'field', 0, nums.field)}
      <div class="hand-tally"><span class="tally-num">${p.hand.length}</span><span class="tally-label">HAND</span></div>
    </div>
  </div>`;
}

export function boardHTML(app) {
  const { game, viewer } = app;
  const opp = 1 - viewer;
  const turnMine = game.turnPlayer === viewer;
  const phase = game.phase;
  return `
    ${sideHTML(app, opp, false)}
    <div class="board-mid">
      <div class="mid-line"></div>
      <div class="mid-core">
        <div class="mid-ring"></div>
        <div class="mid-inner">
          <span class="mid-label">24 ZONE FIELD</span>
          <span class="mid-turn ${turnMine ? 'mine' : 'theirs'}">${game.winner != null ? 'DUEL OVER' : turnMine ? 'YOUR TURN' : `${esc(game.players[game.turnPlayer].name)} TURN`}</span>
          <span class="mid-count">TURN ${String(game.turnCount).padStart(2, '0')}</span>
        </div>
      </div>
      <div class="phase-track">
        <span class="phase-chip ${phase === 'main' ? 'active' : ''}">MAIN</span>
        <span class="phase-chip ${phase === 'battle' ? 'active' : ''}">BATTLE</span>
        <span class="phase-chip ${game.winner != null ? 'active' : ''}">END</span>
      </div>
    </div>
    ${sideHTML(app, viewer, true)}
  `;
}

export function hudHTML(app) {
  const { game, viewer } = app;
  const opp = 1 - viewer;
  const my = game.players[viewer], other = game.players[opp];
  const on = game.turnPlayer === viewer;
  const bar = (p) => `${Math.max(0, Math.min(100, (p.lp / 8000) * 100))}%`;
  return `
    <div class="fighter ${on ? '' : 'dim'}" data-fighter="opp">
      <div class="fighter-avatar opp">${esc(other.name.slice(0, 1))}</div>
      <div class="fighter-body">
        <div class="fighter-top"><span class="fighter-name">${esc(other.name)}</span><span class="fighter-lp" data-lp-owner="${opp}">${other.lp}</span></div>
        <div class="lp-bar"><span class="lp-fill opp" style="width:${bar(other)}"></span></div>
        <div class="fighter-meta"><span>HAND ${other.hand.length}</span><span>DECK ${other.deck.length}</span><span>GY ${other.grave.length}</span></div>
      </div>
    </div>
    <div class="turn-capsule ${on ? 'mine' : 'theirs'}">
      <span class="turn-kicker">${game.winner != null ? 'RESULT' : on ? 'YOUR' : 'ENEMY'}</span>
      <b>${game.winner != null ? 'FINISH' : on ? 'TURN' : 'TURN'}</b>
      <span class="turn-num">${String(game.turnCount).padStart(2, '0')}</span>
    </div>
    <div class="fighter right ${on ? 'dim' : ''}" data-fighter="me">
      <div class="fighter-avatar me">${esc(my.name.slice(0, 1))}</div>
      <div class="fighter-body">
        <div class="fighter-top"><span class="fighter-name">${esc(my.name)}</span><span class="fighter-lp" data-lp-owner="${viewer}">${my.lp}</span></div>
        <div class="lp-bar"><span class="lp-fill me" style="width:${bar(my)}"></span></div>
        <div class="fighter-meta"><span>HAND ${my.hand.length}</span><span>DECK ${my.deck.length}</span><span>GY ${my.grave.length}</span></div>
      </div>
    </div>`;
}

function findInst(app, uid) {
  const { game } = app;
  for (const owner of [0, 1]) {
    const p = game.players[owner];
    let inst = p.hand.find(c => c.uid === uid);
    if (inst) return { inst, owner, where: 'hand' };
    inst = p.monsters.find(c => c && c.uid === uid);
    if (inst) return { inst, owner, where: 'monster' };
    inst = p.spells.find(c => c && c.uid === uid);
    if (inst) return { inst, owner, where: 'spell' };
    if (p.field && p.field.uid === uid) return { inst: p.field, owner, where: 'field' };
  }
  return null;
}

export function detailHTML(app) {
  const sel = app.ui.selected;
  if (!sel) {
    return `<div class="detail-empty">
      <div class="detail-sigil">◈</div>
      <h3>DUEL PROTOCOL</h3>
      <p>手札のカードを選択し、光るゾーンへ配置。モンスターで攻撃し、相手のライフをゼロにせよ。</p>
      <ul class="quick-rules">
        <li><b>召喚</b> モンスターを攻撃表示で出す</li>
        <li><b>セット</b> 伏せて守備表示にする</li>
        <li><b>生贄</b> Lv5+ は場のモンスターを捧げる</li>
        <li><b>罠</b> 伏せた罠は自動で発動する</li>
      </ul>
      <div class="zone-meter"><span>ZONE STATUS</span><b>24</b><em>ALL SLOTS LIVE</em></div>
    </div>`;
  }
  const found = findInst(app, sel.uid);
  if (!found) return detailHTML({ ...app, ui: { ...app.ui, selected: null } });
  const { inst, owner, where } = found;
  const card = cardDef(inst);
  const mine = owner === app.viewer;
  const turnMine = app.game.turnPlayer === app.viewer;
  const isMon = card.kind === 'monster';
  const btns = [];

  if (mine && where === 'hand' && turnMine && app.game.phase === 'main') {
    if (isMon) {
      btns.push(`<button class="act-btn gold" data-act="summon">召喚</button>`);
      btns.push(`<button class="act-btn" data-act="set-monster">守備セット</button>`);
    } else if (card.field) {
      btns.push(`<button class="act-btn gold" data-act="activate">フィールド発動</button>`);
    } else if (card.kind === 'spell') {
      btns.push(`<button class="act-btn gold" data-act="activate">発動</button>`);
    } else {
      btns.push(`<button class="act-btn gold" data-act="set-spell">罠をセット</button>`);
    }
  }
  if (mine && where === 'monster' && turnMine) {
    if (inst.faceDown && app.game.phase === 'main') btns.push(`<button class="act-btn gold" data-act="flip">反転召喚</button>`);
    else if (app.game.phase === 'main') btns.push(`<button class="act-btn" data-act="position">${inst.position === 'attack' ? '守備表示に変更' : '攻撃表示に変更'}</button>`);
    if (app.game.phase === 'battle' && !inst.faceDown && inst.position === 'attack' && inst.attackedTurn !== app.game.turnCount) {
      btns.push(`<button class="act-btn gold" data-act="attack">攻撃宣言</button>`);
    }
  }
  if (!mine) {
    btns.push(`<span class="detail-note">相手のカード</span>`);
  }
  if (mine && where === 'hand' && turnMine && app.game.phase === 'battle') {
    btns.push(`<span class="detail-note">バトルフェイズ中は手札を使えません</span>`);
  }

  const boost = isMon && where !== 'hand' ? cardAtk(app.game, owner, inst) : card.atk;
  return `<div class="detail-card">
    <div class="detail-head"><span>INSPECT</span><b>${esc(card.name)}</b></div>
    <div class="detail-preview">${cardHTML(inst, { small: true, atk: boost, uidAttr: false })}</div>
    <div class="detail-info">
      <div class="detail-type">${esc(kindLabel(card))}${isMon ? ` / LV ${card.level}` : ''}</div>
      <p class="detail-text">${esc(card.text || '')}</p>
      ${isMon ? `<div class="detail-stats"><span>ATK <b>${boost}</b></span><span>DEF <b>${card.def}</b></span>${card.level >= 5 ? `<span class="need-tribute">生贄 ${card.level >= 9 ? 3 : card.level >= 7 ? 2 : 1}</span>` : ''}</div>` : ''}
    </div>
    <div class="detail-actions">${btns.join('')}</div>
  </div>`;
}

export function actionsHTML(app) {
  const { game, viewer } = app;
  const mine = game.turnPlayer === viewer;
  const pend = app.ui.pending;
  const attacker = app.ui.attacker;
  const oppHasMonsters = game.players[1 - viewer].monsters.some(Boolean);
  let hint = '';
  if (game.winner != null) hint = 'デュエル終了';
  else if (!mine) hint = `${esc(game.players[game.turnPlayer].name)} のターン`;
  else if (pend?.type === 'summon') hint = pend.need > 0 ? `生贄 ${pend.tributes.length}/${pend.need} を選択 → 空きゾーン` : '召喚するモンスターゾーンを選択';
  else if (pend?.type === 'setSpell') hint = 'セットする魔法・罠ゾーンを選択';
  else if (pend?.type === 'field') hint = 'フィールドゾーンを選択';
  else if (attacker) hint = oppHasMonsters ? '攻撃対象のモンスターを選択' : '直接攻撃を実行';
  else if (game.phase === 'battle') hint = '攻撃するモンスターを選択';
  else hint = '手札を選んでアクション';

  const canBattle = mine && game.phase === 'main' && game.winner == null;
  const canEnd = mine && game.winner == null;
  return `
    <div class="action-hint ${mine ? 'live' : ''}">${hint}</div>
    <div class="action-row">
      ${canBattle ? `<button class="big-btn battle" data-act="battle">⚔ バトルフェイズ</button>` : ''}
      ${canEnd ? `<button class="big-btn end" data-act="end-turn">ターン終了 ⟶</button>` : ''}
      ${attacker && !oppHasMonsters && game.phase === 'battle' ? `<button class="big-btn direct" data-act="direct">直接攻撃</button>` : ''}
      ${pend ? `<button class="big-btn cancel" data-act="cancel">キャンセル</button>` : ''}
    </div>`;
}

export function logHTML(app) {
  const entries = app.game.log.slice(-40);
  return entries.map(e => `<div class="log-line ${e.kind || 'sys'}"><span class="log-turn">T${String(e.turn).padStart(2, '0')}</span><span>${esc(e.text)}</span></div>`).join('');
}

export function roomsHTML(app) {
  const { rooms, online, name } = app;
  const statusLabel = s => ({ waiting: '待機中', cpu: 'CPU戦', online: '対戦中', away: '離席' }[s] || s);
  const rows = rooms.map(room => {
    const own = room.self;
    const canJoin = !own && room.status !== 'online' && app.mode !== 'online';
    const players = room.guestId ? 2 : 1;
    return `<div class="room-row ${own ? 'own' : ''} ${room.status === 'online' ? 'busy' : ''}" data-room-id="${room.id}">
      <div class="room-status ${room.status}"><span class="dot"></span>${statusLabel(room.status)}</div>
      <div class="room-main">
        <div class="room-name">${esc(room.hostName)}<span class="room-tag">${own ? '参加中' : 'ROOM'}</span></div>
        <div class="room-sub"><span>#${room.id}</span><span>LP 8000</span><span>${players}/2</span></div>
      </div>
      <div class="room-side">
        ${own ? `<span class="joined-mark">✓</span>` : canJoin ? `<button class="join-btn" data-join-room="${room.id}">参加</button>` : `<span class="lock-mark">${room.status === 'online' ? 'LOCK' : '—'}</span>`}
      </div>
    </div>`;
  }).join('');

  return `<div class="rooms-head">
      <div><span class="eyebrow">LIVE LOBBY</span><h2>ONLINE ROOMS</h2></div>
      <div class="online-pill"><span class="live-dot"></span>${online} ONLINE</div>
    </div>
    <div class="self-banner">
      <span class="self-ring"></span>
      <div><b>自分のルームを自動生成</b><span>起動時に作成・自動参加済み</span></div>
      <span class="self-code">#${app.net?.room.id || '----'}</span>
    </div>
    <div class="room-list">${rows}</div>
    <div class="rooms-footer">
      <button class="ghost-btn" data-act="new-room">＋ ルームを立て直す</button>
      <span class="footer-note">同じブラウザの別タブが対戦相手になります</span>
    </div>`;
}

export function handCountsHTML(app) {
  const { game, viewer } = app;
  const opp = game.players[1 - viewer];
  return `<div class="opp-hand">${Array.from({ length: Math.min(opp.hand.length, 7) }, (_, i) => miniBack(i)).join('')}<span class="opp-hand-label">HAND ${opp.hand.length}</span></div>`;
}
