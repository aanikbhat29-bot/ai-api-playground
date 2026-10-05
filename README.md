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

## Environment variables

Edit `server/.env` yourself in VS Code.

The starter supports:
- `AI_PROVIDER=gemini`
- `AI_PROVIDER=groq`
- `AI_PROVIDER=openrouter`

See `server/.env.example` for the variables.

## Important
Never upload real API keys to GitHub. `.env` is ignored by Git.
