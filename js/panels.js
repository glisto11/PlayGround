import { CARDS, cardTypeLabel, RARITY_LABEL } from './cards.js'
import { canSpecialSummon } from './engine.js'
import { esc, fmt, cardRowHTML } from './render.js'

function statusOf(room) {
  if (!room) return 'なし'
  if (room.mode === 'away') return '離席中'
  if (room.mode === 'pvp') return '対人戦中'
  return 'CPU戦 · 乱入可'
}

function roomModeClass(room) {
  if (!room) return 'none'
  if (room.mode === 'away') return 'away'
  if (room.mode === 'pvp') return 'pvp'
  return 'cpu'
}

export function renderDrawer(app) {
  const body = document.querySelector('#drawerBody')
  if (!body) return
  const active = document.activeElement
  if (active && active.id === 'nameInput') return

  const rooms = app.net.list()
  const own = rooms.find((r) => r.id === app.ownRoomId) || app.net.ownRoom()
  const others = rooms.filter((r) => r.id !== app.ownRoomId && r.hostId !== app.clientId && app.net.fresh(r))
  const inGuestRoom = app.role === 'guest' || app.role === 'guest-pending' || app.role === 'guest-left'
  const currentHostRoom = rooms.find((r) => r.id === app.inRoomId && r.id !== app.ownRoomId)

  const ownHTML = own ? `
    <section class="drawer-section own-room">
      <div class="section-head"><h3>あなたのルーム</h3><span class="badge ${inGuestRoom ? 'badge-away' : 'badge-live'}">${inGuestRoom ? '離席中' : '入室中'}</span></div>
      <div class="own-code">
        <span>ROOM CODE</span>
        <b>${esc(own.code)}</b>
        <button class="mini-btn" data-act="copyCode" data-code="${esc(own.code)}">COPY</button>
      </div>
      <div class="own-meta">
        <span class="room-status ${roomModeClass(own)}">${statusOf(own)}</span>
        <span>${esc(own.hostName)}${own.guestName ? ` vs ${esc(own.guestName)}` : ''}</span>
      </div>
      <div class="room-actions">
        <button class="btn btn-primary btn-sm" data-act="openTab">別タブで相手を開く</button>
        ${inGuestRoom ? '<button class="btn btn-ghost btn-sm" data-act="returnRoom">自分の部屋に戻る</button>' : ''}
      </div>
      <p class="room-note">起動時にこのルームを自動生成し、自動参加しています。別タブで開くと、あなたのルームへ自動入室します。</p>
    </section>` : `
    <section class="drawer-section own-room">
      <div class="section-head"><h3>あなたのルーム</h3><span class="badge badge-away">未生成</span></div>
      <p class="room-note">ルームを再生成しています…</p>
      <button class="btn btn-primary btn-sm" data-act="returnRoom">自分の部屋に戻る</button>
    </section>`

  const othersHTML = others.length ? others.map((room) => {
    const isCurrent = room.id === app.inRoomId && inGuestRoom
    const joinable = room.joinable && room.mode !== 'pvp' && room.mode !== 'away'
    const guests = room.guestName ? ` · ${esc(room.guestName)}` : ''
    return `<div class="room-row ${isCurrent ? 'current' : ''}">
      <div class="room-row-main">
        <div class="room-row-top">
          <b>${esc(room.hostName)}</b>
          <span class="room-code">${esc(room.code)}</span>
          <span class="room-status ${roomModeClass(room)}">${statusOf(room)}</span>
        </div>
        <p class="room-row-sub">HOST ${esc(room.hostName)}${guests}</p>
      </div>
      ${isCurrent
        ? '<span class="badge badge-live">入室中</span>'
        : joinable
          ? `<button class="mini-btn join" data-act="joinRoom" data-room="${esc(room.id)}">参加</button>`
          : '<span class="badge badge-full">満室</span>'}
    </div>`
  }).join('') : `<div class="empty-rooms">
      <span class="empty-icon">24</span>
      <p>他のルームはまだありません</p>
      <button class="btn btn-ghost btn-sm" data-act="openTab">別タブで相手を開く</button>
    </div>`

  const logs = (app.state?.log || []).slice(-50).reverse().map((entry) =>
    `<li class="tone-${entry.tone || 'system'}"><span class="log-turn">T${String(entry.turn).padStart(2, '0')}</span><span>${esc(entry.text)}</span></li>`
  ).join('')

  const canSurrender = app.state && app.state.winner == null && !app.connecting && !app.hostGone

  body.innerHTML = `
    ${ownHTML}

    <section class="drawer-section">
      <div class="section-head"><h3>オンラインルームリスト</h3><span class="badge">${others.length}</span></div>
      <p class="section-note">同じブラウザの別タブ／ウィンドウへリアルタイム同期。CPU戦中のルームには乱入できます。</p>
      <div class="room-list">${othersHTML}</div>
    </section>

    ${inGuestRoom ? `<section class="drawer-section current-room">
      <div class="section-head"><h3>接続中のルーム</h3><span class="badge badge-live">GUEST</span></div>
      <div class="own-meta"><span>ROOM ${esc(currentHostRoom?.code || app.hostCode || '----')}</span><span>HOST ${esc(app.hostName || currentHostRoom?.hostName || '----')}</span></div>
    </section>` : ''}

    <section class="drawer-section">
      <div class="section-head"><h3>デュエリスト名</h3></div>
      <div class="name-form">
        <input id="nameInput" data-live="1" maxlength="16" value="${esc(app.name)}" aria-label="デュエリスト名" />
        <button class="mini-btn" data-act="saveName">保存</button>
      </div>
    </section>

    <section class="drawer-section">
      <div class="section-head"><h3>デュエルログ</h3><span class="badge">${app.state?.log?.length || 0}</span></div>
      <ul class="log-list">${logs || '<li class="tone-system">まだログはありません</li>'}</ul>
    </section>

    <section class="drawer-section rules-section">
      <details>
        <summary>ルール / HOW TO DUEL</summary>
        <ul>
          <li>LP 8000。相手のLPを0にするか、デッキ切れで勝利。</li>
          <li>1ターンに1回召喚。モンスターは1体につき1回攻撃。</li>
          <li>各プレイヤー12ゾーン（モンスター5・魔法罠5・FIELD・EX）× 2 = <b>24ゾーン</b>。</li>
          <li>自分のモンスターが2体以上なら、1ターン1回EXゾーンへ特殊召喚。</li>
          <li>罠はセットした次のターン以降、条件を満たすと自動発動。</li>
          <li>月影の忍者は相手モンスターを無視して直接攻撃できる。</li>
          <li>手札をタップ → 光るゾーンをタップで配置。バトル中は攻撃するモンスター → 対象の順にタップ。</li>
        </ul>
      </details>
      ${canSurrender ? '<button class="btn btn-danger btn-sm surrender" data-act="surrender">デュエルを投了</button>' : ''}
      <p class="no-image">NO CARD IMAGES · ALL VISUALS ARE CSS / TYPOGRAPHY</p>
    </section>`
}

export function renderModal(app) {
  const root = document.querySelector('#modal')
  if (!root) return
  const modal = app.modal
  if (!modal || !app.state) {
    root.className = 'modal'
    root.innerHTML = ''
    return
  }
  const p = app.state.players[modal.side]
  const pile = modal.pile
  const labels = { deck: 'デッキ', extra: 'EXデッキ', gy: '墓地', banished: '除外ゾーン' }
  const title = labels[pile] || 'カード'
  const mine = modal.side === app.mySide
  let content = ''

  if (pile === 'deck') {
    content = `<div class="pile-empty-view"><span class="big-pile">${p.deck.length}</span>
      <p>山札の内容は非公開。ドローするまで何が来るか分からない。</p></div>`
  } else if (pile === 'extra') {
    const canSummonNow = mine && canSpecialSummon(app.state, app.mySide) && app.state.active === app.mySide && app.state.phase === 'main'
    content = p.extra.length ? p.extra.map((cardId, i) => {
      const c = CARDS[cardId]
      const action = mine
        ? `<button class="mini-btn join" data-act="specialSummon" data-card-id="${esc(cardId)}"${canSummonNow ? '' : ' disabled'}>EX特殊召喚</button>`
        : ''
      return cardRowHTML(app, { uid: `extra-${i}`, id: cardId }, { action })
    }).join('') : '<p class="pile-empty">EXデッキは空です</p>'
  } else {
    const pileCards = pile === 'gy' ? p.gy : p.banished
    content = pileCards.length
      ? pileCards.slice().reverse().map((inst, i) => cardRowHTML(app, inst, {})).join('')
      : '<p class="pile-empty">カードはありません</p>'
  }

  root.className = 'modal show'
  root.innerHTML = `<div class="modal-back" data-act="closeModal"></div>
    <div class="modal-panel">
      <div class="modal-head">
        <div>
          <p class="eyebrow">${mine ? 'YOUR' : 'RIVAL'} ${esc(title)}</p>
          <h2>${esc(p.name)} / ${esc(title)}</h2>
        </div>
        <button class="x-btn" data-act="closeModal" aria-label="閉じる">×</button>
      </div>
      <div class="modal-cards">${content}</div>
    </div>`
}
