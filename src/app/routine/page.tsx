"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { loadSettings, saveSettings } from "@/lib/store";
import type { UserSettings, ChainItem } from "@/lib/store";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import type { Habit, HabitStack } from "@/types/database";

// ─── Constants ──────────────────────────────────────────────
const STACKS: { key: HabitStack; label: string; icon: string; color: string }[] = [
  { key: "morning", label: "Morning", icon: "🌅", color: "#f97316" },
  { key: "midday", label: "Midday", icon: "☀️", color: "#3b82f6" },
  { key: "evening", label: "Evening", icon: "🌙", color: "#a78bfa" },
];

// ─── Component ──────────────────────────────────────────────
export default function RoutinePage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [dragItem, setDragItem] = useState<{ stack: HabitStack; index: number } | null>(null);
  const [showAddAnchor, setShowAddAnchor] = useState<HabitStack | null>(null);
  const [anchorLabel, setAnchorLabel] = useState("");
  const [anchorIcon, setAnchorIcon] = useState("📌");
  const [moveTarget, setMoveTarget] = useState<{ stack: HabitStack; index: number } | null>(null);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setHabits(getResolvedHabits());
  }, []);

  // Initialize chains from habits if empty
  const getChains = useCallback((): Record<HabitStack, ChainItem[]> => {
    if (!settings) return { morning: [], midday: [], evening: [] };

    const chains = { ...settings.routineChains };

    // If chains are empty, auto-populate from habits
    for (const stack of STACKS) {
      if (!chains[stack.key] || chains[stack.key].length === 0) {
        const stackHabits = habits
          .filter((h) => h.stack === stack.key && h.is_active)
          .sort((a, b) => a.sort_order - b.sort_order);

        chains[stack.key] = stackHabits.map((h) => ({
          id: `h-${h.id}`,
          type: "habit" as const,
          habitId: h.id,
        }));
      }
    }

    return chains;
  }, [settings, habits]);

  function persistChains(newChains: Record<HabitStack, ChainItem[]>) {
    if (!settings) return;
    const newSettings = { ...settings, routineChains: newChains };
    setSettings(newSettings);
    saveSettings(newSettings);
  }

  function moveItem(stack: HabitStack, fromIdx: number, toIdx: number) {
    const chains = getChains();
    const items = [...chains[stack]];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    persistChains({ ...chains, [stack]: items });
  }

  function moveToStack(fromStack: HabitStack, index: number, toStack: HabitStack) {
    const chains = getChains();
    const fromItems = [...chains[fromStack]];
    const [moved] = fromItems.splice(index, 1);
    const toItems = [...chains[toStack], moved];
    persistChains({ ...chains, [fromStack]: fromItems, [toStack]: toItems });
    setMoveTarget(null);
  }

  function removeItem(stack: HabitStack, index: number) {
    const chains = getChains();
    const items = [...chains[stack]];
    items.splice(index, 1);
    persistChains({ ...chains, [stack]: items });
  }

  function addAnchor(stack: HabitStack) {
    if (!anchorLabel.trim()) return;
    const chains = getChains();
    const newItem: ChainItem = {
      id: `anchor-${Date.now()}`,
      type: "anchor",
      label: anchorLabel.trim(),
      icon: anchorIcon,
    };
    persistChains({ ...chains, [stack]: [...chains[stack], newItem] });
    setAnchorLabel("");
    setShowAddAnchor(null);
  }

  if (!settings) return null;

  const chains = getChains();

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-4">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">🔗 My Routine</h1>
      </header>

      {/* How it works */}
      <section className="rounded-xl bg-surface-800/50 border border-surface-700 p-3 mb-6">
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          <span className="text-brand font-semibold">Habit chains:</span> Arrange your habits in the order you do them. The chain order is reflected in your check-in flow. Tap arrows to reorder, long-press to see options. Add anchor steps (like &ldquo;Wake&rdquo; or &ldquo;Phone down&rdquo;) for context.
        </p>
      </section>

      {/* Chains */}
      <div className="space-y-6">
        {STACKS.map((stack) => (
          <ChainSection
            key={stack.key}
            stack={stack}
            items={chains[stack.key]}
            habits={habits}
            onMoveUp={(idx) => {
              if (idx > 0) moveItem(stack.key, idx, idx - 1);
            }}
            onMoveDown={(idx) => {
              if (idx < chains[stack.key].length - 1) moveItem(stack.key, idx, idx + 1);
            }}
            onRemove={(idx) => removeItem(stack.key, idx)}
            onMoveToStack={(idx) => setMoveTarget({ stack: stack.key, index: idx })}
            moveTarget={moveTarget?.stack === stack.key ? moveTarget.index : null}
            onAcceptMove={(toStack) => {
              if (moveTarget) moveToStack(moveTarget.stack, moveTarget.index, toStack);
            }}
            onCancelMove={() => setMoveTarget(null)}
            showAddAnchor={showAddAnchor === stack.key}
            onToggleAddAnchor={() =>
              setShowAddAnchor(showAddAnchor === stack.key ? null : stack.key)
            }
            anchorLabel={anchorLabel}
            anchorIcon={anchorIcon}
            onAnchorLabelChange={setAnchorLabel}
            onAnchorIconChange={setAnchorIcon}
            onAddAnchor={() => addAnchor(stack.key)}
          />
        ))}
      </div>

      {/* Move overlay */}
      {moveTarget && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end justify-center">
          <div className="bg-surface-800 rounded-t-2xl border-t border-surface-700 p-6 w-full max-w-md">
            <h3 className="text-sm font-bold mb-4">Move to which chain?</h3>
            <div className="space-y-2 mb-4">
              {STACKS.filter((s) => s.key !== moveTarget.stack).map((s) => (
                <button
                  key={s.key}
                  onClick={() => moveToStack(moveTarget.stack, moveTarget.index, s.key)}
                  className="w-full flex items-center gap-3 rounded-xl bg-surface-700 px-4 py-3 text-sm hover:bg-surface-600 transition-colors"
                >
                  <span className="text-lg">{s.icon}</span>
                  <span>{s.label} Chain</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setMoveTarget(null)}
              className="w-full rounded-xl bg-surface-700 py-3 text-sm text-neutral-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Back */}
      <div className="mt-auto pt-6 pb-4">
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

// ─── Chain Section ──────────────────────────────────────────
function ChainSection({
  stack,
  items,
  habits,
  onMoveUp,
  onMoveDown,
  onRemove,
  onMoveToStack,
  moveTarget,
  onAcceptMove,
  onCancelMove,
  showAddAnchor,
  onToggleAddAnchor,
  anchorLabel,
  anchorIcon,
  onAnchorLabelChange,
  onAnchorIconChange,
  onAddAnchor,
}: {
  stack: { key: HabitStack; label: string; icon: string; color: string };
  items: ChainItem[];
  habits: Habit[];
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onRemove: (idx: number) => void;
  onMoveToStack: (idx: number) => void;
  moveTarget: number | null;
  onAcceptMove: (toStack: HabitStack) => void;
  onCancelMove: () => void;
  showAddAnchor: boolean;
  onToggleAddAnchor: () => void;
  anchorLabel: string;
  anchorIcon: string;
  onAnchorLabelChange: (v: string) => void;
  onAnchorIconChange: (v: string) => void;
  onAddAnchor: () => void;
}) {
  const ANCHOR_ICONS = ["📌", "⏰", "☕", "🔔", "📱", "🍳", "🛏️", "🚿", "🎧"];

  return (
    <section className="rounded-xl bg-surface-800 border border-surface-700 p-4">
      {/* Stack header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{stack.icon}</span>
        <h2 className="text-sm font-bold" style={{ color: stack.color }}>
          {stack.label} Chain
        </h2>
        <span className="text-xs text-neutral-600 ml-auto">
          {items.length} step{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Chain items with arrows */}
      <div className="space-y-0">
        {items.map((item, idx) => {
          const habit = item.type === "habit" && item.habitId
            ? habits.find((h) => h.id === item.habitId)
            : null;
          const icon = item.type === "habit" ? (habit?.icon ?? "🔵") : (item.icon ?? "📌");
          const label = item.type === "habit" ? (habit?.name ?? "Unknown") : (item.label ?? "Step");
          const isHabit = item.type === "habit";

          return (
            <div key={item.id}>
              {/* Arrow connector (except first) */}
              {idx > 0 && (
                <div className="flex justify-center py-0.5">
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-neutral-600">
                    <path d="M8 2 L8 11 M4 8 L8 12 L12 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Block */}
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 border transition-all ${
                  isHabit
                    ? "bg-surface-700 border-surface-600"
                    : "bg-surface-700/50 border-dashed border-surface-600"
                }`}
              >
                <span className="text-base shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-semibold ${isHabit ? "text-neutral-200" : "text-neutral-400"}`}>
                    {label}
                  </span>
                  {isHabit && habit?.is_bare_minimum && (
                    <span className="text-[9px] text-brand ml-1.5 font-bold">MIN</span>
                  )}
                  {!isHabit && (
                    <span className="text-[9px] text-neutral-600 ml-1.5">anchor</span>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onMoveUp(idx)}
                    disabled={idx === 0}
                    className={`w-6 h-6 rounded text-xs transition-colors ${
                      idx === 0 ? "text-neutral-700" : "text-neutral-500 hover:text-white hover:bg-surface-600"
                    }`}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMoveDown(idx)}
                    disabled={idx === items.length - 1}
                    className={`w-6 h-6 rounded text-xs transition-colors ${
                      idx === items.length - 1 ? "text-neutral-700" : "text-neutral-500 hover:text-white hover:bg-surface-600"
                    }`}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => onMoveToStack(idx)}
                    className="w-6 h-6 rounded text-xs text-neutral-500 hover:text-brand hover:bg-surface-600 transition-colors"
                    title="Move to another chain"
                  >
                    ↗
                  </button>
                  {/* Only allow removing anchors, not habits (habits come back automatically) */}
                  {!isHabit && (
                    <button
                      onClick={() => onRemove(idx)}
                      className="w-6 h-6 rounded text-xs text-neutral-600 hover:text-missed hover:bg-surface-600 transition-colors"
                      title="Remove step"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center text-neutral-600 text-xs py-4 italic">
          No steps in this chain yet
        </div>
      )}

      {/* Add anchor */}
      {showAddAnchor ? (
        <div className="mt-3 rounded-lg bg-surface-700 border border-surface-600 p-3">
          <div className="flex gap-2 mb-2">
            <input
              value={anchorLabel}
              onChange={(e) => onAnchorLabelChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddAnchor(); }}
              placeholder='e.g. "Wake", "Phone down"'
              className="flex-1 bg-surface-800 rounded-lg px-3 py-2 text-xs text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ANCHOR_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => onAnchorIconChange(ic)}
                className={`w-7 h-7 rounded text-sm transition-colors ${
                  anchorIcon === ic ? "bg-brand/30 ring-1 ring-brand" : "bg-surface-800 hover:bg-surface-600"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAddAnchor}
              disabled={!anchorLabel.trim()}
              className="flex-1 rounded-lg py-2 text-xs font-bold bg-done text-white disabled:opacity-40 active:scale-95 transition-all"
            >
              Add Step
            </button>
            <button
              onClick={onToggleAddAnchor}
              className="flex-1 rounded-lg py-2 text-xs font-medium bg-surface-800 text-neutral-400 active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onToggleAddAnchor}
          className="mt-3 w-full rounded-lg border border-dashed border-surface-600 py-2 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 transition-colors"
        >
          + Add Step
        </button>
      )}
    </section>
  );
}
