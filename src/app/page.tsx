"use client";

import { useEffect, useState } from "react";
import { getTodayLog, getLevelForXP, recalculateStreaks } from "@/lib/store";
import type { AdminTask, ShowingUpData } from "@/lib/store";
import { getFlameIcon, getQuoteOfTheDay, getContextualQuote } from "@/lib/habits";
import type { Quote } from "@/lib/habits";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { isBinaryLike } from "@/types/database";
import { getWeakHabits } from "@/lib/weakness";
import type { WeakHabit } from "@/lib/weakness";
import { startNotificationScheduler, getNotificationPermission, syncScheduleToServiceWorker, syncCompletionToServiceWorker } from "@/lib/notifications";
import { getNextCheckinDisplay } from "@/lib/schedule";
import { getDailyCompletionStats, getBadHabitStats, getWeekLogsFromArray, formatBadHabitDisplay } from "@/lib/completion";
import NotificationBanner from "@/components/NotificationBanner";
import LevelSuggestionBanner from "@/components/LevelSuggestionBanner";
import { useDB } from "@/hooks/useDB";
import { loadAdminTasksFromDB, recordAppOpenToDB } from "@/lib/db";

export default function Home() {
  const { state, settings, dbHabits, saveState: dbSaveState, loading } = useDB();
  const [weakHabits, setWeakHabits] = useState<WeakHabit[]>([]);
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [nextCheckin, setNextCheckin] = useState<string>("");
  const [showingUp, setShowingUp] = useState<ShowingUpData | null>(null);

  useEffect(() => {
    if (loading) return;

    // Recalculate streaks from log history (source of truth)
    const allHabits = getResolvedHabits(false, dbHabits, settings);
    const habitSlugsById: Record<string, string> = {};
    for (const h of allHabits) {
      habitSlugsById[h.id] = h.slug;
    }
    const updated = { ...state };
    updated.streaks = recalculateStreaks(updated, habitSlugsById);
    dbSaveState(updated);

    setWeakHabits(getWeakHabits());
    setNextCheckin(getNextCheckinDisplay());

    // Load admin tasks and record app open (async)
    loadAdminTasksFromDB().then(setAdminTasks);
    recordAppOpenToDB().then(setShowingUp);

    if (getNotificationPermission() === "granted") {
      startNotificationScheduler();
      syncScheduleToServiceWorker();
      syncCompletionToServiceWorker();
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayLog = getTodayLog(state);
  const levelInfo = getLevelForXP(state?.totalXp ?? 0);
  const xpProgress =
    levelInfo.nextXp > levelInfo.xpRequired
      ? ((state?.totalXp ?? 0) - levelInfo.xpRequired) /
        (levelInfo.nextXp - levelInfo.xpRequired)
      : 0;

  // Dynamic habit lists from resolved habits (respects user settings + DB habits)
  const resolvedHabits = getResolvedHabits(false, dbHabits, settings);
  const badHabits = resolvedHabits.filter((h) => h.category === "bad" && h.is_active);

  // Completion stats from shared service — single source of truth
  const completionStats = getDailyCompletionStats(todayLog, resolvedHabits);
  const { bareMinDone, bareMinTotal, stretchDone, stretchTotal, measuredDone, measuredTotal } = completionStats;

  // Dynamic top streaks — bare minimum habits sorted by streak length
  const streaks = state?.streaks ?? {};
  const topStreaks = resolvedHabits
    .filter((h) => h.is_active && isBinaryLike(h.category))
    .map((h) => ({ slug: h.slug, icon: h.icon || "🔥", label: h.name, days: streaks[h.slug] ?? 0 }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 4);

  // Bad habits this week — from shared service
  const weekLogs = getWeekLogsFromArray(state?.logs ?? []);
  const badWeekStats = getBadHabitStats(badHabits, weekLogs);

  // nextCheckin is set inside useEffect (client-side only, reads from localStorage)

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* XP Bar + Level + Settings */}
      <header className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="text-sm font-bold text-brand">
              Lv.{levelInfo.level} {levelInfo.title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">
              {state?.totalXp ?? 0} / {levelInfo.nextXp} XP
            </span>
            <a href="/settings" className="text-neutral-500 hover:text-neutral-300 text-lg">
              ⚙️
            </a>
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-700">
          <div
            className="h-2 rounded-full bg-brand transition-all duration-500"
            style={{ width: `${Math.min(xpProgress * 100, 100)}%` }}
          />
        </div>
      </header>

      {/* Quote of the Day */}
      <QuoteOfTheDay />

      {/* Notification Banner */}
      <NotificationBanner />

      {/* Level-Up Suggestions */}
      <LevelSuggestionBanner />

      {/* Sprint Mode Banner */}
      {state?.activeSprint && state.activeSprint.status === "active" && (
        <a
          href="/sprint"
          className="mx-0 mb-4 block rounded-xl bg-brand/10 border border-brand/30 px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🚀</span>
              <span className="text-sm font-bold text-brand">SPRINT MODE</span>
            </div>
            <span className="text-xs text-neutral-400">
              {Math.max(0, Math.ceil((new Date(state.activeSprint.deadline + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d left
            </span>
          </div>
          <div className="text-xs text-neutral-300 mt-1">{state.activeSprint.name}</div>
        </a>
      )}

      {/* Progress Rings */}
      <section className="flex justify-center gap-6 mb-8">
        <ProgressRing label="Non-negotiables" done={bareMinDone} total={bareMinTotal} color="#22c55e" />
        <ProgressRing label="Measured" done={measuredDone} total={measuredTotal} color="#3b82f6" />
        <ProgressRing label="Stretch" done={stretchDone} total={stretchTotal} color="#eab308" />
      </section>

      {/* Admin Tasks — always visible, links to /admin */}
      <a href="/admin" className="block rounded-xl bg-surface-800 border border-blue-900/30 p-4 mb-6 hover:bg-surface-700/80 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
            📋 General Admin
          </h2>
          <span className="text-[10px] text-neutral-500">
            {adminTasks.length > 0
              ? `${adminTasks.filter((t) => t.completed).length}/${adminTasks.length} done`
              : "Tap to manage →"}
          </span>
        </div>
        {adminTasks.length > 0 ? (
          <>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-surface-700 mb-2">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${(adminTasks.filter((t) => t.completed).length / adminTasks.length) * 100}%` }}
              />
            </div>
            <div className="space-y-1">
              {adminTasks.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[8px] font-bold shrink-0 ${
                    task.completed ? "bg-done/20 text-done" : "bg-surface-600 text-neutral-700"
                  }`}>
                    {task.completed ? "✓" : ""}
                  </span>
                  <span className={`text-xs flex-1 truncate ${task.completed ? "line-through text-neutral-600" : "text-neutral-300"}`}>
                    {task.title}
                  </span>
                </div>
              ))}
              {adminTasks.length > 4 && (
                <span className="text-[10px] text-blue-500">
                  +{adminTasks.length - 4} more
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-neutral-600">
            No tasks for today. Tap to add tasks or focus from your backlog.
          </p>
        )}
      </a>

      {/* Top Streaks — Dynamic */}
      <section className="mb-6">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {topStreaks.map((s) => (
            <StreakPill key={s.slug} icon={s.icon} label={s.label} days={s.days} />
          ))}
        </div>
      </section>

      {/* Needs Attention — Weakness Detection */}
      {weakHabits.length > 0 && (
        <section className="rounded-xl bg-surface-800 border border-later/30 p-4 mb-6">
          <h2 className="text-xs font-bold text-later uppercase tracking-wider mb-3">
            ⚠️ Needs Attention
          </h2>
          <div className="space-y-2 text-sm">
            {weakHabits.slice(0, 3).map((wh) => (
              <div key={wh.habitId} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span>{wh.habitIcon}</span>
                  <span className="text-neutral-300">{wh.habitName}</span>
                </span>
                <span className="text-later text-xs">
                  {Math.round(wh.completionRate * 100)}% this week
                  {wh.isBrokenStreak && " · streak broken"}
                </span>
              </div>
            ))}
          </div>
          <a
            href="/checkin"
            className="mt-3 block text-center text-xs text-brand hover:text-brand-dark font-medium transition-colors"
          >
            Log now to improve →
          </a>
        </section>
      )}

      {/* Bad Habits — Prominent */}
      {badWeekStats.length > 0 && (
        <section className="rounded-xl bg-surface-800 border border-red-900/30 p-4 mb-6">
          <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">
            Bad Habits This Week
          </h2>
          <div className="space-y-2 text-sm">
            {badWeekStats.map((bh) => (
              <BadHabitRow key={bh.slug} icon={bh.icon} label={bh.label} value={formatBadHabitDisplay(bh.unit, bh.count, bh.minutes)} />
            ))}
          </div>
        </section>
      )}

      {/* Next Check-in */}
      <section className="text-center text-sm text-neutral-400 mb-6">
        <p>
          Next check-in: <span className="text-white font-medium">{nextCheckin}</span>
        </p>
      </section>

      {/* You Keep Showing Up */}
      {showingUp && showingUp.uniqueDays >= 2 && (
        <section className="rounded-xl bg-surface-800 border border-done/20 p-4 mb-6 text-center">
          <p className="text-xs text-done font-medium mb-1">
            You keep showing up 💪
          </p>
          <p className="text-2xl font-black text-white">
            {showingUp.uniqueDays} <span className="text-sm font-medium text-neutral-400">days opened</span>
          </p>
          <p className="text-[10px] text-neutral-600 mt-1">
            {showingUp.totalOpens} total opens since {new Date(showingUp.firstOpenDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </p>
        </section>
      )}

      {/* ─── Command Centre ─── */}
      <nav className="mt-auto pb-4 space-y-4">

        {/* Execute — Primary actions: what you DO right now */}
        <div>
          <h3 className="text-[9px] font-bold text-brand uppercase tracking-[0.15em] mb-2 px-1">
            Execute
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <NavTile icon="📝" label="Check In" href="/checkin" accent />
            <NavTile icon="📋" label="Admin" href="/admin" />
            <NavTile icon="🏋️" label="Gym Log" href="/gym" />
            <NavTile icon="🚀" label="Sprint" href="/sprint" />
          </div>
        </div>

        {/* Reflect — Review & understand your progress */}
        <div>
          <h3 className="text-[9px] font-bold text-blue-400/70 uppercase tracking-[0.15em] mb-2 px-1">
            Reflect
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <NavTile icon="📊" label="Weekly" href="/weekly" compact />
            <NavTile icon="🔍" label="Insights" href="/insights" compact />
            <NavTile icon="🎬" label="Wrap-Up" href="/wrap" compact />
            <NavTile icon="🌳" label="Tree" href="/tree" compact />
          </div>
        </div>

        {/* Design — Shape your system */}
        <div>
          <h3 className="text-[9px] font-bold text-neutral-500 uppercase tracking-[0.15em] mb-2 px-1">
            Design
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <NavTile icon="🔗" label="My Routine" href="/routine" subtle />
            <NavTile icon="⚙️" label="Settings" href="/settings" subtle />
          </div>
        </div>

      </nav>
    </div>
  );
}

function QuoteOfTheDay() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isRefreshed, setIsRefreshed] = useState(false);

  useEffect(() => {
    setQuote(getQuoteOfTheDay());
  }, []);

  function handleRefresh() {
    setQuote(getContextualQuote("default"));
    setIsRefreshed(true);
  }

  if (!quote) return null;

  const categoryLabels: Record<string, string> = {
    prompt: "Reflection",
    rule: "Rule",
    liner: "Mindset",
    strong_thought: "Discipline",
  };

  return (
    <section className="rounded-xl bg-surface-800/60 border border-surface-700 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-brand uppercase tracking-wider">
          {categoryLabels[quote.category] ?? "Quote"} of the Day
        </span>
        <button
          onClick={handleRefresh}
          className="text-neutral-600 hover:text-neutral-400 text-xs transition-colors"
          title="Show another"
        >
          🔄
        </button>
      </div>
      <p className="text-sm text-neutral-300 italic leading-relaxed">
        &ldquo;{quote.text}&rdquo;
      </p>
    </section>
  );
}

function ProgressRing({
  label,
  done,
  total,
  color,
}: {
  label: string;
  done: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (done / total) * 100 : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[88px] h-[88px]">
        <svg width="88" height="88" className="-rotate-90">
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-surface-700"
          />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
          {done}/{total}
        </span>
      </div>
      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function StreakPill({ icon, label, days }: { icon: string; label: string; days: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-800 px-3 py-2">
      <span>{icon}</span>
      <span className="text-neutral-300">{label}</span>
      <span className="ml-auto text-xs">
        {getFlameIcon(days)} {days}d
      </span>
    </div>
  );
}

function BadHabitRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>
        {icon} {label}
      </span>
      <span className="text-neutral-300">{value}</span>
    </div>
  );
}

function NavTile({
  icon,
  label,
  href,
  accent,
  compact,
  subtle,
}: {
  icon: string;
  label: string;
  href: string;
  accent?: boolean;
  compact?: boolean;
  subtle?: boolean;
}) {
  if (accent) {
    // Execute group — bold, brand-coloured, taller
    return (
      <a
        href={href}
        className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-brand hover:bg-brand-dark py-4 text-white font-bold transition-all active:scale-[0.97]"
      >
        <span className="text-xl">{icon}</span>
        <span className="text-[11px] tracking-wide">{label}</span>
      </a>
    );
  }

  if (compact) {
    // Reflect group — slim, icon-forward
    return (
      <a
        href={href}
        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-800 hover:bg-surface-700 py-3 transition-all active:scale-[0.97]"
      >
        <span className="text-lg">{icon}</span>
        <span className="text-[10px] text-neutral-400 font-medium">{label}</span>
      </a>
    );
  }

  if (subtle) {
    // Design group — understated, horizontal
    return (
      <a
        href={href}
        className="flex items-center justify-center gap-2 rounded-xl bg-surface-800/60 border border-surface-700/50 hover:bg-surface-700 py-2.5 transition-all active:scale-[0.97]"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-neutral-500 font-medium">{label}</span>
      </a>
    );
  }

  // Default (Execute non-accent)
  return (
    <a
      href={href}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-800 hover:bg-surface-700 py-4 transition-all active:scale-[0.97]"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] text-neutral-300 font-medium tracking-wide">{label}</span>
    </a>
  );
}
