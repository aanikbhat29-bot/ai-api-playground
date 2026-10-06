import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { JARVIS_TOOLS, toolDescriptions } from "./toolCatalog.js";
import { validateToolCall } from "./policy.js";
import { JarvisPersistentMemory } from "./memoryV2.js";
import {
  looksTimeSensitive,
  searchWeb
} from "./webSearch.js";

function cleanModelText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseJson(text) {
  const cleaned = cleanModelText(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("JARVIS planner returned no JSON object.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function questionPlan(query, fresh = false) {
  return {
    type: "question",
    query: String(query || "").trim(),
    fresh: Boolean(fresh)
  };
}

function obviousPlan(text) {
  const original = String(text || "").trim();
  const lower = original.toLowerCase();

  const websites = [
    ["youtube", "https://www.youtube.com"],
    ["google", "https://www.google.com"],
    ["gmail", "https://mail.google.com"],
    ["github", "https://github.com"],
    ["chatgpt", "https://chatgpt.com"],
    ["wikipedia", "https://www.wikipedia.org"]
  ];

  for (const [name, url] of websites) {
    if (
      lower.includes(`open ${name}`) ||
      lower.includes(`launch ${name}`) ||
      lower.includes(`go to ${name}`) ||
      lower.includes(`open ${name} for me`)
    ) {
      return {
        type: "action",
        goal: `Open ${name}.`,
        steps: [
          {
            tool: "browser.open",
            input: { url }
          }
        ]
      };
    }
  }

  if (/^(open|launch)\s+(vs code|visual studio code|code)$/i.test(original)) {
    return {
      type: "action",
      goal: "Open VS Code.",
      steps: [
        {
          tool: "app.launch",
          input: { app: "code" }
        }
      ]
    };
  }

  const typeMatch =
    original.match(/^(?:type|write|enter)\s+(.+)$/i);

  if (typeMatch) {
    return {
      type: "action",
      goal: "Type the requested text.",
      steps: [
        {
          tool: "input.type",
          input: { text: typeMatch[1] }
        }
      ]
    };
  }

  const combo =
    original.match(/^(?:press|hit)\s+(.+\+.+)$/i);

  if (combo) {
    return {
      type: "action",
      goal: `Press ${combo[1]}.`,
      steps: [
        {
          tool: "input.combo",
          input: { combo: combo[1].replace(/\s+/g, "") }
        }
      ]
    };
  }

  if (/^(scroll|scroll down|go down)$/i.test(original)) {
    return {
      type: "action",
      goal: "Scroll down.",
      steps: [
        {
          tool: "input.mouse",
          input: {
            action: "scroll",
            deltaX: 0,
            deltaY: 700
          }
        }
      ]
    };
  }

  if (/^(scroll up|go up)$/i.test(original)) {
    return {
      type: "action",
      goal: "Scroll up.",
      steps: [
        {
          tool: "input.mouse",
          input: {
            action: "scroll",
            deltaX: 0,
            deltaY: -700
          }
        }
      ]
    };
  }

  if (/^(increase|turn up|raise)\s+(the\s+)?volume$/i.test(original)) {
    return {
      type: "action",
      goal: "Increase the volume.",
      steps: [
        {
          tool: "media.control",
          input: { action: "volume_up" }
        }
      ]
    };
  }

  if (/^(decrease|turn down|lower)\s+(the\s+)?volume$/i.test(original)) {
    return {
      type: "action",
      goal: "Decrease the volume.",
      steps: [
        {
          tool: "media.control",
          input: { action: "volume_down" }
        }
      ]
    };
  }

  if (
    /^(what|how|why|who|when|where|which|can|is|are|do|does|explain|tell me)\b/i.test(original)
  ) {
    return questionPlan(
      original,
      looksTimeSensitive(original)
    );
  }

  return null;
}

export class JarvisBrainV2 {
  constructor({
    localAiUrl = "http://127.0.0.1:8765",
    executeTool,
    cloudPlan,
    answerQuestion
  }) {
    if (typeof executeTool !== "function") {
      throw new TypeError("JarvisBrainV2 requires executeTool.");
    }

    if (typeof cloudPlan !== "function") {
      throw new TypeError("JarvisBrainV2 requires cloudPlan.");
    }

    if (typeof answerQuestion !== "function") {
      throw new TypeError("JarvisBrainV2 requires answerQuestion.");
    }

    this.localAiUrl = localAiUrl;
    this.executeTool = executeTool;
    this.cloudPlan = cloudPlan;
    this.answerQuestion = answerQuestion;
    this.memory = new JarvisPersistentMemory();
    this.localStarting = false;
  }

  async localHealth() {
    try {
      const response = await fetch(
        `${this.localAiUrl}/health`,
        { signal: AbortSignal.timeout(1500) }
      );

      if (!response.ok) return false;

      const payload = await response.json();
      return Boolean(payload?.ready);
    } catch {
      return false;
    }
  }

  async ensureLocalBrain() {
    if (await this.localHealth()) return true;

    if (this.localStarting) {
      return await this.waitForLocalBrain();
    }

    this.localStarting = true;

    try {
      const home = os.homedir();
      const localDir = path.join(home, "jarvis-local");
      const python =
        path.join(localDir, ".venv", "bin", "python");
      const script =
        path.join(localDir, "jarvis_local_service.py");

      if (!process.env.JARVIS_DISABLE_LOCAL_AUTOSTART) {
        try {
          spawn(
            python,
            [script],
            {
              cwd: localDir,
              detached: true,
              stdio: "ignore"
            }
          ).unref();
        } catch (error) {
          console.warn(
            "[JARVIS] Local brain autostart failed:",
            error.message
          );
        }
      }

      return await this.waitForLocalBrain();
    } finally {
      this.localStarting = false;
    }
  }

  async waitForLocalBrain(timeoutMs = 12_000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (await this.localHealth()) return true;

      await new Promise((resolve) =>
        setTimeout(resolve, 500)
      );
    }

    return false;
  }

  plannerPrompt(userText, context) {
    return `
You are JARVIS, an English-first desktop agent planner.

You understand English, Hindi, and Hinglish naturally,
but your internal language and default response language are English.

You are NOT the final answer generator.
You decide what JARVIS should do.

Return ONLY valid JSON.

ALLOWED TYPES:

{
  "type": "conversation",
  "reply": "short English response"
}

{
  "type": "question",
  "query": "question",
  "fresh": false
}

{
  "type": "action",
  "goal": "short description",
  "steps": [
    {
      "tool": "tool.name",
      "input": {}
    }
  ]
}

{
  "type": "mixed",
  "goal": "short description",
  "steps": [
    {
      "tool": "tool.name",
      "input": {}
    }
  ],
  "query": "remaining question",
  "fresh": false
}

IMPORTANT RULES:

- Never invent tools.
- Never invent arguments.
- Use desktop tools for desktop work.
- Use browser.open for opening websites.
- Use browser.search for explicit browser searching.
- Use app.launch for applications.
- Use system.status for live computer statistics.
- Use screen.capture for the actual screen.
- Use input.type for typing.
- Use input.key for a single key.
- Use input.combo for shortcuts.
- Use input.mouse for pointer operations.
- Use window.list before window.control if a window id is needed.
- Use terminal.run only as the normal logged-in user.
- Never use sudo.
- Never use su.
- Never request root access.
- Prefer deterministic desktop tools over terminal commands when possible.
- Build multiple ordered steps for multi-action requests.
- Do not answer knowledge questions here.
- If current/latest/today/recent information is needed, set fresh=true.
- Default language of JARVIS responses is English.
- Understand natural Hindi/Hinglish commands.

AVAILABLE TOOLS:

${toolDescriptions()}

RECENT MEMORY:

${context}

USER REQUEST:

${userText}
`;
  }

  async localPlan(userText, context) {
    const response = await fetch(
      `${this.localAiUrl}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: this.plannerPrompt(userText, context)
        }),
        signal: AbortSignal.timeout(25_000)
      }
    );

    if (!response.ok) {
      throw new Error(
        `Local planner HTTP ${response.status}`
      );
    }

    const payload = await response.json();
    return parseJson(payload?.answer || "");
  }

  async plan(userText) {
    const context = await this.memory.context();

    const fallback = obviousPlan(userText);

    // Fast deterministic route for obvious desktop commands.
    if (fallback) return fallback;

    // Preferred local brain.
    if (await this.ensureLocalBrain()) {
      try {
        const plan = await this.localPlan(
          userText,
          context
        );

        this.validatePlan(plan);
        return plan;
      } catch (error) {
        console.warn(
          "[JARVIS] Local planner failed:",
          error.message
        );
      }
    }

    // Strong cloud planner fallback.
    try {
      const planText = await this.cloudPlan(
        this.plannerPrompt(userText, context)
      );

      const plan = parseJson(planText);
      this.validatePlan(plan);
      return plan;
    } catch (error) {
      console.warn(
        "[JARVIS] Cloud planner failed:",
        error.message
      );
    }

    // Last-resort question fallback.
    return questionPlan(
      userText,
      looksTimeSensitive(userText)
    );
  }

  validatePlan(plan) {
    if (!plan || typeof plan !== "object") {
      throw new Error("Invalid JARVIS plan.");
    }

    const type = String(plan.type || "");

    if (
      ![
        "conversation",
        "question",
        "action",
        "mixed"
      ].includes(type)
    ) {
      throw new Error(
        `Unsupported JARVIS plan type: ${type}`
      );
    }

    if (type === "question") {
      if (!String(plan.query || "").trim()) {
        throw new Error("Empty JARVIS question.");
      }

      return;
    }

    if (type === "conversation") return;

    if (!Array.isArray(plan.steps) || !plan.steps.length) {
      throw new Error("JARVIS created an empty action plan.");
    }

    if (plan.steps.length > 8) {
      throw new Error(
        "JARVIS action plan is too large."
      );
    }

    for (const step of plan.steps) {
      validateToolCall(
        step.tool,
        step.input || {},
        JARVIS_TOOLS
      );
    }
  }

  async executeSteps(steps) {
    const results = [];

    for (const step of steps) {
      try {
        const result = await this.executeTool(
          step.tool,
          step.input || {}
        );

        if (result?.confirmationRequired) {
          return {
            confirmationRequired: true,
            confirmationId:
              result.confirmationId,
            completed: results,
            message:
              result.message ||
              "Confirmation is required."
          };
        }

        results.push({
          tool: step.tool,
          ok: true,
          result
        });
      } catch (error) {
        return {
          confirmationRequired: false,
          failed: true,
          error: error.message,
          completed: results,
          failedTool: step.tool
        };
      }
    }

    return {
      confirmationRequired: false,
      failed: false,
      results
    };
  }

  async recover(userText, failedPlan, execution) {
    const recoveryPrompt = `
You are JARVIS recovery planner.

A desktop action failed.

USER:
${userText}

FAILED PLAN:
${JSON.stringify(failedPlan)}

EXECUTION RESULT:
${JSON.stringify(execution)}

AVAILABLE TOOLS:
${toolDescriptions()}

Create a minimal replacement plan ONLY if a safe recovery is possible.

Return ONLY JSON:

{
  "type":"action",
  "goal":"...",
  "steps":[
    {"tool":"tool.name","input":{}}
  ]
}

OR:

{
  "type":"question",
  "query":"..."
}

Do not repeat the exact failed step unless the failure was clearly transient.
Do not use sudo/root.
`;

    try {
      const raw = await this.cloudPlan(
        recoveryPrompt
      );

      const plan = parseJson(raw);
      this.validatePlan(plan);

      return plan;
    } catch {
      return null;
    }
  }

  async run(userText) {
    const text = String(userText || "").trim();

    if (!text) {
      return {
        ok: false,
        type: "error",
        answer: "I did not catch that."
      };
    }

    let plan = await this.plan(text);

    if (plan.type === "conversation") {
      const answer =
        String(plan.reply || "I'm ready.");

      await this.memory.rememberTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "conversation",
        answer
      };
    }

    if (plan.type === "question") {
      const answer =
        await this.answerQuestion(
          plan.query,
          await this.memory.context(),
          {
            fresh:
              Boolean(plan.fresh) ||
              looksTimeSensitive(plan.query)
          }
        );

      await this.memory.rememberTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "question",
        answer
      };
    }

    let execution = await this.executeSteps(
      plan.steps
    );

    // One controlled recovery attempt.
    if (execution.failed) {
      const recovered = await this.recover(
        text,
        plan,
        execution
      );

      if (recovered?.type === "action") {
        execution = await this.executeSteps(
          recovered.steps
        );

        if (!execution.failed) {
          plan = recovered;
        }
      }
    }

    if (execution.confirmationRequired) {
      const answer =
        "This action requires confirmation before I continue.";

      await this.memory.rememberTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "confirmation",
        answer,
        confirmationRequired: true,
        confirmationId:
          execution.confirmationId
      };
    }

    if (execution.failed) {
      const answer =
        `I couldn't complete the request because ${execution.error}`;

      await this.memory.rememberTurn(
        text,
        answer
      );

      return {
        ok: false,
        type: "error",
        answer,
        failedTool: execution.failedTool
      };
    }

    const toolContext = execution.results
      .map(
        (item) =>
          `${item.tool}: ${JSON.stringify(item.result)}`
      )
      .join("\n");

    if (plan.type === "mixed") {
      const answer =
        await this.answerQuestion(
          plan.query,
          await this.memory.context(),
          {
            fresh:
              Boolean(plan.fresh) ||
              looksTimeSensitive(plan.query),
            toolContext
          }
        );

      await this.memory.rememberTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "mixed",
        answer,
        actions: execution.results
      };
    }

    const answer =
      String(
        plan.goal ||
        "The requested task has been completed."
      );

    await this.memory.rememberTurn(
      text,
      answer
    );

    return {
      ok: true,
      type: "action",
      answer,
      actions: execution.results
    };
  }
}
