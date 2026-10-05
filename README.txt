REEL-STYLE JARVIS ORB DROP-IN

This patch replaces ONLY the client visual layer. It does not touch your Gemini,
ElevenLabs, KDE Connect, /api/dashboard or other server code.

1) Back up current files:
   cp client/src/App.jsx client/src/App.before-reel-orb.jsx
   cp client/src/styles.css client/src/styles.before-reel-orb.css

2) Copy these files into client/src:
   App.jsx
   styles.css
   orbEngine.js
   gestureController.js

3) Install MediaPipe once (gesture control):
   npm install @mediapipe/tasks-vision

4) Start:
   npm run dev

INTERACTION
- Drag: rotate the orb
- Scroll: zoom
- G: camera / hand control
- +/-: zoom
- R: reset
- Click the center: run the existing /api/chat + /api/tts pipeline
- Double-click center: blue/amber security-state animation

The orb is rendered live with Canvas so there are no static screenshots, fake HUD
numbers, or background video. Camera tracking is hidden; only the resulting gesture
control affects the orb.
