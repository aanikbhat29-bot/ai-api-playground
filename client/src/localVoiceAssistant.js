import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_AI =
  import.meta.env.VITE_JARVIS_LOCAL_URL || "http://127.0.0.1:8765";

const GREETING = "Hello sir, what can I do for you today?";

// Tune these values for a particularly noisy room or microphone.
export const VAD_CONFIG = {
  startRms: 0.028,
  continueRms: 0.017,
  silenceMs: 1_050,
  noSpeechTimeoutMs: 5_500,
  maxUtteranceMs: 12_000,
  minAudioBytes: 900,
};

const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

const INITIAL_VOICE = {
  status: "STARTING",
  transcript: "",
  needsActivation: false,
};

function isAutoplayBlocked(error) {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function responseError(response, fallback) {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

function supportedRecorderOptions() {
  const mimeType = AUDIO_MIME_TYPES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );

  return mimeType ? { mimeType } : undefined;
}

function readRms(analyser, samples) {
  analyser.getByteTimeDomainData(samples);

  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const amplitude = (samples[index] - 128) / 128;
    sum += amplitude * amplitude;
  }

  return Math.sqrt(sum / samples.length);
}

class LocalVoiceAssistant {
  constructor(publish) {
    this.publish = publish;
    this.active = false;
    this.greeted = false;
    this.greetingLoading = false;
    this.greetingPlaying = false;
    this.greetingUrl = null;
    this.healthTimer = null;
    this.listenTimer = null;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.analyserSamples = null;
    this.recorder = null;
    this.recording = null;
    this.processing = false;
    this.currentAudio = null;
    this.pendingSpeechUrl = null;
  }

  setVoice(status, extra = {}) {
    if (!this.active) return;
    this.publish({ status, ...extra });
  }

  async start() {
    this.active = true;
    await this.checkServiceAndGreet();
  }

  scheduleStartupCheck(delayMs) {
    window.clearTimeout(this.healthTimer);
    this.healthTimer = window.setTimeout(() => {
      void this.checkServiceAndGreet();
    }, delayMs);
  }

  async checkServiceAndGreet() {
    if (!this.active || this.greeted || this.greetingLoading || this.greetingUrl) return;

    this.setVoice("STARTING", { needsActivation: false });

    try {
      const response = await fetchWithTimeout(`${LOCAL_AI}/health`, {}, 4_000);
      if (!response.ok) {
        throw new Error(await responseError(response, `Health check ${response.status}`));
      }

      const health = await response.json();
      if (!health?.ok) {
        throw new Error(health?.error || "Local AI health check failed.");
      }

      if (!health.ready) {
        console.info("[JARVIS] Local Whisper is still loading.", health);
        this.setVoice("STARTING");
        this.scheduleStartupCheck(2_000);
        return;
      }

      await this.prepareGreeting();
    } catch (error) {
      console.error("[JARVIS health]", error);
      this.setVoice("LOCAL AI OFFLINE");
      this.scheduleStartupCheck(5_000);
    }
  }

  async prepareGreeting() {
    if (!this.active || this.greetingLoading || this.greetingUrl) return;
    this.greetingLoading = true;

    try {
      const greetingAudio = await this.requestTts(GREETING);
      if (!this.active) return;

      this.greetingUrl = URL.createObjectURL(greetingAudio);
      await this.playGreeting();
    } catch (error) {
      if (isAutoplayBlocked(error)) {
        console.info("[JARVIS] Greeting is waiting for a browser audio activation.");
        this.setVoice("ACTIVATE JARVIS", { needsActivation: true });
      } else if (error?.jarvisVoiceState) {
        // ensureMicrophone already published the precise permission/device state.
        console.error("[JARVIS greeting microphone]", error);
      } else {
        console.error("[JARVIS greeting]", error);
        this.setVoice("TTS FAILED");
        this.scheduleStartupCheck(5_000);
      }
    } finally {
      this.greetingLoading = false;
    }
  }

  async activate() {
    if (!this.active) return;

    // Resume the VAD graph in the same user gesture that unlocks audio.
    void this.resumeAudioContext();

    if (this.pendingSpeechUrl) {
      const pendingUrl = this.pendingSpeechUrl;
      this.pendingSpeechUrl = null;

      try {
        this.setVoice("SPEAKING", { needsActivation: false });
        await this.playAudioUrl(pendingUrl);
        this.setMicrophoneEnabled(true);
        this.scheduleListening(0);
      } catch (error) {
        console.error("[JARVIS response activation]", error);
        if (isAutoplayBlocked(error)) {
          this.pendingSpeechUrl = pendingUrl;
          this.setVoice("ACTIVATE JARVIS", { needsActivation: true });
          return;
        }

        URL.revokeObjectURL(pendingUrl);
        this.setMicrophoneEnabled(true);
        this.setVoice("TTS FAILED");
        this.scheduleListening(900);
      }
      return;
    }

    if (!this.greetingUrl) {
      void this.checkServiceAndGreet();
      return;
    }

    try {
      await this.playGreeting();
    } catch (error) {
      console.error("[JARVIS activation]", error);
      this.setVoice(error?.jarvisVoiceState || (isAutoplayBlocked(error) ? "ACTIVATE JARVIS" : "TTS FAILED"), {
        needsActivation: isAutoplayBlocked(error),
      });
    }
  }

  async playGreeting() {
    if (!this.active || this.greeted || this.greetingPlaying || !this.greetingUrl) return;

    this.greetingPlaying = true;
    try {
      this.setVoice("SPEAKING", { needsActivation: false, transcript: "" });
      await this.playAudioUrl(this.greetingUrl);
      if (!this.active) return;

      this.greeted = true;
      await this.ensureMicrophone();
      this.startListening();
    } finally {
      this.greetingPlaying = false;
    }
  }

  async requestTts(text) {
    const response = await fetchWithTimeout(
      `${LOCAL_AI}/tts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
      70_000,
    );

    if (!response.ok) {
      throw new Error(await responseError(response, `TTS ${response.status}`));
    }

    const audio = await response.blob();
    if (!audio.size) throw new Error("Local TTS returned an empty audio response.");
    return audio;
  }

  async playAudioUrl(url) {
    this.stopListening(false);
    this.setMicrophoneEnabled(false);

    const audio = new Audio(url);
    audio.preload = "auto";
    this.currentAudio = audio;

    try {
      // Calling play before awaiting preserves the browser's user-activation context.
      await audio.play();
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("Audio playback failed."));
      });
    } finally {
      if (this.currentAudio === audio) this.currentAudio = null;
      audio.onended = null;
      audio.onerror = null;
      audio.src = "";
    }
  }

  async ensureMicrophone() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone capture.");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is unavailable.");

      this.audioContext = new AudioContextClass();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1_024;
      this.analyser.smoothingTimeConstant = 0.65;
      this.analyserSamples = new Uint8Array(this.analyser.fftSize);

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      this.source = source;

      await this.resumeAudioContext();
    } catch (error) {
      this.releaseMicrophone();

      const domError = error instanceof DOMException ? error.name : "";
      const state =
        domError === "NotAllowedError" || domError === "SecurityError"
          ? "MIC DENIED"
          : domError === "NotFoundError" || domError === "NotReadableError"
            ? "MIC UNAVAILABLE"
            : "MIC ERROR";

      if (error && typeof error === "object") error.jarvisVoiceState = state;
      console.error("[JARVIS microphone]", error);
      this.setVoice(state);
      throw error;
    }
  }

  async resumeAudioContext() {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  setMicrophoneEnabled(enabled) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  startListening() {
    if (
      !this.active ||
      !this.greeted ||
      this.processing ||
      this.recording ||
      this.currentAudio ||
      this.pendingSpeechUrl ||
      !this.stream ||
      !this.analyser
    ) {
      return;
    }

    try {
      this.setMicrophoneEnabled(true);
      if (!("MediaRecorder" in window)) {
        throw new Error("MediaRecorder is unavailable in this browser.");
      }
      const options = supportedRecorderOptions();
      const recorder = options
        ? new MediaRecorder(this.stream, options)
        : new MediaRecorder(this.stream);

      const recording = {
        recorder,
        chunks: [],
        startedAt: performance.now(),
        firstVoiceAt: null,
        lastVoiceAt: null,
        speechStarted: false,
        stopping: false,
        process: false,
        frame: null,
      };

      this.recorder = recorder;
      this.recording = recording;

      recorder.ondataavailable = (event) => {
        if (event.data.size) recording.chunks.push(event.data);
      };
      recorder.onstop = () => {
        void this.handleRecordingStop(recording);
      };
      recorder.onerror = (event) => {
        console.error("[JARVIS recorder]", event.error || event);
      };

      recorder.start(250);
      this.setVoice("LISTENING", { transcript: "" });
      this.monitorVoiceActivity(recording);
    } catch (error) {
      console.error("[JARVIS recorder setup]", error);
      this.setVoice("MIC ERROR");
    }
  }

  monitorVoiceActivity(recording) {
    const tick = () => {
      if (!this.active || this.recording !== recording || recording.stopping) return;

      const now = performance.now();
      const rms = readRms(this.analyser, this.analyserSamples);

      if (rms >= VAD_CONFIG.startRms) {
        if (!recording.speechStarted) {
          recording.speechStarted = true;
          recording.firstVoiceAt = now;
          this.setVoice("HEARING");
        }
        recording.lastVoiceAt = now;
      } else if (recording.speechStarted && rms >= VAD_CONFIG.continueRms) {
        recording.lastVoiceAt = now;
      }

      if (
        recording.speechStarted &&
        now - recording.firstVoiceAt >= VAD_CONFIG.maxUtteranceMs
      ) {
        this.stopRecording(recording, true);
        return;
      }

      if (
        recording.speechStarted &&
        now - recording.lastVoiceAt >= VAD_CONFIG.silenceMs
      ) {
        this.stopRecording(recording, true);
        return;
      }

      if (
        !recording.speechStarted &&
        now - recording.startedAt >= VAD_CONFIG.noSpeechTimeoutMs
      ) {
        this.stopRecording(recording, false);
        return;
      }

      recording.frame = window.requestAnimationFrame(tick);
    };

    recording.frame = window.requestAnimationFrame(tick);
  }

  stopListening(processSpeech = false) {
    if (this.recording) this.stopRecording(this.recording, processSpeech);
  }

  stopRecording(recording, processSpeech) {
    if (this.recording !== recording || recording.stopping) return;

    recording.stopping = true;
    recording.process = processSpeech && recording.speechStarted;
    if (recording.frame) window.cancelAnimationFrame(recording.frame);

    if (recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    }
  }

  async handleRecordingStop(recording) {
    if (this.recording !== recording) return;
    this.recording = null;
    this.recorder = null;

    if (!this.active) return;
    if (!recording.process) {
      this.scheduleListening(120);
      return;
    }

    const mimeType = recording.recorder.mimeType || "audio/webm";
    const audio = new Blob(recording.chunks, { type: mimeType });
    if (audio.size < VAD_CONFIG.minAudioBytes) {
      this.scheduleListening(120);
      return;
    }

    this.processing = true;
    let retryDelay = 0;
    let shouldResumeListening = true;

    try {
      this.setVoice("TRANSCRIBING");
      const transcript = await this.transcribe(audio);
      if (!this.active) {
        shouldResumeListening = false;
      } else if (!transcript) {
        retryDelay = 120;
      } else {
        this.publish({ transcript });
        shouldResumeListening = await this.askLocalAi(transcript);
      }
    } catch (error) {
      console.error("[JARVIS transcription]", error);
      this.setVoice("TRANSCRIPTION FAILED");
      retryDelay = 1_000;
    } finally {
      this.processing = false;
      if (this.active && shouldResumeListening) this.scheduleListening(retryDelay);
    }
  }

  async transcribe(audio) {
    const response = await fetchWithTimeout(
      `${LOCAL_AI}/transcribe`,
      {
        method: "POST",
        headers: { "Content-Type": audio.type || "application/octet-stream" },
        body: audio,
      },
      45_000,
    );

    if (!response.ok) {
      throw new Error(await responseError(response, `Transcription ${response.status}`));
    }

    const payload = await response.json();
    return String(payload?.text || "").trim();
  }

  async askLocalAi(prompt) {
    this.setVoice("THINKING");

    const apiUrl =
      import.meta.env.VITE_API_URL ||
      window.location.origin;

    let response;

    try {
      response = await fetchWithTimeout(
        `${apiUrl}/api/jarvis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        },
        190_000,
      );
    } catch (error) {
      console.error("[JARVIS router]", error);
      this.setVoice("JARVIS FAILED");
      return true;
    }

    if (!response.ok) {
      const detail = await responseError(response, `JARVIS ${response.status}`);
      console.error("[JARVIS router]", detail);
      this.setVoice("JARVIS FAILED");
      return true;
    }

    const payload = await response.json();
    const answer = String(payload?.answer || "").trim();

    if (!answer) {
      console.error("[JARVIS router] Empty response.");
      this.setVoice("JARVIS FAILED");
      return true;
    }

    return this.speakAnswer(answer);
  }

  async speakAnswer(answer) {
    this.stopListening(false);
    this.setMicrophoneEnabled(false);
    this.setVoice("SPEAKING");

    let audioUrl = null;
    let resumeMicrophone = true;
    try {
      const audio = await this.requestTts(answer);
      if (!this.active) return;

      audioUrl = URL.createObjectURL(audio);
      await this.playAudioUrl(audioUrl);
    } catch (error) {
      console.error("[JARVIS TTS]", error);
      if (isAutoplayBlocked(error) && audioUrl) {
        this.pendingSpeechUrl = audioUrl;
        audioUrl = null;
        resumeMicrophone = false;
        this.setVoice("ACTIVATE JARVIS", { needsActivation: true });
        return false;
      }

      this.setVoice("TTS FAILED");
      return true;
    } finally {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (resumeMicrophone) this.setMicrophoneEnabled(true);
    }

    return true;
  }

  scheduleListening(delayMs) {
    window.clearTimeout(this.listenTimer);
    this.listenTimer = window.setTimeout(() => this.startListening(), delayMs);
  }

  releaseMicrophone() {
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.analyserSamples = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  stop() {
    this.active = false;
    window.clearTimeout(this.healthTimer);
    window.clearTimeout(this.listenTimer);
    this.stopListening(false);

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = null;
    }

    if (this.greetingUrl) URL.revokeObjectURL(this.greetingUrl);
    this.greetingUrl = null;
    if (this.pendingSpeechUrl) URL.revokeObjectURL(this.pendingSpeechUrl);
    this.pendingSpeechUrl = null;
    this.releaseMicrophone();
  }
}

export function useLocalVoiceAssistant() {
  const [voice, setVoice] = useState(INITIAL_VOICE);
  const assistantRef = useRef(null);

  useEffect(() => {
    const assistant = new LocalVoiceAssistant((change) => {
      setVoice((current) => ({ ...current, ...change }));
    });

    assistantRef.current = assistant;
    void assistant.start();

    return () => {
      assistant.stop();
      assistantRef.current = null;
    };
  }, []);

  const activate = useCallback(() => {
    void assistantRef.current?.activate();
  }, []);

  return { ...voice, activate };
}
