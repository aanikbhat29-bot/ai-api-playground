import { useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://ai-api-playground.onrender.com";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  async function sendPrompt(e) {
    e.preventDefault();

    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setAudioUrl("");
    setSpeaking(false);

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

      setProvider(data.provider);
      setAnswer(data.answer);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function readAloud() {
    if (!answer || speaking) return;

    setSpeaking(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: answer
        })
      });

      if (!response.ok) {
        let message = "Text-to-speech request failed.";

        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // Keep default message.
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

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">AI API PLAYGROUND</div>

        <h1>Build. Connect. Deploy.</h1>

        <p>
          React frontend → Express backend → Gemini + ElevenLabs.
          Your API keys stay on the server.
        </p>
      </section>

      <section className="card">
        <form onSubmit={sendPrompt}>
          <label htmlFor="prompt">Your prompt</label>

          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask the AI something..."
            rows="7"
          />

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
          >
            {loading ? "Thinking..." : "Send to AI"}
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        {answer && (
          <div className="response">
            <div className="response-header">
              <span>Response</span>
              <small>{provider}</small>
            </div>

            <p>{answer}</p>

            <button
              type="button"
              onClick={readAloud}
              disabled={speaking}
            >
              {speaking ? "Generating voice..." : "🔊 Read Aloud"}
            </button>

            {audioUrl && (
              <audio
                controls
                autoPlay
                src={audioUrl}
                onEnded={() => setSpeaking(false)}
              />
            )}
          </div>
        )}
      </section>

      <footer>
        Keep secrets in <code>server/.env</code> — never commit API keys.
      </footer>
    </main>
  );
}
