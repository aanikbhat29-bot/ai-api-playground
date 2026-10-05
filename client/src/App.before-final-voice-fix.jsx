import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  GestureRecognizer
} from "@mediapipe/tasks-vision";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://ai-api-playground.onrender.com");

const GREETING =
  "Good afternoon, Aanik. I'm online. What can I do for you, sir?";

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const distance = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export default function App() {
  const videoRef = useRef(null);
  const recognizerRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastFrameRef = useRef(0);
  const actionCooldownRef = useRef({});
  const audioRef = useRef(null);

  const [visionReady, setVisionReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [status, setStatus] = useState("STANDBY");
  const [gesture, setGesture] = useState("AWAITING VISION");
  const [zoom, setZoom] = useState(1);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [error, setError] = useState("");

  const safeAction = async (action, payload = {}) => {
    if (!cameraReady) return;

    const now = Date.now();
    const last = actionCooldownRef.current[action] || 0;

    if (now - last < 1400) return;

    actionCooldownRef.current[action] = now;

    try {
      const response = await fetch(`${API_URL}/api/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          ...payload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Action failed.");
      }

      setStatus("ACTION");
      setGesture(data.message || action);

      setTimeout(() => {
        setStatus("VISION");
      }, 900);
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  };

  const speak = async (text) => {
    if (!text) return;

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const response = await fetch(`${API_URL}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error("ElevenLabs voice generation failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audioRef.current = audio;

      setStatus("SPEAKING");

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setStatus(cameraReady ? "VISION" : "STANDBY");
      };

      await audio.play();
    } catch (err) {
      setError(
        err.message ||
          "Voice playback was blocked by the browser."
      );
      setStatus(cameraReady ? "VISION" : "STANDBY");
    }
  };

  const createRecognizer = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
    );

    try {
      return await GestureRecognizer.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        }
      );
    } catch {
      return await GestureRecognizer.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        }
      );
    }
  };

  const processGesture = (result) => {
    const hands = result?.landmarks || [];
    const categories = result?.gestures || [];

    if (!hands.length) {
      setGesture("SHOW YOUR HAND");
      return;
    }

    const primaryGesture =
      categories?.[0]?.[0]?.categoryName || "Tracking";

    setGesture(primaryGesture.replaceAll("_", " "));

    const primaryHand = hands[0];

    // Pointing hand controls hologram tilt.
    const indexTip = primaryHand?.[8];

    if (indexTip) {
      const targetX = (indexTip.x - 0.5) * 18;
      const targetY = (indexTip.y - 0.5) * -18;

      setTiltX((prev) => prev * 0.78 + targetY * 0.22);
      setTiltY((prev) => prev * 0.78 + targetX * 0.22);
    }

    // Two-hand spread controls hologram zoom.
    if (hands.length >= 2) {
      const left = hands[0][8];
      const right = hands[1][8];

      if (left && right) {
        const handDistance = distance(left, right);

        const targetZoom = clamp(
          0.78 + handDistance * 2.4,
          0.78,
          1.55
        );

        setZoom(
          (prev) => prev * 0.82 + targetZoom * 0.18
        );
      }
    } else if (primaryHand?.[4] && primaryHand?.[8]) {
      // One-hand thumb/index pinch also controls zoom.
      const pinch = distance(
        primaryHand[4],
        primaryHand[8]
      );

      const targetZoom = clamp(
        0.82 + pinch * 2.1,
        0.82,
        1.48
      );

      setZoom(
        (prev) => prev * 0.82 + targetZoom * 0.18
      );
    }

    if (primaryGesture === "Thumb_Up") {
      safeAction("volume_up");
    }

    if (primaryGesture === "Thumb_Down") {
      safeAction("volume_down");
    }

    if (primaryGesture === "Open_Palm") {
      setStatus("VISION");
    }

    if (primaryGesture === "Victory") {
      setFocusMode((prev) => !prev);
      setStatus("FOCUS");
    }

    if (primaryGesture === "Closed_Fist") {
      setStatus("LOCKED");
    }
  };

  const recognitionLoop = (now = performance.now()) => {
    if (!videoRef.current || !recognizerRef.current) {
      return;
    }

    animationRef.current =
      requestAnimationFrame(recognitionLoop);

    if (
      now - lastFrameRef.current < 65 ||
      videoRef.current.readyState < 2
    ) {
      return;
    }

    lastFrameRef.current = now;

    if (
      videoRef.current.currentTime ===
      lastVideoTimeRef.current
    ) {
      return;
    }

    lastVideoTimeRef.current =
      videoRef.current.currentTime;

    try {
      const result =
        recognizerRef.current.recognizeForVideo(
          videoRef.current,
          Math.round(now)
        );

      processGesture(result);
    } catch (err) {
      console.error("Gesture recognition:", err);
    }
  };

  const initializeJarvis = async () => {
    if (initializing) return;

    setInitializing(true);
    setError("");
    setStatus("INITIALIZING");
    setGesture("STARTING VISION");

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
          },
          audio: false
        });

      streamRef.current = stream;

      if (!videoRef.current) {
        throw new Error("Camera element unavailable.");
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setCameraReady(true);

      setGesture("LOADING HAND AI");

      recognizerRef.current =
        await createRecognizer();

      setVisionReady(true);
      setStatus("VISION");

      animationRef.current =
        requestAnimationFrame(recognitionLoop);

      // Greeting after user activation.
      await speak(GREETING);
    } catch (err) {
      console.error(err);

      setStatus("ERROR");

      if (err?.name === "NotAllowedError") {
        setError(
          "Camera permission denied. Allow camera access for localhost."
        );
      } else if (err?.name === "NotFoundError") {
        setError("No camera was found.");
      } else {
        setError(
          err?.message ||
            "JARVIS vision initialization failed."
        );
      }
    } finally {
      setInitializing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      try {
        recognizerRef.current?.close();
      } catch {}

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <main className="jarvis-vision">
      <video
        ref={videoRef}
        className="vision-camera"
        playsInline
        muted
      />

      <div className="ambient-glow" />

      <div className="jarvis-brand">
        <span>J.A.R.V.I.S.</span>
        <small>PERSONAL INTELLIGENCE CORE</small>
      </div>

      <section className="core-stage">
        <div
          className={`hologram ${
            focusMode ? "focus-mode" : ""
          } ${
            status === "SPEAKING" ? "speaking" : ""
          } ${
            status === "VISION" ? "vision-active" : ""
          } ${
            status === "LOCKED" ? "locked" : ""
          }`}
          style={{
            "--zoom": zoom,
            "--tilt-x": `${tiltX}deg`,
            "--tilt-y": `${tiltY}deg`
          }}
        >
          <div className="outer-ring ring-one" />
          <div className="outer-ring ring-two" />
          <div className="outer-ring ring-three" />
          <div className="outer-ring ring-four" />

          <div className="scan-ring" />

          <div className="energy-arcs arc-one" />
          <div className="energy-arcs arc-two" />

          <div className="core">
            <div className="core-inner">
              <div className="core-light" />
              <span>J</span>
            </div>
          </div>

          <div className="orbit-dot dot-one" />
          <div className="orbit-dot dot-two" />
          <div className="orbit-dot dot-three" />
          <div className="orbit-dot dot-four" />
        </div>

        <div className="core-label">
          <span>JARVIS CORE</span>
          <strong>{status}</strong>
          <small>{gesture}</small>
        </div>

        {!cameraReady && (
          <button
            className="initialize-button"
            onClick={initializeJarvis}
            disabled={initializing}
          >
            <span />
            {initializing
              ? "INITIALIZING..."
              : "INITIALIZE JARVIS"}
          </button>
        )}

        {error && (
          <div className="vision-error">
            {error}
          </div>
        )}
      </section>

      <div className="vision-footer">
        <span>
          {visionReady
            ? "● VISION ONLINE"
            : "○ VISION STANDBY"}
        </span>

        <span>
          {cameraReady
            ? "CAMERA CONNECTED"
            : "CAMERA OFF"}
        </span>

        <span>
          HAND CONTROL
        </span>
      </div>
    </main>
  );
}
