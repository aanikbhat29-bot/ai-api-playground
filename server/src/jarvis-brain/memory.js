const MAX_TURNS = 12;

export class JarvisMemory {
  constructor() {
    this.turns = [];
    this.facts = new Map();
  }

  addTurn(user, assistant) {
    this.turns.push({
      user: String(user || "").slice(0, 2000),
      assistant: String(assistant || "").slice(0, 4000),
      time: new Date().toISOString()
    });

    while (this.turns.length > MAX_TURNS) {
      this.turns.shift();
    }
  }

  recentTurns() {
    return [...this.turns];
  }

  contextText() {
    if (!this.turns.length) return "No previous conversation.";

    return this.turns
      .map(
        (turn) =>
          `USER: ${turn.user}\nJARVIS: ${turn.assistant}`
      )
      .join("\n\n");
  }

  remember(key, value) {
    if (!key || value === undefined) return;

    this.facts.set(
      String(key).slice(0, 120),
      String(value).slice(0, 1000)
    );
  }

  get(key) {
    return this.facts.get(String(key));
  }

  snapshot() {
    return {
      turns: this.recentTurns(),
      facts: Object.fromEntries(this.facts)
    };
  }
}
