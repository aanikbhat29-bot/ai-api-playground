import os from "node:os";
import path from "node:path";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";

const HOME = os.homedir();
const DIR = path.join(HOME, ".jarvis");

const MEMORY_FILE = path.join(DIR, "memory.json");
const SKILLS_FILE = path.join(DIR, "skills.json");

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s]+/gi
];

function sanitize(value, max = 5000) {
  let text = String(value ?? "");

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }

  return text.slice(0, max);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(DIR, { recursive: true });

  await writeFile(
    file,
    JSON.stringify(value, null, 2),
    "utf8"
  );
}

export class JarvisMemoryFinal {
  constructor() {
    this.loaded = false;
    this.data = {
      version: 4,
      facts: {},
      turns: [],
      lastPlan: null,
      lastRequest: "",
      lastAnswer: ""
    };
    this.skills = {};
  }

  async load() {
    if (this.loaded) return;

    const memory = await readJson(
      MEMORY_FILE,
      this.data
    );

    const skills = await readJson(
      SKILLS_FILE,
      {}
    );

    this.data = {
      version: 4,
      facts:
        memory.facts &&
        typeof memory.facts === "object"
          ? memory.facts
          : {},
      turns: Array.isArray(memory.turns)
        ? memory.turns.slice(-20)
        : [],
      lastPlan: memory.lastPlan || null,
      lastRequest: String(memory.lastRequest || ""),
      lastAnswer: String(memory.lastAnswer || "")
    };

    this.skills =
      skills &&
      typeof skills === "object"
        ? skills
        : {};

    this.loaded = true;
  }

  async save() {
    await writeJson(MEMORY_FILE, {
      ...this.data,
      updatedAt: new Date().toISOString()
    });

    await writeJson(
      SKILLS_FILE,
      this.skills
    );
  }

  async addTurn(user, assistant) {
    await this.load();

    this.data.turns.push({
      user: sanitize(user, 2000),
      assistant: sanitize(assistant, 4000),
      time: new Date().toISOString()
    });

    this.data.turns =
      this.data.turns.slice(-20);

    this.data.lastRequest =
      sanitize(user, 2000);

    this.data.lastAnswer =
      sanitize(assistant, 4000);

    await this.save();
  }

  async rememberFact(key, value) {
    await this.load();

    this.data.facts[
      sanitize(key, 120)
    ] = sanitize(value, 1200);

    await this.save();
  }

  async rememberPlan(plan) {
    await this.load();

    this.data.lastPlan = plan;

    await this.save();
  }

  async learnSkill(name, steps) {
    await this.load();

    const key = sanitize(
      name
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, "")
        .trim(),
      100
    );

    if (!key) {
      throw new Error("Skill name is empty.");
    }

    this.skills[key] = {
      name: key,
      steps,
      learnedAt: new Date().toISOString()
    };

    await this.save();

    return this.skills[key];
  }

  async getSkill(name) {
    await this.load();

    const key = sanitize(
      String(name || "")
        .toLowerCase()
        .trim(),
      100
    );

    return this.skills[key] || null;
  }

  async context() {
    await this.load();

    const facts = Object.entries(
      this.data.facts
    )
      .map(([key, value]) =>
        `${key}: ${value}`
      )
      .join("\n");

    const turns = this.data.turns
      .slice(-10)
      .map(
        (item) =>
          `USER: ${item.user}\nJARVIS: ${item.assistant}`
      )
      .join("\n\n");

    const skills = Object.keys(
      this.skills
    ).length
      ? Object.keys(this.skills).join(", ")
      : "No learned skills.";

    return [
      facts
        ? `KNOWN FACTS:\n${facts}`
        : "",
      skills
        ? `LEARNED SKILLS:\n${skills}`
        : "",
      turns
        ? `RECENT CONVERSATION:\n${turns}`
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async getLastPlan() {
    await this.load();
    return this.data.lastPlan;
  }
}
