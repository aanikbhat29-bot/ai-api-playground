export class GestureController {
  constructor(video, onRotate, onZoom, onStatus, onVictory) {
    this.video = video;
    this.onRotate = onRotate;
    this.onZoom = onZoom;
    this.onStatus = onStatus;
    this.onVictory = onVictory;

    this.running = false;
    this.landmarker = null;
    this.stream = null;
    this.raf = 0;
    this.lastVideoTime = -1;

    this.lastHand = null;
    this.lastGap = null;
    this.lastCount = 0;

    this.victoryActive = false;
    this.lastVictoryAt = 0;
  }

  async start() {
    if (this.running) return;

    this.onStatus?.("loading", 0);

    const vision = await import("@mediapipe/tasks-vision");
    const FilesetResolver = vision.FilesetResolver;
    const HandLandmarker = vision.HandLandmarker;

    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
    );

    const model =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

    const common = {
      baseOptions: {
        modelAssetPath: model,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.58,
      minHandPresenceConfidence: 0.58,
      minTrackingConfidence: 0.58
    };

    try {
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          common
        );
    } catch {
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          {
            ...common,
            baseOptions: {
              modelAssetPath: model,
              delegate: "CPU"
            }
          }
        );
    }

    this.stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });

    this.video.srcObject = this.stream;
    this.video.style.transform = "scaleX(-1)";
    await this.video.play();

    this.running = true;
    this.onStatus?.("on", 0);
    this.loop();
  }

  loop() {
    if (!this.running || !this.landmarker) return;

    this.raf = requestAnimationFrame(
      () => this.loop()
    );

    if (this.video.readyState < 2) return;

    if (
      this.video.currentTime ===
      this.lastVideoTime
    ) {
      return;
    }

    this.lastVideoTime =
      this.video.currentTime;

    const result =
      this.landmarker.detectForVideo(
        this.video,
        performance.now()
      );

    const hands = result.landmarks || [];

    this.onStatus?.("on", hands.length);

    if (hands.length !== this.lastCount) {
      this.lastHand = null;
      this.lastGap = null;
      this.lastCount = hands.length;
    }

    // -----------------------------
    // Victory detection
    // index + middle extended,
    // ring + pinky folded.
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
      now - this.lastVictoryAt > 1300
    ) {
      this.lastVictoryAt = now;

      if (this.onVictory) {
        this.onVictory();
      }
    }

    this.victoryActive = victoryDetected;

    // -----------------------------
    // ONE HAND = smooth rotation
    // Right -> right, left -> left
    // -----------------------------
    if (hands.length === 1) {
      const h = hands[0];

      const point = {
        x: 1 - (h[0].x + h[9].x) / 2,
        y: (h[0].y + h[9].y) / 2
      };

      if (this.lastHand) {
        let dx = point.x - this.lastHand.x;
        let dy = point.y - this.lastHand.y;

        if (Math.abs(dx) < 0.001) dx = 0;
        if (Math.abs(dy) < 0.001) dy = 0;

        // Hand direction follows the orb direction.
        if (this.onRotate) {
          this.onRotate(
            -dx * 7.2,
            dy * 5.0
          );
        }
      }

      // Smoothly remember hand position.
      if (this.lastHand) {
        this.lastHand = {
          x: this.lastHand.x +
            (point.x - this.lastHand.x) * 0.28,
          y: this.lastHand.y +
            (point.y - this.lastHand.y) * 0.28
        };
      } else {
        this.lastHand = point;
      }

      this.lastGap = null;
    }

    // -----------------------------
    // TWO HANDS = distance zoom
    // Apart -> zoom IN
    // Together -> zoom OUT
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

      const gap = Math.hypot(
        pa.x - pb.x,
        pa.y - pb.y
      );

      if (
        this.lastGap !== null &&
        Math.abs(gap - this.lastGap) > 0.001
      ) {
        const delta =
          gap - this.lastGap;

        const factor = Math.exp(
          -delta * 2.6
        );

        if (this.onZoom) {
          this.onZoom(
            Math.min(
              1.10,
              Math.max(0.91, factor)
            )
          );
        }
      }

      this.lastGap = gap;
      this.lastHand = null;
    }

    else {
      this.lastHand = null;
      this.lastGap = null;
    }
  }

  isVictory(h) {
    const wrist = h[0];

    const indexUp =
      h[8].y < h[6].y - 0.035 &&
      this.dist(h[8], wrist) >
        this.dist(h[6], wrist) * 1.08;

    const middleUp =
      h[12].y < h[10].y - 0.035 &&
      this.dist(h[12], wrist) >
        this.dist(h[10], wrist) * 1.08;

    const ringFolded =
      this.dist(h[16], wrist) <
      this.dist(h[14], wrist) * 1.10;

    const pinkyFolded =
      this.dist(h[20], wrist) <
      this.dist(h[18], wrist) * 1.12;

    const separated =
      Math.abs(
        h[8].x - h[12].x
      ) > 0.025;

    return (
      indexUp &&
      middleUp &&
      ringFolded &&
      pinkyFolded &&
      separated
    );
  }

  dist(a, b) {
    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );
  }

  stop() {
    this.running = false;

    cancelAnimationFrame(
      this.raf
    );

    if (this.stream) {
      this.stream
        .getTracks()
        .forEach((track) => track.stop());
    }

    this.stream = null;
    this.video.srcObject = null;

    if (this.landmarker) {
      this.landmarker.close();
    }

    this.landmarker = null;
    this.lastHand = null;
    this.lastGap = null;
    this.victoryActive = false;

    this.onStatus?.("off", 0);
  }
}
