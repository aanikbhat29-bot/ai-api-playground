export class GestureController {
  constructor(video, onRotate, onZoom, onStatus, onVictory, onHandPosition) {
    this.video = video;
    this.onRotate = onRotate;
    this.onZoom = onZoom;
    this.onStatus = onStatus;
    this.onVictory = onVictory;
    this.onHandPosition = onHandPosition;
    this.running = false;
    this.landmarker = null;
    this.stream = null;
    this.raf = 0;
    this.lastVideoTime = -1;
    this.lastPoint = null;
    this.lastGap = null;
    this.lastCount = 0;
    this.victoryActive = false;
    this.lastVictoryAt = 0;
  }

  async start() {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
    const model = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
    const common = {
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: .58,
      minHandPresenceConfidence: .58,
      minTrackingConfidence: .58
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...common,
        baseOptions: { modelAssetPath: model, delegate: 'GPU' }
      });
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...common,
        baseOptions: { modelAssetPath: model, delegate: 'CPU' }
      });
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.onStatus?.('on', 0);
    this.loop();
  }

  loop() {
    if (!this.running || !this.landmarker) return;
    this.raf = requestAnimationFrame(() => this.loop());
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, performance.now());
    const hands = result.landmarks || [];
    this.onStatus?.('on', hands.length);

    if (hands.length !== this.lastCount) {
      this.lastPoint = null;
      this.lastGap = null;
      this.lastCount = hands.length;
    }

    // Victory sign: index + middle extended, ring + pinky folded.
    let victory = false;
    for (const h of hands) {
      if (this.isVictory(h)) { victory = true; break; }
    }

    const now = performance.now();
    if (victory && !this.victoryActive && now - this.lastVictoryAt > 1300) {
      this.lastVictoryAt = now;
      this.onVictory?.();
    }
    this.victoryActive = victory;

    if (hands.length === 1) {
      const h = hands[0];
      const p = {
        x: 1 - (h[0].x + h[9].x) / 2,
        y: (h[0].y + h[9].y) / 2
      };

      if (this.lastPoint) {
        const dx = p.x - this.lastPoint.x;
        const dy = p.y - this.lastPoint.y;
        if (Math.abs(dx) > .0008 || Math.abs(dy) > .0008) {
          this.onRotate?.(-dx * 3.0, dy * 2.0);
        }
      }

      this.onHandPosition?.(p.x * 2 - 1, p.y * 2 - 1);
      this.lastPoint = {
        x: this.lastPoint ? this.lastPoint.x + (p.x - this.lastPoint.x) * .28 : p.x,
        y: this.lastPoint ? this.lastPoint.y + (p.y - this.lastPoint.y) * .28 : p.y
      };
      this.lastGap = null;
    } else if (hands.length >= 2) {
      const a = hands[0], b = hands[1];
      const ax = 1 - (a[0].x + a[9].x) / 2;
      const ay = (a[0].y + a[9].y) / 2;
      const bx = 1 - (b[0].x + b[9].x) / 2;
      const by = (b[0].y + b[9].y) / 2;
      const gap = Math.hypot(ax - bx, ay - by);

      if (this.lastGap !== null && Math.abs(gap - this.lastGap) > .001) {
        const factor = Math.exp(-(gap - this.lastGap) * 2.8);
        this.onZoom?.(Math.min(1.08, Math.max(.92, factor)));
      }
      this.lastGap = gap;
      this.lastPoint = null;
    } else {
      this.lastPoint = null;
      this.lastGap = null;
    }
  }

  isVictory(h) {
    const w = h[0];
    const indexUp = h[8].y < h[6].y - .035 && this.dist(h[8], w) > this.dist(h[6], w) * 1.08;
    const middleUp = h[12].y < h[10].y - .035 && this.dist(h[12], w) > this.dist(h[10], w) * 1.08;
    const ringDown = this.dist(h[16], w) < this.dist(h[14], w) * 1.10;
    const pinkyDown = this.dist(h[20], w) < this.dist(h[18], w) * 1.12;
    return indexUp && middleUp && ringDown && pinkyDown && Math.abs(h[8].x - h[12].x) > .025;
  }

  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.lastPoint = null;
    this.lastGap = null;
    this.victoryActive = false;
    this.onStatus?.('off', 0);
  }
}
