import crypto from "node:crypto";
import express from "express";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const AGENT_PORT = Number(process.env.JARVIS_DESKTOP_AGENT_PORT || 8766);
const AGENT_HOST = "127.0.0.1";
const AGENT_TOKEN = crypto.randomBytes(32).toString("hex");
const RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || os.tmpdir();
const RUNTIME_FILE = path.join(RUNTIME_DIR, "jarvis-desktop-agent.json");
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HOME_DIRECTORY = os.homedir();
const MAX_OUTPUT_LENGTH = 16_000;
const MAX_COMMAND_TIMEOUT = 300_000;
const pendingConfirmations = new Map();
const actionLog = [];

const APP_ALIASES = {
  browser: ["firefox", "google-chrome", "chromium", "chromium-browser"],
  firefox: ["firefox"],
  chrome: ["google-chrome", "google-chrome-stable", "chromium"],
  chromium: ["chromium", "chromium-browser"],
  vscode: ["code", "code-insiders"],
  terminal: ["ptyxis", "kgx", "gnome-terminal", "konsole"],
  files: ["nautilus", "dolphin", "thunar"],
  settings: ["gnome-control-center", "systemsettings"],
  calculator: ["gnome-calculator", "kcalc"],
  libreoffice: ["libreoffice"],
  spotify: ["spotify"],
};

const DESTRUCTIVE_COMMAND = /(?:^|[;&|]\s*)(?:sudo|su|doas|pkexec)\b|\b(?:shutdown|reboot|poweroff|halt|logout)\b|\b(?:mkfs|fdisk|parted|wipefs)\b|\brm\s+(?:-[^\s]*r[^\s]*|--recursive)\b|\b(?:dnf|apt(?:-get)?|rpm)\s+(?:remove|erase|purge)\b|\b(?:chown|chmod)\s+-R\b/i;

function redact(value) {
  return String(value || "")
    .replace(
      /\b(api[_-]?key|token|secret|password|authorization)\s*([:=])\s*([^\s,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .slice(0, MAX_OUTPUT_LENGTH);
}

function summary(value) {
  const text = redact(value).trim();
  return text.length > 1_200 ? `${text.slice(0, 1_200)}…` : text;
}

function commandResult(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env || process.env,
        timeout: options.timeout || 10_000,
        maxBuffer: MAX_OUTPUT_LENGTH * 2,
      },
      (error, stdout = "", stderr = "") => {
        resolve({
          ok: !error,
          exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          error: error?.message || "",
        });
      },
    );
  });
}

function ensureString(value, name, limit = 4_000) {
  if (typeof value !== "string" || !value.trim() || value.length > limit || value.includes("\0")) {
    throw new Error(`${name} must be a non-empty text value.`);
  }
  return value.trim();
}

function ensureArgs(args) {
  if (args === undefined) return [];
  if (!Array.isArray(args) || args.length > 80) throw new Error("Application arguments are invalid.");
  return args.map((arg) => ensureString(String(arg), "Application argument", 2_000));
}

function resolveUserPath(value) {
  const input = ensureString(value, "Path", 8_000);
  const resolved = path.resolve(input.startsWith("~") ? path.join(HOME_DIRECTORY, input.slice(1)) : input);
  const allowed = resolved === HOME_DIRECTORY || resolved.startsWith(`${HOME_DIRECTORY}${path.sep}`)
    || resolved === PROJECT_ROOT || resolved.startsWith(`${PROJECT_ROOT}${path.sep}`);

  if (!allowed) {
    throw new Error("Paths must be inside the current user's home directory or this project.");
  }
  return resolved;
}

function findExecutable(name) {
  if (!/^[a-zA-Z0-9._+-]+$/.test(name)) return null;
  const directories = String(process.env.PATH || "").split(path.delimiter);
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    try {
      // accessSync is avoided so a broken PATH entry cannot crash the agent.
      const stat = fsSync.statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111)) return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

function availableApplications() {
  const apps = [];
  for (const [id, candidates] of Object.entries(APP_ALIASES)) {
    const executable = candidates.map(findExecutable).find(Boolean);
    if (executable) apps.push({ id, executable, command: path.basename(executable) });
  }
  return apps;
}

async function launch(command, args = []) {
  const executable = findExecutable(command) || (path.isAbsolute(command) ? command : null);
  if (!executable) throw new Error(`Application '${command}' is not installed or not on PATH.`);

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, stdio: "ignore", env: process.env });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve({ pid: child.pid, executable });
    });
  });
}

async function runTerminal(command, cwd, { timeoutMs } = {}) {
  const safeCommand = ensureString(command, "Command", 12_000);
  if (DESTRUCTIVE_COMMAND.test(safeCommand)) {
    return { confirmationRequired: true, reason: "This command can alter system state or privileges." };
  }

  const workingDirectory = cwd ? resolveUserPath(cwd) : PROJECT_ROOT;
  const started = Date.now();
  const result = await commandResult("/bin/bash", ["-lc", safeCommand], {
    cwd: workingDirectory,
    timeout: Math.min(Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 60_000, MAX_COMMAND_TIMEOUT),
  });

  return {
    ok: result.ok,
    command: redact(safeCommand),
    cwd: workingDirectory,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    stdout: summary(result.stdout),
    stderr: summary(result.stderr || result.error),
  };
}

async function gdbusCall(destination, objectPath, method, args = []) {
  const result = await commandResult("gdbus", [
    "call",
    "--session",
    "--dest",
    destination,
    "--object-path",
    objectPath,
    "--method",
    method,
    ...args,
  ]);
  if (!result.ok) throw new Error(summary(result.stderr || result.error || "D-Bus action failed."));
  return result.stdout.trim();
}

async function extensionAvailable() {
  try {
    await gdbusCall("org.jarvis.Desktop", "/org/jarvis/Desktop", "org.jarvis.Desktop.Status");
    return true;
  } catch {
    return false;
  }
}

async function extensionCall(method, args = []) {
  if (!(await extensionAvailable())) {
    throw new Error(
      "GNOME input bridge is unavailable. Install and enable the bundled JARVIS GNOME extension first.",
    );
  }
  return gdbusCall("org.jarvis.Desktop", "/org/jarvis/Desktop", `org.jarvis.Desktop.${method}`, args);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function captureScreen() {
  const destination = path.join(RUNTIME_DIR, `jarvis-screen-${Date.now()}.png`);
  const output = await gdbusCall(
    "org.gnome.Shell",
    "/org/gnome/Shell/Screenshot",
    "org.gnome.Shell.Screenshot.Screenshot",
    ["false", "false", shellQuote(destination)],
  );

  if (!/true/i.test(output)) throw new Error(`GNOME did not capture the screen: ${output}`);
  const stat = await fs.stat(destination);
  return { path: destination, bytes: stat.size, message: "Screenshot captured from the current GNOME session." };
}

function parseKeyCombo(value) {
  const combo = ensureString(value, "Key combination", 120)
    .replace(/\s+/g, "")
    .split("+")
    .filter(Boolean);
  if (!combo.length || combo.length > 6) throw new Error("Key combination is invalid.");
  return combo;
}

async function systemStatus() {
  const [disk, network, bluetooth, processes] = await Promise.all([
    commandResult("df", ["-h", HOME_DIRECTORY]),
    commandResult("nmcli", ["-t", "-f", "STATE,CONNECTIVITY", "general"]),
    commandResult("bluetoothctl", ["show"]),
    commandResult("ps", ["-eo", "pid,comm,%mem,%cpu", "--sort=-%mem"]),
  ]);

  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    kernel: os.release(),
    architecture: os.arch(),
    uptimeSeconds: Math.round(os.uptime()),
    cpuCores: os.cpus().length,
    loadAverage: os.loadavg(),
    memory: { total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() },
    session: { type: process.env.XDG_SESSION_TYPE || "unknown", desktop: process.env.XDG_CURRENT_DESKTOP || "unknown" },
    disk: summary(disk.stdout),
    network: summary(network.stdout),
    bluetooth: summary(bluetooth.stdout || bluetooth.stderr),
    topProcesses: summary(processes.stdout),
  };
}

async function mediaControl(action) {
  if (action === "volume_up" || action === "volume_down") {
    const amount = action === "volume_up" ? "+5%" : "-5%";
    const result = await commandResult("pactl", ["set-sink-volume", "@DEFAULT_SINK@", amount]);
    if (!result.ok) throw new Error(summary(result.stderr || result.error));
    return { message: action === "volume_up" ? "Volume increased." : "Volume decreased." };
  }
  if (action === "mute") {
    const result = await commandResult("pactl", ["set-sink-mute", "@DEFAULT_SINK@", "toggle"]);
    if (!result.ok) throw new Error(summary(result.stderr || result.error));
    return { message: "Audio mute toggled." };
  }
  const executable = findExecutable("playerctl");
  if (!executable) throw new Error("playerctl is not installed, so media playback control is unavailable.");
  const result = await commandResult(executable, [action]);
  if (!result.ok) throw new Error(summary(result.stderr || result.error));
  return { message: `Media action '${action}' completed.` };
}

const TOOL_REGISTRY = {
  "system.status": {
    description: "Read real CPU, RAM, disk, network, Bluetooth, session, and top-process information.",
    execute: () => systemStatus(),
  },
  "app.list": {
    description: "List supported installed desktop applications detected on this computer.",
    execute: () => ({ applications: availableApplications() }),
  },
  "app.launch": {
    description: "Launch an installed application after detecting its executable. Use a known id or an executable name.",
    execute: async ({ app, executable, args }) => {
      const requested = ensureString(app || executable, "Application", 120).toLowerCase();
      const known = availableApplications().find((entry) => entry.id === requested);
      const command = known?.command || requested;
      const launched = await launch(command, ensureArgs(args));
      return { message: `${known?.id || command} launched.`, ...launched };
    },
  },
  "browser.open": {
    description: "Open an http or https URL in the user's default browser.",
    execute: async ({ url }) => {
      const target = ensureString(url, "URL", 4_000);
      if (!/^https?:\/\//i.test(target)) throw new Error("Only http and https URLs can be opened.");
      const launched = await launch("xdg-open", [target]);
      return { message: "Browser launch request completed.", ...launched };
    },
  },
  "browser.search": {
    description: "Perform a real web search in the default browser.",
    execute: ({ query }) => TOOL_REGISTRY["browser.open"].execute({
      url: `https://www.google.com/search?q=${encodeURIComponent(ensureString(query, "Search query", 500))}`,
    }),
  },
  "file.list": {
    description: "List files and folders in a user-owned directory.",
    execute: async ({ path: requestedPath = HOME_DIRECTORY }) => {
      const directory = resolveUserPath(requestedPath);
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return {
        path: directory,
        entries: entries.slice(0, 300).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" })),
      };
    },
  },
  "file.read": {
    description: "Read a text file available to the current user.",
    execute: async ({ path: requestedPath }) => {
      const target = resolveUserPath(requestedPath);
      const data = await fs.readFile(target, "utf8");
      if (data.includes("\0")) throw new Error("This appears to be a binary file.");
      return { path: target, text: redact(data).slice(0, MAX_OUTPUT_LENGTH) };
    },
  },
  "file.create": {
    description: "Create a text file in the current user's home directory or project.",
    execute: async ({ path: requestedPath, text = "" }) => {
      const target = resolveUserPath(requestedPath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(text), { encoding: "utf8", flag: "wx" });
      return { message: "File created.", path: target };
    },
  },
  "file.mkdir": {
    description: "Create a folder in the current user's home directory or project.",
    execute: async ({ path: requestedPath }) => {
      const target = resolveUserPath(requestedPath);
      await fs.mkdir(target, { recursive: false });
      return { message: "Folder created.", path: target };
    },
  },
  "file.copy": {
    description: "Copy a file or folder without overwriting an existing destination.",
    execute: async ({ source, destination }) => {
      const from = resolveUserPath(source);
      const to = resolveUserPath(destination);
      await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
      return { message: "Copy completed.", source: from, destination: to };
    },
  },
  "file.move": {
    description: "Move or rename a file or folder without overwriting an existing destination.",
    execute: async ({ source, destination }) => {
      const from = resolveUserPath(source);
      const to = resolveUserPath(destination);
      await fs.access(to).then(() => { throw new Error("Destination already exists."); }).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      await fs.rename(from, to);
      return { message: "Move completed.", source: from, destination: to };
    },
  },
  "file.open": {
    description: "Open a user file or folder in its normal desktop application.",
    execute: async ({ path: requestedPath }) => {
      const target = resolveUserPath(requestedPath);
      await fs.access(target);
      const launched = await launch("xdg-open", [target]);
      return { message: "Open request completed.", path: target, ...launched };
    },
  },
  "file.search": {
    description: "Search the user's files by name using ripgrep's file index.",
    execute: async ({ query, path: requestedPath = HOME_DIRECTORY }) => {
      const base = resolveUserPath(requestedPath);
      const needle = ensureString(query, "Search query", 300).toLowerCase();
      const result = await commandResult("rg", ["--files", base], { timeout: 30_000 });
      if (!result.ok && result.exitCode !== 1) throw new Error(summary(result.stderr || result.error));
      return {
        path: base,
        matches: result.stdout.split("\n").filter((item) => item.toLowerCase().includes(needle)).slice(0, 100),
      };
    },
  },
  "terminal.run": {
    description: "Run a normal non-root terminal command as the current user and return its actual exit code and redacted output.",
    execute: ({ command, cwd, timeoutMs }) => runTerminal(command, cwd, { timeoutMs }),
  },
  "screen.capture": {
    description: "Capture the actual current GNOME desktop screen to a temporary PNG.",
    execute: () => captureScreen(),
  },
  "input.type": {
    description: "Type arbitrary text into the currently focused application through the enabled GNOME input bridge.",
    execute: async ({ text }) => {
      const value = ensureString(text, "Text", 8_000);
      await extensionCall("TypeText", [shellQuote(value)]);
      return { message: "Text was sent to the focused application." };
    },
  },
  "input.key": {
    description: "Press a normal keyboard key, function key, or navigation key.",
    execute: async ({ key }) => {
      await extensionCall("PressKey", [shellQuote(ensureString(key, "Key", 80))]);
      return { message: "Key press sent." };
    },
  },
  "input.combo": {
    description: "Press a keyboard shortcut such as Ctrl+Shift+P or Super+Tab.",
    execute: async ({ combo }) => {
      await extensionCall("PressCombo", [shellQuote(parseKeyCombo(combo).join("+"))]);
      return { message: "Key combination sent." };
    },
  },
  "input.mouse": {
    description: "Move, click, double-click, scroll, or drag the pointer using the enabled GNOME input bridge.",
    execute: async ({ action, x, y, button = 1, deltaX = 0, deltaY = 0, toX, toY }) => {
      const mouseAction = ensureString(action, "Mouse action", 40);
      const numeric = (value, name) => {
        if (!Number.isFinite(Number(value))) throw new Error(`${name} must be a number.`);
        return String(Math.round(Number(value)));
      };
      if (mouseAction === "move") await extensionCall("MovePointer", [numeric(x, "x"), numeric(y, "y")]);
      else if (mouseAction === "click" || mouseAction === "double_click") {
        await extensionCall("MovePointer", [numeric(x, "x"), numeric(y, "y")]);
        await extensionCall("Click", [numeric(button, "button"), mouseAction === "double_click" ? "2" : "1"]);
      } else if (mouseAction === "scroll") {
        await extensionCall("Scroll", [numeric(deltaX, "deltaX"), numeric(deltaY, "deltaY")]);
      } else if (mouseAction === "drag") {
        await extensionCall("Drag", [numeric(x, "x"), numeric(y, "y"), numeric(toX, "toX"), numeric(toY, "toY"), numeric(button, "button")]);
      } else throw new Error("Unsupported mouse action.");
      return { message: `Mouse ${mouseAction.replace("_", " ")} sent.` };
    },
  },
  "window.list": {
    description: "List current desktop windows through the enabled GNOME input bridge.",
    execute: async () => ({ windows: await extensionCall("ListWindows") }),
  },
  "window.control": {
    description: "Focus, minimize, maximize, restore, close, move, or resize a known desktop window through the enabled GNOME input bridge.",
    execute: async ({ action, windowId, x, y, width, height }) => {
      const operation = ensureString(action, "Window action", 40);
      const identifier = ensureString(String(windowId), "Window id", 80);
      await extensionCall("WindowControl", [shellQuote(operation), shellQuote(identifier), String(Math.round(Number(x || 0))), String(Math.round(Number(y || 0))), String(Math.round(Number(width || 0))), String(Math.round(Number(height || 0)))]);
      return { message: `Window ${operation} sent.` };
    },
  },
  "media.control": {
    description: "Control volume, mute, playback, or track navigation using installed user-session tools.",
    execute: ({ action }) => mediaControl(ensureString(action, "Media action", 40)),
  },
};

function capabilities() {
  return Object.entries(TOOL_REGISTRY).map(([name, definition]) => ({ name, description: definition.description }));
}

function requiresConfirmation(tool, input) {
  if (tool === "terminal.run" && DESTRUCTIVE_COMMAND.test(String(input.command || ""))) return true;
  return tool === "file.delete" || tool === "system.power";
}

async function executeTool(tool, input = {}, confirmed = false) {
  const definition = TOOL_REGISTRY[tool];
  if (!definition) throw new Error(`Unknown desktop tool '${tool}'.`);
  if (!confirmed && requiresConfirmation(tool, input)) {
    const id = crypto.randomUUID();
    pendingConfirmations.set(id, { tool, input, expiresAt: Date.now() + 120_000 });
    return { ok: false, confirmationRequired: true, confirmationId: id, message: "Confirmation is required before this destructive action." };
  }

  const started = Date.now();
  try {
    const data = await definition.execute(input);
    const record = { at: new Date().toISOString(), tool, input: redact(JSON.stringify(input)), ok: data?.ok !== false, durationMs: Date.now() - started };
    actionLog.unshift(record);
    actionLog.splice(50);
    console.info("[JARVIS desktop]", JSON.stringify(record));
    return { ok: data?.ok !== false, tool, data };
  } catch (error) {
    const record = { at: new Date().toISOString(), tool, input: redact(JSON.stringify(input)), ok: false, durationMs: Date.now() - started, error: summary(error?.message || error) };
    actionLog.unshift(record);
    actionLog.splice(50);
    console.error("[JARVIS desktop]", JSON.stringify(record));
    return { ok: false, tool, error: record.error };
  }
}

function requireLocalToken(req, res, next) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const provided = Buffer.from(token);
  const expected = Buffer.from(AGENT_TOKEN);
  if (!token || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ ok: false, error: "Desktop agent authorization failed." });
  }
  return next();
}

async function writeRuntimeFile() {
  await fs.writeFile(
    RUNTIME_FILE,
    `${JSON.stringify({ host: AGENT_HOST, port: AGENT_PORT, token: AGENT_TOKEN, pid: process.pid, projectRoot: PROJECT_ROOT })}\n`,
    { mode: 0o600 },
  );
  await fs.chmod(RUNTIME_FILE, 0o600);
}

if (typeof process.getuid === "function" && process.getuid() === 0) {
  throw new Error("JARVIS desktop agent refuses to run as root. Start it from the normal desktop user session.");
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(requireLocalToken);

app.get("/status", async (_req, res) => {
  res.json({
    ok: true,
    user: os.userInfo().username,
    sessionType: process.env.XDG_SESSION_TYPE || "unknown",
    desktop: process.env.XDG_CURRENT_DESKTOP || "unknown",
    inputBridge: await extensionAvailable(),
    capabilities: capabilities(),
    recentActions: actionLog,
  });
});

app.get("/capabilities", (_req, res) => res.json({ ok: true, capabilities: capabilities() }));

app.post("/execute", async (req, res) => {
  const tool = ensureString(req.body?.tool, "Tool", 120);
  const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
  res.json(await executeTool(tool, input));
});

app.post("/confirm", async (req, res) => {
  const id = ensureString(req.body?.confirmationId, "Confirmation id", 100);
  const pending = pendingConfirmations.get(id);
  pendingConfirmations.delete(id);
  if (!pending || pending.expiresAt < Date.now()) {
    return res.status(404).json({ ok: false, error: "That confirmation has expired." });
  }
  res.json(await executeTool(pending.tool, pending.input, true));
});

const server = app.listen(AGENT_PORT, AGENT_HOST, async () => {
  await writeRuntimeFile();
  console.info(`[JARVIS desktop] listening on http://${AGENT_HOST}:${AGENT_PORT} as ${os.userInfo().username}`);
  console.info(`[JARVIS desktop] session=${process.env.XDG_SESSION_TYPE || "unknown"} inputBridge=${await extensionAvailable()}`);
});

async function shutdown() {
  await fs.unlink(RUNTIME_FILE).catch(() => {});
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
