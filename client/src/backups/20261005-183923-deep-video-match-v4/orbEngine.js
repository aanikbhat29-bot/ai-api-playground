const TAU = Math.PI * 2;

const clamp = (v, min, max) =>
  Math.max(min, Math.min(max, v));

const lerp = (a, b, t) =>
  a + (b - a) * t;

export class ReelOrbEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });

    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.cx = 0;
    this.cy = 0;

    this.baseRadius = 115;
    this.radius = 115;

    // Logarithmic zoom. Repeated hand zoom can keep increasing it.
    this.zoom = 1;
    this.targetZoom = 1;

    this.yaw = 0;
    this.pitch = 0;
    this.inertiaX = 0;
    this.inertiaY = 0;

    this.mode = "blue";
    this.energy = 0.6;
    this.activity = 0;

    this.time = 0;
    this.running = false;
    this.raf = 0;

    this.stars = [];
    this.particles = [];
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);

    this.makeField();
    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
  }

  makeField() {
    this.stars = Array.from({ length: 230 }, (_, i) => ({
      x: (Math.sin(i * 12.9898) + 1) * 0.5,
      y: (Math.sin(i * 78.233) + 1) * 0.5,
      d: 0.25 + ((i * 29.731) % 100) / 100,
      s: 0.5 + ((i * 11.171) % 100) / 100,
      p: i * 0.73,
    }));

    // Points distributed on a sphere.
    this.particles = Array.from({ length: 520 }, (_, i) => {
      const u = (i + 0.5) / 520;
      const z = 1 - 2 * u;
      const ring = Math.sqrt(Math.max(0, 1 - z * z));
      const a = i * 2.3999632297;

      return {
        x: ring * Math.cos(a),
        y: z,
        z: ring * Math.sin(a),
        phase: i * 0.19,
        size: 0.45 + (i % 5) * 0.16,
      };
    });
  }

  setMode(mode) {
    this.mode =
      mode === "orange" || mode === "alert"
        ? "orange"
        : "blue";
  }

  setEnergy(value) {
    this.energy = clamp(Number(value) || 0, 0, 1);
  }

  setActivity(value) {
    this.activity = clamp(Number(value) || 0, 0, 1);
  }

  rotateBy(dx = 0, dy = 0) {
    this.inertiaX += Number(dx) || 0;
    this.inertiaY += Number(dy) || 0;
  }

  // Effectively unlimited zoom for hand control.
  zoomBy(factor = 1) {
    const f = Number(factor);
    if (!Number.isFinite(f) || f <= 0) return;

    this.targetZoom = clamp(
      this.targetZoom * f,
      0.05,
      10000
    );
  }

  zoomIn(amount = 1.22) {
    this.zoomBy(amount);
  }

  zoomOut(amount = 1.22) {
    this.zoomBy(1 / amount);
  }

  resetView() {
    this.zoom = 1;
    this.targetZoom = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.inertiaX = 0;
    this.inertiaY = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.w = Math.max(1, Math.floor(rect.width * this.dpr));
    this.h = Math.max(1, Math.floor(rect.height * this.dpr));

    this.canvas.width = this.w;
    this.canvas.height = this.h;

    this.cx = this.w * 0.5;
    this.cy = this.h * 0.48;

    this.baseRadius =
      Math.min(this.w, this.h) * 0.105;

    this.radius = this.baseRadius;
  }

  palette() {
    return this.mode === "orange"
      ? {
          hot: [255, 252, 236],
          light: [255, 187, 93],
          mid: [255, 95, 18],
          deep: [110, 26, 3],
        }
      : {
          hot: [242, 255, 255],
          light: [110, 237, 255],
          mid: [0, 171, 239],
          deep: [0, 59, 94],
        };
  }

  rgba(c, a) {
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  project(x, y, z, radius) {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    let xx = x * cy - z * sy;
    let zz = x * sy + z * cy;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    let yy = y * cp - zz * sp;
    zz = y * sp + zz * cp;

    const camera = 2.6;
    const perspective =
      camera / Math.max(0.28, camera - zz * 0.7);

    return {
      x: this.cx + xx * radius * perspective,
      y: this.cy + yy * radius * perspective,
      z: zz,
      q: perspective,
    };
  }

  drawBackground(p) {
    const ctx = this.ctx;
    ctx.fillStyle = "#010407";
    ctx.fillRect(0, 0, this.w, this.h);

    const glow = ctx.createRadialGradient(
      this.cx,
      this.cy,
      0,
      this.cx,
      this.cy,
      this.radius * 4
    );

    glow.addColorStop(
      0,
      this.rgba(p.mid, 0.13)
    );
    glow.addColorStop(
      0.35,
      this.rgba(p.deep, 0.06)
    );
    glow.addColorStop(
      1,
      "rgba(0,0,0,0)"
    );

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, this.h);

    for (const s of this.stars) {
      const a =
        0.06 +
        s.d *
          (0.035 +
            0.035 *
              ((Math.sin(this.time * 1.3 + s.p) + 1) * 0.5));

      ctx.globalAlpha = a;
      ctx.fillStyle = this.rgba(
        s.d > 0.82 ? p.hot : p.light,
        1
      );

      const size =
        s.s * this.dpr * (0.5 + s.d);

      ctx.beginPath();
      ctx.arc(
        s.x * this.w,
        s.y * this.h,
        size,
        0,
        TAU
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  drawSphere(p, radius) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Glowing spherical shell particles.
    for (const pt of this.particles) {
      const pulse =
        1 +
        Math.sin(
          this.time * 2.0 +
          pt.phase +
          pt.x * 4
        ) *
          (0.018 + this.activity * 0.035);

      const q = this.project(
        pt.x * pulse,
        pt.y * pulse,
        pt.z * pulse,
        radius
      );

      if (q.q < 0.62) continue;

      const face = clamp(
        (q.z + 0.12) * 0.9,
        0,
        1
      );

      ctx.globalAlpha =
        0.035 + face * 0.26;

      ctx.fillStyle = this.rgba(
        face > 0.72 ? p.hot : p.light,
        1
      );

      ctx.beginPath();
      ctx.arc(
        q.x,
        q.y,
        Math.max(
          0.45,
          pt.size * q.q * this.dpr
        ),
        0,
        TAU
      );
      ctx.fill();
    }

    // Latitude field lines.
    for (let i = 0; i < 13; i++) {
      const lat =
        -0.88 +
        (i / 12) * 1.76;

      const rr = Math.sqrt(
        Math.max(
          0,
          1 - lat * lat
        )
      );

      ctx.beginPath();

      for (let j = 0; j <= 96; j++) {
        const a =
          (j / 96) * TAU +
          this.time *
            (i % 2 ? -0.05 : 0.07);

        const w =
          1 +
          Math.sin(
            a * 3 +
            this.time * 1.2 +
            i
          ) *
            0.025;

        const q = this.project(
          rr * Math.cos(a) * w,
          lat * w,
          rr * Math.sin(a) * w,
          radius
        );

        if (j === 0) {
          ctx.moveTo(q.x, q.y);
        } else {
          ctx.lineTo(q.x, q.y);
        }
      }

      ctx.strokeStyle = this.rgba(
        i % 3 === 0 ? p.light : p.mid,
        i % 3 === 0 ? 0.17 : 0.065
      );
      ctx.lineWidth =
        (i % 3 === 0 ? 0.95 : 0.52) *
        this.dpr;

      ctx.stroke();
    }

    // Longitude field lines.
    for (let i = 0; i < 12; i++) {
      const a =
        (i / 12) * TAU +
        this.time * 0.06;

      ctx.beginPath();

      for (let j = 0; j <= 90; j++) {
        const phi =
          -Math.PI / 2 +
          (j / 90) * Math.PI;

        const rr = Math.cos(phi);

        const q = this.project(
          rr * Math.cos(a),
          Math.sin(phi),
          rr * Math.sin(a),
          radius
        );

        if (j === 0) {
          ctx.moveTo(q.x, q.y);
        } else {
          ctx.lineTo(q.x, q.y);
        }
      }

      ctx.strokeStyle = this.rgba(
        p.light,
        0.055
      );
      ctx.lineWidth =
        0.52 * this.dpr;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawOrbitRing(p, radius) {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(
      this.cx,
      this.cy
    );
    ctx.rotate(
      -0.17 +
      Math.sin(this.time * 0.18) * 0.025
    );
    ctx.globalCompositeOperation = "lighter";

    // A single thin major orbit like the reference, plus two soft accents.
    const rings = [
      {
        rx: radius * 1.03,
        ry: radius * 0.30,
        rot: this.time * 0.22,
        alpha: 0.42,
        width: 1.15,
      },
      {
        rx: radius * 1.16,
        ry: radius * 0.34,
        rot: -this.time * 0.13,
        alpha: 0.12,
        width: 0.65,
      },
      {
        rx: radius * 0.88,
        ry: radius * 0.26,
        rot: this.time * 0.16 + 0.8,
        alpha: 0.10,
        width: 0.55,
      },
    ];

    for (const r of rings) {
      ctx.save();
      ctx.rotate(r.rot);

      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        r.rx,
        r.ry,
        0,
        0,
        TAU
      );

      ctx.strokeStyle = this.rgba(
        p.light,
        r.alpha
      );
      ctx.lineWidth = r.width * this.dpr;
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }

  drawCore(p, radius) {
    const ctx = this.ctx;

    const pulse =
      1 +
      Math.sin(this.time * 4.5) * 0.025 +
      Math.sin(this.time * 8.7) * 0.012 +
      this.activity * 0.05;

    const coreR =
      radius * 0.19 * pulse;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const bloom =
      ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        radius * 1.55
      );

    bloom.addColorStop(
      0,
      "rgba(255,255,255,0.95)"
    );
    bloom.addColorStop(
      0.12,
      this.rgba(p.hot, 0.78)
    );
    bloom.addColorStop(
      0.30,
      this.rgba(p.light, 0.28)
    );
    bloom.addColorStop(
      0.72,
      this.rgba(p.mid, 0.06)
    );
    bloom.addColorStop(
      1,
      "rgba(0,0,0,0)"
    );

    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(
      this.cx,
      this.cy,
      radius * 1.55,
      0,
      TAU
    );
    ctx.fill();

    const core =
      ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        coreR
      );

    core.addColorStop(
      0,
      "rgba(255,255,255,1)"
    );
    core.addColorStop(
      0.36,
      this.rgba(p.hot, 0.98)
    );
    core.addColorStop(
      0.72,
      this.rgba(p.light, 0.55)
    );
    core.addColorStop(
      1,
      "rgba(0,0,0,0)"
    );

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(
      this.cx,
      this.cy,
      coreR * 1.9,
      0,
      TAU
    );
    ctx.fill();

    // Sharp inner ring.
    ctx.beginPath();
    ctx.arc(
      this.cx,
      this.cy,
      coreR * 1.34,
      0,
      TAU
    );

    ctx.strokeStyle = this.rgba(
      p.hot,
      0.72
    );
    ctx.lineWidth =
      1.35 * this.dpr;
    ctx.stroke();

    // Small energy rings crossing the nucleus.
    for (let i = 0; i < 4; i++) {
      ctx.save();

      ctx.translate(
        this.cx,
        this.cy
      );

      ctx.rotate(
        this.time *
          (0.4 + i * 0.07) +
          i
      );

      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius *
          (0.27 + i * 0.055),
        radius *
          (0.085 + i * 0.018),
        0,
        0,
        TAU
      );

      ctx.strokeStyle =
        this.rgba(
          i === 0 ? p.hot : p.light,
          i === 0 ? 0.30 : 0.09
        );

      ctx.lineWidth =
        (i === 0 ? 0.95 : 0.55) *
        this.dpr;

      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  drawSparks(p, radius) {
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < 24; i++) {
      const a =
        (i / 24) * TAU +
        this.time *
          (i % 2 ? -0.19 : 0.16);

      const d =
        radius *
        (0.82 + ((i * 13) % 21) / 100);

      const len =
        radius *
        (0.025 + ((i * 7) % 12) / 100);

      const x1 =
        this.cx +
        Math.cos(a) * d;

      const y1 =
        this.cy +
        Math.sin(a) * d * 0.96;

      const x2 =
        this.cx +
        Math.cos(a + 0.04) *
          (d + len);

      const y2 =
        this.cy +
        Math.sin(a + 0.04) *
          (d + len) *
          0.96;

      ctx.strokeStyle = this.rgba(
        i % 7 === 0 ? p.hot : p.light,
        i % 7 === 0 ? 0.24 : 0.055
      );

      ctx.lineWidth =
        (i % 7 === 0 ? 1.0 : 0.45) *
        this.dpr;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  frame(ms) {
    if (!this.running) return;

    this.time = ms * 0.001;

    const p = this.palette();

    this.yaw +=
      0.0010 +
      this.inertiaX * 0.02;

    this.pitch +=
      this.inertiaY * 0.015;

    this.inertiaX *= 0.91;
    this.inertiaY *= 0.91;

    this.pitch = clamp(
      this.pitch,
      -0.40,
      0.40
    );

    this.zoom = lerp(
      this.zoom,
      this.targetZoom,
      0.11
    );

    this.radius =
      this.baseRadius *
      this.zoom;

    this.drawBackground(p);

    // At normal zoom the orb is compact like the reference.
    // At high zoom the sphere simply grows rather than hitting a small ceiling.
    this.drawSphere(p, this.radius);
    this.drawOrbitRing(p, this.radius);
    this.drawSparks(p, this.radius);
    this.drawCore(p, this.radius);

    this.raf =
      requestAnimationFrame(
        this.frame
      );
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.raf =
      requestAnimationFrame(
        this.frame
      );
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener(
      "resize",
      this.resize
    );
  }
}

