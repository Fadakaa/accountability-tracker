"use client";

import { useState, useMemo, useEffect } from "react";
import { getHabitLevel, getRandomQuote, getContextualQuote, getFlameIcon, XP_VALUES, getQuoteOfTheDay } from "@/lib/habits";
import { loadState, saveState, getToday, getLevelForXP, getSprintContext, recalculateStreaks, addDeferral, removeDeferral, getDeferredForStack, isDeferredAway, loadDeferred, loadAdminTasks, addAdminTask, toggleAdminTask, removeAdminTask, getAdminSummary } from "@/lib/store";
import type { DayLog, DeferredHabit, AdminTask } from "@/lib/store";
import { getResolvedHabits, getResolvedHabitsByStack, getResolvedHabitsByChainOrder, type ResolvedHabit } from "@/lib/resolvedHabits";
import { isHabitWeak } from "@/lib/weakness";
import { startEscalation, resolveEscalation, resolveAllEscalations, syncCompletionToServiceWorker } from "@/lib/notifications";
import { ADMIN_HABIT_ID } from "@/lib/habits";
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
  adminDone?: number;
  adminTotal?: number;
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
  // Streaks from local store
  const [streaks, setStreaks] = useState<Record<string, number>>({});

  // Sprint context — affects which habits are shown and how
  const sprint = useMemo(() => getSprintContext(), []);

  // Admin tasks state
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [newAdminText, setNewAdminText] = useState("");
  const [showAdminInput, setShowAdminInput] = useState(false);

  // Defer modal state — shown when user clicks "Later" on a binary habit
  const [deferModalHabitId, setDeferModalHabitId] = useState<string | null>(null);

  // Lock screen state — shows when a stack is already submitted
  const [stackAlreadyDone, setStackAlreadyDone] = useState(false);
  const [lockSummary, setLockSummary] = useState<{ done: number; missed: number; later: number; cleanBad: number; slippedBad: number; measuredCount: number; totalXp: number; bareMinStreak: number }>({ done: 0, missed: 0, later: 0, cleanBad: 0, slippedBad: 0, measuredCount: 0, totalXp: 0, bareMinStreak: 0 });
  const [allStacksDone, setAllStacksDone] = useState(false);
  const [dayDismissed, setDayDismissed] = useState(false);

  useEffect(() => {
    const state = loadState();
    setStreaks(state.streaks);
    setAdminTasks(loadAdminTasks());

    // Check sessionStorage for day-level dismissal
    const dismissKey = `lock-dismissed-${getToday()}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(dismissKey)) {
      setDayDismissed(true);
    }

    // Pre-load any partial progress for today
    const today = getToday();
    const todayLog = state.logs.find((l) => l.date === today);
    if (todayLog && phase === "checkin") {
      const stackHabitIds = new Set(getResolvedHabitsByChainOrder(activeStack).map((h) => h.id));
      // Also include deferred habits that landed in this stack
      const deferredToHere = getDeferredForStack(activeStack);
      for (const d of deferredToHere) {
        stackHabitIds.add(d.habitId);
      }

      // Restore binary/measured entries for this stack
      const restoredEntries = new Map<string, CheckinEntry>();
      for (const [habitId, entry] of Object.entries(todayLog.entries)) {
        if (stackHabitIds.has(habitId) && entry.status) {
          restoredEntries.set(habitId, {
            habitId,
            status: entry.status,
            value: entry.value,
          });
        }
      }
      if (restoredEntries.size > 0) {
        setEntries(restoredEntries);
      }

      // Restore bad habit entries for this stack
      const restoredBad = new Map<string, BadHabitEntry>();
      for (const [habitId, entry] of Object.entries(todayLog.badEntries)) {
        if (stackHabitIds.has(habitId) && entry.occurred != null) {
          restoredBad.set(habitId, {
            habitId,
            occurred: entry.occurred,
            durationMinutes: entry.durationMinutes,
          });
        }
      }
      if (restoredBad.size > 0) {
        setBadEntries(restoredBad);
      }
    }

    // Check if current stack is already submitted
    checkStackLock(activeStack, state);
  }, [activeStack]);

  function checkStackLock(stack: HabitStack, state?: ReturnType<typeof loadState>) {
    const s = state ?? loadState();
    const today = getToday();
    const todayLog = s.logs.find((l) => l.date === today);
    if (!todayLog) {
      setStackAlreadyDone(false);
      return;
    }

    const stackHabits = getResolvedHabitsByChainOrder(stack);
    // Exclude habits that have been deferred to a later stack
    const stackBinary = stackHabits.filter((h) => h.category === "binary" && h.is_active && !isDeferredAway(h.id));
    const stackBad = stackHabits.filter((h) => h.category === "bad" && h.is_active);
    const stackMeasured = stackHabits.filter((h) => h.category === "measured" && h.is_active);

    // Check if every binary has a status and every bad has an occurred value
    const allBinaryAnswered = stackBinary.length > 0 && stackBinary.every((h) => {
      const entry = todayLog.entries[h.id];
      return entry && (entry.status === "done" || entry.status === "missed" || entry.status === "later");
    });
    const allBadAnswered = stackBad.length === 0 || stackBad.every((h) => {
      const entry = todayLog.badEntries[h.id];
      return entry && (entry.occurred === true || entry.occurred === false);
    });

    if (allBinaryAnswered && allBadAnswered) {
      // Build summary
      let done = 0, missed = 0, later = 0, cleanBad = 0, slippedBad = 0, measuredCount = 0;
      for (const h of stackBinary) {
        const st = todayLog.entries[h.id]?.status;
        if (st === "done") done++;
        else if (st === "missed") missed++;
        else if (st === "later") later++;
      }
      for (const h of stackBad) {
        const e = todayLog.badEntries[h.id];
        if (e?.occurred === false) cleanBad++;
        else if (e?.occurred === true) slippedBad++;
      }
      // Count measured habits that have values logged
      for (const h of stackMeasured) {
        const entry = todayLog.entries[h.id];
        if (entry?.value != null && entry.value > 0) measuredCount++;
      }
      setLockSummary({ done, missed, later, cleanBad, slippedBad, measuredCount, totalXp: todayLog.xpEarned, bareMinStreak: s.bareMinimumStreak ?? 0 });
      setStackAlreadyDone(true);

      // Check if ALL stacks are done (excluding deferred-away habits)
      const allStacks: HabitStack[] = ["morning", "midday", "evening"];
      const allDone = allStacks.every((st) => {
        const stBinary = getResolvedHabitsByChainOrder(st).filter((h) => h.category === "binary" && h.is_active && !isDeferredAway(h.id));
        if (stBinary.length === 0) return true;
        return stBinary.every((h) => {
          const entry = todayLog.entries[h.id];
          return entry && (entry.status === "done" || entry.status === "missed" || entry.status === "later");
        });
      });
      setAllStacksDone(allDone);
    } else {
      setStackAlreadyDone(false);
    }
  }

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

  // Split into categories — for intense/critical, separate bare minimum from extras
  // Also filter out habits that have been deferred to a later stack
  const allBinary = stackHabits.filter((h) => h.category === "binary" && !isDeferredAway(h.id));
  const allMeasured = stackHabits.filter((h) => h.category === "measured" && h.id !== ADMIN_HABIT_ID);
  const badHabits = stackHabits.filter((h) => h.category === "bad");

  // Load habits that were deferred TO this stack from an earlier stack
  const deferredToThisStack = useMemo(() => {
    if (sprint.singleCheckin) return []; // No deferrals in single-checkin sprint mode
    const deferred = getDeferredForStack(activeStack);
    const allHabits = getResolvedHabits();
    return deferred
      .map((d) => allHabits.find((h) => h.id === d.habitId))
      .filter((h): h is ResolvedHabit => h != null);
  }, [activeStack, sprint.singleCheckin]);

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

  // Check if entries are filled — partial submission now allowed
  const allBinaryAnswered = binaryHabits.every((h) => entries.get(h.id)?.status !== undefined && entries.get(h.id)?.status !== null);
  const allBadAnswered = badHabits.every((h) => badEntries.get(h.id)?.occurred !== undefined && badEntries.get(h.id)?.occurred !== null);
  const anyAnswered = binaryHabits.some((h) => entries.get(h.id)?.status != null) ||
    badHabits.some((h) => badEntries.get(h.id)?.occurred != null) ||
    measuredHabits.some((h) => entries.get(h.id)?.value != null);
  const canSubmit = allBinaryAnswered && allBadAnswered;
  const canSavePartial = anyAnswered && !canSubmit;

  // Stack order for determining which stacks come "later"
  const STACK_ORDER: HabitStack[] = ["morning", "midday", "evening"];
  const laterStacks = STACK_ORDER.slice(STACK_ORDER.indexOf(activeStack) + 1);

  function setEntry(habitId: string, status: LogStatus) {
    // If "later" and there are stacks to defer to (and not in singleCheckin sprint mode), show defer modal
    if (status === "later" && laterStacks.length > 0 && !sprint.singleCheckin) {
      // Set the entry as "later" visually
      setEntries((prev) => {
        const next = new Map(prev);
        const existing = next.get(habitId);
        next.set(habitId, { habitId, status: "later", value: existing?.value ?? null });
        return next;
      });
      // Open the defer modal
      setDeferModalHabitId(habitId);
      return;
    }

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
      // No stacks to defer to (evening) or sprint singleCheckin — escalate immediately
      startEscalation(habitId, habit.name, habit.icon || "");
      fetch("/api/notify/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitName: habit.name, habitIcon: habit.icon || "" }),
      }).catch(() => {});
    } else {
      // Done or Missed — resolve any active escalation
      resolveEscalation(habitId);
    }
  }

  function handleDeferToStack(targetStack: HabitStack) {
    if (!deferModalHabitId) return;
    // Save the deferral
    addDeferral(deferModalHabitId, activeStack, targetStack);
    // Close the modal
    setDeferModalHabitId(null);
  }

  function handleKeepEscalating() {
    if (!deferModalHabitId) return;
    const habit = getResolvedHabits().find((h) => h.id === deferModalHabitId);
    if (habit) {
      // Start Fibonacci escalation
      startEscalation(deferModalHabitId, habit.name, habit.icon || "");
      fetch("/api/notify/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitName: habit.name, habitIcon: habit.icon || "" }),
      }).catch(() => {});
    }
    setDeferModalHabitId(null);
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

  // ─── Partial Save (save progress without full submission) ──
  const [savedPartial, setSavedPartial] = useState(false);

  function handleSavePartial() {
    const state = loadState();
    const today = getToday();

    // Build partial entry records
    const entryRecord: DayLog["entries"] = {};
    entries.forEach((e, id) => {
      if (e.status != null) {
        entryRecord[id] = { status: e.status, value: e.value };
      } else if (e.value != null) {
        entryRecord[id] = { status: "done", value: e.value };
      }
    });
    const badRecord: DayLog["badEntries"] = {};
    badEntries.forEach((e, id) => {
      if (e.occurred != null) {
        badRecord[id] = { occurred: e.occurred, durationMinutes: e.durationMinutes };
      }
    });

    // Merge with existing today log
    const existingLog = state.logs.find((l) => l.date === today);
    if (existingLog) {
      Object.assign(existingLog.entries, entryRecord);
      Object.assign(existingLog.badEntries, badRecord);
    } else {
      state.logs.push({
        date: today,
        entries: entryRecord,
        badEntries: badRecord,
        xpEarned: 0,
        bareMinimumMet: false,
        submittedAt: new Date().toISOString(),
      });
    }

    saveState(state);
    setSavedPartial(true);
    setTimeout(() => setSavedPartial(false), 2000);
  }

  function handleSubmit() {
    // Calculate XP
    let xp = 0;

    // Load current state for streak calculations
    const state = loadState();
    const today = getToday();

    // ─── 1. Calculate XP from binary habits ─────────────────
    const allAnsweredBinary = [...binaryHabits, ...extraBinaryHabits, ...deferredToThisStack];
    const todayLogBefore = state.logs.find((l) => l.date === today);
    for (const habit of allAnsweredBinary) {
      const entry = entries.get(habit.id);
      if (!entry?.status) continue;
      if (entry.status === "done") {
        // Only award XP if not already "done" today (prevents double XP on re-submit)
        const alreadyDone = todayLogBefore?.entries[habit.id]?.status === "done";
        if (!alreadyDone) {
          if (habit.is_bare_minimum) {
            xp += XP_VALUES.BARE_MINIMUM_HABIT;
          } else {
            xp += XP_VALUES.STRETCH_HABIT;
          }
        }
      }
    }

    // Measured habits XP — include extras that were answered
    const allAnsweredMeasured = [...measuredHabits, ...extraMeasuredHabits];
    for (const habit of allAnsweredMeasured) {
      const entry = entries.get(habit.id);
      if (entry?.value && entry.value > 0) {
        xp += XP_VALUES.MEASURED_AT_TARGET;
      }
    }

    // Bad habit XP
    let anyBadOccurred = false;
    for (const habit of badHabits) {
      const entry = badEntries.get(habit.id);
      if (entry?.occurred === false) {
        xp += XP_VALUES.ZERO_BAD_HABIT_DAY;
      } else if (entry?.occurred === true) {
        xp += XP_VALUES.LOG_BAD_HABIT_HONESTLY;
        anyBadOccurred = true;
      }
    }

    // Admin tasks XP — compute from admin store
    const adminSummary = getAdminSummary();
    if (adminSummary.total > 0) {
      // XP per completed task
      xp += adminSummary.completed * XP_VALUES.ADMIN_TASK_CLEARED;
      // Bonus for clearing everything
      if (adminSummary.completed === adminSummary.total) {
        xp += XP_VALUES.ADMIN_ALL_CLEARED;
      }
    }

    // Bare minimum bonus — check ALL bare minimum habits across all stacks
    const allBareMinHabits = getResolvedHabits().filter((h) => h.is_bare_minimum && h.is_active);
    const stackBareMinDone = binaryHabits
      .filter((h) => h.is_bare_minimum)
      .every((h) => entries.get(h.id)?.status === "done");

    // Check if today's other stacks already had bare minimum met
    const todayLog = state.logs.find((l) => l.date === today);
    const prevBareMinEntries = todayLog?.entries ?? {};
    const prevBareMinMet = allBareMinHabits
      .filter((h) => h.stack !== activeStack)
      .every((h) => prevBareMinEntries[h.id]?.status === "done");

    const bareMinDone = stackBareMinDone && prevBareMinMet;
    if (bareMinDone) {
      const existingLogForBareMin = state.logs.find((l) => l.date === today);
      if (!existingLogForBareMin?.bareMinimumMet) {
        xp += XP_VALUES.ALL_BARE_MINIMUM;
        state.bareMinimumStreak = (state.bareMinimumStreak || 0) + 1;
      }
    }

    // Perfect day check
    const allDone = binaryHabits.every((h) => entries.get(h.id)?.status === "done");
    if (allDone && !anyBadOccurred && bareMinDone) {
      xp += XP_VALUES.PERFECT_DAY;
    }

    // ─── 2. Save log entries FIRST ──────────────────────────
    const entryRecord: DayLog["entries"] = {};
    entries.forEach((e, id) => {
      entryRecord[id] = { status: e.status ?? "later", value: e.value };
    });
    const badRecord: DayLog["badEntries"] = {};
    badEntries.forEach((e, id) => {
      badRecord[id] = { occurred: e.occurred ?? false, durationMinutes: e.durationMinutes };
    });

    // Write admin task measured value into entries
    if (adminSummary.total > 0) {
      entryRecord[ADMIN_HABIT_ID] = { status: "done", value: adminSummary.completed };
    }

    // Build admin snapshot for historical record
    const adminSnapshot = adminSummary.total > 0 ? {
      total: adminSummary.total,
      completed: adminSummary.completed,
      tasks: loadAdminTasks().map((t) => ({ title: t.title, completed: t.completed })),
    } : undefined;

    // Merge with existing today log (other stacks)
    const existingLog = state.logs.find((l) => l.date === today);
    if (existingLog) {
      Object.assign(existingLog.entries, entryRecord);
      Object.assign(existingLog.badEntries, badRecord);
      existingLog.xpEarned += xp;
      existingLog.bareMinimumMet = bareMinDone;
      existingLog.submittedAt = new Date().toISOString();
      if (adminSnapshot) existingLog.adminSummary = adminSnapshot;
    } else {
      state.logs.push({
        date: today,
        entries: entryRecord,
        badEntries: badRecord,
        adminSummary: adminSnapshot,
        xpEarned: xp,
        bareMinimumMet: bareMinDone,
        submittedAt: new Date().toISOString(),
      });
    }

    // ─── 3. Recalculate ALL streaks from log history ────────
    // This is the source of truth — counts consecutive days with "done"
    // working backwards from today. No matter how many times you submit
    // on the same day, the streak count stays correct.
    const allHabits = getResolvedHabits();
    const habitSlugsById: Record<string, string> = {};
    for (const h of allHabits) {
      habitSlugsById[h.id] = h.slug;
    }
    const calculatedStreaks = recalculateStreaks(state, habitSlugsById);
    state.streaks = calculatedStreaks;

    // Build streak updates for the result screen
    const streakUpdates: SubmissionResult["streakUpdates"] = [];
    for (const habit of allAnsweredBinary) {
      const entry = entries.get(habit.id);
      if (entry?.status === "done") {
        streakUpdates.push({
          name: habit.name,
          icon: habit.icon || "",
          days: calculatedStreaks[habit.slug] ?? 0,
        });
      }
    }

    state.totalXp += xp;
    state.currentLevel = getLevelForXP(state.totalXp).level;

    saveState(state);

    // Tell service worker which stacks are complete (suppresses future notifications)
    syncCompletionToServiceWorker();

    // Resolve all active escalations for submitted habits
    for (const habit of binaryHabits) {
      const entry = entries.get(habit.id);
      if (entry?.status === "done" || entry?.status === "missed") {
        resolveEscalation(habit.id);
      }
    }

    // Clean up deferrals for habits that were answered in this stack
    for (const habit of deferredToThisStack) {
      const entry = entries.get(habit.id);
      if (entry?.status === "done" || entry?.status === "missed") {
        removeDeferral(habit.id);
        resolveEscalation(habit.id);
      }
    }

    // Pick contextual quote based on result
    const hasAnyMiss = allAnsweredBinary.some((h) => entries.get(h.id)?.status === "missed");
    const hasStreakMilestone = streakUpdates.some((s) => [7, 14, 30, 60, 90].includes(s.days));
    const quoteContext = hasAnyMiss ? "after_miss" : hasStreakMilestone ? "streak_milestone" : "default";

    setResult({
      xpEarned: xp,
      streakUpdates: streakUpdates.slice(0, 4),
      bareMinimumMet: bareMinDone,
      quote: getContextualQuote(quoteContext).text,
      adminDone: adminSummary.completed,
      adminTotal: adminSummary.total,
    });
    setPhase("result");
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

        {/* Admin Summary */}
        {result.adminTotal != null && result.adminTotal > 0 && (
          <div className="w-full max-w-sm rounded-lg bg-blue-950/30 border border-blue-900/30 px-4 py-3 mb-4">
            <span className="text-sm text-blue-300">
              📋 Admin: {result.adminDone}/{result.adminTotal} tasks cleared
              {result.adminDone === result.adminTotal && " ✨"}
            </span>
          </div>
        )}

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

  // ─── Lock Screen (stack already submitted) ─────────────────
  if (phase === "checkin" && stackAlreadyDone && !dayDismissed) {
    const stackLabel = activeStack === "morning" ? "Morning" : activeStack === "midday" ? "Afternoon" : "Evening";
    const nextStack: HabitStack | null = activeStack === "morning" ? "midday" : activeStack === "midday" ? "evening" : null;
    const quote = getQuoteOfTheDay();

    // Full-day celebration when ALL stacks are complete
    if (allStacksDone) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 text-center bg-gradient-to-b from-surface-900 via-emerald-950/30 to-surface-900">
          {/* Trophy */}
          <div className="text-6xl mb-4 animate-pulse">🏆</div>
          <h1 className="text-2xl font-black text-done mb-2">Day Complete!</h1>
          <p className="text-sm text-neutral-400 mb-6">
            All three stacks submitted. You showed up today.
          </p>

          {/* Quote */}
          <div className="max-w-xs text-neutral-400 text-sm italic leading-relaxed mb-6">
            &ldquo;{quote.text}&rdquo;
          </div>

          {/* Day Stats */}
          <div className="w-full max-w-sm rounded-xl bg-surface-800 border border-done/20 p-4 mb-4">
            <h2 className="text-xs font-bold text-done uppercase tracking-wider mb-3">
              Today&apos;s Stats
            </h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-done/10 p-3">
                <div className="text-2xl font-black text-brand">{lockSummary.totalXp}</div>
                <div className="text-[10px] text-neutral-500 uppercase">XP Earned</div>
              </div>
              <div className="rounded-lg bg-done/10 p-3">
                <div className="text-2xl font-black text-done">{lockSummary.done}</div>
                <div className="text-[10px] text-neutral-500 uppercase">Habits Done</div>
              </div>
              {lockSummary.measuredCount > 0 && (
                <div className="rounded-lg bg-blue-500/10 p-3">
                  <div className="text-2xl font-black text-blue-400">{lockSummary.measuredCount}</div>
                  <div className="text-[10px] text-neutral-500 uppercase">Measured</div>
                </div>
              )}
              <div className="rounded-lg bg-brand/10 p-3">
                <div className="text-2xl font-black text-brand">{lockSummary.bareMinStreak}</div>
                <div className="text-[10px] text-neutral-500 uppercase">Min Streak</div>
              </div>
            </div>
            {(lockSummary.cleanBad > 0 || lockSummary.slippedBad > 0) && (
              <div className="flex gap-2 text-center mt-3">
                <div className="flex-1 rounded-lg bg-done/10 p-2">
                  <div className="text-sm font-bold text-done">{lockSummary.cleanBad} clean</div>
                </div>
                {lockSummary.slippedBad > 0 && (
                  <div className="flex-1 rounded-lg bg-bad/10 p-2">
                    <div className="text-sm font-bold text-bad">{lockSummary.slippedBad} slipped</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="w-full max-w-sm space-y-2">
            <a
              href="/edit-log"
              className="block w-full rounded-xl bg-surface-800 border border-surface-700 py-3 text-sm font-medium text-neutral-300 text-center hover:bg-surface-700 transition-colors"
            >
              {"📝"} Edit Today&apos;s Answers
            </a>
            <a
              href="/"
              className="block w-full rounded-xl bg-done text-white py-3 text-sm font-bold text-center transition-colors active:scale-[0.98]"
            >
              {"🏠"} Dashboard
            </a>
            <button
              onClick={() => {
                setDayDismissed(true);
                setStackAlreadyDone(false);
                if (typeof window !== "undefined") {
                  sessionStorage.setItem(`lock-dismissed-${getToday()}`, "1");
                }
              }}
              className="w-full py-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Override — log again
            </button>
          </div>
        </div>
      );
    }

    // Per-stack lock screen
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 text-center">
        {/* Status */}
        <div className="text-4xl mb-3">✅</div>
        <h1 className="text-xl font-bold mb-1">{stackLabel} Logged</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Your {stackLabel.toLowerCase()} check-in is done.
        </p>

        {/* Quote */}
        <div className="max-w-xs text-neutral-400 text-sm italic leading-relaxed mb-6">
          &ldquo;{quote.text}&rdquo;
        </div>

        {/* Summary Card */}
        <div className="w-full max-w-sm rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Summary
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="rounded-lg bg-done/10 p-2">
              <div className="text-lg font-bold text-done">{lockSummary.done}</div>
              <div className="text-[10px] text-neutral-500">Done</div>
            </div>
            <div className="rounded-lg bg-missed/10 p-2">
              <div className="text-lg font-bold text-missed">{lockSummary.missed}</div>
              <div className="text-[10px] text-neutral-500">Missed</div>
            </div>
            <div className="rounded-lg bg-later/10 p-2">
              <div className="text-lg font-bold text-later">{lockSummary.later}</div>
              <div className="text-[10px] text-neutral-500">Later</div>
            </div>
          </div>
          {lockSummary.measuredCount > 0 && (
            <div className="rounded-lg bg-blue-500/10 p-2 text-center mb-2">
              <div className="text-sm font-bold text-blue-400">{lockSummary.measuredCount} measured logged</div>
            </div>
          )}
          {(lockSummary.cleanBad > 0 || lockSummary.slippedBad > 0) && (
            <div className="flex gap-2 text-center">
              <div className="flex-1 rounded-lg bg-done/10 p-2">
                <div className="text-sm font-bold text-done">{lockSummary.cleanBad} clean</div>
              </div>
              <div className="flex-1 rounded-lg bg-bad/10 p-2">
                <div className="text-sm font-bold text-bad">{lockSummary.slippedBad} slipped</div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="w-full max-w-sm space-y-2">
          <a
            href="/edit-log"
            className="block w-full rounded-xl bg-surface-800 border border-surface-700 py-3 text-sm font-medium text-neutral-300 text-center hover:bg-surface-700 transition-colors"
          >
            {"📝"} Edit Today&apos;s Answers
          </a>

          {nextStack && (
            <button
              onClick={() => {
                setActiveStack(nextStack);
                setStackAlreadyDone(false);
              }}
              className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white py-3 text-sm font-bold transition-colors active:scale-[0.98]"
            >
              {nextStack === "midday" ? "☀️ Move to Afternoon" : "🌙 Move to Evening"}
            </button>
          )}

          <a
            href="/"
            className="block w-full rounded-xl bg-surface-800 py-3 text-sm font-medium text-neutral-400 text-center hover:bg-surface-700 transition-colors"
          >
            {"🏠"} Dashboard
          </a>

          <button
            onClick={() => {
              setDayDismissed(true);
              setStackAlreadyDone(false);
              if (typeof window !== "undefined") {
                sessionStorage.setItem(`lock-dismissed-${getToday()}`, "1");
              }
            }}
            className="w-full py-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            Override — log again
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

      {/* Deferred Habits — moved from an earlier stack */}
      {deferredToThisStack.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-later uppercase tracking-wider mb-3">
            ⏰ Deferred from earlier
          </h2>
          <div className="space-y-3">
            {deferredToThisStack.map((habit) => (
              <BinaryHabitCard
                key={`deferred-${habit.id}`}
                habit={habit}
                entry={entries.get(habit.id) ?? null}
                streakDays={streaks[habit.slug] ?? 0}
                needsAttention={false}
                onSelect={(status) => {
                  // For deferred habits, set entry directly (no re-deferring)
                  setEntries((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(habit.id);
                    next.set(habit.id, { habitId: habit.id, status, value: existing?.value ?? null });
                    return next;
                  });
                  if (status === "done" || status === "missed") {
                    resolveEscalation(habit.id);
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Admin Tasks (stack-independent) ─────────────── */}
      {(adminTasks.length > 0 || showAdminInput) && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
              📋 Admin ({adminTasks.filter((t) => t.completed).length}/{adminTasks.length})
            </h2>
            {!showAdminInput && (
              <button
                onClick={() => setShowAdminInput(true)}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-medium"
              >
                + Add
              </button>
            )}
          </div>
          <div className="rounded-xl bg-surface-800 border border-blue-900/30 p-3 space-y-1.5">
            {adminTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => {
                    toggleAdminTask(task.id);
                    setAdminTasks(loadAdminTasks());
                  }}
                  className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                    task.completed
                      ? "bg-done/20 text-done"
                      : "bg-surface-700 text-neutral-600 hover:text-neutral-400"
                  }`}
                >
                  {task.completed ? "✓" : ""}
                </button>
                <span className={`text-sm flex-1 ${task.completed ? "line-through text-neutral-600" : "text-neutral-300"}`}>
                  {task.title}
                </span>
                {task.source === "planned" && !task.completed && (
                  <span className="text-[9px] text-blue-500/60 shrink-0">planned</span>
                )}
                <button
                  onClick={() => {
                    removeAdminTask(task.id);
                    setAdminTasks(loadAdminTasks());
                  }}
                  className="text-neutral-700 hover:text-missed text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
            {showAdminInput && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newAdminText}
                  onChange={(e) => setNewAdminText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newAdminText.trim()) {
                      addAdminTask(newAdminText.trim(), "adhoc");
                      setAdminTasks(loadAdminTasks());
                      setNewAdminText("");
                    }
                  }}
                  placeholder="Add a task..."
                  autoFocus
                  className="flex-1 bg-surface-700 rounded-lg px-3 py-1.5 text-sm text-white border-none outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-neutral-600"
                />
                <button
                  onClick={() => {
                    if (newAdminText.trim()) {
                      addAdminTask(newAdminText.trim(), "adhoc");
                      setAdminTasks(loadAdminTasks());
                      setNewAdminText("");
                    }
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAdminInput(false); setNewAdminText(""); }}
                  className="text-xs text-neutral-600 hover:text-neutral-400 px-1"
                >
                  ✕
                </button>
              </div>
            )}
            {adminTasks.length === 0 && !showAdminInput && (
              <p className="text-xs text-neutral-600 text-center py-2">No admin tasks today</p>
            )}
          </div>
        </section>
      )}

      {/* Quick add admin button when no tasks exist */}
      {adminTasks.length === 0 && !showAdminInput && (
        <button
          onClick={() => setShowAdminInput(true)}
          className="w-full mb-6 py-2.5 rounded-xl border border-dashed border-surface-600 text-xs text-neutral-600 hover:text-blue-400 hover:border-blue-900/40 transition-colors"
        >
          📋 + Add admin task
        </button>
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

      {/* Submit / Save Buttons */}
      <div className="mt-auto pt-4 pb-6 space-y-2">
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
        {canSavePartial && (
          <button
            onClick={handleSavePartial}
            className={`w-full rounded-xl py-3 text-sm font-medium transition-all active:scale-[0.98] ${
              savedPartial
                ? "bg-done/20 text-done border border-done/30"
                : "bg-surface-800 border border-surface-700 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {savedPartial ? "✓ Progress Saved" : "💾 Save Progress — finish later"}
          </button>
        )}
        {!canSubmit && !canSavePartial && (
          <p className="text-center text-xs text-neutral-600 mt-1">
            Answer habits to submit or save progress
          </p>
        )}
      </div>

      {/* ─── Defer Modal ─────────────────────────────────────── */}
      {deferModalHabitId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setDeferModalHabitId(null)}>
          <div
            className="bg-surface-800 rounded-t-2xl w-full max-w-md p-6 pb-8 border-t border-surface-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-4" />
            <h3 className="text-sm font-bold text-center mb-1">
              ⏰ Move to later today
            </h3>
            <p className="text-xs text-neutral-500 text-center mb-5">
              {(() => {
                const h = getResolvedHabits().find((h) => h.id === deferModalHabitId);
                return h ? `${h.icon} ${h.name}` : "";
              })()}
            </p>

            <div className="flex gap-3 mb-4">
              {laterStacks.map((stack) => (
                <button
                  key={stack}
                  onClick={() => handleDeferToStack(stack)}
                  className="flex-1 rounded-xl bg-later/10 border border-later/30 py-4 text-center hover:bg-later/20 active:scale-[0.97] transition-all"
                >
                  <div className="text-2xl mb-1">
                    {stack === "midday" ? "☀️" : "🌙"}
                  </div>
                  <div className="text-xs font-semibold text-later capitalize">
                    {stack === "midday" ? "Midday" : "Evening"}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-surface-700" />
              <span className="text-[10px] text-neutral-600 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-surface-700" />
            </div>

            <button
              onClick={handleKeepEscalating}
              className="w-full rounded-xl bg-surface-700 border border-surface-600 py-3 text-sm text-neutral-300 hover:text-white hover:border-brand/40 active:scale-[0.98] transition-all"
            >
              ⚡ Keep escalating
              <span className="block text-[10px] text-neutral-500 mt-0.5">Fibonacci reminders until you do it</span>
            </button>
          </div>
        </div>
      )}
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
