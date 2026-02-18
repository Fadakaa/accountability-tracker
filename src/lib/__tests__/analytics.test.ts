import { describe, it, expect } from "vitest";
import {
  getXpCurve,
  rollingAverage,
  getDayOfWeekAnalysis,
  getStreakTimeline,
  getTrainingBreakdown,
  getSingleHabitStats,
  getSingleHabitDayOfWeek,
} from "../analytics";
import type { DayLog } from "../store";
import type { Habit } from "@/types/database";

// ─── Test Helpers ─────────────────────────────────────────

function makeDayLog(overrides: Partial<DayLog> = {}): DayLog {
  return {
    date: "2025-01-15",
    entries: {},
    badEntries: {},
    xpEarned: 0,
    bareMinimumMet: false,
    submittedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "test-habit-1",
    user_id: "user-1",
    name: "Test Habit",
    slug: "test-habit",
    category: "binary",
    stack: "morning",
    is_bare_minimum: true,
    unit: null,
    icon: "🧪",
    sort_order: 1,
    is_active: true,
    current_level: 1,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

// ─── getXpCurve ──────────────────────────────────────────

describe("getXpCurve", () => {
  it("returns empty array for no logs", () => {
    expect(getXpCurve([])).toEqual([]);
  });

  it("accumulates XP correctly", () => {
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-01", xpEarned: 100 }),
      makeDayLog({ date: "2025-01-03", xpEarned: 50 }),
      makeDayLog({ date: "2025-01-02", xpEarned: 200 }),
    ];
    const curve = getXpCurve(logs);
    // Should be sorted by date
    expect(curve[0]).toEqual({ date: "2025-01-01", cumXp: 100 });
    expect(curve[1]).toEqual({ date: "2025-01-02", cumXp: 300 });
    expect(curve[2]).toEqual({ date: "2025-01-03", cumXp: 350 });
  });
});

// ─── rollingAverage ──────────────────────────────────────

describe("rollingAverage", () => {
  it("returns same values for window=1", () => {
    const data = [
      { date: "2025-01-01", rate: 0.5 },
      { date: "2025-01-02", rate: 1.0 },
    ];
    const result = rollingAverage(data, 1);
    expect(result[0].avg).toBe(0.5);
    expect(result[1].avg).toBe(1.0);
  });

  it("computes rolling average correctly", () => {
    const data = [
      { date: "2025-01-01", rate: 0 },
      { date: "2025-01-02", rate: 1 },
      { date: "2025-01-03", rate: 0 },
      { date: "2025-01-04", rate: 1 },
    ];
    const result = rollingAverage(data, 2);
    expect(result[0].avg).toBe(0);     // only one element in window
    expect(result[1].avg).toBe(0.5);   // avg(0, 1)
    expect(result[2].avg).toBe(0.5);   // avg(1, 0)
    expect(result[3].avg).toBe(0.5);   // avg(0, 1)
  });

  it("handles empty data", () => {
    expect(rollingAverage([])).toEqual([]);
  });
});

// ─── getDayOfWeekAnalysis ─────────────────────────────────

describe("getDayOfWeekAnalysis", () => {
  it("returns 7 day labels", () => {
    const result = getDayOfWeekAnalysis([], []);
    expect(result).toHaveLength(7);
    expect(result[0].label).toBe("Sun");
    expect(result[6].label).toBe("Sat");
  });

  it("returns 0 avgRate when no logs", () => {
    const result = getDayOfWeekAnalysis([], [makeHabit()]);
    result.forEach((d) => expect(d.avgRate).toBe(0));
  });

  it("calculates average for specific days", () => {
    const habit = makeHabit({ id: "h1" });
    // 2025-01-13 is a Monday
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-13", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-20", entries: { h1: { status: "missed", value: null } } }),
    ];
    const result = getDayOfWeekAnalysis(logs, [habit]);
    // Monday = index 1
    expect(result[1].avgRate).toBe(0.5); // 1 done out of 2 logs on Monday
  });
});

// ─── getStreakTimeline ────────────────────────────────────

describe("getStreakTimeline", () => {
  it("returns empty periods for no logs", () => {
    const habit = makeHabit({ id: "h1" });
    const result = getStreakTimeline([], [habit]);
    expect(result).toHaveLength(1);
    expect(result[0].periods).toEqual([]);
    expect(result[0].currentStreak).toBe(0);
  });

  it("detects streak periods", () => {
    const habit = makeHabit({ id: "h1" });
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-01", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-02", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-03", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-04", entries: { h1: { status: "missed", value: null } } }),
      makeDayLog({ date: "2025-01-05", entries: { h1: { status: "done", value: null } } }),
    ];
    const result = getStreakTimeline(logs, [habit]);
    expect(result[0].periods).toHaveLength(2);
    expect(result[0].periods[0].length).toBe(3); // Jan 1-3
    expect(result[0].periods[1].length).toBe(1); // Jan 5
  });

  it("only includes active binary habits", () => {
    const inactiveHabit = makeHabit({ id: "h1", is_active: false });
    const measuredHabit = makeHabit({ id: "h2", category: "measured" });
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-01", entries: { h1: { status: "done", value: null }, h2: { status: "done", value: 5 } } }),
    ];
    const result = getStreakTimeline(logs, [inactiveHabit, measuredHabit]);
    expect(result).toHaveLength(0);
  });
});

// ─── getTrainingBreakdown ─────────────────────────────────

describe("getTrainingBreakdown", () => {
  it("returns empty array for no sessions", () => {
    expect(getTrainingBreakdown([])).toEqual([]);
  });

  it("counts training types", () => {
    const sessions = [
      { trainingType: "gym", date: "2025-01-01" },
      { trainingType: "gym", date: "2025-01-02" },
      { trainingType: "bjj", date: "2025-01-03" },
      { trainingType: "run", date: "2025-01-04" },
    ];
    const result = getTrainingBreakdown(sessions);
    const gym = result.find((r) => r.type === "gym");
    const bjj = result.find((r) => r.type === "bjj");
    const run = result.find((r) => r.type === "run");
    expect(gym?.count).toBe(2);
    expect(gym?.label).toBe("Gym");
    expect(bjj?.count).toBe(1);
    expect(bjj?.label).toBe("BJJ");
    expect(run?.count).toBe(1);
    expect(run?.label).toBe("Run");
  });
});

// ─── getSingleHabitStats ──────────────────────────────────

describe("getSingleHabitStats", () => {
  const habit = makeHabit({ id: "h1" });

  it("returns zeros for empty logs", () => {
    const stats = getSingleHabitStats([], "h1", habit);
    expect(stats.totalDays).toBe(0);
    expect(stats.doneCount).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.avgValue).toBeNull();
  });

  it("calculates streaks correctly", () => {
    // Create consecutive days with a break
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-01", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-02", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-03", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-04", entries: { h1: { status: "missed", value: null } } }),
      makeDayLog({ date: "2025-01-05", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-06", entries: { h1: { status: "done", value: null } } }),
    ];
    const stats = getSingleHabitStats(logs, "h1", habit);
    expect(stats.longestStreak).toBe(3); // Jan 1-3
    expect(stats.doneCount).toBe(5);
    expect(stats.totalDays).toBe(6);
  });

  it("calculates average value for measured habits", () => {
    const measuredHabit = makeHabit({ id: "m1", category: "measured" });
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-01", entries: { m1: { status: "done", value: 3 } } }),
      makeDayLog({ date: "2025-01-02", entries: { m1: { status: "done", value: 5 } } }),
      makeDayLog({ date: "2025-01-03", entries: { m1: { status: "done", value: 7 } } }),
    ];
    const stats = getSingleHabitStats(logs, "m1", measuredHabit);
    expect(stats.avgValue).toBe(5); // (3+5+7)/3
  });
});

// ─── getSingleHabitDayOfWeek ──────────────────────────────

describe("getSingleHabitDayOfWeek", () => {
  it("returns 7 entries", () => {
    const result = getSingleHabitDayOfWeek([], "h1");
    expect(result).toHaveLength(7);
  });

  it("computes per-day rates", () => {
    // 2025-01-06 is a Monday, 2025-01-13 is a Monday
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-06", entries: { h1: { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-13", entries: { h1: { status: "done", value: null } } }),
    ];
    const result = getSingleHabitDayOfWeek(logs, "h1");
    // Monday = index 1
    expect(result[1].avgRate).toBe(1.0); // 2/2 on Mondays
    // Other days should be 0
    expect(result[0].avgRate).toBe(0);
  });
});
