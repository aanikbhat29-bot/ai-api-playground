export const JARVIS_TOOLS = {
  "system.status": {
    description: "Read real CPU, RAM, disk, network, Bluetooth, session and process information.",
    risk: "read"
  },
  "app.list": {
    description: "List supported installed desktop applications.",
    risk: "read"
  },
  "app.launch": {
    description: "Launch an installed desktop application.",
    risk: "normal"
  },
  "browser.open": {
    description: "Open an HTTP or HTTPS URL in the default browser.",
    risk: "normal"
  },
  "browser.search": {
    description: "Perform a real web search in the default browser.",
    risk: "normal"
  },
  "file.list": {
    description: "List files and folders available to the current user.",
    risk: "read"
  },
  "file.read": {
    description: "Read a text file available to the current user.",
    risk: "read"
  },
  "file.create": {
    description: "Create a text file in the user's home directory or project.",
    risk: "normal"
  },
  "file.mkdir": {
    description: "Create a folder in the user's home directory or project.",
    risk: "normal"
  },
  "file.copy": {
    description: "Copy a file or folder without overwriting the destination.",
    risk: "normal"
  },
  "file.move": {
    description: "Move or rename a file or folder without overwriting the destination.",
    risk: "normal"
  },
  "file.open": {
    description: "Open a user file or folder in its normal desktop application.",
    risk: "normal"
  },
  "file.search": {
    description: "Search the user's files by name.",
    risk: "read"
  },
  "terminal.run": {
    description: "Run a normal terminal command as the current non-root user.",
    risk: "command"
  },
  "screen.capture": {
    description: "Capture the actual current desktop screen.",
    risk: "read"
  },
  "input.type": {
    description: "Type text into the currently focused application.",
    risk: "normal"
  },
  "input.key": {
    description: "Press a keyboard key.",
    risk: "normal"
  },
  "input.combo": {
    description: "Press a keyboard shortcut such as Ctrl+L.",
    risk: "normal"
  },
  "input.mouse": {
    description: "Move, click, double-click, scroll or drag the mouse.",
    risk: "normal"
  },
  "window.list": {
    description: "List current desktop windows.",
    risk: "read"
  },
  "window.control": {
    description: "Focus, minimize, maximize, restore, close, move or resize a known window.",
    risk: "normal"
  },
  "media.control": {
    description: "Control playback, volume and mute.",
    risk: "normal"
  }
};

export function toolDescriptions() {
  return Object.entries(JARVIS_TOOLS)
    .map(([name, meta]) => `- ${name}: ${meta.description}`)
    .join("\n");
}
