import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { ReelOrbEngine } from "./orbEngine";
import { GestureController } from "./gestureController";

export default function App() {
  const canvasRef =
    useRef(null);

  const videoRef =
    useRef(null);

  const orbRef =
    useRef(null);

  const gestureRef =
    useRef(null);

  const [orange, setOrange] =
    useState(false);

  const [camera, setCamera] =
    useState("OFF");

  const [hands, setHands] =
    useState(0);

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) return;

    const orb =
      new ReelOrbEngine(canvas);

    orb.start();

    // Hard-disable browser mouse interaction.
    canvas.style.pointerEvents =
      "none";

    canvas.style.touchAction =
      "none";

    orbRef.current = orb;

    return () => {
      gestureRef.current?.stop();
      gestureRef.current = null;

      orb.dispose();
      orbRef.current = null;
    };
  }, []);

  useEffect(() => {
    orbRef.current?.setMode(
      orange
        ? "orange"
        : "blue"
    );
  }, [orange]);

  const startHands =
    useCallback(async () => {
      if (
        gestureRef.current ||
        !videoRef.current
      ) {
        return;
      }

      setCamera("STARTING");

      try {
        const controller =
          new GestureController(
            videoRef.current,

            // HAND ROTATION
            (yaw, pitch) => {
              orbRef.current?.rotateBy(
                yaw,
                pitch
              );
            },

            // HAND ZOOM
            (factor) => {
              orbRef.current?.zoomBy(
                factor
              );
            },

            // CAMERA STATUS
            (state, count) => {
              setCamera(
                state === "on"
                  ? "ON"
                  : state.toUpperCase()
              );

              setHands(
                state === "on"
                  ? count
                  : 0
              );
            },

            // VICTORY = COLOR ONLY
            () => {
              setOrange(
                (current) =>
                  !current
              );
            },

            // HAND POSITION
            (nx, ny) => {
              orbRef.current?.setHandPosition?.(
                nx,
                ny
              );
            }
          );

        gestureRef.current =
          controller;

        await controller.start();
      } catch (error) {
        console.error(
          "Hand tracking:",
          error
        );

        gestureRef.current?.stop();
        gestureRef.current =
          null;

        setCamera("ERROR");
        setHands(0);
      }
    }, []);

  useEffect(() => {
    // Auto-start hand tracking.
    const timer =
      window.setTimeout(
        () => {
          void startHands();
        },
        800
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [startHands]);

  return (
    <main
      className={
        orange
          ? "reel-app orange"
          : "reel-app blue"
      }
    >
      <canvas
        ref={canvasRef}
        className="reel-canvas"
      />

      <video
        ref={videoRef}
        className="hidden-camera"
        muted
        playsInline
      />

      <div className="reel-vignette" />
      <div className="reel-scanlines" />

      <div className="gesture-hint">
        MOVE HAND · PINCH + UP/DOWN ZOOM · ✌ COLOR
      </div>

      <div className="reel-status">
        <span
          className={
            camera === "ON"
              ? "status-dot live"
              : "status-dot"
          }
        />
        CAMERA {camera}
        <span className="status-gap">
          •
        </span>
        HANDS {hands}
      </div>

      <div className="reel-state">
        {orange
          ? "ACTIVE"
          : "STANDBY"}
      </div>
    </main>
  );
}
