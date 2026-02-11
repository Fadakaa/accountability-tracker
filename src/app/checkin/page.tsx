"use client";

import { useState, useMemo, useEffect } from "react";
import { getHabitLevel, getRandomQuote, getContextualQuote, getQuoteOfTheDay, getFlameIcon, XP_VALUES } from "@/lib/habits";
import { loadState, saveState, getToday, getLevelForXP, getSprintContext, recalculateDayXP } from "@/lib/store";
import { getResolvedHabits, getResolvedHabitsByStack, getResolvedHabitsByChainOrder } from "@/lib/resolvedHabits";
import { isHabitWeak } from "@/lib/weakness";
import { startEscalation, resolveEscalation, resolveAllEscalations } from "@/lib/notifications";
import { isDayFullyComplete, getDayStats } from "@/lib/dayComplete";
import DayCompleteScreen from "@/components/DayCompleteScreen";
import type { DayLog } from "@/lib/store";
import type { Habit, HabitStack, LogStatus } from "@/types/database";

// ─── Types ──────────────────────────────────────────────────
type CheckinEntry = {
  habitId: string;
  status: LogStatus | null;
  value: number | null;
};

type BadHabitEntry = {
  habitId: string;
  occurred: boolean | null;
  durationMinutes: number | null;
};

type SubmissionResult = {
  xpEarned: number;
  streakUpdates: { name: string; icon: string; days: number }[];
  bareMinimumMet: boolean;
  quote: string;
};

// ─── Helpers ────────────────────────────────────────────────
function getCurrentStack(): HabitStack {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "midday";
  return "evening";
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning Michael";
  if (hour < 18) return "Afternoon check-in";
  return "Evening wrap-up";
}

function getGreetingEmoji(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "🌅";
  if (hour < 18) return "💪";
  return "🌙";
}

// ─── Component ──────────────────────────────────────────────
export default function CheckinPage() {
  const [activeStack, setActiveStack] = useState<HabitStack>(getCurrentStack);
  const [phase, setPhase] = useState<"checkin" | "result">("checkin");

  // Binary + measured entries
  const [entries, setEntries] = useState<Map<string, CheckinEntry>>(new Map());
  // Bad habit entries
  const [badEntries, setBadEntries] = useState<Map<string, BadHabitEntry>>(new Map());
  // Submission result
  const [result, setResult] = useState<SubmissionResult | null>(null);
  // Day complete overlay
  const [dayCompleteStats, setDayCompleteStats] = useState<ReturnType<typeof getDayStats> & { bareMinimumStreak: number } | null>(null);
  // Streaks from local store
  const [streaks, setStreaks] = useState<Record<string, number>>({});

  // Sprint context — affects which habits are shown and how
  const sprint = useMemo(() => getSprintContext(), []);

  useEffect(() => {
    const state = loadState();
    setStreaks(state.streaks);
  }, []);

  const stacks: HabitStack[] = ["morning", "midday", "evening"];

  // Get habits for current stack in chain order — uses resolved habits (respects settings + routine order)
  // Sprint rules:
  //   Critical: all stacks collapse into one view (show all habits from all stacks)
  //   Intense/Critical: only bare minimum habits are prompted (extras still trackable)
  const stackHabits = useMemo(() => {
    let habits: Habit[];
    if (sprint.singleCheckin) {
      // Critical mode: show ALL stacks' habits combined
      const morning = getResolvedHabitsByChainOrder("morning");
      const midday = getResolvedHabitsByChainOrder("midday");
      const evening = getResolvedHabitsByChainOrder("evening");
      habits = [...morning, ...midday, ...evening];
    } else {
      habits = getResolvedHabitsByChainOrder(activeStack);
    }
    return habits;
  }, [activeStack, sprint.singleCheckin]);

  // Pre-fill entries from existing log when revisiting a stack that was already submitted
  useEffect(() => {
    const state = loadState();
    const today = getToday();
    const existingLog = state.logs.find((l) => l.date === today);
    if (!existingLog) return;

    const prefilled = new Map<string, CheckinEntry>();
    const prefilledBad = new Map<string, BadHabitEntry>();

    for (const habit of stackHabits) {
      if (habit.category === "bad") {
        const badEntry = existingLog.badEntries[habit.id];
        if (badEntry && badEntry.occurred !== undefined && badEntry.occurred !== null) {
          prefilledBad.set(habit.id, {
            habitId: habit.id,
            occurred: badEntry.occurred,
            durationMinutes: badEntry.durationMinutes,
          });
        }
      } else {
        const entry = existingLog.entries[habit.id];
        if (entry && entry.status && entry.status !== "later") {
          prefilled.set(habit.id, {
            habitId: habit.id,
            status: entry.status,
            value: entry.value,
          });
        }
      }
    }

    if (prefilled.size > 0) setEntries(prefilled);
    if (prefilledBad.size > 0) setBadEntries(prefilledBad);
  }, [stackHabits]);

  // Split into categories — for intense/critical, separate bare minimum from extras
  const allBinary = stackHabits.filter((h) => h.category === "binary");
  const allMeasured = stackHabits.filter((h) => h.category === "measured");
  const badHabits = stackHabits.filter((h) => h.category === "bad");

  // Sprint filtering: bare minimum only for intense/critical, but extras are still visible
  const binaryHabits = sprint.bareMinimumOnly
    ? allBinary.filter((h) => h.is_bare_minimum)
    : allBinary;
  const extraBinaryHabits = sprint.bareMinimumOnly
    ? allBinary.filter((h) => !h.is_bare_minimum)
    : [];
  const measuredHabits = sprint.bareMinimumOnly
    ? allMeasured.filter((h) => h.is_bare_minimum)
    : allMeasured;
  const extraMeasuredHabits = sprint.bareMinimumOnly
    ? allMeasured.filter((h) => !h.is_bare_minimum)
    : [];

  // Track whether extras section is expanded (intense/critical)
  const [showExtras, setShowExtras] = useState(false);

  // Check if all entries are filled
  const allBinaryAnswered = binaryHabits.every((h) => entries.get(h.id)?.status !== undefined && entries.get(h.id)?.status !== null);
  const allBadAnswered = badHabits.every((h) => badEntries.get(h.id)?.occurred !== undefined && badEntries.get(h.id)?.occurred !== null);
  const canSubmit = allBinaryAnswered && allBadAnswered;

  function setEntry(habitId: string, status: LogStatus) {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(habitId);
      next.set(habitId, { habitId, status, value: existing?.value ?? null });
      return next;
    });

    // Escalation triggers
    const habit = getResolvedHabits().find((h) => h.id === habitId);
    if (!habit) return;

    if (status === "later") {
      startEscalation(habitId, habit.name, habit.icon || "");
    } else {
      // Done or Missed — resolve any active escalation
      resolveEscalation(habitId);
    }
  }

  function setMeasuredValue(habitId: string, value: number | null) {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(habitId);
      next.set(habitId, {
        habitId,
        status: existing?.status ?? "done",
        value,
      });
      return next;
    });
  }

  function setBadEntry(habitId: string, occurred: boolean) {
    setBadEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(habitId);
      next.set(habitId, {
        habitId,
        occurred,
        durationMinutes: existing?.durationMinutes ?? null,
      });
      return next;
    });
  }

  function setBadDuration(habitId: string, minutes: number | null) {
    setBadEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(habitId);
      next.set(habitId, {
        habitId,
        occurred: existing?.occurred ?? true,
        durationMinutes: minutes,
      });
      return next;
    });
  }

  function handleSubmit() {
    const streakUpdates: SubmissionResult["streakUpdates"] = [];
    const state = loadState();
    const today = getToday();

    // ─── Snapshot existing state BEFORE mutations ───
    const existingLog = state.logs.find((l) => l.date === today);
    const oldDayXp = existingLog?.xpEarned ?? 0;
    const previousEntries = existingLog?.entries ?? {};
    const wasBareMinMet = existingLog?.bareMinimumMet ?? false;

    // Track which habits were already "done" today
    const previouslyDone = new Set<string>();
    for (const [habitId, entry] of Object.entries(previousEntries)) {
      if (entry.status === "done") {
        previouslyDone.add(habitId);
      }
    }

    // ─── Streak updates (idempotent — only change on state transitions) ───
    const allAnsweredBinary = [...binaryHabits, ...extraBinaryHabits];
    let milestoneXp = 0;

    for (const habit of allAnsweredBinary) {
      const entry = entries.get(habit.id);
      if (!entry?.status) continue; // skip unanswered extras
      const wasDone = previouslyDone.has(habit.id);

      if (entry.status === "done") {
        if (!wasDone) {
          // Newly done — increment streak
          const prevStreak = state.streaks[habit.slug] ?? 0;
          const newStreak = prevStreak + 1;
          state.streaks[habit.slug] = newStreak;

          // Streak milestone XP (only for new milestones)
          if ([7, 14, 30, 60, 90].includes(newStreak)) {
            milestoneXp += XP_VALUES.STREAK_MILESTONE;
          }

          streakUpdates.push({
            name: habit.name,
            icon: habit.icon || "",
            days: newStreak,
          });
        } else {
          // Already done before — show current streak but don't increment
          streakUpdates.push({
            name: habit.name,
            icon: habit.icon || "",
            days: state.streaks[habit.slug] ?? 0,
          });
        }
      } else if (entry.status === "missed") {
        if (wasDone) {
          // Changed from done → missed — undo today's streak increment
          const currentStreak = state.streaks[habit.slug] ?? 0;
          if (!sprint.protectStreaks) {
            state.streaks[habit.slug] = 0;
          } else {
            state.streaks[habit.slug] = Math.max(0, currentStreak - 1);
          }
        } else {
          // Was not done, now missed — reset streak
          if (!sprint.protectStreaks) {
            state.streaks[habit.slug] = 0;
          }
        }
      }
    }

    // ─── Build entry records and merge into log ───
    const entryRecord: DayLog["entries"] = {};
    entries.forEach((e, id) => {
      entryRecord[id] = { status: e.status ?? "later", value: e.value };
    });
    const badRecord: DayLog["badEntries"] = {};
    badEntries.forEach((e, id) => {
      badRecord[id] = { occurred: e.occurred ?? false, durationMinutes: e.durationMinutes };
    });

    let mergedLog: DayLog;
    if (existingLog) {
      Object.assign(existingLog.entries, entryRecord);
      Object.assign(existingLog.badEntries, badRecord);
      mergedLog = existingLog;
    } else {
      mergedLog = {
        date: today,
        entries: entryRecord,
        badEntries: badRecord,
        xpEarned: 0,
        bareMinimumMet: false,
        submittedAt: new Date().toISOString(),
      };
      state.logs.push(mergedLog);
    }

    // ─── Recalculate entire day's XP from merged log ───
    const allHabits = getResolvedHabits();
    const habitsForXP = allHabits
      .filter((h) => h.is_active)
      .map((h) => ({
        id: h.id,
        slug: h.slug,
        category: h.category,
        is_bare_minimum: h.is_bare_minimum,
        is_active: h.is_active,
        unit: h.unit,
      }));

    const baseDayXp = recalculateDayXP(mergedLog, habitsForXP);
    const newDayXp = baseDayXp + milestoneXp;

    // ─── Bare minimum streak (idempotent) ───
    const allBareMinHabits = allHabits.filter((h) => h.is_bare_minimum && h.is_active);
    const allBareMinDone =
      allBareMinHabits.length > 0 &&
      allBareMinHabits.every((h) => mergedLog.entries[h.id]?.status === "done");

    if (allBareMinDone && !wasBareMinMet) {
      // Bare minimum newly met — increment streak
      state.bareMinimumStreak = (state.bareMinimumStreak || 0) + 1;
    } else if (!allBareMinDone && wasBareMinMet) {
      // Was met before but re-submission undid it — decrement
      state.bareMinimumStreak = Math.max(0, (state.bareMinimumStreak || 0) - 1);
    }

    // ─── Persist day log with correct XP ───
    mergedLog.bareMinimumMet = allBareMinDone;
    mergedLog.xpEarned = newDayXp;
    mergedLog.submittedAt = new Date().toISOString();

    // ─── Update global XP using delta (prevents double-counting) ───
    state.totalXp = state.totalXp - oldDayXp + newDayXp;
    state.currentLevel = getLevelForXP(state.totalXp).level;

    saveState(state);

    // Check if entire day is now complete
    if (isDayFullyComplete(state)) {
      const stats = getDayStats(state);
      setDayCompleteStats({ ...stats, bareMinimumStreak: state.bareMinimumStreak });
    }

    // Resolve all active escalations for submitted habits
    for (const habit of binaryHabits) {
      const entry = entries.get(habit.id);
      if (entry?.status === "done" || entry?.status === "missed") {
        resolveEscalation(habit.id);
      }
    }

    // Pick contextual quote based on result
    const xpDelta = newDayXp - oldDayXp;
    const hasAnyMiss = allAnsweredBinary.some((h) => entries.get(h.id)?.status === "missed");
    const hasStreakMilestone = streakUpdates.some((s) => [7, 14, 30, 60, 90].includes(s.days));
    const quoteContext = hasAnyMiss ? "after_miss" : hasStreakMilestone ? "streak_milestone" : "default";

    setResult({
      xpEarned: xpDelta,
      streakUpdates: streakUpdates.slice(0, 4),
      bareMinimumMet: allBareMinDone,
      quote: getContextualQuote(quoteContext).text,
    });
    setPhase("result");
  }

  // ─── Stack Already Submitted Guard ──────────────────────────────
  // When revisiting a stack that was already logged, show lock screen
  const [stackAlreadyDone, setStackAlreadyDone] = useState(false);
  const [wholeDayDone, setWholeDayDone] = useState(false);
  const [lockScreenStats, setLockScreenStats] = useState<{
    done: number; missed: number; later: number; total: number;
    badClean: number; badSlipped: number;
  } | null>(null);

  useEffect(() => {
    if (phase !== "checkin") return;
    const s = loadState();
    const today = getToday();
    const existingLog = s.logs.find((l) => l.date === today);
    if (!existingLog) return;
    if (stackHabits.length === 0) return;

    // Check required habit types in this stack
    // Must match canSubmit logic: binary + bad are required, measured are optional
    const stackBinary = stackHabits.filter((h) => h.category === "binary");
    const stackBad = stackHabits.filter((h) => h.category === "bad");

    // Binary: any status (done/missed/later) means it was submitted
    const allBinarySubmitted = stackBinary.every((h) => {
      const entry = existingLog.entries[h.id];
      return entry && entry.status != null;
    });

    // Bad: occurred is set (true or false)
    const allBadSubmitted = stackBad.every((h) => {
      const entry = existingLog.badEntries[h.id];
      return entry && entry.occurred != null;
    });

    // Need at least one habit type answered (avoid false positive on empty stacks)
    const hasRequiredHabits = stackBinary.length > 0 || stackBad.length > 0;

    if (hasRequiredHabits && allBinarySubmitted && allBadSubmitted) {
      // Build summary stats
      let done = 0, missed = 0, later = 0, badClean = 0, badSlipped = 0;
      for (const h of stackBinary) {
        const st = existingLog.entries[h.id]?.status;
        if (st === "done") done++;
        else if (st === "missed") missed++;
        else if (st === "later") later++;
      }
      for (const h of stackBad) {
        if (existingLog.badEntries[h.id]?.occurred) badSlipped++;
        else badClean++;
      }
      setLockScreenStats({ done, missed, later, total: stackBinary.length, badClean, badSlipped });
      setStackAlreadyDone(true);
    } else {
      setStackAlreadyDone(false);
      setLockScreenStats(null);
    }

    setWholeDayDone(isDayFullyComplete(s));
  }, [stackHabits, phase, activeStack]);

  if (stackAlreadyDone && phase === "checkin") {
    const today = getToday();
    const stackLabel = activeStack === "morning" ? "Morning" : activeStack === "midday" ? "Midday" : "Evening";
    const stackEmoji = activeStack === "morning" ? "🌅" : activeStack === "midday" ? "☀️" : "🌙";
    const nextStack = activeStack === "morning" ? "midday" : activeStack === "midday" ? "evening" : null;
    const nextStackLabel = nextStack === "midday" ? "Afternoon" : nextStack === "evening" ? "Evening" : null;
    const quote = getQuoteOfTheDay();
    const st = lockScreenStats;

    return (
      <div className="flex flex-col items-center min-h-screen px-6 py-10">
        {/* Header */}
        <div className="text-5xl mb-4">{wholeDayDone ? "🌳" : stackEmoji}</div>
        <h1 className="text-2xl font-black text-white mb-1">
          {wholeDayDone ? "Day Complete" : `${stackLabel} Logged`}
        </h1>
        <p className="text-sm text-neutral-400 mb-6">
          {wholeDayDone
            ? "All habits have been logged for today."
            : `Your ${stackLabel.toLowerCase()} check-in is already submitted.`}
        </p>

        {/* Quote / Life Tip */}
        <div className="w-full max-w-sm rounded-xl bg-surface-800/60 border border-surface-700 p-4 mb-6">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2 font-bold">
            {quote.category === "prompt" ? "Reflect" : "Remember"}
          </p>
          <p className="text-sm text-neutral-300 italic leading-relaxed">
            &ldquo;{quote.text}&rdquo;
          </p>
        </div>

        {/* Stack Summary */}
        {st && (st.total > 0 || st.badClean + st.badSlipped > 0) && (
          <div className="w-full max-w-sm rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-3 font-bold">
              {stackLabel} Summary
            </p>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              {st.done > 0 && (
                <div className="rounded-lg bg-done/10 border border-done/20 py-2">
                  <div className="text-lg font-black text-done">{st.done}</div>
                  <div className="text-[10px] text-done/70 font-medium">Done</div>
                </div>
              )}
              {st.missed > 0 && (
                <div className="rounded-lg bg-missed/10 border border-missed/20 py-2">
                  <div className="text-lg font-black text-missed">{st.missed}</div>
                  <div className="text-[10px] text-missed/70 font-medium">Missed</div>
                </div>
              )}
              {st.later > 0 && (
                <div className="rounded-lg bg-later/10 border border-later/20 py-2">
                  <div className="text-lg font-black text-later">{st.later}</div>
                  <div className="text-[10px] text-later/70 font-medium">Later</div>
                </div>
              )}
            </div>
            {(st.badClean + st.badSlipped > 0) && (
              <div className="flex items-center gap-2 text-xs text-neutral-400 pt-2 border-t border-surface-700">
                <span>Bad habits:</span>
                {st.badClean > 0 && <span className="text-done">✅ {st.badClean} clean</span>}
                {st.badSlipped > 0 && <span className="text-missed">🚩 {st.badSlipped} slipped</span>}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="w-full max-w-sm space-y-3 mt-auto">
          <a
            href={`/edit-log?date=${today}`}
            className="block w-full rounded-xl py-4 text-sm font-bold bg-brand hover:bg-brand-dark text-white text-center transition-all active:scale-[0.98]"
          >
            Edit Today&apos;s Answers
          </a>
          {nextStack && !wholeDayDone && (
            <button
              onClick={() => { setStackAlreadyDone(false); setActiveStack(nextStack); }}
              className="block w-full rounded-xl py-3.5 text-sm font-bold bg-surface-700 hover:bg-surface-600 text-white text-center transition-all active:scale-[0.98]"
            >
              Move to {nextStackLabel} →
            </button>
          )}
          <a
            href="/"
            className="block w-full rounded-xl py-3 text-sm font-medium bg-surface-800 hover:bg-surface-700 text-neutral-300 text-center transition-all active:scale-[0.98]"
          >
            Back to Dashboard
          </a>
          <button
            onClick={() => setStackAlreadyDone(false)}
            className="w-full text-xs text-neutral-600 hover:text-neutral-400 transition-colors mt-2"
          >
            Override — log again
          </button>
        </div>
      </div>
    );
  }

  // ─── Day Complete Overlay (after submission) ──────────────────────────────
  if (dayCompleteStats && phase === "result") {
    return (
      <>
        <DayCompleteScreen
          habitsCompleted={dayCompleteStats.habitsCompleted}
          habitsTotal={dayCompleteStats.habitsTotal}
          xpEarned={dayCompleteStats.xpEarned}
          bareMinimumMet={dayCompleteStats.bareMinimumMet}
          isPerfect={dayCompleteStats.isPerfect}
          bareMinimumStreak={dayCompleteStats.bareMinimumStreak}
          onDismiss={() => { window.location.href = "/"; }}
        />
      </>
    );
  }

  // ─── Result Screen ─────────────────────────────────────────
  if (phase === "result" && result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 text-center">
        {/* XP Earned */}
        <div className="text-5xl font-black text-brand mb-2 animate-pulse">
          +{result.xpEarned} XP
        </div>

        {/* Bare Minimum Status */}
        {result.bareMinimumMet ? (
          <div className="text-done text-sm font-semibold mb-6">
            Bare minimum met. The system held.
          </div>
        ) : (
          <div className="text-later text-sm font-semibold mb-6">
            Bare minimum not complete — finish it.
          </div>
        )}

        {/* Streak Updates */}
        <div className="w-full max-w-sm space-y-2 mb-8">
          {result.streakUpdates.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between rounded-lg bg-surface-800 px-4 py-3"
            >
              <span className="flex items-center gap-2">
                <span>{s.icon}</span>
                <span className="text-sm text-neutral-300">{s.name}</span>
              </span>
              <span className="text-sm font-bold">
                {getFlameIcon(s.days)} {s.days}d
              </span>
            </div>
          ))}
        </div>

        {/* Motivational Quote */}
        <div className="max-w-xs text-neutral-400 text-sm italic leading-relaxed mb-10">
          &ldquo;{result.quote}&rdquo;
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <a
            href="/"
            className="rounded-xl bg-surface-800 hover:bg-surface-700 px-6 py-3 text-sm font-medium transition-colors"
          >
            🏠 Dashboard
          </a>
          <button
            onClick={() => {
              setPhase("checkin");
              setEntries(new Map());
              setBadEntries(new Map());
              setResult(null);
            }}
            className="rounded-xl bg-brand hover:bg-brand-dark px-6 py-3 text-sm font-bold text-white transition-colors"
          >
            📊 Log More
          </button>
        </div>
      </div>
    );
  }

  // ─── Check-in Screen ───────────────────────────────────────
  const intensityLabel = sprint.intensity === "moderate" ? "🟡 Moderate" : sprint.intensity === "intense" ? "🟠 Intense" : sprint.intensity === "critical" ? "🔴 Critical" : "";

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">
            {getGreeting()} {getGreetingEmoji()}
          </h1>
          <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
            ✕
          </a>
        </div>
        <p className="text-sm text-neutral-400 italic">
          &ldquo;{getContextualQuote(activeStack === "morning" ? "morning" : "default").text}&rdquo;
        </p>
      </header>

      {/* Sprint Mode Banner */}
      {sprint.active && (
        <div className={`rounded-xl border p-3 mb-4 ${
          sprint.intensity === "critical" ? "bg-red-950/30 border-red-900/40" :
          sprint.intensity === "intense" ? "bg-orange-950/30 border-orange-900/40" :
          "bg-amber-950/30 border-amber-900/40"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🚀</span>
              <span className="text-xs font-bold text-white">SPRINT MODE</span>
              <span className="text-xs text-neutral-400">{intensityLabel}</span>
            </div>
            <a href="/sprint" className="text-[10px] text-neutral-500 hover:text-neutral-300">
              View →
            </a>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            {sprint.intensity === "critical"
              ? "All stacks combined · Only bare minimum · Streaks protected"
              : sprint.intensity === "intense"
                ? "Only bare minimum prompted · Extras trackable below · Targets -50%"
                : "All habits active · Targets reduced by 25%"}
          </p>
        </div>
      )}

      {/* Stack Tabs — hidden in Critical mode (all stacks combined) */}
      {!sprint.singleCheckin && (
        <div className="flex gap-2 mb-6">
          {stacks.map((stack) => (
            <button
              key={stack}
              onClick={() => setActiveStack(stack)}
              className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                activeStack === stack
                  ? "bg-brand text-white"
                  : "bg-surface-800 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {stack === "morning" ? "🌅 AM" : stack === "midday" ? "☀️ Mid" : "🌙 PM"}
            </button>
          ))}
        </div>
      )}

      {/* Binary Habit Cards */}
      {binaryHabits.length > 0 && (
        <section className="space-y-3 mb-6">
          {binaryHabits.map((habit) => (
            <BinaryHabitCard
              key={habit.id}
              habit={habit}
              entry={entries.get(habit.id) ?? null}
              streakDays={streaks[habit.slug] ?? 0}
              needsAttention={isHabitWeak(habit.id)}
              onSelect={(status) => setEntry(habit.id, status)}
              sprintProtected={sprint.protectStreaks}
            />
          ))}
        </section>
      )}

      {/* Measured Habit Inputs */}
      {measuredHabits.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Measured {sprint.active && sprint.targetMultiplier < 1 && (
              <span className="text-neutral-600 font-normal ml-1">
                (targets ×{sprint.targetMultiplier})
              </span>
            )}
          </h2>
          <div className="space-y-3">
            {measuredHabits.map((habit) => (
              <MeasuredHabitCard
                key={habit.id}
                habit={habit}
                value={entries.get(habit.id)?.value ?? null}
                onChange={(val) => setMeasuredValue(habit.id, val)}
                targetMultiplier={sprint.targetMultiplier}
              />
            ))}
          </div>
        </section>
      )}

      {/* Extra Habits (Intense/Critical — collapsed by default) */}
      {(extraBinaryHabits.length > 0 || extraMeasuredHabits.length > 0) && (
        <section className="mb-6">
          <button
            onClick={() => setShowExtras(!showExtras)}
            className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 hover:text-neutral-300 transition-colors"
          >
            <span className="transition-transform duration-200" style={{ transform: showExtras ? "rotate(90deg)" : "rotate(0deg)" }}>
              ▶
            </span>
            Extra Habits ({extraBinaryHabits.length + extraMeasuredHabits.length})
            <span className="text-neutral-600 font-normal normal-case">— optional during sprint</span>
          </button>
          {showExtras && (
            <div className="space-y-3 opacity-70">
              {extraBinaryHabits.map((habit) => (
                <BinaryHabitCard
                  key={habit.id}
                  habit={habit}
                  entry={entries.get(habit.id) ?? null}
                  streakDays={streaks[habit.slug] ?? 0}
                  needsAttention={false}
                  onSelect={(status) => setEntry(habit.id, status)}
                />
              ))}
              {extraMeasuredHabits.map((habit) => (
                <MeasuredHabitCard
                  key={habit.id}
                  habit={habit}
                  value={entries.get(habit.id)?.value ?? null}
                  onChange={(val) => setMeasuredValue(habit.id, val)}
                  targetMultiplier={sprint.targetMultiplier}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Bad Habit Cards */}
      {badHabits.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">
            Bad Habits Check
          </h2>
          <div className="space-y-3">
            {badHabits.map((habit) => (
              <BadHabitCard
                key={habit.id}
                habit={habit}
                entry={badEntries.get(habit.id) ?? null}
                onToggle={(occurred) => setBadEntry(habit.id, occurred)}
                onDuration={(mins) => setBadDuration(habit.id, mins)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {stackHabits.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
          No habits in this stack.
        </div>
      )}

      {/* Submit Button */}
      <div className="mt-auto pt-4 pb-6">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full rounded-xl py-4 text-base font-bold transition-all ${
            canSubmit
              ? "bg-brand hover:bg-brand-dark text-white active:scale-[0.98]"
              : "bg-surface-700 text-neutral-600 cursor-not-allowed"
          }`}
        >
          Submit Check-In →
        </button>
        {!canSubmit && (
          <p className="text-center text-xs text-neutral-600 mt-2">
            Answer all habits to submit
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Binary Habit Card ──────────────────────────────────────
function BinaryHabitCard({
  habit,
  entry,
  streakDays,
  needsAttention,
  onSelect,
  sprintProtected,
}: {
  habit: Habit;
  entry: CheckinEntry | null;
  streakDays: number;
  needsAttention?: boolean;
  onSelect: (status: LogStatus) => void;
  sprintProtected?: boolean;
}) {
  const level = getHabitLevel(habit.id, habit.current_level);
  const selected = entry?.status ?? null;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        selected === "done"
          ? "bg-done/10 border-done/30"
          : selected === "missed"
            ? "bg-missed/10 border-missed/30"
            : selected === "later"
              ? "bg-later/10 border-later/30"
              : needsAttention
                ? "bg-surface-800 border-later/40 ring-1 ring-later/30"
                : "bg-surface-800 border-surface-700"
      }`}
    >
      {/* Habit Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{habit.icon}</span>
          <div>
            <span className="text-sm font-semibold">{habit.name}</span>
            {level && (
              <span className="text-xs text-neutral-500 ml-2">
                Lv.{habit.current_level} — {level.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          <span>{getFlameIcon(streakDays)}</span>
          <span>{streakDays}d</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onSelect("done")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all active:scale-95 ${
            selected === "done"
              ? "bg-done text-white"
              : "bg-surface-700 text-neutral-400 hover:bg-done/20 hover:text-done"
          }`}
        >
          ✅ Done
        </button>
        <button
          onClick={() => onSelect("missed")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all active:scale-95 ${
            selected === "missed"
              ? "bg-missed text-white"
              : "bg-surface-700 text-neutral-400 hover:bg-missed/20 hover:text-missed"
          }`}
        >
          ❌ Miss
        </button>
        <button
          onClick={() => onSelect("later")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all active:scale-95 ${
            selected === "later"
              ? "bg-later text-white"
              : "bg-surface-700 text-neutral-400 hover:bg-later/20 hover:text-later"
          }`}
        >
          ⏰ Later
        </button>
      </div>

      {/* Bare Minimum Badge */}
      {habit.is_bare_minimum && (
        <div className="mt-2 text-[10px] text-brand font-medium uppercase tracking-wider">
          Non-negotiable
        </div>
      )}

      {/* Sprint streak protection */}
      {sprintProtected && streakDays > 0 && (
        <div className="mt-1 text-[10px] text-blue-400 font-medium">
          🛡️ Streak protected during critical sprint
        </div>
      )}

      {/* Weakness indicator */}
      {needsAttention && !selected && !sprintProtected && (
        <div className="mt-1 text-[10px] text-later font-medium">
          Low completion this week — show up today
        </div>
      )}
    </div>
  );
}

// ─── Measured Habit Card ────────────────────────────────────
function MeasuredHabitCard({
  habit,
  value,
  onChange,
  targetMultiplier = 1,
}: {
  habit: Habit;
  value: number | null;
  onChange: (val: number | null) => void;
  targetMultiplier?: number;
}) {
  const isScale = habit.unit === "1-5" || habit.unit === "1-10";
  const max = habit.unit === "1-5" ? 5 : habit.unit === "1-10" ? 10 : 999;
  const min = isScale ? 1 : 0;

  // Scale selector (1-5 or 1-10)
  if (isScale) {
    return (
      <div className="rounded-xl bg-surface-800 border border-surface-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{habit.icon}</span>
          <span className="text-sm font-semibold">{habit.name}</span>
          <span className="text-xs text-neutral-500 ml-auto">{habit.unit}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-95 ${
                value === n
                  ? "bg-brand text-white"
                  : "bg-surface-700 text-neutral-400 hover:bg-surface-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Sprint reduced target hint (for count/minutes type)
  const TARGET_HINTS: Record<string, number> = {
    "training-minutes": 45,
    "bible-chapters": 2,
    "deep-work": 3,
    "pages-read": 20,
  };
  const baseTarget = TARGET_HINTS[habit.slug];
  const reducedTarget = baseTarget ? Math.round(baseTarget * targetMultiplier) : null;

  // Number input (count, minutes)
  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{habit.icon}</span>
        <span className="text-sm font-semibold">{habit.name}</span>
        <span className="text-xs text-neutral-500 ml-auto">{habit.unit}</span>
      </div>
      {reducedTarget && targetMultiplier < 1 && (
        <div className="text-[10px] text-neutral-500 mb-2">
          Sprint target: <span className="text-brand font-semibold">{reducedTarget} {habit.unit}</span>
          <span className="text-neutral-600 ml-1">(normally {baseTarget})</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, (value ?? 0) - 1))}
          className="w-10 h-10 rounded-lg bg-surface-700 text-neutral-400 hover:bg-surface-600 text-lg font-bold active:scale-95 transition-all"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            onChange(v);
          }}
          placeholder="0"
          className="flex-1 bg-surface-700 rounded-lg px-4 py-2.5 text-center text-lg font-bold text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
        />
        <button
          onClick={() => onChange(Math.min(max, (value ?? 0) + 1))}
          className="w-10 h-10 rounded-lg bg-surface-700 text-neutral-400 hover:bg-surface-600 text-lg font-bold active:scale-95 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─── Bad Habit Card ─────────────────────────────────────────
function BadHabitCard({
  habit,
  entry,
  onToggle,
  onDuration,
}: {
  habit: Habit;
  entry: BadHabitEntry | null;
  onToggle: (occurred: boolean) => void;
  onDuration: (mins: number | null) => void;
}) {
  const occurred = entry?.occurred ?? null;
  const hasDuration = habit.unit === "minutes";

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        occurred === true
          ? "bg-bad/10 border-bad/30"
          : occurred === false
            ? "bg-done/10 border-done/30"
            : "bg-surface-800 border-surface-700"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{habit.icon}</span>
        <span className="text-sm font-semibold">{habit.name}</span>
      </div>

      {/* Yes/No toggle */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => onToggle(false)}
          className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all active:scale-95 ${
            occurred === false
              ? "bg-done text-white"
              : "bg-surface-700 text-neutral-400 hover:bg-done/20 hover:text-done"
          }`}
        >
          ✅ Clean
        </button>
        <button
          onClick={() => onToggle(true)}
          className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all active:scale-95 ${
            occurred === true
              ? "bg-bad text-white"
              : "bg-surface-700 text-neutral-400 hover:bg-bad/20 hover:text-bad"
          }`}
        >
          🚩 Slipped
        </button>
      </div>

      {/* Duration input (only for time-tracked bad habits like League) */}
      {hasDuration && occurred === true && (
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-neutral-500">How long?</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={entry?.durationMinutes ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                onDuration(v);
              }}
              placeholder="0"
              className="flex-1 bg-surface-700 rounded-lg px-3 py-2 text-center text-sm font-bold text-white border-none outline-none focus:ring-2 focus:ring-bad/50"
            />
            <span className="text-xs text-neutral-500">min</span>
          </div>
        </div>
      )}
    </div>
  );
}
