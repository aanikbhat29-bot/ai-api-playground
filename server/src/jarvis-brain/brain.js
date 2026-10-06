import { JarvisMemory } from "./memory.js";
import { JarvisPlanner } from "./planner.js";
import { JARVIS_TOOLS } from "./toolCatalog.js";
import { validateToolCall } from "./policy.js";

export class JarvisBrain {
  constructor({
    localAiUrl = "http://127.0.0.1:8765",
    executeTool,
    answerQuestion
  }) {
    if (typeof executeTool !== "function") {
      throw new TypeError("JarvisBrain requires executeTool.");
    }

    if (typeof answerQuestion !== "function") {
      throw new TypeError("JarvisBrain requires answerQuestion.");
    }

    this.memory = new JarvisMemory();
    this.planner = new JarvisPlanner({ localAiUrl });
    this.executeTool = executeTool;
    this.answerQuestion = answerQuestion;
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

    const plan = await this.planner.plan(
      text,
      this.memory.contextText()
    );

    this.validatePlan(plan);

    if (plan.type === "conversation") {
      const answer = String(plan.reply || "How can I help?");
      this.memory.addTurn(text, answer);

      return {
        ok: true,
        type: "conversation",
        answer
      };
    }

    if (plan.type === "question") {
      const answer = await this.answerQuestion(
        plan.query,
        this.memory.contextText()
      );

      this.memory.addTurn(text, answer);

      return {
        ok: true,
        type: "question",
        answer
      };
    }

    const results = [];

    for (const step of plan.steps) {
      const result = await this.executeTool(
        step.tool,
        step.input || {}
      );

      if (result?.confirmationRequired) {
        const answer =
          "This action requires confirmation before I continue.";

        this.memory.addTurn(text, answer);

        return {
          ok: true,
          type: "confirmation",
          answer,
          confirmationRequired: true,
          confirmationId: result.confirmationId,
          completedSteps: results
        };
      }

      results.push({
        tool: step.tool,
        result
      });
    }

    if (plan.type === "mixed") {
      const toolContext = results
        .map(
          (item) =>
            `${item.tool}: ${JSON.stringify(item.result)}`
        )
        .join("\n");

      const answer = await this.answerQuestion(
        plan.query,
        `${this.memory.contextText()}\n\nREAL TOOL RESULTS:\n${toolContext}`
      );

      this.memory.addTurn(text, answer);

      return {
        ok: true,
        type: "mixed",
        answer,
        results
      };
    }

    const answer =
      String(plan.goal || "The requested task has been completed.");

    this.memory.addTurn(text, answer);

    return {
      ok: true,
      type: "action",
      answer,
      results
    };
  }

  validatePlan(plan) {
    if (!plan || typeof plan !== "object") {
      throw new Error("Invalid JARVIS plan.");
    }

    if (
      ![
        "conversation",
        "question",
        "action",
        "mixed"
      ].includes(plan.type)
    ) {
      throw new Error(`Invalid JARVIS plan type: ${plan.type}`);
    }

    if (plan.type === "question") {
      if (!String(plan.query || "").trim()) {
        throw new Error("JARVIS question is empty.");
      }
      return;
    }

    if (plan.type === "conversation") {
      return;
    }

    if (!Array.isArray(plan.steps) || !plan.steps.length) {
      throw new Error("JARVIS produced an empty action plan.");
    }

    for (const step of plan.steps) {
      validateToolCall(
        step.tool,
        step.input || {},
        JARVIS_TOOLS
      );
    }
  }
}
