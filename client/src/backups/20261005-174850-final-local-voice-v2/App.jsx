import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { ReelOrbEngine } from "./orbEngine";
import { GestureController } from "./gestureController";

const LOCAL_AI_URL = "http://127.0.0.1:8765";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

const Recognition = null;

export default function App() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const orbRef = useRef(null);
  const gestureRef = useRef(null);
  const recognitionRef = useRef(null);
    const voiceControllerRef = useRef(null);

  const autoListenRef = useRef(true);
  const speakingRef = useRef(false);
  const startingRecognitionRef = useRef(false);
  const retryTimerRef = useRef(null);
  const audioUnlockRef = useRef(false);
  const micStreamRef = useRef(null);

  const [orange, setOrange] =
    useState(false);

  const [voiceState, setVoiceState] =
    useState("STARTING");

  const [heard, setHeard] =
    useState("");

  const [hands, setHands] =
    useState(0);

  const [camera, setCamera] =
    useState("STARTING");

  const [error, setError] =
    useState("");

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) return;

    const orb =
      new ReelOrbEngine(canvas);

    orb.start();

    canvas.style.pointerEvents =
      "none";

    canvas.style.touchAction =
      "none";

    orbRef.current = orb;

    return () => {
      gestureRef.current?.stop();
      recognitionRef.current?.stop();
      clearTimeout(
        retryTimerRef.current
      );
      orb.dispose();

      gestureRef.current = null;
      recognitionRef.current = null;
      orbRef.current = null;
    };
  }, []);

  useEffect(() => {
    orbRef.current?.setMode(
      orange ? "orange" : "blue"
    );
  }, [orange]);

  const speak = useCallback(
    async (text) => {
      const value =
        String(text || "").trim();

      if (!value) return false;

      speakingRef.current = true;
      setVoiceState("SPEAKING");

      try {
        recognitionRef.current?.stop();
      } catch {}

      try {
        const response =
          await fetch(
            `${LOCAL_AI_URL}/tts`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                text: value
              })
            }
          );

        if (!response.ok) {
          throw new Error(
            "Voice generation failed."
          );
        }

        const blob =
          await response.blob();

        const url =
          URL.createObjectURL(
            blob
          );

        const audio =
          new Audio(url);

        await audio.play();

        await new Promise(
          (resolve) => {
            audio.onended =
              resolve;
            audio.onerror =
              resolve;
          }
        );

        URL.revokeObjectURL(url);

        speakingRef.current =
          false;

        setVoiceState("LISTENING");

        return true;
      } catch (err) {
        speakingRef.current =
          false;

        setVoiceState(
          "VOICE ERROR"
        );

        setError(
          err.message ||
            "Voice playback failed."
        );

        return false;
      }
    },
    []
  );

  const localAction =
    useCallback(
      async (action, value = "") => {
        const response =
          await fetch(
            `${API_URL}/api/local/action`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                action,
                value
              })
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Local action failed."
          );
        }

        return data.message ||
          "Done.";
      },
      []
    );

  const parseLocalCommand =
    useCallback(
      (text) => {
        const t =
          text
            .toLowerCase()
            .trim();

        if (
          /open (vs code|visual studio code)/.test(
            t
          )
        ) {
          return [
            "open_vscode",
            ""
          ];
        }

        if (
          /open (my )?(files|file manager|home)/.test(
            t
          )
        ) {
          return [
            "open_files",
            ""
          ];
        }

        if (
          /open downloads|open download folder/.test(
            t
          )
        ) {
          return [
            "open_downloads",
            ""
          ];
        }

        if (
          /open (terminal|command line)/.test(
            t
          )
        ) {
          return [
            "open_terminal",
            ""
          ];
        }

        if (
          /open (settings|system settings)/.test(
            t
          )
        ) {
          return [
            "open_settings",
            ""
          ];
        }

        if (
          /volume (up|increase)|increase (the )?volume/.test(
            t
          )
        ) {
          return [
            "volume_up",
            ""
          ];
        }

        if (
          /volume (down|decrease)|decrease (the )?volume/.test(
            t
          )
        ) {
          return [
            "volume_down",
            ""
          ];
        }

        if (
          /^(mute|mute audio|mute sound)/.test(
            t
          )
        ) {
          return [
            "mute",
            ""
          ];
        }

        if (
          /lock (the )?(screen|pc|computer|laptop)/.test(
            t
          )
        ) {
          return [
            "lock_screen",
            ""
          ];
        }

        const webSearch =
          t.match(
            /^(search (the )?web|google|search) (for )?(.+)$/i
          );

        if (webSearch) {
          return [
            "search_web",
            text.replace(
              /^(search (the )?web|google|search) (for )?/i,
              ""
            )
          ];
        }

        const youtubeSearch =
          t.match(
            /^(search )?(youtube|you tube)( for)? (.+)$/i
          );

        if (youtubeSearch) {
          return [
            "youtube_search",
            text.replace(
              /^(search )?(youtube|you tube)( for)? /i,
              ""
            )
          ];
        }

        const playYoutube =
          t.match(
            /^play (.+) on youtube$/i
          );

        if (playYoutube) {
          return [
            "youtube_search",
            playYoutube[1]
          ];
        }

        const openUrl =
          text.match(
            /^open (https?:\/\/\S+)$/i
          );

        if (openUrl) {
          return [
            "open_url",
            openUrl[1]
          ];
        }

        return null;
      },
      []
    );

  const askJarvis =
    useCallback(
      async (text) => {
        const prompt =
          String(text || "")
            .trim();

        if (!prompt) return;

        setHeard(prompt);
        setError("");

        const command =
          parseLocalCommand(
            prompt
          );

        if (command) {
          try {
            const result =
              await localAction(
                command[0],
                command[1]
              );

            await speak(
              result
            );
          } catch (err) {
            await speak(
              `I could not complete that command. ${
                err.message || ""
              }`
            );
          }

          return;
        }

        try {
          setVoiceState(
            "THINKING"
          );

          const response =
            await fetch(
              `${LOCAL_AI_URL}/chat`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body: JSON.stringify({
                  prompt
                })
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                "AI request failed."
            );
          }

          await speak(
            data.answer ||
              "I did not receive a response."
          );
        } catch (err) {
          setVoiceState(
            "VOICE ERROR"
          );
          setError(
            err.message ||
              "JARVIS backend unavailable."
          );
        }
      },
      [
        localAction,
        parseLocalCommand,
        speak
      ]
    );

  const startListening = useCallback(async () => {
    if (!autoListenRef.current || speakingRef.current) return;
    if (voiceControllerRef.current?.active) return;

    if (!navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined") {
      setVoiceState("VOICE UNSUPPORTED");
      setError("This browser does not support microphone recording.");
      return;
    }

    let stream;
    let recorder;
    let audioContext;
    let analyser;
    let source;
    let raf = 0;
    let stopped = false;
    let speechStarted = false;
    let silenceMs = 0;
    let startedAt = performance.now();
    let lastSpeechAt = startedAt;
    const chunks = [];

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      try { source?.disconnect(); } catch {}
      try { analyser?.disconnect?.(); } catch {}
      try { audioContext?.close(); } catch {}
      try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
      voiceControllerRef.current = null;
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = mimeCandidates.find((x) =>
        MediaRecorder.isTypeSupported(x)
      ) || "";

      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioContext = new AudioContext();
      if (audioContext.state === "suspended") {
        try { await audioContext.resume(); } catch {}
      }

      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };

      recorder.onerror = () => {
        cleanup();
        setVoiceState("MIC ERROR");
        setError("Microphone recording failed.");
        if (autoListenRef.current && !speakingRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => startListening(), 900);
        }
      };

      recorder.onstop = async () => {
        if (stopped) return;
        stopped = true;

        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });

        cleanup();

        if (!speechStarted || blob.size < 1000) {
          setVoiceState("LISTENING");
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => startListening(), 300);
          return;
        }

        setVoiceState("THINKING");

        try {
          const response = await fetch(`${LOCAL_AI_URL}/transcribe`, {
            method: "POST",
            headers: {
              "Content-Type": blob.type || "audio/webm",
            },
            body: blob,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Local speech recognition failed.");
          }

          const transcript = String(data.text || "").trim();

          if (!transcript) {
            setVoiceState("LISTENING");
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => startListening(), 300);
            return;
          }

          setHeard(transcript);
          await askJarvis(transcript);
        } catch (err) {
          setVoiceState("VOICE ERROR");
          setError(err?.message || "Local voice service unavailable.");
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => startListening(), 1200);
        }
      };

      voiceControllerRef.current = {
        active: true,
        stop: () => {
          try { recorder?.stop(); } catch {}
        },
      };

      recorder.start(250);
      setError("");
      setVoiceState("LISTENING");

      const tick = () => {
        if (stopped) return;

        analyser.getByteTimeDomainData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const x = (data[i] - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        const elapsed = now - startedAt;

        // Slightly conservative threshold prevents speaker/keyboard noise
        // from repeatedly triggering transcription.
        const speaking = rms > 0.035;

        if (speaking) {
          if (!speechStarted) {
            speechStarted = true;
            startedAt = now;
          }
          lastSpeechAt = now;
          silenceMs = 0;
          setVoiceState("HEARING");
        } else if (speechStarted) {
          silenceMs = now - lastSpeechAt;

          // 1.15 seconds of silence ends the utterance.
          if (silenceMs > 1150) {
            try { recorder.stop(); } catch {}
            return;
          }
        }

        // Keep empty recordings short; cap an utterance at ~15 seconds.
        if (!speechStarted && elapsed > 8000) {
          try { recorder.stop(); } catch {}
          return;
        }

        if (speechStarted && now - startedAt > 15000) {
          try { recorder.stop(); } catch {}
          return;
        }

        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
    } catch (err) {
      cleanup();

      if (err?.name === "NotAllowedError" ||
          err?.name === "PermissionDeniedError") {
        autoListenRef.current = false;
        setVoiceState("MIC DENIED");
        setError("Allow microphone access for localhost in Chrome.");
        return;
      }

      setVoiceState("MIC ERROR");
      setError(err?.message || "Unable to access microphone.");
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => startListening(), 1200);
    }
  }, [askJarvis]);

  const startHands =
    useCallback(
      async () => {
        if (
          gestureRef.current ||
          !videoRef.current
        ) {
          return;
        }

        setCamera(
          "STARTING"
        );

        try {
          const controller =
            new GestureController(
              videoRef.current,

              (yaw, pitch) => {
                orbRef.current?.rotateBy(
                  yaw,
                  pitch
                );
              },

              (factor) => {
                orbRef.current?.zoomBy(
                  factor
                );
              },

              (state, count) => {
                setCamera(
                  state === "on"
                    ? "ON"
                    : state.toUpperCase()
                );

                setHands(
                  state === "on"
                    ? count
                    : 0
                );
              },

              () => {
                // Victory is the ONLY color switch.
                setOrange(
                  current =>
                    !current
                );
              },

              (nx, ny) => {
                orbRef.current?.setHandPosition?.(
                  nx,
                  ny
                );
              }
            );

          gestureRef.current =
            controller;

          await controller.start();
        } catch (err) {
          console.error(
            "Hand tracking:",
            err
          );

          gestureRef.current?.stop();
          gestureRef.current =
            null;

          setCamera(
            "CAMERA ERROR"
          );
        }
      },
      []
    );

  // Startup greeting + automatic voice/camera initialization.
  useEffect(() => {
    const boot =
      setTimeout(
        async () => {
          await startHands();

          const played =
            await speak(
              "Good afternoon. JARVIS online. Voice control and hand control initialized. How can I help?"
            );

          if (!played) {
            setVoiceState(
              "VOICE READY"
            );
          }

          startListening();
        },
        1100
      );

    const unlockAudio =
      () => {
        audioUnlockRef.current =
          true;

        startListening();
      };

    window.addEventListener(
      "pointerdown",
      unlockAudio,
      { passive: true }
    );

    window.addEventListener(
      "keydown",
      unlockAudio
    );

    return () => {
      clearTimeout(
        boot
      );

      window.removeEventListener(
        "pointerdown",
        unlockAudio
      );

      window.removeEventListener(
        "keydown",
        unlockAudio
      );
    };
  }, [
    speak,
    startHands,
    startListening
  ]);

  return (
    <main
      className={
        orange
          ? "reel-app orange"
          : "reel-app blue"
      }
    >
      <canvas
        ref={canvasRef}
        className="reel-canvas"
      />

      <video
        ref={videoRef}
        className="hidden-camera"
        muted
        playsInline
      />

      <div className="reel-vignette" />
      <div className="reel-scanlines" />

      <div className="jarvis-voice-state">
        <span
          className={
            voiceState === "LISTENING"
              ? "voice-dot live"
              : "voice-dot"
          }
        />
        {voiceState}
      </div>

      {heard && (
        <div className="jarvis-heard">
          “{heard}”
        </div>
      )}

      <div className="reel-status">
        <span
          className={
            camera === "ON"
              ? "status-dot live"
              : "status-dot"
          }
        />
        CAMERA {camera}
        <span className="status-gap">
          •
        </span>
        HANDS {hands}
      </div>

      <div className="reel-state">
        {orange
          ? "ACTIVE"
          : "STANDBY"}
      </div>

      {error && (
        <div className="jarvis-error">
          {error}
        </div>
      )}
    </main>
  );
}
