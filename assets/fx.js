const PALETTE = ['#53e6ff', '#9a7bff', '#ff4f9d', '#ffcc66'];

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  const stars = [];
  const bursts = [];
  const streaks = [];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars.length = 0;
    const count = Math.round(Math.min(110, (width * height) / 15000));
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.5 + 0.35,
        speed: Math.random() * 0.16 + 0.02,
        drift: (Math.random() - 0.5) * 0.1,
        phase: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        alpha: Math.random() * 0.5 + 0.18,
      });
    }
    streaks.length = 0;
    for (let i = 0; i < 4; i += 1) {
      streaks.push({
        x: Math.random() * width,
        y: Math.random() * height,
        len: 40 + Math.random() * 120,
        speed: 0.2 + Math.random() * 0.5,
        alpha: 0.03 + Math.random() * 0.05,
      });
    }
  }

  function burst(x, y, color = '#53e6ff', count = 14, power = 1) {
    if (reduced) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 2.6 + 0.6) * power;
      bursts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        life: 1,
        decay: 0.018 + Math.random() * 0.02,
        size: Math.random() * 2.2 + 0.8,
        color: Math.random() < 0.35 ? '#ffffff' : color,
      });
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';

    for (const star of stars) {
      if (!reduced) {
        star.y -= star.speed * dt * 0.06;
        star.x += star.drift * dt * 0.02;
        if (star.y < -4) { star.y = height + 4; star.x = Math.random() * width; }
        if (star.x < -4) star.x = width + 4;
        if (star.x > width + 4) star.x = -4;
      }
      const twinkle = reduced ? 1 : 0.6 + Math.sin(now * 0.0012 + star.phase) * 0.4;
      ctx.globalAlpha = star.alpha * twinkle;
      ctx.fillStyle = star.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = star.color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const streak of streaks) {
      if (!reduced) {
        streak.x += streak.speed * dt * 0.03;
        if (streak.x - streak.len > width) streak.x = -streak.len;
      }
      const grad = ctx.createLinearGradient(streak.x - streak.len, streak.y, streak.x, streak.y);
      grad.addColorStop(0, 'rgba(83,230,255,0)');
      grad.addColorStop(0.7, `rgba(83,230,255,${streak.alpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(streak.x - streak.len, streak.y);
      ctx.lineTo(streak.x, streak.y);
      ctx.stroke();
    }

    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const p = bursts[i];
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vy += 0.012;
      p.vx *= 0.992;
      p.life -= p.decay;
      if (p.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  requestAnimationFrame(frame);

  return { burst, resize };
}
