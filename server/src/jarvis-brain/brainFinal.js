import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  JARVIS_TOOLS,
  toolDescriptions
} from "./toolCatalog.js";

import {
  validateToolCall
} from "./policy.js";

import {
  JarvisMemoryFinal
} from "./memoryFinal.js";

import {
  isCurrentQuestion,
  searchWeb
} from "./webFinal.js";

const INTERNAL_TOOLS = new Set([
  "__wait"
]);

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function cleanModelOutput(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseJson(text) {
  const cleaned =
    cleanModelOutput(text);

  const start =
    cleaned.indexOf("{");

  const end =
    cleaned.lastIndexOf("}");

  if (
    start < 0 ||
    end <= start
  ) {
    throw new Error(
      "JARVIS planner returned no JSON."
    );
  }

  try {
    return JSON.parse(
      cleaned.slice(start, end + 1)
    );
  } catch {
    throw new Error(
      "JARVIS planner returned invalid JSON."
    );
  }
}

function normalizeAppName(name) {
  const value =
    String(name || "")
      .toLowerCase()
      .trim();

  const aliases = {
    "visual studio code": "code",
    "vs code": "code",
    "vscode": "code",
    "google chrome": "google-chrome",
    "chrome": "google-chrome",
    "firefox browser": "firefox",
    "file manager": "org.gnome.Nautilus",
    "files": "org.gnome.Nautilus",
    "terminal": "gnome-terminal",
    "calculator": "gnome-calculator"
  };

  return aliases[value] || value;
}

function obviousPlan(text, skillLookup) {
  const q =
    String(text || "").trim();

  const lower =
    q.toLowerCase();

  // Explicit skill execution.
  const skillMatch =
    lower.match(
      /^(?:start|run|execute|activate)\s+(.+)$/i
    );

  if (skillMatch && skillLookup) {
    return skillLookup(
      skillMatch[1].trim()
    );
  }

  const sites = [
    ["youtube", "https://www.youtube.com"],
    ["google", "https://www.google.com"],
    ["gmail", "https://mail.google.com"],
    ["github", "https://github.com"],
    ["chatgpt", "https://chatgpt.com"],
    ["wikipedia", "https://www.wikipedia.org"]
  ];

  for (const [name, url] of sites) {
    const mentions =
      lower.includes(`open ${name}`) ||
      lower.includes(`launch ${name}`) ||
      lower.includes(`go to ${name}`) ||
      lower.includes(`${name} kholo`) ||
      lower.includes(`${name} khol do`) ||
      lower.includes(`${name} open karo`);

    if (mentions) {
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

  const searchMatch =
    q.match(
      /^(?:search|google|look up)\s+(?:for\s+)?(.+)$/i
    );

  if (searchMatch) {
    return {
      type: "action",
      goal:
        `Search for ${searchMatch[1].trim()}.`,
      steps: [
        {
          tool: "browser.search",
          input: {
            query:
              searchMatch[1].trim()
          }
        }
      ]
    };
  }

  const typeMatch =
    q.match(
      /^(?:type|write|enter)\s+(.+)$/i
    );

  if (typeMatch) {
    return {
      type: "action",
      goal: "Type the requested text.",
      steps: [
        {
          tool: "input.type",
          input: {
            text: typeMatch[1]
          }
        }
      ]
    };
  }

  const comboMatch =
    q.match(
      /^(?:press|hit)\s+(.+\+.+)$/i
    );

  if (comboMatch) {
    return {
      type: "action",
      goal:
        `Press ${comboMatch[1]}.`,
      steps: [
        {
          tool: "input.combo",
          input: {
            combo:
              comboMatch[1]
                .replace(/\s+/g, "")
          }
        }
      ]
    };
  }

  const keyMatch =
    q.match(
      /^(?:press|hit)\s+(enter|escape|esc|tab|backspace|space|delete|home|end|up|down|left|right|f(?:[1-9]|1[0-2]))$/i
    );

  if (keyMatch) {
    return {
      type: "action",
      goal:
        `Press ${keyMatch[1]}.`,
      steps: [
        {
          tool: "input.key",
          input: {
            key: keyMatch[1]
          }
        }
      ]
    };
  }

  if (
    /(?:increase|turn up|raise).*(?:volume)/i
      .test(q)
  ) {
    return {
      type: "action",
      goal: "Increase the volume.",
      steps: [
        {
          tool: "media.control",
          input: {
            action: "volume_up"
          }
        }
      ]
    };
  }

  if (
    /(?:decrease|turn down|lower).*(?:volume)/i
      .test(q)
  ) {
    return {
      type: "action",
      goal: "Decrease the volume.",
      steps: [
        {
          tool: "media.control",
          input: {
            action: "volume_down"
          }
        }
      ]
    };
  }

  if (
    /(?:open|launch)\s+(?:vs code|visual studio code|vscode|code)$/i
      .test(q)
  ) {
    return {
      type: "action",
      goal: "Open VS Code.",
      steps: [
        {
          tool: "app.launch",
          input: {
            app: "code"
          }
        }
      ]
    };
  }

  if (
    /^(?:check|show|get).*(?:ram|memory).*/i.test(q)
  ) {
    return {
      type: "mixed",
      goal: "Checking your RAM usage.",
      steps: [
        {
          tool: "system.status",
          input: {}
        }
      ],
      query:
        "Using the real system result, tell me my current RAM usage clearly."
    };
  }

  if (
    /^(?:check|show|get).*(?:cpu|processor).*/i.test(q)
  ) {
    return {
      type: "mixed",
      goal: "Checking your CPU usage.",
      steps: [
        {
          tool: "system.status",
          input: {}
        }
      ],
      query:
        "Using the real system result, tell me my current CPU usage clearly."
    };
  }

  if (
    /^(?:take|capture).*(?:screenshot|screen)/i
      .test(q)
  ) {
    return {
      type: "action",
      goal: "Taking a screenshot.",
      steps: [
        {
          tool: "screen.capture",
          input: {}
        }
      ]
    };
  }

  // Knowledge questions.
  if (
    /^(?:what|why|how|who|when|where|which|explain|tell me|define|can|is|are|do|does)\b/i
      .test(q)
  ) {
    return {
      type: "question",
      query: q,
      fresh: isCurrentQuestion(q)
    };
  }

  return null;
}

export class JarvisBrainFinal {
  constructor({
    localAiUrl =
      process.env.JARVIS_LOCAL_AI_URL ||
      "http://127.0.0.1:8765",

    executeTool,
    cloudPlan,
    answerQuestion
  }) {
    this.localAiUrl =
      localAiUrl;

    this.executeTool =
      executeTool;

    this.cloudPlan =
      cloudPlan;

    this.answerQuestion =
      answerQuestion;

    this.memory =
      new JarvisMemoryFinal();

    this.localStarting =
      false;
  }

  async localHealth() {
    try {
      const response =
        await fetch(
          `${this.localAiUrl}/health`,
          {
            signal:
              AbortSignal.timeout(1500)
          }
        );

      if (!response.ok) return false;

      const payload =
        await response.json();

      return Boolean(payload?.ready);
    } catch {
      return false;
    }
  }

  async ensureLocalBrain() {
    if (
      await this.localHealth()
    ) {
      return true;
    }

    if (this.localStarting) {
      return this.waitForLocalBrain();
    }

    this.localStarting =
      true;

    try {
      const home =
        os.homedir();

      const dir =
        path.join(
          home,
          "jarvis-local"
        );

      const python =
        path.join(
          dir,
          ".venv",
          "bin",
          "python"
        );

      const script =
        path.join(
          dir,
          "jarvis_local_service.py"
        );

      try {
        spawn(
          python,
          [script],
          {
            cwd: dir,
            detached: true,
            stdio: "ignore"
          }
        ).unref();
      } catch {
        // Cloud fallback will handle it.
      }

      return this.waitForLocalBrain();
    } finally {
      this.localStarting =
        false;
    }
  }

  async waitForLocalBrain(
    timeoutMs = 12000
  ) {
    const started =
      Date.now();

    while (
      Date.now() - started <
      timeoutMs
    ) {
      if (
        await this.localHealth()
      ) {
        return true;
      }

      await sleep(500);
    }

    return false;
  }

  async localPlanner(
    userText,
    context
  ) {
    const prompt = `
You are JARVIS, a professional English-first desktop AI planner.

Understand English, Hindi and Hinglish naturally.

Do NOT answer the user.
Create a structured plan.

Return ONLY valid JSON.

AVAILABLE TYPES:

CONVERSATION
{
  "type": "conversation",
  "reply": "short natural English response"
}

QUESTION
{
  "type": "question",
  "query": "actual question",
  "fresh": false
}

ACTION
{
  "type": "action",
  "goal": "short goal",
  "steps": [
    {
      "tool": "tool.name",
      "input": {}
    }
  ]
}

MIXED
{
  "type": "mixed",
  "goal": "short goal",
  "steps": [
    {
      "tool": "tool.name",
      "input": {}
    }
  ],
  "query": "remaining question",
  "fresh": false
}

RULES:

- English is the default response language.
- Understand natural Hindi/Hinglish.
- Never invent tools.
- Never invent arguments.
- Use desktop tools for computer actions.
- Use app.launch for installed applications.
- Use browser.open for websites.
- Use browser.search for explicit browser searches.
- Use system.status for real computer statistics.
- Use screen.capture for actual screen state.
- Use input.type for typing.
- Use input.key for a single key.
- Use input.combo for shortcuts.
- Use input.mouse for pointer operations.
- Use window.list before window.control when a window id is required.
- Use file tools for filesystem work.
- Use terminal.run only as the current normal user.
- Never use sudo.
- Never use su.
- Never use root.
- Never bypass system permissions.
- Multi-step requests MUST become ordered steps.
- Do not claim an action already happened.
- Questions should go to the knowledge system.
- Current/latest/today questions must set fresh=true.

TOOLS:

${toolDescriptions()}

MEMORY:

${context}

USER REQUEST:

${userText}
`;

    const response =
      await fetch(
        `${this.localAiUrl}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            prompt
          }),
          signal:
            AbortSignal.timeout(30000)
        }
      );

    if (!response.ok) {
      throw new Error(
        `Local planner HTTP ${response.status}`
      );
    }

    const payload =
      await response.json();

    return parseJson(
      payload?.answer || ""
    );
  }

  async cloudPlanner(
    userText,
    context
  ) {
    const prompt = `
You are JARVIS's high-level planning brain.

You are an English-first desktop assistant.

Understand:
- English
- Hindi
- Hinglish
- natural speech
- informal speech

Convert the user request into a safe structured plan.

RETURN ONLY VALID JSON.

Allowed formats:

{
  "type": "conversation",
  "reply": "..."
}

{
  "type": "question",
  "query": "...",
  "fresh": false
}

{
  "type": "action",
  "goal": "...",
  "steps": [
    {"tool":"tool.name","input":{}}
  ]
}

{
  "type": "mixed",
  "goal": "...",
  "steps": [
    {"tool":"tool.name","input":{}}
  ],
  "query": "...",
  "fresh": false
}

TOOLS:

${toolDescriptions()}

RULES:

1. Never invent a tool.
2. Never invent tool arguments.
3. Use multiple ordered steps when necessary.
4. Use desktop tools instead of terminal when possible.
5. Never use root/sudo/su.
6. Never bypass OS permissions.
7. Do not answer knowledge questions.
8. Mark current questions with fresh=true.
9. Default language is English.
10. Preserve the user's actual intent.

RECENT MEMORY:

${context}

USER:

${userText}
`;

    return parseJson(
      await this.cloudPlan(prompt)
    );
  }

  async plan(userText) {
    const text =
      String(userText || "")
        .trim();

    const context =
      await this.memory.context();

    // Learned skill execution.
    const direct =
      obviousPlan(
        text,
        async (name) =>
          this.memory.getSkill(name)
      );

    if (direct instanceof Promise) {
      const resolved =
        await direct;

      if (resolved) {
        return {
          type: "action",
          goal:
            `Run learned skill ${resolved.name}.`,
          steps:
            resolved.steps
        };
      }
    } else if (direct) {
      return direct;
    }

    // Explicit memory instruction.
    const rememberMatch =
      text.match(
        /^remember(?:\s+that)?\s+(.+?)\s+(?:is|=)\s+(.+)$/i
      );

    if (rememberMatch) {
      return {
        type: "memory",
        key:
          rememberMatch[1].trim(),
        value:
          rememberMatch[2].trim()
      };
    }

    const learnMatch =
      text.match(
        /^(?:remember|learn)\s+(?:this\s+workflow|this)\s+(?:as|under the name)\s+(.+)$/i
      );

    if (learnMatch) {
      const lastPlan =
        await this.memory.getLastPlan();

      if (!lastPlan?.steps?.length) {
        return {
          type: "conversation",
          reply:
            "I don't have a completed workflow to learn yet."
        };
      }

      return {
        type: "learn",
        name:
          learnMatch[1].trim(),
        steps:
          lastPlan.steps
      };
    }

    // Fast local planner.
    if (
      await this.ensureLocalBrain()
    ) {
      try {
        const local =
          await this.localPlanner(
            text,
            context
          );

        this.validatePlan(
          local
        );

        return local;
      } catch (error) {
        console.warn(
          "[JARVIS local planner]",
          error.message
        );
      }
    }

    // Strong planner fallback.
    try {
      const cloud =
        await this.cloudPlanner(
          text,
          context
        );

      this.validatePlan(
        cloud
      );

      return cloud;
    } catch (error) {
      console.warn(
        "[JARVIS cloud planner]",
        error.message
      );
    }

    // Last resort.
    return {
      type: "question",
      query: text,
      fresh:
        isCurrentQuestion(text)
    };
  }

  validatePlan(plan) {
    if (
      !plan ||
      typeof plan !== "object"
    ) {
      throw new Error(
        "Invalid JARVIS plan."
      );
    }

    if (
      ![
        "conversation",
        "question",
        "action",
        "mixed",
        "memory",
        "learn"
      ].includes(plan.type)
    ) {
      throw new Error(
        `Unsupported JARVIS plan type: ${plan.type}`
      );
    }

    if (
      plan.type === "conversation"
    ) {
      return;
    }

    if (
      plan.type === "question"
    ) {
      if (
        !String(
          plan.query || ""
        ).trim()
      ) {
        throw new Error(
          "Empty question."
        );
      }

      return;
    }

    if (
      plan.type === "memory" ||
      plan.type === "learn"
    ) {
      return;
    }

    if (
      !Array.isArray(plan.steps) ||
      !plan.steps.length
    ) {
      throw new Error(
        "Empty action plan."
      );
    }

    if (plan.steps.length > 10) {
      throw new Error(
        "Action plan is too large."
      );
    }

    for (const step of plan.steps) {
      if (
        INTERNAL_TOOLS.has(
          step.tool
        )
      ) {
        continue;
      }

      validateToolCall(
        step.tool,
        step.input || {},
        JARVIS_TOOLS
      );
    }
  }

  async verifyAndFocusAfterLaunch(
    app
  ) {
    await sleep(1500);

    try {
      const result =
        await this.executeTool(
          "window.list",
          {}
        );

      let windows =
        result?.data?.windows ??
        result?.windows ??
        result?.data ??
        [];

      if (
        typeof windows === "string"
      ) {
        try {
          windows =
            JSON.parse(windows);
        } catch {
          return;
        }
      }

      if (!Array.isArray(windows)) {
        return;
      }

      const target =
        normalizeAppName(app);

      const match =
        windows.find((window) => {
          const haystack =
            [
              window?.app,
              window?.title
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          return (
            haystack.includes(
              target.toLowerCase()
            ) ||
            target
              .toLowerCase()
              .includes(
                String(
                  window?.app || ""
                ).toLowerCase()
              )
          );
        });

      if (match?.id) {
        await this.executeTool(
          "window.control",
          {
            action: "focus",
            windowId: String(match.id)
          }
        );
      }
    } catch {
      // Launch success remains valid.
    }
  }

  async executeSteps(steps) {
    const results = [];

    for (const step of steps) {
      if (
        step.tool === "__wait"
      ) {
        await sleep(
          Math.max(
            100,
            Math.min(
              10000,
              Number(
                step.input?.ms || 1000
              )
            )
          )
        );

        continue;
      }

      if (
        step.tool === "terminal.run"
      ) {
        const command =
          String(
            step.input?.command || ""
          );

        if (
          /\b(?:sudo|su|pkexec|doas)\b/i
            .test(command)
        ) {
          throw new Error(
            "JARVIS will not run privilege-escalation commands."
          );
        }
      }

      const result =
        await this.executeTool(
          step.tool,
          step.input || {}
        );

      if (
        result?.confirmationRequired
      ) {
        return {
          confirmationRequired: true,
          confirmationId:
            result.confirmationId,
          results
        };
      }

      results.push({
        tool: step.tool,
        result
      });

      if (
        step.tool === "app.launch"
      ) {
        await this.verifyAndFocusAfterLaunch(
          step.input?.app
        );
      }
    }

    return {
      confirmationRequired: false,
      results
    };
  }

  async finalKnowledgeAnswer(
    query,
    toolContext = "",
    fresh = false
  ) {
    let webContext = "";

    if (fresh) {
      try {
        const web =
          await searchWeb(query);

        webContext =
          web
            .map(
              (item, index) =>
                `[${index + 1}] ${item.title}\n${item.snippet}`
            )
            .join("\n\n");
      } catch (error) {
        console.warn(
          "[JARVIS web]",
          error.message
        );
      }
    }

    const context =
      await this.memory.context();

    return this.answerQuestion(
      query,
      context,
      {
        fresh,
        webContext,
        toolContext
      }
    );
  }

  async run(userText) {
    const text =
      String(userText || "")
        .trim();

    if (!text) {
      return {
        ok: false,
        type: "error",
        answer:
          "I didn't catch that."
      };
    }

    const plan =
      await this.plan(text);

    this.validatePlan(plan);

    if (
      plan.type === "conversation"
    ) {
      const answer =
        String(
          plan.reply ||
          "How can I help?"
        );

      await this.memory.addTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "conversation",
        answer
      };
    }

    if (
      plan.type === "memory"
    ) {
      await this.memory.rememberFact(
        plan.key,
        plan.value
      );

      const answer =
        `I'll remember that ${plan.key} is ${plan.value}.`;

      await this.memory.addTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "memory",
        answer
      };
    }

    if (
      plan.type === "learn"
    ) {
      const skill =
        await this.memory.learnSkill(
          plan.name,
          plan.steps
        );

      const answer =
        `I've learned the workflow "${skill.name}".`;

      await this.memory.addTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "learn",
        answer,
        skill: skill.name
      };
    }

    if (
      plan.type === "question"
    ) {
      const answer =
        await this.finalKnowledgeAnswer(
          plan.query,
          "",
          Boolean(
            plan.fresh ||
            isCurrentQuestion(
              plan.query
            )
          )
        );

      await this.memory.addTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "question",
        answer
      };
    }

    await this.memory.rememberPlan(
      plan
    );

    const execution =
      await this.executeSteps(
        plan.steps
      );

    if (
      execution.confirmationRequired
    ) {
      const answer =
        "That action requires confirmation before I continue.";

      await this.memory.addTurn(
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

    const toolContext =
      execution.results
        .map(
          (item) =>
            `${item.tool}: ${JSON.stringify(item.result)}`
        )
        .join("\n");

    if (
      plan.type === "mixed"
    ) {
      const answer =
        await this.finalKnowledgeAnswer(
          plan.query,
          toolContext,
          Boolean(
            plan.fresh ||
            isCurrentQuestion(
              plan.query
            )
          )
        );

      await this.memory.addTurn(
        text,
        answer
      );

      return {
        ok: true,
        type: "mixed",
        answer,
        actions:
          execution.results
      };
    }

    // Data-producing actions need a real explanation.
    const needsSynthesis =
      execution.results.some(
        (item) =>
          [
            "system.status",
            "terminal.run",
            "file.read",
            "file.list",
            "file.search",
            "app.list",
            "window.list"
          ].includes(item.tool)
      );

    let answer;

    if (needsSynthesis) {
      answer =
        await this.finalKnowledgeAnswer(
          plan.goal,
          toolContext,
          false
        );
    } else {
      answer =
        String(
          plan.goal ||
          "The requested task is complete."
        );
    }

    await this.memory.addTurn(
      text,
      answer
    );

    return {
      ok: true,
      type: "action",
      answer,
      actions:
        execution.results
    };
  }
}
