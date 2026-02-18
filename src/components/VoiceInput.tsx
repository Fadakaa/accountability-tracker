"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { isCapacitor } from "@/lib/capacitorUtils";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  className?: string;
  label?: string;
}

/**
 * Voice-to-text button.
 * - On Capacitor (iOS/Android): uses native speech recognition via
 *   @capacitor-community/speech-recognition for reliable mobile support.
 * - On web: falls back to the Web Speech API (Chrome, Safari).
 * Tap to start, tap again to stop. Appends transcribed text via callback.
 */
export default function VoiceInput({ onTranscript, className = "", label = "🎤" }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Web Speech API ref (browser-only path)
  const recognitionRef = useRef<ReturnType<typeof createWebRecognition> | null>(null);

  // Native plugin ref — loaded dynamically to avoid SSR/web import issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativePluginRef = useRef<any>(null);

  // Track whether we're on Capacitor (set once on mount)
  const isNativeRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    async function checkSupport() {
      if (isCapacitor()) {
        isNativeRef.current = true;
        try {
          const { SpeechRecognition } = await import(
            "@capacitor-community/speech-recognition"
          );
          nativePluginRef.current = SpeechRecognition;
          const { available } = await SpeechRecognition.available();
          setSupported(available);
        } catch {
          setSupported(false);
        }
      } else {
        isNativeRef.current = false;
        if (
          typeof window !== "undefined" &&
          !("webkitSpeechRecognition" in window) &&
          !("SpeechRecognition" in window)
        ) {
          setSupported(false);
        }
      }
    }
    checkSupport();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isNativeRef.current && nativePluginRef.current) {
        try {
          nativePluginRef.current.stop();
          nativePluginRef.current.removeAllListeners();
        } catch {
          // Ignore cleanup errors
        }
      } else if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore — already stopped or destroyed
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  // ─── Native (Capacitor) path ───────────────────────────────────

  const startNativeListening = useCallback(async () => {
    const plugin = nativePluginRef.current;
    if (!plugin) return;

    try {
      // Check / request permissions
      const { speechRecognition } = await plugin.checkPermissions();
      if (speechRecognition !== "granted") {
        const result = await plugin.requestPermissions();
        if (result.speechRecognition !== "granted") {
          setError("Microphone permission denied — enable in Settings");
          return;
        }
      }

      setListening(true);
      setError(null);

      // start() returns { matches?: string[] } when partialResults is false
      const { matches } = await plugin.start({
        language: "en-GB",
        maxResults: 1,
        popup: false,
        partialResults: false,
      });

      if (matches && matches.length > 0) {
        const transcript = matches[0].trim();
        if (transcript) {
          onTranscript(transcript);
        }
      }
    } catch (err) {
      console.error("Native speech recognition error:", err);
      setError("Voice input failed — try again");
    } finally {
      setListening(false);
    }
  }, [onTranscript]);

  const stopNativeListening = useCallback(async () => {
    const plugin = nativePluginRef.current;
    if (!plugin) return;
    try {
      await plugin.stop();
    } catch {
      // Ignore — already stopped
    }
    setListening(false);
  }, []);

  // ─── Web Speech API path (browser) ─────────────────────────────

  const startWebListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setSupported(false);
      return;
    }

    // Abort any lingering session before creating a new one.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    const recognition = createWebRecognition();
    if (!recognition) {
      setSupported(false);
      return;
    }

    recognitionRef.current = recognition;

    // continuous = false for reliable mobile behaviour.
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-GB";

    recognition.onresult = (event: WebSpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = (event: WebSpeechRecognitionErrorEvent) => {
      setListening(false);
      recognitionRef.current = null;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone blocked — check browser permissions");
      } else if (event.error === "no-speech") {
        setError(null);
      } else if (event.error === "network") {
        setError("Network error — speech recognition needs internet");
      } else if (event.error === "aborted") {
        setError(null);
      } else {
        setError("Voice input failed — try again");
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setError("Could not start voice input — try again");
    }
  }, [onTranscript]);

  const stopWebListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore — already stopped
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  // ─── Unified handlers ──────────────────────────────────────────

  const startListening = useCallback(() => {
    setError(null);
    if (isNativeRef.current) {
      startNativeListening();
    } else {
      startWebListening();
    }
  }, [startNativeListening, startWebListening]);

  const stopListening = useCallback(() => {
    if (isNativeRef.current) {
      stopNativeListening();
    } else {
      stopWebListening();
    }
  }, [stopNativeListening, stopWebListening]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (listening) {
        stopListening();
      } else {
        startListening();
      }
    },
    [listening, startListening, stopListening]
  );

  // ─── Render ────────────────────────────────────────────────────

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className={`rounded-lg opacity-40 cursor-not-allowed ${className}`}
        title={
          isNativeRef.current
            ? "Voice input not available on this device"
            : "Voice input not available in this browser — try Chrome or Safari"
        }
      >
        🎤 N/A
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        onTouchEnd={(e) => e.stopPropagation()}
        className={`rounded-lg transition-all active:scale-95 ${
          listening
            ? "bg-missed text-white animate-pulse"
            : "bg-surface-700 text-neutral-400 hover:text-neutral-200"
        } ${className}`}
        title={listening ? "Stop recording" : "Voice input"}
      >
        {listening ? "⏹️ Stop" : label}
      </button>
      {error && (
        <span className="text-xs text-missed mt-1 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Web Speech API helpers ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createWebRecognition(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const W = window as any;
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

interface WebSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface WebSpeechRecognitionErrorEvent {
  error: string;
}
