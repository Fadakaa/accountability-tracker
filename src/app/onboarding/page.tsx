"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────

interface OnboardingMessage {
  role: "coach" | "user";
  content: string;
}

interface OnboardingStep {
  id: string;
  coachMessage: string;
  type: "text" | "choice" | "multi-choice";
  choices?: { label: string; value: string }[];
  placeholder?: string;
}

// ─── Onboarding Steps ───────────────────────────────────────

const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    coachMessage:
      "Welcome. I'm your accountability coach. Before we start — understand this: this system only works if you're honest with it. Miss a day? Record it. Fail? Own it. The numbers don't lie, and neither should you.\n\nLet's find out what you're working with. What's your name?",
    type: "text",
    placeholder: "Your name",
  },
  {
    id: "goal",
    coachMessage:
      "Good. Now tell me — what's the ONE thing you want to change most right now? Don't give me five things. Give me the one that keeps you up at night.",
    type: "text",
    placeholder: "The one thing you want to change...",
  },
  {
    id: "struggle",
    coachMessage:
      "Respect for being specific. Now the harder question — what's been stopping you? What pattern do you keep falling into?",
    type: "text",
    placeholder: "What keeps getting in the way...",
  },
  {
    id: "time",
    coachMessage:
      "When are you at your best? When does your discipline peak — and when does it collapse?",
    type: "choice",
    choices: [
      { label: "🌅 Morning person", value: "morning" },
      { label: "☀️ Midday peak", value: "midday" },
      { label: "🌙 Night owl", value: "evening" },
      { label: "🎲 Inconsistent", value: "inconsistent" },
    ],
  },
  {
    id: "intensity",
    coachMessage:
      "How hard do you want to be pushed? Some people need gentle nudges. Others need someone who won't let them quit. There's no wrong answer — but be honest.",
    type: "choice",
    choices: [
      { label: "Steady & supportive", value: "gentle" },
      { label: "Direct & honest", value: "direct" },
      { label: "Push me hard", value: "intense" },
      { label: "Full Goggins mode", value: "goggins" },
    ],
  },
  {
    id: "commitment",
    coachMessage:
      "Last question. How many days per week are you willing to show up — not hoping to, but *committing* to? Pick a number you'd bet money on.",
    type: "choice",
    choices: [
      { label: "3-4 days", value: "3-4" },
      { label: "5 days", value: "5" },
      { label: "6 days", value: "6" },
      { label: "Every single day", value: "7" },
    ],
  },
];

const CLOSING_MESSAGE = `Good. I've got what I need.

Here's what happens now: you track honestly, every day. The app shows your streaks, your XP, your patterns. I'll be here to analyze your data, call out your blind spots, and suggest experiments to push you forward.

*"We are what we repeatedly do. Excellence, then, is not an act, but a habit."* — Aristotle

Your Day 1 starts now. Let's go.`;

// ─── Component ──────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<OnboardingMessage[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [coachTyping, setCoachTyping] = useState(true);
  const [completed, setCompleted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Show first coach message with typing delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setMessages([{ role: "coach", content: STEPS[0].coachMessage }]);
      setCoachTyping(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, coachTyping]);

  function handleAnswer(value: string) {
    const step = STEPS[currentStep];
    const displayValue =
      step.type === "choice" || step.type === "multi-choice"
        ? step.choices?.find((c) => c.value === value)?.label || value
        : value;

    // Save answer
    const newAnswers = { ...answers, [step.id]: value };
    setAnswers(newAnswers);

    // Add user message
    const newMessages: OnboardingMessage[] = [
      ...messages,
      { role: "user", content: displayValue },
    ];
    setMessages(newMessages);
    setInputValue("");

    const nextStep = currentStep + 1;

    if (nextStep < STEPS.length) {
      // Show next coach message after delay
      setCoachTyping(true);
      setCurrentStep(nextStep);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "coach", content: STEPS[nextStep].coachMessage },
        ]);
        setCoachTyping(false);
      }, 800 + Math.random() * 600);
    } else {
      // Onboarding complete — show closing message
      setCoachTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "coach", content: CLOSING_MESSAGE },
        ]);
        setCoachTyping(false);
        setCompleted(true);
        // Save onboarding data
        saveOnboardingData(newAnswers);
      }, 1000);
    }
  }

  async function saveOnboardingData(data: Record<string, string>) {
    // Mark onboarding as complete in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("accountability-onboarded", "true");
      localStorage.setItem("accountability-onboarding-data", JSON.stringify(data));
    }

    // Also save to Supabase if possible
    if (user) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("coach_conversations").insert({
          user_id: user.id,
          messages: messages.map((m) => ({
            role: m.role === "coach" ? "assistant" : "user",
            content: m.content,
            timestamp: new Date().toISOString(),
          })),
          summary: `Onboarding: Goal="${data.goal}", Struggle="${data.struggle}", Peak time=${data.time}, Intensity=${data.intensity}, Commitment=${data.commitment} days/week`,
        });
      } catch {
        // Silent fail — localStorage has the data
      }
    }
  }

  function handleStart() {
    router.push("/");
  }

  const step = currentStep < STEPS.length ? STEPS[currentStep] : null;

  return (
    <div className="flex flex-col min-h-screen bg-surface-900">
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand/30 to-brand/10 flex items-center justify-center border border-brand/20">
            <span className="text-lg">🧠</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Coach</h1>
            <p className="text-[11px] text-neutral-500 -mt-0.5">Let&apos;s get to know you</p>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-2xl p-4 transition-all ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-brand/10 to-brand/5 border border-brand/15 ml-10"
                  : "bg-gradient-to-br from-surface-800 to-surface-800/60 border border-surface-700/60 mr-4"
              }`}
            >
              {msg.role === "coach" && (
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-5 h-5 rounded-lg bg-brand/15 flex items-center justify-center">
                    <span className="text-[10px]">🧠</span>
                  </div>
                  <span className="text-[11px] font-semibold text-neutral-400">Coach</span>
                </div>
              )}
              <div className="text-[13px] text-neutral-300 leading-relaxed whitespace-pre-line">
                <FormattedText text={msg.content} />
              </div>
            </div>
          ))}

          {coachTyping && (
            <div className="rounded-2xl bg-gradient-to-br from-surface-800 to-surface-800/60 border border-surface-700/60 p-4 mr-4">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-brand animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0.15s]" />
                  <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {!coachTyping && !completed && step && (
        <div className="px-5 pb-6 pt-2">
          {step.type === "text" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputValue.trim()) handleAnswer(inputValue.trim());
                }}
                placeholder={step.placeholder}
                autoFocus
                className="flex-1 bg-surface-800/80 rounded-2xl px-4 py-3.5 text-sm text-neutral-300 border border-surface-700/50 outline-none focus:border-brand/50 focus:bg-surface-800 placeholder:text-neutral-600 transition-all"
              />
              <button
                onClick={() => {
                  if (inputValue.trim()) handleAnswer(inputValue.trim());
                }}
                disabled={!inputValue.trim()}
                className="rounded-2xl bg-gradient-to-r from-brand to-brand-dark px-5 py-3.5 text-sm font-bold text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-brand/20 active:scale-[0.97]"
              >
                →
              </button>
            </div>
          )}

          {(step.type === "choice" || step.type === "multi-choice") && (
            <div className="grid grid-cols-2 gap-2">
              {step.choices?.map((choice) => (
                <button
                  key={choice.value}
                  onClick={() => handleAnswer(choice.value)}
                  className="rounded-2xl bg-surface-800/80 border border-surface-700/50 px-4 py-3.5 text-sm text-neutral-300 font-medium hover:border-brand/40 hover:bg-surface-800 transition-all active:scale-[0.97] text-left"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Start Button */}
      {completed && !coachTyping && (
        <div className="px-5 pb-8 pt-2">
          <button
            onClick={handleStart}
            className="w-full rounded-2xl bg-gradient-to-r from-brand to-brand-dark py-4 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:shadow-brand/40 transition-all active:scale-[0.97]"
          >
            Begin Day 1 →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Simple text formatter (bold + italic) ──────────────────

function FormattedText({ text }: { text: string }) {
  // Handle bold (**text**) and italic (*text*)
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-neutral-200 font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i} className="text-neutral-400 italic">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
