const TAU = Math.PI * 2;

export class ReelOrbEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.cx = 0;
    this.cy = 0;
    this.radius = 220;

    this.yaw = -0.42;
    this.pitch = 0.18;

    this.distance = 1;
    this.targetDistance = 1;

    this.spinX = 0;
    this.spinY = 0;

    this.mode = "locked";
    this.energy = 0.72;
    this.time = 0;
    this.running = false;

    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);

    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
  }

  setMode(mode) {
    this.mode = mode === "alert" ? "alert" : "locked";
  }

  setEnergy(value) {
    this.energy = Math.max(0, Math.min(1, value));
  }

  // Called only by hand tracking.
  rotateBy(dYaw, dPitch) {
    this.spinX += dYaw;
    this.spinY += dPitch;
  }

  // Called only by hand tracking.
  zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.targetDistance = Math.max(
      0.68,
      Math.min(2.0, this.targetDistance * factor)
    );
  }

  resetView() {
    this.yaw = -0.42;
    this.pitch = 0.18;
    this.distance = 1;
    this.targetDistance = 1;
    this.spinX = 0;
    this.spinY = 0;
  }

  zoomIn() {
    this.zoomBy(0.82);
  }

  zoomOut() {
    this.zoomBy(1.22);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.w = Math.max(1, Math.floor(rect.width * this.dpr));
    this.h = Math.max(1, Math.floor(rect.height * this.dpr));

    this.canvas.width = this.w;
    this.canvas.height = this.h;

    this.cx = this.w * 0.5;
    this.cy = this.h * 0.49;
    this.radius = Math.min(this.w, this.h) * 0.235;
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  dispose() {
    this.running = false;
    window.removeEventListener("resize", this.resize);
  }

  project(x, y, z) {
    const yaw = this.yaw;
    const pitch = this.pitch;

    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
    const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);

    const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);

    const depth =
      1 / (1.55 - z2 * 0.42 + this.distance * 0.48);

    return {
      x: this.cx + x1 * this.radius * depth,
      y: this.cy + y1 * this.radius * depth,
      z: z2,
      depth
    };
  }

  colors() {
    if (this.mode === "alert") {
      return {
        hi: "#ffe9c4",
        bright: "#ff8a20",
        mid: "#ff4d00",
        dim: "#a62d00",
        faint: "#3a1605"
      };
    }

    return {
      hi: "#e8fdff",
      bright: "#48ecff",
      mid: "#0089c9",
      dim: "#00577f",
      faint: "#06314a"
    };
  }

  drawBackground(mode) {
    const ctx = this.ctx;
    const { w, h } = this;

    ctx.fillStyle = "#02050a";
    ctx.fillRect(0, 0, w, h);

    const g = ctx.createRadialGradient(
      this.cx,
      this.cy,
      0,
      this.cx,
      this.cy,
      Math.max(w, h) * 0.65
    );

    if (mode === "alert") {
      g.addColorStop(0, "rgba(100,25,0,0.30)");
      g.addColorStop(0.35, "rgba(30,10,0,0.13)");
    } else {
      g.addColorStop(0, "rgba(0,95,135,0.23)");
      g.addColorStop(0.35, "rgba(0,35,56,0.15)");
    }

    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = mode === "alert" ? "#ff7a16" : "#16b8e9";
    ctx.lineWidth = 1;

    const step = Math.max(42, this.radius * 0.32);

    for (let x = this.cx % step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = this.cy % step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawRings(cols) {
    const ctx = this.ctx;
    const r = this.radius;
    const t = this.time;

    const drawRing = (
      rr,
      rot,
      alpha,
      width,
      start = 0,
      len = TAU
    ) => {
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.rotate(rot);
      ctx.strokeStyle = cols.mid;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(0, 0, rr, start, start + len);
      ctx.stroke();
      ctx.restore();
    };

    for (let i = 0; i < 8; i++) {
      const rr = r * (1.18 + i * 0.115);
      const rot =
        t * (0.06 + i * 0.009) * (i % 2 ? -1 : 1) +
        i * 0.42;

      drawRing(
        rr,
        rot,
        i % 2 ? 0.15 : 0.26,
        i === 0 ? 2 : 1,
        -0.4 + Math.sin(t * 0.15 + i) * 0.35,
        Math.PI * (0.65 + (i % 3) * 0.22)
      );

      if (i % 2 === 0) {
        drawRing(
          rr + r * 0.012,
          -rot * 0.7,
          0.10,
          1,
          1.8,
          1.4
        );
      }
    }

    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = cols.bright;
    ctx.lineWidth = 2.3;
    ctx.globalAlpha = 0.72;

    ctx.beginPath();
    ctx.arc(0, 0, r * 1.34, t * 0.55, t * 0.55 + 2.9);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.32;

    ctx.beginPath();
    ctx.arc(0, 0, r * 1.50, -t * 0.23, -t * 0.23 + 1.25);
    ctx.stroke();

    ctx.restore();
  }

  drawSphere(cols) {
    const ctx = this.ctx;
    const bands = 19;
    const meridians = 28;

    for (let lat = 1; lat < bands; lat++) {
      const phi =
        -Math.PI / 2 + (lat / bands) * Math.PI;

      const rr = Math.cos(phi);
      const y = Math.sin(phi);

      ctx.beginPath();

      for (let j = 0; j <= 72; j++) {
        const th = (j / 72) * TAU;

        const p = this.project(
          rr * Math.cos(th),
          y,
          rr * Math.sin(th)
        );

        if (j === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.strokeStyle =
        lat % 3 === 0 ? cols.bright : cols.dim;

      ctx.lineWidth =
        lat % 3 === 0 ? 1.1 : 0.65;

      ctx.globalAlpha =
        lat % 3 === 0 ? 0.50 : 0.18;

      ctx.stroke();
    }

    for (let m = 0; m < meridians; m++) {
      const theta = (m / meridians) * TAU;

      ctx.beginPath();

      for (let j = 0; j <= 72; j++) {
        const phi =
          -Math.PI / 2 + (j / 72) * Math.PI;

        const rr = Math.cos(phi);

        const p = this.project(
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

      ctx.strokeStyle =
        m % 7 === 0 ? cols.bright : cols.faint;

      ctx.lineWidth =
        m % 7 === 0 ? 1.05 : 0.55;

      ctx.globalAlpha =
        m % 7 === 0 ? 0.43 : 0.14;

      ctx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = cols.bright;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 1.8;

    const p0 = this.project(-1.05, 0, 0);
    const p1 = this.project(1.05, 0, 0);

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    ctx.restore();
  }

  drawParticles(cols) {
    const ctx = this.ctx;
    const count = 145;
    const t = this.time;

    for (let i = 0; i < count; i++) {
      const a = (i * 12.9898) % TAU;
      const z = ((i * 7.13) % 200) / 100 - 1;
      const rr =
        1.3 +
        (((i * 17.17) % 100) / 100) *
          0.95;

      const spin =
        t * 0.018 * (i % 2 ? 1 : -1);

      const x =
        Math.cos(a + spin) *
        rr *
        Math.sqrt(Math.max(0.1, 1 - z * z));

      const y = z * rr;

      const zz =
        Math.sin(a + spin) *
        rr *
        Math.sqrt(Math.max(0.1, 1 - z * z));

      const p = this.project(x, y, zz);

      const size =
        Math.max(0.7, p.depth * 2.2);

      ctx.fillStyle =
        i % 11 === 0 ? cols.hi : cols.bright;

      ctx.globalAlpha =
        0.08 + Math.max(0, p.z) * 0.25;

      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, TAU);
      ctx.fill();
    }
  }

  drawCore(cols) {
    const ctx = this.ctx;

    const pulse =
      1 +
      Math.sin(this.time * 4.5) * 0.05 +
      this.energy * 0.025;

    const coreR =
      this.radius * 0.28 * pulse;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const g = ctx.createRadialGradient(
      this.cx,
      this.cy,
      coreR * 0.05,
      this.cx,
      this.cy,
      coreR * 1.6
    );

    if (this.mode === "alert") {
      g.addColorStop(0, "rgba(255,255,255,0.98)");
      g.addColorStop(0.18, "rgba(255,184,85,0.95)");
      g.addColorStop(0.42, "rgba(255,106,0,0.64)");
    } else {
      g.addColorStop(0, "rgba(255,255,255,0.98)");
      g.addColorStop(0.18, "rgba(196,251,255,0.96)");
      g.addColorStop(0.42, "rgba(45,215,255,0.56)");
    }

    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.arc(
      this.cx,
      this.cy,
      coreR * 1.6,
      0,
      TAU
    );
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const rr =
        coreR * (1.2 + i * 0.24) +
        Math.sin(this.time * 2.3 + i) * 3;

      ctx.strokeStyle =
        i === 0 ? cols.hi : cols.bright;

      ctx.globalAlpha = 0.28 - i * 0.045;
      ctx.lineWidth = i === 0 ? 2.1 : 1;

      ctx.beginPath();
      ctx.arc(
        this.cx,
        this.cy,
        rr,
        0,
        TAU
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  drawScan(cols) {
    const ctx = this.ctx;
    const sweep = (this.time * 0.85) % TAU;

    ctx.save();
    ctx.translate(this.cx, this.cy);

    const len = this.radius * 1.75;

    const g = ctx.createLinearGradient(
      0,
      0,
      len,
      0
    );

    if (this.mode === "alert") {
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.9, "rgba(255,170,80,0.34)");
    } else {
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.9, "rgba(120,250,255,0.28)");
    }

    g.addColorStop(1, "rgba(255,255,255,0)");

    ctx.rotate(sweep);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, 3);
    ctx.fill();

    ctx.restore();
  }

  frame(ms) {
    if (!this.running) return;

    this.time = ms * 0.001;

    const cols = this.colors();

    // Very smooth inertial motion.
    this.yaw += 0.0025 + this.spinX;
    this.pitch += this.spinY;

    this.spinX *= 0.90;
    this.spinY *= 0.90;

    this.pitch = Math.max(
      -0.8,
      Math.min(0.8, this.pitch)
    );

    this.distance +=
      (this.targetDistance - this.distance) *
      0.10;

    this.drawBackground(this.mode);
    this.drawRings(cols);
    this.drawParticles(cols);
    this.drawSphere(cols);
    this.drawScan(cols);
    this.drawCore(cols);

    requestAnimationFrame(this.frame);
  }
}
