import { useCallback, useEffect, useRef, useState } from "react";
import { ReelOrbEngine } from "./orbEngine";
import { GestureController } from "./gestureController";

export default function App() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const orbRef = useRef(null);
  const gestureRef = useRef(null);

  const [colorMode, setColorMode] = useState("blue");
  const [camera, setCamera] = useState("off");
  const [hands, setHands] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const orb = new ReelOrbEngine(canvas);

    // Disable all pointer interaction. Hand tracking controls the orb.
    canvas.style.pointerEvents = "none";

    orb.setMode?.("locked");
    orb.start?.();
    orbRef.current = orb;

    return () => {
      gestureRef.current?.stop();
      gestureRef.current = null;
      orb.dispose?.();
      orbRef.current = null;
    };
  }, []);

  const startGestures = useCallback(async () => {
    if (gestureRef.current || !videoRef.current) return;

    setCamera("starting");

    try {
      const controller = new GestureController(
        videoRef.current,
        (yaw, pitch) => {
          orbRef.current?.rotateBy?.(yaw, pitch);
        },
        (factor) => {
          orbRef.current?.zoomBy?.(factor);
        },
        (state, count) => {
          if (state === "on") {
            setCamera("on");
            setHands(count);
          } else if (state === "off") {
            setCamera("off");
            setHands(0);
          }
        },
        () => {
          // ONLY Victory changes color.
          setColorMode((current) =>
            current === "blue" ? "orange" : "blue"
          );
        }
      );

      gestureRef.current = controller;
      await controller.start();
    } catch (error) {
      console.error("Gesture startup:", error);
      gestureRef.current?.stop();
      gestureRef.current = null;
      setCamera("error");
      setHands(0);
    }
  }, []);

  useEffect(() => {
    // Automatic camera startup.
    const timer = setTimeout(() => {
      void startGestures();
    }, 800);

    return () => clearTimeout(timer);
  }, [startGestures]);

  // Color is applied by CSS to the rendered orb, while geometry remains the same.
  useEffect(() => {
    document.documentElement.dataset.jarvisColor = colorMode;
  }, [colorMode]);

  return (
    <main className="jarvis-reel-shell">
      <canvas
        ref={canvasRef}
        className="reel-canvas"
      />

      <video
        ref={videoRef}
        className="gesture-camera"
        muted
        playsInline
      />

      <div className="reel-vignette" />
      <div className="reel-scanlines" />

      <div className="reel-status">
        <span className="status-dot" />
        CAMERA {camera === "on" ? "CONNECTED" : camera.toUpperCase()}
        <span className="status-gap">•</span>
        HANDS {hands}
      </div>

      <div className="reel-color-state">
        {colorMode === "orange" ? "ACTIVE" : "STANDBY"}
      </div>
    </main>
  );
}
