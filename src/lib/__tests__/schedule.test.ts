import { describe, it, expect } from "vitest";
import {
  formatTime24to12,
  isStackComplete,
  isStackAnswered,
  areAllStacksComplete,
  getLaterStacks,
  getStackLabel,
  getStackEmoji,
  STACK_ORDER,
} from "../schedule";
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

// ─── formatTime24to12 ────────────────────────────────────

describe("formatTime24to12", () => {
  it("converts midnight", () => {
    expect(formatTime24to12("00:00")).toBe("12:00 AM");
  });

  it("converts noon", () => {
    expect(formatTime24to12("12:00")).toBe("12:00 PM");
  });

  it("converts morning time", () => {
    expect(formatTime24to12("07:30")).toBe("7:30 AM");
  });

  it("converts afternoon time", () => {
    expect(formatTime24to12("14:45")).toBe("2:45 PM");
  });

  it("converts 11:59 PM", () => {
    expect(formatTime24to12("23:59")).toBe("11:59 PM");
  });

  it("converts 1 AM", () => {
    expect(formatTime24to12("01:00")).toBe("1:00 AM");
  });

  it("converts 1 PM", () => {
    expect(formatTime24to12("13:00")).toBe("1:00 PM");
  });
});

// ─── STACK_ORDER ──────────────────────────────────────────

describe("STACK_ORDER", () => {
  it("has 3 stacks in correct order", () => {
    expect(STACK_ORDER).toEqual(["morning", "midday", "evening"]);
  });
});

// ─── getStackLabel / getStackEmoji ────────────────────────

describe("getStackLabel", () => {
  it("returns correct labels", () => {
    expect(getStackLabel("morning")).toBe("Morning");
    expect(getStackLabel("midday")).toBe("Afternoon");
    expect(getStackLabel("evening")).toBe("Evening");
  });
});

describe("getStackEmoji", () => {
  it("returns correct emojis", () => {
    expect(getStackEmoji("morning")).toBe("🌅");
    expect(getStackEmoji("midday")).toBe("☀️");
    expect(getStackEmoji("evening")).toBe("🌙");
  });
});

// ─── getLaterStacks ───────────────────────────────────────

describe("getLaterStacks", () => {
  it("returns midday and evening for morning", () => {
    expect(getLaterStacks("morning")).toEqual(["midday", "evening"]);
  });

  it("returns evening for midday", () => {
    expect(getLaterStacks("midday")).toEqual(["evening"]);
  });

  it("returns empty for evening", () => {
    expect(getLaterStacks("evening")).toEqual([]);
  });
});

// ─── isStackComplete ──────────────────────────────────────

describe("isStackComplete", () => {
  const morningHabit1 = makeHabit({ id: "mh1", stack: "morning", category: "binary" });
  const morningHabit2 = makeHabit({ id: "mh2", stack: "morning", category: "binary" });
  const habits = [morningHabit1, morningHabit2];

  it("returns false when no log", () => {
    expect(isStackComplete("morning", undefined, habits)).toBe(false);
  });

  it("returns false when no habits answered", () => {
    const log = makeDayLog();
    expect(isStackComplete("morning", log, habits)).toBe(false);
  });

  it("returns false when only some habits answered", () => {
    const log = makeDayLog({
      entries: { mh1: { status: "done", value: null } },
    });
    expect(isStackComplete("morning", log, habits)).toBe(false);
  });

  it("returns true when all habits done or missed", () => {
    const log = makeDayLog({
      entries: {
        mh1: { status: "done", value: null },
        mh2: { status: "missed", value: null },
      },
    });
    expect(isStackComplete("morning", log, habits)).toBe(true);
  });

  it("returns false when habit is 'later' (not done/missed)", () => {
    const log = makeDayLog({
      entries: {
        mh1: { status: "done", value: null },
        mh2: { status: "later", value: null },
      },
    });
    expect(isStackComplete("morning", log, habits)).toBe(false);
  });

  it("ignores measured habits", () => {
    const measuredHabit = makeHabit({ id: "mm1", stack: "morning", category: "measured" });
    const log = makeDayLog({
      entries: {
        mh1: { status: "done", value: null },
        mh2: { status: "done", value: null },
      },
    });
    expect(isStackComplete("morning", log, [...habits, measuredHabit])).toBe(true);
  });

  it("returns false when stack has no active binary habits", () => {
    const log = makeDayLog();
    expect(isStackComplete("morning", log, [])).toBe(false);
  });
});

// ─── isStackAnswered ──────────────────────────────────────

describe("isStackAnswered", () => {
  const morningHabit1 = makeHabit({ id: "mh1", stack: "morning" });
  const morningHabit2 = makeHabit({ id: "mh2", stack: "morning" });
  const habits = [morningHabit1, morningHabit2];

  it("returns true when all habits are done, missed, or later", () => {
    const log = makeDayLog({
      entries: {
        mh1: { status: "done", value: null },
        mh2: { status: "later", value: null },
      },
    });
    expect(isStackAnswered("morning", log, habits)).toBe(true);
  });

  it("returns false when a habit has no entry", () => {
    const log = makeDayLog({
      entries: {
        mh1: { status: "done", value: null },
      },
    });
    expect(isStackAnswered("morning", log, habits)).toBe(false);
  });
});

// ─── areAllStacksComplete ─────────────────────────────────

describe("areAllStacksComplete", () => {
  it("returns true when all stacks are complete", () => {
    const habits = [
      makeHabit({ id: "m1", stack: "morning" }),
      makeHabit({ id: "d1", stack: "midday" }),
      makeHabit({ id: "e1", stack: "evening" }),
    ];
    const log = makeDayLog({
      entries: {
        m1: { status: "done", value: null },
        d1: { status: "done", value: null },
        e1: { status: "done", value: null },
      },
    });
    expect(areAllStacksComplete(log, habits)).toBe(true);
  });

  it("returns false when any stack is incomplete", () => {
    const habits = [
      makeHabit({ id: "m1", stack: "morning" }),
      makeHabit({ id: "d1", stack: "midday" }),
      makeHabit({ id: "e1", stack: "evening" }),
    ];
    const log = makeDayLog({
      entries: {
        m1: { status: "done", value: null },
        d1: { status: "done", value: null },
        // e1 not answered
      },
    });
    expect(areAllStacksComplete(log, habits)).toBe(false);
  });
});
