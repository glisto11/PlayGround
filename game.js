/* ═══════════════════════════════════════════════════════════
   NEXUS DUEL 24
   Boot → auto-create + auto-join your room → 24-zone duel
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pad = (n) => String(n).padStart(2, '0');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ───────────── card catalogue ───────────── */

  const MONSTERS = [
    { key: 'wyrm', name: 'NOVA WYRM', glyph: '🐉', atk: 1800, def: 1200, cost: 2, hue: 185, desc: 'A serpent coiled from collapsed starlight.' },
    { key: 'ronin', name: 'RONIN-IX', glyph: '🗡️', atk: 1600, def: 1000, cost: 1, hue: 205, desc: 'A blade with no master and no mercy.' },
    { key: 'golem', name: 'PRISM GOLEM', glyph: '🔷', atk: 2000, def: 1800, cost: 2, hue: 265, desc: 'Refracts every strike into seven directions.' },
    { key: 'raptor', name: 'VOID RAPTOR', glyph: '🦖', atk: 1400, def: 800, cost: 1, hue: 285, desc: 'It hunts between the gaps in the signal.' },
    { key: 'seraph', name: 'HELIX SERAPH', glyph: '👁️', atk: 2200, def: 1600, cost: 2, hue: 45, desc: 'A watcher wrapped in wings of pure data.' },
    { key: 'kitsune', name: 'EMBER KITSUNE', glyph: '🦊', atk: 1500, def: 900, cost: 1, hue: 22, desc: 'Nine tails, nine sparks, one burned horizon.' },
    { key: 'titan', name: 'CHRONO TITAN', glyph: '⏳', atk: 2400, def: 2000, cost: 2, hue: 210, desc: 'It remembers the duel before it happens.' },
    { key: 'hound', name: 'GLITCH HOUND', glyph: '🐺', atk: 1200, def: 700, cost: 1, hue: 150, desc: 'Its bark arrives one frame before it does.' },
    { key: 'drake', name: 'AURORA DRAKE', glyph: '🦅', atk: 1900, def: 1400, cost: 2, hue: 170, desc: 'Rides the light that leaks between rooms.' },
    { key: 'lynx', name: 'SHADOW LYNX', glyph: '🐈‍⬛', atk: 1700, def: 1100, cost: 1, hue: 250, desc: 'A silhouette that learns the shape of fear.' },
    { key: 'mantis', name: 'QUANTUM MANTIS', glyph: '🦗', atk: 2100, def: 1500, cost: 2, hue: 130, desc: 'Strikes in one timeline, returns in another.' },
    { key: 'phoenix', name: 'STEEL PHOENIX', glyph: '🦚', atk: 2000, def: 1700, cost: 2, hue: 320, desc: 'Rebuilt from the ash of a dead server.' },
    { key: 'wisp', name: 'SIGNAL WISP', glyph: '👾', atk: 1300, def: 800, cost: 1, hue: 100, desc: 'A stray packet that refused to be dropped.' },
    { key: 'ox', name: 'OBSIDIAN OX', glyph: '🐂', atk: 2300, def: 1900, cost: 2, hue: 0, desc: 'Slow, absolute, and impossible to redirect.' },
    { key: 'siren', name: 'NEON SIREN', glyph: '🧜‍♀️', atk: 1500, def: 1000, cost: 1, hue: 195, desc: 'Her song rewrites the room adapter.' },
    { key: 'wraith', name: 'NULL WRAITH', glyph: '👻', atk: 1800, def: 1300, cost: 2, hue: 275, desc: 'Pointerless, nameless, already inside.' },
    { key: 'cat', name: 'CIPHER CAT', glyph: '🐈', atk: 1100, def: 900, cost: 1, hue: 30, desc: 'Knocks every packet off the table.' },
    { key: 'angel', name: 'ZER0 ANGEL', glyph: '🪽', atk: 2500, def: 2100, cost: 2, hue: 340, desc: 'The final handshake before silence.' }
  ];

  const SPELLS = [
    { key: 'ion', name: 'ION BURST', glyph: '⚡', cost: 1, hue: 55, effect: 'dmg', value: 1000, effectLabel: 'DMG 1000', desc: 'Cuts a clean 1000 LP channel through the enemy link.' },
    { key: 'repair', name: 'NANO REPAIR', glyph: '✚', cost: 1, hue: 145, effect: 'heal', value: 1200, effectLabel: 'HEAL 1200', desc: 'Rebuilds 1200 LP of torn runtime.' },
    { key: 'stream', name: 'DATA STREAM', glyph: '⧉', cost: 1, hue: 195, effect: 'draw', value: 2, effectLabel: 'DRAW 2', desc: 'Pull two more cards out of the stream.' },
    { key: 'clock', name: 'OVERCLOCK', glyph: '⬢', cost: 2, hue: 120, effect: 'buff', value: 500, effectLabel: 'ATK +500', desc: 'Every unit you control gains 500 ATK.' },
    { key: 'purge', name: 'PURGE', glyph: '✖', cost: 2, hue: 350, effect: 'purge', value: 0, effectLabel: 'DESTROY', desc: 'Delete the strongest enemy unit on the field.' },
    { key: 'emp', name: 'EMP FIELD', glyph: '⌀', cost: 1, hue: 250, effect: 'emp', value: 1, effectLabel: 'AP -1', desc: 'The enemy starts their next turn with 1 less AP.' }
  ];

  /* ───────────── runtime state ───────────── */

  let state = null;
  let uidSeq = 0;
  let duelSeq = 0;
  let roomCode = '#24-0000';
  let soundOn = true;
  let bootDone = false;
  let bootSkipped = false;
  let toastTimer = 0;

  const ROOMS = [
    { name: 'YOUR ROOM', host: 'YOU', players: 2, max: 2, ping: 8, status: 'duel', mine: true },
    { name: 'NEON ATRIUM', host: 'AKIRA', players: 1, max: 2, ping: 24, status: 'open' },
    { name: 'VOID GARDEN', host: 'MIRA', players: 2, max: 2, ping: 41, status: 'duel' },
    { name: 'ZERO HOUR', host: 'REN', players: 1, max: 2, ping: 67, status: 'open' },
    { name: 'SECTOR NINE', host: 'NOA', players: 2, max: 2, ping: 33, status: 'full' },
    { name: 'CHROME REEF', host: 'ECHO', players: 1, max: 2, ping: 52, status: 'open' },
    { name: 'LUMEN DOCK', host: 'SORA', players: 2, max: 2, ping: 19, status: 'duel' },
    { name: 'NULL CAFÉ', host: 'K0', players: 1, max: 2, ping: 73, status: 'open' }
  ];

  const els = {
    boot: $('#boot'), bootLog: $('#bootLog'), bootBar: $('#bootBar'), bootPct: $('#bootPct'),
    app: $('#app'), roomCode: $('#roomCode'), roomState: $('#roomState'), ping: $('#pingVal'),
    roomList: $('#roomList'), roomCount: $('#roomCount'), refreshRooms: $('#refreshRooms'),
    enemyFront: $('#enemyFront'), enemyBack: $('#enemyBack'),
    playerFront: $('#playerFront'), playerBack: $('#playerBack'),
    playerLP: $('#playerLP'), enemyLP: $('#enemyLP'), playerLPBar: $('#playerLPBar'), enemyLPBar: $('#enemyLPBar'),
    turnChip: $('#turnChip'), turnText: $('#turnText'), turnNo: $('#turnNo'), apPips: $('#apPips'),
    hand: $('#hand'), deckNum: $('#deckNum'), deckCount: $('#deckCount'), handCount: $('#handCount'), apCount: $('#apCount'),
    hint: $('#hint'), endTurnBtn: $('#endTurnBtn'), endTurnBtn2: $('#endTurnBtn2'), rematchMini: $('#rematchMini'),
    enemyDuelist: $('#enemyDuelist'), playerDuelist: $('#playerDuelist'),
    feed: $('#feed'), turnNumMini: $('#turnNumMini'), mfRows: $('#mfRows'),
    overlay: $('#overlay'), resultTitle: $('#resultTitle'), resultSub: $('#resultSub'), resultStats: $('#resultStats'),
    rematchBtn: $('#rematchBtn'), closeResult: $('#closeResult'),
    rulesModal: $('#rulesModal'), rulesBtn: $('#rulesBtn'), closeRules: $('#closeRules'),
    soundBtn: $('#soundBtn'), roomsBtn: $('#roomsBtn'), logBtn: $('#logBtn'),
    roomsPanel: $('#roomsPanel'), feedPanel: $('#feedPanel'), scrim: $('#scrim'),
    toast: $('#toast'), arena: $('#arena')
  };

  /* ───────────── sound ───────────── */

  let audio = null;

  function ensureAudio() {
    if (!audio) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audio = new Ctx();
      } catch { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
  }

  function tone(freq, dur = 0.05, type = 'sine', vol = 0.035, delay = 0) {
    if (!soundOn || !audio) return;
    try {
      const t = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* audio is optional */ }
  }

  /* ───────────── canvas background ───────────── */

  const canvas = $('#bg');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let motes = [];
  let bursts = [];

  function resizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const count = W < 700 ? 30 : 58;
    motes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.7 + 0.5,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(Math.random() * 0.22 + 0.04),
      a: Math.random() * 0.45 + 0.1,
      hue: Math.random() < 0.7 ? 188 : (Math.random() < 0.5 ? 300 : 265)
    }));
  }

  function burst(x, y, hue = 55, count = 22) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.4 + 0.9;
      bursts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.018 + Math.random() * 0.025,
        hue: hue + (Math.random() - 0.5) * 34,
        size: Math.random() * 1.8 + 0.6
      });
    }
  }

  function burstAt(selector, hue, count) {
    const el = typeof selector === 'string' ? $(selector) : selector;
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, hue, count);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    for (const m of motes) {
      m.x += m.vx;
      m.y += m.vy;
      if (m.y < -12) { m.y = H + 12; m.x = Math.random() * W; }
      if (m.x < -12) m.x = W + 12;
      if (m.x > W + 12) m.x = -12;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${m.hue}, 100%, 70%, ${m.a})`;
      ctx.shadowColor = `hsla(${m.hue}, 100%, 65%, .9)`;
      ctx.shadowBlur = 8;
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= p.decay;
      if (p.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 100%, ${58 + p.life * 22}%, ${p.life})`;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
      ctx.shadowBlur = 12;
      ctx.arc(p.x, p.y, p.size * p.life + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    requestAnimationFrame(draw);
  }

  /* ───────────── room list ───────────── */

  function renderRooms() {
    els.roomList.innerHTML = ROOMS.map((r, i) => {
      const count = r.mine ? '2/2' : `${r.players}/${r.max}`;
      return `
        <div class="room ${r.mine ? 'mine' : ''}">
          <div class="room-top">
            <span class="room-dot ${r.status}"></span>
            <b>${r.mine ? 'YOUR ROOM' : esc(r.name)}</b>
            <span class="room-players">${count}</span>
          </div>
          <div class="room-bottom">
            <span>HOST ${r.mine ? 'YOU' : esc(r.host)}</span>
            <span data-ping="${i}">${r.ping}ms</span>
            <span class="pill">${r.status === 'open' ? 'OPEN' : r.status === 'duel' ? 'IN DUEL' : 'FULL'}</span>
          </div>
        </div>`;
    }).join('');
    els.roomCount.textContent = `${ROOMS.length} LIVE`;
  }

  function updatePings() {
    let total = 0;
    ROOMS.forEach((r) => {
      if (r.mine) {
        r.ping = clamp(r.ping + Math.floor(Math.random() * 5) - 2, 6, 18);
        els.ping.textContent = r.ping;
      } else {
        r.ping = clamp(r.ping + Math.floor(Math.random() * 9) - 4, 12, 98);
      }
      total += r.ping;
    });
    const avg = Math.round(total / ROOMS.length);
    els.roomCount.textContent = `${ROOMS.length} LIVE · ${avg}ms`;
    $$('[data-ping]').forEach((el) => {
      const idx = Number(el.dataset.ping);
      if (ROOMS[idx]) el.textContent = `${ROOMS[idx].ping}ms`;
    });
  }

  function syncRooms() {
    els.refreshRooms.textContent = '···';
    ROOMS.forEach((r) => { if (!r.mine) r.ping = clamp(r.ping + Math.floor(Math.random() * 17) - 8, 11, 96); });
    updatePings();
    renderRooms();
    setTimeout(() => { els.refreshRooms.textContent = 'SYNC'; }, 550);
    toast('ROOM LIST SYNCED');
    tone(660, 0.045, 'square', 0.025);
  }

  /* ───────────── game construction ───────────── */

  function makeCard(def) {
    return {
      ...def,
      type: def.type || (def.atk != null ? 'monster' : 'spell'),
      uid: ++uidSeq,
      hasAttacked: false,
      fresh: false,
      spent: false
    };
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildDeck() {
    const deck = [];
    for (let i = 0; i < 18; i++) deck.push(makeCard(MONSTERS[Math.floor(Math.random() * MONSTERS.length)]));
    for (let i = 0; i < 6; i++) deck.push(makeCard(SPELLS[Math.floor(Math.random() * SPELLS.length)]));
    return shuffle(deck);
  }

  function createSide() {
    return {
      lp: 8000, maxLp: 8000,
      deck: buildDeck(),
      hand: [],
      front: Array(6).fill(null),
      back: Array(6).fill(null),
      ap: 3, maxAp: 3,
      apPenalty: 0
    };
  }

  function newDuel() {
    duelSeq += 1;
    state = {
      id: duelSeq,
      over: false,
      result: null,
      turn: 'player',
      turnNo: 1,
      busy: false,
      selectedHand: null,
      selectedUnit: null,
      player: createSide(),
      enemy: createSide(),
      stats: { cards: 0, damage: 0, kills: 0 },
      start: Date.now()
    };

    els.overlay.classList.remove('on');
    els.rematchMini.hidden = true;
    els.feed.innerHTML = '';
    ROOMS[0].status = 'duel';
    renderRooms();
    setRoomState('IN DUEL');

    drawCards(state.player, 4);
    drawCards(state.enemy, 4);

    const starterP = takeStarter(state.player);
    const starterE = takeStarter(state.enemy);
    if (starterP) { state.player.front[2] = starterP; starterP.fresh = true; starterP.hasAttacked = false; }
    if (starterE) { state.enemy.front[3] = starterE; starterE.fresh = true; starterE.hasAttacked = false; }

    feedLog(`ROOM ${roomCode} // DUEL INITIALIZED`, 'sys');
    feedLog('24 zones online · 12 per duelist', 'sys');
    if (starterP) feedLog(`YOU deployed ${starterP.name} in UNIT 03`, 'you');
    if (starterE) feedLog(`KAI deployed ${starterE.name} in UNIT 04`, 'enemy');

    startPlayerTurn(true);
    syncLP();
    feedLog(`YOUR TURN // ${state.player.ap} AP · DRAW PHASE COMPLETE`, 'you');
    syncHUD();
    toast(`ROOM ${roomCode} // DUEL LIVE`);
    tone(520, 0.06, 'triangle', 0.03);
    setTimeout(() => tone(780, 0.09, 'triangle', 0.03), 80);
  }

  function takeStarter(side) {
    const idx = side.deck.findIndex((c) => c.type === 'monster');
    if (idx < 0) return null;
    return side.deck.splice(idx, 1)[0];
  }

  function drawCards(side, amount) {
    const drawn = [];
    for (let i = 0; i < amount; i++) {
      if (!side.deck.length) break;
      const card = side.deck.pop();
      if (side.hand.length >= 8) { side.deck.push(card); break; }
      card.fresh = true;
      side.hand.push(card);
      drawn.push(card);
    }
    return drawn;
  }

  function startPlayerTurn(opening = false) {
    if (!state || state.over) return;
    const id = state.id;
    state.turn = 'player';
    if (!opening) state.turnNo += 1;
    state.selectedHand = null;
    state.selectedUnit = null;
    state.busy = false;

    const penalty = state.player.apPenalty || 0;
    state.player.apPenalty = 0;
    state.player.ap = Math.max(1, state.player.maxAp - penalty);
    state.player.front.forEach((c) => { if (c) c.hasAttacked = false; });

    const drawn = drawCards(state.player, 1);
    render();
    if (!opening) {
      feedLog(`YOUR TURN ${pad(state.turnNo)} // ${state.player.ap} AP`, 'you');
      if (drawn[0]) feedLog(`YOU drew ${drawn[0].name}`, 'you');
    } else {
      feedLog(`OPENING HAND // ${state.player.hand.length} CARDS`, 'sys');
      if (state.player.ap < state.player.maxAp) feedLog(`EMP DAMPENER // AP ${state.player.ap}`, 'sys');
    }
    if (state.id !== id) return;
    tone(440, 0.05, 'triangle', 0.025);
  }

  /* ───────────── rendering ───────────── */

  function cardHTML(card, opts = {}) {
    const { board = false, selected = false, selectable = false, played = false } = opts;
    const classes = [
      'card', card.type,
      board ? 'card--board' : '',
      selected ? 'selected' : '',
      selectable ? 'selectable' : '',
      card.hasAttacked ? 'attacked' : '',
      card.spent ? 'spent' : '',
      played || card.fresh ? 'played' : ''
    ].filter(Boolean).join(' ');
    const foot = card.type === 'monster'
      ? `<span class="card-stat atk"><small>ATK</small>${card.atk}</span><span class="card-stat def"><small>DEF</small>${card.def}</span>`
      : `<span class="card-stat atk"><small>${esc(card.effectLabel)}</small></span><span class="card-stat def"><small>SPELL</small></span>`;
    return `
      <div class="${classes}" data-uid="${card.uid}" style="--hue:${card.hue};--delay:${-((card.uid % 9) * 0.37).toFixed(2)}s">
        <div class="card-frame">
          <div class="card-head">
            <span class="card-name">${esc(card.name)}</span>
            <span class="card-cost">${card.cost}</span>
          </div>
          <div class="card-art"><span class="card-glyph">${card.glyph}</span></div>
          <div class="card-foot">${foot}</div>
          <div class="card-desc">${esc(card.desc)}</div>
        </div>
      </div>`;
  }

  function selectedHandCard() {
    if (!state || state.selectedHand == null) return null;
    return state.player.hand.find((c) => c.uid === state.selectedHand) || null;
  }

  function canDirect() {
    return Boolean(
      state && !state.over && state.turn === 'player' && state.selectedUnit &&
      state.player.ap >= 1 && !state.enemy.front.some(Boolean)
    );
  }

  function renderBoard(sideName) {
    const side = state[sideName];
    const isPlayer = sideName === 'player';
    const handCard = selectedHandCard();
    const selectedUnit = state.selectedUnit;

    ['back', 'front'].forEach((row) => {
      const el = sideName === 'enemy'
        ? (row === 'back' ? els.enemyBack : els.enemyFront)
        : (row === 'back' ? els.playerBack : els.playerFront);

      let html = '';
      for (let i = 0; i < 6; i++) {
        const card = side[row][i];
        let playable = false;
        let targetable = false;
        let selectable = false;

        if (isPlayer && state.turn === 'player' && !state.over && !state.busy) {
          if (handCard) {
            const need = handCard.type === 'monster' ? 'front' : 'back';
            playable = !card && row === need && side.ap >= handCard.cost;
          }
          if (!handCard && row === 'front' && card && !card.hasAttacked) selectable = true;
        }

        if (!isPlayer && row === 'front' && card && selectedUnit && state.turn === 'player' && !state.over && state.player.ap >= 1) {
          targetable = true;
        }

        const zoneClasses = [
          'zone', row === 'back' ? 'back-row' : '', card ? 'filled' : '',
          playable ? 'playable' : '', targetable ? 'targetable' : ''
        ].filter(Boolean).join(' ');

        html += `
          <div class="${zoneClasses}" data-side="${sideName}" data-row="${row}" data-index="${i}">
            ${card ? cardHTML(card, { board: true, selected: selectedUnit === card.uid, selectable }) : `
              <span class="zone-index">${pad(i + 1)}</span>
              <span class="zone-label">${row === 'front' ? 'UNIT' : 'TECH'}</span>`}
          </div>`;
      }
      el.innerHTML = html;
    });
  }

  function renderHand() {
    const hand = state.player.hand;
    if (!hand.length) {
      els.hand.innerHTML = '<div class="hand-empty">NO CARDS IN HAND</div>';
      return;
    }
    const canAct = state.turn === 'player' && !state.over && !state.busy;
    els.hand.innerHTML = hand.map((card, i) => {
      const selected = state.selectedHand === card.uid;
      const dim = canAct && card.cost > state.player.ap && !selected;
      return `
        <div class="hand-card ${selected ? 'selected' : ''} ${dim ? 'dim' : ''}" data-uid="${card.uid}" style="--i:${i}">
          ${cardHTML(card)}
          <span class="hand-key">${i + 1}</span>
        </div>`;
    }).join('');
  }

  function syncLP() {
    if (!state) return;
    const apply = (name, side) => {
      const bar = name === 'player' ? els.playerLPBar : els.enemyLPBar;
      const num = name === 'player' ? els.playerLP : els.enemyLP;
      bar.querySelector('i').style.width = `${(side.lp / side.maxLp) * 100}%`;
      num.textContent = String(side.lp);
      bar.classList.toggle('danger', side.lp <= 2000 && side.lp > 0);
    };
    apply('player', state.player);
    apply('enemy', state.enemy);
  }

  function updateHint() {
    if (!state) return;
    els.hint.classList.remove('hot', 'cool');
    if (state.over) { els.hint.textContent = 'DUEL COMPLETE — REMATCH TO RE-ENTER THE ROOM'; els.hint.classList.add('hot'); return; }
    if (state.turn === 'enemy') { els.hint.textContent = 'KAI IS MOVING…'; return; }
    if (state.busy) { els.hint.textContent = 'RESOLVING…'; return; }
    if (state.selectedUnit) {
      const direct = canDirect();
      els.hint.textContent = direct ? 'DIRECT ATTACK — TAP KAI OR THEIR EMPTY UNIT ZONE' : 'SELECT AN ENEMY UNIT TO ATTACK';
      els.hint.classList.add(direct ? 'hot' : 'cool');
      return;
    }
    if (selectedHandCard()) {
      const c = selectedHandCard();
      els.hint.textContent = c.type === 'monster' ? 'SELECT AN EMPTY UNIT ZONE' : 'SELECT AN EMPTY TECH ZONE';
      els.hint.classList.add('cool');
      return;
    }
    els.hint.textContent = state.player.ap > 0 ? 'TAP A CARD → TAP A ZONE · ATTACK = 1 AP' : 'NO AP LEFT — END TURN';
  }

  function syncHUD() {
    if (!state) return;
    syncLP();

    els.turnText.textContent = state.over ? 'DUEL OVER' : state.turn === 'player' ? 'YOUR TURN' : "KAI'S TURN";
    els.turnNo.textContent = `TURN ${pad(state.turnNo)}`;
    els.turnChip.classList.toggle('enemy', !state.over && state.turn === 'enemy');
    els.turnChip.classList.toggle('over', state.over);

    els.apPips.innerHTML = Array.from({ length: state.player.maxAp }, (_, i) =>
      `<span class="pip ${i < state.player.ap ? 'on' : 'spent'}"></span>`).join('');
    els.apCount.textContent = String(state.player.ap);
    els.handCount.textContent = String(state.player.hand.length);
    els.deckCount.textContent = String(state.player.deck.length);
    els.deckNum.textContent = String(state.player.deck.length);
    els.turnNumMini.textContent = pad(state.turnNo);

    const disable = state.over || state.turn !== 'player' || state.busy;
    els.endTurnBtn.disabled = disable;
    els.endTurnBtn2.disabled = disable;
    els.endTurnBtn.classList.toggle('ready', !disable && state.player.ap === 0);
    els.endTurnBtn.textContent = state.over ? 'DUEL OVER' : state.turn === 'player' ? (state.player.ap === 0 ? 'END TURN ●' : 'END TURN') : 'KAI MOVING';

    const direct = canDirect();
    els.enemyDuelist.classList.toggle('targetable', direct);
    els.playerDuelist.classList.toggle('targetable', false);
    updateHint();
  }

  function render() {
    if (!state) return;
    renderBoard('enemy');
    renderBoard('player');
    renderHand();
    syncHUD();
    [state.player, state.enemy].forEach((side) => {
      side.front.forEach((c) => { if (c) c.fresh = false; });
      side.back.forEach((c) => { if (c) c.fresh = false; });
    });
    state.player.hand.forEach((c) => { c.fresh = false; });
  }

  /* ───────────── feed / toast ───────────── */

  function feedLog(text, kind = 'sys') {
    if (!state) return;
    const elapsed = Math.floor((Date.now() - state.start) / 1000);
    const stamp = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;
    const item = document.createElement('div');
    item.className = `feed-item ${kind}`;
    item.innerHTML = `<time>${stamp}</time><p>${esc(text)}</p>`;
    els.feed.appendChild(item);
    while (els.feed.children.length > 60) els.feed.removeChild(els.feed.firstChild);
    els.feed.scrollTop = els.feed.scrollHeight;
    syncMobileFeed();
  }

  function syncMobileFeed() {
    if (!state || !els.mfRows) return;
    const items = [...els.feed.querySelectorAll('.feed-item')].slice(-3);
    els.mfRows.innerHTML = items.map((item) => {
      const kind = [...item.classList].find((c) => c !== 'feed-item') || 'sys';
      const text = item.querySelector('p');
      return `<div class="mf-row ${kind}">${esc(text ? text.textContent : '')}</div>`;
    }).join('');
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('on'), 1700);
  }

  function setRoomState(text) {
    if (els.roomState) els.roomState.textContent = text;
  }

  /* ───────────── life / floating numbers ───────────── */

  function showFloat(sideName, text, kind = 'damage') {
    const host = sideName === 'player' ? els.playerDuelist : els.enemyDuelist;
    if (!host) return;
    const span = document.createElement('span');
    span.className = `lp-float ${kind}`;
    span.textContent = text;
    host.appendChild(span);
    setTimeout(() => span.remove(), 1000);
  }

  function delayShake() {
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
  }

  function dealDamage(sideName, amount) {
    if (!state || state.over || amount <= 0) return;
    const side = state[sideName];
    const before = side.lp;
    side.lp = Math.max(0, side.lp - amount);
    const dealt = before - side.lp;
    if (sideName === 'enemy') state.stats.damage += dealt;

    syncLP();
    showFloat(sideName, `-${dealt}`, 'damage');
    const bar = sideName === 'player' ? els.playerLPBar : els.enemyLPBar;
    bar.classList.remove('hit');
    void bar.offsetWidth;
    bar.classList.add('hit');
    setTimeout(() => bar.classList.remove('hit'), 420);

    if (sideName === 'player') {
      delayShake();
      tone(90, 0.16, 'sawtooth', 0.045);
      if (side.lp <= 0) endDuel('lose');
    } else {
      tone(150, 0.12, 'sawtooth', 0.035);
      if (side.lp <= 0) endDuel('win');
    }
  }

  function heal(sideName, amount) {
    if (!state || state.over) return;
    const side = state[sideName];
    const before = side.lp;
    side.lp = Math.min(side.maxLp, side.lp + amount);
    const healed = side.lp - before;
    syncLP();
    if (healed > 0) showFloat(sideName, `+${healed}`, 'heal');
    tone(660, 0.1, 'sine', 0.03);
  }

  /* ───────────── spells / playing cards ───────────── */

  async function resolveSpell(sideName, card) {
    const foeName = sideName === 'player' ? 'enemy' : 'player';
    const me = state[sideName];
    const foe = state[foeName];

    switch (card.effect) {
      case 'dmg': {
        feedLog(`${sideName === 'player' ? 'YOU' : 'KAI'} // ${card.name} deals ${card.value} LP damage`, sideName === 'player' ? 'you' : 'enemy');
        dealDamage(foeName, card.value);
        burstAt(foeName === 'player' ? els.playerDuelist : els.enemyDuelist, 55, 16);
        break;
      }
      case 'heal': {
        heal(sideName, card.value);
        feedLog(`${sideName === 'player' ? 'YOU' : 'KAI'} // ${card.name} restores ${card.value} LP`, sideName === 'player' ? 'you' : 'enemy');
        break;
      }
      case 'draw': {
        const drawn = drawCards(me, card.value);
        feedLog(`${sideName === 'player' ? 'YOU' : 'KAI'} // ${card.name} draws ${drawn.length} card${drawn.length === 1 ? '' : 's'}`, sideName === 'player' ? 'you' : 'enemy');
        break;
      }
      case 'buff': {
        let count = 0;
        me.front.forEach((c) => { if (c) { c.atk += card.value; count += 1; } });
        feedLog(`${sideName === 'player' ? 'YOU' : 'KAI'} // ${card.name} grants +${card.value} ATK to ${count} unit${count === 1 ? '' : 's'}`, sideName === 'player' ? 'you' : 'enemy');
        if (count) {
          const first = me.front.find(Boolean);
          if (first) {
            const el = document.querySelector(`${sideName === 'player' ? '#playerFront' : '#enemyFront'} .card[data-uid="${first.uid}"]`);
            if (el) burstAt(el, 120, 18);
          }
        }
        break;
      }
      case 'purge': {
        const targets = foe.front.map((c, i) => c ? { card: c, i } : null).filter(Boolean);
        if (targets.length) {
          const target = targets.reduce((a, b) => b.card.atk > a.card.atk ? b : a);
          const el = document.querySelector(`${foeName === 'player' ? '#playerFront' : '#enemyFront'} .card[data-uid="${target.card.uid}"]`);
          if (el) { el.classList.add('destroyed'); burstAt(el, 350, 24); }
          foe.front[target.i] = null;
          feedLog(`${sideName === 'player' ? 'YOU' : 'KAI'} // ${card.name} deletes ${target.card.name}`, sideName === 'player' ? 'you' : 'enemy');
          if (sideName === 'player') state.stats.kills += 1;
          tone(180, 0.2, 'square', 0.04);
        } else {
          feedLog(`${card.name} // NO TARGET`, sideName === 'player' ? 'sys' : 'enemy');
        }
        break;
      }
      case 'emp': {
        foe.apPenalty = (foe.apPenalty || 0) + 1;
        feedLog(`${sideName === 'player' ? 'YOU' : 'KAI'} // ${card.name} strips 1 AP from the next turn`, sideName === 'player' ? 'you' : 'enemy');
        tone(240, 0.12, 'square', 0.03);
        break;
      }
      default: break;
    }
  }

  async function playCard(sideName, card, row, index) {
    if (!state || state.over) return false;
    const side = state[sideName];
    if (!side || !card) return false;
    if (side[row][index]) return false;
    if (side.ap < card.cost) return false;

    side.ap -= card.cost;
    side.hand = side.hand.filter((c) => c.uid !== card.uid);
    card.fresh = true;
    side[row][index] = card;

    if (sideName === 'player') {
      state.stats.cards += 1;
      state.selectedHand = null;
      state.selectedUnit = null;
      feedLog(`YOU ${card.type === 'monster' ? 'deployed' : 'activated'} ${card.name}`, 'you');
      tone(card.type === 'monster' ? 320 : 560, 0.07, 'triangle', 0.03);
    } else {
      feedLog(`KAI ${card.type === 'monster' ? 'deployed' : 'activated'} ${card.name}`, 'enemy');
      tone(card.type === 'monster' ? 220 : 480, 0.06, 'triangle', 0.025);
    }

    if (card.type === 'spell') {
      await resolveSpell(sideName, card);
      card.spent = true;
    }

    render();
    syncHUD();
    return true;
  }

  async function handlePlayerPlay(card, row, index) {
    const isSpell = card.type === 'spell';
    if (isSpell) {
      state.busy = true;
      syncHUD();
    }

    const ok = await playCard('player', card, row, index);
    if (isSpell) state.busy = false;

    if (!ok) {
      toast('CANNOT PLAY THAT CARD THERE');
      render();
      return;
    }

    if (card.type === 'monster') {
      const el = document.querySelector(`#playerFront .card[data-uid="${card.uid}"]`);
      if (el) burstAt(el, card.hue, 15);
      syncHUD();
    } else {
      renderHand();
      syncHUD();
    }

    if (!state.over) maybeAutoEnd();
  }

  function maybeAutoEnd() {
    if (!state || state.over || state.turn !== 'player') return;
    const hasFrontSpace = state.player.front.includes(null);
    const hasBackSpace = state.player.back.includes(null);
    const noHandPlayable = !state.player.hand.some((c) =>
      c.cost <= state.player.ap && (c.type === 'monster' ? hasFrontSpace : hasBackSpace)
    );
    const noAttackers = !state.player.front.some((c) => c && !c.hasAttacked) || state.player.ap < 1;
    if (state.player.ap <= 0 && noHandPlayable && noAttackers) {
      setTimeout(() => {
        if (state && !state.over && state.turn === 'player' && state.player.ap <= 0 && !state.busy) endTurn();
      }, 700);
    }
  }

  /* ───────────── combat ───────────── */

  function removeFrontCard(sideName, uid) {
    state[sideName].front = state[sideName].front.map((c) => (c && c.uid === uid ? null : c));
  }

  function animCard(sideName, uid, className) {
    const card = document.querySelector(
      `${sideName === 'player' ? '#playerFront' : '#enemyFront'} .card[data-uid="${uid}"]`
    );
    if (card) card.classList.add(className);
    return card;
  }

  async function playerAttack(defender, defenderIndex) {
    if (!state || state.over || state.turn !== 'player' || state.busy) return;
    const attacker = state.player.front.find((c) => c && c.uid === state.selectedUnit);
    if (!attacker) return;
    if (state.player.ap < 1) { toast('ATTACK COSTS 1 AP'); return; }
    if (attacker.hasAttacked) { toast('THIS UNIT ALREADY ATTACKED'); return; }
    if (!defender) return;

    state.busy = true;
    state.player.ap -= 1;
    attacker.hasAttacked = true;
    syncHUD();

    animCard('player', attacker.uid, 'lunge');
    tone(240, 0.09, 'sawtooth', 0.035);
    await sleep(300);
    if (!state || state.over) return;

    const defEl = animCard('enemy', defender.uid, 'hit');
    if (defEl) burstAt(defEl, 55, 20);
    await sleep(230);

    const diff = attacker.atk - defender.atk;
    if (diff > 0) {
      state.enemy.front[defenderIndex] = null;
      state.stats.kills += 1;
      feedLog(`YOU // ${attacker.name} destroys ${defender.name} · ${diff} LP DAMAGE`, 'battle');
      dealDamage('enemy', diff);
    } else if (diff === 0) {
      state.enemy.front[defenderIndex] = null;
      removeFrontCard('player', attacker.uid);
      state.stats.kills += 1;
      feedLog(`MUTUAL DESTRUCTION // ${attacker.name} × ${defender.name}`, 'battle');
      tone(120, 0.22, 'sawtooth', 0.04);
    } else {
      removeFrontCard('player', attacker.uid);
      feedLog(`KAI // ${defender.name} repels ${attacker.name} · ${-diff} LP DAMAGE`, 'battle');
      dealDamage('player', -diff);
    }

    state.selectedUnit = null;
    state.busy = false;
    render();
    syncHUD();
    tone(140, 0.16, 'square', 0.03);
    maybeAutoEnd();
  }

  async function playerDirect() {
    if (!state || state.over || state.busy || state.turn !== 'player') return;
    const attacker = state.player.front.find((c) => c && c.uid === state.selectedUnit);
    if (!attacker) return;
    if (!canDirect()) { toast('CLEAR THE ENEMY FRONT ROW FIRST'); return; }

    state.busy = true;
    state.player.ap -= 1;
    attacker.hasAttacked = true;
    syncHUD();
    animCard('player', attacker.uid, 'lunge');
    tone(300, 0.1, 'sawtooth', 0.04);
    await sleep(320);
    if (!state || state.over) return;

    feedLog(`YOU // ${attacker.name} DIRECT ATTACK · ${attacker.atk} LP DAMAGE`, 'battle');
    burstAt(els.enemyDuelist, 55, 30);
    dealDamage('enemy', attacker.atk);

    state.selectedUnit = null;
    state.busy = false;
    render();
    syncHUD();
    maybeAutoEnd();
  }

  async function enemyTurn(id) {
    if (!state || state.id !== id || state.over) return;
    const E = state.enemy;
    const P = state.player;

    const alive = () => state && state.id === id && !state.over;

    state.turn = 'enemy';
    state.selectedHand = null;
    state.selectedUnit = null;
    state.busy = false;

    const penalty = E.apPenalty || 0;
    E.apPenalty = 0;
    E.ap = Math.max(1, E.maxAp - penalty);
    E.front.forEach((c) => { if (c) c.hasAttacked = false; });

    render();
    feedLog(`KAI // TURN ${pad(state.turnNo)} START · ${E.ap} AP`, 'enemy');
    await sleep(600);
    if (!alive()) return;

    supplyEnemy(E);
    render();
    await sleep(420);
    if (!alive()) return;

    /* summon up to two units */
    let summons = 0;
    while (summons < 2 && E.ap > 0) {
      const slot = [2, 3, 1, 4, 0, 5].find((i) => !E.front[i]);
      const options = E.hand.filter((c) => c.type === 'monster' && c.cost <= E.ap);
      if (slot === undefined || !options.length) break;
      const card = options.reduce((a, b) => (b.atk > a.atk ? b : a));
      await sleep(360);
      if (!alive()) return;
      await playCard('enemy', card, 'front', slot);
      await sleep(400);
      if (!alive()) return;
      summons += 1;
    }

    /* cast one tech card */
    if (E.ap > 0) {
      const backSlot = E.back.findIndex((c) => !c);
      const options = E.hand.filter((c) => c.type === 'spell' && c.cost <= E.ap);
      if (backSlot >= 0 && options.length) {
        let card = null;
        if (P.front.some(Boolean)) card = options.find((c) => c.effect === 'purge');
        if (!card) card = options.find((c) => c.effect === 'dmg');
        if (!card && E.lp < 6200) card = options.find((c) => c.effect === 'heal');
        if (!card && P.front.some(Boolean)) card = options.find((c) => c.effect === 'emp');
        if (!card) card = options.find((c) => c.effect === 'draw');
        if (!card) card = options[0];
        if (card && !(card.effect === 'heal' && E.lp > 7400)) {
          await sleep(340);
          if (!alive()) return;
          await playCard('enemy', card, 'back', backSlot);
          await sleep(430);
          if (!alive()) return;
        }
      }
    }

    /* attack with the strongest ready units */
    let attacks = 0;
    while (attacks < 3 && E.ap >= 1) {
      if (!alive()) return;
      const ready = E.front.filter((c) => c && !c.hasAttacked);
      if (!ready.length) break;
      const attacker = ready.reduce((a, b) => (b.atk > a.atk ? b : a));
      const targets = P.front.map((c, i) => (c ? { card: c, i } : null)).filter(Boolean);

      if (targets.length) {
        const target = targets.reduce((a, b) => (b.card.atk < a.card.atk ? b : a));
        if (attacker.atk <= target.card.atk) break;

        E.ap -= 1;
        attacker.hasAttacked = true;
        syncHUD();
        animCard('enemy', attacker.uid, 'enemy-lunge');
        tone(210, 0.09, 'sawtooth', 0.03);
        await sleep(300);
        if (!alive()) return;

        const defEl = animCard('player', target.card.uid, 'hit');
        if (defEl) burstAt(defEl, 300, 18);
        await sleep(220);
        if (!alive()) return;

        const diff = attacker.atk - target.card.atk;
        P.front[target.i] = null;
        feedLog(`KAI // ${attacker.name} destroys ${target.card.name} · ${diff} LP DAMAGE`, 'battle');
        dealDamage('player', diff);
        render();
        syncHUD();
        await sleep(430);
        if (!alive()) return;
        attacks += 1;
      } else {
        E.ap -= 1;
        attacker.hasAttacked = true;
        syncHUD();
        animCard('enemy', attacker.uid, 'enemy-lunge');
        tone(300, 0.1, 'sawtooth', 0.035);
        await sleep(330);
        if (!alive()) return;
        feedLog(`KAI // ${attacker.name} DIRECT ATTACK · ${attacker.atk} LP DAMAGE`, 'battle');
        burstAt(els.playerDuelist, 300, 28);
        dealDamage('player', attacker.atk);
        render();
        syncHUD();
        await sleep(430);
        if (!alive()) return;
        attacks += 1;
      }
    }

    await sleep(450);
    if (!alive()) return;
    startPlayerTurn(false);
  }

  function supplyEnemy(E) {
    const drawn = drawCards(E, 1);
    if (drawn[0]) feedLog('KAI drew a card', 'enemy');
  }

  /* ───────────── end of duel / rematch ───────────── */

  function endDuel(result) {
    if (!state || state.over) return;
    state.over = true;
    state.result = result;
    state.busy = false;
    state.selectedUnit = null;
    state.selectedHand = null;
    state.enemy.front.forEach((c) => { if (c) c.hasAttacked = true; });
    ROOMS[0].status = 'full';
    renderRooms();
    setRoomState('DUEL OVER');
    render();
    syncHUD();
    feedLog(result === 'win' ? 'KAI LP 0 // VICTORY' : 'YOU LP 0 // DEFEAT', result === 'win' ? 'win' : 'battle');
    tone(result === 'win' ? 520 : 130, 0.3, 'triangle', 0.045);
    setTimeout(() => tone(result === 'win' ? 780 : 100, 0.5, 'triangle', 0.04), 220);

    if (result === 'win') burstAt(els.enemyDuelist, 55, 60);
    else burstAt(els.playerDuelist, 350, 60);

    setTimeout(() => {
      if (!state || !state.over) return;
      els.resultTitle.textContent = result === 'win' ? 'VICTORY' : 'DEFEAT';
      els.resultSub.textContent = result === 'win' ? 'KAI // LP 0' : 'YOU // LP 0';
      els.resultStats.innerHTML = `
        <div><span>TURNS</span><b>${pad(state.turnNo)}</b></div>
        <div><span>DAMAGE</span><b>${state.stats.damage}</b></div>
        <div><span>CARDS</span><b>${state.stats.cards}</b></div>`;
      $('.result-card').classList.toggle('lose', result === 'lose');
      els.overlay.classList.add('on');
      els.rematchMini.hidden = false;
    }, 700);
  }

  function rematch() {
    els.overlay.classList.remove('on');
    els.rematchMini.hidden = true;
    newDuel();
  }

  /* ───────────── interaction ───────────── */

  function onHandClick(uid) {
    if (!state || state.over || state.turn !== 'player' || state.busy) return;
    const card = state.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    if (state.selectedHand === uid) {
      state.selectedHand = null;
      state.selectedUnit = null;
      tone(300, 0.04, 'sine', 0.02);
    } else {
      if (card.cost > state.player.ap) {
        toast(`NOT ENOUGH AP // NEED ${card.cost}`);
        tone(120, 0.08, 'square', 0.03);
        return;
      }
      state.selectedHand = uid;
      state.selectedUnit = null;
      tone(600, 0.045, 'triangle', 0.025);
    }
    render();
  }

  async function onZoneClick(sideName, row, index) {
    if (!state || state.over || state.turn !== 'player' || state.busy) return;
    const side = state[sideName];
    const card = side[row][index];
    const handCard = selectedHandCard();

    if (state.selectedUnit && sideName === 'enemy' && row === 'front') {
      if (card) await playerAttack(card, index);
      else if (canDirect()) await playerDirect();
      else toast('CLEAR THE ENEMY FRONT ROW TO ATTACK DIRECTLY');
      return;
    }

    if (handCard) {
      if (sideName !== 'player') { toast('PLACE CARDS ON YOUR SIDE'); return; }
      const need = handCard.type === 'monster' ? 'front' : 'back';
      if (row !== need) { toast(handCard.type === 'monster' ? 'UNITS GO IN THE FRONT ROW' : 'TECH GOES IN THE BACK ROW'); return; }
      if (card) { toast('ZONE OCCUPIED'); return; }
      if (state.player.ap < handCard.cost) { toast('NOT ENOUGH AP'); return; }
      await handlePlayerPlay(handCard, row, index);
      return;
    }

    if (sideName === 'player' && row === 'front' && card) {
      if (state.player.ap < 1) { toast('ATTACKS COST 1 AP'); return; }
      if (card.hasAttacked) { toast('THIS UNIT ALREADY ATTACKED'); return; }
      state.selectedUnit = card.uid;
      state.selectedHand = null;
      tone(620, 0.045, 'square', 0.025);
      render();
    }
  }

  function endTurn() {
    if (!state || state.over || state.turn !== 'player' || state.busy) return;
    state.selectedHand = null;
    state.selectedUnit = null;
    state.turn = 'enemy';
    render();
    feedLog('YOU END THE TURN', 'sys');
    tone(260, 0.08, 'square', 0.03);
    enemyTurn(state.id);
  }

  /* ───────────── boot ───────────── */

  function addBootLine(text, tag) {
    const line = document.createElement('div');
    line.className = `boot-line ${tag === 'GO' ? 'hot' : ''}`;
    line.innerHTML = `<b>${esc(tag.padEnd(4, ' '))}</b>${esc(text)}`;
    els.bootLog.appendChild(line);
    while (els.bootLog.children.length > 7) els.bootLog.removeChild(els.bootLog.firstChild);
    els.bootBar.style.width = `${els.bootPct.textContent.replace('%', '')}%`;
  }

  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    els.boot.classList.add('gone');
    els.app.classList.add('on');
    els.app.setAttribute('aria-hidden', 'false');
    setTimeout(() => els.boot.remove(), 700);
    initRoom();
  }

  function initRoom() {
    els.roomCode.textContent = roomCode;
    renderRooms();
    newDuel();
    setRoomState('IN DUEL');
    updatePings();
    toast(`ROOM ${roomCode} CREATED & JOINED`);
  }

  function startBoot() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    roomCode = '#24-' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    els.roomCode.textContent = roomCode;

    const lines = [
      ['NEXUS CORE // ONLINE', 'OK'],
      [`PRIVATE ROOM ${roomCode} CREATED`, 'OK'],
      ['AUTO-JOIN SEQUENCE COMPLETE', 'OK'],
      ['ROOM BROWSER // 8 NODES LIVE', 'OK'],
      [`KAI CONNECTED TO ${roomCode}`, 'LINK'],
      ['SYNCING 24-ZONE DUEL FIELD', 'OK'],
      ['DUEL START', 'GO']
    ];

    let i = 0;
    const step = () => {
      if (bootDone) return;
      if (i < lines.length) {
        addBootLine(lines[i][0], lines[i][1]);
        i += 1;
        const pct = Math.round((i / lines.length) * 100);
        els.bootBar.style.width = `${pct}%`;
        els.bootPct.textContent = `${pad(pct)}%`;
        setTimeout(step, bootSkipped ? 18 : 190);
      } else {
        setTimeout(finishBoot, bootSkipped ? 50 : 340);
      }
    };
    step();
  }

  /* ───────────── wiring ───────────── */

  function wire() {
    els.hand.addEventListener('click', (e) => {
      const card = e.target.closest('.hand-card');
      if (card) onHandClick(Number(card.dataset.uid));
    });

    els.arena.addEventListener('click', (e) => {
      const zone = e.target.closest('.zone');
      if (zone) {
        onZoneClick(zone.dataset.side, zone.dataset.row, Number(zone.dataset.index));
        return;
      }
      if (e.target.closest('#enemyDuelist') && canDirect()) playerDirect();
    });

    els.enemyDuelist.addEventListener('click', (e) => {
      if (canDirect() && !e.target.closest('.lp-float')) playerDirect();
    });

    els.endTurnBtn.addEventListener('click', endTurn);
    els.endTurnBtn2.addEventListener('click', endTurn);
    els.rematchBtn.addEventListener('click', rematch);
    els.rematchMini.addEventListener('click', rematch);
    els.closeResult.addEventListener('click', () => {
      els.overlay.classList.remove('on');
      if (state && state.over) els.rematchMini.hidden = false;
    });

    els.rulesBtn.addEventListener('click', () => els.rulesModal.classList.add('on'));
    els.closeRules.addEventListener('click', () => els.rulesModal.classList.remove('on'));
    els.rulesModal.addEventListener('click', (e) => {
      if (e.target === els.rulesModal) els.rulesModal.classList.remove('on');
    });

    els.soundBtn.addEventListener('click', () => {
      ensureAudio();
      soundOn = !soundOn;
      els.soundBtn.classList.toggle('off', !soundOn);
      els.soundBtn.textContent = soundOn ? '♪' : '×';
      els.soundBtn.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Enable sound');
      if (soundOn) tone(720, 0.07, 'sine', 0.03);
      toast(soundOn ? 'SOUND ON' : 'SOUND OFF');
    });

    els.refreshRooms.addEventListener('click', syncRooms);

    els.roomsBtn.addEventListener('click', () => {
      const open = els.roomsPanel.classList.toggle('open');
      els.feedPanel.classList.remove('open');
      els.scrim.classList.toggle('on', open);
    });
    els.logBtn.addEventListener('click', () => {
      const open = els.feedPanel.classList.toggle('open');
      els.roomsPanel.classList.remove('open');
      els.scrim.classList.toggle('on', open);
    });
    els.scrim.addEventListener('click', () => {
      els.roomsPanel.classList.remove('open');
      els.feedPanel.classList.remove('open');
      els.scrim.classList.remove('on');
    });

    document.addEventListener('pointerdown', ensureAudio, { once: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        els.rulesModal.classList.remove('on');
        els.overlay.classList.remove('on');
        if (state) {
          state.selectedHand = null;
          state.selectedUnit = null;
          render();
        }
        els.roomsPanel.classList.remove('open');
        els.feedPanel.classList.remove('open');
        els.scrim.classList.remove('on');
      }
      if (!state || state.over || state.turn !== 'player' || state.busy) return;
      if (/^[1-8]$/.test(e.key)) {
        const card = state.player.hand[Number(e.key) - 1];
        if (card) onHandClick(card.uid);
      }
      if (e.key.toLowerCase() === 'e') endTurn();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 980) {
        els.roomsPanel.classList.remove('open');
        els.feedPanel.classList.remove('open');
        els.scrim.classList.remove('on');
      }
    });

    els.boot.addEventListener('click', () => { bootSkipped = true; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ensureAudio();
    });
  }

  /* ───────────── go ───────────── */

  function init() {
    resizeCanvas();
    requestAnimationFrame(draw);
    wire();
    startBoot();
    setInterval(updatePings, 2600);
  }

  init();
})();
