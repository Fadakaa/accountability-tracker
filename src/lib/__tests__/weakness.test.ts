import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies that read from localStorage
vi.mock("../resolvedHabits", () => ({
  getResolvedHabits: vi.fn(() => [
    {
      id: "h1",
      user_id: "user-1",
      name: "Prayer",
      slug: "prayer",
      category: "binary",
      stack: "morning",
      is_bare_minimum: true,
      unit: null,
      icon: "🙏",
      sort_order: 1,
      is_active: true,
      current_level: 1,
      created_at: "",
      updated_at: "",
    },
    {
      id: "h2",
      user_id: "user-1",
      name: "Training",
      slug: "training",
      category: "binary",
      stack: "evening",
      is_bare_minimum: true,
      unit: null,
      icon: "💪",
      sort_order: 2,
      is_active: true,
      current_level: 1,
      created_at: "",
      updated_at: "",
    },
    {
      id: "h3",
      user_id: "user-1",
      name: "Deep Work",
      slug: "deep-work",
      category: "measured",
      stack: "midday",
      is_bare_minimum: false,
      unit: "count",
      icon: "🧠",
      sort_order: 3,
      is_active: true,
      current_level: 1,
      created_at: "",
      updated_at: "",
    },
  ]),
}));

vi.mock("../store", () => {
  let mockState = {
    totalXp: 0,
    currentLevel: 1,
    streaks: {},
    bareMinimumStreak: 0,
    logs: [] as Array<{
      date: string;
      entries: Record<string, { status: string; value: number | null }>;
      badEntries: Record<string, never>;
      xpEarned: number;
      bareMinimumMet: boolean;
      submittedAt: string;
    }>,
    activeSprint: null,
    sprintHistory: [],
  };

  return {
    loadState: vi.fn(() => mockState),
    _setMockState: (state: typeof mockState) => { mockState = state; },
  };
});

import { getWeakHabits, isHabitWeak } from "../weakness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { _setMockState } = await import("../store") as any;

function makeDayLog(date: string, entries: Record<string, { status: string; value: number | null }>) {
  return {
    date,
    entries,
    badEntries: {},
    xpEarned: 0,
    bareMinimumMet: false,
    submittedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWeakHabits", () => {
  it("returns empty when all habits are above 50%", () => {
    const today = new Date();
    const logs = [];
    // 7 days, all done for h1 and h2
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      logs.push(
        makeDayLog(d.toISOString().slice(0, 10), {
          h1: { status: "done", value: null },
          h2: { status: "done", value: null },
        })
      );
    }

    (_setMockState as (state: unknown) => void)({
      totalXp: 0,
      currentLevel: 1,
      streaks: { prayer: 7, training: 7 },
      bareMinimumStreak: 7,
      logs,
      activeSprint: null,
      sprintHistory: [],
    });

    const weak = getWeakHabits(7);
    expect(weak).toEqual([]);
  });

  it("identifies habits below 50% completion", () => {
    const today = new Date();
    const logs = [];
    // 7 days, h1 done only 2 out of 7 (28%), h2 always done
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      logs.push(
        makeDayLog(d.toISOString().slice(0, 10), {
          h1: { status: i < 2 ? "done" : "missed", value: null },
          h2: { status: "done", value: null },
        })
      );
    }

    (_setMockState as (state: unknown) => void)({
      totalXp: 0,
      currentLevel: 1,
      streaks: { prayer: 0, training: 7 },
      bareMinimumStreak: 0,
      logs,
      activeSprint: null,
      sprintHistory: [],
    });

    const weak = getWeakHabits(7);
    expect(weak).toHaveLength(1);
    expect(weak[0].habitId).toBe("h1");
    expect(weak[0].completionRate).toBeCloseTo(2 / 7, 2);
    expect(weak[0].daysMissed).toBe(5);
  });

  it("only checks binary-like habits, not measured", () => {
    const today = new Date();
    const logs = [];
    // All habits missed
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      logs.push(
        makeDayLog(d.toISOString().slice(0, 10), {
          h1: { status: "missed", value: null },
          h2: { status: "missed", value: null },
          h3: { status: "missed", value: 0 }, // measured — should be skipped
        })
      );
    }

    (_setMockState as (state: unknown) => void)({
      totalXp: 0,
      currentLevel: 1,
      streaks: {},
      bareMinimumStreak: 0,
      logs,
      activeSprint: null,
      sprintHistory: [],
    });

    const weak = getWeakHabits(7);
    // Should only have h1 and h2, not h3
    const ids = weak.map((w) => w.habitId);
    expect(ids).toContain("h1");
    expect(ids).toContain("h2");
    expect(ids).not.toContain("h3");
  });

  it("sorts by worst completion rate first", () => {
    const today = new Date();
    const logs = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      logs.push(
        makeDayLog(d.toISOString().slice(0, 10), {
          h1: { status: i < 2 ? "done" : "missed", value: null }, // 2/7 ≈ 28%
          h2: { status: i < 1 ? "done" : "missed", value: null }, // 1/7 ≈ 14%
        })
      );
    }

    (_setMockState as (state: unknown) => void)({
      totalXp: 0,
      currentLevel: 1,
      streaks: { prayer: 0, training: 0 },
      bareMinimumStreak: 0,
      logs,
      activeSprint: null,
      sprintHistory: [],
    });

    const weak = getWeakHabits(7);
    expect(weak).toHaveLength(2);
    expect(weak[0].habitId).toBe("h2"); // worse rate first
    expect(weak[1].habitId).toBe("h1");
  });

  it("detects broken streaks", () => {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const logs = [
      // One historical "done" entry, then nothing recently
      makeDayLog(twoDaysAgo.toISOString().slice(0, 10), {
        h1: { status: "done", value: null },
      }),
    ];

    (_setMockState as (state: unknown) => void)({
      totalXp: 0,
      currentLevel: 1,
      streaks: { prayer: 0 }, // streak is 0 now
      bareMinimumStreak: 0,
      logs,
      activeSprint: null,
      sprintHistory: [],
    });

    const weak = getWeakHabits(7);
    const prayerWeak = weak.find((w) => w.habitId === "h1");
    expect(prayerWeak).toBeDefined();
    expect(prayerWeak!.isBrokenStreak).toBe(true);
  });
});

describe("isHabitWeak", () => {
  it("returns true for a weak habit", () => {
    const today = new Date();
    const logs = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      logs.push(
        makeDayLog(d.toISOString().slice(0, 10), {
          h1: { status: "missed", value: null },
          h2: { status: "done", value: null },
        })
      );
    }

    (_setMockState as (state: unknown) => void)({
      totalXp: 0,
      currentLevel: 1,
      streaks: { prayer: 0, training: 7 },
      bareMinimumStreak: 0,
      logs,
      activeSprint: null,
      sprintHistory: [],
    });

    expect(isHabitWeak("h1")).toBe(true);
    expect(isHabitWeak("h2")).toBe(false);
  });
});
