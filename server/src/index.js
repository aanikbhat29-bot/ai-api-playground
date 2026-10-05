import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173"
}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-api-playground-server",
    provider: process.env.AI_PROVIDER || "gemini"
  });
});

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!key) throw new Error("GEMINI_API_KEY is missing in server/.env");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini API request failed");
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response text returned.";
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  if (!key) throw new Error("GROQ_API_KEY is missing in server/.env");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Groq API request failed");
  }

  return data?.choices?.[0]?.message?.content || "No response text returned.";
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  if (!key) throw new Error("OPENROUTER_API_KEY is missing in server/.env");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
      "X-Title": "AI API Playground"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenRouter API request failed");
  }

  return data?.choices?.[0]?.message?.content || "No response text returned.";
}

app.post("/api/chat", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
    let answer;

    if (provider === "gemini") answer = await callGemini(prompt);
    else if (provider === "groq") answer = await callGroq(prompt);
    else if (provider === "openrouter") answer = await callOpenRouter(prompt);
    else {
      return res.status(400).json({
        error: `Unsupported AI_PROVIDER: ${provider}`
      });
    }

    res.json({ provider, answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Something went wrong."
    });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
