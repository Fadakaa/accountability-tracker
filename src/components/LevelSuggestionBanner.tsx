"use client";

import { useState, useEffect } from "react";
import {
  evaluateLevelSuggestions,
  acceptLevelUp,
  declineLevelUp,
  acceptDropBack,
} from "@/lib/adaptive";
import type { LevelSuggestion } from "@/lib/adaptive";

export default function LevelSuggestionBanner() {
  const [suggestions, setSuggestions] = useState<LevelSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSuggestions(evaluateLevelSuggestions());
  }, []);

  const visible = suggestions.filter((s) => !dismissed.has(s.habitId));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {visible.map((s) => (
        <div
          key={s.habitId}
          className={`rounded-xl border p-4 ${
            s.type === "level_up"
              ? "bg-done/10 border-done/30"
              : "bg-later/10 border-later/30"
          }`}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{s.habitIcon}</span>
            <div>
              <span className="text-sm font-bold">
                {s.type === "level_up" ? "Ready to level up!" : "Consider stepping back"}
              </span>
              <div className="text-xs text-neutral-400">
                {s.habitName} — Lv.{s.currentLevel}
              </div>
            </div>
          </div>

          {/* Message */}
          <p className="text-sm text-neutral-300 mb-3">
            {s.type === "level_up" ? (
              <>
                You&rsquo;ve nailed {s.habitName} for 14+ days. Ready to raise the bar?
                <br />
                <span className="text-done font-semibold">
                  New minimum: Lv.{s.nextLevel} — {s.nextLevelLabel}
                </span>
              </>
            ) : (
              <>
                Looks like Lv.{s.currentLevel} is tough right now. No shame — protecting
                the streak matters more.
                <br />
                <span className="text-later font-semibold">
                  Drop to: Lv.{s.nextLevel} — {s.nextLevelLabel}
                </span>
              </>
            )}
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {s.type === "level_up" ? (
              <>
                <button
                  onClick={() => {
                    acceptLevelUp(s.habitId);
                    setDismissed((prev) => new Set(prev).add(s.habitId));
                  }}
                  className="flex-1 rounded-lg bg-done py-2 text-sm font-bold text-white active:scale-95 transition-all"
                >
                  Level Me Up (+150 XP)
                </button>
                <button
                  onClick={() => {
                    declineLevelUp(s.habitId);
                    setDismissed((prev) => new Set(prev).add(s.habitId));
                  }}
                  className="rounded-lg bg-surface-700 px-4 py-2 text-sm text-neutral-400 hover:text-neutral-300 transition-colors"
                >
                  Not Yet
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    acceptDropBack(s.habitId);
                    setDismissed((prev) => new Set(prev).add(s.habitId));
                  }}
                  className="flex-1 rounded-lg bg-later py-2 text-sm font-bold text-white active:scale-95 transition-all"
                >
                  Drop Back
                </button>
                <button
                  onClick={() => {
                    declineLevelUp(s.habitId);
                    setDismissed((prev) => new Set(prev).add(s.habitId));
                  }}
                  className="rounded-lg bg-surface-700 px-4 py-2 text-sm text-neutral-400 hover:text-neutral-300 transition-colors"
                >
                  Keep Current
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
