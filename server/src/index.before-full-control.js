import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import os from "node:os";
import { spawn } from "node:child_process";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://ai-api-playground.vercel.app",
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS origin not allowed"));
      }
    }
  })
);

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
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!key) {
    throw new Error("GEMINI_API_KEY is missing in server/.env");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Gemini API request failed"
    );
  }

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No response text returned."
  );
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  if (!key) {
    throw new Error("GROQ_API_KEY is missing in server/.env");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Groq API request failed"
    );
  }

  return (
    data?.choices?.[0]?.message?.content ||
    "No response text returned."
  );
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  if (!key) {
    throw new Error("OPENROUTER_API_KEY is missing in server/.env");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer":
          process.env.CLIENT_URL || "http://localhost:5173",
        "X-Title": "AI API Playground"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "OpenRouter API request failed"
    );
  }

  return (
    data?.choices?.[0]?.message?.content ||
    "No response text returned."
  );
}

async function callElevenLabs(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId =
    process.env.ELEVENLABS_VOICE_ID ||
    "JBFqnCBsd6RMkjVDRZzb";
  const model =
    process.env.ELEVENLABS_MODEL ||
    "eleven_multilingual_v2";

  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is missing in server/.env"
    );
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      voiceId
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key,
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: model
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    let message = "ElevenLabs TTS request failed.";

    try {
      const errorData = JSON.parse(errorText);
      message =
        errorData?.detail?.message ||
        errorData?.detail ||
        message;
    } catch {
      if (errorText) {
        message = errorText;
      }
    }

    throw new Error(message);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}


// ===== JARVIS LOCAL CONTROL =====

function requireLocalAssistant() {
  if (process.env.LOCAL_ASSISTANT !== "true") {
    const error = new Error(
      "Local laptop controls are disabled on this server."
    );
    error.statusCode = 403;
    throw error;
  }
}

function launch(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });

    child.once("error", reject);

    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

app.get("/api/system", (_req, res) => {
  try {
    requireLocalAssistant();

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const cpuCount = os.cpus().length || 1;
    const load = os.loadavg()[0] || 0;

    res.json({
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      cpuPercent: Math.min(
        100,
        Math.round((load / cpuCount) * 100)
      ),
      memoryPercent: Math.round(
        (usedMemory / totalMemory) * 100
      ),
      totalMemory,
      usedMemory,
      uptime: os.uptime()
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message
    });
  }
});

app.post("/api/action", async (req, res) => {
  try {
    requireLocalAssistant();

    const action = String(req.body?.action || "");
    const url = String(req.body?.url || "");

    if (action === "open_url") {
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({
          error: "Only http/https URLs are allowed."
        });
      }

      await launch("xdg-open", [url]);

      return res.json({
        ok: true,
        message: "Opening the requested website."
      });
    }

    if (action === "terminal") {
      const terminal = ["ptyxis", "kgx", "gnome-terminal"].find(
        (cmd) => {
          try {
            const result = spawn(cmd, ["--version"], {
              stdio: "ignore"
            });

            return !!result;
          } catch {
            return false;
          }
        }
      );

      if (!terminal) {
        return res.status(500).json({
          error: "No supported terminal application found."
        });
      }

      await launch(terminal);

      return res.json({
        ok: true,
        message: "Terminal launched."
      });
    }

    if (action === "files") {
      await launch("xdg-open", [
        `${os.homedir()}/Downloads`
      ]);

      return res.json({
        ok: true,
        message: "Downloads folder opened."
      });
    }

    if (action === "vscode") {
      await launch("code", [
        process.cwd()
      ]);

      return res.json({
        ok: true,
        message: "Visual Studio Code launched."
      });
    }

    if (action === "settings") {
      await launch("gnome-control-center");

      return res.json({
        ok: true,
        message: "System settings launched."
      });
    }

    return res.status(400).json({
      error: `Unsupported local action: ${action}`
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message || "Local action failed."
    });
  }
});


// ===== JARVIS PHONE BRIDGE =====

function runKdeConnect(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("kdeconnect-cli", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              `kdeconnect-cli exited with code ${code}`
          )
        );
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function phoneDeviceId() {
  const id = process.env.KDE_CONNECT_DEVICE_ID;

  if (!id) {
    const error = new Error(
      "KDE_CONNECT_DEVICE_ID is missing in server/.env"
    );
    error.statusCode = 500;
    throw error;
  }

  return id;
}

app.get("/api/phone/notifications", async (_req, res) => {
  try {
    requireLocalAssistant();

    const output = await runKdeConnect([
      "--device",
      phoneDeviceId(),
      "--list-notifications"
    ]);

    const notifications = output
      ? output
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const clean = line.replace(/^- /, "");
            const index = clean.indexOf(": ");

            if (index === -1) {
              return {
                app: "Phone",
                text: clean
              };
            }

            return {
              app: clean.slice(0, index),
              text: clean.slice(index + 2)
            };
          })
      : [];

    res.json({
      ok: true,
      notifications
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error:
        error.message ||
        "Could not read phone notifications."
    });
  }
});

app.post("/api/phone/sms", async (req, res) => {
  try {
    requireLocalAssistant();

    const destination = String(
      req.body?.destination || ""
    ).trim();

    const text = String(req.body?.text || "").trim();

    if (!/^\+?[0-9][0-9 -]{6,20}$/.test(destination)) {
      return res.status(400).json({
        error: "Invalid phone number."
      });
    }

    if (!text || text.length > 1000) {
      return res.status(400).json({
        error: "SMS text must be between 1 and 1000 characters."
      });
    }

    await runKdeConnect([
      "--device",
      phoneDeviceId(),
      "--send-sms",
      text,
      "--destination",
      destination
    ]);

    res.json({
      ok: true,
      message: "SMS sent successfully."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error:
        error.message ||
        "SMS could not be sent."
    });
  }
});

app.post("/api/phone/ring", async (_req, res) => {
  try {
    requireLocalAssistant();

    await runKdeConnect([
      "--device",
      phoneDeviceId(),
      "--ring"
    ]);

    res.json({
      ok: true,
      message: "Your phone is ringing."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error:
        error.message ||
        "Could not ring the phone."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    const provider = (
      process.env.AI_PROVIDER || "gemini"
    ).toLowerCase();

    let answer;

    if (provider === "gemini") {
      answer = await callGemini(prompt);
    } else if (provider === "groq") {
      answer = await callGroq(prompt);
    } else if (provider === "openrouter") {
      answer = await callOpenRouter(prompt);
    } else {
      return res.status(400).json({
        error: `Unsupported AI_PROVIDER: ${provider}`
      });
    }

    res.json({
      provider,
      answer
    });
  } catch (error) {
    console.error("CHAT ERROR:", error);

    res.status(500).json({
      error: error.message || "Something went wrong."
    });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();

    if (!text) {
      return res.status(400).json({
        error: "Text is required."
      });
    }

    const audio = await callElevenLabs(text);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "no-store");

    res.send(audio);
  } catch (error) {
    console.error("TTS ERROR:", error);

    res.status(500).json({
      error:
        error.message ||
        "ElevenLabs speech generation failed."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `API server running on http://localhost:${PORT}`
  );
});
