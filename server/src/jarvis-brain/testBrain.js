import { JarvisBrain } from "./brain.js";

const calls = [];

const brain = new JarvisBrain({
  executeTool: async (tool, input) => {
    calls.push({ tool, input });

    return {
      ok: true,
      tool,
      data: {
        simulated: true
      }
    };
  },

  answerQuestion: async (query) => {
    return `Knowledge response placeholder for: ${query}`;
  }
});

const tests = [
  "Open YouTube",
  "Open VS Code and type hello world",
  "What is electric flux?",
  "Check my RAM usage"
];

for (const test of tests) {
  try {
    const result = await brain.run(test);

    console.log("\nUSER:", test);
    console.log("RESULT:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\nTEST FAILED:", test);
    console.error(error);
    process.exitCode = 1;
  }
}

console.log("\nTOOL CALLS:");
console.log(JSON.stringify(calls, null, 2));
