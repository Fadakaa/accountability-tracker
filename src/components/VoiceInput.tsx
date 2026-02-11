"use client";

import { useState, useRef, useCallback } from "react";

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
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setSupported(false);
      return;
    }

    const recognition = createRecognition();
    if (!recognition) {
      setSupported(false);
      return;
    }

    recognitionRef.current = recognition;

    recognition.continuous = true;
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

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
    setListening(true);
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

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
    <button
      type="button"
      onClick={listening ? stopListening : startListening}
      className={`rounded-lg transition-all active:scale-95 ${
        listening
          ? "bg-missed text-white animate-pulse"
          : "bg-surface-700 text-neutral-400 hover:text-neutral-200"
      } ${className}`}
      title={listening ? "Stop recording" : "Voice input"}
    >
      {listening ? "⏹️ Stop" : label}
    </button>
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
