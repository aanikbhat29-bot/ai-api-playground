const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

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

    this.radius = 180;
    this.distance = 1;
    this.targetDistance = 1;

    this.yaw = 0;
    this.pitch = 0.08;
    this.spinX = 0;
    this.spinY = 0;

    this.mode = "locked";
    this.energy = 0.6;
    this.activity = 0;

    this.time = 0;
    this.running = false;
    this.raf = 0;

    this.stars = [];
    this.shell = [];
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);

    this.makeStars();
    this.makeShell();

    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
  }

  setMode(mode) {
    this.mode = mode === "alert" || mode === "orange"
      ? "alert"
      : "locked";
  }

  setEnergy(value) {
    this.energy = clamp(Number(value) || 0, 0, 1);
  }

  setActivity(value) {
    this.activity = clamp(Number(value) || 0, 0, 1);
  }

  rotateBy(dYaw = 0, dPitch = 0) {
    this.spinX += dYaw;
    this.spinY += dPitch;
  }

  zoomBy(factor = 1) {
    const f = Number(factor);
    if (!Number.isFinite(f) || f <= 0) return;

    // Wide range for hand-controlled zoom while keeping rendering stable.
    this.targetDistance = clamp(
      this.targetDistance * f,
      0.38,
      3.8
    );
  }

  zoomIn() {
    this.zoomBy(0.78);
  }

  zoomOut() {
    this.zoomBy(1.28);
  }

  resetView() {
    this.yaw = 0;
    this.pitch = 0.08;
    this.distance = 1;
    this.targetDistance = 1;
    this.spinX = 0;
    this.spinY = 0;
  }

  makeStars() {
    const count = 230;
    this.stars = Array.from({ length: count }, (_, i) => ({
      seed: i * 17.371,
      x: Math.sin(i * 12.9898) * 0.5 + 0.5,
      y: Math.sin(i * 78.233) * 0.5 + 0.5,
      depth: 0.25 + ((i * 29.731) % 100) / 100 * 0.95,
      size: 0.45 + ((i * 11.171) % 100) / 100 * 1.25,
      twinkle: 0.45 + ((i * 5.717) % 100) / 100 * 0.55,
    }));
  }

  makeShell() {
    // Deterministic points wrapped around a sphere.
    const count = 360;
    this.shell = [];

    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const z = 1 - 2 * u;
      const ring = Math.sqrt(Math.max(0, 1 - z * z));
      const theta = i * 2.399963229728653;

      this.shell.push({
        x: ring * Math.cos(theta),
        y: z,
        z: ring * Math.sin(theta),
        phase: i * 0.37,
        size: 0.45 + (i % 7) * 0.12,
      });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.w = Math.max(1, Math.floor(rect.width * this.dpr));
    this.h = Math.max(1, Math.floor(rect.height * this.dpr));

    this.canvas.width = this.w;
    this.canvas.height = this.h;

    this.cx = this.w * 0.5;
    this.cy = this.h * 0.50;

    // Large cinematic orb, similar to the reference video.
    this.radius = Math.min(this.w, this.h) * 0.205;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  colors() {
    if (this.mode === "alert") {
      return {
        hot: "#fff3dc",
        bright: "#ff9b2f",
        mid: "#ff5d12",
        cool: "#d73a00",
        deep: "#471306",
      };
    }

    return {
      hot: "#f2ffff",
      bright: "#5cf2ff",
      mid: "#05a7df",
      cool: "#0074b6",
      deep: "#04293b",
    };
  }

  transformPoint(x, y, z) {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    let xx = x * cy - z * sy;
    let zz = x * sy + z * cy;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    let yy = y * cp - zz * sp;
    zz = y * sp + zz * cp;

    const depth = 1 / (
      1.55
      - zz * 0.45
      + this.distance * 0.52
    );

    return {
      x: this.cx + xx * this.radius * depth,
      y: this.cy + yy * this.radius * depth,
      z: zz,
      depth,
    };
  }

  glow(x, y, r, color, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const g = ctx.createRadialGradient(
      x, y, 0,
      x, y, r
    );

    g.addColorStop(0, color.replace(
      ")", `,${alpha})`
    ).replace("#", "#"));

    // Canvas doesn't accept hex+alpha. Use source color through a transparent
    // center made with a shadow-like composite instead.
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(
      0.28,
      this.mode === "alert"
        ? `rgba(255,120,20,${alpha * 0.75})`
        : `rgba(50,220,255,${alpha * 0.78})`
    );
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBackground(cols) {
    const ctx = this.ctx;
    const { w, h } = this;

    ctx.fillStyle = "#010409";
    ctx.fillRect(0, 0, w, h);

    const aura = ctx.createRadialGradient(
      this.cx,
      this.cy,
      this.radius * 0.1,
      this.cx,
      this.cy,
      Math.max(w, h) * 0.55
    );

    aura.addColorStop(
      0,
      this.mode === "alert"
        ? "rgba(120,38,4,0.22)"
        : "rgba(0,94,140,0.20)"
    );
    aura.addColorStop(
      0.38,
      this.mode === "alert"
        ? "rgba(52,10,0,0.11)"
        : "rgba(0,40,70,0.10)"
    );
    aura.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    // Tiny space field, like the monitor background in the reference.
    for (const star of this.stars) {
      const x = star.x * w;
      const y = star.y * h;
      const pulse =
        0.35 +
        0.65 *
          ((Math.sin(this.time * 1.1 * star.twinkle + star.seed) + 1) * 0.5);

      ctx.globalAlpha = 0.10 * pulse + star.depth * 0.10;
      ctx.fillStyle = star.depth > 0.82
        ? cols.hot
        : cols.bright;

      const size =
        star.size *
        this.dpr *
        (0.55 + star.depth * 0.65);

      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  drawOuterArcs(cols) {
    const ctx = this.ctx;
    const r = this.radius;
    const t = this.time;

    const arcs = [
      [1.15, 0.18, 2.25, 0.85, 1.5],
      [1.28, -0.34, 1.55, 0.56, 1.1],
      [1.42, 0.48, 2.4, 0.42, 1.6],
      [1.58, -0.15, 1.7, 0.24, 0.95],
      [1.72, 0.31, 2.0, 0.18, 1.45],
    ];

    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.globalCompositeOperation = "screen";

    arcs.forEach(([scale, baseRot, length, alpha, speed], i) => {
      ctx.save();
      const rot =
        baseRot +
        t * speed * (i % 2 ? -0.16 : 0.12);

      ctx.rotate(rot);

      ctx.strokeStyle =
        i === 0 || i === 2
          ? cols.bright
          : cols.mid;

      ctx.globalAlpha = alpha;
      ctx.lineWidth =
        (i === 0 ? 1.8 : 0.8) * this.dpr;

      const rr = r * scale;

      for (let side = -1; side <= 1; side += 2) {
        const start =
          Math.PI * 0.18 * side +
          Math.sin(t * 0.45 + i) * 0.06;

        ctx.beginPath();
        ctx.arc(
          0,
          0,
          rr,
          start,
          start + length
        );
        ctx.stroke();
      }

      ctx.restore();
    });

    ctx.restore();
  }

  drawShellMesh(cols) {
    const ctx = this.ctx;
    const t = this.time;

    // Fine luminous surface dots.
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const p0 of this.shell) {
      const wobble =
        1 +
        Math.sin(
          t * 1.7 +
          p0.phase +
          p0.x * 3.0
        ) *
          (0.025 + this.activity * 0.035);

      const p = this.transformPoint(
        p0.x * wobble,
        p0.y * wobble,
        p0.z * wobble
      );

      if (p.depth < 0.58) continue;

      const facing = clamp(
        (p.z + 0.15) * 0.92,
        0,
        1
      );

      ctx.fillStyle =
        facing > 0.72
          ? cols.hot
          : cols.bright;

      ctx.globalAlpha =
        0.06 +
        facing * 0.30;

      const size =
        p0.size *
        p.depth *
        (this.dpr * (0.65 + this.activity * 0.45));

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.45, size), 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Curved "field lines" to make the sphere read like an energy core,
    // not a flat wireframe globe.
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const latitudes = 11;
    for (let i = 0; i < latitudes; i++) {
      const v = i / (latitudes - 1);
      const phi = -Math.PI / 2 + v * Math.PI;
      const rr = Math.cos(phi);
      const yy = Math.sin(phi);

      ctx.beginPath();

      for (let j = 0; j <= 90; j++) {
        const theta =
          (j / 90) * TAU +
          t * (0.055 + i * 0.003);

        const wobble =
          1 +
          Math.sin(
            theta * 3 +
            t * 1.2 +
            i
          ) *
            0.035;

        const p = this.transformPoint(
          rr * Math.cos(theta) * wobble,
          yy * wobble,
          rr * Math.sin(theta) * wobble
        );

        if (j === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.strokeStyle =
        i % 3 === 0
          ? cols.bright
          : cols.mid;

      ctx.globalAlpha =
        i % 3 === 0
          ? 0.20
          : 0.07;

      ctx.lineWidth =
        (i % 3 === 0 ? 1.0 : 0.55) *
        this.dpr;

      ctx.stroke();
    }

    const meridians = 12;
    for (let i = 0; i < meridians; i++) {
      const theta =
        (i / meridians) * TAU;

      ctx.beginPath();

      for (let j = 0; j <= 90; j++) {
        const phi =
          -Math.PI / 2 +
          (j / 90) * Math.PI;

        const rr = Math.cos(phi);

        const p = this.transformPoint(
          rr * Math.cos(theta),
          Math.sin(phi),
          rr * Math.sin(theta)
        );

        if (j === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.strokeStyle = cols.bright;
      ctx.globalAlpha = 0.075;
      ctx.lineWidth = 0.65 * this.dpr;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawCore(cols) {
    const ctx = this.ctx;

    const pulse =
      1 +
      Math.sin(this.time * 4.0) * 0.025 +
      Math.sin(this.time * 8.0) * 0.012 +
      this.activity * 0.055;

    const coreR = this.radius * 0.245 * pulse;

    // Big diffuse energy field.
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const outer = ctx.createRadialGradient(
      this.cx,
      this.cy,
      0,
      this.cx,
      this.cy,
      coreR * 4.8
    );

    outer.addColorStop(0, "rgba(255,255,255,0.92)");
    outer.addColorStop(
      0.12,
      this.mode === "alert"
        ? "rgba(255,167,55,0.88)"
        : "rgba(170,250,255,0.90)"
    );
    outer.addColorStop(
      0.32,
      this.mode === "alert"
        ? "rgba(255,88,8,0.40)"
        : "rgba(15,205,255,0.38)"
    );
    outer.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(
      this.cx,
      this.cy,
      coreR * 4.8,
      0,
      TAU
    );
    ctx.fill();

    // Hot white center.
    const core = ctx.createRadialGradient(
      this.cx,
      this.cy,
      0,
      this.cx,
      this.cy,
      coreR
    );

    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(
      0.16,
      this.mode === "alert"
        ? "rgba(255,236,190,0.98)"
        : "rgba(240,255,255,0.99)"
    );
    core.addColorStop(
      0.46,
      this.mode === "alert"
        ? "rgba(255,125,25,0.74)"
        : "rgba(52,227,255,0.72)"
    );
    core.addColorStop(1, "rgba(0,0,0,0)");

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

    // Multiple fine energy shells.
    for (let i = 0; i < 6; i++) {
      const rr =
        coreR *
        (0.95 + i * 0.28) +
        Math.sin(this.time * (2.2 + i * 0.17) + i) *
          (1.3 + i * 0.35);

      ctx.beginPath();
      ctx.arc(
        this.cx,
        this.cy,
        rr,
        0,
        TAU
      );

      ctx.strokeStyle =
        i === 0
          ? cols.hot
          : cols.bright;

      ctx.globalAlpha =
        i === 0
          ? 0.80
          : 0.15 - i * 0.016;

      ctx.lineWidth =
        (i === 0 ? 1.9 : 0.75) *
        this.dpr;

      ctx.stroke();
    }

    ctx.restore();
  }

  drawEnergyStreaks(cols) {
    const ctx = this.ctx;
    const count = 24;
    const t = this.time;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < count; i++) {
      const a =
        (i / count) * TAU +
        t * (i % 2 ? -0.22 : 0.17);

      const inner =
        this.radius *
        (0.58 + ((i * 17) % 31) / 100);

      const outer =
        inner +
        this.radius *
          (0.15 + ((i * 9) % 17) / 100);

      const x1 =
        this.cx +
        Math.cos(a) * inner;

      const y1 =
        this.cy +
        Math.sin(a) * inner * 0.82;

      const x2 =
        this.cx +
        Math.cos(a + 0.06) * outer;

      const y2 =
        this.cy +
        Math.sin(a + 0.06) * outer * 0.82;

      ctx.strokeStyle =
        i % 5 === 0
          ? cols.hot
          : cols.bright;

      ctx.globalAlpha =
        0.035 +
        (i % 7 === 0 ? 0.16 : 0);

      ctx.lineWidth =
        (i % 7 === 0 ? 1.0 : 0.5) *
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

    const cols = this.colors();

    this.yaw +=
      0.0018 +
      this.spinX * 0.035;

    this.pitch +=
      this.spinY * 0.028;

    this.spinX *= 0.90;
    this.spinY *= 0.90;

    this.pitch = clamp(
      this.pitch,
      -0.55,
      0.55
    );

    this.distance = lerp(
      this.distance,
      this.targetDistance,
      0.075
    );

    this.drawBackground(cols);
    this.drawOuterArcs(cols);
    this.drawEnergyStreaks(cols);
    this.drawShellMesh(cols);
    this.drawCore(cols);

    this.raf = requestAnimationFrame(this.frame);
  }
}
