import { describe, it, expect } from "vitest";
import {
  countDone,
  getCompletionRate,
  getDailyCompletionStats,
  getBadHabitStats,
  formatBadHabitDisplay,
} from "../completion";
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

// ─── countDone ────────────────────────────────────────────

describe("countDone", () => {
  it("returns 0 for empty logs", () => {
    expect(countDone("habit-1", [])).toBe(0);
  });

  it("counts days where habit was done", () => {
    const logs: DayLog[] = [
      makeDayLog({ date: "2025-01-01", entries: { "habit-1": { status: "done", value: null } } }),
      makeDayLog({ date: "2025-01-02", entries: { "habit-1": { status: "missed", value: null } } }),
      makeDayLog({ date: "2025-01-03", entries: { "habit-1": { status: "done", value: null } } }),
    ];
    expect(countDone("habit-1", logs)).toBe(2);
  });

  it("ignores other habit IDs", () => {
    const logs: DayLog[] = [
      makeDayLog({ entries: { "other-habit": { status: "done", value: null } } }),
    ];
    expect(countDone("habit-1", logs)).toBe(0);
  });

  it("does not count 'later' as done", () => {
    const logs: DayLog[] = [
      makeDayLog({ entries: { "habit-1": { status: "later", value: null } } }),
    ];
    expect(countDone("habit-1", logs)).toBe(0);
  });
});

// ─── getCompletionRate ────────────────────────────────────

describe("getCompletionRate", () => {
  it("returns 0 when totalDays is 0", () => {
    expect(getCompletionRate("habit-1", [], 0)).toBe(0);
  });

  it("returns correct rate", () => {
    const logs: DayLog[] = [
      makeDayLog({ entries: { "h1": { status: "done", value: null } } }),
      makeDayLog({ entries: { "h1": { status: "missed", value: null } } }),
    ];
    expect(getCompletionRate("h1", logs, 4)).toBe(0.25);
  });

  it("returns 1.0 for perfect completion", () => {
    const logs: DayLog[] = [
      makeDayLog({ entries: { "h1": { status: "done", value: null } } }),
      makeDayLog({ entries: { "h1": { status: "done", value: null } } }),
    ];
    expect(getCompletionRate("h1", logs, 2)).toBe(1);
  });
});

// ─── getDailyCompletionStats ──────────────────────────────

describe("getDailyCompletionStats", () => {
  const bareMinHabit = makeHabit({ id: "bm1", is_bare_minimum: true, category: "binary", is_active: true });
  const stretchHabit = makeHabit({ id: "st1", is_bare_minimum: false, category: "binary", is_active: true });
  const measuredHabit = makeHabit({ id: "ms1", category: "measured", is_bare_minimum: false, is_active: true });
  const habits = [bareMinHabit, stretchHabit, measuredHabit];

  it("returns zeros when todayLog is undefined", () => {
    const stats = getDailyCompletionStats(undefined, habits);
    expect(stats.bareMinDone).toBe(0);
    expect(stats.stretchDone).toBe(0);
    expect(stats.measuredDone).toBe(0);
  });

  it("counts totals correctly", () => {
    const stats = getDailyCompletionStats(undefined, habits);
    expect(stats.bareMinTotal).toBe(1);
    expect(stats.stretchTotal).toBe(1);
    expect(stats.measuredTotal).toBe(1);
  });

  it("counts done habits correctly", () => {
    const log = makeDayLog({
      entries: {
        bm1: { status: "done", value: null },
        st1: { status: "done", value: null },
        ms1: { status: "done", value: 5 },
      },
    });
    const stats = getDailyCompletionStats(log, habits);
    expect(stats.bareMinDone).toBe(1);
    expect(stats.stretchDone).toBe(1);
    expect(stats.measuredDone).toBe(1);
  });

  it("measured habits need value > 0 to count as done", () => {
    const log = makeDayLog({
      entries: {
        ms1: { status: "done", value: 0 },
      },
    });
    const stats = getDailyCompletionStats(log, [measuredHabit]);
    expect(stats.measuredDone).toBe(0);
  });

  it("ignores inactive habits", () => {
    const inactiveHabit = makeHabit({ id: "inactive", is_active: false, is_bare_minimum: true });
    const stats = getDailyCompletionStats(undefined, [inactiveHabit]);
    expect(stats.bareMinTotal).toBe(0);
  });
});

// ─── getBadHabitStats ─────────────────────────────────────

describe("getBadHabitStats", () => {
  const badHabit = makeHabit({
    id: "bad1",
    slug: "league",
    name: "League of Legends",
    category: "bad",
    unit: "minutes",
    icon: "🎮",
  });

  it("returns zero stats for empty logs", () => {
    const stats = getBadHabitStats([badHabit], []);
    expect(stats).toHaveLength(1);
    expect(stats[0].count).toBe(0);
    expect(stats[0].minutes).toBe(0);
  });

  it("counts occurrences and sums minutes", () => {
    const logs: DayLog[] = [
      makeDayLog({
        badEntries: { bad1: { occurred: true, durationMinutes: 60 } },
      }),
      makeDayLog({
        badEntries: { bad1: { occurred: true, durationMinutes: 90 } },
      }),
      makeDayLog({
        badEntries: { bad1: { occurred: false, durationMinutes: null } },
      }),
    ];
    const stats = getBadHabitStats([badHabit], logs);
    expect(stats[0].count).toBe(2);
    expect(stats[0].minutes).toBe(150);
  });

  it("returns correct labels and icons", () => {
    const stats = getBadHabitStats([badHabit], []);
    expect(stats[0].slug).toBe("league");
    expect(stats[0].icon).toBe("🎮");
    expect(stats[0].label).toBe("League of Legends");
  });
});

// ─── formatBadHabitDisplay ────────────────────────────────

describe("formatBadHabitDisplay", () => {
  it("shows hours for minutes unit >= 60", () => {
    expect(formatBadHabitDisplay("minutes", 2, 120)).toBe("2.0h");
  });

  it("shows minutes for minutes unit < 60", () => {
    expect(formatBadHabitDisplay("minutes", 1, 45)).toBe("45m");
  });

  it("shows days for non-minutes unit", () => {
    expect(formatBadHabitDisplay(null, 3, 0)).toBe("3 days");
  });
});
