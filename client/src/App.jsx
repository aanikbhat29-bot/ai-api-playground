import { useEffect } from "react";
import JarvisOrb from "./reel-orb/components/JarvisOrb";
import { useLocalVoiceAssistant } from "./localVoiceAssistant";
import "./jarvis-video.css";

const LIVE_STATES = new Set([
  "LISTENING",
  "HEARING",
  "TRANSCRIBING",
  "THINKING",
  "SPEAKING",
]);

function JarvisVoiceStatus() {
  const voice = useLocalVoiceAssistant();

  useEffect(() => {
    if (!voice.needsActivation) return undefined;

    const activate = () => voice.activate();
    window.addEventListener("pointerdown", activate, { once: true });
    window.addEventListener("keydown", activate, { once: true });

    return () => {
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
    };
  }, [voice.needsActivation, voice.activate]);

  return (
    <>
      {voice.transcript && (
        <div className="jarvis-heard" aria-live="polite">
          HEARD · {voice.transcript}
        </div>
      )}

      <div
        className="jarvis-voice-state"
        data-state={voice.status}
        aria-live="polite"
      >
        <span className={`voice-dot${LIVE_STATES.has(voice.status) ? " live" : ""}`} />
        {voice.status}
      </div>

      {voice.needsActivation && (
        <button className="jarvis-activate" type="button" onClick={voice.activate}>
          ACTIVATE JARVIS
        </button>
      )}
    </>
  );
}

export default function App() {
  return (
    <main className="jarvis-video-shell">
      <JarvisOrb />
      <JarvisVoiceStatus />
    </main>
  );
}
