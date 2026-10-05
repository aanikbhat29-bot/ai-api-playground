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

    // Normal/reference size from the supplied video.
    this.baseRadius = 108;
    this.radius = 108;

    // Multiplicative zoom, with a deliberately huge ceiling.
    this.zoom = 1;
    this.targetZoom = 1;

    // Gentle 3D drift / hand inertia.
    this.yaw = 0;
    this.pitch = 0;
    this.inertiaX = 0;
    this.inertiaY = 0;

    this.mode = "blue";
    this.activity = 0;
    this.time = 0;

    this.running = false;
    this.raf = 0;

    this.stars = [];
    this.dust = [];

    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    this.onKey = this.onKey.bind(this);

    this.buildField();

    window.addEventListener(
      "resize",
      this.resize,
      { passive: true }
    );

    // R restores the reference-video size/orientation.
    window.addEventListener(
      "keydown",
      this.onKey
    );

    this.resize();
  }

  onKey(event) {
    if (
      event.key?.toLowerCase() === "r" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      this.resetView();
    }
  }

  buildField() {
    // Sparse outer star field.
    this.stars = Array.from(
      { length: 220 },
      (_, i) => ({
        x: (Math.sin(i * 17.17) + 1) * 0.5,
        y: (Math.sin(i * 41.31) + 1) * 0.5,
        depth: 0.25 + ((i * 29.17) % 100) / 100,
        size: 0.45 + ((i * 7.13) % 100) / 100,
        phase: i * 0.61,
      })
    );

    // Dust cloud around the reactor.
    this.dust = Array.from(
      { length: 700 },
      (_, i) => {
        const u = (i + 0.5) / 700;
        const z = 1 - 2 * u;
        const ring = Math.sqrt(
          Math.max(0, 1 - z * z)
        );
        const a = i * 2.3999632297;
        const r =
          0.66 +
          ((i * 37.1) % 100) / 100 * 0.62;

        return {
          x: ring * Math.cos(a) * r,
          y: z * r,
          z: ring * Math.sin(a) * r,
          phase: i * 0.23,
          size: 0.25 + (i % 7) * 0.12,
          alpha: 0.12 + (i % 5) * 0.035,
        };
      }
    );
  }

  setMode(mode) {
    this.mode =
      mode === "orange" || mode === "alert"
        ? "orange"
        : "blue";
  }

  setEnergy(value) {
    this.activity =
      clamp(Number(value) || 0, 0, 1);
  }

  setActivity(value) {
    this.activity =
      clamp(Number(value) || 0, 0, 1);
  }

  rotateBy(dx = 0, dy = 0) {
    this.inertiaX += Number(dx) || 0;
    this.inertiaY += Number(dy) || 0;
  }

  // Effectively unlimited multiplicative zoom.
  zoomBy(factor = 1) {
    const f = Number(factor);

    if (!Number.isFinite(f) || f <= 0) {
      return;
    }

    this.targetZoom = clamp(
      this.targetZoom * f,
      0.06,
      3000
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
    const rect =
      this.canvas.getBoundingClientRect();

    this.dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    this.w = Math.max(
      1,
      Math.floor(rect.width * this.dpr)
    );

    this.h = Math.max(
      1,
      Math.floor(rect.height * this.dpr)
    );

    this.canvas.width = this.w;
    this.canvas.height = this.h;

    this.cx = this.w * 0.5;
    this.cy = this.h * 0.49;

    // Compact normal state.
    this.baseRadius =
      Math.min(this.w, this.h) * 0.105;
  }

  colors() {
    if (this.mode === "orange") {
      return {
        hot: [255, 249, 226],
        glow: [255, 179, 85],
        line: [255, 129, 34],
        dim: [188, 54, 5],
      };
    }

    return {
      hot: [244, 255, 255],
      glow: [100, 232, 255],
      line: [11, 178, 235],
      dim: [0, 79, 125],
    };
  }

  rgba(c, a) {
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  project(x, y, z, radius) {
    const cyaw = Math.cos(this.yaw);
    const syaw = Math.sin(this.yaw);

    let xx = x * cyaw - z * syaw;
    let zz = x * syaw + z * cyaw;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    let yy = y * cp - zz * sp;
    zz = y * sp + zz * cp;

    const camera = 2.85;
    const q =
      camera /
      Math.max(
        0.42,
        camera - zz * 0.68
      );

    return {
      x:
        this.cx +
        xx *
          radius *
          q,

      y:
        this.cy +
        yy *
          radius *
          q,

      z: zz,
      q,
    };
  }

  drawBackground(p) {
    const ctx = this.ctx;

    ctx.fillStyle = "#010407";
    ctx.fillRect(
      0,
      0,
      this.w,
      this.h
    );

    const halo =
      ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        Math.max(
          this.w,
          this.h
        ) * 0.36
      );

    halo.addColorStop(
      0,
      this.rgba(p.dim, 0.10)
    );

    halo.addColorStop(
      0.28,
      this.rgba(p.dim, 0.035)
    );

    halo.addColorStop(
      1,
      "rgba(0,0,0,0)"
    );

    ctx.fillStyle = halo;
    ctx.fillRect(
      0,
      0,
      this.w,
      this.h
    );

    for (const star of this.stars) {
      const twinkle =
        0.45 +
        0.55 *
          (
            Math.sin(
              this.time * 1.15 +
              star.phase
            ) +
            1
          ) *
          0.5;

      ctx.globalAlpha =
        (
          0.018 +
          star.depth * 0.055
        ) *
        twinkle;

      ctx.fillStyle =
        this.rgba(
          star.depth > 0.84
            ? p.hot
            : p.glow,
          1
        );

      const size =
        star.size *
        this.dpr *
        (0.45 + star.depth);

      ctx.beginPath();
      ctx.arc(
        star.x * this.w,
        star.y * this.h,
        size,
        0,
        TAU
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  drawDust(p, radius) {
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation =
      "lighter";

    for (const d of this.dust) {
      const pulse =
        1 +
        Math.sin(
          this.time * 1.6 +
          d.phase
        ) *
          (
            0.012 +
            this.activity * 0.03
          );

      const q =
        this.project(
          d.x * pulse,
          d.y * pulse,
          d.z * pulse,
          radius
        );

      if (q.q < 0.55) {
        continue;
      }

      const face =
        clamp(
          (q.z + 0.1) * 0.92,
          0,
          1
        );

      ctx.globalAlpha =
        d.alpha *
        (
          0.10 +
          0.90 * face
        );

      ctx.fillStyle =
        this.rgba(
          face > 0.70
            ? p.hot
            : p.glow,
          1
        );

      const size =
        Math.max(
          0.3,
          d.size *
            q.q *
            this.dpr
        );

      ctx.beginPath();
      ctx.arc(
        q.x,
        q.y,
        size,
        0,
        TAU
      );
      ctx.fill();
    }

    ctx.restore();
  }

  drawOrbit(p, radius, rx, ry, rotation, alpha, hot, dotted) {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(
      this.cx,
      this.cy
    );

    ctx.rotate(
      rotation
    );

    ctx.globalCompositeOperation =
      "lighter";

    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      radius * rx,
      radius * ry,
      0,
      0,
      TAU
    );

    ctx.strokeStyle =
      this.rgba(
        hot ? p.hot : p.line,
        alpha
      );

    ctx.lineWidth =
      1.0 *
      this.dpr;

    ctx.stroke();

    if (dotted) {
      ctx.setLineDash([
        1.4 * this.dpr,
        6.5 * this.dpr
      ]);

      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius *
          (rx + 0.035),
        radius *
          (ry + 0.014),
        0,
        0,
        TAU
      );

      ctx.strokeStyle =
        this.rgba(
          hot ? p.hot : p.glow,
          alpha * 0.40
        );

      ctx.lineWidth =
        0.55 *
        this.dpr;

      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  drawFragments(p, radius) {
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation =
      "lighter";

    for (let i = 0; i < 18; i++) {
      const a =
        (
          i / 18
        ) *
        TAU +
        this.time *
          (
            i % 2
              ? -0.13
              : 0.11
          );

      const d =
        radius *
        (
          0.94 +
          ((i * 11) % 16) / 100
        );

      const len =
        radius *
        (
          0.018 +
          ((i * 7) % 10) / 100
        );

      const x1 =
        this.cx +
        Math.cos(a) *
          d;

      const y1 =
        this.cy +
        Math.sin(a) *
          d *
          0.72;

      const x2 =
        this.cx +
        Math.cos(a + 0.04) *
          (d + len);

      const y2 =
        this.cy +
        Math.sin(a + 0.04) *
          (d + len) *
          0.72;

      ctx.strokeStyle =
        this.rgba(
          i % 6 === 0
            ? p.hot
            : p.glow,
          i % 6 === 0
            ? 0.19
            : 0.045
        );

      ctx.lineWidth =
        (
          i % 6 === 0
            ? 0.9
            : 0.42
        ) *
        this.dpr;

      ctx.beginPath();
      ctx.moveTo(
        x1,
        y1
      );
      ctx.lineTo(
        x2,
        y2
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  drawCore(p, radius) {
    const ctx = this.ctx;

    const pulse =
      1 +
      Math.sin(
        this.time * 4.5
      ) *
        0.023 +
      this.activity *
        0.06;

    const coreR =
      radius *
      0.185 *
      pulse;

    ctx.save();
    ctx.globalCompositeOperation =
      "lighter";

    const bloom =
      ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        radius * 1.45
      );

    bloom.addColorStop(
      0,
      "rgba(255,255,255,0.98)"
    );

    bloom.addColorStop(
      0.10,
      this.rgba(
        p.hot,
        0.78
      )
    );

    bloom.addColorStop(
      0.28,
      this.rgba(
        p.glow,
        0.22
      )
    );

    bloom.addColorStop(
      0.66,
      this.rgba(
        p.line,
        0.045
      )
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
      radius * 1.45,
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
      0.35,
      this.rgba(
        p.hot,
        0.99
      )
    );

    core.addColorStop(
      0.70,
      this.rgba(
        p.glow,
        0.52
      )
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
      coreR * 1.8,
      0,
      TAU
    );
    ctx.fill();

    // Tight luminous ring.
    ctx.beginPath();
    ctx.arc(
      this.cx,
      this.cy,
      coreR * 1.28,
      0,
      TAU
    );

    ctx.strokeStyle =
      this.rgba(
        p.hot,
        0.72
      );

    ctx.lineWidth =
      1.25 *
      this.dpr;

    ctx.stroke();

    // Two fine crossing orbitals, visible in the reference.
    for (let i = 0; i < 2; i++) {
      ctx.save();

      ctx.translate(
        this.cx,
        this.cy
      );

      ctx.rotate(
        this.time *
          (
            i ? -0.30 : 0.24
          ) +
          (
            i ? 0.85 : -0.25
          )
      );

      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius *
          (
            0.29 +
            i * 0.055
          ),
        radius *
          (
            0.065 +
            i * 0.018
          ),
        0,
        0,
        TAU
      );

      ctx.strokeStyle =
        this.rgba(
          i === 0
            ? p.hot
            : p.glow,
          i === 0
            ? 0.27
            : 0.10
        );

      ctx.lineWidth =
        (
          i === 0
            ? 0.9
            : 0.55
        ) *
        this.dpr;

      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  frame(ms) {
    if (!this.running) {
      return;
    }

    this.time =
      ms * 0.001;

    const p =
      this.colors();

    // Slow autonomous movement from the reference.
    this.yaw +=
      0.0008 +
      this.inertiaX * 0.018;

    this.pitch +=
      this.inertiaY * 0.012;

    this.inertiaX *= 0.93;
    this.inertiaY *= 0.93;

    this.pitch =
      clamp(
        this.pitch,
        -0.34,
        0.34
      );

    this.zoom =
      lerp(
        this.zoom,
        this.targetZoom,
        0.12
      );

    this.radius =
      this.baseRadius *
      this.zoom;

    this.drawBackground(p);
    this.drawDust(
      p,
      this.radius
    );

    // Reference-like fine orbital geometry.
    this.drawOrbit(
      p,
      this.radius,
      1.02,
      0.25,
      -0.28 +
        this.time * 0.055,
      0.34,
      true,
      true
    );

    this.drawOrbit(
      p,
      this.radius,
      0.90,
      0.19,
      1.02 -
        this.time * 0.045,
      0.13,
      false,
      true
    );

    this.drawFragments(
      p,
      this.radius
    );

    this.drawCore(
      p,
      this.radius
    );

    this.raf =
      requestAnimationFrame(
        this.frame
      );
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;

    this.raf =
      requestAnimationFrame(
        this.frame
      );
  }

  dispose() {
    this.running = false;

    cancelAnimationFrame(
      this.raf
    );

    window.removeEventListener(
      "resize",
      this.resize
    );

    window.removeEventListener(
      "keydown",
      this.onKey
    );
  }
}
