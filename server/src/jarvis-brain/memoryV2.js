import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const HOME = os.homedir();
const DATA_DIR = path.join(HOME, ".jarvis");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s]+/gi
];

function sanitize(value) {
  let text = String(value ?? "");

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }

  return text.slice(0, 5000);
}

export class JarvisPersistentMemory {
  constructor() {
    this.turns = [];
    this.facts = {};
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;

    try {
      const raw = await readFile(MEMORY_FILE, "utf8");
      const data = JSON.parse(raw);

      this.turns = Array.isArray(data.turns)
        ? data.turns.slice(-20)
        : [];

      this.facts =
        data.facts && typeof data.facts === "object"
          ? data.facts
          : {};
    } catch {
      this.turns = [];
      this.facts = {};
    }

    this.loaded = true;
  }

  async save() {
    await mkdir(DATA_DIR, { recursive: true });

    await writeFile(
      MEMORY_FILE,
      JSON.stringify(
        {
          version: 2,
          updatedAt: new Date().toISOString(),
          turns: this.turns.slice(-20),
          facts: this.facts
        },
        null,
        2
      ),
      "utf8"
    );
  }

  async rememberTurn(user, assistant) {
    await this.load();

    this.turns.push({
      user: sanitize(user),
      assistant: sanitize(assistant),
      time: new Date().toISOString()
    });

    this.turns = this.turns.slice(-20);

    await this.save();
  }

  async rememberFact(key, value) {
    await this.load();

    const safeKey = sanitize(key).slice(0, 100);
    const safeValue = sanitize(value).slice(0, 1000);

    this.facts[safeKey] = safeValue;

    await this.save();
  }

  async context() {
    await this.load();

    if (!this.turns.length && !Object.keys(this.facts).length) {
      return "No previous memory.";
    }

    const turns = this.turns
      .map(
        (item) =>
          `USER: ${item.user}\nJARVIS: ${item.assistant}`
      )
      .join("\n\n");

    const facts = Object.entries(this.facts)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    return [
      turns ? `RECENT CONVERSATION:\n${turns}` : "",
      facts ? `KNOWN USER FACTS:\n${facts}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
