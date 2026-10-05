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

    this.pinchActive = false;
    this.lastPinchY = null;

    this.victoryActive = false;
    this.lastVictoryAt = 0;
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

    const config = {
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.60,
      minHandPresenceConfidence: 0.60,
      minTrackingConfidence: 0.60
    };

    try {
      this.landmarker =
        await HandLandmarker.createFromOptions(
          fileset,
          {
            ...config,
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
            ...config,
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
    if (
      !this.running ||
      !this.landmarker
    ) {
      return;
    }

    this.raf =
      requestAnimationFrame(
        () => this.loop()
      );

    if (
      this.video.readyState < 2 ||
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
      this.pinchActive = false;
      this.lastPinchY = null;
      this.lastCount = hands.length;
    }

    if (hands.length !== 1) {
      this.lastPoint = null;
      this.pinchActive = false;
      this.lastPinchY = null;
      this.victoryActive = false;
      return;
    }

    const hand = hands[0];

    // Victory ✌️ is the only color-changing gesture.
    const victory =
      this.isVictory(hand);

    const now =
      performance.now();

    if (
      victory &&
      !this.victoryActive &&
      now - this.lastVictoryAt >
        1200
    ) {
      this.lastVictoryAt = now;
      this.onVictory?.();
    }

    this.victoryActive =
      victory;

    // -------------------------------------------
    // ZOOM ACTION:
    // Pinch thumb + index, then move vertically.
    //
    // UP   = zoom IN
    // DOWN = zoom OUT
    //
    // This is intentionally 1-hand so there is no
    // dependency on accurately detecting two hands.
    // -------------------------------------------
    const pinch =
      this.getPinch(hand);

    if (pinch.active) {
      if (!this.pinchActive) {
        this.pinchActive = true;
        this.lastPinchY = pinch.y;
        this.lastPoint = null;
        return;
      }

      const dy =
        pinch.y -
        this.lastPinchY;

      // Screen Y grows downward.
      // dy < 0 means hand moved UP -> zoom IN.
      if (Math.abs(dy) > 0.003) {
        const factor =
          Math.exp(dy * 9.0);

        this.onZoom?.(
          Math.min(
            1.14,
            Math.max(
              0.90,
              factor
            )
          )
        );

        this.lastPinchY +=
          (pinch.y -
            this.lastPinchY) *
          0.50;
      }

      this.onHandPosition?.(
        pinch.x * 2 - 1,
        pinch.y * 2 - 1
      );

      return;
    }

    if (this.pinchActive) {
      this.pinchActive = false;
      this.lastPinchY = null;
      this.lastPoint = null;
    }

    // -------------------------------------------
    // NORMAL HAND = smooth left/right rotation.
    // -------------------------------------------
    const point = {
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

      if (Math.abs(dx) < 0.0007) {
        dx = 0;
      }

      if (Math.abs(dy) < 0.0007) {
        dy = 0;
      }

      this.onRotate?.(
        -dx * 3.15,
        dy * 2.15
      );
    }

    this.onHandPosition?.(
      point.x * 2 - 1,
      point.y * 2 - 1
    );

    this.lastPoint = this.lastPoint
      ? {
          x:
            this.lastPoint.x +
            (point.x -
              this.lastPoint.x) *
              0.32,
          y:
            this.lastPoint.y +
            (point.y -
              this.lastPoint.y) *
              0.32
        }
      : point;
  }

  getPinch(hand) {
    const thumb = hand[4];
    const index = hand[8];

    const pinchDistance =
      Math.hypot(
        thumb.x - index.x,
        thumb.y - index.y
      );

    const palmSize =
      Math.max(
        0.035,
        Math.hypot(
          hand[0].x - hand[9].x,
          hand[0].y - hand[9].y
        )
      );

    return {
      active:
        pinchDistance <
        palmSize * 0.62,
      x:
        (thumb.x + index.x) / 2,
      y:
        (thumb.y + index.y) / 2
    };
  }

  isVictory(hand) {
    const wrist = hand[0];

    const indexUp =
      hand[8].y <
        hand[6].y - 0.035 &&
      this.dist(
        hand[8],
        wrist
      ) >
        this.dist(
          hand[6],
          wrist
        ) * 1.08;

    const middleUp =
      hand[12].y <
        hand[10].y - 0.035 &&
      this.dist(
        hand[12],
        wrist
      ) >
        this.dist(
          hand[10],
          wrist
        ) * 1.08;

    const ringFolded =
      this.dist(
        hand[16],
        wrist
      ) <
      this.dist(
        hand[14],
        wrist
      ) * 1.10;

    const pinkyFolded =
      this.dist(
        hand[20],
        wrist
      ) <
      this.dist(
        hand[18],
        wrist
      ) * 1.12;

    const separated =
      Math.abs(
        hand[8].x -
        hand[12].x
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

    this.stream?.getTracks()
      .forEach(
        (track) => track.stop()
      );

    this.stream = null;
    this.video.srcObject = null;

    this.landmarker?.close?.();
    this.landmarker = null;

    this.lastPoint = null;
    this.pinchActive = false;
    this.lastPinchY = null;
    this.victoryActive = false;

    this.onStatus?.(
      "off",
      0
    );
  }
}
