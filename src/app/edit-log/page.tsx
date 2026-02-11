"use client";

import { useState, useEffect } from "react";
import { loadState, saveState, getLevelForXP, recalculateDayXP } from "@/lib/store";
import type { LocalState, DayLog } from "@/lib/store";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { getHabitLevel } from "@/lib/habits";
import type { Habit } from "@/types/database";

export default function EditLogPage() {
  const [state, setState] = useState<LocalState | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [date, setDate] = useState<string>("");
  const [log, setLog] = useState<DayLog | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date") ?? new Date().toISOString().slice(0, 10);
    setDate(d);

    const s = loadState();
    setState(s);
    setHabits(getResolvedHabits());

    const existingLog = s.logs.find((l) => l.date === d);
    if (existingLog) {
      // Deep clone so edits don't mutate state until save
      const clonedLog: DayLog = JSON.parse(JSON.stringify(existingLog));
      // Ensure all active habits have entries so they show up in the editor
      const allHabits = getResolvedHabits();
      for (const h of allHabits) {
        if (!h.is_active) continue;
        if (h.category === "bad") {
          if (!clonedLog.badEntries[h.id]) {
            clonedLog.badEntries[h.id] = { occurred: null as unknown as boolean, durationMinutes: null };
          }
        } else {
          if (!clonedLog.entries[h.id]) {
            clonedLog.entries[h.id] = { status: "later" as const, value: null };
          }
        }
      }
      setLog(clonedLog);
    }
  }, []);

  if (!state || !date) return null;

  if (!log) {
    return (
      <div className="flex flex-col min-h-screen px-4 py-6">
        <header className="mb-6">
          <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
            ← Dashboard
          </a>
          <h1 className="text-xl font-bold mt-1">Edit Log</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
          No log found for {date}
        </div>
      </div>
    );
  }

  const binaryHabits = habits.filter((h) => h.category === "binary" && h.is_active);
  const measuredHabits = habits.filter((h) => h.category === "measured" && h.is_active);
  const badHabitsLogged = habits.filter((h) => h.category === "bad" && h.is_active);

  function updateEntry(habitId: string, field: "status" | "value", val: string | number | null) {
    if (!log) return;
    const updated = { ...log, entries: { ...log.entries } };
    updated.entries[habitId] = { ...updated.entries[habitId] };
    if (field === "status") {
      updated.entries[habitId].status = val as DayLog["entries"][string]["status"];
    } else {
      updated.entries[habitId].value = val as number | null;
    }
    setLog(updated);
    setSaved(false);
  }

  function updateBadEntry(habitId: string, field: "occurred" | "durationMinutes", val: boolean | number | null) {
    if (!log) return;
    const updated = { ...log, badEntries: { ...log.badEntries } };
    updated.badEntries[habitId] = { ...updated.badEntries[habitId] };
    if (field === "occurred") {
      updated.badEntries[habitId].occurred = val as boolean;
    } else {
      updated.badEntries[habitId].durationMinutes = val as number | null;
    }
    setLog(updated);
    setSaved(false);
  }

  function handleSave() {
    if (!state || !log) return;

    const oldXP = log.xpEarned;
    const allHabits = habits.map((h) => ({
      id: h.id,
      slug: h.slug,
      category: h.category,
      is_bare_minimum: h.is_bare_minimum,
      is_active: h.is_active,
      unit: h.unit,
    }));
    const newXP = recalculateDayXP(log, allHabits);
    const xpDiff = newXP - oldXP;

    // Update the log in state
    const logIdx = state.logs.findIndex((l) => l.date === date);
    if (logIdx === -1) return;

    const updatedLog = { ...log, xpEarned: newXP };

    // Check bare minimum
    const bareMinHabits = habits.filter((h) => h.is_bare_minimum && h.is_active && h.category === "binary");
    const allBareMinDone = bareMinHabits.every((h) => updatedLog.entries[h.id]?.status === "done");
    updatedLog.bareMinimumMet = allBareMinDone;

    const newState = { ...state };
    newState.logs = [...state.logs];
    newState.logs[logIdx] = updatedLog;
    newState.totalXp = Math.max(0, state.totalXp + xpDiff);
    newState.currentLevel = getLevelForXP(newState.totalXp).level;

    saveState(newState);
    setState(newState);
    setLog(updatedLog);
    setSaved(true);
  }

  const formatDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">Edit Log</h1>
        <p className="text-sm text-neutral-400 mt-1">{formatDate(date)}</p>
      </header>

      {/* XP Summary */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Day XP</span>
          <span className="text-sm font-bold text-brand">{log.xpEarned} XP</span>
        </div>
        {log.bareMinimumMet && (
          <div className="text-[10px] text-done mt-1">Bare minimum met</div>
        )}
      </section>

      {/* Binary Habits */}
      {binaryHabits.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Binary Habits
          </h2>
          <div className="space-y-2">
            {binaryHabits.map((habit) => {
              const entry = log.entries[habit.id];
              const level = getHabitLevel(habit.id, habit.current_level);
              return (
                <div key={habit.id} className="rounded-xl bg-surface-800 border border-surface-700 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{habit.icon}</span>
                    <span className="text-sm font-semibold">{habit.name}</span>
                    {level && <span className="text-xs text-neutral-500">Lv.{habit.current_level}</span>}
                  </div>
                  <div className="flex gap-2">
                    {(["done", "missed", "later"] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => updateEntry(habit.id, "status", status)}
                        className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-95 ${
                          entry?.status === status
                            ? status === "done" ? "bg-done text-white"
                              : status === "missed" ? "bg-missed text-white"
                                : "bg-later text-white"
                            : "bg-surface-700 text-neutral-400 hover:bg-surface-600"
                        }`}
                      >
                        {status === "done" ? "Done" : status === "missed" ? "Miss" : "Later"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Measured Habits */}
      {measuredHabits.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Measured Habits
          </h2>
          <div className="space-y-2">
            {measuredHabits.map((habit) => {
              const entry = log.entries[habit.id];
              const isScale = habit.unit === "1-5" || habit.unit === "1-10";
              const max = habit.unit === "1-5" ? 5 : habit.unit === "1-10" ? 10 : 999;
              return (
                <div key={habit.id} className="rounded-xl bg-surface-800 border border-surface-700 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{habit.icon}</span>
                    <span className="text-sm font-semibold">{habit.name}</span>
                    <span className="text-xs text-neutral-500 ml-auto">{habit.unit}</span>
                  </div>
                  {isScale ? (
                    <div className="flex gap-1.5">
                      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => updateEntry(habit.id, "value", n)}
                          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-95 ${
                            entry?.value === n
                              ? "bg-brand text-white"
                              : "bg-surface-700 text-neutral-400 hover:bg-surface-600"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateEntry(habit.id, "value", Math.max(0, (entry?.value ?? 0) - 1))}
                        className="w-10 h-10 rounded-lg bg-surface-700 text-neutral-400 hover:bg-surface-600 text-lg font-bold active:scale-95 transition-all"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={max}
                        value={entry?.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          updateEntry(habit.id, "value", v);
                        }}
                        placeholder="0"
                        className="flex-1 bg-surface-700 rounded-lg px-4 py-2.5 text-center text-lg font-bold text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
                      />
                      <button
                        onClick={() => updateEntry(habit.id, "value", Math.min(max, (entry?.value ?? 0) + 1))}
                        className="w-10 h-10 rounded-lg bg-surface-700 text-neutral-400 hover:bg-surface-600 text-lg font-bold active:scale-95 transition-all"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bad Habits */}
      {badHabitsLogged.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">
            Bad Habits
          </h2>
          <div className="space-y-2">
            {badHabitsLogged.map((habit) => {
              const entry = log.badEntries[habit.id];
              return (
                <div key={habit.id} className="rounded-xl bg-surface-800 border border-surface-700 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{habit.icon}</span>
                    <span className="text-sm font-semibold">{habit.name}</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => updateBadEntry(habit.id, "occurred", false)}
                      className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-95 ${
                        entry?.occurred === false
                          ? "bg-done text-white"
                          : "bg-surface-700 text-neutral-400 hover:bg-surface-600"
                      }`}
                    >
                      Clean
                    </button>
                    <button
                      onClick={() => updateBadEntry(habit.id, "occurred", true)}
                      className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-95 ${
                        entry?.occurred === true
                          ? "bg-missed text-white"
                          : "bg-surface-700 text-neutral-400 hover:bg-surface-600"
                      }`}
                    >
                      Slipped
                    </button>
                  </div>
                  {habit.unit === "minutes" && entry?.occurred && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-neutral-500">Duration:</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={entry?.durationMinutes ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          updateBadEntry(habit.id, "durationMinutes", v);
                        }}
                        placeholder="0"
                        className="flex-1 bg-surface-700 rounded-lg px-3 py-2 text-center text-sm font-bold text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
                      />
                      <span className="text-xs text-neutral-500">min</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Save Button */}
      <div className="mt-auto pt-4 pb-6 space-y-3">
        <button
          onClick={handleSave}
          className="w-full rounded-xl py-4 text-base font-bold bg-brand hover:bg-brand-dark text-white active:scale-[0.98] transition-all"
        >
          Save Changes
        </button>
        {saved && (
          <p className="text-center text-sm text-done font-medium">
            Saved! XP recalculated.
          </p>
        )}
        <a
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-surface-800 hover:bg-surface-700 transition-colors"
        >
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
