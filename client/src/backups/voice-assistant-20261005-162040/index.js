import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import os from "node:os";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";

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


function execCommand(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 2500 }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function readDisk() {
  return new Promise((resolve) => {
    execFile(
      "df",
      ["-k", "/"],
      { timeout: 2500 },
      (error, stdout) => {
        if (error) {
          resolve({
            total: 0,
            used: 0,
            available: 0,
            percent: 0
          });
          return;
        }

        const lines = stdout.trim().split("\n");

        if (lines.length < 2) {
          resolve({
            total: 0,
            used: 0,
            available: 0,
            percent: 0
          });
          return;
        }

        const parts = lines[1].trim().split(/\s+/);

        resolve({
          total: Number(parts[1] || 0) * 1024,
          used: Number(parts[2] || 0) * 1024,
          available: Number(parts[3] || 0) * 1024,
          percent: Number(
            String(parts[4] || "0").replace("%", "")
          )
        });
      }
    );
  });
}

function readNetwork() {
  try {
    const text = fs.readFileSync(
      "/proc/net/dev",
      "utf8"
    );

    let rx = 0;
    let tx = 0;

    for (const line of text.split("\n")) {
      if (!line.includes(":")) continue;

      const [iface, values] = line.split(":");
      const name = iface.trim();

      if (
        name === "lo" ||
        name.startsWith("docker") ||
        name.startsWith("veth")
      ) {
        continue;
      }

      const parts = values.trim().split(/\s+/);

      rx += Number(parts[0] || 0);
      tx += Number(parts[8] || 0);
    }

    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}


// JARVIS LIVE PHONE DATA

async function getPhoneBattery(deviceId) {
  if (!deviceId) {
    return {
      charge: null,
      charging: false
    };
  }

  try {
    const chargeOutput = await execCommand(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.kde.kdeconnect",
        "--object-path",
        `/modules/kdeconnect/devices/${deviceId}/battery`,
        "--method",
        "org.freedesktop.DBus.Properties.Get",
        "org.kde.kdeconnect.device.battery",
        "charge"
      ]
    );

    const chargingOutput = await execCommand(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.kde.kdeconnect",
        "--object-path",
        `/modules/kdeconnect/devices/${deviceId}/battery`,
        "--method",
        "org.freedesktop.DBus.Properties.Get",
        "org.kde.kdeconnect.device.battery",
        "isCharging"
      ]
    );

    const chargeMatch = chargeOutput.match(/(\d+)/);
    const charge = chargeMatch
      ? Number(chargeMatch[1])
      : null;

    return {
      charge,
      charging: /true/i.test(chargingOutput)
    };
  } catch {
    return {
      charge: null,
      charging: false
    };
  }
}

async function getPhoneNotifications(deviceId) {
  if (!deviceId) return [];

  try {
    const output = await execCommand(
      "kdeconnect-cli",
      [
        "--device",
        deviceId,
        "--list-notifications"
      ]
    );

    if (!output) return [];

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((line) => ({
        text: line.replace(/^-\s*/, "")
      }));
  } catch {
    return [];
  }
}

app.get("/api/dashboard", async (_req, res) => {
  try {
    requireLocalAssistant();

    const memoryTotal = os.totalmem();
    const memoryFree = os.freemem();
    const memoryUsed = memoryTotal - memoryFree;

    const cpuCount = os.cpus().length || 1;
    const load = os.loadavg()[0] || 0;

    const disk = await readDisk();
    const network = readNetwork();

    const deviceId =
      process.env.KDE_CONNECT_DEVICE_ID || "";

    let phone = {
      connected: false,
      name: "No phone",
      id: deviceId,
      battery: null,
      charging: false,
      notifications: []
    };

    if (deviceId) {
      const devices = await execCommand(
        "kdeconnect-cli",
        ["--list-devices"]
      );

      const phoneLine = devices
        .split("\n")
        .find((line) => line.includes(deviceId));

      if (phoneLine) {
        const match = phoneLine.match(
          /-\s(.+?):\s([a-f0-9]+)/
        );

        const battery =
          await getPhoneBattery(deviceId);

        const notifications =
          await getPhoneNotifications(deviceId);

        phone = {
          connected:
            phoneLine.includes("paired") &&
            phoneLine.includes("reachable"),
          name: match?.[1] || "Connected phone",
          id: deviceId,
          battery: battery.charge,
          charging: battery.charging,
          notifications
        };
      }
    }

    res.json({
      timestamp: Date.now(),

      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuPercent: Math.min(
          100,
          Math.round((load / cpuCount) * 100)
        ),
        cpuCores: cpuCount,
        memoryPercent: Math.round(
          (memoryUsed / memoryTotal) * 100
        ),
        memoryTotal,
        memoryUsed,
        uptime: os.uptime()
      },

      storage: {
        total: disk.total,
        used: disk.used,
        available: disk.available,
        percent: disk.percent
      },

      network,

      phone,

      modules: {
        gemini: Boolean(
          process.env.GEMINI_API_KEY
        ),
        elevenlabs: Boolean(
          process.env.ELEVENLABS_API_KEY
        ),
        kdeConnect: Boolean(
          deviceId
        )
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error:
        error.message ||
        "Dashboard data unavailable."
    });
  }
});


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

    if (action === "search_web") {
      const query = String(req.body?.query || "").trim();

      if (!query || query.length > 300) {
        return res.status(400).json({
          error: "Search query is invalid."
        });
      }

      await launch("xdg-open", [
        `https://www.google.com/search?q=${encodeURIComponent(query)}`
      ]);

      return res.json({
        ok: true,
        message: `Searching for ${query}.`
      });
    }

    if (action === "youtube_search") {
      const query = String(req.body?.query || "").trim();

      if (!query || query.length > 300) {
        return res.status(400).json({
          error: "YouTube search is invalid."
        });
      }

      await launch("xdg-open", [
        `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      ]);

      return res.json({
        ok: true,
        message: `Opening YouTube results for ${query}.`
      });
    }

    if (action === "volume_up") {
      await launch("pactl", [
        "set-sink-volume",
        "@DEFAULT_SINK@",
        "+10%"
      ]);

      return res.json({
        ok: true,
        message: "Volume increased."
      });
    }

    if (action === "volume_down") {
      await launch("pactl", [
        "set-sink-volume",
        "@DEFAULT_SINK@",
        "-10%"
      ]);

      return res.json({
        ok: true,
        message: "Volume decreased."
      });
    }

    if (action === "mute") {
      await launch("pactl", [
        "set-sink-mute",
        "@DEFAULT_SINK@",
        "toggle"
      ]);

      return res.json({
        ok: true,
        message: "Audio mute toggled."
      });
    }

    if (action === "ring_phone") {
      await runKdeConnect([
        "--device",
        phoneDeviceId(),
        "--ring"
      ]);

      return res.json({
        ok: true,
        message: "Your phone is ringing."
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


app.post("/api/speak-local", async (req, res) => {
  try {
    requireLocalAssistant();

    const text = String(req.body?.text || "").trim();

    if (!text) {
      return res.status(400).json({
        error: "Text is required."
      });
    }

    const audio = await callElevenLabs(text);

    const file = path.join(
      os.tmpdir(),
      `jarvis-${Date.now()}.mp3`
    );

    await writeFile(file, audio);

    await new Promise((resolve, reject) => {
      const player = spawn(
        "ffplay",
        [
          "-nodisp",
          "-autoexit",
          "-loglevel",
          "quiet",
          file
        ],
        {
          stdio: "ignore"
        }
      );

      player.once("error", reject);
      player.once("close", (code) => {
        if (code === 0) resolve();
        else reject(
          new Error(`Audio player exited with code ${code}`)
        );
      });
    });

    await unlink(file).catch(() => {});

    res.json({
      ok: true,
      message: "Speech completed."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error:
        error.message ||
        "Local speech playback failed."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `API server running on http://localhost:${PORT}`
  );
});
