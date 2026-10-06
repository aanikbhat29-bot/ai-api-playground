const CONFIRMATION_PATTERNS = [
  /\bsudo\b/i,
  /\bsu\s+-?\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\blogout\b/i,
  /\bpower\s+off\b/i,
  /\bformat\b/i,
  /\bpartition\b/i,
  /\brm\s+-rf\b/i,
  /\bdelete\s+all\b/i
];

export function requiresExplicitConfirmation(tool, input = {}) {
  if (tool === "terminal.run") {
    return CONFIRMATION_PATTERNS.some((pattern) =>
      pattern.test(String(input.command || ""))
    );
  }

  if (tool === "file.delete" || tool === "system.power") {
    return true;
  }

  return false;
}

export function validateToolCall(tool, input, catalog) {
  if (!catalog[tool]) {
    throw new Error(`Unsupported JARVIS capability: ${tool}`);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Invalid input for ${tool}.`);
  }

  if (tool === "browser.open") {
    const url = String(input.url || "");

    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Only HTTP/HTTPS browser URLs are allowed.");
    }
  }
}
