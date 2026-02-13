"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  loadState,
  saveState,
  getWeekLogs,
  getPrevWeekLogs,
  getLevelForXP,
  loadGymSessions,
  addAdminTask,
  loadAdminTasks,
  getTomorrowDate,
  removeAdminTask,
} from "@/lib/store";
import type { LocalState, DayLog, WrapReflection, AdminTask } from "@/lib/store";
import { getHabitsWithHistory } from "@/lib/resolvedHabits";
import { getFlameIcon, XP_VALUES } from "@/lib/habits";
import type { Habit } from "@/types/database";
import { isBinaryLike } from "@/types/database";
import VoiceInput from "@/components/VoiceInput";

// ─── Types ──────────────────────────────────────────────────
interface WrapCard {
  type: "win" | "stat" | "streak" | "honesty" | "bad" | "insight" | "reflection" | "plan-tomorrow" | "forward";
  bg: string; // tailwind gradient / color classes
  content: React.ReactNode;
}

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
export default function WrapPage() {
  const [state, setState] = useState<LocalState | null>(null);
  const [currentCard, setCurrentCard] = useState(0);
  const [reflectionAnswer, setReflectionAnswer] = useState("");
  const [forwardIntention, setForwardIntention] = useState("");
  const [completed, setCompleted] = useState(false);
  const [tomorrowTasks, setTomorrowTasks] = useState<AdminTask[]>([]);
  const [newTomorrowText, setNewTomorrowText] = useState("");
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    setState(loadState());
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

  const cards = state ? buildCards(state, reflectionAnswer, setReflectionAnswer, forwardIntention, setForwardIntention, tomorrowTasks, newTomorrowText, setNewTomorrowText, handleAddTomorrowTask, handleRemoveTomorrowTask) : [];

  const goNext = useCallback(() => {
    if (currentCard < cards.length - 1) {
      setCurrentCard((c) => c + 1);
    }
  }, [currentCard, cards.length]);

  const goPrev = useCallback(() => {
    if (currentCard > 0) {
      setCurrentCard((c) => c - 1);
    }
  }, [currentCard]);

  // Handle tap navigation (left third = back, right two-thirds = forward)
  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    // Don't navigate if tapping on an input/textarea/button
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.tagName === "A") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else {
      goNext();
    }
  }

  // Handle swipe
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only handle horizontal swipes (not vertical scroll)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  // Complete the wrap-up
  function handleComplete() {
    if (!state) return;

    const newState = { ...state };
    const today = new Date().toISOString().slice(0, 10);

    // Save reflection
    const reflections = [...(newState.reflections ?? [])];
    if (reflectionAnswer.trim()) {
      reflections.push({
        id: crypto.randomUUID(),
        date: today,
        period: "weekly",
        question: getWeeklyQuestion(),
        answer: reflectionAnswer.trim(),
        forwardIntention: forwardIntention.trim() || undefined,
      });
    }
    newState.reflections = reflections;
    newState.lastWrapDate = today;

    // Award XP for completing weekly wrap
    newState.totalXp += 50;

    // Bonus XP for answering reflection + setting intention
    if (reflectionAnswer.trim()) newState.totalXp += 25;
    if (forwardIntention.trim()) newState.totalXp += 25;

    // Bonus XP for planning tomorrow's admin tasks
    if (tomorrowTasks.length > 0) newState.totalXp += XP_VALUES.PLAN_TOMORROW_SET;

    saveState(newState);
    setCompleted(true);
  }

  if (!state) return null;

  // Completed screen
  if (completed) {
    const bonusXp = 50 + (reflectionAnswer.trim() ? 25 : 0) + (forwardIntention.trim() ? 25 : 0) + (tomorrowTasks.length > 0 ? XP_VALUES.PLAN_TOMORROW_SET : 0);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-brand mb-2">Week Wrapped!</h1>
        <p className="text-neutral-400 text-sm mb-2">
          +{bonusXp} XP for completing your review
        </p>
        {reflectionAnswer.trim() && (
          <p className="text-neutral-500 text-xs mb-6">
            Your reflection has been saved
          </p>
        )}
        <div className="flex gap-3">
          <a
            href="/"
            className="rounded-xl bg-surface-800 hover:bg-surface-700 px-6 py-3 text-sm font-medium transition-colors"
          >
            Dashboard
          </a>
          <a
            href="/weekly"
            className="rounded-xl bg-brand hover:bg-brand-dark px-6 py-3 text-sm font-bold text-white transition-colors"
          >
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
      className={`flex flex-col min-h-screen ${card.bg} transition-all duration-500`}
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress dots */}
      <div className="flex gap-1 px-4 pt-4 pb-2">
        {cards.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-0.5 rounded-full transition-all duration-300 ${
              i <= currentCard ? "bg-white/80" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Close button */}
      <div className="flex justify-between px-4 py-2">
        <a href="/" className="text-white/60 text-sm hover:text-white/80 z-10">
          ✕ Close
        </a>
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
            onClick={(e) => {
              e.stopPropagation();
              handleComplete();
            }}
            className="w-full rounded-xl bg-white text-black py-4 font-bold text-base active:scale-[0.98] transition-all"
          >
            Complete Wrap-Up
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

// ─── Build Cards from Data ──────────────────────────────────
function buildCards(
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
): WrapCard[] {
  const cards: WrapCard[] = [];
  const weekLogs = getWeekLogs(state);
  const prevWeekLogs = getPrevWeekLogs(state);
  const habits = getHabitsWithHistory();
  const activeHabits = habits.filter((h) => h.is_active);
  const binaryHabits = activeHabits.filter((h) => isBinaryLike(h.category));
  const badHabits = activeHabits.filter((h) => h.category === "bad");
  const measuredHabits = activeHabits.filter((h) => h.category === "measured");

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
        <h2 className="text-3xl font-black text-white">
          Your Week
        </h2>
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
        {/* Day dots */}
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
          <p className="text-5xl font-black text-orange-400">
            {topStreak.days} days
          </p>
          <p className="text-sm text-orange-200/60 max-w-xs mx-auto">
            That&apos;s {topStreak.days} days of casting votes for who you want to be.
          </p>
          {/* Top 3 */}
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
      let count = 0;
      let minutes = 0;
      for (const log of weekLogs) {
        const entry = log.badEntries[h.id];
        if (entry?.occurred) {
          count++;
          minutes += entry.durationMinutes ?? 0;
        }
      }
      let prevCount = 0;
      let prevMinutes = 0;
      for (const log of prevWeekLogs) {
        const entry = log.badEntries[h.id];
        if (entry?.occurred) {
          prevCount++;
          prevMinutes += entry.durationMinutes ?? 0;
        }
      }
      return {
        name: h.name,
        icon: h.icon || "⚠️",
        unit: h.unit,
        count,
        minutes,
        prevCount,
        prevMinutes,
      };
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
          <h2 className="text-2xl font-black text-white">
            Let&apos;s talk about it.
          </h2>
          <div className="space-y-3 text-left">
            {badStats.map((b) => {
              const display =
                b.unit === "minutes"
                  ? b.minutes >= 60
                    ? `${(b.minutes / 60).toFixed(1)}h`
                    : `${b.minutes}m`
                  : `${b.count} days`;
              const prevVal = b.unit === "minutes" ? b.prevMinutes : b.prevCount;
              const curVal = b.unit === "minutes" ? b.minutes : b.count;
              const trend =
                prevVal === 0 && curVal === 0
                  ? "→"
                  : curVal < prevVal
                    ? "↓"
                    : curVal > prevVal
                      ? "↑"
                      : "→";
              const trendColor =
                trend === "↓" ? "text-emerald-400" : trend === "↑" ? "text-red-400" : "text-neutral-500";
              return (
                <div key={b.name} className="flex items-center justify-between rounded-lg bg-black/20 px-4 py-3">
                  <span className="text-sm text-white">
                    {b.icon} {b.name}
                  </span>
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
  const xpProgress =
    levelInfo.nextXp > levelInfo.xpRequired
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
          <p className="text-sm text-white font-bold">
            Lv.{levelInfo.level} {levelInfo.title}
          </p>
          <div className="w-full h-3 rounded-full bg-black/30">
            <div
              className="h-3 rounded-full bg-amber-500 transition-all duration-700"
              style={{ width: `${Math.min(xpProgress * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-amber-200/60">
            {state.totalXp} / {levelInfo.nextXp} XP to next level
          </p>
        </div>
      </div>
    ),
  });

  // ── Card 7: Deep Work ──
  const deepWorkHabit = habits.find((h) => h.slug === "deep-work");
  if (deepWorkHabit) {
    const blocks = weekLogs.reduce((sum, l) => {
      return sum + (l.entries[deepWorkHabit.id]?.value ?? 0);
    }, 0);
    const target = 15; // weekly target

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
          <p className="text-xs text-violet-200/60">
            {blocks}/{target} target
          </p>
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
          <p className="text-xl font-bold text-white leading-relaxed">
            {insight}
          </p>
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
        <p className="text-lg font-bold text-white leading-relaxed">
          {question}
        </p>
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
        <p className="text-xs text-slate-500">
          Your response is saved and referenced in future reviews
        </p>
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
        <h2 className="text-2xl font-black text-white">
          What&apos;s on the plate tomorrow?
        </h2>
        <p className="text-sm text-blue-300/60">
          Add admin tasks — these will appear in tomorrow&apos;s check-in.
        </p>

        {/* Task list */}
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

        {/* Input */}
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
        <h2 className="text-2xl font-black text-white">
          New week starts tomorrow.
        </h2>

        {/* Streaks to protect */}
        {topStreaksForward.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-purple-300/60 uppercase tracking-widest">
              Streaks to Protect
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {topStreaksForward.map((s) => (
                <span
                  key={s.slug}
                  className="bg-white/10 rounded-full px-3 py-1.5 text-sm text-white"
                >
                  {s.icon} {s.name} {s.days}d
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 w-full">
          <div className="flex items-center justify-between">
            <p className="text-sm text-purple-200/80">
              One focus for next week:
            </p>
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

        <p className="text-sm text-purple-200/40 italic">
          Small actions. Ruthless consistency. Let&apos;s go.
        </p>
      </div>
    ),
  });

  return cards;
}

// ─── Insight Generator ──────────────────────────────────────
function generateInsight(state: LocalState, weekLogs: DayLog[], habits: Habit[]): string | null {
  const insights: string[] = [];

  // Find best and worst days
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const completionByDay: { day: string; count: number; date: string }[] = [];

  for (const log of weekLogs) {
    const d = new Date(log.date + "T12:00:00");
    const dayName = dayNames[d.getDay()];
    const doneCount = Object.values(log.entries).filter((e) => e.status === "done").length;
    completionByDay.push({ day: dayName, count: doneCount, date: log.date });
  }

  if (completionByDay.length >= 3) {
    const sorted = [...completionByDay].sort((a, b) => b.count - a.count);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.count > worst.count + 2) {
      insights.push(
        `Your best day was ${best.day} (${best.count} habits). Your hardest was ${worst.day} (${worst.count}). What made ${best.day} click?`
      );
    }
  }

  // Training + energy correlation
  const trainingHabit = habits.find((h) => h.slug === "training");
  const energyHabit = habits.find((h) => h.slug === "energy");
  if (trainingHabit && energyHabit) {
    let trainDayEnergy = 0;
    let trainDays = 0;
    let restDayEnergy = 0;
    let restDays = 0;
    for (const log of weekLogs) {
      const trained = log.entries[trainingHabit.id]?.status === "done";
      const energy = log.entries[energyHabit.id]?.value ?? 0;
      if (energy > 0) {
        if (trained) {
          trainDayEnergy += energy;
          trainDays++;
        } else {
          restDayEnergy += energy;
          restDays++;
        }
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

  // Missed days pattern
  const missedDays: string[] = [];
  for (const log of weekLogs) {
    const missCount = Object.values(log.entries).filter((e) => e.status === "missed").length;
    if (missCount > 0) {
      const d = new Date(log.date + "T12:00:00");
      missedDays.push(dayNames[d.getDay()]);
    }
  }
  if (missedDays.length >= 2 && missedDays.length <= 3) {
    insights.push(
      `You had misses on ${missedDays.join(" and ")}. Is that a pattern worth watching?`
    );
  }

  // Bad habits + productivity
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

  // Return a random insight or null
  if (insights.length === 0) return null;
  return insights[Math.floor(Math.random() * insights.length)];
}
