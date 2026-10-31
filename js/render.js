import { CARDS, ATTR_LABEL, RARITY_LABEL, cardTypeLabel } from './cards.js'
import {
  atkOf, defOf, countMonsters, attackersOf,
  canSpecialSummon, canActivateSet, spellUsable, zoneMonster, MAX_LP,
} from './engine.js'

export const $ = (sel, root = document) => root.querySelector(sel)
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]))
export const fmt = (n) => Number(n || 0).toLocaleString('en-US')

export function modeLabel(app) {
  if (app.connecting) return '接続中'
  if (app.hostGone) return '切断'
  if (app.role === 'guest' || app.mode === 'online') return '対人戦'
  return 'CPU戦'
}

export function roomCodeFor(app) {
  if (app.role === 'guest' || app.role === 'guest-pending' || app.role === 'guest-left') {
    if (app.hostCode) return app.hostCode
    const room = app.net.list().find((r) => r.id === app.inRoomId)
    return room?.code || '----'
  }
  return app.net.ownRoom()?.code || '----'
}

function button(label, attrs, disabled = false, cls = '') {
  const data = Object.entries(attrs || {})
    .map(([key, value]) => `data-${key}="${esc(value)}"`)
    .join(' ')
  return `<button class="btn ${cls}" ${data}${disabled ? ' disabled' : ''}>${label}</button>`
}

/* ───────────────────────── CARD MARKUP ───────────────────────── */

export function cardHTML(app, inst, ctx = {}) {
  if (!inst) return ''
  const c = CARDS[inst.id]
  if (!c) return ''
  const idx = Number(ctx.index ?? 0)
  const delay = `--i:${idx};--seed:${(inst.uid || '').replace(/\D/g, '') % 9}`

  if (ctx.faceDown) {
    return `<div class="card card-back" data-uid="${esc(inst.uid)}" style="${delay}">
      <div class="back-lines"></div>
      <span class="back-mark">24</span>
      <span class="back-sub">DUEL</span>
      <span class="back-set">SET</span>
    </div>`
  }

  const side = ctx.side
  const st = app.state
  const isMonster = c.type === 'monster'
  const effAtk = isMonster && st && side != null ? atkOf(st, side, inst) : (c.atk || 0)
  const effDef = isMonster && st && side != null ? defOf(st, side, inst) : (c.def || 0)
  const buffed = isMonster && (effAtk !== (c.atk || 0) || effDef !== (c.def || 0))
  const tag = isMonster
    ? (c.extra ? 'EX' : `Lv.${c.level}`)
    : c.type === 'spell'
      ? (c.spellType === 'field' ? 'FIELD' : c.spellType === 'equip' ? 'EQUIP' : 'SPELL')
      : 'TRAP'

  const foot = isMonster
    ? `<span class="stat atk${buffed ? ' buffed' : ''}"><i>ATK</i><b>${fmt(effAtk)}</b></span>
       <span class="stat def${buffed ? ' buffed' : ''}"><i>DEF</i><b>${fmt(effDef)}</b></span>`
    : `<span class="spell-kind">${tag}</span><span class="spell-mark">${esc(ATTR_LABEL[c.attr])}</span>`

  const badges = []
  if (isMonster && ctx.side != null && inst.pos === 'def' && !inst.faceDown) {
    badges.push('<span class="pos-badge">DEF</span>')
  }
  if (isMonster && inst.atkBonus) badges.push(`<span class="buff-badge">+${inst.atkBonus}</span>`)
  if (c.extra) badges.push('<span class="extra-badge">EX</span>')

  return `<div class="card type-${c.type} attr-${c.attr} rarity-${c.rarity || 'n'}${c.extra ? ' is-extra' : ''}${inst.faceDown ? ' is-set' : ''}"
      data-uid="${esc(inst.uid)}" data-card-id="${esc(inst.id)}" style="${delay}">
    <div class="card-sheen"></div>
    <div class="card-head">
      <span class="card-name">${esc(c.name)}</span>
      <span class="card-tag">${tag}</span>
    </div>
    <div class="card-art">
      <span class="art-orbit"></span>
      <span class="art-glyph">${esc(c.glyph)}</span>
      <span class="art-attr" title="${esc(ATTR_LABEL[c.attr])}">${esc(ATTR_LABEL[c.attr])}</span>
    </div>
    <div class="card-foot">${foot}</div>
    ${badges.join('')}
  </div>`
}

export function cardRowHTML(app, inst, ctx = {}) {
  const c = CARDS[inst.id]
  if (!c) return ''
  const isMonster = c.type === 'monster'
  const stats = isMonster
    ? `<span class="row-stat">ATK ${fmt(c.atk)} / DEF ${fmt(c.def)}</span>`
    : `<span class="row-stat">${esc(cardTypeLabel(c))}</span>`
  return `<div class="card-row attr-${c.attr}">
    <span class="row-glyph">${esc(c.glyph)}</span>
    <div class="row-main">
      <div class="row-title"><b>${esc(c.name)}</b><span class="rarity rarity-${c.rarity || 'n'}">${RARITY_LABEL[c.rarity || 'n']}</span>${stats}</div>
      <p class="row-text">${esc(c.text || '')}</p>
    </div>
    ${ctx.action || ''}
  </div>`
}

/* ───────────────────────── TOP BAR ───────────────────────── */

export function renderTopbar(app) {
  const rooms = app.net.list()
  const joinable = rooms.filter((r) =>
    r.id !== app.ownRoomId && r.hostId !== app.clientId &&
    app.net.fresh(r) && r.joinable && r.mode !== 'pvp' && r.mode !== 'away').length
  const count = $('#roomCount')
  if (count) count.textContent = String(joinable)
  const roomText = $('#roomChipText')
  if (roomText) roomText.textContent = `ROOM ${roomCodeFor(app)}`
  const chipMode = $('#roomChipMode')
  if (chipMode) {
    chipMode.textContent = modeLabel(app)
    chipMode.className = `chip-mode mode-${app.connecting ? 'wait' : app.hostGone ? 'gone' : app.mode === 'online' ? 'pvp' : 'cpu'}`
  }
  const chip = $('#roomChip')
  if (chip) chip.dataset.online = String(app.mode === 'online')
  const sound = $('#soundBtn')
  if (sound) sound.textContent = app.soundOn ? 'SOUND ON' : 'SOUND OFF'
}

/* ───────────────────────── FIELD ───────────────────────── */

function zoneHTML(app, side, kind, index, zoneNumber) {
  const st = app.state
  const p = st.players[side]
  const inst = kind === 'monster' ? p.monsters[index] : kind === 'spell' ? p.spells[index] : kind === 'field' ? p.field : p.emz
  const mine = side === app.mySide
  const sel = app.sel
  const classes = ['zone', `zone-${kind}`, mine ? 'is-mine' : 'is-foe']
  let label = kind === 'monster' ? `M${index + 1}` : kind === 'spell' ? `S${index + 1}` : kind === 'field' ? 'FIELD' : 'EX'
  if (inst) classes.push('filled')

  if (sel?.kind === 'place' && mine && !inst) {
    const expected = sel.mode === 'setSpell' ? 'spell' : 'monster'
    if (kind === expected) classes.push('hl-place')
  }
  if (sel?.kind === 'attacker') {
    if (mine && sel.zoneKind === kind && (kind === 'emz' || sel.zoneIndex === index)) classes.push('hl-attacker')
    if (!mine && inst && (kind === 'monster' || kind === 'emz')) classes.push('hl-target')
  }
  if (st.phase === 'battle' && st.active === side && mine && !st.noAttacks && inst &&
      !inst.faceDown && inst.pos === 'atk' && !inst.hasAttacked) {
    classes.push('can-attack')
  }
  if (kind === 'emz' && mine && !inst && canSpecialSummon(st, side) && st.phase === 'main' && st.active === side) {
    classes.push('emz-ready')
  }
  if (sel?.kind === 'info' && sel.side === side && sel.zoneKind === kind && sel.zoneIndex === index) {
    classes.push('hl-info')
  }

  const faceDown = !!inst?.faceDown
  const content = inst
    ? cardHTML(app, inst, { side, kind, index, faceDown })
    : `<span class="zone-plus">${kind === 'emz' ? 'EX' : kind === 'field' ? 'FIELD' : '＋'}</span>`
  const column = kind === 'emz' || kind === 'field' ? 1 : index + 2
  const row = kind === 'field' || kind === 'spell' ? 2 : 1

  return `<div class="${classes.join(' ')}" data-act="zone" data-side="${side}" data-kind="${kind}" data-index="${index}"
      data-zone="${zoneNumber}" role="button" aria-label="${mine ? '自分' : '相手'}の${label}ゾーン"
      style="grid-column:${column};grid-row:${row}">
    <span class="zone-num">${String(zoneNumber).padStart(2, '0')}</span>
    <span class="zone-label">${label}</span>
    ${content}
  </div>`
}

function pilesHTML(app, side) {
  const st = app.state
  const p = st.players[side]
  const mine = side === app.mySide
  const exReady = mine && canSpecialSummon(st, side)
  return `<div class="piles">
    <button class="pile pile-deck" data-act="openPile" data-side="${side}" data-pile="deck" aria-label="デッキ">
      <span class="pile-label">DECK</span><b>${p.deck.length}</b><i>山札</i>
    </button>
    <button class="pile pile-extra${exReady ? ' ready' : ''}" data-act="openPile" data-side="${side}" data-pile="extra" aria-label="EXデッキ">
      <span class="pile-label">EX</span><b>${p.extra.length}</b><i>${exReady ? 'READY' : 'EXデッキ'}</i>
    </button>
    <button class="pile pile-gy" data-act="openPile" data-side="${side}" data-pile="gy" aria-label="墓地">
      <span class="pile-label">GY</span><b>${p.gy.length}</b><i>墓地</i>
    </button>
    <button class="pile pile-void" data-act="openPile" data-side="${side}" data-pile="banished" aria-label="除外">
      <span class="pile-label">VOID</span><b>${p.banished.length}</b><i>除外</i>
    </button>
  </div>`
}

function playerBarHTML(app, side, who) {
  const st = app.state
  const p = st.players[side]
  const mine = side === app.mySide
  const active = st.active === side
  const lpPct = Math.max(0, Math.min(100, (p.lp / MAX_LP) * 100))
  const low = p.lp <= 3000
  const glyph = Array.from(p.name || 'DUEL')[0] || 'D'
  const rival = !mine
  const badges = []
  if (mine) badges.push('<span class="p-badge you">YOU</span>')
  if (rival && p.isCPU) badges.push('<span class="p-badge cpu">CPU</span>')
  if (rival && !p.isCPU) badges.push('<span class="p-badge rival">RIVAL</span>')
  if (active && st.winner == null) badges.push('<span class="p-badge active">ACTIVE</span>')
  if (p.extraUsed) badges.push('<span class="p-badge ex">EX USED</span>')

  const handStack = rival
    ? `<div class="hand-stack" aria-label="相手の手札 ${p.hand.length}枚">
        ${Array.from({ length: Math.min(5, p.hand.length) }).map((_, i) => `<span class="mini-back" style="--i:${i}"></span>`).join('')}
        <b>${p.hand.length}</b>
      </div>`
    : `<div class="hand-stack self-hand"><b>${p.hand.length}</b><span>手札</span></div>`

  return `<div class="player-bar ${who} ${active ? 'is-active' : ''}">
    <div class="avatar ${low ? 'low' : ''}"><span>${esc(glyph)}</span><i class="avatar-ring"></i></div>
    <div class="p-main">
      <div class="p-name-row">
        <span class="p-name">${esc(p.name)}</span>
        ${badges.join('')}
      </div>
      <div class="lp-block" data-lp-side="${side}">
        <div class="lp-top"><span class="lp-label">LIFE POINT</span><span class="lp-num ${low ? 'low' : ''}">${fmt(p.lp)}</span></div>
        <div class="lp-track"><i class="lp-fill ${low ? 'low' : ''}" style="width:${lpPct}%"></i><span class="lp-ticks"></span></div>
      </div>
    </div>
    ${handStack}
    <div class="bar-meta">
      <span>DECK <b>${p.deck.length}</b></span>
      <span>GY <b>${p.gy.length}</b></span>
    </div>
  </div>`
}

export function renderSide(app, side, who) {
  const root = who === 'opponent' ? $('#oppSide') : $('#mySide')
  if (!root) return
  const st = app.state
  if (!st) {
    root.innerHTML = `<div class="player-bar ${who}"><div class="avatar"><span>?</span></div>
      <div class="p-main"><div class="p-name-row"><span class="p-name">CONNECTING…</span></div>
      <div class="lp-track skeleton-track"><i></i></div></div></div>
      <div class="board-grid skeleton-grid">
        ${Array.from({ length: 10 }).map((_, i) => `<div class="zone zone-skeleton" style="--i:${i}"></div>`).join('')}
      </div>`
    return
  }
  const base = side === 0 ? 1 : 13
  const monsters = Array.from({ length: 5 }).map((_, i) => zoneHTML(app, side, 'monster', i, base + i)).join('')
  const spells = Array.from({ length: 5 }).map((_, i) => zoneHTML(app, side, 'spell', i, base + 5 + i)).join('')
  root.innerHTML = `
    ${playerBarHTML(app, side, who)}
    <div class="board-grid">
      ${zoneHTML(app, side, 'emz', 0, base + 10)}
      ${monsters}
      ${zoneHTML(app, side, 'field', 0, base + 11)}
      ${spells}
      ${pilesHTML(app, side)}
    </div>`
}

/* ───────────────────────── CENTER ───────────────────────── */

function hintText(app) {
  const st = app.state
  if (!st) return app.connecting ? '対戦相手のルームに接続しています…' : 'ルームを準備しています…'
  if (st.winner != null) return 'デュエル終了'
  if (st.active !== app.mySide) {
    if (app.mode === 'cpu') return 'CPUが思考中… カードは止まらない'
    return '相手のターン… 次の一手を待て'
  }
  if (app.sel?.kind === 'place') {
    return app.sel.mode === 'setSpell' ? 'セットする魔法・罠ゾーンをタップ' : '召喚するモンスターゾーンをタップ'
  }
  if (app.sel?.kind === 'attacker') return '攻撃対象をタップ / DIRECT ATTACK'
  if (st.phase === 'battle') {
    if (st.noAttacks) return 'このターンの攻撃は封じられた'
    return '攻撃するモンスターをタップ'
  }
  return '手札を選んで、召喚・発動・セット'
}

function latestLog(st) {
  return st?.log?.length ? st.log[st.log.length - 1] : null
}

export function renderCenter(app) {
  const root = $('#centerBar')
  if (!root) return
  const st = app.state
  if (!st) {
    root.innerHTML = `<div class="turn-cluster"><span class="turn-kicker">STANDBY</span><b class="turn-status">CONNECTING</b></div>
      <div class="center-hint">ルーム接続中…</div><div class="center-actions"></div>`
    return
  }
  const myTurn = st.active === app.mySide
  const dead = st.winner != null
  const canAct = myTurn && !dead && !app.connecting
  const main = st.phase === 'main'
  const exReady = canSpecialSummon(st, app.mySide) && main && canAct
  const log = latestLog(st)
  const status = dead ? 'DUEL OVER' : myTurn ? 'YOUR TURN' : app.mode === 'cpu' ? 'CPU TURN' : 'ENEMY TURN'

  root.innerHTML = `
    <div class="turn-cluster">
      <div class="turn-badge"><span>TURN</span><b>${String(st.turn).padStart(2, '0')}</b></div>
      <div class="turn-info">
        <span class="turn-status ${myTurn ? 'mine' : 'theirs'} ${dead ? 'dead' : ''}">${status}</span>
        <span class="phase-pips">
          <i class="pip ${main ? 'on' : ''}">MAIN</i>
          <i class="pip ${!main ? 'on' : ''}">BATTLE</i>
        </span>
      </div>
    </div>
    <div class="center-mid">
      <p class="center-hint">${esc(hintText(app))}</p>
      <p class="center-log tone-${log?.tone || 'system'}"><span>LOG</span>${esc(log?.text || 'デュエル開始を待っています')}</p>
    </div>
    <div class="center-actions">
      <button class="btn btn-battle ${exReady ? 'has-ex' : ''}" data-act="battle"${!canAct || !main ? ' disabled' : ''}>BATTLE</button>
      <button class="btn btn-extra" data-act="extra"${!exReady ? ' disabled' : ''}>EX SUMMON</button>
      <button class="btn btn-end" data-act="endTurn"${!canAct ? ' disabled' : ''}>END TURN</button>
    </div>`
}

/* ───────────────────────── HAND + INFO ───────────────────────── */

function infoCardHTML(app, inst, hidden, context) {
  const c = CARDS[inst.id]
  if (hidden) {
    return `<div class="info-card mystery">
      <div class="info-title"><span class="rarity rarity-r">SET</span><b>セットカード</b><span class="info-type">正体不明</span></div>
      <p class="info-text">裏向きにセットされたカード。攻撃するか、効果のタイミングを待って正体が明らかになる。</p>
    </div>`
  }
  const st = app.state
  const side = context?.side
  const stats = c.type === 'monster'
    ? `<span class="info-stat">ATK <b>${fmt(side != null ? atkOf(st, side, inst) : c.atk)}</b></span>
       <span class="info-stat">DEF <b>${fmt(side != null ? defOf(st, side, inst) : c.def)}</b></span>`
    : `<span class="info-stat">${esc(cardTypeLabel(c))}</span>`
  return `<div class="info-card attr-${c.attr}">
    <div class="info-title">
      <span class="rarity rarity-${c.rarity || 'n'}">${RARITY_LABEL[c.rarity || 'n']}</span>
      <b>${esc(c.name)}</b>
      <span class="info-type">${esc(cardTypeLabel(c))}</span>
      ${stats}
    </div>
    <p class="info-text">${esc(c.text || '')}</p>
  </div>`
}

function actionButtonsForHand(app, inst, p) {
  const st = app.state
  const c = CARDS[inst.id]
  const myTurn = st.active === app.mySide
  const main = st.phase === 'main' && myTurn && st.winner == null && !app.connecting
  const freeMonster = p.monsters.some((z) => !z)
  const freeSpell = p.spells.some((z) => !z)
  const out = []

  if (c.type === 'monster') {
    const can = main && !p.hasSummoned && freeMonster && !c.extra
    out.push(button('召喚', { act: 'placeMode', mode: 'summon', uid: inst.uid }, !can, 'btn-summon'))
    out.push(button('守備セット', { act: 'placeMode', mode: 'setMonster', uid: inst.uid }, !can, 'btn-set'))
  } else if (c.type === 'spell') {
    const usable = main && spellUsable(st, app.mySide, inst)
    out.push(button('発動', { act: 'activateSpell', uid: inst.uid }, !usable, 'btn-activate'))
    out.push(button('セット', { act: 'placeMode', mode: 'setSpell', uid: inst.uid }, !(main && freeSpell), 'btn-set'))
  } else {
    out.push(button('セット', { act: 'placeMode', mode: 'setSpell', uid: inst.uid }, !(main && freeSpell), 'btn-set'))
  }
  out.push(button('キャンセル', { act: 'cancelSel' }, false, 'btn-ghost'))
  return out.join('')
}

export function infoPanelHTML(app) {
  const st = app.state
  const sel = app.sel
  if (!st) {
    return `<div class="info-empty"><span class="info-orb"></span><div><b>DUEL 24 ZONES</b><p>24のゾーン、画像なしのカード、止まらない演出。</p></div></div>`
  }
  const p = st.players[app.mySide]
  if (sel?.kind === 'hand') {
    const inst = p.hand.find((c) => c.uid === sel.uid)
    if (inst) {
      return `${infoCardHTML(app, inst, false, { side: app.mySide })}
        <div class="info-actions">${actionButtonsForHand(app, inst, p)}</div>`
    }
  }
  if (sel?.kind === 'place') {
    const inst = p.hand.find((c) => c.uid === sel.uid)
    if (inst) {
      return `${infoCardHTML(app, inst, false, { side: app.mySide })}
        <div class="info-actions"><span class="info-tip">光っているゾーンをタップ</span>${button('キャンセル', { act: 'cancelSel' }, false, 'btn-ghost')}</div>`
    }
  }
  if (sel?.kind === 'attacker') {
    const inst = zoneMonster(p, sel.zoneKind, sel.zoneIndex)
    if (inst) {
      const foe = st.players[1 - app.mySide]
      const canDirect = countMonsters(foe) === 0 || !!CARDS[inst.id].direct
      return `${infoCardHTML(app, inst, false, { side: app.mySide })}
        <div class="info-actions">
          <span class="info-tip">${countMonsters(foe) ? '相手モンスターをタップ' : '直接攻撃できる'}</span>
          ${canDirect ? button('DIRECT ATTACK', { act: 'directAttack' }, false, 'btn-direct') : ''}
          ${button('キャンセル', { act: 'cancelSel' }, false, 'btn-ghost')}
        </div>`
    }
  }
  if (sel?.kind === 'info') {
    const owner = st.players[sel.side]
    let inst = null
    if (sel.zoneKind === 'monster') inst = owner.monsters[sel.zoneIndex]
    if (sel.zoneKind === 'emz') inst = owner.emz
    if (sel.zoneKind === 'spell') inst = owner.spells[sel.zoneIndex]
    if (sel.zoneKind === 'field') inst = owner.field
    if (inst) {
      const hidden = inst.faceDown && sel.side !== app.mySide
      const ownSetSpell = sel.side === app.mySide && sel.zoneKind === 'spell' && inst.faceDown &&
        CARDS[inst.id].type === 'spell' && canActivateSet(st, app.mySide, sel.zoneIndex)
      return `${infoCardHTML(app, inst, hidden, { side: sel.side })}
        <div class="info-actions">
          ${ownSetSpell ? button('セット解除して発動', { act: 'activateSet', zone: sel.zoneIndex }, false, 'btn-activate') : ''}
          ${button('閉じる', { act: 'cancelSel' }, false, 'btn-ghost')}
        </div>`
    }
  }
  const log = latestLog(st)
  return `<div class="info-empty">
    <span class="info-orb"></span>
    <div><b>TAP A CARD</b><p>${esc(log?.text || '手札をタップしてカードを選択。光るゾーンへ配置しよう。')}</p></div>
    <span class="info-zones">24 ZONES</span>
  </div>`
}

export function renderHand(app) {
  const root = $('#handArea')
  if (!root) return
  const st = app.state
  const p = st ? st.players[app.mySide] : { hand: [], deck: [], extra: [] }
  const myTurn = st ? st.active === app.mySide : false
  const cards = p.hand.map((inst, i) => {
    const selected = app.sel?.kind === 'hand' && app.sel.uid === inst.uid
    const placing = app.sel?.kind === 'place' && app.sel.uid === inst.uid
    return `<button class="hand-card${selected ? ' selected' : ''}${placing ? ' placing' : ''}" data-act="hand" data-uid="${esc(inst.uid)}" style="--i:${i}" aria-label="${esc(CARDS[inst.id].name)}">
      ${cardHTML(app, inst, { side: app.mySide, index: i, hand: true })}
    </button>`
  }).join('')

  root.innerHTML = `
    <div class="info-panel">${infoPanelHTML(app)}</div>
    <div class="hand-bar">
      <div class="hand-meta">
        <span class="hand-title">HAND <b>${p.hand.length}</b></span>
        <span class="hand-sub">DECK ${p.deck.length} · EX ${p.extra.length}</span>
        <span class="turn-mini ${myTurn ? 'mine' : ''}">${myTurn ? 'YOUR MOVE' : 'WAITING'}</span>
      </div>
      <div class="hand-scroll">${cards || '<span class="hand-empty">手札なし</span>'}</div>
    </div>`
}

/* ───────────────────────── OVERLAY ───────────────────────── */

export function renderOverlay(app) {
  const root = $('#overlay')
  if (!root) return
  if (app.connecting) {
    root.className = 'overlay show overlay-connecting'
    root.innerHTML = `<div class="overlay-panel connect-panel">
      <div class="spinner"></div>
      <p class="eyebrow">ONLINE DUEL</p>
      <h2>相手のルームへ接続中</h2>
      <p class="overlay-copy">ROOM ${esc(app.hostCode || '----')} — ホストの応答を待っています。</p>
      <button class="btn btn-ghost" data-act="returnRoom">自分の部屋に戻る</button>
    </div>`
    return
  }
  if (app.hostGone) {
    root.className = 'overlay show overlay-gone'
    root.innerHTML = `<div class="overlay-panel gone-panel">
      <p class="eyebrow">CONNECTION LOST</p>
      <h2>HOST DISCONNECTED</h2>
      <p class="overlay-copy">ホストがルームを退出しました。自分のルームに戻ってCPUデュエルを再開できます。</p>
      <button class="btn btn-primary" data-act="returnRoom">自分の部屋に戻る</button>
    </div>`
    return
  }
  const st = app.state
  if (st && st.winner != null && app.resultReady) {
    const won = st.winner === app.mySide
    const me = st.players[app.mySide]
    const foe = st.players[1 - app.mySide]
    root.className = `overlay show ${won ? 'result-win' : 'result-lose'}`
    root.innerHTML = `<div class="overlay-panel result-panel">
      <div class="result-rays"></div>
      <p class="eyebrow">DUEL COMPLETE · TURN ${st.turn}</p>
      <h2 class="result-title">${won ? 'VICTORY' : 'DEFEAT'}</h2>
      <p class="result-reason">${esc(st.winReason || '')}</p>
      <div class="result-stats">
        <div><span>YOUR LP</span><b>${fmt(me.lp)}</b></div>
        <div><span>RIVAL LP</span><b>${fmt(foe.lp)}</b></div>
        <div><span>DAMAGE DEALT</span><b>${fmt(foe.lpLost || 0)}</b></div>
      </div>
      <div class="result-actions">
        <button class="btn btn-primary" data-act="rematch">再戦する</button>
        <button class="btn btn-ghost" data-act="openDrawer">ルーム一覧</button>
      </div>
      <p class="result-note">${app.mode === 'online'
        ? (app.role === 'guest' ? '再戦はホストにリクエストされます。' : '再戦すると同じ相手と新しいデュエルを開始します。')
        : '再戦するとCPUとの新しいデュエルを開始します。'}</p>
    </div>`
    return
  }
  root.className = 'overlay'
  root.innerHTML = ''
}
