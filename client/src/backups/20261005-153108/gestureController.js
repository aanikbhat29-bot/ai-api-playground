export class GestureController {
  constructor(video, onRotate, onZoom, onStatus) {
    this.video = video;
    this.onRotate = onRotate;
    this.onZoom = onZoom;
    this.onStatus = onStatus;
    this.running = false;
    this.lastMid = null;
    this.lastGap = null;
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
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
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
    const result = this.landmarker.detectForVideo(this.video, performance.now());
    const hands = result.landmarks || [];
    this.onStatus?.('on', hands.length);

    if (hands.length === 1) {
      const h = hands[0];
      const pinch = this.dist(h[4], h[8]);
      if (pinch < 0.075) {
        const mid = { x: (h[4].x + h[8].x) / 2, y: (h[4].y + h[8].y) / 2 };
        if (this.lastMid) {
          this.onRotate?.((mid.x - this.lastMid.x) * 7, (mid.y - this.lastMid.y) * 5);
        }
        this.lastMid = mid;
      } else {
        this.lastMid = null;
      }
      this.lastGap = null;
    } else if (hands.length >= 2) {
      const a = hands[0], b = hands[1];
      const pa = { x: (a[4].x + a[8].x) / 2, y: (a[4].y + a[8].y) / 2 };
      const pb = { x: (b[4].x + b[8].x) / 2, y: (b[4].y + b[8].y) / 2 };
      const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (this.lastGap) {
        const delta = gap - this.lastGap;
        this.onZoom?.(Math.exp(-delta * 2.5));
      }
      this.lastGap = gap;
      this.lastMid = null;
    } else {
      this.lastMid = null;
      this.lastGap = null;
    }

    this.raf = requestAnimationFrame(() => this.loop());
  }

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
    this.lastMid = null;
    this.lastGap = null;
    this.onStatus?.('off', 0);
  }
}
