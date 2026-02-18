import { describe, it, expect } from "vitest";
import {
  HABITS,
  HABIT_LEVELS,
  XP_VALUES,
  getFlameIcon,
  getHabitsByStack,
  getHabitLevel,
  DEFAULT_QUOTES,
} from "../habits";

// ─── Static Data Integrity ────────────────────────────────

describe("HABITS", () => {
  it("has the expected total count", () => {
    expect(HABITS.length).toBeGreaterThanOrEqual(20);
  });

  it("has binary, measured, and bad categories", () => {
    const categories = new Set(HABITS.map((h) => h.category));
    expect(categories.has("binary")).toBe(true);
    expect(categories.has("measured")).toBe(true);
    expect(categories.has("bad")).toBe(true);
  });

  it("all habits have unique IDs", () => {
    const ids = HABITS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all habits have unique slugs", () => {
    const slugs = HABITS.map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all habits have a stack assigned", () => {
    for (const h of HABITS) {
      expect(["morning", "midday", "evening"]).toContain(h.stack);
    }
  });

  it("all habits have an icon", () => {
    for (const h of HABITS) {
      expect(h.icon).toBeTruthy();
    }
  });
});

// ─── HABIT_LEVELS ─────────────────────────────────────────

describe("HABIT_LEVELS", () => {
  it("has levels for multiple habits", () => {
    const habitIds = new Set(HABIT_LEVELS.map((hl) => hl.habit_id));
    expect(habitIds.size).toBeGreaterThanOrEqual(5);
  });

  it("each habit has levels 1-4", () => {
    const byHabit = new Map<string, number[]>();
    for (const hl of HABIT_LEVELS) {
      if (!byHabit.has(hl.habit_id)) byHabit.set(hl.habit_id, []);
      byHabit.get(hl.habit_id)!.push(hl.level);
    }
    for (const [, levels] of byHabit) {
      expect(levels.sort()).toEqual([1, 2, 3, 4]);
    }
  });
});

// ─── XP_VALUES ────────────────────────────────────────────

describe("XP_VALUES", () => {
  it("has positive XP for all reward types", () => {
    for (const [, value] of Object.entries(XP_VALUES)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it("bare minimum XP is less than stretch XP", () => {
    expect(XP_VALUES.BARE_MINIMUM_HABIT).toBeLessThan(XP_VALUES.STRETCH_HABIT);
  });

  it("perfect day XP is the highest daily reward", () => {
    expect(XP_VALUES.PERFECT_DAY).toBeGreaterThan(XP_VALUES.ALL_BARE_MINIMUM);
  });
});

// ─── getFlameIcon ─────────────────────────────────────────

describe("getFlameIcon", () => {
  it("returns skull for 0 days", () => {
    expect(getFlameIcon(0)).toBe("💀");
  });

  it("returns candle for 1-3 days", () => {
    expect(getFlameIcon(1)).toBe("🕯️");
    expect(getFlameIcon(3)).toBe("🕯️");
  });

  it("returns single fire for 4-7 days", () => {
    expect(getFlameIcon(4)).toBe("🔥");
    expect(getFlameIcon(7)).toBe("🔥");
  });

  it("returns double fire for 8-14 days", () => {
    expect(getFlameIcon(8)).toBe("🔥🔥");
    expect(getFlameIcon(14)).toBe("🔥🔥");
  });

  it("returns triple fire for 15-30 days", () => {
    expect(getFlameIcon(15)).toBe("🔥🔥🔥");
    expect(getFlameIcon(30)).toBe("🔥🔥🔥");
  });

  it("returns diamond fire for 31-60 days", () => {
    expect(getFlameIcon(31)).toBe("💎🔥");
    expect(getFlameIcon(60)).toBe("💎🔥");
  });

  it("returns star fire for 61-90 days", () => {
    expect(getFlameIcon(61)).toBe("⭐🔥");
    expect(getFlameIcon(90)).toBe("⭐🔥");
  });

  it("returns crown fire for 91+ days", () => {
    expect(getFlameIcon(91)).toBe("👑🔥");
    expect(getFlameIcon(365)).toBe("👑🔥");
  });
});

// ─── getHabitsByStack ─────────────────────────────────────

describe("getHabitsByStack", () => {
  it("returns only morning habits for morning stack", () => {
    const morning = getHabitsByStack("morning");
    for (const h of morning) {
      expect(h.stack).toBe("morning");
      expect(h.is_active).toBe(true);
    }
    expect(morning.length).toBeGreaterThan(0);
  });

  it("returns only midday habits for midday stack", () => {
    const midday = getHabitsByStack("midday");
    for (const h of midday) {
      expect(h.stack).toBe("midday");
    }
    expect(midday.length).toBeGreaterThan(0);
  });

  it("returns only evening habits for evening stack", () => {
    const evening = getHabitsByStack("evening");
    for (const h of evening) {
      expect(h.stack).toBe("evening");
    }
    expect(evening.length).toBeGreaterThan(0);
  });

  it("does not include inactive habits", () => {
    const all = [
      ...getHabitsByStack("morning"),
      ...getHabitsByStack("midday"),
      ...getHabitsByStack("evening"),
    ];
    for (const h of all) {
      expect(h.is_active).toBe(true);
    }
  });
});

// ─── getHabitLevel ────────────────────────────────────────

describe("getHabitLevel", () => {
  const prayerHabitId = "10000000-0000-0000-0000-000000000001";

  it("returns level definition for valid habit + level", () => {
    const level = getHabitLevel(prayerHabitId, 1);
    expect(level).toBeDefined();
    expect(level!.label).toBe("Pray (any length)");
  });

  it("returns undefined for invalid level", () => {
    expect(getHabitLevel(prayerHabitId, 99)).toBeUndefined();
  });

  it("returns undefined for invalid habit ID", () => {
    expect(getHabitLevel("nonexistent", 1)).toBeUndefined();
  });
});

// ─── DEFAULT_QUOTES ───────────────────────────────────────

describe("DEFAULT_QUOTES", () => {
  it("has quotes in multiple categories", () => {
    const categories = new Set(DEFAULT_QUOTES.map((q) => q.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it("all quotes have unique IDs", () => {
    const ids = DEFAULT_QUOTES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all quotes have non-empty text", () => {
    for (const q of DEFAULT_QUOTES) {
      expect(q.text.length).toBeGreaterThan(0);
    }
  });

  it("all quotes are marked as default", () => {
    for (const q of DEFAULT_QUOTES) {
      expect(q.isDefault).toBe(true);
    }
  });
});
