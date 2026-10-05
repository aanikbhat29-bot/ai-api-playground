const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class ReelOrbEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.rot = 0;
    this.tilt = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.mode = 'blue';
    this.running = false;
    this.t = 0;
    this.last = 0;

    this.particles = Array.from({ length: 220 }, (_, i) => ({
      a: (i * 2.399963) % TAU,
      r: 1 + ((i * 29) % 100) / 100,
      d: ((i * 47) % 100) / 100,
      s: 0.08 + ((i * 13) % 100) / 100 * 0.3,
      z: 0.6 + ((i * 7) % 100) / 100 * 1.5,
      p: ((i * 31) % 100) / 100 * TAU
    }));

    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(r.width * this.dpr));
    this.h = Math.max(1, Math.round(r.height * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this.resize);
  }

  setMode(mode) {
    this.mode = mode === 'orange' ? 'orange' : 'blue';
  }

  rotateBy(yaw, pitch) {
    this.rot += yaw;
    this.tilt = clamp(this.tilt + pitch, -0.75, 0.75);
  }

  setHandPosition(nx, ny) {
    this.targetX = clamp(nx, -1, 1) * this.w * 0.085;
    this.targetY = clamp(ny, -1, 1) * this.h * 0.055;
  }

  zoomBy(factor) {
    if (!Number.isFinite(factor)) return;
    this.targetZoom = clamp(this.targetZoom * factor, 0.72, 1.48);
  }

  resetView() {
    this.x = this.y = this.targetX = this.targetY = 0;
    this.rot = this.tilt = 0;
    this.zoom = this.targetZoom = 1;
  }

  colors() {
    return this.mode === 'orange'
      ? { hi: '#fff1d8', a: '#ff8d2c', b: '#ff4e08', g: 'rgba(255,80,0,.45)' }
      : { hi: '#ecffff', a: '#46e8ff', b: '#00a8ea', g: 'rgba(0,190,255,.45)' };
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.04, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.x += (this.targetX - this.x) * 0.065;
    this.y += (this.targetY - this.y) * 0.065;
    this.zoom += (this.targetZoom - this.zoom) * 0.08;

    const cx = this.w * 0.5 + this.x;
    const cy = this.h * 0.49 + this.y;
    const r = Math.min(this.w, this.h) * 0.225 * this.zoom;
    const c = this.colors();
    const ctx = this.ctx;

    ctx.fillStyle = '#010409';
    ctx.fillRect(0, 0, this.w, this.h);

    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.5);
    bg.addColorStop(0, c.g);
    bg.addColorStop(0.22, this.mode === 'orange' ? 'rgba(255,55,0,.06)' : 'rgba(0,140,220,.06)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawParticles(ctx, cx, cy, r, c);
    this.drawOuter(ctx, cx, cy, r, c);
    this.drawInner(ctx, cx, cy, r, c);
    this.drawCore(ctx, cx, cy, r, c);
    this.drawSweep(ctx, cx, cy, r, c);

    requestAnimationFrame(this.frame);
  }

  drawParticles(ctx, cx, cy, r, c) {
    for (const p of this.particles) {
      const a = p.a + this.t * p.s * (p.d > .5 ? 1 : -1);
      const rr = r * (1.55 + p.r * .85);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * (.52 + p.d * .24);
      ctx.globalAlpha = .035 + p.d * .18 + Math.sin(this.t * 2 + p.p) * .018;
      ctx.fillStyle = p.d > .82 ? c.hi : c.a;
      ctx.beginPath();
      ctx.arc(x, y, p.z * (.45 + p.d * .55), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawOuter(ctx, cx, cy, r, c) {
    const t = this.t;
    ctx.save();
    ctx.translate(cx, cy);

    const rings = [
      [1.15, t * .18, .28, 1.8],
      [1.28, -t * .13, .22, 1.1],
      [1.42, t * .07, .15, .8]
    ];

    for (const [s, rot, alpha, width] of rings) {
      ctx.save();
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c.b;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * s, r * s * .64, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < 9; i++) {
      const rr = r * (1.08 + i * .045);
      const start = t * (.20 + i * .007) + i * .76;
      ctx.globalAlpha = i % 3 === 0 ? .64 : .25;
      ctx.strokeStyle = i % 2 ? c.a : c.hi;
      ctx.lineWidth = i === 0 ? 2.7 : 1.0;
      ctx.beginPath();
      ctx.arc(0, 0, rr, start, start + .38 + (i % 3) * .18);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawInner(ctx, cx, cy, r, c) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = c.a;
    ctx.globalAlpha = .5;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * .93, r * .79, this.tilt * .07, 0, TAU);
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate(this.t * (.22 + i * .028) + i);
      ctx.globalAlpha = .12 + (i === 0 ? .22 : 0);
      ctx.strokeStyle = i % 2 ? c.b : c.a;
      ctx.lineWidth = i === 0 ? 1.5 : .75;
      ctx.beginPath();
      ctx.arc(0, 0, r * (.64 + i * .06), .2 + i * .3, 4.35 + i * .2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(this.t * (.33 + i * .04) + i * TAU / 3);
      ctx.globalAlpha = .36 - i * .05;
      ctx.strokeStyle = c.a;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (.55 + i * .06), r * (.25 + i * .06), 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawCore(ctx, cx, cy, r, c) {
    const pulse = 1 + Math.sin(this.t * 4.2) * .035;
    const cr = r * .42 * pulse;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.18);
    bloom.addColorStop(0, 'rgba(255,255,255,.98)');
    bloom.addColorStop(.14, this.mode === 'orange' ? 'rgba(255,224,185,.94)' : 'rgba(220,252,255,.96)');
    bloom.addColorStop(.37, c.g);
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.18, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * .30 + this.rot * .05);

    // Reactor / arc shape from the supplied reel.
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(i * TAU / 3 - Math.PI / 2);
      ctx.strokeStyle = c.hi;
      ctx.globalAlpha = .9;
      ctx.lineWidth = Math.max(2, r * .015);
      ctx.beginPath();
      ctx.arc(0, 0, cr * .95, .18, 1.58);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = c.b;
    ctx.globalAlpha = .75;
    ctx.lineWidth = Math.max(1.2, r * .010);
    ctx.beginPath();
    ctx.arc(0, 0, cr * .58, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = c.hi;
    ctx.globalAlpha = .85;
    ctx.lineWidth = Math.max(1.5, r * .012);
    ctx.beginPath();
    ctx.moveTo(-cr * .72, cr * .32);
    ctx.lineTo(cr * .72, -cr * .32);
    ctx.stroke();

    const center = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * .54);
    center.addColorStop(0, 'rgba(255,255,255,1)');
    center.addColorStop(.26, this.mode === 'orange' ? 'rgba(255,228,195,.98)' : 'rgba(232,253,255,.98)');
    center.addColorStop(1, this.mode === 'orange' ? 'rgba(255,70,0,0)' : 'rgba(0,190,255,0)');
    ctx.fillStyle = center;
    ctx.beginPath();
    ctx.arc(0, 0, cr * .55, 0, TAU);
    ctx.fill();

    ctx.restore();

    for (let i = 0; i < 5; i++) {
      const a = this.t * (.30 + i * .025) + i * TAU / 5;
      const rr = r * (.60 + i * .035);
      ctx.fillStyle = i % 2 ? c.a : c.hi;
      ctx.globalAlpha = .55;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .62, i === 0 ? 2.1 : 1.35, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawSweep(ctx, cx, cy, r, c) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((this.t * .78) % TAU);
    const g = ctx.createLinearGradient(0, 0, r * 1.9, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(.82, 'rgba(255,255,255,0)');
    g.addColorStop(1, this.mode === 'orange' ? 'rgba(255,150,70,.35)' : 'rgba(110,240,255,.32)');
    ctx.fillStyle = g;
    ctx.globalAlpha = .75;
    ctx.beginPath();
    ctx.moveTo(0, -1.5);
    ctx.lineTo(r * 1.9, 0);
    ctx.lineTo(0, 1.5);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
