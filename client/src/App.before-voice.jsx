import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Clock,
  Code2,
  Cpu,
  FolderOpen,
  Globe2,
  HardDrive,
  Mic,
  MicOff,
  Power,
  Send,
  Settings,
  ShieldCheck,
  Terminal,
  Volume2,
  Wifi,
  Zap
} from "lucide-react";

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(
  window.location.hostname
);

const API_URL =
  import.meta.env.VITE_API_URL ||
  (IS_LOCAL
    ? "http://localhost:5000"
    : "https://ai-api-playground.onrender.com");

const VOICE_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window ||
    "webkitSpeechRecognition" in window);

function formatBytes(bytes) {
  if (!bytes) return "0 GB";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatUptime(seconds) {
  const s = Math.floor(seconds || 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [time, setTime] = useState(new Date());

  const [system, setSystem] = useState({
    hostname: "Local Core",
    platform: "Detecting...",
    cpuPercent: 0,
    memoryPercent: 0,
    totalMemory: 0,
    usedMemory: 0,
    uptime: 0
  });

  const recognitionRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchSystem() {
    if (!IS_LOCAL) return;

    try {
      const response = await fetch(`${API_URL}/api/system`);
      if (!response.ok) return;

      const data = await response.json();
      setSystem(data);
    } catch {
      // Local system telemetry is optional.
    }
  }

  useEffect(() => {
    if (!IS_LOCAL) return;

    fetchSystem();

    const timer = setInterval(fetchSystem, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      recognitionRef.current?.stop();
    };
  }, [audioUrl]);

  async function readAloud(text) {
    if (!text) return;

    setSpeaking(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        let message = "Voice generation failed.";

        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // Keep fallback.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setAudioUrl((oldUrl) => {
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        return url;
      });
    } catch (err) {
      setError(err.message || "Voice generation failed.");
    } finally {
      setSpeaking(false);
    }
  }

  async function localAction(action, payload = {}) {
    if (!IS_LOCAL) {
      throw new Error(
        "Laptop controls are available only in Local Mode."
      );
    }

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
      throw new Error(data.error || "Local action failed.");
    }

    return data.message;
  }

  function detectLocalCommand(text) {
    const clean = text
      .toLowerCase()
      .replace(/^(hey )?jarvis[\s,:-]*/i, "")
      .trim();

    if (/^(open|launch)\s+(browser|chrome|google)$/.test(clean)) {
      return {
        type: "action",
        action: "open_url",
        url: "https://www.google.com",
        message: "Opening the browser."
      };
    }

    if (/^(open|launch)\s+(youtube)$/.test(clean)) {
      return {
        type: "action",
        action: "open_url",
        url: "https://www.youtube.com",
        message: "Opening YouTube."
      };
    }

    if (/^(open|launch)\s+(github)$/.test(clean)) {
      return {
        type: "action",
        action: "open_url",
        url: "https://github.com",
        message: "Opening GitHub."
      };
    }

    if (
      /^(open|launch)\s+(chatgpt)$/.test(clean)
    ) {
      return {
        type: "action",
        action: "open_url",
        url: "https://chatgpt.com",
        message: "Opening ChatGPT."
      };
    }

    if (
      /^(open|launch)\s+(terminal|console)$/.test(clean)
    ) {
      return {
        type: "action",
        action: "terminal",
        message: "Opening the terminal."
      };
    }

    if (
      /^(open|launch)\s+(files|file manager|downloads)$/.test(
        clean
      )
    ) {
      return {
        type: "action",
        action: "files",
        message: "Opening your files."
      };
    }

    if (
      /^(open|launch)\s+(vscode|visual studio code|code)$/.test(
        clean
      )
    ) {
      return {
        type: "action",
        action: "vscode",
        message: "Opening Visual Studio Code."
      };
    }

    if (
      /^(open|launch)\s+(settings|system settings)$/.test(
        clean
      )
    ) {
      return {
        type: "action",
        action: "settings",
        message: "Opening system settings."
      };
    }

    if (
      /^(show|get|check)\s+(system\s+)?(status|stats|information)$/.test(
        clean
      ) ||
      /^(how is my system|system status)$/.test(clean)
    ) {
      return {
        type: "system",
        message: "System status is displayed."
      };
    }

    return null;
  }

  async function askJarvis(text, speakAfter = false) {
    const value = text.trim();

    if (!value || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const local = detectLocalCommand(value);

      if (IS_LOCAL && local) {
        let message = local.message;

        if (local.type === "action") {
          message = await localAction(local.action, {
            url: local.url
          });
        }

        if (local.type === "system") {
          await fetchSystem();
          message =
            `System nominal. CPU ${system.cpuPercent}% ` +
            `and memory ${system.memoryPercent}%.`;
        }

        setProvider("JARVIS LOCAL CORE");
        setAnswer(message);

        if (speakAfter) {
          await readAloud(message);
        }

        return;
      }

      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: value
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed.");
      }

      setProvider(data.provider || "gemini");
      setAnswer(data.answer || "No response received.");

      if (speakAfter && data.answer) {
        await readAloud(data.answer);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      fetchSystem();
    }
  }

  async function submitPrompt(event) {
    event.preventDefault();
    await askJarvis(prompt, false);
  }

  function startVoice() {
    if (!VOICE_SUPPORTED) {
      setError(
        "Voice input is not supported by this browser."
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError("");
    };

    recognition.onresult = async (event) => {
      const transcript =
        event.results?.[0]?.[0]?.transcript?.trim() || "";

      if (!transcript) return;

      setPrompt(transcript);
      await askJarvis(transcript, true);
    };

    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone permission was denied."
          : `Voice input error: ${event.error}`
      );
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  const localLabel = IS_LOCAL
    ? "LOCAL CORE ONLINE"
    : "REMOTE CORE ONLINE";

  return (
    <main className="jarvis-shell">
      <div className="grid-bg" />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Bot size={22} />
          </div>

          <div>
            <div className="brand-name">J.A.R.V.I.S.</div>
            <div className="brand-sub">
              PERSONAL AI CORE
            </div>
          </div>
        </div>

        <div className="top-status">
          <span className="status-dot" />
          {localLabel}
        </div>

        <div className="top-time">
          <Clock size={14} />
          {time.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })}
        </div>
      </header>

      <section className="dashboard">
        <div className="core-card panel">
          <div className="panel-line">
            <span>CORE / 01</span>
            <span>AI ASSISTANT</span>
          </div>

          <div className="orb-zone">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="orbit orbit-c" />

            <div className={`core-orb ${loading ? "active" : ""}`}>
              <div className="core-orb-inner">
                <Zap size={42} strokeWidth={1.3} />
              </div>
            </div>

            <div className="core-readout">
              <span>JARVIS CORE</span>
              <strong>{loading ? "THINKING" : "STANDBY"}</strong>
            </div>
          </div>

          <div className="greeting">
            <div className="eyebrow">PERSONAL ASSISTANT</div>
            <h1>Good afternoon.</h1>
            <p>
              Your AI core is online. Ask naturally, use your
              voice, or control supported laptop functions.
            </p>
          </div>

          <form className="command-form" onSubmit={submitPrompt}>
            <div className="input-shell">
              <textarea
                value={prompt}
                onChange={(event) =>
                  setPrompt(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    submitPrompt(event);
                  }
                }}
                placeholder="Ask JARVIS anything..."
                rows={3}
              />

              <div className="input-actions">
                <button
                  type="button"
                  className={`icon-button ${
                    listening ? "listening" : ""
                  }`}
                  onClick={startVoice}
                  title="Voice input"
                >
                  {listening ? (
                    <MicOff size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                </button>

                <button
                  type="submit"
                  className="send-button"
                  disabled={loading || !prompt.trim()}
                >
                  <Send size={17} />
                  {loading ? "PROCESSING" : "EXECUTE"}
                </button>
              </div>
            </div>
          </form>

          {error && <div className="error-box">{error}</div>}

          {answer && (
            <div className="answer-panel">
              <div className="answer-head">
                <div>
                  <span className="eyebrow">RESPONSE</span>
                  <strong>{provider}</strong>
                </div>

                <button
                  type="button"
                  className="voice-button"
                  onClick={() => readAloud(answer)}
                  disabled={speaking}
                >
                  <Volume2 size={16} />
                  {speaking ? "GENERATING" : "READ ALOUD"}
                </button>
              </div>

              <div className="answer-text">{answer}</div>

              {audioUrl && (
                <audio
                  className="audio-player"
                  controls
                  autoPlay
                  src={audioUrl}
                />
              )}
            </div>
          )}
        </div>

        <aside className="side-column">
          <div className="panel telemetry">
            <div className="panel-line">
              <span>SYSTEM TELEMETRY</span>
              <Activity size={15} />
            </div>

            <div className="telemetry-grid">
              <div className="metric">
                <Cpu size={17} />
                <span>CPU LOAD</span>
                <strong>
                  {IS_LOCAL
                    ? `${system.cpuPercent}%`
                    : "--"}
                </strong>
              </div>

              <div className="metric">
                <HardDrive size={17} />
                <span>MEMORY</span>
                <strong>
                  {IS_LOCAL
                    ? `${system.memoryPercent}%`
                    : "--"}
                </strong>
              </div>

              <div className="metric">
                <Wifi size={17} />
                <span>UPLINK</span>
                <strong>ONLINE</strong>
              </div>

              <div className="metric">
                <Clock size={17} />
                <span>UPTIME</span>
                <strong>
                  {IS_LOCAL
                    ? formatUptime(system.uptime)
                    : "--"}
                </strong>
              </div>
            </div>

            <div className="system-meta">
              <span>{system.hostname}</span>
              <span>{system.platform}</span>
            </div>
          </div>

          <div className="panel actions-panel">
            <div className="panel-line">
              <span>QUICK ACTIONS</span>
              <span>
                {IS_LOCAL ? "LOCAL" : "REMOTE"}
              </span>
            </div>

            <div className="action-grid">
              <button
                onClick={() =>
                  localAction("open_url", {
                    url: "https://www.google.com"
                  }).then((message) => {
                    setProvider("JARVIS LOCAL CORE");
                    setAnswer(message);
                  }).catch((err) => setError(err.message))
                }
                disabled={!IS_LOCAL}
              >
                <Globe2 />
                <span>Browser</span>
              </button>

              <button
                onClick={() =>
                  localAction("terminal")
                    .then((message) => {
                      setProvider("JARVIS LOCAL CORE");
                      setAnswer(message);
                    })
                    .catch((err) => setError(err.message))
                }
                disabled={!IS_LOCAL}
              >
                <Terminal />
                <span>Terminal</span>
              </button>

              <button
                onClick={() =>
                  localAction("files")
                    .then((message) => {
                      setProvider("JARVIS LOCAL CORE");
                      setAnswer(message);
                    })
                    .catch((err) => setError(err.message))
                }
                disabled={!IS_LOCAL}
              >
                <FolderOpen />
                <span>Files</span>
              </button>

              <button
                onClick={() =>
                  localAction("vscode")
                    .then((message) => {
                      setProvider("JARVIS LOCAL CORE");
                      setAnswer(message);
                    })
                    .catch((err) => setError(err.message))
                }
                disabled={!IS_LOCAL}
              >
                <Code2 />
                <span>VS Code</span>
              </button>

              <button
                onClick={() =>
                  localAction("settings")
                    .then((message) => {
                      setProvider("JARVIS LOCAL CORE");
                      setAnswer(message);
                    })
                    .catch((err) => setError(err.message))
                }
                disabled={!IS_LOCAL}
              >
                <Settings />
                <span>Settings</span>
              </button>

              <button
                onClick={() => {
                  setAnswer(
                    IS_LOCAL
                      ? "Local control core is armed and ready."
                      : "Remote mode is active. Open localhost for laptop controls."
                  );
                  setProvider("JARVIS CORE");
                }}
              >
                <Power />
                <span>Core Status</span>
              </button>
            </div>
          </div>

          <div className="panel security-panel">
            <ShieldCheck size={17} />
            <div>
              <strong>SECURE LOCAL CONTROL</strong>
              <span>
                Only approved laptop actions are exposed.
              </span>
            </div>
          </div>
        </aside>
      </section>

      <footer className="jarvis-footer">
        <span>J.A.R.V.I.S. // PERSONAL INTELLIGENCE SYSTEM</span>
        <span>GEMINI + ELEVENLABS</span>
        <span>{IS_LOCAL ? "LOCAL CONTROL ENABLED" : "VOICE + AI MODE"}</span>
      </footer>
    </main>
  );
}
