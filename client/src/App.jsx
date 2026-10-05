import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://ai-api-playground.onrender.com";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendPrompt(e) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      setProvider(data.provider);
      setAnswer(data.answer);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">AI API PLAYGROUND</div>
        <h1>Build. Connect. Deploy.</h1>
        <p>
          React frontend → Express backend → AI API.
          Your API key stays on the server.
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

          <button type="submit" disabled={loading || !prompt.trim()}>
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
          </div>
        )}
      </section>

      <footer>
        Keep secrets in <code>server/.env</code> — never commit API keys.
      </footer>
    </main>
  );
}
