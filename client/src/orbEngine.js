const TAU = Math.PI * 2;

const clamp = (v, a, b) =>
  Math.max(a, Math.min(b, v));

const lerp = (a, b, t) =>
  a + (b - a) * t;

function rnd(i, n = 1) {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class ReelOrbEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });

    this.w = 1;
    this.h = 1;
    this.dpr = 1;

    this.cx = 0;
    this.cy = 0;

    /*
      VIDEO MATCH:
      compact central reactor,
      large enough to read as a hologram,
      not a planet.
    */
    this.baseRadius = 170;

    this.zoom = 1;
    this.targetZoom = 1;

    this.rotation = 0;
    this.tilt = -0.08;

    this.spinX = 0;
    this.spinY = 0;

    this.running = false;
    this.raf = 0;
    this.time = 0;

    this.mode = "blue";

    this.particles = [];
    this.ringArcs = [];
    this.beams = [];
    this.dashes = [];
    this.stars = [];

    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    this.keydown = this.keydown.bind(this);

    this.build();

    window.addEventListener("resize", this.resize, {
      passive: true,
    });

    window.addEventListener("keydown", this.keydown);

    this.resize();
  }

  build() {
    /*
      Concentrated particle shell:
      much denser near the reactor than the
      previous planet-like cloud.
    */
    this.particles = Array.from(
      { length: 1150 },
      (_, i) => {
        const angle =
          rnd(i, 1.4) * TAU;

        const radial =
          0.72 +
          rnd(i, 2.7) * 0.62;

        const vertical =
          (rnd(i, 8.1) - 0.5) *
          0.82;

        return {
          angle,
          radial,
          vertical,

          depth:
            rnd(i, 5.4) * 2 - 1,

          phase:
            rnd(i, 3.8) * TAU,

          speed:
            0.18 +
            rnd(i, 7.2) * 0.62,

          size:
            0.35 +
            rnd(i, 9.1) * 1.45,

          alpha:
            0.16 +
            rnd(i, 6.2) * 0.62,
        };
      }
    );

    /*
      Segmented ring system.
    */
    this.ringArcs = Array.from(
      { length: 11 },
      (_, i) => ({
        radius:
          0.48 +
          i * 0.078,

        ellipse:
          0.35 +
          (i % 4) * 0.055,

        angle:
          rnd(i, 10.1) * TAU,

        offset:
          rnd(i, 11.7) * TAU,

        sweep:
          0.26 +
          rnd(i, 12.3) * 0.92,

        speed:
          (0.10 +
            rnd(i, 14.2) * 0.26) *
          (i % 2 ? -1 : 1),

        width:
          0.55 +
          rnd(i, 15.8) * 1.0,
      })
    );

    /*
      Radial energy beams.
    */
    this.beams = Array.from(
      { length: 18 },
      (_, i) => ({
        angle:
          rnd(i, 17.3) * TAU,

        inner:
          0.18 +
          rnd(i, 18.9) * 0.25,

        outer:
          0.88 +
          rnd(i, 20.4) * 0.44,

        width:
          0.35 +
          rnd(i, 22.1) * 1.0,

        speed:
          0.12 +
          rnd(i, 23.8) * 0.5,

        phase:
          rnd(i, 24.7) * TAU,
      })
    );

    /*
      Tiny technical fragments.
    */
    this.dashes = Array.from(
      { length: 160 },
      (_, i) => ({
        angle:
          rnd(i, 26.2) * TAU,

        radius:
          0.78 +
          rnd(i, 27.8) * 0.62,

        length:
          3 +
          rnd(i, 29.1) * 19,

        width:
          0.35 +
          rnd(i, 31.2) * 0.85,

        speed:
          0.08 +
          rnd(i, 33.1) * 0.5,

        phase:
          rnd(i, 34.8) * TAU,
      })
    );

    this.stars = Array.from(
      { length: 210 },
      (_, i) => ({
        x: rnd(i, 36.1),
        y: rnd(i, 37.4),

        size:
          0.25 +
          rnd(i, 38.7) * 1.0,

        alpha:
          0.05 +
          rnd(i, 39.9) * 0.30,

        phase:
          rnd(i, 41.5) * TAU,
      })
    );
  }

  setMode() {
    // This version stays cold blue, like the requested frame.
    this.mode = "blue";
  }

  setEnergy() {}
  setActivity() {}

  rotateBy(x = 0, y = 0) {
    if (Number.isFinite(x))
      this.spinX += x;

    if (Number.isFinite(y))
      this.spinY += y;
  }

  zoomBy(factor) {
    if (
      !Number.isFinite(factor) ||
      factor <= 0
    ) {
      return;
    }

    this.targetZoom = clamp(
      this.targetZoom * factor,
      0.35,
      14
    );
  }

  zoomIn() {
    this.zoomBy(0.82);
  }

  zoomOut() {
    this.zoomBy(1.22);
  }

  resetView() {
    this.zoom = 1;
    this.targetZoom = 1;

    this.rotation = 0;
    this.tilt = -0.08;

    this.spinX = 0;
    this.spinY = 0;
  }

  keydown(e) {
    if (
      e.key === "r" ||
      e.key === "R"
    ) {
      this.resetView();
    }
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
      Math.round(
        rect.width * this.dpr
      )
    );

    this.h = Math.max(
      1,
      Math.round(
        rect.height * this.dpr
      )
    );

    this.canvas.width = this.w;
    this.canvas.height = this.h;

    this.cx = this.w * 0.5;
    this.cy = this.h * 0.50;
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

    cancelAnimationFrame(
      this.raf
    );

    window.removeEventListener(
      "resize",
      this.resize
    );

    window.removeEventListener(
      "keydown",
      this.keydown
    );
  }

  glow(
    ctx,
    x,
    y,
    radius,
    alpha
  ) {
    const g =
      ctx.createRadialGradient(
        x,
        y,
        0,
        x,
        y,
        radius
      );

    g.addColorStop(
      0,
      `rgba(236,252,255,${alpha})`
    );

    g.addColorStop(
      0.16,
      `rgba(66,215,255,${alpha * 0.68})`
    );

    g.addColorStop(
      0.42,
      `rgba(0,162,255,${alpha * 0.22})`
    );

    g.addColorStop(
      1,
      "rgba(0,80,180,0)"
    );

    ctx.fillStyle = g;

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      radius,
      0,
      TAU
    );

    ctx.fill();
  }

  drawBackground(ctx) {
    ctx.fillStyle = "#01050a";

    ctx.fillRect(
      0,
      0,
      this.w,
      this.h
    );

    /*
      Large subtle atmospheric bloom,
      concentrated exactly around the reactor.
    */
    this.glow(
      ctx,
      this.cx,
      this.cy,
      Math.min(
        this.w,
        this.h
      ) * 0.34,
      0.11
    );

    for (
      const s of this.stars
    ) {
      const pulse =
        0.45 +
        0.55 *
          Math.sin(
            this.time *
              0.0011 +
              s.phase
          );

      ctx.beginPath();

      ctx.fillStyle =
        `rgba(92,211,255,${
          s.alpha * pulse
        })`;

      ctx.arc(
        s.x * this.w,
        s.y * this.h,
        s.size * this.dpr,
        0,
        TAU
      );

      ctx.fill();
    }
  }

  drawCinematicFrame(ctx) {
    ctx.save();

    ctx.strokeStyle =
      "rgba(64,204,255,0.10)";

    ctx.lineWidth =
      0.75 * this.dpr;

    const m =
      25 * this.dpr;

    const l =
      110 * this.dpr;

    const points = [
      [m, m, 1, 1],
      [
        this.w - m,
        m,
        -1,
        1,
      ],
      [
        m,
        this.h - m,
        1,
        -1,
      ],
      [
        this.w - m,
        this.h - m,
        -1,
        -1,
      ],
    ];

    for (
      const [x, y, sx, sy]
      of points
    ) {
      ctx.beginPath();

      ctx.moveTo(
        x,
        y
      );

      ctx.lineTo(
        x + l * sx,
        y
      );

      ctx.moveTo(
        x,
        y
      );

      ctx.lineTo(
        x,
        y + l * sy
      );

      ctx.stroke();
    }

    ctx.restore();
  }

  drawDiagnosticPanel(
    ctx,
    x,
    y,
    side
  ) {
    const width =
      108 * this.dpr;

    const height =
      86 * this.dpr;

    ctx.save();

    /*
      Very small transparent diagnostics,
      matching the video's monitor UI.
    */
    ctx.fillStyle =
      "rgba(2,14,24,0.24)";

    ctx.strokeStyle =
      "rgba(66,205,255,0.22)";

    ctx.lineWidth =
      0.7 * this.dpr;

    ctx.fillRect(
      x,
      y,
      width,
      height
    );

    ctx.strokeRect(
      x,
      y,
      width,
      height
    );

    ctx.font =
      `${6.5 * this.dpr}px monospace`;

    ctx.fillStyle =
      "rgba(106,221,255,0.55)";

    ctx.fillText(
      side === "left"
        ? "CORE"
        : "SYSTEM",
      x + 8 * this.dpr,
      y + 12 * this.dpr
    );

    for (
      let i = 0;
      i < 6;
      i++
    ) {
      const yy =
        y +
        (23 + i * 10) *
          this.dpr;

      const amount =
        0.25 +
        0.75 *
          (
            0.5 +
            0.5 *
              Math.sin(
                this.time *
                  0.0011 +
                  i * 1.4 +
                  x
              )
          );

      ctx.strokeStyle =
        `rgba(58,204,255,${
          0.12 +
          amount * 0.18
        })`;

      ctx.beginPath();

      ctx.moveTo(
        x + 8 * this.dpr,
        yy
      );

      ctx.lineTo(
        x +
          (22 +
            amount * 69) *
            this.dpr,
        yy
      );

      ctx.stroke();
    }

    ctx.restore();
  }

  drawCenterBeam(ctx, radius) {
    ctx.save();

    ctx.globalCompositeOperation =
      "lighter";

    const y =
      this.cy;

    const half =
      radius * 1.46;

    const beam =
      ctx.createLinearGradient(
        this.cx - half,
        y,
        this.cx + half,
        y
      );

    beam.addColorStop(
      0,
      "rgba(38,198,255,0)"
    );

    beam.addColorStop(
      0.35,
      "rgba(51,207,255,0.25)"
    );

    beam.addColorStop(
      0.50,
      "rgba(240,253,255,0.82)"
    );

    beam.addColorStop(
      0.65,
      "rgba(51,207,255,0.25)"
    );

    beam.addColorStop(
      1,
      "rgba(38,198,255,0)"
    );

    ctx.strokeStyle = beam;

    ctx.lineWidth =
      0.8 * this.dpr;

    ctx.beginPath();

    ctx.moveTo(
      this.cx - half,
      y
    );

    ctx.lineTo(
      this.cx + half,
      y
    );

    ctx.stroke();

    ctx.restore();
  }

  drawEnergyBeams(
    ctx,
    radius
  ) {
    ctx.save();

    ctx.globalCompositeOperation =
      "lighter";

    for (
      const b of this.beams
    ) {
      const a =
        b.angle +
        this.time *
          0.00018 *
          b.speed;

      const r1 =
        radius * b.inner;

      const r2 =
        radius * b.outer;

      const x1 =
        this.cx +
        Math.cos(a) *
          r1;

      const y1 =
        this.cy +
        Math.sin(a) *
          r1 *
          0.48;

      const x2 =
        this.cx +
        Math.cos(a) *
          r2;

      const y2 =
        this.cy +
        Math.sin(a) *
          r2 *
          0.48;

      ctx.strokeStyle =
        `rgba(59,208,255,${
          0.07 +
          0.08 *
            (
              0.5 +
              0.5 *
                Math.sin(
                  this.time *
                    0.0013 +
                    b.phase
                )
            )
        })`;

      ctx.lineWidth =
        b.width * this.dpr;

      ctx.shadowBlur =
        10 * this.dpr;

      ctx.shadowColor =
        "rgba(0,180,255,0.55)";

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

  drawRingSystem(
    ctx,
    radius
  ) {
    ctx.save();

    ctx.translate(
      this.cx,
      this.cy
    );

    /*
      The key visual:
      several tilted/elliptical segmented
      holographic rings around the core.
    */
    for (
      let i = 0;
      i < this.ringArcs.length;
      i++
    ) {
      const r =
        radius *
        this.ringArcs[i].radius;

      const ellipse =
        this.ringArcs[i].ellipse;

      const rot =
        this.ringArcs[i].angle +
        this.rotation *
          (0.20 +
            i * 0.035);

      const start =
        this.ringArcs[i].offset +
        this.time *
          0.00025 *
          this.ringArcs[i].speed;

      const pieces =
        7 +
        (i % 4);

      for (
        let p = 0;
        p < pieces;
        p++
      ) {
        const a =
          start +
          (p / pieces) *
            TAU;

        const length =
          this.ringArcs[i].sweep *
          (
            0.65 +
            0.35 *
              Math.sin(
                p * 1.7 +
                i
              )
          );

        ctx.beginPath();

        ctx.ellipse(
          0,
          0,
          r,
          r * ellipse,
          rot,
          a,
          a + length
        );

        const alpha =
          0.18 +
          (
            0.5 +
            0.5 *
              Math.sin(
                this.time *
                  0.001 +
                  p +
                  i
              )
          ) *
            0.18;

        ctx.strokeStyle =
          `rgba(69,215,255,${alpha})`;

        ctx.lineWidth =
          this.ringArcs[i].width *
          this.dpr;

        ctx.shadowBlur =
          12 * this.dpr;

        ctx.shadowColor =
          "rgba(38,195,255,0.65)";

        ctx.stroke();
      }
    }

    /*
      Main bright circular reactor ring.
    */
    ctx.beginPath();

    ctx.arc(
      0,
      0,
      radius * 0.62,
      0,
      TAU
    );

    ctx.strokeStyle =
      "rgba(114,230,255,0.84)";

    ctx.lineWidth =
      2.1 * this.dpr;

    ctx.shadowBlur =
      25 * this.dpr;

    ctx.shadowColor =
      "rgba(0,191,255,0.9)";

    ctx.stroke();

    /*
      Bright segmented inner ring.
    */
    for (
      let i = 0;
      i < 5;
      i++
    ) {
      const rr =
        radius *
        (
          0.44 +
          i * 0.04
        );

      const start =
        this.time *
          0.00065 *
          (i % 2
            ? -1
            : 1) +
        i * 1.15;

      ctx.beginPath();

      ctx.arc(
        0,
        0,
        rr,
        start,
        start + 1.18
      );

      ctx.strokeStyle =
        `rgba(103,224,255,${
          0.58 -
          i * 0.06
        })`;

      ctx.lineWidth =
        0.8 * this.dpr;

      ctx.stroke();
    }

    ctx.restore();
  }

  drawParticles(
    ctx,
    radius
  ) {
    const projected = [];

    const cy =
      Math.cos(
        this.rotation
      );

    const sy =
      Math.sin(
        this.rotation
      );

    const cp =
      Math.cos(
        this.tilt
      );

    const sp =
      Math.sin(
        this.tilt
      );

    for (
      const p of this.particles
    ) {
      const a =
        p.angle +
        this.time *
          0.00012 *
          p.speed;

      let x =
        Math.cos(a) *
        p.radial;

      let y =
        p.vertical;

      let z =
        Math.sin(a) *
        p.radial +
        p.depth * 0.14;

      const xx =
        x * cy -
        z * sy;

      const zz =
        x * sy +
        z * cy;

      const yy =
        y * cp -
        zz * sp;

      const z2 =
        y * sp +
        zz * cp;

      const perspective =
        1 /
        Math.max(
          0.35,
          1.12 -
            z2 * 0.27
        );

      projected.push({
        x:
          this.cx +
          xx *
            radius *
            perspective *
            this.zoom,

        y:
          this.cy +
          yy *
            radius *
            perspective *
            this.zoom,

        z: z2,

        size:
          p.size *
          this.dpr *
          (
            0.58 +
            perspective *
              0.34
          ),

        alpha:
          p.alpha *
          (
            0.60 +
            0.40 *
              Math.sin(
                this.time *
                  0.0012 *
                  p.speed +
                  p.phase
              )
          ) *
          clamp(
            0.35 +
              (z2 + 1) *
                0.34,
            0.10,
            1
          ),
      });
    }

    projected.sort(
      (a, b) =>
        a.z - b.z
    );

    ctx.save();

    ctx.globalCompositeOperation =
      "lighter";

    for (
      const p of projected
    ) {
      ctx.beginPath();

      ctx.fillStyle =
        `rgba(82,213,255,${p.alpha})`;

      ctx.shadowBlur =
        Math.max(
          5,
          p.size * 6
        );

      ctx.shadowColor =
        "rgba(31,190,255,0.72)";

      ctx.arc(
        p.x,
        p.y,
        Math.max(
          0.45 * this.dpr,
          p.size
        ),
        0,
        TAU
      );

      ctx.fill();
    }

    ctx.restore();
  }

  drawTechnicalDashes(
    ctx,
    radius
  ) {
    ctx.save();

    ctx.globalCompositeOperation =
      "lighter";

    for (
      const d of this.dashes
    ) {
      const a =
        d.angle +
        this.time *
          0.00017 *
          d.speed;

      const rr =
        radius *
        d.radius;

      const x =
        this.cx +
        Math.cos(a) *
          rr;

      const y =
        this.cy +
        Math.sin(a) *
          rr *
          0.48;

      const length =
        d.length *
        this.dpr;

      ctx.beginPath();

      ctx.moveTo(
        x - length * 0.5,
        y
      );

      ctx.lineTo(
        x + length * 0.5,
        y
      );

      ctx.strokeStyle =
        `rgba(75,214,255,${
          0.08 +
          0.20 *
            (
              0.5 +
              0.5 *
                Math.sin(
                  this.time *
                    0.0011 +
                    d.phase
                )
            )
        })`;

      ctx.lineWidth =
        d.width *
        this.dpr;

      ctx.stroke();
    }

    ctx.restore();
  }

  drawCore(ctx, radius) {
    const pulse =
      1 +
      0.05 *
        Math.sin(
          this.time *
            0.003
        );

    /*
      Large aura.
    */
    this.glow(
      ctx,
      this.cx,
      this.cy,
      radius * 0.54,
      0.42
    );

    const r =
      radius *
      0.105 *
      pulse;

    const core =
      ctx.createRadialGradient(
        this.cx -
          2 * this.dpr,
        this.cy -
          2 * this.dpr,
        0,
        this.cx,
        this.cy,
        r
      );

    core.addColorStop(
      0,
      "#ffffff"
    );

    core.addColorStop(
      0.28,
      "#e9fbff"
    );

    core.addColorStop(
      0.68,
      "#55dfff"
    );

    core.addColorStop(
      1,
      "#0798db"
    );

    ctx.save();

    ctx.globalCompositeOperation =
      "lighter";

    ctx.fillStyle =
      core;

    ctx.shadowBlur =
      36 * this.dpr;

    ctx.shadowColor =
      "rgba(0,194,255,0.98)";

    ctx.beginPath();

    ctx.arc(
      this.cx,
      this.cy,
      r,
      0,
      TAU
    );

    ctx.fill();

    ctx.restore();

    /*
      Small precision ring around core.
    */
    ctx.save();

    ctx.beginPath();

    ctx.arc(
      this.cx,
      this.cy,
      r * 1.75,
      this.time * 0.001,
      this.time * 0.001 + 4.7
    );

    ctx.strokeStyle =
      "rgba(170,241,255,0.74)";

    ctx.lineWidth =
      0.85 * this.dpr;

    ctx.shadowBlur =
      10 * this.dpr;

    ctx.shadowColor =
      "rgba(47,205,255,0.8)";

    ctx.stroke();

    ctx.restore();
  }

  drawCenterText(ctx) {
    ctx.save();

    ctx.textAlign =
      "center";

    ctx.fillStyle =
      "rgba(218,250,255,0.78)";

    ctx.font =
      `${8 * this.dpr}px monospace`;

    ctx.shadowBlur =
      8 * this.dpr;

    ctx.shadowColor =
      "rgba(0,183,255,0.7)";

    ctx.fillText(
      "SYSTEM LOCKED",
      this.cx,
      this.cy -
        7 * this.dpr
    );

    ctx.font =
      `${5.5 * this.dpr}px monospace`;

    ctx.fillStyle =
      "rgba(77,209,255,0.48)";

    ctx.fillText(
      "JARVIS CORE",
      this.cx,
      this.cy +
        8 * this.dpr
    );

    ctx.restore();
  }

  drawTelemetry(ctx) {
    ctx.save();

    ctx.font =
      `${6.5 * this.dpr}px monospace`;

    ctx.fillStyle =
      "rgba(74,211,255,0.42)";

    ctx.fillText(
      "J.A.R.V.I.S",
      30 * this.dpr,
      29 * this.dpr
    );

    ctx.textAlign =
      "right";

    ctx.fillText(
      "CORE ONLINE",
      this.w -
        30 * this.dpr,
      29 * this.dpr
    );

    ctx.textAlign =
      "left";

    ctx.fillText(
      "CAMERA LINK",
      30 * this.dpr,
      this.h -
        27 * this.dpr
    );

    ctx.textAlign =
      "right";

    ctx.fillText(
      `ZOOM ${this.zoom.toFixed(1)}X`,
      this.w -
        30 * this.dpr,
      this.h -
        27 * this.dpr
    );

    ctx.textAlign =
      "center";

    ctx.fillStyle =
      "rgba(78,211,255,0.56)";

    ctx.fillText(
      "LISTENING",
      this.cx,
      this.h -
        29 * this.dpr
    );

    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;

    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    );

    this.drawBackground(ctx);

    this.drawCinematicFrame(ctx);

    const panelY =
      this.cy -
      42 * this.dpr;

    this.drawDiagnosticPanel(
      ctx,
      34 * this.dpr,
      panelY,
      "left"
    );

    this.drawDiagnosticPanel(
      ctx,
      this.w -
        142 * this.dpr,
      panelY,
      "right"
    );

    const radius =
      this.baseRadius *
      this.dpr;

    this.drawEnergyBeams(
      ctx,
      radius
    );

    this.drawTechnicalDashes(
      ctx,
      radius
    );

    this.drawParticles(
      ctx,
      radius
    );

    this.drawRingSystem(
      ctx,
      radius
    );

    this.drawCenterBeam(
      ctx,
      radius
    );

    this.drawCore(
      ctx,
      radius
    );

    this.drawCenterText(ctx);

    this.drawTelemetry(ctx);
  }

  frame(now) {
    if (!this.running)
      return;

    this.time = now;

    this.rotation +=
      0.00018;

    this.rotation +=
      this.spinX;

    this.tilt +=
      this.spinY;

    this.spinX *= 0.90;
    this.spinY *= 0.90;

    this.tilt = clamp(
      this.tilt,
      -0.55,
      0.55
    );

    /*
      Smooth logarithmic zoom.
    */
    this.zoom = lerp(
      this.zoom,
      this.targetZoom,
      0.10
    );

    this.draw();

    this.raf =
      requestAnimationFrame(
        this.frame
      );
  }
}
