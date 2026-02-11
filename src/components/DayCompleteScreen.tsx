"use client";

import { useState, useEffect } from "react";
import { getContextualQuote, getFlameIcon } from "@/lib/habits";

interface DayCompleteProps {
  habitsCompleted: number;
  habitsTotal: number;
  xpEarned: number;
  bareMinimumMet: boolean;
  isPerfect: boolean;
  bareMinimumStreak: number;
  onDismiss: () => void;
}

export default function DayCompleteScreen({
  habitsCompleted,
  habitsTotal,
  xpEarned,
  bareMinimumMet,
  isPerfect,
  bareMinimumStreak,
  onDismiss,
}: DayCompleteProps) {
  const [visible, setVisible] = useState(false);
  const [quote] = useState(() => getContextualQuote("streak_milestone").text);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss after 15 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 500);
    }, 15000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  function handleDismiss() {
    setVisible(false);
    setTimeout(onDismiss, 500);
  }

  const borderColor = isPerfect ? "#eab308" : bareMinimumMet ? "#22c55e" : "#3b82f6";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={handleDismiss}
    >
      <div
        className={`mx-6 max-w-sm w-full rounded-2xl border-2 p-8 text-center transition-all duration-700 ${
          visible ? "scale-100 translate-y-0" : "scale-90 translate-y-8"
        }`}
        style={{
          borderColor,
          backgroundColor: "rgb(20, 20, 25)",
          boxShadow: `0 0 40px ${borderColor}30`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tree animation */}
        <div className="text-6xl mb-4 animate-bounce">
          {isPerfect ? "🌟" : "🌳"}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black text-white mb-1">
          {isPerfect ? "Perfect Day" : "Day Complete"}
        </h1>

        {isPerfect && (
          <div className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider mb-4"
            style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
          >
            Flawless Execution
          </div>
        )}

        {/* Stats */}
        <div className="space-y-3 my-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">Habits completed</span>
            <span className="text-white font-bold">{habitsCompleted}/{habitsTotal}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">XP earned today</span>
            <span className="text-brand font-bold">+{xpEarned} XP</span>
          </div>
          {bareMinimumMet && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">BM streak</span>
              <span className="text-done font-bold">
                {getFlameIcon(bareMinimumStreak)} {bareMinimumStreak}d
              </span>
            </div>
          )}
        </div>

        {/* Status badge */}
        {bareMinimumMet && !isPerfect && (
          <div className="rounded-lg bg-done/10 border border-done/30 py-2 px-4 mb-4">
            <span className="text-xs text-done font-semibold">Bare minimum met. The system held.</span>
          </div>
        )}

        {/* Quote */}
        <p className="text-sm text-neutral-400 italic leading-relaxed mb-6">
          &ldquo;{quote}&rdquo;
        </p>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="w-full rounded-xl py-3 text-sm font-bold bg-surface-800 hover:bg-surface-700 text-neutral-300 transition-all active:scale-[0.98]"
        >
          {isPerfect ? "Rest well" : "Back to Dashboard"}
        </button>
      </div>
    </div>
  );
}
