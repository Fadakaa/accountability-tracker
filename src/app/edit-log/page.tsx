"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getToday, getLevelForXP, recalculateStreaks } from "@/lib/store";
import type { DayLog } from "@/lib/store";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { getHabitLevel, XP_VALUES, getFlameIcon } from "@/lib/habits";
import type { Habit, LogStatus } from "@/types/database";
import { isBinaryLike } from "@/types/database";
import { useDB } from "@/hooks/useDB";
import { saveDayLogToDB } from "@/lib/db";

// ─── XP Recalculation ───────────────────────────────────────
function recalculateDayXP(log: DayLog, habits: Habit[]): number {
  let xp = 0;

  // Binary habits
  for (const habit of habits) {
    if (habit.category !== "binary") continue;
    const entry = log.entries[habit.id];
    if (!entry) continue;
    if (entry.status === "done" && habit.is_bare_minimum) {
      xp += XP_VALUES.BARE_MINIMUM_HABIT;
    }
  }

  // Measured habits
  for (const habit of habits) {
    if (habit.category !== "measured") continue;
    const entry = log.entries[habit.id];
    if (entry?.value && entry.value > 0) {
      xp += XP_VALUES.MEASURED_AT_TARGET;
    }
  }

  // Bad habits
  let anyBad = false;
  for (const habit of habits) {
    if (habit.category !== "bad") continue;
    const entry = log.badEntries[habit.id];
    if (!entry) continue;
    if (entry.occurred === false) {
      xp += XP_VALUES.ZERO_BAD_HABIT_DAY;
    } else if (entry.occurred === true) {
      xp += XP_VALUES.LOG_BAD_HABIT_HONESTLY;
      anyBad = true;
    }
  }

  // Bare minimum bonus
  const bareMinHabits = habits.filter((h) => h.is_bare_minimum && h.is_active && isBinaryLike(h.category));
  const allBareMinDone = bareMinHabits.every((h) => log.entries[h.id]?.status === "done");
  if (allBareMinDone && bareMinHabits.length > 0) {
    xp += XP_VALUES.ALL_BARE_MINIMUM;
    log.bareMinimumMet = true;
  } else {
    log.bareMinimumMet = false;
  }

  // Perfect day
  const allBinaryDone = habits
    .filter((h) => isBinaryLike(h.category) && h.is_active)
    .every((h) => log.entries[h.id]?.status === "done");
  if (allBinaryDone && !anyBad && allBareMinDone) {
    xp += XP_VALUES.PERFECT_DAY;
  }

  return xp;
}

// ─── Component ──────────────────────────────────────────────
export default function EditLogPage() {
  const { state, settings, dbHabits, loading, saveState: dbSaveState, recalcStreaks } = useDB();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [log, setLog] = useState<DayLog | null>(null);
  const [originalXP, setOriginalXP] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isNewLog, setIsNewLog] = useState(false);

  const habits = useMemo(() => getResolvedHabits(false, dbHabits, settings), [dbHabits, settings]);

  useEffect(() => {
    if (loading) return;
    const dayLog = state.logs.find((l) => l.date === selectedDate);
    if (dayLog) {
      // Deep clone to avoid mutating state
      setLog(JSON.parse(JSON.stringify(dayLog)));
      setOriginalXP(dayLog.xpEarned);
      setIsNewLog(false);
    } else {
      setLog(null);
      setIsNewLog(false);
      setOriginalXP(0);
    }
    setSaved(false);
  }, [selectedDate, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function createNewLog() {
    const newLog: DayLog = {
      date: selectedDate,
      entries: {},
      badEntries: {},
      xpEarned: 0,
      bareMinimumMet: false,
      submittedAt: new Date().toISOString(),
    };
    setLog(newLog);
    setIsNewLog(true);
    setOriginalXP(0);
  }

  function updateEntry(habitId: string, status: LogStatus) {
    if (!log) return;
    const updated = { ...log };
    updated.entries = { ...updated.entries };
    updated.entries[habitId] = {
      ...updated.entries[habitId],
      status,
      value: updated.entries[habitId]?.value ?? null,
    };
    setLog(updated);
  }

  function updateMeasuredValue(habitId: string, value: number | null) {
    if (!log) return;
    const updated = { ...log };
    updated.entries = { ...updated.entries };
    updated.entries[habitId] = {
      status: updated.entries[habitId]?.status ?? "done",
      value,
    };
    setLog(updated);
  }

  function updateBadEntry(habitId: string, occurred: boolean) {
    if (!log) return;
    const updated = { ...log };
    updated.badEntries = { ...updated.badEntries };
    updated.badEntries[habitId] = {
      ...updated.badEntries[habitId],
      occurred,
      durationMinutes: updated.badEntries[habitId]?.durationMinutes ?? null,
    };
    setLog(updated);
  }

  function updateBadDuration(habitId: string, minutes: number | null) {
    if (!log) return;
    const updated = { ...log };
    updated.badEntries = { ...updated.badEntries };
    updated.badEntries[habitId] = {
      ...updated.badEntries[habitId],
      occurred: updated.badEntries[habitId]?.occurred ?? true,
      durationMinutes: minutes,
    };
    setLog(updated);
  }

  function handleSave() {
    if (!log) return;

    // Recalculate XP
    const newXP = recalculateDayXP(log, habits);
    const xpDelta = newXP - originalXP;

    log.xpEarned = newXP;
    const updatedState = { ...state };
    updatedState.logs = [...updatedState.logs];

    const logIndex = updatedState.logs.findIndex((l) => l.date === selectedDate);
    if (logIndex === -1) {
      // New log — insert it
      updatedState.logs.push(log);
    } else {
      updatedState.logs[logIndex] = log;
    }

    updatedState.totalXp += xpDelta;
    updatedState.currentLevel = getLevelForXP(updatedState.totalXp).level;

    // Recalculate streaks after edit — keeps all views in sync
    const allHabits = getResolvedHabits(false, dbHabits, settings);
    const habitSlugsById: Record<string, string> = {};
    for (const h of allHabits) {
      habitSlugsById[h.id] = h.slug;
    }
    updatedState.streaks = recalculateStreaks(updatedState, habitSlugsById);

    dbSaveState(updatedState);
    saveDayLogToDB(log, updatedState);
    setOriginalXP(newXP);
    setIsNewLog(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Build recent dates (last 21 days) — shows all dates, not just logged ones
  const recentDates = useMemo(() => {
    const dates: string[] = [];
    const today = new Date(getToday() + "T12:00:00");
    for (let i = 0; i < 21; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, []);

  const loggedDates = useMemo(() => {
    return new Set(state.logs.map((l) => l.date));
  }, [state.logs]);

  const binaryHabits = habits.filter((h) => isBinaryLike(h.category) && h.is_active);
  const measuredHabits = habits.filter((h) => h.category === "measured" && h.is_active);
  const badHabits = habits.filter((h) => h.category === "bad" && h.is_active);

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <Link href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-bold mt-1">{"📝"} Edit Log</h1>
      </header>

      {/* Date Picker */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-2">
          Select Date
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {recentDates.map((date) => {
            const d = new Date(date + "T12:00:00");
            const dayName = d.toLocaleDateString("en-GB", { weekday: "short" });
            const dayNum = d.getDate();
            const monthName = d.toLocaleDateString("en-GB", { month: "short" });
            const isToday = date === getToday();
            const isSelected = date === selectedDate;
            const hasLog = loggedDates.has(date);
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex-shrink-0 rounded-lg px-3 py-2 text-center transition-all min-w-[56px] ${
                  isSelected
                    ? "bg-brand text-white"
                    : hasLog
                      ? "bg-surface-700 text-neutral-400 hover:text-white"
                      : "bg-surface-700/50 text-neutral-600 hover:text-neutral-400 border border-dashed border-surface-600"
                }`}
              >
                <div className="text-[10px] uppercase">{dayName}</div>
                <div className="text-sm font-bold">{dayNum}</div>
                <div className="text-[9px]">
                  {isToday ? <span className={isSelected ? "text-white" : "text-brand"}>Today</span> : monthName}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {!log ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-neutral-600 text-sm">No log for this date.</p>
          <button
            onClick={createNewLog}
            className="rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-bold px-6 py-3 transition-colors active:scale-[0.98]"
          >
            + Create Log for {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </button>
        </div>
      ) : (
        <>
          {/* XP Summary */}
          <div className="rounded-xl bg-surface-800/50 border border-surface-700 p-3 mb-4 flex items-center justify-between">
            <span className="text-xs text-neutral-500">Day XP</span>
            <span className="text-sm font-bold text-brand">{log.xpEarned} XP</span>
          </div>

          {/* Binary Habits */}
          {binaryHabits.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                Habits
              </h2>
              <div className="space-y-2">
                {binaryHabits.map((habit) => {
                  const entry = log.entries[habit.id];
                  const status = entry?.status ?? null;
                  return (
                    <div key={habit.id} className="rounded-xl bg-surface-800 border border-surface-700 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span>{habit.icon}</span>
                        <span className="text-sm font-semibold">{habit.name}</span>
                        {habit.is_bare_minimum && (
                          <span className="text-[10px] text-brand font-bold ml-auto">MIN</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {(["done", "missed", "later"] as LogStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateEntry(habit.id, s)}
                            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all active:scale-95 ${
                              status === s
                                ? s === "done" ? "bg-done text-white"
                                : s === "missed" ? "bg-missed text-white"
                                : "bg-later text-white"
                                : "bg-surface-700 text-neutral-500"
                            }`}
                          >
                            {s === "done" ? "Done" : s === "missed" ? "Miss" : "Later"}
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
                Measured
              </h2>
              <div className="space-y-2">
                {measuredHabits.map((habit) => {
                  const entry = log.entries[habit.id];
                  const value = entry?.value ?? null;
                  const isScale = habit.unit === "1-5" || habit.unit === "1-10";
                  const max = habit.unit === "1-5" ? 5 : habit.unit === "1-10" ? 10 : 999;

                  return (
                    <div key={habit.id} className="rounded-xl bg-surface-800 border border-surface-700 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span>{habit.icon}</span>
                        <span className="text-sm font-semibold">{habit.name}</span>
                        <span className="text-xs text-neutral-500 ml-auto">{habit.unit}</span>
                      </div>
                      {isScale ? (
                        <div className="flex gap-1">
                          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              onClick={() => updateMeasuredValue(habit.id, n)}
                              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                                value === n ? "bg-brand text-white" : "bg-surface-700 text-neutral-500"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="number"
                          inputMode="numeric"
                          value={value ?? ""}
                          onChange={(e) => updateMeasuredValue(habit.id, e.target.value === "" ? null : Number(e.target.value))}
                          className="w-full bg-surface-700 rounded-lg px-3 py-2 text-sm text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
                          placeholder="0"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Bad Habits */}
          {badHabits.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">
                Bad Habits
              </h2>
              <div className="space-y-2">
                {badHabits.map((habit) => {
                  const entry = log.badEntries[habit.id];
                  const occurred = entry?.occurred ?? null;
                  return (
                    <div key={habit.id} className="rounded-xl bg-surface-800 border border-surface-700 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span>{habit.icon}</span>
                        <span className="text-sm font-semibold">{habit.name}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => updateBadEntry(habit.id, false)}
                          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                            occurred === false ? "bg-done text-white" : "bg-surface-700 text-neutral-500"
                          }`}
                        >
                          Clean
                        </button>
                        <button
                          onClick={() => updateBadEntry(habit.id, true)}
                          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                            occurred === true ? "bg-bad text-white" : "bg-surface-700 text-neutral-500"
                          }`}
                        >
                          Slipped
                        </button>
                      </div>
                      {occurred === true && habit.unit === "minutes" && (
                        <input
                          type="number"
                          inputMode="numeric"
                          value={entry?.durationMinutes ?? ""}
                          onChange={(e) => updateBadDuration(habit.id, e.target.value === "" ? null : Number(e.target.value))}
                          className="w-full mt-2 bg-surface-700 rounded-lg px-3 py-2 text-sm text-white border-none outline-none focus:ring-2 focus:ring-bad/50"
                          placeholder="Minutes"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Save Button */}
          <div className="mt-auto pt-4 pb-6">
            <button
              onClick={handleSave}
              className={`w-full rounded-xl py-4 text-base font-bold transition-all active:scale-[0.98] ${
                saved
                  ? "bg-done text-white"
                  : "bg-brand hover:bg-brand-dark text-white"
              }`}
            >
              {saved ? "✓ Saved!" : "Save Changes"}
            </button>
          </div>
        </>
      )}

      {/* Back */}
      <div className="pb-4">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-surface-800 hover:bg-surface-700 transition-colors"
        >
          {"🏠"} Dashboard
        </Link>
      </div>
    </div>
  );
}
