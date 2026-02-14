"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDB } from "@/hooks/useDB";
import { useAuth } from "@/components/AuthProvider";
import { buildCoachContext } from "@/lib/coach/context";
import { COACH_SYSTEM_PROMPT, ANALYSIS_PROMPT_PREFIX, EXPERIMENT_SUGGEST_PROMPT } from "@/lib/coach/prompts";
import {
  loadExperiments,
  saveExperiment,
  acceptExperiment,
  completeExperiment,
  skipExperiment,
  createExperimentFromAI,
} from "@/lib/coach/experiments";
import type { CoachExperiment, LocalState, DayLog, AdminTask, WrapReflection } from "@/lib/store";
import {
  loadGymSessions,
  loadShowingUpData,
  getWeekLogs,
  getPrevWeekLogs,
  getLevelForXP,
  loadAdminTasks,
  addAdminTask,
  removeAdminTask,
  getTomorrowDate,
} from "@/lib/store";
import { XP_VALUES } from "@/lib/habits";
import { saveAdminTaskToDB } from "@/lib/db";
import {
  loadRecentConversationSummaries,
  saveConversation,
  generateConversationSummary,
} from "@/lib/coach/conversations";
import type { ConversationSummary } from "@/lib/coach/conversations";
import { getResolvedHabits, getHabitsWithHistory } from "@/lib/resolvedHabits";
import { getFlameIcon } from "@/lib/habits";
import { isBinaryLike } from "@/types/database";
import type { Habit } from "@/types/database";
import { supabase } from "@/lib/supabase";
import VoiceInput from "@/components/VoiceInput";

// ─── Types ──────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

type CoachMode = "strategy" | "review";
type StrategyTab = "insights" | "analysis" | "experiments";

// ─── Reflection Questions (rotate weekly) ───────────────────
const REFLECTION_QUESTIONS = [
  "What's the one thing you'd do differently next week?",
  "What are you most proud of this week?",
  "What nearly derailed you, and how will you handle it next time?",
  "Which habit felt easiest this week? Why?",
  "What would you tell yourself on Monday morning?",
  "What's one pattern you noticed about your best days?",
  "If you could only keep 3 habits next week, which would they be?",
];

function getWeeklyQuestion(): string {
  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return REFLECTION_QUESTIONS[weekNum % REFLECTION_QUESTIONS.length];
}

// ─── Component ──────────────────────────────────────────────
export default function CoachPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CoachPage />
    </Suspense>
  );
}

function CoachPage() {
  const searchParams = useSearchParams();
  const { state: dbState, settings, dbHabits, loading, saveState: dbSaveState } = useDB();
  const { user } = useAuth();
  const initialMode = searchParams.get("mode") === "review" ? "review" : "strategy";
  const [mode, setMode] = useState<CoachMode>(initialMode);
  const [tab, setTab] = useState<StrategyTab>("analysis");
  const [hasCoachKey, setHasCoachKey] = useState<boolean | null>(null);

  // Review mode state
  const [reviewState, setReviewState] = useState<LocalState | null>(null);

  // Check if coach key is configured
  useEffect(() => {
    if (!user) { setHasCoachKey(false); return; }
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("coach_api_keys")
          .select("provider")
          .eq("user_id", user.id)
          .single();
        setHasCoachKey(!!data);
      } catch { setHasCoachKey(false); }
    })();
  }, [user]);

  // Initialize review state — streaks already recalculated by useDB (single source of truth)
  useEffect(() => {
    if (loading) return;
    setReviewState(dbState);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;

  const habits = getResolvedHabits(false, dbHabits, settings);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-4 pt-6 pb-2">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">🧠 Coach</h1>
      </header>

      {/* Mode Switcher — Strategy / Review */}
      <div className="px-4 mb-3">
        <div className="flex bg-surface-800 rounded-xl p-1">
          <button
            onClick={() => setMode("strategy")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
              mode === "strategy"
                ? "bg-brand text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            ⚡ Strategy
          </button>
          <button
            onClick={() => setMode("review")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
              mode === "review"
                ? "bg-brand text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            📊 Review
          </button>
        </div>
      </div>

      {/* Strategy Mode */}
      {mode === "strategy" && (
        <div className="flex flex-col flex-1 px-4 pb-6">
          <p className="text-xs text-neutral-600 mb-3">
            AI-powered coaching, experiments & insights
          </p>

          {/* Strategy Tabs */}
          <div className="flex gap-1 bg-surface-800 rounded-xl p-1 mb-4">
            {([
              { key: "insights" as StrategyTab, label: "Insights", icon: "📊" },
              { key: "analysis" as StrategyTab, label: "Analysis", icon: "🔍" },
              { key: "experiments" as StrategyTab, label: "Experiments", icon: "🧪" },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                  tab === t.key
                    ? "bg-purple-600 text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === "insights" && <InsightsTab state={dbState} habits={habits} />}
          {tab === "analysis" && (
            <AnalysisTab state={dbState} settings={settings} habits={habits} hasCoachKey={hasCoachKey} />
          )}
          {tab === "experiments" && (
            <ExperimentsTab state={dbState} settings={settings} habits={habits} hasCoachKey={hasCoachKey} />
          )}
        </div>
      )}

      {/* Review Mode — Wrap Card Carousel */}
      {mode === "review" && reviewState && (
        <ReviewMode
          state={reviewState}
          dbHabits={dbHabits}
          settings={settings}
          dbSaveState={dbSaveState}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ═══ REVIEW MODE (Existing Wrap Card Carousel) ═══════════════
// ═══════════════════════════════════════════════════════════════

function ReviewMode({
  state,
  dbHabits,
  settings,
  dbSaveState,
}: {
  state: LocalState;
  dbHabits: Habit[] | null | undefined;
  settings: import("@/lib/store").UserSettings;
  dbSaveState: (s: LocalState) => void;
}) {
  const [currentCard, setCurrentCard] = useState(0);
  const [reflectionAnswer, setReflectionAnswer] = useState("");
  const [forwardIntention, setForwardIntention] = useState("");
  const [completed, setCompleted] = useState(false);
  const [tomorrowTasks, setTomorrowTasks] = useState<AdminTask[]>([]);
  const [newTomorrowText, setNewTomorrowText] = useState("");
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    setTomorrowTasks(loadAdminTasks(getTomorrowDate()));
  }, []);

  function handleAddTomorrowTask() {
    if (!newTomorrowText.trim()) return;
    addAdminTask(newTomorrowText.trim(), "planned", getTomorrowDate());
    setTomorrowTasks(loadAdminTasks(getTomorrowDate()));
    setNewTomorrowText("");
  }

  function handleRemoveTomorrowTask(taskId: string) {
    removeAdminTask(taskId);
    setTomorrowTasks(loadAdminTasks(getTomorrowDate()));
  }

  const cards = buildReviewCards(
    state, reflectionAnswer, setReflectionAnswer,
    forwardIntention, setForwardIntention,
    tomorrowTasks, newTomorrowText, setNewTomorrowText,
    handleAddTomorrowTask, handleRemoveTomorrowTask, dbHabits,
  );

  const goNext = useCallback(() => {
    if (currentCard < cards.length - 1) setCurrentCard((c) => c + 1);
  }, [currentCard, cards.length]);

  const goPrev = useCallback(() => {
    if (currentCard > 0) setCurrentCard((c) => c - 1);
  }, [currentCard]);

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.tagName === "A") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) goPrev();
    else goNext();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  function handleComplete() {
    const newState = { ...state };
    const today = new Date().toISOString().slice(0, 10);

    const reflections = [...(newState.reflections ?? [])];
    const hasReflection = reflectionAnswer.trim();
    const hasIntention = forwardIntention.trim();
    if (hasReflection || hasIntention) {
      // Deterministic ID so same-day wraps upsert cleanly instead of duplicating
      const reflectionId = `wrap-${today}-weekly`;
      // Remove any existing entry for this ID (in case of re-wrap same day)
      const filtered = reflections.filter((r) => r.id !== reflectionId);
      filtered.push({
        id: reflectionId,
        date: today,
        period: "weekly",
        question: getWeeklyQuestion(),
        answer: hasReflection || "",
        forwardIntention: hasIntention || undefined,
      });
      newState.reflections = filtered;
    } else {
      newState.reflections = reflections;
    }
    newState.lastWrapDate = today;

    // Award XP
    newState.totalXp += 50;
    if (reflectionAnswer.trim()) newState.totalXp += 25;
    if (forwardIntention.trim()) newState.totalXp += 25;
    if (tomorrowTasks.length > 0) newState.totalXp += XP_VALUES.PLAN_TOMORROW_SET;

    dbSaveState(newState);

    // Sync tomorrow tasks to Supabase (they're already in localStorage via addAdminTask)
    for (const task of tomorrowTasks) {
      saveAdminTaskToDB(task).catch((err) =>
        console.warn("[coach] Failed to sync tomorrow task:", err)
      );
    }

    setCompleted(true);
  }

  // Completed screen
  if (completed) {
    const bonusXp = 50 + (reflectionAnswer.trim() ? 25 : 0) + (forwardIntention.trim() ? 25 : 0) + (tomorrowTasks.length > 0 ? XP_VALUES.PLAN_TOMORROW_SET : 0);
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-brand mb-2">Week Wrapped!</h1>
        <p className="text-neutral-400 text-sm mb-2">+{bonusXp} XP for completing your review</p>
        {reflectionAnswer.trim() && (
          <p className="text-neutral-500 text-xs mb-6">Your reflection has been saved</p>
        )}
        <div className="flex gap-3">
          <a href="/" className="rounded-xl bg-surface-800 hover:bg-surface-700 px-6 py-3 text-sm font-medium transition-colors">
            Dashboard
          </a>
          <a href="/weekly" className="rounded-xl bg-brand hover:bg-brand-dark px-6 py-3 text-sm font-bold text-white transition-colors">
            See Stats
          </a>
        </div>
      </div>
    );
  }

  if (cards.length === 0) return null;

  const card = cards[currentCard];
  const isLastCard = currentCard === cards.length - 1;

  return (
    <div
      className={`flex flex-col flex-1 ${card.bg} transition-all duration-500`}
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress dots */}
      <div className="flex gap-1 px-4 pt-2 pb-2">
        {cards.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-0.5 rounded-full transition-all duration-300 ${
              i <= currentCard ? "bg-white/80" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Card counter */}
      <div className="flex justify-end px-4 py-1">
        <span className="text-white/40 text-xs">
          {currentCard + 1} / {cards.length}
        </span>
      </div>

      {/* Card content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {card.content}
      </div>

      {/* Bottom navigation */}
      <div className="px-6 pb-8">
        {isLastCard ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleComplete(); }}
            className="w-full rounded-xl bg-white text-black py-4 font-bold text-base active:scale-[0.98] transition-all"
          >
            Complete Review
          </button>
        ) : (
          <div className="flex justify-center gap-6 text-white/40 text-xs">
            <span>← tap left</span>
            <span>tap right →</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Review Cards ──────────────────────────────────────────
interface ReviewCard {
  type: string;
  bg: string;
  content: React.ReactNode;
}

function buildReviewCards(
  state: LocalState,
  reflectionAnswer: string,
  setReflectionAnswer: (v: string) => void,
  forwardIntention: string,
  setForwardIntention: (v: string) => void,
  tomorrowTasks: AdminTask[],
  newTomorrowText: string,
  setNewTomorrowText: (v: string) => void,
  onAddTomorrowTask: () => void,
  onRemoveTomorrowTask: (taskId: string) => void,
  dbHabits?: Habit[] | null,
): ReviewCard[] {
  const cards: ReviewCard[] = [];
  const weekLogs = getWeekLogs(state);
  const prevWeekLogs = getPrevWeekLogs(state);
  const habits = getHabitsWithHistory(dbHabits, state.logs);
  const activeHabits = habits.filter((h) => h.is_active);
  const badHabits = activeHabits.filter((h) => h.category === "bad");

  // ── Card 1: Opening Win ──
  const daysLogged = weekLogs.length;
  const bareMinDays = weekLogs.filter((l) => l.bareMinimumMet).length;
  const perfectWeek = bareMinDays === 7;

  cards.push({
    type: "win",
    bg: "bg-gradient-to-b from-emerald-900 to-emerald-950",
    content: (
      <div className="text-center space-y-4">
        <div className="text-5xl">🏆</div>
        <h2 className="text-3xl font-black text-white">Your Week</h2>
        <p className="text-xl text-emerald-200 font-semibold">
          You showed up {daysLogged} out of 7 days.
        </p>
        <p className="text-sm text-emerald-300/80 max-w-xs mx-auto">
          {perfectWeek
            ? "You didn't miss a single day. That's discipline."
            : daysLogged >= 5
              ? `${daysLogged} days of action. Every one of those counts.`
              : daysLogged > 0
                ? "You showed up. That's step one. Let's build on it."
                : "New week, new start. The system is here."}
        </p>
      </div>
    ),
  });

  // ── Card 2: Bare Minimum Scorecard ──
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  cards.push({
    type: "stat",
    bg: "bg-gradient-to-b from-surface-900 to-zinc-950",
    content: (
      <div className="text-center space-y-6 w-full max-w-sm">
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 uppercase tracking-widest">Bare Minimum</p>
          <p className="text-5xl font-black text-white">{bareMinDays}/7</p>
        </div>
        <div className="flex gap-2 justify-center">
          {dayLabels.map((day, i) => {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().slice(0, 10);
            const log = weekLogs.find((l) => l.date === dateStr);
            const met = log?.bareMinimumMet;
            const isPast = date <= now;
            return (
              <div key={day} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-neutral-500">{day}</span>
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                    met
                      ? "bg-emerald-500 text-white"
                      : isPast && log
                        ? "bg-red-500/30 text-red-400"
                        : "bg-white/10 text-white/30"
                  }`}
                >
                  {met ? "✓" : isPast && log ? "✕" : "·"}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-sm text-neutral-400">
          {perfectWeek
            ? "Perfect bare minimum week. The system held."
            : bareMinDays > 0
              ? `You protected the streak ${bareMinDays} days. The ${7 - bareMinDays} you missed? New data.`
              : "This week didn't go as planned. Tomorrow we reset."}
        </p>
      </div>
    ),
  });

  // ── Card 3: Top Streak ──
  const streakEntries = Object.entries(state.streaks)
    .map(([slug, days]) => {
      const habit = habits.find((h) => h.slug === slug);
      return { slug, days, name: habit?.name ?? slug, icon: habit?.icon ?? "🔥" };
    })
    .filter((s) => s.days > 0)
    .sort((a, b) => b.days - a.days);
  const topStreak = streakEntries[0];

  if (topStreak) {
    cards.push({
      type: "streak",
      bg: "bg-gradient-to-b from-orange-900 to-red-950",
      content: (
        <div className="text-center space-y-4">
          <div className="text-6xl">{getFlameIcon(topStreak.days)}</div>
          <p className="text-xs text-orange-300/60 uppercase tracking-widest">Longest Active Streak</p>
          <h2 className="text-4xl font-black text-white">
            {topStreak.icon} {topStreak.name}
          </h2>
          <p className="text-5xl font-black text-orange-400">{topStreak.days} days</p>
          <p className="text-sm text-orange-200/60 max-w-xs mx-auto">
            That&apos;s {topStreak.days} days of casting votes for who you want to be.
          </p>
          {streakEntries.length > 1 && (
            <div className="space-y-2 pt-4">
              {streakEntries.slice(1, 3).map((s) => (
                <div key={s.slug} className="flex items-center justify-center gap-2 text-sm text-orange-200/80">
                  <span>{s.icon}</span>
                  <span>{s.name}</span>
                  <span className="text-orange-400 font-bold">{s.days}d</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }

  // ── Card 4: Training Recap ──
  const trainingHabit = habits.find((h) => h.slug === "training");
  const trainingDone = weekLogs.filter(
    (l) => trainingHabit && l.entries[trainingHabit.id]?.status === "done"
  ).length;
  const gymSessions = loadGymSessions().filter((s) => {
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    return s.date >= weekStartStr;
  });
  const gymCount = gymSessions.filter((s) => s.trainingType === "gym").length;
  const bjjCount = gymSessions.filter((s) => s.trainingType === "bjj").length;
  const runCount = gymSessions.filter((s) => s.trainingType === "run").length;

  cards.push({
    type: "stat",
    bg: "bg-gradient-to-b from-blue-900 to-indigo-950",
    content: (
      <div className="text-center space-y-4">
        <div className="text-5xl">💪</div>
        <p className="text-xs text-blue-300/60 uppercase tracking-widest">Training This Week</p>
        <p className="text-6xl font-black text-white">{trainingDone}</p>
        <p className="text-sm text-blue-200/80">sessions logged</p>
        {(gymCount > 0 || bjjCount > 0 || runCount > 0) && (
          <div className="flex gap-4 justify-center text-sm text-blue-300/70">
            {gymCount > 0 && <span>🏋️ {gymCount}x Gym</span>}
            {bjjCount > 0 && <span>🥋 {bjjCount}x BJJ</span>}
            {runCount > 0 && <span>🏃 {runCount}x Run</span>}
          </div>
        )}
        <p className="text-sm text-blue-200/60">
          {trainingDone >= 5
            ? "Target hit. Your body is your vehicle — you're maintaining it."
            : trainingDone >= 3
              ? `${trainingDone}/5 target. Close — push for it next week.`
              : "Show up tomorrow. Movement is medicine."}
        </p>
      </div>
    ),
  });

  // ── Card 5: Bad Habit Confrontation ──
  if (badHabits.length > 0) {
    const badStats = badHabits.map((h) => {
      let count = 0, minutes = 0, prevCount = 0, prevMinutes = 0;
      for (const log of weekLogs) {
        const entry = log.badEntries[h.id];
        if (entry?.occurred) { count++; minutes += entry.durationMinutes ?? 0; }
      }
      for (const log of prevWeekLogs) {
        const entry = log.badEntries[h.id];
        if (entry?.occurred) { prevCount++; prevMinutes += entry.durationMinutes ?? 0; }
      }
      return { name: h.name, icon: h.icon || "⚠️", unit: h.unit, count, minutes, prevCount, prevMinutes };
    });

    const anyBad = badStats.some((b) => b.count > 0 || b.minutes > 0);
    const improved = badStats.every((b) =>
      b.unit === "minutes" ? b.minutes <= b.prevMinutes : b.count <= b.prevCount
    );

    cards.push({
      type: "bad",
      bg: "bg-gradient-to-b from-red-900/80 to-red-950",
      content: (
        <div className="text-center space-y-4 w-full max-w-sm">
          <div className="text-5xl">🎮</div>
          <p className="text-xs text-red-300/60 uppercase tracking-widest">Bad Habits Check</p>
          <h2 className="text-2xl font-black text-white">Let&apos;s talk about it.</h2>
          <div className="space-y-3 text-left">
            {badStats.map((b) => {
              const display = b.unit === "minutes"
                ? b.minutes >= 60 ? `${(b.minutes / 60).toFixed(1)}h` : `${b.minutes}m`
                : `${b.count} days`;
              const prevVal = b.unit === "minutes" ? b.prevMinutes : b.prevCount;
              const curVal = b.unit === "minutes" ? b.minutes : b.count;
              const trend = prevVal === 0 && curVal === 0 ? "→" : curVal < prevVal ? "↓" : curVal > prevVal ? "↑" : "→";
              const trendColor = trend === "↓" ? "text-emerald-400" : trend === "↑" ? "text-red-400" : "text-neutral-500";
              return (
                <div key={b.name} className="flex items-center justify-between rounded-lg bg-black/20 px-4 py-3">
                  <span className="text-sm text-white">{b.icon} {b.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-white font-bold">{display}</span>
                    <span className={`text-xs ${trendColor}`}>{trend}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-red-200/60">
            {!anyBad
              ? "Clean week. Zero incidents. That's who you are now."
              : improved
                ? "Trending down. Keep squeezing it out."
                : "This went up this week. You see it. Now decide."}
          </p>
        </div>
      ),
    });
  }

  // ── Card 6: XP & Level ──
  const xpThisWeek = weekLogs.reduce((sum, l) => sum + l.xpEarned, 0);
  const levelInfo = getLevelForXP(state.totalXp);
  const xpProgress = levelInfo.nextXp > levelInfo.xpRequired
    ? ((state.totalXp) - levelInfo.xpRequired) / (levelInfo.nextXp - levelInfo.xpRequired)
    : 0;

  cards.push({
    type: "stat",
    bg: "bg-gradient-to-b from-amber-900 to-yellow-950",
    content: (
      <div className="text-center space-y-4">
        <div className="text-5xl">⚡</div>
        <p className="text-xs text-amber-300/60 uppercase tracking-widest">XP Earned This Week</p>
        <p className="text-6xl font-black text-amber-400">+{xpThisWeek}</p>
        <div className="space-y-2 w-full max-w-xs mx-auto">
          <p className="text-sm text-white font-bold">Lv.{levelInfo.level} {levelInfo.title}</p>
          <div className="w-full h-3 rounded-full bg-black/30">
            <div
              className="h-3 rounded-full bg-amber-500 transition-all duration-700"
              style={{ width: `${Math.min(xpProgress * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-amber-200/60">{state.totalXp} / {levelInfo.nextXp} XP to next level</p>
        </div>
      </div>
    ),
  });

  // ── Card 7: Deep Work ──
  const deepWorkHabit = habits.find((h) => h.slug === "deep-work");
  if (deepWorkHabit) {
    const blocks = weekLogs.reduce((sum, l) => sum + (l.entries[deepWorkHabit.id]?.value ?? 0), 0);
    const target = 15;

    cards.push({
      type: "stat",
      bg: "bg-gradient-to-b from-violet-900 to-purple-950",
      content: (
        <div className="text-center space-y-4">
          <div className="text-5xl">🧠</div>
          <p className="text-xs text-violet-300/60 uppercase tracking-widest">Deep Work</p>
          <p className="text-6xl font-black text-white">{blocks}</p>
          <p className="text-sm text-violet-200/80">blocks this week</p>
          <div className="w-full max-w-xs mx-auto h-3 rounded-full bg-black/30">
            <div
              className="h-3 rounded-full bg-violet-500 transition-all duration-700"
              style={{ width: `${Math.min((blocks / target) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-violet-200/60">{blocks}/{target} target</p>
          <p className="text-sm text-violet-200/60">
            {blocks >= target
              ? "Target met. Your focus is building."
              : `${blocks} out of ${target}. Even one block is a vote for the person you're becoming.`}
          </p>
        </div>
      ),
    });
  }

  // ── Card 8: Pattern / Insight ──
  const insight = generateInsight(state, weekLogs, habits);
  if (insight) {
    cards.push({
      type: "insight",
      bg: "bg-gradient-to-b from-cyan-900 to-teal-950",
      content: (
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🧠</div>
          <p className="text-xs text-cyan-300/60 uppercase tracking-widest">Pattern Detected</p>
          <p className="text-xl font-bold text-white leading-relaxed">{insight}</p>
        </div>
      ),
    });
  }

  // ── Card 9: Reflection ──
  const question = getWeeklyQuestion();
  cards.push({
    type: "reflection",
    bg: "bg-gradient-to-b from-slate-800 to-slate-900",
    content: (
      <div className="text-center space-y-6 w-full max-w-sm">
        <div className="text-5xl">💬</div>
        <p className="text-xs text-slate-400 uppercase tracking-widest">Reflection</p>
        <p className="text-lg font-bold text-white leading-relaxed">{question}</p>
        <div className="w-full">
          <div className="flex justify-end mb-2">
            <VoiceInput
              onTranscript={(text) => setReflectionAnswer(reflectionAnswer ? `${reflectionAnswer} ${text}` : text)}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/70"
              label="🎤 Dictate"
            />
          </div>
          <textarea
            value={reflectionAnswer}
            onChange={(e) => setReflectionAnswer(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Type or tap 🎤 to dictate..."
            rows={4}
            className="w-full bg-black/30 rounded-xl px-4 py-3 text-sm text-white border border-white/10 outline-none resize-none focus:ring-2 focus:ring-white/20 placeholder:text-white/30"
          />
        </div>
        <p className="text-xs text-slate-500">Your response is saved and referenced in future reviews</p>
      </div>
    ),
  });

  // ── Card 10: Plan Tomorrow ──
  cards.push({
    type: "plan-tomorrow",
    bg: "bg-gradient-to-b from-slate-800 via-blue-950 to-slate-900",
    content: (
      <div className="text-center space-y-5 w-full max-w-sm">
        <div className="text-5xl">📋</div>
        <h2 className="text-2xl font-black text-white">What&apos;s on the plate tomorrow?</h2>
        <p className="text-sm text-blue-300/60">Add admin tasks — these will appear in tomorrow&apos;s check-in.</p>
        {tomorrowTasks.length > 0 && (
          <div className="space-y-2 text-left">
            {tomorrowTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                <span className="text-sm text-white flex-1">{task.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveTomorrowTask(task.id); }}
                  className="text-white/30 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 w-full">
          <input
            type="text"
            value={newTomorrowText}
            onChange={(e) => setNewTomorrowText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAddTomorrowTask(); }}
            onClick={(e) => e.stopPropagation()}
            placeholder="e.g. Reply to tax email..."
            className="flex-1 bg-black/30 rounded-xl px-4 py-3 text-sm text-white border border-white/10 outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-white/30"
          />
          <button
            onClick={(e) => { e.stopPropagation(); onAddTomorrowTask(); }}
            className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-blue-300/30 italic">
          Skip if nothing planned — you can always add during the day.
        </p>
      </div>
    ),
  });

  // ── Card 11: Forward Intention ──
  const topStreaksForward = streakEntries.slice(0, 3);
  cards.push({
    type: "forward",
    bg: "bg-gradient-to-b from-indigo-900 via-purple-900 to-fuchsia-950",
    content: (
      <div className="text-center space-y-6 w-full max-w-sm">
        <div className="text-5xl">🔮</div>
        <h2 className="text-2xl font-black text-white">New week starts tomorrow.</h2>
        {topStreaksForward.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-purple-300/60 uppercase tracking-widest">Streaks to Protect</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {topStreaksForward.map((s) => (
                <span key={s.slug} className="bg-white/10 rounded-full px-3 py-1.5 text-sm text-white">
                  {s.icon} {s.name} {s.days}d
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2 w-full">
          <div className="flex items-center justify-between">
            <p className="text-sm text-purple-200/80">One focus for next week:</p>
            <VoiceInput
              onTranscript={(text) => setForwardIntention(forwardIntention ? `${forwardIntention} ${text}` : text)}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/70"
              label="🎤"
            />
          </div>
          <input
            type="text"
            value={forwardIntention}
            onChange={(e) => setForwardIntention(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="I will..."
            className="w-full bg-black/30 rounded-xl px-4 py-3 text-sm text-white border border-white/10 outline-none focus:ring-2 focus:ring-white/20 placeholder:text-white/30 text-center"
          />
        </div>
        <p className="text-sm text-purple-200/40 italic">Small actions. Ruthless consistency. Let&apos;s go.</p>
      </div>
    ),
  });

  return cards;
}

// ─── Insight Generator (for Review) ─────────────────────────
function generateInsight(state: LocalState, weekLogs: DayLog[], habits: Habit[]): string | null {
  const insights: string[] = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const completionByDay: { day: string; count: number }[] = [];

  for (const log of weekLogs) {
    const d = new Date(log.date + "T12:00:00");
    const dayName = dayNames[d.getDay()];
    const doneCount = Object.values(log.entries).filter((e) => e.status === "done").length;
    completionByDay.push({ day: dayName, count: doneCount });
  }

  if (completionByDay.length >= 3) {
    const sorted = [...completionByDay].sort((a, b) => b.count - a.count);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.count > worst.count + 2) {
      insights.push(`Your best day was ${best.day} (${best.count} habits). Your hardest was ${worst.day} (${worst.count}). What made ${best.day} click?`);
    }
  }

  const trainingHabit = habits.find((h) => h.slug === "training");
  const energyHabit = habits.find((h) => h.slug === "energy");
  if (trainingHabit && energyHabit) {
    let trainDayEnergy = 0, trainDays = 0, restDayEnergy = 0, restDays = 0;
    for (const log of weekLogs) {
      const trained = log.entries[trainingHabit.id]?.status === "done";
      const energy = log.entries[energyHabit.id]?.value ?? 0;
      if (energy > 0) {
        if (trained) { trainDayEnergy += energy; trainDays++; }
        else { restDayEnergy += energy; restDays++; }
      }
    }
    if (trainDays > 0 && restDays > 0) {
      const avgTrain = trainDayEnergy / trainDays;
      const avgRest = restDayEnergy / restDays;
      if (avgTrain > avgRest + 0.5) {
        insights.push("Every day you trained, your energy score was higher. Coincidence?");
      }
    }
  }

  const missedDays: string[] = [];
  for (const log of weekLogs) {
    const missCount = Object.values(log.entries).filter((e) => e.status === "missed").length;
    if (missCount > 0) {
      const d = new Date(log.date + "T12:00:00");
      missedDays.push(dayNames[d.getDay()]);
    }
  }
  if (missedDays.length >= 2 && missedDays.length <= 3) {
    insights.push(`You had misses on ${missedDays.join(" and ")}. Is that a pattern worth watching?`);
  }

  const leagueHabit = habits.find((h) => h.slug === "league");
  const deepWorkHabit = habits.find((h) => h.slug === "deep-work");
  if (leagueHabit && deepWorkHabit) {
    let gamingDaysLowWork = 0;
    for (const log of weekLogs) {
      const gamed = log.badEntries[leagueHabit.id]?.occurred;
      const deepBlocks = log.entries[deepWorkHabit.id]?.value ?? 0;
      if (gamed && deepBlocks === 0) gamingDaysLowWork++;
    }
    if (gamingDaysLowWork >= 2) {
      insights.push("On the days you gamed, deep work dropped to zero. The data speaks.");
    }
  }

  if (insights.length === 0) return null;
  return insights[Math.floor(Math.random() * insights.length)];
}

// ═══════════════════════════════════════════════════════════════
// ═══ STRATEGY MODE TABS ══════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

// ─── Insights Tab (deterministic, no AI) ─────────────────────
function InsightsTab({ state, habits }: { state: LocalState; habits: Habit[] }) {
  const insights: { icon: string; title: string; detail: string; color: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Streak highlights
  const streakEntries = Object.entries(state.streaks)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (streakEntries.length > 0) {
    const [slug, days] = streakEntries[0];
    const h = habits.find(h => h.slug === slug);
    insights.push({
      icon: "🔥",
      title: `${h?.name || slug}: ${days} day streak`,
      detail: `Your longest active streak. ${days >= 14 ? "This is becoming identity." : days >= 7 ? "One more week and it's a habit." : "Keep building momentum."}`,
      color: "border-orange-500/30",
    });
  }

  // Bare minimum streak
  if (state.bareMinimumStreak > 0) {
    insights.push({
      icon: "🛡️",
      title: `Bare minimum: ${state.bareMinimumStreak} day streak`,
      detail: `You've hit your non-negotiables ${state.bareMinimumStreak} days running. The system is holding.`,
      color: "border-emerald-500/30",
    });
  }

  // Habits needing attention
  const binaryHabits = habits.filter(h => isBinaryLike(h.category) && h.is_active);
  const recent14 = state.logs.filter(l => {
    const diff = Math.round((new Date(today + "T12:00:00").getTime() - new Date(l.date + "T12:00:00").getTime()) / 86400000);
    return diff >= 0 && diff < 14;
  });

  for (const h of binaryHabits) {
    let done = 0;
    for (const log of recent14) {
      if (log.entries[h.id]?.status === "done") done++;
    }
    const rate = recent14.length > 0 ? done / Math.min(recent14.length, 14) : 0;
    if (rate < 0.4 && recent14.length >= 5) {
      insights.push({
        icon: "⚠️",
        title: `${h.icon || ""} ${h.name}: ${Math.round(rate * 100)}% (14d)`,
        detail: "This habit is slipping. Is it the right level? Or is something getting in the way?",
        color: "border-amber-500/30",
      });
    }
  }

  // Bad habit trends
  const badHabits = habits.filter(h => h.category === "bad" && h.is_active);
  const weekLogs = state.logs.filter(l => {
    const diff = Math.round((new Date(today + "T12:00:00").getTime() - new Date(l.date + "T12:00:00").getTime()) / 86400000);
    return diff >= 0 && diff < 7;
  });

  for (const bh of badHabits) {
    let count = 0, minutes = 0;
    for (const log of weekLogs) {
      const entry = log.badEntries[bh.id];
      if (entry?.occurred) { count++; minutes += entry.durationMinutes ?? 0; }
    }
    if (count > 0) {
      const display = bh.unit === "minutes"
        ? minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`
        : `${count} days`;
      insights.push({
        icon: "🎮",
        title: `${bh.icon || ""} ${bh.name}: ${display} this week`,
        detail: "The data is here. What do you want to do with it?",
        color: "border-red-500/30",
      });
    }
  }

  // Days logged this week
  if (weekLogs.length > 0) {
    const bmDays = weekLogs.filter(l => l.bareMinimumMet).length;
    insights.push({
      icon: "📅",
      title: `${weekLogs.length}/7 days logged this week`,
      detail: `${bmDays} with bare minimum met. ${bmDays >= 5 ? "Strong week." : "Room to close the gap."}`,
      color: "border-blue-500/30",
    });
  }

  // Sprint info
  if (state.activeSprint) {
    const sp = state.activeSprint;
    const done = sp.tasks.filter(t => t.completed).length;
    insights.push({
      icon: "🏃",
      title: `Sprint: "${sp.name}" — ${done}/${sp.tasks.length} tasks`,
      detail: `Intensity: ${sp.intensity}. ${done === sp.tasks.length ? "All done!" : "Keep pushing."}`,
      color: "border-purple-500/30",
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: "📊",
      title: "Not enough data yet",
      detail: "Check in for a few more days and insights will start appearing here.",
      color: "border-surface-600",
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-bold mb-2">
        Pattern Detection — No AI Required
      </p>
      {insights.map((ins, i) => (
        <div key={i} className={`rounded-xl bg-surface-800 border ${ins.color} p-4`}>
          <div className="flex items-start gap-3">
            <span className="text-xl">{ins.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-neutral-200">{ins.title}</p>
              <p className="text-xs text-neutral-500 mt-1">{ins.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Analysis Tab (AI-powered) ───────────────────────────────
function AnalysisTab({
  state, settings, habits, hasCoachKey,
}: {
  state: LocalState;
  settings: import("@/lib/store").UserSettings;
  habits: Habit[];
  hasCoachKey: boolean | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [followUp, setFollowUp] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Conversation persistence ──
  const [conversationId] = useState(() => crypto.randomUUID());
  const [pastSummaries, setPastSummaries] = useState<ConversationSummary[]>([]);
  const conversationCreatedAt = useRef(new Date().toISOString());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load past conversation summaries on mount
  useEffect(() => {
    loadRecentConversationSummaries(5).then(setPastSummaries);
  }, []);

  // Auto-save conversation (debounced) when messages change
  useEffect(() => {
    if (messages.length < 2) return; // Need at least one exchange

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const summary = generateConversationSummary(messages);
      saveConversation({
        id: conversationId,
        messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
        summary,
        createdAt: conversationCreatedAt.current,
        updatedAt: new Date().toISOString(),
      });
    }, 3000); // 3-second debounce

    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [messages, conversationId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const callCoach = useCallback(async (userMessage: string, isAnalysis: boolean = false) => {
    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const gymSessions = loadGymSessions();
      const showingUp = loadShowingUpData();
      const experiments = await loadExperiments();
      const context = buildCoachContext({
        state, settings, habits,
        gymSessions: gymSessions.map(s => ({
          date: s.date, trainingType: s.trainingType,
          muscleGroup: s.muscleGroup, durationMinutes: s.durationMinutes, rpe: s.rpe,
        })),
        showingUp, experiments,
        pastConversationSummaries: pastSummaries,
      });

      const systemMessage = COACH_SYSTEM_PROMPT + "\n\n---\n\n" + context;
      const allMessages = [
        { role: "system" as const, content: systemMessage },
        ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: isAnalysis ? ANALYSIS_PROMPT_PREFIX + userMessage : userMessage },
      ];

      const userMsg: ChatMessage = { role: "user", content: userMessage, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, userMsg]);

      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          provider: settings.coachSettings?.provider,
          model: settings.coachSettings?.model,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: ChatMessage = { role: "assistant", content: data.content, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [state, settings, habits, messages, pastSummaries]);

  async function handleAnalyse() {
    await callCoach("Analyse my current data and tell me what you see.", true);
  }

  async function handleFollowUp() {
    if (!followUp.trim()) return;
    const msg = followUp.trim();
    setFollowUp("");
    await callCoach(msg);
  }

  if (hasCoachKey === false) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">🔑</div>
        <h3 className="text-sm font-bold text-neutral-300 mb-2">No AI Provider Connected</h3>
        <p className="text-xs text-neutral-500 mb-4 max-w-xs">
          Add your API key in Settings to enable AI coaching analysis.
        </p>
        <a
          href="/settings"
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark transition-colors"
        >
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-5xl mb-4">🧠</div>
          <h3 className="text-lg font-bold text-neutral-200 mb-2">Ready to coach</h3>
          <p className="text-xs text-neutral-500 mb-6 max-w-xs">
            Your coach will read all your data — habits, streaks, bad habits, training, reflections — and give you an honest analysis.
          </p>
          <button
            onClick={handleAnalyse}
            className="rounded-xl bg-brand hover:bg-brand-dark px-8 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98]"
          >
            Analyse Me
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 space-y-4 mb-4 overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl p-4 ${
                msg.role === "user"
                  ? "bg-brand/10 border border-brand/20 ml-8"
                  : "bg-surface-800 border border-surface-700 mr-4"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-neutral-400">
                  {msg.role === "user" ? "You" : "🧠 Coach"}
                </span>
                <span className="text-[10px] text-neutral-600">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="text-sm text-neutral-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                <CoachMarkdown content={msg.content} />
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <div className="w-2 h-2 rounded-full bg-brand animate-bounce" />
          <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0.1s]" />
          <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0.2s]" />
          <span className="text-xs text-neutral-500 ml-2">Coach is thinking...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-missed/10 border border-missed/20 p-3 mb-4">
          <p className="text-xs text-missed">{error}</p>
        </div>
      )}

      {messages.length > 0 && !loading && (
        <div className="flex gap-2 mt-auto pt-4 border-t border-surface-700">
          <input
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFollowUp(); }}
            placeholder="Ask a follow-up..."
            className="flex-1 bg-surface-800 rounded-xl px-4 py-3 text-sm text-neutral-300 border border-surface-700 outline-none focus:border-brand placeholder:text-neutral-600"
          />
          <button
            onClick={handleFollowUp}
            disabled={!followUp.trim()}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Experiments Tab ─────────────────────────────────────────
function ExperimentsTab({
  state, settings, habits, hasCoachKey,
}: {
  state: LocalState;
  settings: import("@/lib/store").UserSettings;
  habits: Habit[];
  hasCoachKey: boolean | null;
}) {
  const [experiments, setExperiments] = useState<CoachExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");

  useEffect(() => {
    loadExperiments().then((exps) => {
      setExperiments(exps);
      setLoading(false);
    });
  }, []);

  async function handleSuggestExperiment() {
    setSuggesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const gymSessions = loadGymSessions();
      const showingUp = loadShowingUpData();
      const context = buildCoachContext({
        state, settings, habits,
        gymSessions: gymSessions.map(s => ({
          date: s.date, trainingType: s.trainingType,
          muscleGroup: s.muscleGroup, durationMinutes: s.durationMinutes, rpe: s.rpe,
        })),
        showingUp, experiments,
      });

      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: COACH_SYSTEM_PROMPT + "\n\n---\n\n" + context },
            { role: "user", content: EXPERIMENT_SUGGEST_PROMPT },
          ],
          provider: settings.coachSettings?.provider,
          model: settings.coachSettings?.model,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      const data = await res.json();
      const content = data.content as string;

      const titleMatch = content.match(/\*\*\[(\w+)\]\s*Experiment:\s*(.+?)\*\*/);
      const durationMatch = content.match(/Duration:\s*(\d+)\s*day/i);
      const complexityMatch = content.match(/\b(SIMPLE|COMPLEX)\b/i);

      const scale = (titleMatch?.[1]?.toLowerCase() || "small") as "small" | "medium" | "large";
      const title = titleMatch?.[2]?.trim() || "Suggested experiment";
      const durationDays = parseInt(durationMatch?.[1] || "5");
      const complexity = (complexityMatch?.[1]?.toLowerCase() || "simple") as "simple" | "complex";

      const exp = createExperimentFromAI(title, content, scale, complexity, durationDays);
      await saveExperiment(exp);
      setExperiments(prev => [exp, ...prev]);
    } catch (err) {
      console.error("[coach] Suggest experiment failed:", err);
    } finally {
      setSuggesting(false);
    }
  }

  async function handleAccept(id: string) {
    await acceptExperiment(id);
    setExperiments(prev => prev.map(e => e.id === id ? { ...e, status: "active", startDate: new Date().toISOString().slice(0, 10) } : e));
  }

  async function handleSkip(id: string) {
    await skipExperiment(id);
    setExperiments(prev => prev.map(e => e.id === id ? { ...e, status: "skipped" } : e));
  }

  async function handleComplete(id: string) {
    await completeExperiment(id, outcomeText);
    setExperiments(prev => prev.map(e => e.id === id ? { ...e, status: "completed", outcome: outcomeText } : e));
    setCompletingId(null);
    setOutcomeText("");
  }

  if (loading) return null;

  const active = experiments.filter(e => e.status === "active");
  const suggested = experiments.filter(e => e.status === "suggested");
  const completed = experiments.filter(e => e.status === "completed");

  const SCALE_BADGES: Record<string, { label: string; color: string }> = {
    small: { label: "S", color: "bg-emerald-500/20 text-emerald-400" },
    medium: { label: "M", color: "bg-amber-500/20 text-amber-400" },
    large: { label: "L", color: "bg-red-500/20 text-red-400" },
  };

  return (
    <div className="space-y-4">
      {hasCoachKey && (
        <button
          onClick={handleSuggestExperiment}
          disabled={suggesting}
          className="w-full rounded-xl border border-brand/30 bg-brand/5 hover:bg-brand/10 py-3 text-sm font-bold text-brand transition-all disabled:opacity-50"
        >
          {suggesting ? "Coach is thinking..." : "🧪 Suggest New Experiment"}
        </button>
      )}

      {active.length > 0 && (
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-bold mb-2">Active</p>
          {active.map(exp => (
            <div key={exp.id} className="rounded-xl bg-surface-800 border border-brand/20 p-4 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${SCALE_BADGES[exp.scale]?.color}`}>
                  {SCALE_BADGES[exp.scale]?.label}
                </span>
                <span className="text-sm font-bold text-neutral-200">{exp.title}</span>
              </div>
              {exp.startDate && (
                <p className="text-[10px] text-neutral-600 mb-2">Started {exp.startDate} · {exp.durationDays} days</p>
              )}
              {completingId === exp.id ? (
                <div className="space-y-2 mt-3">
                  <textarea
                    value={outcomeText}
                    onChange={(e) => setOutcomeText(e.target.value)}
                    placeholder="How did it go? What did you notice?"
                    rows={3}
                    className="w-full bg-surface-700 rounded-lg px-3 py-2 text-sm text-neutral-300 border border-surface-600 outline-none resize-none focus:border-brand"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleComplete(exp.id)} className="flex-1 rounded-lg bg-done/20 text-done py-2 text-xs font-bold">
                      Save & Complete
                    </button>
                    <button onClick={() => setCompletingId(null)} className="rounded-lg border border-surface-600 px-4 py-2 text-xs text-neutral-500">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCompletingId(exp.id)}
                  className="mt-2 rounded-lg bg-done/10 border border-done/20 px-4 py-2 text-xs font-bold text-done hover:bg-done/20 transition-colors"
                >
                  Mark Complete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {suggested.length > 0 && (
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-bold mb-2">Suggested</p>
          {suggested.map(exp => (
            <div key={exp.id} className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${SCALE_BADGES[exp.scale]?.color}`}>
                  {SCALE_BADGES[exp.scale]?.label}
                </span>
                <span className={`text-[10px] rounded-full px-2 py-0.5 bg-surface-700 text-neutral-500`}>
                  {exp.complexity}
                </span>
                <span className="text-sm font-bold text-neutral-200">{exp.title}</span>
              </div>
              <div className="text-xs text-neutral-400 mb-3 leading-relaxed">
                <CoachMarkdown content={exp.description} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(exp.id)}
                  className="flex-1 rounded-lg bg-brand/20 text-brand py-2 text-xs font-bold hover:bg-brand/30 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleSkip(exp.id)}
                  className="rounded-lg border border-surface-600 px-4 py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-bold mb-2">Completed</p>
          {completed.map(exp => (
            <div key={exp.id} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 mb-2 opacity-80">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-done text-xs">✓</span>
                <span className="text-sm font-medium text-neutral-400">{exp.title}</span>
              </div>
              {exp.outcome && (
                <p className="text-xs text-neutral-500 italic mt-1">&quot;{exp.outcome}&quot;</p>
              )}
            </div>
          ))}
        </div>
      )}

      {experiments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">🧪</div>
          <h3 className="text-sm font-bold text-neutral-300 mb-2">No Experiments Yet</h3>
          <p className="text-xs text-neutral-500 max-w-xs">
            {hasCoachKey
              ? "Tap 'Suggest New Experiment' to get a data-driven recommendation from your coach."
              : "Connect your AI provider in Settings to get started."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Markdown renderer (simple) ─────────────────────────────
function CoachMarkdown({ content }: { content: string }) {
  const paragraphs = content.split("\n\n").filter(Boolean);

  return (
    <>
      {paragraphs.map((p, i) => {
        const lines = p.split("\n");
        const isList = lines.every(l => l.trim().startsWith("- ") || l.trim().startsWith("* ") || l.trim() === "");

        if (isList) {
          return (
            <ul key={i} className="list-disc list-inside space-y-1 my-2">
              {lines.filter(l => l.trim()).map((l, j) => (
                <li key={j} className="text-xs text-neutral-400">
                  <BoldText text={l.replace(/^[\s]*[-*]\s*/, "")} />
                </li>
              ))}
            </ul>
          );
        }

        if (p.startsWith("### ")) return <h4 key={i} className="text-xs font-bold text-neutral-300 mt-3 mb-1">{p.slice(4)}</h4>;
        if (p.startsWith("## ")) return <h3 key={i} className="text-sm font-bold text-neutral-200 mt-3 mb-1">{p.slice(3)}</h3>;

        return (
          <p key={i} className="text-xs text-neutral-400 mb-2 leading-relaxed">
            <BoldText text={p.replace(/\n/g, " ")} />
          </p>
        );
      })}
    </>
  );
}

function BoldText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="text-neutral-200 font-semibold">{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}
