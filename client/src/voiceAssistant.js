const API_URL =
  "https://ai-api-playground.onrender.com";

const GREETING =
  "Hello sir, what can I do for you today?";

let recognition = null;
let speaking = false;
let restarting = false;

function setVoiceState(state) {
  document.documentElement.dataset.jarvisVoice = state;
  console.log("[JARVIS]", state);
}

async function speakWithRender(text) {
  const response = await fetch(
    `${API_URL}/api/tts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    }
  );

  if (!response.ok) {
    throw new Error(
      `TTS ${response.status}`
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  await new Promise((resolve) => {
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });

  URL.revokeObjectURL(url);
}

function speakBrowser(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }

    speechSynthesis.cancel();

    const u =
      new SpeechSynthesisUtterance(text);

    u.lang = "en-US";
    u.rate = 0.94;
    u.pitch = 0.90;
    u.volume = 1;

    u.onend = resolve;
    u.onerror = resolve;

    speechSynthesis.speak(u);
  });
}

async function speak(text) {
  if (!text || speaking) return;

  speaking = true;
  setVoiceState("SPEAKING");

  try {
    recognition?.stop();
  } catch {}

  try {
    await speakWithRender(text);
  } catch (err) {
    console.warn(
      "Render TTS failed:",
      err
    );

    await speakBrowser(text);
  }

  speaking = false;
  setVoiceState("LISTENING");

  startListening();
}

async function askJarvis(text) {
  const prompt =
    String(text || "").trim();

  if (!prompt || speaking) return;

  setVoiceState("THINKING");

  try {
    const response =
      await fetch(
        `${API_URL}/api/chat`,
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
      console.error(
        "JARVIS API ERROR:",
        data
      );

      /*
        Do NOT pretend this is an AI answer.
        Expose the real problem in console.
      */
      setVoiceState(
        "AI BACKEND ERROR"
      );

      return;
    }

    await speak(
      data.answer ||
        "Yes sir."
    );
  } catch (err) {
    console.error(
      "JARVIS CONNECTION ERROR:",
      err
    );

    setVoiceState(
      "AI BACKEND ERROR"
    );
  }
}

function startListening() {
  if (
    speaking ||
    recognition ||
    restarting
  ) {
    return;
  }

  const Recognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!Recognition) {
    setVoiceState(
      "VOICE UNSUPPORTED"
    );
    return;
  }

  recognition =
    new Recognition();

  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    restarting = false;
    setVoiceState("LISTENING");
  };

  recognition.onresult = (event) => {
    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      if (
        event.results[i].isFinal
      ) {
        const text =
          event.results[i][0]
            ?.transcript
            ?.trim();

        if (text) {
          void askJarvis(text);
        }
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn(
      "Speech recognition:",
      event.error
    );
  };

  recognition.onend = () => {
    recognition = null;

    if (
      !speaking &&
      !restarting
    ) {
      restarting = true;

      setTimeout(() => {
        restarting = false;
        startListening();
      }, 600);
    }
  };

  try {
    recognition.start();
  } catch {
    recognition = null;
  }
}

function initJarvisVoice() {
  setVoiceState("STARTING");

  /*
    Browser autoplay protection:
    first interaction unlocks audio.
  */
  const unlock = () => {
    document.removeEventListener(
      "pointerdown",
      unlock
    );

    void speak(GREETING);
  };

  document.addEventListener(
    "pointerdown",
    unlock,
    { once: true }
  );

  /*
    Try automatically as well.
  */
  setTimeout(() => {
    void speak(GREETING);
  }, 1200);
}

initJarvisVoice();
