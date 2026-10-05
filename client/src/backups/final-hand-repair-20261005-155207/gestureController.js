export class GestureController {
  constructor(video, onRotate, onZoom, onStatus, onVictory) {
    this.video = video;
    this.onRotate = onRotate;
    this.onZoom = onZoom;
    this.onStatus = onStatus;
    this.onVictory = onVictory;

    this.running = false;
    this.lastHand = null;
    this.lastGap = null;
    this.lastMode = 'idle';
    this.victoryActive = false;
    this.lastVictoryAt = 0;
    this.raf = 0;
    this.landmarker = null;
    this.stream = null;
  }

  async start() {
    if (this.running) return;

    this.onStatus?.('loading', 0);

    const vision = await import('@mediapipe/tasks-vision');
    const { FilesetResolver, HandLandmarker } = vision;

    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    );

    const options = {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.58,
      minHandPresenceConfidence: 0.58,
      minTrackingConfidence: 0.58
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' }
      });
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false
    });

    this.video.srcObject = this.stream;
    this.video.style.transform = 'scaleX(-1)';
    await this.video.play();

    this.running = true;
    this.onStatus?.('on', 0);
    this.loop();
  }

  loop() {
    if (!this.running || !this.landmarker) return;

    const result = this.landmarker.detectForVideo(
      this.video,
      performance.now()
    );

    const hands = result.landmarks || [];
    this.onStatus?.('on', hands.length);

    if (hands.length !== this.lastCount) {
      this.lastHand = null;
      this.lastGap = null;
      this.lastMode = 'idle';
      this.lastCount = hands.length;
    }

    // -----------------------------
    // Victory sign: index + middle
    // fingers extended, ring+pinky folded.
    // -----------------------------
    let victoryDetected = false;
    for (const hand of hands) {
      if (this.isVictory(hand)) {
        victoryDetected = true;
        break;
      }
    }

    const now = performance.now();
    if (
      victoryDetected &&
      !this.victoryActive &&
      now - this.lastVictoryAt > 1200
    ) {
      this.lastVictoryAt = now;
      this.onVictory?.();
    }
    this.victoryActive = victoryDetected;

    // -----------------------------
    // One hand = hand-position rotation.
    // The hand behaves like a virtual
    // controller: move right -> orb right.
    // -----------------------------
    if (hands.length === 1) {
      const h = hands[0];
      const p = {
        x: 1 - (h[0].x + h[9].x) / 2,
        y: (h[0].y + h[9].y) / 2
      };

      if (this.lastHand) {
        const dx = p.x - this.lastHand.x;
        const dy = p.y - this.lastHand.y;

        const smoothDx = Math.abs(dx) < 0.0012 ? 0 : dx;
        const smoothDy = Math.abs(dy) < 0.0012 ? 0 : dy;

        this.onRotate?.(
          smoothDx * 8.0,
          smoothDy * 5.5
        );
      }

      this.lastHand = p;
      this.lastGap = null;
      this.emitMode('spin');
    }
    // -----------------------------
    // Two hands = distance zoom.
    // Hands apart -> zoom in.
    // Hands together -> zoom out.
    // -----------------------------
    else if (hands.length >= 2) {
      const a = hands[0];
      const b = hands[1];

      const pa = {
        x: 1 - (a[0].x + a[9].x) / 2,
        y: (a[0].y + a[9].y) / 2
      };

      const pb = {
        x: 1 - (b[0].x + b[9].x) / 2,
        y: (b[0].y + b[9].y) / 2
      };

      const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);

      if (this.lastGap !== null && Math.abs(gap - this.lastGap) > 0.001) {
        const delta = gap - this.lastGap;
        const factor = Math.min(
          1.08,
          Math.max(0.92, Math.exp(-delta * 2.8))
        );
        this.onZoom?.(factor);
      }

      this.lastGap = gap;
      this.lastHand = null;
      this.emitMode('zoom');
    } else {
      this.lastHand = null;
      this.lastGap = null;
      this.emitMode('idle');
    }

    this.raf = requestAnimationFrame(() => this.loop());
  }

  emitMode(mode) {
    if (mode === this.lastMode) return;
    this.lastMode = mode;
  }

  isVictory(h) {
    const wrist = h[0];
    const indexPip = h[6];
    const indexTip = h[8];
    const middlePip = h[10];
    const middleTip = h[12];
    const ringPip = h[14];
    const ringTip = h[16];
    const pinkyPip = h[18];
    const pinkyTip = h[20];

    const scale = Math.max(
      0.001,
      this.dist(wrist, h[9])
    );

    const indexUp =
      indexTip.y < indexPip.y - scale * 0.05 &&
      this.dist(indexTip, wrist) > this.dist(indexPip, wrist) * 1.08;

    const middleUp =
      middleTip.y < middlePip.y - scale * 0.05 &&
      this.dist(middleTip, wrist) > this.dist(middlePip, wrist) * 1.08;

    const ringFolded =
      this.dist(ringTip, wrist) < this.dist(ringPip, wrist) * 1.10;

    const pinkyFolded =
      this.dist(pinkyTip, wrist) < this.dist(pinkyPip, wrist) * 1.12;

    const fingersSeparated =
      Math.abs(indexTip.x - middleTip.x) > scale * 0.03;

    return (
      indexUp &&
      middleUp &&
      ringFolded &&
      pinkyFolded &&
      fingersSeparated
    );
  }

  dist(a, b) {
    return Math.hypot(
      a.x - b.x,
      a.y - b.y,
      (a.z || 0) - (b.z || 0)
    );
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    this.video.srcObject = null;
    this.landmarker?.close?.();
    this.landmarker = null;

    this.lastHand = null;
    this.lastGap = null;
    this.lastMode = 'idle';
    this.victoryActive = false;
    this.onStatus?.('off', 0);
  }
}
