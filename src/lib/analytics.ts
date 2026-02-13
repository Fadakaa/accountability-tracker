// Analytics data processing — computes all chart data from localStorage state
// Used by /insights page for deep dive analytics

import type { DayLog } from "./store";
import type { Habit } from "@/types/database";
import { isBinaryLike } from "@/types/database";

// ─── Types ──────────────────────────────────────────────────

export interface DayCompletion {
  date: string;
  rate: number;       // 0-1
  count: number;      // habits done
  total: number;      // total active habits
}

export interface WeeklyGameRow {
  weekNum: number;
  startDate: string;
  endDate: string;
  metrics: {
    label: string;
    actual: number;
    target: number;
    pct: number;       // 0-100
  }[];
}

export interface MonthlyGameRow {
  month: string;       // "Jan", "Feb", etc.
  monthNum: number;
  metrics: {
    label: string;
    actual: number;
    target: number;
    pct: number;
  }[];
}

export interface BadHabitWeek {
  weekStart: string;
  habit: string;
  count: number;
  minutes: number;
}

export interface XpPoint {
  date: string;
  cumXp: number;
}

export interface DayOfWeekAvg {
  day: number;         // 0=Sun, 1=Mon, etc.
  label: string;
  avgRate: number;     // 0-1
}

export interface StreakPeriod {
  start: string;
  end: string;
  length: number;
}

export interface HabitStreakTimeline {
  habitId: string;
  habitName: string;
  habitIcon: string;
  currentStreak: number;
  periods: StreakPeriod[];
}

export interface TrainingTypeBreakdown {
  type: string;
  count: number;
  label: string;
}

// ─── Weekly Targets (from spreadsheet) ──────────────────────

export const WEEKLY_TARGETS: Record<string, number> = {
  "Training": 5,
  "BJJ": 2,
  "Runs": 1,
  "Deep Work": 15,
  "Bible Ch.": 7,
};

export const MONTHLY_TARGETS: Record<string, number> = {
  "Training": 20,
  "BJJ": 8,
  "Runs": 4,
  "Deep Work": 60,
  "Bible Ch.": 30,
};

// ─── Data Processing Functions ──────────────────────────────

/** Get completion rate per day */
export function getCompletionByDay(
  logs: DayLog[],
  habits: Habit[],
  days: number = 90
): DayCompletion[] {
  const today = new Date();
  const binaryHabits = habits.filter((h) => isBinaryLike(h.category) && h.is_active);
  const result: DayCompletion[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const log = logs.find((l) => l.date === dateStr);

    let count = 0;
    const total = binaryHabits.length;

    if (log) {
      for (const h of binaryHabits) {
        if (log.entries[h.id]?.status === "done") count++;
      }
    }

    result.push({
      date: dateStr,
      rate: total > 0 ? count / total : 0,
      count,
      total,
    });
  }

  return result;
}

/** Get weekly game data (like the spreadsheet) */
export function getWeeklyGameData(
  logs: DayLog[],
  habits: Habit[],
  year: number = new Date().getFullYear()
): WeeklyGameRow[] {
  const rows: WeeklyGameRow[] = [];
  // Get first Monday of the year
  const jan1 = new Date(year, 0, 1);
  let dayOfWeek = jan1.getDay(); // 0=Sun
  const firstMon = new Date(jan1);
  firstMon.setDate(jan1.getDate() + (dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek));

  const trainingHabit = habits.find((h) => h.slug === "training");
  const deepWorkHabit = habits.find((h) => h.slug === "deep-work");
  const bibleChHabit = habits.find((h) => h.slug === "bible-chapters");

  for (let w = 0; w < 52; w++) {
    const weekStart = new Date(firstMon);
    weekStart.setDate(firstMon.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekStart.getFullYear() > year) break;

    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);

    // Count metrics for this week
    const weekLogs = logs.filter((l) => l.date >= startStr && l.date <= endStr);

    let trainingSessions = 0;
    let deepBlocks = 0;
    let bibleChapters = 0;

    for (const log of weekLogs) {
      if (trainingHabit && log.entries[trainingHabit.id]?.status === "done") {
        trainingSessions++;
      }
      if (deepWorkHabit && log.entries[deepWorkHabit.id]?.value) {
        deepBlocks += log.entries[deepWorkHabit.id].value!;
      }
      if (bibleChHabit && log.entries[bibleChHabit.id]?.value) {
        bibleChapters += log.entries[bibleChHabit.id].value!;
      }
    }

    const metrics = [
      { label: "Training", actual: trainingSessions, target: WEEKLY_TARGETS["Training"], pct: Math.round((trainingSessions / WEEKLY_TARGETS["Training"]) * 100) },
      { label: "Deep Work", actual: deepBlocks, target: WEEKLY_TARGETS["Deep Work"], pct: Math.round((deepBlocks / WEEKLY_TARGETS["Deep Work"]) * 100) },
      { label: "Bible Ch.", actual: bibleChapters, target: WEEKLY_TARGETS["Bible Ch."], pct: Math.round((bibleChapters / WEEKLY_TARGETS["Bible Ch."]) * 100) },
    ];

    rows.push({
      weekNum: w + 1,
      startDate: startStr,
      endDate: endStr,
      metrics,
    });
  }

  return rows;
}

/** Get bad habit trends by week */
export function getBadHabitTrends(
  logs: DayLog[],
  habits: Habit[],
  weeks: number = 12
): BadHabitWeek[] {
  const today = new Date();
  const badHabits = habits.filter((h) => h.category === "bad" && h.is_active);
  const result: BadHabitWeek[] = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);

    const weekLogs = logs.filter((l) => l.date >= startStr && l.date <= endStr);

    for (const bh of badHabits) {
      let count = 0;
      let minutes = 0;
      for (const log of weekLogs) {
        const entry = log.badEntries[bh.id];
        if (entry?.occurred) {
          count++;
          minutes += entry.durationMinutes ?? 0;
        }
      }
      result.push({
        weekStart: startStr,
        habit: bh.name,
        count,
        minutes,
      });
    }
  }

  return result;
}

/** Get cumulative XP curve */
export function getXpCurve(logs: DayLog[]): XpPoint[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  let cumXp = 0;
  return sorted.map((log) => {
    cumXp += log.xpEarned;
    return { date: log.date, cumXp };
  });
}

/** Get day-of-week completion averages */
export function getDayOfWeekAnalysis(
  logs: DayLog[],
  habits: Habit[]
): DayOfWeekAvg[] {
  const binaryHabits = habits.filter((h) => isBinaryLike(h.category) && h.is_active);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);

  for (const log of logs) {
    const d = new Date(log.date + "T12:00:00");
    const dow = d.getDay();
    let done = 0;
    for (const h of binaryHabits) {
      if (log.entries[h.id]?.status === "done") done++;
    }
    const rate = binaryHabits.length > 0 ? done / binaryHabits.length : 0;
    totals[dow] += rate;
    counts[dow]++;
  }

  return dayLabels.map((label, i) => ({
    day: i,
    label,
    avgRate: counts[i] > 0 ? totals[i] / counts[i] : 0,
  }));
}

/** Get streak timeline for habits */
export function getStreakTimeline(
  logs: DayLog[],
  habits: Habit[]
): HabitStreakTimeline[] {
  const binaryHabits = habits.filter((h) => isBinaryLike(h.category) && h.is_active);
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  return binaryHabits.map((habit) => {
    const periods: StreakPeriod[] = [];
    let streakStart: string | null = null;
    let streakLen = 0;
    let currentStreak = 0;

    // Walk through all dates
    const allDates = sortedLogs.map((l) => l.date);
    if (allDates.length === 0) {
      return { habitId: habit.id, habitName: habit.name, habitIcon: habit.icon || "", currentStreak: 0, periods: [] };
    }

    const first = new Date(allDates[0] + "T12:00:00");
    const last = new Date(allDates[allDates.length - 1] + "T12:00:00");
    const d = new Date(first);

    while (d <= last) {
      const dateStr = d.toISOString().slice(0, 10);
      const log = sortedLogs.find((l) => l.date === dateStr);
      const done = log?.entries[habit.id]?.status === "done";

      if (done) {
        if (!streakStart) streakStart = dateStr;
        streakLen++;
      } else {
        if (streakStart && streakLen > 0) {
          const prevDate = new Date(d);
          prevDate.setDate(prevDate.getDate() - 1);
          periods.push({
            start: streakStart,
            end: prevDate.toISOString().slice(0, 10),
            length: streakLen,
          });
        }
        streakStart = null;
        streakLen = 0;
      }

      d.setDate(d.getDate() + 1);
    }

    // Close final streak
    if (streakStart && streakLen > 0) {
      periods.push({
        start: streakStart,
        end: last.toISOString().slice(0, 10),
        length: streakLen,
      });
      // Check if it's the current streak (ends today or yesterday)
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      if (periods[periods.length - 1].end >= yesterdayStr) {
        currentStreak = streakLen;
      }
    }

    return {
      habitId: habit.id,
      habitName: habit.name,
      habitIcon: habit.icon || "",
      currentStreak,
      periods,
    };
  }).sort((a, b) => b.currentStreak - a.currentStreak);
}

/** Get training type breakdown from gym sessions */
export function getTrainingBreakdown(
  gymSessions: { trainingType: string; date: string }[]
): TrainingTypeBreakdown[] {
  const counts: Record<string, number> = {};
  const labels: Record<string, string> = {
    gym: "Gym",
    bjj: "BJJ",
    run: "Run",
  };

  for (const s of gymSessions) {
    counts[s.trainingType] = (counts[s.trainingType] ?? 0) + 1;
  }

  return Object.entries(counts).map(([type, count]) => ({
    type,
    count,
    label: labels[type] ?? type,
  }));
}

// ─── Single-Habit Analytics ─────────────────────────────────

export interface HabitDayData {
  date: string;
  done: boolean;
  value: number | null;   // for measured habits
}

/** Get per-day data for a single habit */
export function getSingleHabitByDay(
  logs: DayLog[],
  habitId: string,
  days: number = 90
): HabitDayData[] {
  const today = new Date();
  const result: HabitDayData[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const log = logs.find((l) => l.date === dateStr);

    const entry = log?.entries[habitId];
    result.push({
      date: dateStr,
      done: entry?.status === "done",
      value: entry?.value ?? null,
    });
  }

  return result;
}

/** Get day-of-week averages for a single habit */
export function getSingleHabitDayOfWeek(
  logs: DayLog[],
  habitId: string
): DayOfWeekAvg[] {
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const doneCount = Array(7).fill(0);
  const totalCount = Array(7).fill(0);

  for (const log of logs) {
    const d = new Date(log.date + "T12:00:00");
    const dow = d.getDay();
    const entry = log.entries[habitId];
    if (entry) {
      totalCount[dow]++;
      if (entry.status === "done") doneCount[dow]++;
    }
  }

  return dayLabels.map((label, i) => ({
    day: i,
    label,
    avgRate: totalCount[i] > 0 ? doneCount[i] / totalCount[i] : 0,
  }));
}

/** Get summary stats for a single habit */
export interface HabitSummaryStats {
  totalDays: number;
  doneCount: number;
  completionRate: number;  // 0-1
  currentStreak: number;
  longestStreak: number;
  avgValue: number | null; // for measured habits
}

export function getSingleHabitStats(
  logs: DayLog[],
  habitId: string,
  habit: Habit
): HabitSummaryStats {
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  let totalDays = 0;
  let doneCount = 0;
  let streak = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  let valueSum = 0;
  let valueCount = 0;

  // Walk from first log to today
  if (sortedLogs.length > 0) {
    const first = new Date(sortedLogs[0].date + "T12:00:00");
    const today = new Date();
    const d = new Date(first);

    while (d <= today) {
      const dateStr = d.toISOString().slice(0, 10);
      const log = sortedLogs.find((l) => l.date === dateStr);
      const entry = log?.entries[habitId];

      if (entry) {
        totalDays++;
        if (entry.status === "done") {
          doneCount++;
          streak++;
          if (streak > longestStreak) longestStreak = streak;
        } else {
          streak = 0;
        }
        if (entry.value != null && entry.value > 0) {
          valueSum += entry.value;
          valueCount++;
        }
      } else {
        streak = 0;
      }

      d.setDate(d.getDate() + 1);
    }
    currentStreak = streak;
  }

  return {
    totalDays,
    doneCount,
    completionRate: totalDays > 0 ? doneCount / totalDays : 0,
    currentStreak,
    longestStreak,
    avgValue: valueCount > 0 ? valueSum / valueCount : null,
  };
}

/** Calculate a 7-day rolling average */
export function rollingAverage(data: { date: string; rate: number }[], window: number = 7): { date: string; avg: number }[] {
  return data.map((d, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((sum, s) => sum + s.rate, 0) / slice.length;
    return { date: d.date, avg };
  });
}
