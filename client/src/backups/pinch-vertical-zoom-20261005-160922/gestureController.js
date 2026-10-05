export class GestureController {
  constructor(
    video,
    onRotate,
    onZoom,
    onStatus,
    onVictory,
    onHandPosition
  ) {
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
    this.lastCount = 0;

    this.victoryActive = false;
    this.lastVictoryAt = 0;

    this.zoomGesture = null;
    this.lastZoomStep = 0;
  }

  async start() {
    if (this.running) return;

    this.onStatus?.("loading", 0);

    const {
      FilesetResolver,
      HandLandmarker
    } = await import("@mediapipe/tasks-vision");

    const fileset =
      await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );

    const model =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

    const common = {
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.60,
      minHandPresenceConfidence: 0.60,
      minTrackingConfidence: 0.60
    };

    try {
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          {
            ...common,
            baseOptions: {
              modelAssetPath: model,
              delegate: "GPU"
            }
          }
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

    const hands =
      result.landmarks || [];

    this.onStatus?.(
      "on",
      hands.length
    );

    if (hands.length !== this.lastCount) {
      this.lastPoint = null;
      this.zoomGesture = null;
      this.lastCount = hands.length;
    }

    // Victory sign is the ONLY color action.
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
      this.onVictory?.();
    }

    this.victoryActive =
      victoryDetected;

    // One hand:
    //   normal open hand movement = rotate
    //   thumbs up = zoom in
    //   thumbs down = zoom out
    if (hands.length === 1) {
      const hand = hands[0];

      const zoom =
        this.detectThumbZoom(hand);

      if (zoom) {
        this.lastPoint = null;

        // Step zoom only every 550 ms.
        // This is much more stable than distance-based continuous zoom.
        if (
          zoom !== this.zoomGesture ||
          now - this.lastZoomStep > 550
        ) {
          this.zoomGesture = zoom;
          this.lastZoomStep = now;

          if (zoom === "in") {
            this.onZoom?.(0.88);
          } else {
            this.onZoom?.(1.14);
          }
        }

        return;
      }

      this.zoomGesture = null;

      const point = {
        // Mirror X so movement feels natural like a mirror.
        x:
          1 -
          (hand[0].x + hand[9].x) /
            2,
        y:
          (hand[0].y + hand[9].y) /
          2
      };

      if (this.lastPoint) {
        let dx =
          point.x -
          this.lastPoint.x;

        let dy =
          point.y -
          this.lastPoint.y;

        // Deadzone removes tiny webcam noise.
        if (Math.abs(dx) < 0.001) dx = 0;
        if (Math.abs(dy) < 0.001) dy = 0;

        this.onRotate?.(
          -dx * 3.0,
          dy * 2.0
        );
      }

      // Whole orb follows the hand position with gentle parallax.
      this.onHandPosition?.(
        point.x * 2 - 1,
        point.y * 2 - 1
      );

      // Additional smoothing.
      this.lastPoint = this.lastPoint
        ? {
            x:
              this.lastPoint.x +
              (point.x -
                this.lastPoint.x) *
                0.30,
            y:
              this.lastPoint.y +
              (point.y -
                this.lastPoint.y) *
                0.30
          }
        : point;

      return;
    }

    this.lastPoint = null;
    this.zoomGesture = null;
  }

  detectThumbZoom(hand) {
    const wrist = hand[0];

    // All four non-thumb fingers must be folded.
    const folded =
      this.dist(hand[8], wrist) <
        this.dist(hand[6], wrist) * 1.12 &&
      this.dist(hand[12], wrist) <
        this.dist(hand[10], wrist) * 1.12 &&
      this.dist(hand[16], wrist) <
        this.dist(hand[14], wrist) * 1.14 &&
      this.dist(hand[20], wrist) <
        this.dist(hand[18], wrist) * 1.16;

    if (!folded) return null;

    const thumbUp =
      hand[4].y <
        hand[3].y - 0.045 &&
      hand[4].y <
        hand[2].y - 0.035 &&
      this.dist(hand[4], wrist) >
        this.dist(hand[2], wrist) * 1.08;

    const thumbDown =
      hand[4].y >
        hand[3].y + 0.045 &&
      hand[4].y >
        hand[2].y + 0.035 &&
      this.dist(hand[4], wrist) >
        this.dist(hand[2], wrist) * 1.05;

    if (thumbUp) return "in";
    if (thumbDown) return "out";

    return null;
  }

  isVictory(hand) {
    const wrist = hand[0];

    const indexUp =
      hand[8].y <
        hand[6].y - 0.035 &&
      this.dist(hand[8], wrist) >
        this.dist(hand[6], wrist) * 1.08;

    const middleUp =
      hand[12].y <
        hand[10].y - 0.035 &&
      this.dist(hand[12], wrist) >
        this.dist(hand[10], wrist) * 1.08;

    const ringFolded =
      this.dist(hand[16], wrist) <
      this.dist(hand[14], wrist) * 1.10;

    const pinkyFolded =
      this.dist(hand[20], wrist) <
      this.dist(hand[18], wrist) * 1.12;

    return (
      indexUp &&
      middleUp &&
      ringFolded &&
      pinkyFolded &&
      Math.abs(
        hand[8].x -
        hand[12].x
      ) > 0.025
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

    this.stream?.getTracks()
      .forEach(
        (track) => track.stop()
      );

    this.stream = null;
    this.video.srcObject = null;

    this.landmarker?.close?.();
    this.landmarker = null;

    this.lastPoint = null;
    this.zoomGesture = null;
    this.victoryActive = false;

    this.onStatus?.(
      "off",
      0
    );
  }
}
