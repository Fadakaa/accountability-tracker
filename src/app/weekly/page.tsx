"use client";

import { useState } from "react";
import { useDB } from "@/hooks/useDB";
import { getWeekLogs, getPrevWeekLogs, getMonthLogs } from "@/lib/store";
import type { DayLog } from "@/lib/store";
import { getFlameIcon } from "@/lib/habits";
import { getResolvedHabits } from "@/lib/resolvedHabits";

// ─── Types ──────────────────────────────────────────────────
type ViewMode = "weekly" | "monthly";

interface TargetStat {
  label: string;
  icon: string;
  current: number;
  target: number;
  unit: string;
  prev: number;
}

// ─── Component ──────────────────────────────────────────────
export default function WeeklyPage() {
  const { state, settings, dbHabits, loading } = useDB();
  const [view, setView] = useState<ViewMode>("weekly");

  if (loading) return null;

  const resolvedHabits = getResolvedHabits(false, dbHabits, settings);

  const weekLogs = getWeekLogs(state);
  const prevWeekLogs = getPrevWeekLogs(state);
  const monthLogs = getMonthLogs(state);

  const isWeekly = view === "weekly";
  const logs = isWeekly ? weekLogs : monthLogs;
  const prevLogs = isWeekly ? prevWeekLogs : []; // no prev month comparison yet

  // ─── Calculate Stats ────────────────────────────────────
  // Bare minimum days
  const bareMinDays = logs.filter((l) => l.bareMinimumMet).length;
  const prevBareMinDays = prevLogs.filter((l) => l.bareMinimumMet).length;

  // Training sessions (binary "training" habit marked done)
  const trainingHabit = resolvedHabits.find((h) => h.slug === "training");
  const trainingDone = logs.filter(
    (l) => trainingHabit && l.entries[trainingHabit.id]?.status === "done"
  ).length;
  const prevTrainingDone = prevLogs.filter(
    (l) => trainingHabit && l.entries[trainingHabit.id]?.status === "done"
  ).length;

  // Bible chapters (measured)
  const bibleChaptersHabit = resolvedHabits.find((h) => h.slug === "bible-chapters");
  const bibleChapters = logs.reduce((sum, l) => {
    if (!bibleChaptersHabit) return sum;
    return sum + (l.entries[bibleChaptersHabit.id]?.value ?? 0);
  }, 0);
  const prevBibleChapters = prevLogs.reduce((sum, l) => {
    if (!bibleChaptersHabit) return sum;
    return sum + (l.entries[bibleChaptersHabit.id]?.value ?? 0);
  }, 0);

  // Deep work blocks (measured)
  const deepWorkHabit = resolvedHabits.find((h) => h.slug === "deep-work");
  const deepWorkBlocks = logs.reduce((sum, l) => {
    if (!deepWorkHabit) return sum;
    return sum + (l.entries[deepWorkHabit.id]?.value ?? 0);
  }, 0);
  const prevDeepWorkBlocks = prevLogs.reduce((sum, l) => {
    if (!deepWorkHabit) return sum;
    return sum + (l.entries[deepWorkHabit.id]?.value ?? 0);
  }, 0);

  // Pages read (measured)
  const pagesHabit = resolvedHabits.find((h) => h.slug === "pages-read");
  const pagesRead = logs.reduce((sum, l) => {
    if (!pagesHabit) return sum;
    return sum + (l.entries[pagesHabit.id]?.value ?? 0);
  }, 0);
  const prevPagesRead = prevLogs.reduce((sum, l) => {
    if (!pagesHabit) return sum;
    return sum + (l.entries[pagesHabit.id]?.value ?? 0);
  }, 0);

  // XP earned this period
  const xpEarned = logs.reduce((sum, l) => sum + l.xpEarned, 0);
  const prevXpEarned = prevLogs.reduce((sum, l) => sum + l.xpEarned, 0);

  // Bad habit stats
  const badHabitSlugs = [
    { slug: "league", icon: "🎮", label: "League", unit: "minutes" },
    { slug: "plates", icon: "🍽️", label: "Plates piled", unit: "days" },
    { slug: "hygiene", icon: "🚿", label: "Hygiene delayed", unit: "days" },
  ];
  const badHabitIds: Record<string, string> = {};
  for (const h of resolvedHabits.filter((h) => h.category === "bad")) {
    badHabitIds[h.slug] = h.id;
  }

  // Build target list
  const weeklyTargets: TargetStat[] = [
    { label: "Training", icon: "💪", current: trainingDone, target: isWeekly ? 5 : 20, unit: "sessions", prev: prevTrainingDone },
    { label: "Bible Chapters", icon: "📖", current: bibleChapters, target: isWeekly ? 7 : 30, unit: "chapters", prev: prevBibleChapters },
    { label: "Deep Work", icon: "🧠", current: deepWorkBlocks, target: isWeekly ? 15 : 60, unit: "blocks", prev: prevDeepWorkBlocks },
    { label: "Pages Read", icon: "📄", current: pagesRead, target: isWeekly ? 70 : 280, unit: "pages", prev: prevPagesRead },
  ];

  // Day-of-week labels for the week view
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
            ← Dashboard
          </a>
          <h1 className="text-xl font-bold mt-1">
            {isWeekly ? "📊 Weekly Game" : "📊 Monthly Game"}
          </h1>
        </div>
      </header>

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView("weekly")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            view === "weekly"
              ? "bg-brand text-white"
              : "bg-surface-800 text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Weekly
        </button>
        <button
          onClick={() => setView("monthly")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            view === "monthly"
              ? "bg-brand text-white"
              : "bg-surface-800 text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Monthly
        </button>
      </div>

      {/* Bare Minimum Streak */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Bare Minimum Days
          </h2>
          <span className="text-xs text-neutral-500">
            {bareMinDays} / {isWeekly ? 7 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}
          </span>
        </div>

        {/* Day dots (weekly view) */}
        {isWeekly && (
          <div className="flex gap-2 mb-3">
            {dayLabels.map((day, i) => {
              const date = new Date(weekStart);
              date.setDate(date.getDate() + i);
              const dateStr = date.toISOString().slice(0, 10);
              const log = weekLogs.find((l) => l.date === dateStr);
              const isPast = date <= now;
              const met = log?.bareMinimumMet;

              return (
                <div key={day} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-[10px] text-neutral-600">{day}</span>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      met
                        ? "bg-done text-white"
                        : isPast && log
                          ? "bg-missed/30 text-missed"
                          : isPast && !log
                            ? "bg-surface-700 text-neutral-600"
                            : "bg-surface-700/50 text-neutral-700"
                    }`}
                  >
                    {met ? "✓" : isPast && log ? "✕" : "·"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Comparison */}
        {isWeekly && prevLogs.length > 0 && (
          <TrendLine current={bareMinDays} prev={prevBareMinDays} unit="days" />
        )}
      </section>

      {/* Target Progress Cards */}
      <section className="space-y-3 mb-6">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
          Targets
        </h2>
        {weeklyTargets.map((t) => (
          <TargetCard key={t.label} stat={t} showPrev={isWeekly && prevLogs.length > 0} />
        ))}
      </section>

      {/* Bad Habits Section */}
      <section className="rounded-xl bg-surface-800 border border-red-900/30 p-4 mb-6">
        <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">
          Bad Habits {isWeekly ? "This Week" : "This Month"}
        </h2>
        <div className="space-y-3">
          {badHabitSlugs.map((bh) => {
            const id = badHabitIds[bh.slug];
            let count = 0;
            let minutes = 0;
            for (const log of logs) {
              const entry = log.badEntries[id];
              if (entry?.occurred) {
                count++;
                minutes += entry.durationMinutes ?? 0;
              }
            }
            // Prev week
            let prevCount = 0;
            let prevMinutes = 0;
            for (const log of prevLogs) {
              const entry = log.badEntries[id];
              if (entry?.occurred) {
                prevCount++;
                prevMinutes += entry.durationMinutes ?? 0;
              }
            }

            const display =
              bh.unit === "minutes"
                ? minutes >= 60
                  ? `${(minutes / 60).toFixed(1)}h`
                  : `${minutes}m`
                : `${count} days`;
            const prevDisplay =
              bh.unit === "minutes" ? prevMinutes : prevCount;
            const currentVal = bh.unit === "minutes" ? minutes : count;

            return (
              <div key={bh.slug} className="flex items-center justify-between">
                <span className="text-sm">
                  {bh.icon} {bh.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-300">{display}</span>
                  {isWeekly && prevLogs.length > 0 && (
                    <TrendArrow current={currentVal} prev={prevDisplay} inverted />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* XP Summary */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              XP Earned
            </h2>
            <span className="text-2xl font-black text-brand">
              +{xpEarned}
            </span>
          </div>
          {isWeekly && prevLogs.length > 0 && (
            <TrendLine current={xpEarned} prev={prevXpEarned} unit="XP" />
          )}
        </div>
      </section>

      {/* Top Streaks */}
      <section className="mb-6">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
          Active Streaks
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(state.streaks)
            .filter(([, days]) => days > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([slug, days]) => {
              const habit = resolvedHabits.find((h) => h.slug === slug);
              return (
                <div
                  key={slug}
                  className="flex items-center gap-2 rounded-lg bg-surface-800 px-3 py-2 text-sm"
                >
                  <span>{habit?.icon || "🔥"}</span>
                  <span className="text-neutral-300 truncate">
                    {habit?.name || slug}
                  </span>
                  <span className="ml-auto text-xs">
                    {getFlameIcon(days)} {days}d
                  </span>
                </div>
              );
            })}
        </div>
      </section>

      {/* Actions */}
      <div className="mt-auto pt-4 pb-4 space-y-3">
        <a
          href="/wrap"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-brand hover:bg-brand-dark text-white transition-colors"
        >
          🎬 Weekly Wrap-Up
        </a>
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

// ─── Sub-components ─────────────────────────────────────────

function TargetCard({
  stat,
  showPrev,
}: {
  stat: TargetStat;
  showPrev: boolean;
}) {
  const pct = stat.target > 0 ? Math.min((stat.current / stat.target) * 100, 100) : 0;
  const color =
    pct >= 75 ? "bg-done" : pct >= 50 ? "bg-later" : pct > 0 ? "bg-missed" : "bg-surface-600";
  const textColor =
    pct >= 75 ? "text-done" : pct >= 50 ? "text-later" : "text-missed";

  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{stat.icon}</span>
          <span className="text-sm font-semibold">{stat.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${textColor}`}>
            {stat.current} / {stat.target}
          </span>
          {showPrev && <TrendArrow current={stat.current} prev={stat.prev} />}
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-surface-700">
        <div
          className={`h-2 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-neutral-600">{stat.unit}</span>
        <span className="text-[10px] text-neutral-600">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

function TrendArrow({
  current,
  prev,
  inverted = false,
}: {
  current: number;
  prev: number;
  inverted?: boolean;
}) {
  if (current === prev) return <span className="text-xs text-neutral-600">→</span>;
  const up = current > prev;
  // For bad habits, going up is bad (inverted)
  const isPositive = inverted ? !up : up;
  return (
    <span className={`text-xs ${isPositive ? "text-done" : "text-missed"}`}>
      {up ? "↑" : "↓"}
    </span>
  );
}

function TrendLine({
  current,
  prev,
  unit,
}: {
  current: number;
  prev: number;
  unit: string;
}) {
  const diff = current - prev;
  const isPositive = diff >= 0;
  return (
    <span className={`text-xs ${isPositive ? "text-done" : "text-missed"}`}>
      {isPositive ? "↑" : "↓"} {Math.abs(diff)} {unit} vs last week
    </span>
  );
}
