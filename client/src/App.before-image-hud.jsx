import { useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://ai-api-playground.onrender.com");

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
  const [error, setError] = useState("");

  async function loadSystem() {
    try {
      const response = await fetch(`${API_URL}/api/system`);
      const data = await response.json();

      if (response.ok) {
        setSystem(data);
      }
    } catch {
      // telemetry unavailable
    }
  }

  useEffect(() => {
    loadSystem();
    const timer = setInterval(loadSystem, 1000);
    return () => clearInterval(timer);
  }, []);

  async function askJarvis(event) {
    event.preventDefault();

    if (!prompt.trim()) return;

    setStatus("THINKING");
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: prompt.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      setAnswer(data.answer);
      setStatus("ONLINE");
    } catch (err) {
      setError(err.message);
      setStatus("ERROR");
    }
  }

  return (
    <main className="hud-app">
      <div className="hud-background" />

      <header className="hud-top">
        <div className="hud-logo">
          <span className="logo-ring">◈</span>
          <div>
            <strong>J.A.R.V.I.S.</strong>
            <small>PERSONAL AI ASSISTANT</small>
          </div>
        </div>

        <nav>
          <span className="active">HOME</span>
          <span>SYSTEM</span>
          <span>APPLICATIONS</span>
          <span>PHONE</span>
          <span>RESEARCH</span>
          <span>SETTINGS</span>
        </nav>

        <div className="hud-clock">
          {new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })}
        </div>
      </header>

      <section className="hud-layout">
        <aside className="hud-left">
          <div className="hud-panel">
            <h3>SYSTEM TELEMETRY</h3>

            <div className="gauges">
              <div>
                <b>{system.cpuPercent}%</b>
                <span>CPU</span>
              </div>

              <div>
                <b>{system.memoryPercent}%</b>
                <span>RAM</span>
              </div>

              <div>
                <b>LIVE</b>
                <span>STATUS</span>
              </div>
            </div>

            <div className="system-lines">
              <p>
                HOST <strong>{system.hostname}</strong>
              </p>
              <p>
                KERNEL <strong>{system.platform}</strong>
              </p>
              <p>
                UPTIME{" "}
                <strong>
                  {Math.floor(system.uptime / 3600)}h{" "}
                  {Math.floor((system.uptime % 3600) / 60)}m
                </strong>
              </p>
            </div>
          </div>

          <div className="hud-panel quick">
            <h3>QUICK LAUNCH</h3>

            <button onClick={() => window.open("https://google.com", "_blank")}>
              ◉ BROWSER
            </button>

            <button>⌁ TERMINAL</button>
            <button>□ FILES</button>
            <button>⌘ VS CODE</button>
            <button>⚙ SETTINGS</button>
            <button>◉ PHONE</button>
          </div>
        </aside>

        <section className="hud-center">
          <div className={`reactor ${status.toLowerCase()}`}>
            <div className="reactor-ring ring1" />
            <div className="reactor-ring ring2" />
            <div className="reactor-ring ring3" />

            <div className="reactor-core">
              <span>⚡</span>
            </div>
          </div>

          <div className="core-status">
            JARVIS CORE
            <strong>{status}</strong>
          </div>

          <div className="hud-console">
            <div className="voice-icon">🎙</div>

            <form onSubmit={askJarvis}>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Talk to JARVIS..."
              />

              <button type="submit">
                ASK JARVIS
              </button>
            </form>

            <div className="wave">
              ───────╱╲╱╲╱╲╱╲───────
            </div>
          </div>

          {answer && (
            <div className="hud-response">
              <small>JARVIS RESPONSE</small>
              <p>{answer}</p>
            </div>
          )}

          {error && (
            <div className="hud-error">
              {error}
            </div>
          )}
        </section>

        <aside className="hud-right">
          <div className="hud-panel">
            <h3>PHONE BRIDGE</h3>

            <div className="phone-card">
              <strong>REDMI 13C 5G</strong>
              <span>● CONNECTED</span>
            </div>

            <div className="phone-actions">
              <button>♧ NOTIFICATIONS</button>
              <button>◉ RING PHONE</button>
              <button>✉ SEND SMS</button>
            </div>
          </div>

          <div className="hud-panel">
            <h3>ACTIVE MODULES</h3>

            <p>● Gemini AI <b>ONLINE</b></p>
            <p>● ElevenLabs <b>READY</b></p>
            <p>● KDE Connect <b>CONNECTED</b></p>
            <p>● Voice Core <b>READY</b></p>
          </div>

          <div className="hud-panel">
            <h3>MARK XLII</h3>
            <p className="online">SYSTEMS ONLINE</p>
          </div>
        </aside>
      </section>

      <footer className="hud-footer">
        STARK INDUSTRIES // J.A.R.V.I.S. // PERSONAL AI SYSTEM
      </footer>
    </main>
  );
}
