import { useEffect, useRef, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

const GREETING =
  "Good afternoon, Aanik. I'm online. What can I do for you, sir?";

export default function App() {
  const [system, setSystem] = useState({
    cpuPercent: 0,
    memoryPercent: 0,
    hostname: "fedora",
    platform: "Linux",
    uptime: 0
  });

  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("STANDBY");
  const [clock, setClock] = useState(new Date());
  const [voiceOn, setVoiceOn] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(
      () => setClock(new Date()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  async function updateSystem() {
    try {
      const response = await fetch(
        `${API_URL}/api/system`
      );

      if (!response.ok) return;

      const data = await response.json();
      setSystem(data);
    } catch {
      // Keep last known values.
    }
  }

  useEffect(() => {
    updateSystem();

    const timer = setInterval(updateSystem, 1000);

    return () => clearInterval(timer);
  }, []);

  async function speak(text) {
    if (!text) return;

    setStatus("SPEAKING");
    speakingRef.current = true;

    try {
      const response = await fetch(
        `${API_URL}/api/tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ text })
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "Voice generation failed."
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        speakingRef.current = false;

        if (voiceOn) {
          setTimeout(startListening, 300);
        } else {
          setStatus("STANDBY");
        }
      };

      await audio.play();
    } catch (err) {
      speakingRef.current = false;
      setStatus("STANDBY");
      setError(err.message);
    }
  }

  function startListening() {
    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "Speech recognition is unavailable in this browser."
      );
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {}

    const recognition = new Recognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setStatus("LISTENING");
      setError("");
    };

    recognition.onresult = async (event) => {
      const text =
        event.results?.[0]?.[0]?.transcript?.trim();

      if (!text) return;

      setPrompt(text);
      await execute(text, true);
    };

    recognition.onerror = (event) => {
      setStatus("STANDBY");

      if (event.error !== "aborted") {
        setError(`Voice input: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (voiceOn && !speakingRef.current) {
        setTimeout(startListening, 400);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  async function activateVoice() {
    setVoiceOn(true);
    setError("");

    await speak(GREETING);
  }

  async function execute(text, speakReply = true) {
    const value = text.trim();

    if (!value) return;

    setStatus("THINKING");
    setError("");

    const clean = value
      .toLowerCase()
      .replace(/^(hey\s+)?jarvis[\s,:-]*/i, "")
      .trim();

    try {
      let localAction = null;

      if (/^(open|launch)\s+youtube$/.test(clean)) {
        localAction = {
          action: "open_url",
          payload: {
            url: "https://www.youtube.com"
          }
        };
      }

      else if (
        /^(play|listen to|put on)\s+(.+)$/.test(clean)
      ) {
        const match = clean.match(
          /^(play|listen to|put on)\s+(.+)$/
        );

        localAction = {
          action: "youtube_search",
          payload: {
            query: match[2]
          }
        };
      }

      else if (
        /^(search|google|look up)\s+(.+)$/.test(clean)
      ) {
        const match = clean.match(
          /^(search|google|look up)\s+(.+)$/
        );

        localAction = {
          action: "search_web",
          payload: {
            query: match[2]
          }
        };
      }

      else if (
        /^(open|launch)\s+(terminal|console)$/.test(clean)
      ) {
        localAction = {
          action: "terminal",
          payload: {}
        };
      }

      else if (
        /^(open|launch)\s+(files|downloads|file manager)$/.test(
          clean
        )
      ) {
        localAction = {
          action: "files",
          payload: {}
        };
      }

      else if (
        /^(open|launch)\s+(vscode|code|visual studio code)$/.test(
          clean
        )
      ) {
        localAction = {
          action: "vscode",
          payload: {}
        };
      }

      else if (
        /^(volume up|increase volume|louder)$/.test(
          clean
        )
      ) {
        localAction = {
          action: "volume_up",
          payload: {}
        };
      }

      else if (
        /^(volume down|decrease volume|quieter)$/.test(
          clean
        )
      ) {
        localAction = {
          action: "volume_down",
          payload: {}
        };
      }

      else if (
        /^(ring|find)\s+(my\s+)?(phone|mobile)$/.test(
          clean
        )
      ) {
        localAction = {
          action: "ring_phone",
          payload: {}
        };
      }

      if (localAction) {
        const response = await fetch(
          `${API_URL}/api/action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(localAction)
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Local action failed."
          );
        }

        setAnswer(data.message);
        setStatus("ACTION");

        if (speakReply) {
          await speak(data.message);
        } else {
          setStatus("STANDBY");
        }

        return;
      }

      const response = await fetch(
        `${API_URL}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: value
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Gemini request failed."
        );
      }

      setAnswer(data.answer);
      setStatus("SPEAKING");

      if (speakReply) {
        await speak(data.answer);
      } else {
        setStatus("STANDBY");
      }
    } catch (err) {
      setStatus("ERROR");
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    await execute(prompt, true);
  }

  return (
    <main className="image-hud">
      <img
        className="hud-image"
        src="/jarvis-hud.png"
        alt="JARVIS HUD"
      />

      {/* LIVE CLOCK */}
      <div className="live-clock">
        {clock.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })}
      </div>

      {/* LIVE SYSTEM VALUES */}
      <div className="live-cpu">
        {system.cpuPercent}%
      </div>

      <div className="live-ram">
        {system.memoryPercent}%
      </div>

      <div className="live-host">
        {system.hostname}
      </div>

      <div className="live-status">
        ● {status}
      </div>

      {/* REAL CENTRAL INPUT */}
      <form
        className="transparent-command"
        onSubmit={submit}
      >
        <input
          value={prompt}
          onChange={(e) =>
            setPrompt(e.target.value)
          }
          placeholder="Talk to JARVIS..."
        />

        <button type="submit">
          ASK
        </button>

        <button
          type="button"
          className="mic-hit"
          onClick={() => {
            if (voiceOn) {
              setVoiceOn(false);

              try {
                recognitionRef.current?.stop();
              } catch {}

              setStatus("STANDBY");
            } else {
              activateVoice();
            }
          }}
        >
          🎙
        </button>
      </form>

      {/* REAL RESPONSE, TRANSPARENT OVERLAY */}
      {answer && (
        <div className="live-answer">
          {answer}
        </div>
      )}

      {error && (
        <div className="live-error">
          {error}
        </div>
      )}
    </main>
  );
}
