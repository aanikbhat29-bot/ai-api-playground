import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene } from "./orbScene";
import { HandTracker } from "./handTracker";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const trackerRef = useRef(null);
  const [camera, setCamera] = useState("off");
  const [status, setStatus] = useState("LOCKED");
  const [voiceState, setVoiceState] = useState("READY");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scene = createOrbScene(root);
    sceneRef.current = scene;

    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const startGestures = useCallback(async () => {
    if (trackerRef.current) return;

    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    setCamera("starting");

    const tracker = new HandTracker(video, overlay, {
      onRotate: (theta, phi) => sceneRef.current?.rotateBy(theta, phi),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: (next) => {
        if (next.mode === "spin") setStatus("SPIN");
        else if (next.mode === "zoom") setStatus("ZOOM");
        else setStatus(next.hands ? `${next.hands} HAND${next.hands > 1 ? "S" : ""}` : "READY");
      },
    });

    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      tracker.stop();
      trackerRef.current = null;
      setCamera("error");
      setStatus("CAMERA ERROR");
      console.error(err);
    }
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus("READY");
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const activate = useCallback(async () => {
    const next = status === "UNLOCKED" ? "LOCKED" : "UNLOCKED";
    setStatus(next);
    rootRef.current?.classList.toggle("jarvis-unlocked", next === "UNLOCKED");

    // Keep the existing Gemini + ElevenLabs backend alive.
    setVoiceState("THINKING");
    try {
      const chat = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            next === "UNLOCKED"
              ? "Say exactly: System unlocked."
              : "Say exactly: System locked.",
        }),
      });

      const data = await chat.json();
      if (!chat.ok) throw new Error(data.error || "AI request failed");

      const tts = await fetch(`${API_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: data.answer || "" }),
      });

      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setVoiceState("READY");
        };
        await audio.play();
      } else {
        setVoiceState("READY");
      }
    } catch (err) {
      console.warn("Voice backend:", err);
      setVoiceState("READY");
    }
  }, [status]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "g" || e.key === "G") toggleGestures();
      if (e.key === "r" || e.key === "R") sceneRef.current?.resetView();
      if (e.key === "+" || e.key === "=") sceneRef.current?.zoomIn();
      if (e.key === "-" || e.key === "_") sceneRef.current?.zoomOut();
      if (e.code === "Space") {
        e.preventDefault();
        void activate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures, activate]);

  return (
    <main className="reel-app">
      <div ref={rootRef} className="orb-root" onDoubleClick={() => void activate()} />
      <video ref={videoRef} className="camera-video-hidden" muted playsInline />
      <canvas ref={overlayRef} width="208" height="156" className="camera-overlay-hidden" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="minimal-status">
        <span className={`dot ${camera === "on" ? "live" : ""}`} />
        {voiceState === "THINKING" ? "JARVIS ONLINE" : status}
      </div>

      <button
        className="gesture-trigger"
        onClick={toggleGestures}
        aria-label="Enable hand gestures"
        title="Enable hand gestures"
      >
        {camera === "on" ? "GESTURES ON" : "G"}
      </button>

      <button
        className="center-trigger"
        onClick={() => void activate()}
        aria-label="Activate JARVIS"
      />
    </main>
  );
}
