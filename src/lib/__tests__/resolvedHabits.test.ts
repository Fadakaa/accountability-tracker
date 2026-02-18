import { describe, it, expect } from "vitest";
import { getResolvedHabits, getResolvedHabitsByStack } from "../resolvedHabits";
import { HABITS } from "../habits";
import type { UserSettings } from "../store";
import type { HabitStack } from "@/types/database";

// ─── Test Helpers ─────────────────────────────────────────

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    habitOverrides: {},
    levelUpStates: {},
    checkinTimes: { morning: "07:00", midday: "13:00", evening: "21:00" },
    notificationSlots: [],
    customQuotes: [],
    hiddenQuoteIds: [],
    routineChains: { morning: [], midday: [], evening: [] },
    customHabits: [],
    ...overrides,
  };
}

// Use real habit IDs from the static HABITS array
const PRAYER_ID = "10000000-0000-0000-0000-000000000001"; // morning, sort_order 1
const BIBLE_ID  = "10000000-0000-0000-0000-000000000002"; // morning, sort_order 2
const JOURNAL_ID = "10000000-0000-0000-0000-000000000003"; // morning, sort_order 3
const TRAINING_ID = "10000000-0000-0000-0000-000000000007"; // evening, sort_order 9
const READING_ID = "10000000-0000-0000-0000-000000000008"; // evening, sort_order 10

// ─── sort_order override ──────────────────────────────────

describe("getResolvedHabits — sort_order override", () => {
  it("swaps two habits when both sort_orders are overridden atomically", () => {
    // This tests the fix: both overrides in a single settings object
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { sort_order: 2 },  // Prayer: 1 → 2
        [BIBLE_ID]:  { sort_order: 1 },  // Bible:  2 → 1
      },
    });
    const resolved = getResolvedHabits(false, null, settings);
    const prayer = resolved.find((h) => h.id === PRAYER_ID)!;
    const bible = resolved.find((h) => h.id === BIBLE_ID)!;
    expect(bible.sort_order).toBe(1);
    expect(prayer.sort_order).toBe(2);

    // Bible should come before Prayer in the sorted output
    const prayerIdx = resolved.indexOf(prayer);
    const bibleIdx = resolved.indexOf(bible);
    expect(bibleIdx).toBeLessThan(prayerIdx);
  });

  it("only one override means only one habit moves (the broken case)", () => {
    // If only one habit's sort_order changes, the other stays at its default
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { sort_order: 2 },  // Prayer: 1 → 2
        // Bible NOT overridden — stays at sort_order 2
      },
    });
    const resolved = getResolvedHabits(false, null, settings);
    const prayer = resolved.find((h) => h.id === PRAYER_ID)!;
    const bible = resolved.find((h) => h.id === BIBLE_ID)!;
    // Both have sort_order 2 now — order is indeterminate but both exist
    expect(prayer.sort_order).toBe(2);
    expect(bible.sort_order).toBe(2);
  });

  it("preserves other habits sort_order when two are swapped", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { sort_order: 2 },
        [BIBLE_ID]:  { sort_order: 1 },
      },
    });
    const resolved = getResolvedHabits(false, null, settings);
    const journal = resolved.find((h) => h.id === JOURNAL_ID)!;
    // Journal was not overridden — should keep sort_order 3
    expect(journal.sort_order).toBe(3);
  });
});

// ─── stack override ───────────────────────────────────────

describe("getResolvedHabits — stack override", () => {
  it("moves a habit to a different stack", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { stack: "evening" as HabitStack, sort_order: 99 },
      },
    });

    const morningHabits = getResolvedHabitsByStack("morning", null, settings);
    const eveningHabits = getResolvedHabitsByStack("evening", null, settings);

    expect(morningHabits.find((h) => h.id === PRAYER_ID)).toBeUndefined();
    expect(eveningHabits.find((h) => h.id === PRAYER_ID)).toBeDefined();
  });

  it("places moved habit at end of target stack with high sort_order", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { stack: "evening" as HabitStack, sort_order: 99 },
      },
    });

    const eveningHabits = getResolvedHabitsByStack("evening", null, settings);
    const prayer = eveningHabits.find((h) => h.id === PRAYER_ID)!;
    // Prayer should be last in the evening stack (sort_order 99 > all others)
    expect(eveningHabits[eveningHabits.length - 1].id).toBe(PRAYER_ID);
    expect(prayer.stack).toBe("evening");
  });
});

// ─── is_active override (archive/restore) ─────────────────

describe("getResolvedHabits — is_active override", () => {
  it("archives a habit by setting is_active to false", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { is_active: false },
      },
    });

    const active = getResolvedHabits(false, null, settings);
    const all = getResolvedHabits(true, null, settings);

    expect(active.find((h) => h.id === PRAYER_ID)).toBeUndefined();
    expect(all.find((h) => h.id === PRAYER_ID)).toBeDefined();
    expect(all.find((h) => h.id === PRAYER_ID)!.isRetired).toBe(true);
  });

  it("restores an archived habit by setting is_active to true", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { is_active: true },
      },
    });

    const active = getResolvedHabits(false, null, settings);
    expect(active.find((h) => h.id === PRAYER_ID)).toBeDefined();
    expect(active.find((h) => h.id === PRAYER_ID)!.is_active).toBe(true);
  });
});

// ─── combined overrides ───────────────────────────────────

describe("getResolvedHabits — combined overrides", () => {
  it("applies multiple override fields simultaneously", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: {
          stack: "midday" as HabitStack,
          sort_order: 50,
          is_bare_minimum: false,
        },
      },
    });

    const resolved = getResolvedHabits(false, null, settings);
    const prayer = resolved.find((h) => h.id === PRAYER_ID)!;

    expect(prayer.stack).toBe("midday");
    expect(prayer.sort_order).toBe(50);
    expect(prayer.is_bare_minimum).toBe(false);
  });

  it("multiple habits can be overridden independently", () => {
    const settings = makeSettings({
      habitOverrides: {
        [PRAYER_ID]: { sort_order: 10 },
        [BIBLE_ID]:  { sort_order: 1 },
        [TRAINING_ID]: { stack: "morning" as HabitStack, sort_order: 0 },
      },
    });

    const resolved = getResolvedHabits(false, null, settings);
    const prayer = resolved.find((h) => h.id === PRAYER_ID)!;
    const bible = resolved.find((h) => h.id === BIBLE_ID)!;
    const training = resolved.find((h) => h.id === TRAINING_ID)!;

    expect(prayer.sort_order).toBe(10);
    expect(bible.sort_order).toBe(1);
    expect(training.stack).toBe("morning");
    expect(training.sort_order).toBe(0);

    // Training should be first in the resolved list (sort_order 0)
    expect(resolved[0].id).toBe(TRAINING_ID);
  });
});
