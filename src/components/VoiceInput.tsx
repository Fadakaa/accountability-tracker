"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  className?: string;
  label?: string;
}

/**
 * Voice-to-text button using the Web Speech API.
 * Works on mobile browsers (Chrome, Safari) — tap to start, tap again to stop.
 * Appends transcribed text to the provided callback.
 */
export default function VoiceInput({ onTranscript, className = "", label = "🎤" }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  // Check API support on mount so the button renders correctly from the start
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      setSupported(false);
    }
  }, []);

  // Cleanup: abort any active recognition session on unmount to prevent
  // orphaned sessions that block future recognition attempts on mobile
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore — already stopped or destroyed
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    setError(null);

    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setSupported(false);
      return;
    }

    // Abort any lingering session before creating a new one.
    // Some mobile browsers only allow one active instance at a time.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    const recognition = createRecognition();
    if (!recognition) {
      setSupported(false);
      return;
    }

    recognitionRef.current = recognition;

    // continuous = false for reliable mobile behaviour.
    // Mobile Safari does not support continuous mode well — sessions die
    // immediately or after brief silence. For short dictations (notes,
    // reflections) a single-utterance capture is the correct approach.
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-GB";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      recognitionRef.current = null;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone blocked — check browser permissions");
      } else if (event.error === "no-speech") {
        // User didn't speak — not a real error, clear silently
        setError(null);
      } else if (event.error === "network") {
        setError("Network error — speech recognition needs internet");
      } else if (event.error === "aborted") {
        // Intentional abort (e.g. navigating away) — not an error
        setError(null);
      } else {
        setError("Voice input failed — try again");
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    // Wrap start() in try/catch — on mobile this can throw if permissions
    // are in a bad state or another recognition instance is still active.
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setError("Could not start voice input — try again");
    }
  }, [onTranscript]);

  const stopListening = useCallback(() => {
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

  // Click handler that stops event propagation so parent touch/click
  // handlers (e.g. the coach page swipe navigation) don't interfere.
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

  if (!supported) {
    // Show disabled state so user knows the feature exists but isn't available
    return (
      <button
        type="button"
        disabled
        className={`rounded-lg opacity-40 cursor-not-allowed ${className}`}
        title="Voice input not available in this browser — try opening in Chrome or Safari"
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRecognition(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const W = window as any;
  const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  return new SpeechRecognition();
}

// Type declaration for SpeechRecognitionEvent
interface SpeechRecognitionEvent {
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

// Type declaration for SpeechRecognitionErrorEvent
interface SpeechRecognitionErrorEvent {
  error: string;
}
