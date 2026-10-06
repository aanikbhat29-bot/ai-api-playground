# AI API Playground

A clean starter project for learning the full GitHub → Backend → Frontend → API deployment workflow.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- AI provider: configurable through `.env`
- CORS enabled
- Secrets stay in `.env` (do NOT commit `.env`)

## Project structure
```text
ai-api-playground/
├── client/          # React + Vite frontend
├── server/          # Express backend
├── .gitignore
└── README.md
```

## Setup

### 1. Backend
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

### 2. Frontend
Open another terminal:
```bash
cd client
npm install
npm run dev
```

Then open the URL shown by Vite.

### Local JARVIS voice service

The orb uses the local Whisper/Ollama/Piper service at `http://127.0.0.1:8765`.
Start it in a third terminal before opening the frontend:

```bash
cd client
npm run local-ai
```

The frontend checks `/health` on startup. It will display `LOCAL AI OFFLINE` if the
service is unreachable and will retry automatically; Chrome may display the small
`ACTIVATE JARVIS` control once to unlock audio playback.

### Local desktop agent (Fedora / GNOME Wayland)

JARVIS desktop control is a separate process that binds only to `127.0.0.1` and
refuses to run as root. It runs commands as the logged-in user, writes an
owner-only runtime token in the user's runtime directory, and records redacted
execution summaries. Start it from the normal desktop session:

```bash
cd server
npm run desktop-agent
```

The agent provides a capability registry for applications, files, terminal commands,
system information, browser URLs/searches, media, and GNOME screenshots. Destructive
terminal operations require a confirmation token; `sudo`, `su`, `doas`, and `pkexec`
are rejected.

GNOME on Wayland intentionally blocks ordinary applications from synthesizing global
keyboard and mouse input. To opt in to that normal-user session capability, install
the included extension (no root access is used):

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r gnome-extension/jarvis-desktop-control@local \
  ~/.local/share/gnome-shell/extensions/
gnome-extensions enable jarvis-desktop-control@local
```

Log out and back in if GNOME does not load the extension immediately. Until it is
enabled, keyboard, mouse, and window-control requests return a precise unavailable
error instead of claiming success.

## Environment variables

Edit `server/.env` yourself in VS Code.

The starter supports:
- `AI_PROVIDER=gemini`
- `AI_PROVIDER=groq`
- `AI_PROVIDER=openrouter`

See `server/.env.example` for the variables.

## Important
Never upload real API keys to GitHub. `.env` is ignored by Git.
