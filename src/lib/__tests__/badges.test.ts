import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  BADGES,
  BADGE_MAP,
  evaluateNewBadges,
  getBadgeCounts,
} from "../badges";
import type { BadgeContext, BadgeCategory, BadgeDef } from "../badges";
import type { LocalState, DayLog, SprintData, WrapReflection } from "../store";
import { HABITS } from "../habits";

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

function makeCtx(
  overrides: Partial<BadgeContext> & { state?: Partial<LocalState> } = {}
): BadgeContext {
  const { state: stateOverrides, ...rest } = overrides;
  return {
    state: makeState(stateOverrides),
    earnedBadgeIds: new Set(),
    ...rest,
  };
}

/** Generate an ISO date string offset by N days from a base date */
function dateOffset(base: string, days: number): string {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build N consecutive day logs starting from a base date */
function makeConsecutiveLogs(
  n: number,
  baseDate: string,
  logOverrides: Partial<DayLog> | ((i: number, date: string) => Partial<DayLog>) = {}
): DayLog[] {
  const logs: DayLog[] = [];
  for (let i = 0; i < n; i++) {
    const date = dateOffset(baseDate, i);
    const overrides = typeof logOverrides === "function" ? logOverrides(i, date) : logOverrides;
    logs.push(makeDayLog({ date, ...overrides }));
  }
  return logs;
}

function makeSprint(overrides: Partial<SprintData> = {}): SprintData {
  return {
    id: "sprint-1",
    name: "Test Sprint",
    intensity: "moderate",
    startDate: "2025-01-01",
    deadline: "2025-01-14",
    status: "completed",
    tasks: [],
    bareMinimumDaysMet: 10,
    completedAt: "2025-01-14T12:00:00Z",
    ...overrides,
  };
}

function makeReflection(overrides: Partial<WrapReflection> = {}): WrapReflection {
  return {
    id: "ref-1",
    date: "2025-01-15",
    period: "weekly",
    question: "How did you do?",
    answer: "Pretty good.",
    ...overrides,
  };
}

// Look up actual habit IDs from the HABITS array
const prayerHabit = HABITS.find((h) => h.slug === "prayer")!;
const bibleChaptersHabit = HABITS.find((h) => h.slug === "bible-chapters")!;
const trainingMinutesHabit = HABITS.find((h) => h.slug === "training-minutes")!;
const deepWorkHabit = HABITS.find((h) => h.slug === "deep-work")!;
const trainingHabit = HABITS.find((h) => h.slug === "training")!;
const energyLevelHabit = HABITS.find((h) => h.slug === "energy-level")!;
const leagueHabit = HABITS.find((h) => h.slug === "league")!;

// A binary-like habit for never-miss-twice testing
const binaryHabitForNMT = HABITS.find(
  (h) => (h.category === "binary" || h.category === "manual-skill") && h.is_active
)!;

function badgeIds(badges: BadgeDef[]): string[] {
  return badges.map((b) => b.id).sort();
}

// ─── BADGES Static Data ──────────────────────────────────

describe("BADGES static data", () => {
  it("contains exactly 39 badge definitions", () => {
    expect(BADGES).toHaveLength(39);
  });

  it("all badge IDs are unique", () => {
    const ids = BADGES.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every badge has all required fields", () => {
    for (const badge of BADGES) {
      expect(badge.id).toBeTruthy();
      expect(badge.name).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(badge.category).toBeTruthy();
      expect(badge.icon).toBeTruthy();
      expect(typeof badge.isHidden).toBe("boolean");
      expect(badge.hint).toBeTruthy();
    }
  });

  it("categories are all valid", () => {
    const validCategories: BadgeCategory[] = [
      "consistency",
      "volume",
      "special",
      "hidden",
      "sprint",
      "review",
    ];
    for (const badge of BADGES) {
      expect(validCategories).toContain(badge.category);
    }
  });

  it("hidden badges have isHidden = true", () => {
    const hiddenBadges = BADGES.filter((b) => b.category === "hidden");
    for (const b of hiddenBadges) {
      expect(b.isHidden).toBe(true);
    }
  });

  it("non-hidden badges have isHidden = false", () => {
    const nonHidden = BADGES.filter((b) => b.category !== "hidden");
    for (const b of nonHidden) {
      expect(b.isHidden).toBe(false);
    }
  });
});

// ─── BADGE_MAP ───────────────────────────────────────────

describe("BADGE_MAP", () => {
  it("has the same count as BADGES", () => {
    expect(BADGE_MAP.size).toBe(BADGES.length);
  });

  it("maps each badge ID to the correct badge", () => {
    for (const badge of BADGES) {
      expect(BADGE_MAP.get(badge.id)).toBe(badge);
    }
  });

  it("returns undefined for unknown IDs", () => {
    expect(BADGE_MAP.get("nonexistent-badge")).toBeUndefined();
  });
});

// ─── getBadgeCounts ──────────────────────────────────────

describe("getBadgeCounts", () => {
  it("returns all zeros for empty earned set", () => {
    const counts = getBadgeCounts(new Set());
    for (const cat of Object.keys(counts) as BadgeCategory[]) {
      expect(counts[cat].earned).toBe(0);
      expect(counts[cat].total).toBeGreaterThan(0);
    }
  });

  it("returns correct totals per category", () => {
    const counts = getBadgeCounts(new Set());
    const expectedTotals: Record<BadgeCategory, number> = {
      consistency: 0,
      volume: 0,
      special: 0,
      hidden: 0,
      sprint: 0,
      review: 0,
    };
    for (const badge of BADGES) {
      expectedTotals[badge.category]++;
    }
    for (const cat of Object.keys(expectedTotals) as BadgeCategory[]) {
      expect(counts[cat].total).toBe(expectedTotals[cat]);
    }
  });

  it("counts earned badges correctly for a partial set", () => {
    const earned = new Set(["first-day", "streak-7", "xp-10k"]);
    const counts = getBadgeCounts(earned);
    // first-day and streak-7 are consistency
    expect(counts.consistency.earned).toBe(2);
    // xp-10k is volume
    expect(counts.volume.earned).toBe(1);
    // others should be 0
    expect(counts.special.earned).toBe(0);
    expect(counts.hidden.earned).toBe(0);
    expect(counts.sprint.earned).toBe(0);
    expect(counts.review.earned).toBe(0);
  });

  it("counts all badges earned for a full set", () => {
    const allIds = new Set(BADGES.map((b) => b.id));
    const counts = getBadgeCounts(allIds);
    for (const cat of Object.keys(counts) as BadgeCategory[]) {
      expect(counts[cat].earned).toBe(counts[cat].total);
    }
  });
});

// ─── evaluateNewBadges ───────────────────────────────────

describe("evaluateNewBadges", () => {
  // ─── Empty state ────────────────────────────────────────

  describe("empty state", () => {
    it("awards no badges for completely empty state", () => {
      const ctx = makeCtx();
      const result = evaluateNewBadges(ctx);
      expect(result).toHaveLength(0);
    });
  });

  // ─── Consistency Badges ─────────────────────────────────

  describe("consistency — first-day", () => {
    it("awards first-day when logs has at least one entry", () => {
      const ctx = makeCtx({ state: { logs: [makeDayLog()] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "first-day")).toBe(true);
    });

    it("does NOT award first-day with empty logs", () => {
      const ctx = makeCtx({ state: { logs: [] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "first-day")).toBe(false);
    });
  });

  describe("consistency — streak milestones", () => {
    const milestones = [
      { threshold: 7, id: "streak-7" },
      { threshold: 14, id: "streak-14" },
      { threshold: 30, id: "streak-30" },
      { threshold: 60, id: "streak-60" },
      { threshold: 90, id: "streak-90" },
      { threshold: 365, id: "streak-365" },
    ];

    for (const { threshold, id } of milestones) {
      it("awards " + id + " when max streak = " + threshold, () => {
        const ctx = makeCtx({
          state: { streaks: { "some-habit": threshold } },
        });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === id)).toBe(true);
      });

      it("does NOT award " + id + " when max streak = " + (threshold - 1), () => {
        const ctx = makeCtx({
          state: { streaks: { "some-habit": threshold - 1 } },
        });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === id)).toBe(false);
      });
    }

    it("awards multiple streak badges at once if streak is high enough", () => {
      const ctx = makeCtx({
        state: { streaks: { "some-habit": 100 } },
      });
      const result = evaluateNewBadges(ctx);
      const streakBadgeIds = result
        .filter((b) => b.id.startsWith("streak-"))
        .map((b) => b.id);
      expect(streakBadgeIds).toContain("streak-7");
      expect(streakBadgeIds).toContain("streak-14");
      expect(streakBadgeIds).toContain("streak-30");
      expect(streakBadgeIds).toContain("streak-60");
      expect(streakBadgeIds).toContain("streak-90");
      expect(streakBadgeIds).not.toContain("streak-365");
    });

    it("uses the max across all habits", () => {
      const ctx = makeCtx({
        state: {
          streaks: { "habit-a": 3, "habit-b": 14, "habit-c": 1 },
        },
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "streak-7")).toBe(true);
      expect(result.some((b) => b.id === "streak-14")).toBe(true);
      expect(result.some((b) => b.id === "streak-30")).toBe(false);
    });
  });

  describe("consistency — never-miss-twice", () => {
    it("awards when a binary habit has done->missed->done on 3 consecutive days", () => {
      const habitId = binaryHabitForNMT.id;
      const logs = [
        makeDayLog({
          date: "2025-01-10",
          entries: { [habitId]: { status: "done", value: null } },
        }),
        makeDayLog({
          date: "2025-01-11",
          entries: { [habitId]: { status: "missed", value: null } },
        }),
        makeDayLog({
          date: "2025-01-12",
          entries: { [habitId]: { status: "done", value: null } },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "never-miss-twice")).toBe(true);
    });

    it("does NOT award when dates are not consecutive", () => {
      const habitId = binaryHabitForNMT.id;
      const logs = [
        makeDayLog({
          date: "2025-01-10",
          entries: { [habitId]: { status: "done", value: null } },
        }),
        makeDayLog({
          date: "2025-01-12",
          entries: { [habitId]: { status: "missed", value: null } },
        }),
        makeDayLog({
          date: "2025-01-13",
          entries: { [habitId]: { status: "done", value: null } },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "never-miss-twice")).toBe(false);
    });

    it("does NOT award when pattern is done->done->done", () => {
      const habitId = binaryHabitForNMT.id;
      const logs = [
        makeDayLog({
          date: "2025-01-10",
          entries: { [habitId]: { status: "done", value: null } },
        }),
        makeDayLog({
          date: "2025-01-11",
          entries: { [habitId]: { status: "done", value: null } },
        }),
        makeDayLog({
          date: "2025-01-12",
          entries: { [habitId]: { status: "done", value: null } },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "never-miss-twice")).toBe(false);
    });

    it("does NOT award with fewer than 3 logs", () => {
      const habitId = binaryHabitForNMT.id;
      const logs = [
        makeDayLog({
          date: "2025-01-10",
          entries: { [habitId]: { status: "done", value: null } },
        }),
        makeDayLog({
          date: "2025-01-11",
          entries: { [habitId]: { status: "missed", value: null } },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "never-miss-twice")).toBe(false);
    });
  });

  // ─── Volume Badges ──────────────────────────────────────

  describe("volume — bible-100", () => {
    it("awards when total bible chapters >= 100", () => {
      const logs = Array.from({ length: 50 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [bibleChaptersHabit.id]: { status: "done", value: 2 },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bible-100")).toBe(true);
    });

    it("does NOT award when total bible chapters < 100", () => {
      const logs = Array.from({ length: 49 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [bibleChaptersHabit.id]: { status: "done", value: 2 },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bible-100")).toBe(false);
    });

    it("sums chapters across all logs", () => {
      const logs = [
        makeDayLog({
          date: "2025-01-01",
          entries: {
            [bibleChaptersHabit.id]: { status: "done", value: 60 },
          },
        }),
        makeDayLog({
          date: "2025-01-02",
          entries: {
            [bibleChaptersHabit.id]: { status: "done", value: 40 },
          },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bible-100")).toBe(true);
    });
  });

  describe("volume — training-1000", () => {
    it("awards when total training minutes >= 1000", () => {
      const logs = Array.from({ length: 20 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [trainingMinutesHabit.id]: { status: "done", value: 50 },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "training-1000")).toBe(true);
    });

    it("does NOT award when total training minutes < 1000", () => {
      const logs = Array.from({ length: 19 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [trainingMinutesHabit.id]: { status: "done", value: 50 },
          },
        })
      );
      // 19 * 50 = 950
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "training-1000")).toBe(false);
    });
  });

  describe("volume — deep-work-50", () => {
    it("awards when total deep work blocks >= 50", () => {
      const logs = Array.from({ length: 25 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [deepWorkHabit.id]: { status: "done", value: 2 },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "deep-work-50")).toBe(true);
    });

    it("does NOT award when total deep work blocks < 50", () => {
      const logs = Array.from({ length: 24 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [deepWorkHabit.id]: { status: "done", value: 2 },
          },
        })
      );
      // 24 * 2 = 48
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "deep-work-50")).toBe(false);
    });
  });

  describe("volume — prayers-100", () => {
    it("awards when prayer status is done 100+ times", () => {
      const logs = Array.from({ length: 100 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [prayerHabit.id]: { status: "done", value: null },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "prayers-100")).toBe(true);
    });

    it("does NOT count missed status towards prayer count", () => {
      const logs = Array.from({ length: 100 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          entries: {
            [prayerHabit.id]: { status: i < 99 ? "done" : "missed", value: null },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      // 99 done + 1 missed = 99 prayers
      expect(result.some((b) => b.id === "prayers-100")).toBe(false);
    });
  });

  describe("volume — XP milestones", () => {
    it("awards xp-10k at 10000 totalXp", () => {
      const ctx = makeCtx({ state: { totalXp: 10000 } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "xp-10k")).toBe(true);
    });

    it("does NOT award xp-10k at 9999 totalXp", () => {
      const ctx = makeCtx({ state: { totalXp: 9999 } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "xp-10k")).toBe(false);
    });

    it("awards xp-50k at 50000 totalXp", () => {
      const ctx = makeCtx({ state: { totalXp: 50000 } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "xp-50k")).toBe(true);
    });

    it("does NOT award xp-50k at 49999 totalXp", () => {
      const ctx = makeCtx({ state: { totalXp: 49999 } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "xp-50k")).toBe(false);
    });

    it("awards both xp-10k and xp-50k at 50000", () => {
      const ctx = makeCtx({ state: { totalXp: 50000 } });
      const result = evaluateNewBadges(ctx);
      const xpBadges = result.filter((b) => b.id.startsWith("xp-"));
      expect(xpBadges).toHaveLength(2);
    });
  });

  // ─── Special Badges ─────────────────────────────────────

  describe("special — bare-minimum-hero", () => {
    it("awards when bareMinimumStreak >= 30", () => {
      const ctx = makeCtx({ state: { bareMinimumStreak: 30 } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bare-minimum-hero")).toBe(true);
    });

    it("does NOT award when bareMinimumStreak = 29", () => {
      const ctx = makeCtx({ state: { bareMinimumStreak: 29 } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bare-minimum-hero")).toBe(false);
    });
  });

  describe("special — the-comeback", () => {
    it("awards when there is a 7+ day gap between logs", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-09" }), // 8-day gap
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-comeback")).toBe(true);
    });

    it("awards on exactly 7-day gap", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-08" }), // exactly 7 days
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-comeback")).toBe(true);
    });

    it("does NOT award when gap is only 6 days", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-07" }), // 6-day gap
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-comeback")).toBe(false);
    });

    it("does NOT award with only one log", () => {
      const ctx = makeCtx({ state: { logs: [makeDayLog()] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-comeback")).toBe(false);
    });
  });

  describe("special — the-observer", () => {
    it("awards when a bad habit is honestly logged 30+ times", () => {
      const logs = Array.from({ length: 30 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          badEntries: {
            [leagueHabit.id]: { occurred: true, durationMinutes: 60 },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-observer")).toBe(true);
    });

    it("does NOT award when bad habit logged only 29 times", () => {
      const logs = Array.from({ length: 29 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          badEntries: {
            [leagueHabit.id]: { occurred: true, durationMinutes: 60 },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-observer")).toBe(false);
    });

    it("does NOT count days where occurred = false", () => {
      const logs = Array.from({ length: 35 }, (_, i) =>
        makeDayLog({
          date: dateOffset("2025-01-01", i),
          badEntries: {
            [leagueHabit.id]: {
              occurred: i < 29, // only 29 true occurrences
              durationMinutes: 60,
            },
          },
        })
      );
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-observer")).toBe(false);
    });
  });

  describe("special — level-up-accepted", () => {
    it("awards when hasAcceptedLevelUp is true", () => {
      const ctx = makeCtx({ hasAcceptedLevelUp: true });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "level-up-accepted")).toBe(true);
    });

    it("does NOT award when hasAcceptedLevelUp is false", () => {
      const ctx = makeCtx({ hasAcceptedLevelUp: false });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "level-up-accepted")).toBe(false);
    });

    it("does NOT award when hasAcceptedLevelUp is undefined", () => {
      const ctx = makeCtx();
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "level-up-accepted")).toBe(false);
    });
  });

  describe("special — bad-day-champion", () => {
    it("awards when bareMinimumMet on a day with energy 1/5", () => {
      const logs = [
        makeDayLog({
          date: "2025-01-15",
          bareMinimumMet: true,
          entries: {
            [energyLevelHabit.id]: { status: "done", value: 1 },
          },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bad-day-champion")).toBe(true);
    });

    it("does NOT award when energy is 2/5", () => {
      const logs = [
        makeDayLog({
          date: "2025-01-15",
          bareMinimumMet: true,
          entries: {
            [energyLevelHabit.id]: { status: "done", value: 2 },
          },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bad-day-champion")).toBe(false);
    });

    it("does NOT award when bareMinimumMet is false", () => {
      const logs = [
        makeDayLog({
          date: "2025-01-15",
          bareMinimumMet: false,
          entries: {
            [energyLevelHabit.id]: { status: "done", value: 1 },
          },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bad-day-champion")).toBe(false);
    });
  });

  // ─── Date-dependent badges (using fake timers) ─────────

  describe("date-dependent badges", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T10:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe("special — perfect-week", () => {
      it("awards when 7 consecutive days (last 7 calendar days) all have bareMinimumMet", () => {
        // With system time at 2025-01-15, last 7 days are Jan 9-15
        const logs = makeConsecutiveLogs(7, "2025-01-09", { bareMinimumMet: true });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "perfect-week")).toBe(true);
      });

      it("does NOT award when only 6 of 7 days have logs", () => {
        const logs = makeConsecutiveLogs(6, "2025-01-10", { bareMinimumMet: true });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "perfect-week")).toBe(false);
      });

      it("does NOT award when one day has bareMinimumMet = false", () => {
        const logs = makeConsecutiveLogs(7, "2025-01-09", (i) => ({
          bareMinimumMet: i !== 3, // day 4 misses
        }));
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "perfect-week")).toBe(false);
      });
    });

    describe("special — perfect-month", () => {
      it("awards when 28+ days in last 30 calendar days all have bareMinimumMet", () => {
        // Last 30 days from Jan 15 = Dec 17 to Jan 15
        const logs = makeConsecutiveLogs(30, "2024-12-17", { bareMinimumMet: true });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "perfect-month")).toBe(true);
      });

      it("does NOT award when fewer than 28 days have logs", () => {
        const logs = makeConsecutiveLogs(27, "2024-12-19", { bareMinimumMet: true });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "perfect-month")).toBe(false);
      });
    });

    describe("special — clean-week", () => {
      it("awards when 7 days have no bad habits occurred", () => {
        const logs = makeConsecutiveLogs(7, "2025-01-09", {
          badEntries: {
            [leagueHabit.id]: { occurred: false, durationMinutes: null },
          },
        });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "clean-week")).toBe(true);
      });

      it("awards when 7 days have empty badEntries", () => {
        const logs = makeConsecutiveLogs(7, "2025-01-09", {
          badEntries: {},
        });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "clean-week")).toBe(true);
      });

      it("does NOT award when any day has a bad habit occurred", () => {
        const logs = makeConsecutiveLogs(7, "2025-01-09", (i) => ({
          badEntries: {
            [leagueHabit.id]: {
              occurred: i === 3, // day 4 has a bad habit
              durationMinutes: i === 3 ? 60 : null,
            },
          },
        }));
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "clean-week")).toBe(false);
      });
    });

    describe("special — dawn-warrior", () => {
      it("awards when 7 consecutive days submitted before 8 AM", () => {
        const logs = makeConsecutiveLogs(7, "2025-01-09", (i, date) => ({
          submittedAt: date + "T06:30:00.000Z",
        }));
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "dawn-warrior")).toBe(true);
      });

      it("does NOT award when a submission is at 8 AM or later", () => {
        const logs = makeConsecutiveLogs(7, "2025-01-09", (i, date) => ({
          submittedAt:
            i === 3
              ? date + "T09:00:00.000Z" // one late submission
              : date + "T06:30:00.000Z",
        }));
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "dawn-warrior")).toBe(false);
      });
    });

    describe("special — iron-will", () => {
      it("awards when today log has all binary habits done (with 5+ binary habits)", () => {
        // Iron will checks today date (2025-01-15) for a log with all binary habits done
        const activeBinaryHabits = HABITS.filter(
          (h) =>
            (h.category === "binary" || h.category === "manual-skill") &&
            h.is_active
        );
        const entries: Record<string, { status: "done"; value: null }> = {};
        for (const h of activeBinaryHabits) {
          entries[h.id] = { status: "done", value: null };
        }
        const logs = [makeDayLog({ date: "2025-01-15", entries })];
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        // iron-will is awarded if all binary habits are done and count >= 5
        expect(result.some((b) => b.id === "iron-will")).toBe(true);
      });

      it("does NOT award when today has no log", () => {
        const logs = [makeDayLog({ date: "2025-01-14" })]; // yesterday
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "iron-will")).toBe(false);
      });
    });

    describe("hidden — the-machine", () => {
      it("awards when 28+ days in last 30 have no later entries", () => {
        const logs = makeConsecutiveLogs(30, "2024-12-17", {
          entries: {
            [prayerHabit.id]: { status: "done", value: null },
          },
        });
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "the-machine")).toBe(true);
      });

      it("does NOT award when any entry has later status", () => {
        const logs = makeConsecutiveLogs(30, "2024-12-17", (i) => ({
          entries: {
            [prayerHabit.id]: {
              status: i === 15 ? "later" : "done",
              value: null,
            },
          },
        }));
        const ctx = makeCtx({ state: { logs } });
        const result = evaluateNewBadges(ctx);
        expect(result.some((b) => b.id === "the-machine")).toBe(false);
      });
    });
  });

  // ─── Hidden Badges ──────────────────────────────────────

  describe("hidden — ghost", () => {
    it("awards when there is a 14+ day gap between logs", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-16" }), // 15-day gap
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "ghost")).toBe(true);
    });

    it("awards on exactly 14-day gap", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-15" }), // exactly 14 days
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "ghost")).toBe(true);
    });

    it("does NOT award when gap is only 13 days", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-14" }), // 13-day gap
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "ghost")).toBe(false);
    });

    it("also awards the-comeback when gap is 14+ days", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-16" }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      // Ghost requires 14, comeback requires 7 -- both should trigger
      expect(result.some((b) => b.id === "ghost")).toBe(true);
      expect(result.some((b) => b.id === "the-comeback")).toBe(true);
    });
  });

  // ─── Sprint Badges ─────────────────────────────────────

  describe("sprint — sprint-survivor", () => {
    it("awards when 1 completed sprint exists in sprintHistory", () => {
      const ctx = makeCtx({
        state: {
          sprintHistory: [makeSprint({ status: "completed" })],
        },
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-survivor")).toBe(true);
    });

    it("does NOT award when sprint is cancelled", () => {
      const ctx = makeCtx({
        state: {
          sprintHistory: [makeSprint({ status: "cancelled" })],
        },
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-survivor")).toBe(false);
    });

    it("does NOT award with empty sprintHistory", () => {
      const ctx = makeCtx({ state: { sprintHistory: [] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-survivor")).toBe(false);
    });
  });

  describe("sprint — sprint-master", () => {
    it("awards when 5 completed sprints exist", () => {
      const sprints = Array.from({ length: 5 }, (_, i) =>
        makeSprint({ id: "sprint-" + i, status: "completed" })
      );
      const ctx = makeCtx({ state: { sprintHistory: sprints } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-master")).toBe(true);
    });

    it("does NOT award with only 4 completed sprints", () => {
      const sprints = Array.from({ length: 4 }, (_, i) =>
        makeSprint({ id: "sprint-" + i, status: "completed" })
      );
      const ctx = makeCtx({ state: { sprintHistory: sprints } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-master")).toBe(false);
    });

    it("does NOT count cancelled sprints", () => {
      const sprints = [
        ...Array.from({ length: 4 }, (_, i) =>
          makeSprint({ id: "sprint-" + i, status: "completed" })
        ),
        makeSprint({ id: "sprint-4", status: "cancelled" }),
      ];
      const ctx = makeCtx({ state: { sprintHistory: sprints } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-master")).toBe(false);
    });
  });

  describe("sprint — sprint-under-fire", () => {
    it("awards when an intense sprint is completed with 80%+ bare minimum days", () => {
      const sprint = makeSprint({
        intensity: "intense",
        status: "completed",
        startDate: "2025-01-01",
        deadline: "2025-01-11", // 10 days
        bareMinimumDaysMet: 8, // 80%
      });
      const ctx = makeCtx({ state: { sprintHistory: [sprint] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-under-fire")).toBe(true);
    });

    it("does NOT award for moderate intensity sprint", () => {
      const sprint = makeSprint({
        intensity: "moderate",
        status: "completed",
        startDate: "2025-01-01",
        deadline: "2025-01-11",
        bareMinimumDaysMet: 10,
      });
      const ctx = makeCtx({ state: { sprintHistory: [sprint] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-under-fire")).toBe(false);
    });
  });

  describe("sprint — sprint-unbreakable", () => {
    it("awards when a critical sprint has 100% bare minimum", () => {
      const sprint = makeSprint({
        intensity: "critical",
        status: "completed",
        startDate: "2025-01-01",
        deadline: "2025-01-08", // 7 days
        bareMinimumDaysMet: 7,
      });
      const ctx = makeCtx({ state: { sprintHistory: [sprint] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-unbreakable")).toBe(true);
    });

    it("does NOT award when bare minimum days < total days", () => {
      const sprint = makeSprint({
        intensity: "critical",
        status: "completed",
        startDate: "2025-01-01",
        deadline: "2025-01-08",
        bareMinimumDaysMet: 6, // 6/7 = not 100%
      });
      const ctx = makeCtx({ state: { sprintHistory: [sprint] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "sprint-unbreakable")).toBe(false);
    });
  });

  // ─── Review Badges ─────────────────────────────────────

  describe("review — first-wrap", () => {
    it("awards when reflections has at least 1 entry", () => {
      const ctx = makeCtx({
        state: { reflections: [makeReflection()] },
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "first-wrap")).toBe(true);
    });

    it("awards when lastWrapDate is set (even without reflections)", () => {
      const ctx = makeCtx({
        state: { lastWrapDate: "2025-01-15" },
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "first-wrap")).toBe(true);
    });

    it("does NOT award with empty reflections and no lastWrapDate", () => {
      const ctx = makeCtx({ state: { reflections: [] } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "first-wrap")).toBe(false);
    });
  });

  describe("review — consistent-reviewer", () => {
    it("awards when 4+ weekly wraps exist", () => {
      const reflections = Array.from({ length: 4 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "weekly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "consistent-reviewer")).toBe(true);
    });

    it("does NOT award with only 3 weekly wraps", () => {
      const reflections = Array.from({ length: 3 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "weekly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "consistent-reviewer")).toBe(false);
    });

    it("does NOT count monthly wraps towards consistent-reviewer", () => {
      const reflections = Array.from({ length: 4 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "monthly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "consistent-reviewer")).toBe(false);
    });
  });

  describe("review — pattern-spotter", () => {
    it("awards when 12+ weekly wraps exist", () => {
      const reflections = Array.from({ length: 12 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "weekly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "pattern-spotter")).toBe(true);
    });

    it("does NOT award with only 11 weekly wraps", () => {
      const reflections = Array.from({ length: 11 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "weekly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "pattern-spotter")).toBe(false);
    });
  });

  describe("review — monthly-ritual", () => {
    it("awards when 3+ monthly wraps exist", () => {
      const reflections = Array.from({ length: 3 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "monthly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "monthly-ritual")).toBe(true);
    });

    it("does NOT award with only 2 monthly wraps", () => {
      const reflections = Array.from({ length: 2 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "monthly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "monthly-ritual")).toBe(false);
    });
  });

  describe("review — quarter-chronicler", () => {
    it("awards when 1+ quarterly wraps exist", () => {
      const reflections = [makeReflection({ period: "quarterly" })];
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "quarter-chronicler")).toBe(true);
    });
  });

  describe("review — year-one", () => {
    it("awards when 1+ yearly wraps exist", () => {
      const reflections = [makeReflection({ period: "yearly" })];
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "year-one")).toBe(true);
    });
  });

  describe("review — the-reflector", () => {
    it("awards when 50+ reflections exist", () => {
      const reflections = Array.from({ length: 50 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "weekly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-reflector")).toBe(true);
    });

    it("does NOT award with 49 reflections", () => {
      const reflections = Array.from({ length: 49 }, (_, i) =>
        makeReflection({ id: "ref-" + i, period: "weekly" })
      );
      const ctx = makeCtx({ state: { reflections } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-reflector")).toBe(false);
    });
  });

  // ─── Deduplication ─────────────────────────────────────

  describe("deduplication", () => {
    it("does NOT re-award badges already in earnedBadgeIds", () => {
      const ctx = makeCtx({
        state: { logs: [makeDayLog()], totalXp: 10000 },
        earnedBadgeIds: new Set(["first-day", "xp-10k"]),
      });
      const result = evaluateNewBadges(ctx);
      // first-day and xp-10k should not be re-awarded
      expect(result.some((b) => b.id === "first-day")).toBe(false);
      expect(result.some((b) => b.id === "xp-10k")).toBe(false);
    });

    it("awards other badges normally even when some are deduplicated", () => {
      const ctx = makeCtx({
        state: {
          logs: [makeDayLog()],
          totalXp: 10000,
          streaks: { prayer: 7 },
        },
        earnedBadgeIds: new Set(["first-day"]),
      });
      const result = evaluateNewBadges(ctx);
      // first-day is already earned -- not re-awarded
      expect(result.some((b) => b.id === "first-day")).toBe(false);
      // But streak-7 and xp-10k should be new
      expect(result.some((b) => b.id === "streak-7")).toBe(true);
      expect(result.some((b) => b.id === "xp-10k")).toBe(true);
    });

    it("deduplicates the-comeback when already earned", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-09" }),
      ];
      const ctx = makeCtx({
        state: { logs },
        earnedBadgeIds: new Set(["the-comeback"]),
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-comeback")).toBe(false);
    });

    it("deduplicates never-miss-twice when already earned", () => {
      const habitId = binaryHabitForNMT.id;
      const logs = [
        makeDayLog({
          date: "2025-01-10",
          entries: { [habitId]: { status: "done", value: null } },
        }),
        makeDayLog({
          date: "2025-01-11",
          entries: { [habitId]: { status: "missed", value: null } },
        }),
        makeDayLog({
          date: "2025-01-12",
          entries: { [habitId]: { status: "done", value: null } },
        }),
      ];
      const ctx = makeCtx({
        state: { logs },
        earnedBadgeIds: new Set(["never-miss-twice"]),
      });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "never-miss-twice")).toBe(false);
    });
  });

  // ─── Multiple badges at once ───────────────────────────

  describe("multiple badges at once", () => {
    it("can award badges from different categories simultaneously", () => {
      const logs = [
        makeDayLog({ date: "2025-01-01" }),
        makeDayLog({ date: "2025-01-09" }), // 8-day gap -> the-comeback
      ];
      const ctx = makeCtx({
        state: {
          logs,
          totalXp: 10000,
          streaks: { prayer: 14 },
          bareMinimumStreak: 30,
          sprintHistory: [makeSprint({ status: "completed" })],
          reflections: [makeReflection()],
        },
      });
      const result = evaluateNewBadges(ctx);
      const ids = badgeIds(result);
      expect(ids).toContain("first-day"); // consistency
      expect(ids).toContain("streak-7"); // consistency
      expect(ids).toContain("streak-14"); // consistency
      expect(ids).toContain("xp-10k"); // volume
      expect(ids).toContain("bare-minimum-hero"); // special
      expect(ids).toContain("the-comeback"); // special
      expect(ids).toContain("sprint-survivor"); // sprint
      expect(ids).toContain("first-wrap"); // review
    });
  });

  // ─── Edge cases ────────────────────────────────────────

  describe("edge cases", () => {
    it("handles state with undefined reflections", () => {
      const state = makeState();
      delete (state as Record<string, unknown>).reflections;
      const ctx: BadgeContext = { state, earnedBadgeIds: new Set() };
      // Should not throw
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "first-wrap")).toBe(false);
    });

    it("handles logs with null entry values gracefully", () => {
      const logs = [
        makeDayLog({
          date: "2025-01-01",
          entries: {
            [bibleChaptersHabit.id]: { status: "done", value: null },
          },
        }),
      ];
      const ctx = makeCtx({ state: { logs } });
      // Should not throw; null value treated as 0
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "bible-100")).toBe(false);
    });

    it("handles empty streaks object (max of empty set = 0)", () => {
      const ctx = makeCtx({ state: { streaks: {} } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "streak-7")).toBe(false);
    });

    it("handles unsorted logs correctly for comeback detection", () => {
      // Logs not in chronological order -- should still detect gap
      const logs = [
        makeDayLog({ date: "2025-01-15" }),
        makeDayLog({ date: "2025-01-01" }),
      ];
      const ctx = makeCtx({ state: { logs } });
      const result = evaluateNewBadges(ctx);
      expect(result.some((b) => b.id === "the-comeback")).toBe(true);
      expect(result.some((b) => b.id === "ghost")).toBe(true);
    });
  });
});
