(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  24 ZONE — combine four tiles to reach exactly 24.
   *  Exact rational arithmetic, generated solvable puzzles, timed zones.
   * ------------------------------------------------------------------ */

  const $ = (sel, root = document) => root.querySelector(sel);
  const pad2 = n => String(n).padStart(2, '0');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /* ---------------- rational arithmetic ---------------- */

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function rat(n, d = 1) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }

  const vAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
  const vSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
  const vMul = (a, b) => rat(a.n * b.n, a.d * b.d);
  const vDiv = (a, b) => (b.n === 0 ? null : rat(a.n * b.d, a.d * b.n));
  const vEq = (a, b) => a.n === b.n && a.d === b.d;
  const vIs24 = v => v.n === 24 * v.d;
  const fmt = v => (v.d === 1 ? String(v.n) : `${v.n}/${v.d}`);

  const OPS = [
    { sym: '+', fn: vAdd },
    { sym: '−', fn: vSub },
    { sym: '×', fn: vMul },
    { sym: '÷', fn: vDiv },
  ];
  const opBySym = sym => OPS.find(o => o.sym === sym);

  /* Find a sequence of pairwise merges that turns the values into 24. */
  function solve(vals, ops = OPS) {
    if (vals.length === 1) return vIs24(vals[0]) ? [] : null;
    for (let i = 0; i < vals.length; i++) {
      for (let j = 0; j < vals.length; j++) {
        if (i === j) continue;
        const a = vals[i];
        const b = vals[j];
        for (const op of ops) {
          if ((op.sym === '+' || op.sym === '×') && j < i) continue;
          const res = op.fn(a, b);
          if (!res) continue;
          const rest = [];
          for (let k = 0; k < vals.length; k++) {
            if (k !== i && k !== j) rest.push(vals[k]);
          }
          rest.push(res);
          const tail = solve(rest, ops);
          if (tail) return [{ a, b, op: op.sym, res }, ...tail];
        }
      }
    }
    return null;
  }

  /* ---------------- puzzle generation ---------------- */

  const EASY_OPS = OPS.filter(o => o.sym !== '÷');

  function makePuzzle(zone, tutorial) {
    if (tutorial) return [6, 4, 2, 1].map(n => rat(n));

    const max = zone <= 1 ? 6 : zone <= 2 ? 9 : zone <= 3 ? 11 : 13;
    const ops = zone <= 2 ? EASY_OPS : OPS;

    for (let tries = 0; tries < 600; tries++) {
      const vals = Array.from({ length: 4 }, () => rat(1 + Math.floor(Math.random() * max)));
      const distinct = new Set(vals.map(v => v.n)).size;
      if (distinct < 2) continue;
      if (solve(vals, ops)) return vals;
    }
    return [6, 4, 2, 1].map(n => rat(n));
  }

  /* ---------------- DOM ---------------- */

  const dom = {
    board: $('#board'),
    expression: $('#expression'),
    operators: $('#operators'),
    hudZone: $('#hudZone'),
    hudScore: $('#hudScore'),
    hudTime: $('#hudTime'),
    timebar: $('#timebar'),
    timeFill: $('#timeFill'),
    zoneLabel: $('#zoneLabel'),
    dots: $('#dots'),
    streak: $('#streakChip'),
    message: $('#message'),
    stage: $('#stage'),
    undoBtn: $('#undoBtn'),
    resetBtn: $('#resetBtn'),
    hintBtn: $('#hintBtn'),
    soundBtn: $('#soundBtn'),
    startOverlay: $('#startOverlay'),
    clearOverlay: $('#clearOverlay'),
    overOverlay: $('#overOverlay'),
    bestLine: $('#bestLine'),
    clearZone: $('#clearZone'),
    clearBonus: $('#clearBonus'),
    clearScore: $('#clearScore'),
    clearTime: $('#clearTime'),
    clearBest: $('#clearBest'),
    nextZoneLabel: $('#nextZone'),
    finalScore: $('#finalScore'),
    overBest: $('#overBest'),
    overReason: $('#overReason'),
    playBtn: $('#playBtn'),
    retryBtn: $('#retryBtn'),
    menuBtn: $('#menuBtn'),
    nextBtn: $('#nextBtn'),
    brandLink: $('#brandLink'),
  };

  const CODENAMES = ['CALIBRATE', 'SURGE', 'FRACTURE', 'VORTEX', 'PRISM', 'ECHO', 'NOVA', 'SINGULARITY', 'AFTERGLOW'];
  const STORE_KEY = 'zone24.v1';

  let nextTileId = 0;

  const S = {
    mode: 'menu',
    zone: 1,
    score: 0,
    streak: 0,
    solvedInZone: 0,
    goal: 3,
    tiles: [],
    original: [],
    history: [],
    selectedId: null,
    secondId: null,
    op: null,
    remaining: 90,
    limit: 90,
    last: performance.now(),
    tickSecond: -1,
    locked: false,
    hintIds: [],
    hintTimer: 0,
    shakeTimer: 0,
    firstPuzzle: true,
    best: { score: 0, zone: 0 },
    soundOn: true,
  };

  /* ---------------- persistence ---------------- */

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.bestScore === 'number') S.best.score = Math.max(0, data.bestScore);
      if (typeof data.bestZone === 'number') S.best.zone = Math.max(0, data.bestZone);
      if (typeof data.soundOn === 'boolean') S.soundOn = data.soundOn;
    } catch (_) { /* storage unavailable */ }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        bestScore: S.best.score,
        bestZone: S.best.zone,
        soundOn: S.soundOn,
      }));
    } catch (_) { /* storage unavailable */ }
  }

  /* ---------------- sound ---------------- */

  const sfx = {
    on: true,
    ctx: null,
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      } catch (_) { /* audio unavailable */ }
    },
    tone(freq, dur, type = 'sine', vol = 0.04, delay = 0, slide = null) {
      if (!this.on) return;
      this.init();
      const ctx = this.ctx;
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.03);
      } catch (_) { /* ignore audio errors */ }
    },
    click() { this.tone(660, 0.05, 'sine', 0.022); },
    select() { this.tone(520, 0.05, 'sine', 0.025); },
    merge() { this.tone(330, 0.12, 'triangle', 0.045, 0, 540); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.05, i * 0.07)); },
    fail() { this.tone(190, 0.24, 'sawtooth', 0.032, 0, 110); },
    hint() { this.tone(880, 0.08, 'sine', 0.028); this.tone(1320, 0.12, 'sine', 0.022, 0.08); },
    tick() { this.tone(1040, 0.04, 'square', 0.014); },
    fanfare() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.048, i * 0.09)); },
  };

  /* ---------------- particles ---------------- */

  const fxCanvas = $('#fx');
  const fxc = fxCanvas.getContext('2d');
  let particles = [];
  let fxRaf = 0;

  function resizeFx() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fxCanvas.width = Math.floor(window.innerWidth * dpr);
    fxCanvas.height = Math.floor(window.innerHeight * dpr);
    fxCanvas.style.width = window.innerWidth + 'px';
    fxCanvas.style.height = window.innerHeight + 'px';
    fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startFx() {
    if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
  }

  function fxLoop() {
    fxRaf = 0;
    fxc.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.987;
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      fxc.globalAlpha = clamp(p.life, 0, 1);
      fxc.fillStyle = p.color;
      fxc.beginPath();
      fxc.arc(p.x, p.y, p.size * p.life + 0.4, 0, Math.PI * 2);
      fxc.fill();
    }
    fxc.globalAlpha = 1;
    if (particles.length) startFx();
    else fxc.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function burst(x, y, colors, count = 26, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.6 + Math.random() * 5.4) * power;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.4 * power,
        size: 1.6 + Math.random() * 3.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.012 + Math.random() * 0.018,
      });
    }
    startFx();
  }

  function confetti() {
    const colors = ['#63f3ff', '#a06bff', '#ff5aa8', '#9dff6a', '#ffe08a'];
    for (let i = 0; i < 6; i++) {
      burst(
        window.innerWidth * (0.12 + Math.random() * 0.76),
        window.innerHeight * (0.16 + Math.random() * 0.3),
        colors,
        28,
        1.6
      );
    }
  }

  function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch (_) { /* unsupported */ }
  }

  /* ---------------- helpers ---------------- */

  const cloneTiles = tiles => tiles.map(t => ({ id: t.id, value: { n: t.value.n, d: t.value.d } }));
  const tileById = id => S.tiles.find(t => t.id === id) || null;

  function buildTiles(values) {
    return values.map(value => ({ id: ++nextTileId, value }));
  }

  function setMessage(text, tone = '') {
    dom.message.textContent = text;
    dom.message.className = 'message' + (tone ? ` ${tone}` : '');
  }

  function shake() {
    dom.stage.classList.remove('shake');
    void dom.stage.offsetWidth;
    dom.stage.classList.add('shake');
    clearTimeout(S.shakeTimer);
    S.shakeTimer = setTimeout(() => dom.stage.classList.remove('shake'), 460);
  }

  function boardCenter() {
    const r = dom.board.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function floatGain(text) {
    const el = document.createElement('div');
    el.className = 'float-gain';
    el.textContent = text;
    const r = dom.board.getBoundingClientRect();
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top - 6}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }

  function formatTime(rem) {
    const t = Math.max(0, Math.ceil(rem));
    return `${Math.floor(t / 60)}:${pad2(t % 60)}`;
  }

  /* ---------------- rendering ---------------- */

  function renderDots() {
    dom.dots.replaceChildren();
    for (let i = 0; i < S.goal; i++) {
      const dot = document.createElement('i');
      if (i < S.solvedInZone) dot.className = 'done';
      else if (i === S.solvedInZone && S.mode === 'playing') dot.className = 'current';
      dom.dots.appendChild(dot);
    }
    dom.dots.setAttribute('aria-label', `${Math.min(S.solvedInZone, S.goal)} of ${S.goal} puzzles cleared`);
  }

  function renderBoard() {
    dom.board.replaceChildren();
    S.tiles.forEach((tile, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile';
      btn.dataset.id = String(tile.id);
      btn.style.setProperty('--i', String(index));
      btn.setAttribute('aria-label', `Tile ${fmt(tile.value)}`);

      const label = document.createElement('span');
      label.textContent = fmt(tile.value);
      if (tile.value.d !== 1) label.className = 'frac';
      btn.appendChild(label);

      if (tile.id === S.selectedId) btn.classList.add('sel');
      if (tile.id === S.secondId) btn.classList.add('second');
      if (S.hintIds.includes(tile.id)) btn.classList.add('hint');
      if (tile.fresh) {
        btn.classList.add('pop');
        delete tile.fresh;
      }
      dom.board.appendChild(btn);
    });
  }

  function renderExpression() {
    const a = tileById(S.selectedId);
    const b = tileById(S.secondId);
    let html = 'Tap two tiles to combine';

    if (a) {
      if (b) {
        html = `<b>${fmt(a.value)}</b> <span class="eq">?</span> <b>${fmt(b.value)}</b> <span class="eq">·</span> choose an operator`;
        if (S.op) html = `<b>${fmt(a.value)}</b> ${S.op} <b>${fmt(b.value)}</b> <span class="eq">= ?</span>`;
      } else if (S.op) {
        html = `<b>${fmt(a.value)}</b> ${S.op} <b>?</b> <span class="eq">·</span> pick a tile`;
      } else {
        html = `<b>${fmt(a.value)}</b> <span class="eq">·</span> pick a second tile`;
      }
    }
    dom.expression.innerHTML = html;
  }

  function renderActions() {
    const playing = S.mode === 'playing';
    dom.undoBtn.disabled = !playing || S.locked || S.history.length === 0;
    dom.resetBtn.disabled = !playing || S.locked || S.history.length === 0;
    dom.hintBtn.disabled = !playing || S.locked || S.tiles.length < 2;
    dom.operators.querySelectorAll('.op').forEach(btn => {
      btn.disabled = !playing || S.locked;
      btn.classList.toggle('dim', !S.selectedId);
      btn.classList.toggle('chosen', btn.dataset.op === S.op && Boolean(S.selectedId));
    });
  }

  function updateTimeUI() {
    const seconds = Math.max(0, Math.ceil(S.remaining));
    dom.hudTime.textContent = formatTime(S.remaining);
    dom.timeFill.style.width = `${clamp(S.remaining / S.limit, 0, 1) * 100}%`;
    dom.timebar.classList.toggle('warn', seconds <= 25 && seconds > 10);
    dom.timebar.classList.toggle('danger', seconds <= 10);
    dom.hudTime.classList.toggle('danger', seconds <= 10);
  }

  function renderAll() {
    dom.hudZone.textContent = pad2(S.zone);
    dom.hudScore.textContent = S.score.toLocaleString('en-US');
    dom.zoneLabel.innerHTML = `ZONE ${pad2(S.zone)} <em>${CODENAMES[(S.zone - 1) % CODENAMES.length]}</em>`;
    dom.streak.hidden = S.streak < 2;
    dom.streak.textContent = `STREAK ×${S.streak}`;
    renderDots();
    renderBoard();
    renderExpression();
    renderActions();
    updateTimeUI();
  }

  function showBestLines() {
    const zone = Math.max(1, S.best.zone);
    dom.bestLine.textContent = `BEST ${S.best.score.toLocaleString('en-US')} PTS · ZONE ${pad2(zone)}`;
  }

  /* ---------------- game flow ---------------- */

  function loadPuzzle() {
    const tutorial = S.zone === 1 && S.solvedInZone === 0 && S.firstPuzzle;
    S.firstPuzzle = false;
    S.tiles = buildTiles(makePuzzle(S.zone, tutorial));
    S.original = cloneTiles(S.tiles);
    S.history = [];
    S.selectedId = null;
    S.secondId = null;
    S.op = null;
    S.hintIds = [];
    clearTimeout(S.hintTimer);
    S.locked = false;
    setMessage('Make exactly 24.', '');
    renderAll();
  }

  function startZone() {
    S.limit = Math.max(45, 90 - (S.zone - 1) * 6);
    S.remaining = S.limit;
    S.mode = 'playing';
    S.last = performance.now();
    S.tickSecond = -1;
    loadPuzzle();
    updateTimeUI();
  }

  function startGame() {
    sfx.init();
    sfx.click();
    S.zone = 1;
    S.score = 0;
    S.streak = 0;
    S.solvedInZone = 0;
    S.firstPuzzle = true;
    S.locked = false;
    dom.startOverlay.classList.add('hidden');
    dom.clearOverlay.classList.add('hidden');
    dom.overOverlay.classList.add('hidden');
    startZone();
    renderAll();
  }

  function nextZone() {
    if (S.mode !== 'clear') return;
    dom.clearOverlay.classList.add('hidden');
    sfx.click();
    S.zone += 1;
    S.solvedInZone = 0;
    startZone();
  }

  function zoneClear() {
    S.mode = 'clear';
    S.locked = false;
    const bonus = 200 * S.zone;
    S.score += bonus;
    S.best.score = Math.max(S.best.score, S.score);
    S.best.zone = Math.max(S.best.zone, S.zone);
    saveStore();
    showBestLines();

    dom.clearZone.textContent = pad2(S.zone);
    dom.nextZoneLabel.textContent = pad2(S.zone + 1);
    dom.clearBonus.textContent = String(bonus);
    dom.clearScore.textContent = S.score.toLocaleString('en-US');
    dom.clearTime.textContent = formatTime(S.remaining);
    dom.clearBest.textContent = S.best.score.toLocaleString('en-US');
    dom.clearOverlay.classList.remove('hidden');

    sfx.fanfare();
    vibrate([20, 50, 20, 50, 40]);
    confetti();
    renderAll();
  }

  function gameOver() {
    if (S.mode === 'over') return;
    S.mode = 'over';
    S.locked = false;
    S.streak = 0;
    S.best.score = Math.max(S.best.score, S.score);
    saveStore();
    showBestLines();

    dom.overReason.textContent = `Time ran out in Zone ${pad2(S.zone)}.`;
    dom.finalScore.textContent = S.score.toLocaleString('en-US');
    dom.overBest.textContent = `BEST ${S.best.score.toLocaleString('en-US')} PTS · ZONE ${pad2(Math.max(1, S.best.zone))}`;
    dom.overOverlay.classList.remove('hidden');

    sfx.fail();
    vibrate([40, 60, 90]);
    renderAll();
  }

  function retry() {
    if (S.mode !== 'over') return;
    dom.overOverlay.classList.add('hidden');
    startGame();
  }

  function backToMenu() {
    dom.overOverlay.classList.add('hidden');
    S.mode = 'menu';
    S.zone = 1;
    S.score = 0;
    S.streak = 0;
    S.solvedInZone = 0;
    S.firstPuzzle = true;
    S.locked = false;
    S.limit = 90;
    S.remaining = 90;
    S.tiles = buildTiles(makePuzzle(1, true));
    S.original = cloneTiles(S.tiles);
    S.history = [];
    S.selectedId = null;
    S.secondId = null;
    S.op = null;
    S.hintIds = [];
    clearTimeout(S.hintTimer);
    setMessage('Make exactly 24.', '');
    dom.startOverlay.classList.remove('hidden');
    showBestLines();
    renderAll();
  }

  /* ---------------- tile interactions ---------------- */

  function selectTile(id) {
    if (S.locked || S.mode !== 'playing') return;
    const tile = tileById(id);
    if (!tile) return;
    if (S.hintIds.length) {
      S.hintIds = [];
      clearTimeout(S.hintTimer);
    }

    if (S.selectedId === null) {
      S.selectedId = id;
      S.secondId = null;
      S.op = null;
      sfx.select();
    } else if (S.selectedId === id) {
      S.selectedId = null;
      S.secondId = null;
      S.op = null;
    } else if (S.op) {
      const first = tileById(S.selectedId);
      if (first) {
        applyMerge(first, tile, S.op);
        return;
      }
    } else if (S.secondId === id) {
      S.secondId = null;
    } else {
      S.secondId = id;
      sfx.select();
    }
    renderBoard();
    renderExpression();
    renderActions();
  }

  function chooseOp(sym) {
    if (S.locked || S.mode !== 'playing') return;
    if (!S.selectedId) {
      setMessage('Pick a number tile first.', 'warn');
      shake();
      sfx.fail();
      return;
    }
    const first = tileById(S.selectedId);
    const second = S.secondId !== null ? tileById(S.secondId) : null;
    if (first && second) {
      applyMerge(first, second, sym);
      return;
    }
    S.op = sym;
    sfx.click();
    renderExpression();
    renderActions();
  }

  function applyMerge(first, second, sym) {
    if (S.locked || S.mode !== 'playing') return;
    if (first.id === second.id) return;
    const op = opBySym(sym);
    if (!op) return;
    const result = op.fn(first.value, second.value);
    if (!result) {
      setMessage('Cannot divide by zero.', 'bad');
      shake();
      sfx.fail();
      return;
    }

    const indexA = S.tiles.findIndex(t => t.id === first.id);
    const indexB = S.tiles.findIndex(t => t.id === second.id);
    if (indexA < 0 || indexB < 0) return;

    S.history.push(cloneTiles(S.tiles));
    S.locked = true;
    S.selectedId = null;
    S.secondId = null;
    S.op = null;
    S.hintIds = [];
    clearTimeout(S.hintTimer);

    dom.board.querySelectorAll('.tile').forEach(el => {
      const id = Number(el.dataset.id);
      if (id === first.id || id === second.id) el.classList.add('merging');
    });

    sfx.merge();
    vibrate(10);
    const center = boardCenter();
    burst(center.x, center.y, ['#63f3ff', '#a06bff', '#9dff6a'], 14, 0.8);
    updateTimeUI();

    setTimeout(() => {
      const survivor = { id: first.id, value: result, fresh: true };
      S.tiles = S.tiles
        .map(t => (t.id === first.id ? survivor : t))
        .filter(t => t.id !== second.id);

      const single = S.tiles.length === 1;
      setMessage(
        single && vIs24(result) ? '24!' : result.n === 24 * result.d ? '24 — clear the rest.' : 'Combine again.',
        ''
      );
      renderAll();

      if (single) {
        setTimeout(finishBoard, 280);
      } else {
        S.locked = false;
        renderActions();
      }
    }, 110);
  }

  function finishBoard() {
    if (S.mode !== 'playing') return;
    const tile = S.tiles[0];
    if (!tile) return;
    if (vIs24(tile.value)) {
      success();
    } else {
      S.locked = false;
      setMessage(`That is ${fmt(tile.value)} — not 24. Undo or reset.`, 'bad');
      shake();
      sfx.fail();
      vibrate([30, 40, 30]);
      renderActions();
    }
  }

  function success() {
    if (S.mode !== 'playing') return;
    S.locked = true;
    S.streak += 1;
    S.solvedInZone += 1;

    const timeBonus = Math.min(60, Math.round(S.remaining / 10) * 10);
    const gain = 100 + 25 * S.streak + timeBonus;
    S.score += gain;
    S.remaining = Math.min(S.limit, S.remaining + 10);
    S.best.score = Math.max(S.best.score, S.score);
    saveStore();

    setMessage(`Solved! +${gain} points · +10s`, 'good');
    const center = boardCenter();
    burst(center.x, center.y, ['#9dff6a', '#63f3ff', '#ffe08a', '#a06bff'], 44, 1.4);
    floatGain(`+${gain}`);
    dom.stage.classList.add('solved');
    setTimeout(() => dom.stage.classList.remove('solved'), 760);
    sfx.win();
    vibrate([18, 40, 18, 40, 30]);
    renderAll();

    setTimeout(() => {
      if (S.mode !== 'playing') return;
      if (S.solvedInZone >= S.goal) zoneClear();
      else loadPuzzle();
    }, 950);
  }

  function undo() {
    if (S.locked || S.mode !== 'playing') return;
    if (!S.history.length) {
      setMessage('Nothing to undo.', 'warn');
      return;
    }
    S.tiles = S.history.pop();
    S.selectedId = null;
    S.secondId = null;
    S.op = null;
    S.hintIds = [];
    clearTimeout(S.hintTimer);
    setMessage('Move undone.', '');
    sfx.click();
    renderAll();
  }

  function resetBoard() {
    if (S.locked || S.mode !== 'playing') return;
    if (!S.history.length) {
      setMessage('The board is already fresh.', 'warn');
      return;
    }
    S.history.push(cloneTiles(S.tiles));
    S.tiles = cloneTiles(S.original);
    S.selectedId = null;
    S.secondId = null;
    S.op = null;
    S.hintIds = [];
    clearTimeout(S.hintTimer);
    S.streak = 0;
    S.remaining = Math.max(0, S.remaining - 3);
    setMessage('Board reset · −3s', 'warn');
    sfx.click();
    renderAll();
    if (S.remaining <= 0) gameOver();
  }

  function hint() {
    if (S.locked || S.mode !== 'playing') return;
    if (S.tiles.length < 2) {
      setMessage('One tile left — undo or reset.', 'warn');
      return;
    }
    const steps = solve(S.tiles.map(t => t.value), OPS);
    if (!steps || !steps.length) {
      setMessage('No path to 24 from here. Undo or reset.', 'warn');
      shake();
      sfx.fail();
      return;
    }
    const step = steps[0];
    const indexA = S.tiles.findIndex(t => vEq(t.value, step.a));
    const indexB = S.tiles.findIndex((t, i) => i !== indexA && vEq(t.value, step.b));
    if (indexA < 0 || indexB < 0) {
      setMessage('No clean hint available. Undo or reset.', 'warn');
      return;
    }

    S.hintIds = [S.tiles[indexA].id, S.tiles[indexB].id];
    clearTimeout(S.hintTimer);
    S.hintTimer = setTimeout(() => {
      S.hintIds = [];
      renderBoard();
    }, 2800);

    S.score = Math.max(0, S.score - 40);
    S.streak = 0;
    S.best.score = Math.max(S.best.score, S.score);
    saveStore();
    setMessage(`Hint: ${fmt(step.a)} ${step.op} ${fmt(step.b)} = ${fmt(step.res)}`, 'hint');
    sfx.hint();
    renderAll();
  }

  /* ---------------- timer ---------------- */

  function tick() {
    const now = performance.now();
    const dt = Math.min(1, (now - S.last) / 1000);
    S.last = now;
    if (S.mode !== 'playing' || document.hidden) return;

    S.remaining -= dt;
    if (S.remaining <= 0) {
      S.remaining = 0;
      updateTimeUI();
      gameOver();
      return;
    }
    updateTimeUI();

    const seconds = Math.ceil(S.remaining);
    if (seconds <= 10 && seconds !== S.tickSecond) {
      S.tickSecond = seconds;
      if (seconds > 0) sfx.tick();
    }
  }

  /* ---------------- sound toggle ---------------- */

  function updateSoundBtn() {
    dom.soundBtn.classList.toggle('muted', !S.soundOn);
    dom.soundBtn.setAttribute('aria-pressed', String(S.soundOn));
    dom.soundBtn.setAttribute('aria-label', S.soundOn ? 'Mute sound' : 'Unmute sound');
  }

  function toggleSound() {
    S.soundOn = !S.soundOn;
    sfx.on = S.soundOn;
    updateSoundBtn();
    saveStore();
    if (S.soundOn) sfx.click();
  }

  /* ---------------- events ---------------- */

  dom.board.addEventListener('click', event => {
    const el = event.target.closest('.tile');
    if (!el) return;
    selectTile(Number(el.dataset.id));
  });

  dom.operators.addEventListener('click', event => {
    const el = event.target.closest('.op');
    if (!el) return;
    chooseOp(el.dataset.op);
  });

  dom.undoBtn.addEventListener('click', undo);
  dom.resetBtn.addEventListener('click', resetBoard);
  dom.hintBtn.addEventListener('click', hint);
  dom.soundBtn.addEventListener('click', toggleSound);
  dom.playBtn.addEventListener('click', startGame);
  dom.retryBtn.addEventListener('click', retry);
  dom.nextBtn.addEventListener('click', nextZone);
  dom.menuBtn.addEventListener('click', backToMenu);
  dom.brandLink.addEventListener('click', event => event.preventDefault());

  document.addEventListener('visibilitychange', () => {
    S.last = performance.now();
  });

  window.addEventListener('resize', resizeFx);

  window.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;

    if (key === 'Enter' || key === ' ') {
      if (!dom.startOverlay.classList.contains('hidden')) { event.preventDefault(); startGame(); return; }
      if (!dom.clearOverlay.classList.contains('hidden')) { event.preventDefault(); nextZone(); return; }
      if (!dom.overOverlay.classList.contains('hidden')) { event.preventDefault(); retry(); return; }
    }
    if (S.mode !== 'playing') return;

    if (key >= '1' && key <= '4') {
      const tile = S.tiles[Number(key) - 1];
      if (tile) selectTile(tile.id);
    } else if (key === '+' || key === '=') {
      chooseOp('+');
    } else if (key === '-') {
      chooseOp('−');
    } else if (key === '*' || key.toLowerCase() === 'x') {
      chooseOp('×');
    } else if (key === '/') {
      chooseOp('÷');
    } else if (key.toLowerCase() === 'u') {
      undo();
    } else if (key.toLowerCase() === 'r') {
      resetBoard();
    } else if (key.toLowerCase() === 'h') {
      hint();
    } else if (key.toLowerCase() === 'm') {
      toggleSound();
    } else if (key === 'Escape') {
      S.selectedId = null;
      S.secondId = null;
      S.op = null;
      renderBoard();
      renderExpression();
      renderActions();
    }
  });

  /* ---------------- boot ---------------- */

  loadStore();
  sfx.on = S.soundOn;
  updateSoundBtn();
  resizeFx();
  S.limit = 90;
  S.remaining = 90;
  S.tiles = buildTiles(makePuzzle(1, true));
  S.original = cloneTiles(S.tiles);
  showBestLines();
  renderAll();
  setMessage('Make exactly 24.', '');
  setInterval(tick, 100);
})();
