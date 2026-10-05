import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Clock,
  Code2,
  Cpu,
  FolderOpen,
  Globe2,
  Mic,
  MicOff,
  Phone,
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

const GREETING =
  "Good afternoon, Aanik. I'm online. What can I do for you, sir?";

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
  const [needActivation, setNeedActivation] = useState(false);
  const [time, setTime] = useState(new Date());

  const [system, setSystem] = useState({
    hostname: "fedora",
    platform: "Linux",
    cpuPercent: 0,
    memoryPercent: 0,
    uptime: 0
  });

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const listenModeRef = useRef(false);
  const loadingRef = useRef(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  async function fetchSystem() {
    if (!IS_LOCAL) return;

    try {
      const response = await fetch(`${API_URL}/api/system`);
      if (!response.ok) return;

      const data = await response.json();
      setSystem(data);
    } catch {
      // Optional telemetry.
    }
  }

  useEffect(() => {
    fetchSystem();

    const timer = setInterval(fetchSystem, 3000);
    return () => clearInterval(timer);
  }, []);

  async function speakText(text, resumeListening = false) {
    if (!text) return false;

    setSpeaking(true);
    speakingRef.current = true;
    setError("");

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
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "ElevenLabs voice generation failed."
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setSpeaking(false);
        speakingRef.current = false;

        if (resumeListening && listenModeRef.current) {
          setTimeout(startListening, 350);
        }
      };

      try {
        await audio.play();
        setNeedActivation(false);
        return true;
      } catch (playError) {
        setNeedActivation(true);
        setError(
          "Browser blocked automatic audio. Click ACTIVATE JARVIS once."
        );
        setSpeaking(false);
        speakingRef.current = false;
        return false;
      }
    } catch (err) {
      setError(err.message || "Voice generation failed.");
      setSpeaking(false);
      speakingRef.current = false;
      return false;
    }
  }

  async function startListening() {
    if (!VOICE_SUPPORTED) {
      setError("This browser does not support speech recognition.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Already stopped.
      }
    }

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    const languages = ["en-IN", "en-US"];
    let selectedLanguage = "en-IN";

    try {
      if (typeof SpeechRecognition.available === "function") {
        for (const language of languages) {
          const availability = await SpeechRecognition.available({
            langs: [language],
            processLocally: true
          });

          if (availability === "available") {
            selectedLanguage = language;
            break;
          }

          if (
            availability === "downloadable" &&
            typeof SpeechRecognition.install === "function"
          ) {
            setError(`Installing ${language} offline speech pack...`);

            const installed = await SpeechRecognition.install({
              langs: [language]
            });

            if (installed) {
              selectedLanguage = language;
              setError("");
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Local speech setup:", err);
    }

    const recognition = new SpeechRecognition();

    recognition.lang = selectedLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // IMPORTANT: force on-device processing.
    try {
      recognition.processLocally = true;
    } catch {
      // Older implementations may not expose this property.
    }

    // Help recognition understand JARVIS-specific words.
    try {
      if (
        "SpeechRecognitionPhrase" in window &&
        "phrases" in recognition
      ) {
        const phrases = [
          "Jarvis",
          "J.A.R.V.I.S.",
          "YouTube",
          "GitHub",
          "ChatGPT",
          "VS Code",
          "terminal",
          "browser",
          "phone",
          "notifications",
          "system status"
        ];

        recognition.phrases = phrases.map(
          (phrase) =>
            new window.SpeechRecognitionPhrase(phrase, 6.0)
        );
      }
    } catch {
      // Phrase biasing is optional.
    }

    recognition.onstart = () => {
      setListening(true);
      setError("");
    };

    recognition.onresult = async (event) => {
      const text =
        event.results?.[0]?.[0]?.transcript?.trim() || "";

      try {
        recognition.stop();
      } catch {
        // Ignore.
      }

      setListening(false);

      if (text) {
        setPrompt(text);
        await askJarvis(text, true);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);

      if (event.error === "not-allowed") {
        setError(
          "Microphone permission denied. Allow microphone access for localhost."
        );
      } else if (
        event.error === "language-not-supported"
      ) {
        setError(
          "Local speech language pack is unavailable in this browser."
        );
      } else if (event.error === "network") {
        setError(
          "Browser tried remote speech recognition. Local speech could not be enabled."
        );
      } else if (event.error !== "aborted") {
        setError(`Voice input: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;

      if (
        listenModeRef.current &&
        !loadingRef.current &&
        !speakingRef.current
      ) {
        setTimeout(() => startListening(), 500);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setListening(false);
      setError(
        err?.message ||
          "Could not start local microphone recognition."
      );
    }
  }

  async function readPhoneNotifications() {
    const response = await fetch(`${API_URL}/api/phone/notifications`);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Could not read phone notifications."
      );
    }

    if (!data.notifications?.length) {
      return "There are no active phone notifications.";
    }

    return (
      "I found these notifications. " +
      data.notifications
        .slice(0, 5)
        .map(
          (item) =>
            `${item.app}: ${item.text || "notification"}`
        )
        .join(". ")
    );
  }

  async function sendPhoneSms(destination, text) {
    if (
      !/^\+?[0-9][0-9 -]{6,20}$/.test(destination.trim())
    ) {
      throw new Error("Invalid phone number.");
    }

    if (!text.trim() || text.length > 1000) {
      throw new Error("SMS text must be between 1 and 1000 characters.");
    }

    const response = await fetch(`${API_URL}/api/phone/sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destination: destination.trim(),
        text: text.trim()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "SMS could not be sent.");
    }

    return data.message;
  }

  function parseSmsCommand(text) {
    const match = text.match(
      /send (?:an )?sms to ([+\d][\d\s-]{6,20}) (?:saying|that says|message)\s+(.+)/i
    );

    if (!match) return null;

    return {
      destination: match[1].trim(),
      text: match[2].trim()
    };
  }

  function detectCommand(text) {
    const clean = text
      .toLowerCase()
      .replace(/^hey\s+jarvis[\s,:-]*/i, "")
      .replace(/^jarvis[\s,:-]*/i, "")
      .trim();

    const commands = [
      {
        regex: /^(open|launch)\s+(youtube)$/,
        action: () =>
          runAction("open_url", {
            url: "https://www.youtube.com"
          })
      },
      {
        regex: /^(open|launch)\s+(google|browser|chrome)$/,
        action: () =>
          runAction("open_url", {
            url: "https://www.google.com"
          })
      },
      {
        regex: /^(open|launch)\s+(github)$/,
        action: () =>
          runAction("open_url", {
            url: "https://github.com"
          })
      },
      {
        regex: /^(open|launch)\s+(chatgpt)$/,
        action: () =>
          runAction("open_url", {
            url: "https://chatgpt.com"
          })
      },
      {
        regex: /^(open|launch)\s+(terminal|console)$/,
        action: () => runAction("terminal")
      },
      {
        regex:
          /^(open|launch)\s+(files|file manager|downloads)$/,
        action: () => runAction("files")
      },
      {
        regex:
          /^(open|launch)\s+(vscode|visual studio code|code)$/,
        action: () => runAction("vscode")
      },
      {
        regex:
          /^(open|launch)\s+(settings|system settings)$/,
        action: () => runAction("settings")
      },
      {
        regex:
          /^(ring|find)\s+(my )?(phone|mobile)$/,
        action: () => runAction("ring_phone")
      }
    ];

    return commands.find((item) => item.regex.test(clean)) || null;
  }

  async function askJarvis(text, speakAfter = true) {
    const value = text.trim();

    if (!value || loadingRef.current) return;

    setLoading(true);
    loadingRef.current = true;
    setError("");

    try {
      const sms = parseSmsCommand(value);

      if (sms && IS_LOCAL) {
        const approved = window.confirm(
          `Send SMS to ${sms.destination}?\n\n${sms.text}`
        );

        if (!approved) {
          const message = "SMS cancelled.";
          setProvider("JARVIS LOCAL CORE");
          setAnswer(message);

          if (speakAfter) {
            await speakText(message, true);
          }

          return;
        }

        const message = await sendPhoneSms(
          sms.destination,
          sms.text
        );

        setProvider("JARVIS PHONE CORE");
        setAnswer(message);

        if (speakAfter) {
          await speakText(message, true);
        }

        return;
      }

      const clean = value
        .toLowerCase()
        .replace(/^hey\s+jarvis[\s,:-]*/i, "")
        .replace(/^jarvis[\s,:-]*/i, "")
        .trim();

      if (
        IS_LOCAL &&
        /^(read|check|show)\s+(my\s+)?(phone\s+)?notifications?$/.test(
          clean
        )
      ) {
        const message = await readPhoneNotifications();

        setProvider("JARVIS PHONE CORE");
        setAnswer(message);

        if (speakAfter) {
          await speakText(message, true);
        }

        return;
      }

      if (
        IS_LOCAL &&
        /^(system status|status of my system|how is my system)$/.test(
          clean
        )
      ) {
        await fetchSystem();

        const message =
          `System nominal. CPU ${system.cpuPercent} percent. ` +
          `Memory ${system.memoryPercent} percent. ` +
          `Uptime ${formatUptime(system.uptime)}.`;

        setProvider("JARVIS LOCAL CORE");
        setAnswer(message);

        if (speakAfter) {
          await speakText(message, true);
        }

        return;
      }

      const detected = IS_LOCAL
        ? detectCommand(value)
        : null;

      if (detected) {
        const message = await detected.action();

        setProvider("JARVIS LOCAL CORE");
        setAnswer(message);

        if (speakAfter) {
          await speakText(message, true);
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

      const message =
        data.answer || "I could not get a response.";

      setProvider(data.provider || "gemini");
      setAnswer(message);

      if (speakAfter) {
        await speakText(message, true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
      fetchSystem();
    }
  }

  async function submitPrompt(event) {
    event.preventDefault();
    await askJarvis(prompt, true);
  }

  function toggleListening() {
    if (!VOICE_SUPPORTED) {
      setError(
        "Voice input is not supported by this browser."
      );
      return;
    }

    if (listenModeRef.current) {
      listenModeRef.current = false;

      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore.
      }

      setListening(false);
      return;
    }

    listenModeRef.current = true;
    startListening();
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      activateJarvis();
    }, 700);

    return () => {
      clearTimeout(timer);
      listenModeRef.current = false;

      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore.
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <main className="jarvis-shell">
      <div className="grid-bg" />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      {needActivation && (
        <div className="activation-screen">
          <div className="activation-card">
            <div className="activation-orb">
              <Zap size={34} />
            </div>

            <span className="eyebrow">J.A.R.V.I.S.</span>

            <h2>CORE READY</h2>

            <p>
              Allow microphone access and activate the voice
              assistant.
            </p>

            <button
              className="activation-button"
              onClick={activateJarvis}
            >
              ACTIVATE JARVIS
            </button>
          </div>
        </div>
      )}

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
          {listening
            ? "LISTENING"
            : speaking
              ? "SPEAKING"
              : loading
                ? "THINKING"
                : "ONLINE"}
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
            <span>PERSONAL ASSISTANT</span>
          </div>

          <div className="orb-zone">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="orbit orbit-c" />

            <div
              className={`core-orb ${
                loading || listening || speaking ? "active" : ""
              }`}
            >
              <div className="core-orb-inner">
                <Zap size={42} strokeWidth={1.3} />
              </div>
            </div>

            <div className="core-readout">
              <span>JARVIS CORE</span>
              <strong>
                {listening
                  ? "LISTENING"
                  : speaking
                    ? "SPEAKING"
                    : loading
                      ? "THINKING"
                      : "STANDBY"}
              </strong>
            </div>
          </div>

          <div className="greeting">
            <div className="eyebrow">PERSONAL INTELLIGENCE</div>
            <h1>I'm online.</h1>

            <p>
              Talk naturally. I can answer questions, speak
              back to you, launch supported applications, monitor
              your system, and use your phone bridge.
            </p>
          </div>

          <form className="command-form" onSubmit={submitPrompt}>
            <div className="input-shell">
              <textarea
                value={prompt}
                onChange={(event) =>
                  setPrompt(event.target.value)
                }
                placeholder={
                  listening
                    ? "Listening..."
                    : "Talk to JARVIS..."
                }
                rows={3}
              />

              <div className="input-actions">
                <button
                  type="button"
                  className={`icon-button ${
                    listening ? "listening" : ""
                  }`}
                  onClick={toggleListening}
                  title="Voice mode"
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
                  {loading ? "THINKING" : "ASK JARVIS"}
                </button>
              </div>
            </div>
          </form>

          {error && <div className="error-box">{error}</div>}

          {answer && (
            <div className="answer-panel">
              <div className="answer-head">
                <div>
                  <span className="eyebrow">JARVIS RESPONSE</span>
                  <strong>{provider}</strong>
                </div>

                <button
                  type="button"
                  className="voice-button"
                  onClick={() => speakText(answer, true)}
                  disabled={speaking}
                >
                  <Volume2 size={16} />
                  {speaking ? "SPEAKING" : "REPLAY"}
                </button>
              </div>

              <div className="answer-text">{answer}</div>
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
                <span>CPU</span>
                <strong>{IS_LOCAL ? `${system.cpuPercent}%` : "--"}</strong>
              </div>

              <div className="metric">
                <Cpu size={17} />
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
              <span>CONTROL CENTER</span>
              <span>LOCAL</span>
            </div>

            <div className="action-grid">
              <button
                onClick={async () => {
                  try {
                    const message = await runAction("open_url", {
                      url: "https://www.google.com"
                    });
                    setAnswer(message);
                    setProvider("JARVIS LOCAL CORE");
                    await speakText(message, true);
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                disabled={!IS_LOCAL}
              >
                <Globe2 />
                <span>Browser</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const message = await runAction("terminal");
                    setAnswer(message);
                    setProvider("JARVIS LOCAL CORE");
                    await speakText(message, true);
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                disabled={!IS_LOCAL}
              >
                <Terminal />
                <span>Terminal</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const message = await runAction("files");
                    setAnswer(message);
                    setProvider("JARVIS LOCAL CORE");
                    await speakText(message, true);
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                disabled={!IS_LOCAL}
              >
                <FolderOpen />
                <span>Files</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const message = await runAction("vscode");
                    setAnswer(message);
                    setProvider("JARVIS LOCAL CORE");
                    await speakText(message, true);
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                disabled={!IS_LOCAL}
              >
                <Code2 />
                <span>VS Code</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const message =
                      await readPhoneNotifications();

                    setAnswer(message);
                    setProvider("JARVIS PHONE CORE");
                    await speakText(message, true);
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                disabled={!IS_LOCAL}
              >
                <Phone />
                <span>Phone</span>
              </button>

              <button
                onClick={toggleListening}
                disabled={!VOICE_SUPPORTED}
              >
                {listening ? <MicOff /> : <Mic />}
                <span>
                  {listening
                    ? "Stop Listening"
                    : "Voice Mode"}
                </span>
              </button>
            </div>
          </div>

          <div className="panel security-panel">
            <ShieldCheck size={17} />

            <div>
              <strong>USER-LEVEL CONTROL</strong>
              <span>
                JARVIS runs as your normal Fedora user. No
                root privileges are used.
              </span>
            </div>
          </div>
        </aside>
      </section>

      <footer className="jarvis-footer">
        <span>J.A.R.V.I.S. // PERSONAL INTELLIGENCE SYSTEM</span>
        <span>GEMINI + ELEVENLABS + KDE CONNECT</span>
        <span>
          {listening ? "VOICE LINK ACTIVE" : "CORE ONLINE"}
        </span>
      </footer>
    </main>
  );
}
