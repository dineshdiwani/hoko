import { registerPlugin } from "@capacitor/core";
import { isNativeAppRuntime } from "../utils/runtime";

const NativeSpeechInput = registerPlugin("SpeechInput");

function getWebSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export async function captureSpeechInput({ language = "en-IN" } = {}) {
  if (isNativeAppRuntime()) {
    const result = await NativeSpeechInput.start({ language });
    return String(result?.text || "").trim();
  }

  const SpeechRecognition = getWebSpeechRecognitionCtor();
  if (!SpeechRecognition) {
    throw new Error("Speech recognition is not supported in this browser.");
  }

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      const code = String(err?.name || "");
      if (code === "NotAllowedError" || code === "PermissionDeniedError") {
        throw new Error("Mic permission denied.");
      }
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.interimResults = false;
    recognition.continuous = false;
    let settled = false;

    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript || "";
      }
      const trimmed = transcript.trim();
      if (trimmed) {
        finish(trimmed);
      } else {
        fail(new Error("No speech detected."));
      }
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || "");
      if (code === "not-allowed" || code === "service-not-allowed") {
        fail(new Error("Mic permission denied."));
      } else if (code === "no-speech") {
        fail(new Error("No speech detected."));
      } else {
        fail(new Error("Voice input failed."));
      }
    };

    recognition.onend = () => {
      if (!settled) {
        fail(new Error("Voice input stopped."));
      }
    };

    try {
      recognition.start();
    } catch (err) {
      fail(err);
    }
  });
}
