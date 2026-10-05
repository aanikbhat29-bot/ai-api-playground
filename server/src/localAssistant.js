import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const PROJECT_ROOT = path.resolve(
  process.env.JARVIS_PROJECT_ROOT || path.join(process.cwd(), "..", "client")
);

function launch(command, args = []) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
}

function launchAny(commands, args = []) {
  for (const command of commands) {
    try {
      launch(command, args);
      return command;
    } catch {
      // Try the next known-safe executable.
    }
  }
  throw new Error("No supported desktop application was found.");
}

function checkedUrl(value) {
  const url = String(value || "").trim();

  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Only http/https URLs are allowed.");
  }

  return url;
}

export function registerLocalAssistant(app) {
  app.get("/api/local/status", (_req, res) => {
    res.json({
      enabled: process.env.LOCAL_ASSISTANT === "true",
      hostname: os.hostname(),
      platform: process.platform,
      home: os.homedir(),
      projectRoot: PROJECT_ROOT
    });
  });

  app.post("/api/local/action", (req, res) => {
    if (process.env.LOCAL_ASSISTANT !== "true") {
      return res.status(403).json({
        ok: false,
        error: "Local assistant is disabled."
      });
    }

    const action = String(req.body?.action || "").trim();
    const value = String(req.body?.value || "").trim();

    try {
      switch (action) {
        case "open_url":
          launch("xdg-open", [checkedUrl(value)]);
          return res.json({
            ok: true,
            message: "Opening the requested page."
          });

        case "youtube_search": {
          const query = encodeURIComponent(value);
          launch("xdg-open", [
            `https://www.youtube.com/results?search_query=${query}`
          ]);
          return res.json({
            ok: true,
            message: `Searching YouTube for ${value}.`
          });
        }

        case "search_web": {
          const query = encodeURIComponent(value);
          launch("xdg-open", [
            `https://www.google.com/search?q=${query}`
          ]);
          return res.json({
            ok: true,
            message: `Searching the web for ${value}.`
          });
        }

        case "open_files":
          launch("xdg-open", [os.homedir()]);
          return res.json({
            ok: true,
            message: "Opening your files."
          });

        case "open_downloads":
          launch("xdg-open", [
            path.join(os.homedir(), "Downloads")
          ]);
          return res.json({
            ok: true,
            message: "Opening Downloads."
          });

        case "open_vscode":
          launch("code", [PROJECT_ROOT]);
          return res.json({
            ok: true,
            message: "Opening VS Code."
          });

        case "open_settings":
          launch("gnome-control-center");
          return res.json({
            ok: true,
            message: "Opening system settings."
          });

        case "open_terminal":
          launchAny(
            ["kgx", "gnome-terminal", "konsole"],
            []
          );
          return res.json({
            ok: true,
            message: "Opening the terminal."
          });

        case "volume_up":
          launch("pactl", [
            "set-sink-volume",
            "@DEFAULT_SINK@",
            "+5%"
          ]);
          return res.json({
            ok: true,
            message: "Volume increased."
          });

        case "volume_down":
          launch("pactl", [
            "set-sink-volume",
            "@DEFAULT_SINK@",
            "-5%"
          ]);
          return res.json({
            ok: true,
            message: "Volume decreased."
          });

        case "mute":
          launch("pactl", [
            "set-sink-mute",
            "@DEFAULT_SINK@",
            "toggle"
          ]);
          return res.json({
            ok: true,
            message: "Audio mute toggled."
          });

        case "lock_screen":
          launch("loginctl", [
            "lock-session"
          ]);
          return res.json({
            ok: true,
            message: "Locking the screen."
          });

        default:
          return res.status(400).json({
            ok: false,
            error: "Unsupported local action."
          });
      }
    } catch (error) {
      console.error("LOCAL ACTION:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Local action failed."
      });
    }
  });
}
