import { describe, it, expect } from "vitest";
import {
  getLevelForXP,
  recalculateStreaks,
  updateStreakShields,
  getSprintContext,
  mergeDayLogs,
} from "../store";
import type { LocalState, DayLog, StreakShield } from "../store";

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

function makeState(overrides: Partial<LocalState> = {}): LocalState {
  return {
    totalXp: 0,
    currentLevel: 1,
    streaks: {},
    bareMinimumStreak: 0,
    logs: [],
    activeSprint: null,
    sprintHistory: [],
    ...overrides,
  };
}

// ─── getLevelForXP ────────────────────────────────────────

describe("getLevelForXP", () => {
  it("returns level 1 for 0 XP", () => {
    const result = getLevelForXP(0);
    expect(result.level).toBe(1);
    expect(result.title).toBe("Beginner");
  });

  it("returns level 2 at 400 XP", () => {
    const result = getLevelForXP(400);
    expect(result.level).toBe(2);
    expect(result.title).toBe("Showing Up");
  });

  it("returns level 2 at 399 XP (just below threshold)", () => {
    const result = getLevelForXP(399);
    expect(result.level).toBe(1);
  });

  it("returns max level at very high XP", () => {
    const result = getLevelForXP(999999);
    expect(result.level).toBe(15);
    expect(result.title).toBe("Transcendent");
  });

  it("returns correct nextXp for progression", () => {
    const result = getLevelForXP(0);
    expect(result.nextXp).toBe(400); // Next level at 400 XP
  });

  it("nextXp equals xpRequired at max level", () => {
    const result = getLevelForXP(999999);
    expect(result.nextXp).toBe(result.xpRequired);
  });

  it("handles each level threshold correctly", () => {
    const thresholds = [
      { xp: 0, level: 1 },
      { xp: 400, level: 2 },
      { xp: 1200, level: 3 },
      { xp: 2800, level: 4 },
      { xp: 5500, level: 5 },
      { xp: 9500, level: 6 },
      { xp: 15000, level: 7 },
      { xp: 22000, level: 8 },
      { xp: 31000, level: 9 },
      { xp: 42000, level: 10 },
      { xp: 56000, level: 11 },
      { xp: 73000, level: 12 },
      { xp: 95000, level: 13 },
      { xp: 125000, level: 14 },
      { xp: 165000, level: 15 },
    ];
    for (const { xp, level } of thresholds) {
      expect(getLevelForXP(xp).level).toBe(level);
    }
  });
});

// ─── recalculateStreaks ───────────────────────────────────

describe("recalculateStreaks", () => {
  // Note: recalculateStreaks uses getToday() internally — these tests work with
  // dates relative to the calculation. We test the core logic with historical dates.

  it("returns empty for state with no logs", () => {
    const state = makeState();
    const result = recalculateStreaks(state, {});
    expect(result).toEqual({});
  });

  it("counts consecutive done days as a streak", () => {
    const today = new Date();
    const dates = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const state = makeState({
      logs: dates.map((date) =>
        makeDayLog({
          date,
          entries: { "habit-id-1": { status: "done", value: null } },
        })
      ),
    });

    const slugMap = { "habit-id-1": "prayer" };
    const result = recalculateStreaks(state, slugMap);
    expect(result.prayer).toBe(3);
  });

  it("breaks streak on missed day", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const state = makeState({
      logs: [
        makeDayLog({
          date: twoDaysAgo.toISOString().slice(0, 10),
          entries: { "h1": { status: "done", value: null } },
        }),
        makeDayLog({
          date: yesterday.toISOString().slice(0, 10),
          entries: { "h1": { status: "missed", value: null } },
        }),
        makeDayLog({
          date: today.toISOString().slice(0, 10),
          entries: { "h1": { status: "done", value: null } },
        }),
      ],
    });

    const slugMap = { h1: "prayer" };
    const result = recalculateStreaks(state, slugMap);
    expect(result.prayer).toBe(1); // only today counts
  });

  it("breaks streak when a day has no log entry", () => {
    // Create a gap — day1 done, day2 missing entirely, day3 done
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const state = makeState({
      logs: [
        makeDayLog({
          date: twoDaysAgo.toISOString().slice(0, 10),
          entries: { "h1": { status: "done", value: null } },
        }),
        // yesterday: no log at all
        makeDayLog({
          date: today.toISOString().slice(0, 10),
          entries: { "h1": { status: "done", value: null } },
        }),
      ],
    });

    const slugMap = { h1: "prayer" };
    const result = recalculateStreaks(state, slugMap);
    expect(result.prayer).toBe(1); // only today
  });
});

// ─── updateStreakShields ──────────────────────────────────

describe("updateStreakShields", () => {
  it("earns shield at 14-day streak", () => {
    const state = makeState({
      streaks: { prayer: 14 },
      streakShields: {},
    });
    const shields = updateStreakShields(state);
    expect(shields.prayer.available).toBe(true);
    expect(shields.prayer.earnedDate).toBeTruthy();
  });

  it("does not earn shield below 14-day streak", () => {
    const state = makeState({
      streaks: { prayer: 13 },
      streakShields: {},
    });
    const shields = updateStreakShields(state);
    expect(shields.prayer?.available ?? false).toBe(false);
  });

  it("preserves existing shields", () => {
    const state = makeState({
      streaks: { prayer: 20 },
      streakShields: {
        prayer: { habitSlug: "prayer", available: true, usedDate: null, earnedDate: "2025-01-01" },
      },
    });
    const shields = updateStreakShields(state);
    expect(shields.prayer.available).toBe(true);
  });
});

// ─── getSprintContext ─────────────────────────────────────

describe("getSprintContext", () => {
  it("returns inactive when no sprint", () => {
    const state = makeState();
    const ctx = getSprintContext(state);
    expect(ctx.active).toBe(false);
    expect(ctx.intensity).toBeNull();
    expect(ctx.bareMinimumOnly).toBe(false);
    expect(ctx.singleCheckin).toBe(false);
    expect(ctx.targetMultiplier).toBe(1);
    expect(ctx.protectStreaks).toBe(false);
  });

  it("moderate sprint has 0.75 multiplier", () => {
    const state = makeState({
      activeSprint: {
        id: "s1",
        name: "Test Sprint",
        intensity: "moderate",
        startDate: "2025-01-01",
        deadline: "2025-01-14",
        status: "active",
        tasks: [],
        bareMinimumDaysMet: 0,
        completedAt: null,
      },
    });
    const ctx = getSprintContext(state);
    expect(ctx.active).toBe(true);
    expect(ctx.intensity).toBe("moderate");
    expect(ctx.targetMultiplier).toBe(0.75);
    expect(ctx.bareMinimumOnly).toBe(false);
    expect(ctx.singleCheckin).toBe(false);
  });

  it("intense sprint only shows bare minimum", () => {
    const state = makeState({
      activeSprint: {
        id: "s1",
        name: "Crunch",
        intensity: "intense",
        startDate: "2025-01-01",
        deadline: "2025-01-14",
        status: "active",
        tasks: [],
        bareMinimumDaysMet: 0,
        completedAt: null,
      },
    });
    const ctx = getSprintContext(state);
    expect(ctx.bareMinimumOnly).toBe(true);
    expect(ctx.singleCheckin).toBe(false);
    expect(ctx.targetMultiplier).toBe(0.5);
  });

  it("critical sprint collapses to single check-in and protects streaks", () => {
    const state = makeState({
      activeSprint: {
        id: "s1",
        name: "Emergency",
        intensity: "critical",
        startDate: "2025-01-01",
        deadline: "2025-01-14",
        status: "active",
        tasks: [],
        bareMinimumDaysMet: 0,
        completedAt: null,
      },
    });
    const ctx = getSprintContext(state);
    expect(ctx.bareMinimumOnly).toBe(true);
    expect(ctx.singleCheckin).toBe(true);
    expect(ctx.protectStreaks).toBe(true);
    expect(ctx.targetMultiplier).toBe(0.5);
  });

  it("completed sprint is inactive", () => {
    const state = makeState({
      activeSprint: {
        id: "s1",
        name: "Done",
        intensity: "moderate",
        startDate: "2025-01-01",
        deadline: "2025-01-14",
        status: "completed",
        tasks: [],
        bareMinimumDaysMet: 7,
        completedAt: "2025-01-10T00:00:00Z",
      },
    });
    const ctx = getSprintContext(state);
    expect(ctx.active).toBe(false);
  });
});

// ─── mergeDayLogs ─────────────────────────────────────────

describe("mergeDayLogs", () => {
  it("takes the union of entries from both logs", () => {
    const a = makeDayLog({
      entries: { h1: { status: "done", value: null } },
      badEntries: {},
    });
    const b = makeDayLog({
      entries: { h2: { status: "missed", value: null } },
      badEntries: {},
    });
    const merged = mergeDayLogs(a, b);
    expect(merged.entries.h1.status).toBe("done");
    expect(merged.entries.h2.status).toBe("missed");
  });

  it("prefers entries with status over entries without status", () => {
    const a = makeDayLog({
      entries: { h1: { status: "done", value: null } },
    });
    const b = makeDayLog({
      entries: { h1: { status: "missed", value: null } },
    });
    // a has status, so a's entry should win (it's already in merged.entries before b is processed)
    const merged = mergeDayLogs(a, b);
    expect(merged.entries.h1.status).toBe("done");
  });

  it("keeps the higher XP value", () => {
    const a = makeDayLog({ xpEarned: 50 });
    const b = makeDayLog({ xpEarned: 100 });
    expect(mergeDayLogs(a, b).xpEarned).toBe(100);
    expect(mergeDayLogs(b, a).xpEarned).toBe(100);
  });

  it("keeps the more recent submittedAt", () => {
    const a = makeDayLog({ submittedAt: "2025-01-15T10:00:00Z" });
    const b = makeDayLog({ submittedAt: "2025-01-15T18:00:00Z" });
    expect(mergeDayLogs(a, b).submittedAt).toBe("2025-01-15T18:00:00Z");
    expect(mergeDayLogs(b, a).submittedAt).toBe("2025-01-15T18:00:00Z");
  });

  it("merges bad entries as union", () => {
    const a = makeDayLog({
      badEntries: { b1: { occurred: false, durationMinutes: null } },
    });
    const b = makeDayLog({
      badEntries: { b2: { occurred: true, durationMinutes: 30 } },
    });
    const merged = mergeDayLogs(a, b);
    expect(merged.badEntries.b1.occurred).toBe(false);
    expect(merged.badEntries.b2.occurred).toBe(true);
    expect(merged.badEntries.b2.durationMinutes).toBe(30);
  });

  it("sets bareMinimumMet to true if either log has it true", () => {
    const a = makeDayLog({ bareMinimumMet: false });
    const b = makeDayLog({ bareMinimumMet: true });
    expect(mergeDayLogs(a, b).bareMinimumMet).toBe(true);
  });

  it("keeps admin summary from the log with more tasks", () => {
    const a = makeDayLog({
      adminSummary: { total: 3, completed: 2, tasks: [
        { title: "t1", completed: true },
        { title: "t2", completed: true },
        { title: "t3", completed: false },
      ]},
    });
    const b = makeDayLog({
      adminSummary: { total: 1, completed: 1, tasks: [
        { title: "t1", completed: true },
      ]},
    });
    expect(mergeDayLogs(a, b).adminSummary?.total).toBe(3);
    expect(mergeDayLogs(b, a).adminSummary?.total).toBe(3);
  });

  it("is idempotent — merging a log with itself returns equivalent data", () => {
    const a = makeDayLog({
      entries: { h1: { status: "done", value: null }, h2: { status: "missed", value: null } },
      badEntries: { b1: { occurred: false, durationMinutes: null } },
      xpEarned: 75,
      bareMinimumMet: true,
    });
    const merged = mergeDayLogs(a, a);
    expect(merged.entries).toEqual(a.entries);
    expect(merged.badEntries).toEqual(a.badEntries);
    expect(merged.xpEarned).toBe(75);
    expect(merged.bareMinimumMet).toBe(true);
  });
});
