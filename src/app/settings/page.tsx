"use client";

import { useState, useEffect } from "react";
import { loadSettings, saveSettings } from "@/lib/store";
import type { UserSettings, HabitOverride } from "@/lib/store";
import { HABITS, DEFAULT_QUOTES } from "@/lib/habits";
import type { QuoteCategory } from "@/lib/habits";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { getHabitLevel } from "@/lib/habits";
import type { Habit, HabitStack } from "@/types/database";
import { DEFAULT_TREE_BRANCHES, getHabitBranch } from "@/lib/treeBranches";

const STACKS: { key: HabitStack; label: string; icon: string }[] = [
  { key: "morning", label: "AM", icon: "🌅" },
  { key: "midday", label: "Mid", icon: "☀️" },
  { key: "evening", label: "PM", icon: "🌙" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);

  useEffect(() => {
    setSettings(loadSettings());
    setHabits(getResolvedHabits());
  }, []);

  if (!settings) return null;

  // Group habits by stack
  const byStack: Record<HabitStack, Habit[]> = {
    morning: [],
    midday: [],
    evening: [],
  };
  for (const h of habits) {
    if (h.is_active) byStack[h.stack].push(h);
  }
  const inactiveHabits = habits.filter((h) => !h.is_active);

  // Persist changes immediately
  function updateHabit(habitId: string, overrideUpdate: Partial<HabitOverride>) {
    if (!settings) return;
    const newSettings = {
      ...settings,
      habitOverrides: {
        ...settings.habitOverrides,
        [habitId]: {
          ...settings.habitOverrides[habitId],
          ...overrideUpdate,
        },
      },
    };
    setSettings(newSettings);
    saveSettings(newSettings);
    // Refresh habits
    setHabits(getResolvedHabits());
  }

  function updateCheckinTime(stack: HabitStack, time: string) {
    if (!settings) return;
    const newSettings = {
      ...settings,
      checkinTimes: {
        ...settings.checkinTimes,
        [stack]: time,
      },
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  }

  function moveHabit(habit: Habit, direction: "up" | "down") {
    const stackHabits = habits
      .filter((h) => h.stack === habit.stack && h.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = stackHabits.findIndex((h) => h.id === habit.id);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === stackHabits.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const swapHabit = stackHabits[swapIdx];

    // Swap sort orders
    updateHabit(habit.id, { sort_order: swapHabit.sort_order });
    updateHabit(swapHabit.id, { sort_order: habit.sort_order });
  }

  function resetToDefaults() {
    const newSettings: UserSettings = {
      habitOverrides: {},
      levelUpStates: settings?.levelUpStates ?? {},
      checkinTimes: { morning: "07:00", midday: "13:00", evening: "21:00" },
      customQuotes: [],
      hiddenQuoteIds: [],
      routineChains: { morning: [], midday: [], evening: [] },
    };
    setSettings(newSettings);
    saveSettings(newSettings);
    setHabits(getResolvedHabits());
  }

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">⚙️ Settings</h1>
      </header>

      {/* Check-in Schedule */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
          Check-in Schedule
        </h2>
        <p className="text-xs text-neutral-600 mb-4">
          Set when you want to be reminded to log habits
        </p>
        <div className="space-y-3">
          {STACKS.map((stack) => (
            <div key={stack.key} className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-2">
                <span>{stack.icon}</span>
                <span className="text-neutral-300 capitalize">{stack.key}</span>
              </span>
              <input
                type="time"
                value={settings.checkinTimes[stack.key]}
                onChange={(e) => updateCheckinTime(stack.key, e.target.value)}
                className="bg-surface-700 rounded-lg px-3 py-2 text-sm text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Habit Management */}
      <section className="mb-6">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
          Habits by Stack
        </h2>
        <p className="text-xs text-neutral-600 mb-4">
          Move habits between stacks, toggle bare minimum status, or deactivate
        </p>

        {STACKS.map((stack) => (
          <div key={stack.key} className="mb-6">
            <h3 className="text-xs font-bold text-brand uppercase tracking-wider mb-2 flex items-center gap-1">
              {stack.icon} {stack.key}
            </h3>
            <div className="space-y-2">
              {byStack[stack.key]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((habit, idx) => (
                  <HabitSettingsRow
                    key={habit.id}
                    habit={habit}
                    settings={settings}
                    isFirst={idx === 0}
                    isLast={idx === byStack[stack.key].length - 1}
                    onStackChange={(newStack) => {
                      // Move to end of target stack
                      const targetHabits = habits.filter((h) => h.stack === newStack && h.is_active);
                      const maxOrder = targetHabits.reduce((max, h) => Math.max(max, h.sort_order), 0);
                      updateHabit(habit.id, { stack: newStack, sort_order: maxOrder + 1 });
                    }}
                    onBareMinToggle={() => {
                      updateHabit(habit.id, { is_bare_minimum: !habit.is_bare_minimum });
                    }}
                    onBranchChange={(branchId) => {
                      updateHabit(habit.id, { treeBranch: branchId });
                    }}
                    onDeactivate={() => {
                      updateHabit(habit.id, { is_active: false });
                    }}
                    onMoveUp={() => moveHabit(habit, "up")}
                    onMoveDown={() => moveHabit(habit, "down")}
                  />
                ))}
              {byStack[stack.key].length === 0 && (
                <p className="text-xs text-neutral-600 italic py-2">
                  No habits in this stack
                </p>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Inactive Habits */}
      {inactiveHabits.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
            Inactive Habits
          </h2>
          <div className="space-y-2">
            {inactiveHabits.map((habit) => (
              <div
                key={habit.id}
                className="flex items-center justify-between rounded-xl bg-surface-800/50 border border-surface-700/50 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm text-neutral-500">
                  <span>{habit.icon}</span>
                  <span>{habit.name}</span>
                </span>
                <button
                  onClick={() => updateHabit(habit.id, { is_active: true })}
                  className="text-xs text-brand hover:text-brand-dark font-medium transition-colors"
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quotes Management */}
      <QuotesSection settings={settings} onUpdate={(newSettings) => { setSettings(newSettings); saveSettings(newSettings); }} />

      {/* Reset */}
      <section className="mb-6">
        <button
          onClick={resetToDefaults}
          className="w-full rounded-xl border border-surface-700 py-3 text-sm text-neutral-500 hover:text-neutral-300 hover:border-neutral-600 transition-colors"
        >
          Reset All Settings to Default
        </button>
      </section>

      {/* Back */}
      <div className="mt-auto pt-4 pb-4">
        <a
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-surface-800 hover:bg-surface-700 transition-colors"
        >
          🏠 Dashboard
        </a>
      </div>
    </div>
  );
}

// ─── Habit Settings Row ─────────────────────────────────────
function HabitSettingsRow({
  habit,
  settings,
  isFirst,
  isLast,
  onStackChange,
  onBareMinToggle,
  onBranchChange,
  onDeactivate,
  onMoveUp,
  onMoveDown,
}: {
  habit: Habit;
  settings: UserSettings;
  isFirst: boolean;
  isLast: boolean;
  onStackChange: (stack: HabitStack) => void;
  onBareMinToggle: () => void;
  onBranchChange: (branchId: string) => void;
  onDeactivate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const level = getHabitLevel(habit.id, habit.current_level);

  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 overflow-hidden">
      {/* Main row — tap to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{habit.icon}</span>
          <div>
            <span className="text-sm font-semibold">{habit.name}</span>
            {level && (
              <span className="text-xs text-neutral-500 ml-2">
                Lv.{habit.current_level}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {habit.is_bare_minimum && (
            <span className="text-[10px] text-brand font-bold uppercase">
              Min
            </span>
          )}
          <span className="text-neutral-600 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded controls */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-700 pt-3 space-y-3">
          {/* Stack selector */}
          <div>
            <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1 block">
              Stack
            </label>
            <div className="flex gap-1.5">
              {STACKS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => onStackChange(s.key)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                    habit.stack === s.key
                      ? "bg-brand text-white"
                      : "bg-surface-700 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tree branch picker */}
          <div>
            <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1 block">
              Tree Branch
            </label>
            <div className="flex gap-1.5">
              {DEFAULT_TREE_BRANCHES.map((b) => {
                const currentBranch = getHabitBranch(habit, settings);
                return (
                  <button
                    key={b.id}
                    onClick={() => onBranchChange(b.id)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                      currentBranch === b.id
                        ? "bg-brand text-white"
                        : "bg-surface-700 text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {b.icon} {b.name.slice(0, 4)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bare minimum toggle */}
          {habit.category === "binary" && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Non-negotiable (bare minimum)</span>
              <button
                onClick={onBareMinToggle}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  habit.is_bare_minimum ? "bg-brand" : "bg-surface-600"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    habit.is_bare_minimum ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Reorder */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Reorder</span>
            <div className="flex gap-1">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  isFirst
                    ? "bg-surface-700/50 text-neutral-700"
                    : "bg-surface-700 text-neutral-400 hover:text-white"
                }`}
              >
                ↑
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  isLast
                    ? "bg-surface-700/50 text-neutral-700"
                    : "bg-surface-700 text-neutral-400 hover:text-white"
                }`}
              >
                ↓
              </button>
            </div>
          </div>

          {/* Deactivate */}
          <button
            onClick={onDeactivate}
            className="w-full rounded-lg border border-missed/30 py-2 text-xs text-missed hover:bg-missed/10 transition-colors"
          >
            Deactivate Habit
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Quotes Management ─────────────────────────────────────
const CATEGORY_LABELS: Record<QuoteCategory, string> = {
  prompt: "Reflection",
  rule: "Rule",
  liner: "Mindset",
  strong_thought: "Discipline",
};

const CATEGORY_COLORS: Record<QuoteCategory, string> = {
  prompt: "text-blue-400",
  rule: "text-brand",
  liner: "text-done",
  strong_thought: "text-later",
};

function QuotesSection({ settings, onUpdate }: { settings: UserSettings; onUpdate: (s: UserSettings) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<QuoteCategory>("liner");

  const hiddenIds = new Set(settings.hiddenQuoteIds ?? []);
  const customQuotes = settings.customQuotes ?? [];

  function toggleDefault(quoteId: string) {
    const hidden = new Set(settings.hiddenQuoteIds ?? []);
    if (hidden.has(quoteId)) {
      hidden.delete(quoteId);
    } else {
      hidden.add(quoteId);
    }
    onUpdate({ ...settings, hiddenQuoteIds: Array.from(hidden) });
  }

  function addCustomQuote() {
    if (!newText.trim()) return;
    const quote = {
      id: `cq-${Date.now()}`,
      text: newText.trim(),
      category: newCategory,
      isDefault: false as const,
    };
    onUpdate({
      ...settings,
      customQuotes: [...customQuotes, quote],
    });
    setNewText("");
    setShowAdd(false);
  }

  function removeCustomQuote(quoteId: string) {
    onUpdate({
      ...settings,
      customQuotes: customQuotes.filter((q) => q.id !== quoteId),
    });
  }

  return (
    <section className="mb-6">
      <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
        Motivational Quotes
      </h2>
      <p className="text-xs text-neutral-600 mb-4">
        Toggle default quotes on/off or add your own
      </p>

      {/* Custom quotes */}
      {customQuotes.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] font-bold text-done uppercase tracking-wider mb-2">Your Quotes</h3>
          <div className="space-y-2">
            {customQuotes.map((q) => (
              <div key={q.id} className="flex items-start gap-2 rounded-lg bg-surface-800 border border-surface-700 px-3 py-2">
                <span className={`text-[10px] font-bold uppercase mt-0.5 ${CATEGORY_COLORS[q.category as QuoteCategory] ?? "text-neutral-500"}`}>
                  {CATEGORY_LABELS[q.category as QuoteCategory] ?? q.category}
                </span>
                <p className="flex-1 text-xs text-neutral-300 italic">{q.text}</p>
                <button
                  onClick={() => removeCustomQuote(q.id)}
                  className="text-xs text-neutral-600 hover:text-missed transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add button / form */}
      {showAdd ? (
        <div className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter your quote..."
            rows={2}
            className="w-full bg-surface-700 rounded-lg px-3 py-2 text-sm text-white border-none outline-none resize-none focus:ring-2 focus:ring-brand/50 mb-3"
          />
          <div className="flex gap-1.5 mb-3">
            {(Object.keys(CATEGORY_LABELS) as QuoteCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setNewCategory(cat)}
                className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase transition-colors ${
                  newCategory === cat
                    ? "bg-brand text-white"
                    : "bg-surface-700 text-neutral-500"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={addCustomQuote}
              disabled={!newText.trim()}
              className="flex-1 rounded-lg py-2 text-sm font-bold bg-done text-white disabled:opacity-40 active:scale-95 transition-all"
            >
              Add Quote
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewText(""); }}
              className="flex-1 rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-400 active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-xl border border-dashed border-surface-600 py-3 text-sm text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 transition-colors mb-4"
        >
          + Add Custom Quote
        </button>
      )}

      {/* Default quotes by category */}
      {(Object.keys(CATEGORY_LABELS) as QuoteCategory[]).map((cat) => {
        const catQuotes = DEFAULT_QUOTES.filter((q) => q.category === cat);
        if (catQuotes.length === 0) return null;
        return (
          <div key={cat} className="mb-3">
            <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${CATEGORY_COLORS[cat]}`}>
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="space-y-1">
              {catQuotes.map((q) => {
                const isHidden = hiddenIds.has(q.id);
                return (
                  <button
                    key={q.id}
                    onClick={() => toggleDefault(q.id)}
                    className={`w-full text-left flex items-start gap-2 rounded-lg px-3 py-2 transition-colors ${
                      isHidden ? "bg-surface-800/30 opacity-40" : "bg-surface-800"
                    }`}
                  >
                    <span className="text-xs mt-0.5 shrink-0">{isHidden ? "⬜" : "✅"}</span>
                    <p className="text-xs text-neutral-400 italic">{q.text}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
