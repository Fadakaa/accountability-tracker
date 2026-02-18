import { describe, it, expect } from "vitest";
import { buildExtractionPrompt } from "../gym/extractionPrompt";
import type { GymSessionLocal } from "../store";

// ─── Helpers ──────────────────────────────────────────────

/** Build a minimal valid GymSessionLocal for testing */
function makeSession(overrides: Partial<GymSessionLocal> = {}): GymSessionLocal {
  return {
    id: "sess-1",
    date: "2026-02-17",
    trainingType: "gym",
    muscleGroup: "Chest",
    durationMinutes: 60,
    rpe: 7,
    notes: "Felt good",
    justWalkedIn: false,
    exercises: [],
    createdAt: "2026-02-17T10:00:00Z",
    ...overrides,
  };
}

// ─── 1. Empty Inputs ─────────────────────────────────────

describe("buildExtractionPrompt — empty inputs", () => {
  it("includes fallback text when exercise library is empty and session is null", () => {
    const prompt = buildExtractionPrompt([], null);
    expect(prompt).toContain("No saved exercises yet.");
    expect(prompt).toContain("No previous session data available.");
  });

  it("includes fallback text when session has no exercises", () => {
    const session = makeSession({ exercises: [] });
    const prompt = buildExtractionPrompt([], session);
    expect(prompt).toContain("No previous session data available.");
  });
});

// ─── 2. With Exercise Library ─────────────────────────────

describe("buildExtractionPrompt — exercise library", () => {
  it("includes all exercise names from the library", () => {
    const library = ["Bench Press", "Squat", "Deadlift"];
    const prompt = buildExtractionPrompt(library, null);
    expect(prompt).toContain("Bench Press");
    expect(prompt).toContain("Squat");
    expect(prompt).toContain("Deadlift");
  });

  it("joins exercise names with commas", () => {
    const library = ["Bench Press", "Squat", "Deadlift"];
    const prompt = buildExtractionPrompt(library, null);
    expect(prompt).toContain("Bench Press, Squat, Deadlift");
  });

  it("does not show fallback text when library has exercises", () => {
    const library = ["Bench Press"];
    const prompt = buildExtractionPrompt(library, null);
    expect(prompt).not.toContain("No saved exercises yet.");
  });
});

// ─── 3. With Last Session ─────────────────────────────────

describe("buildExtractionPrompt — last session with exercises", () => {
  it("includes exercise names and set details from the session", () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Bench Press",
          sets: [
            { weightKg: 100, reps: 8, isFailure: false },
            { weightKg: 100, reps: 6, isFailure: false },
          ],
        },
        {
          id: "ex-2",
          name: "Incline Dumbbell Press",
          sets: [{ weightKg: 30, reps: 12, isFailure: false }],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    expect(prompt).toContain("Bench Press");
    expect(prompt).toContain("Incline Dumbbell Press");
    expect(prompt).toContain("100kg");
    expect(prompt).toContain("8 reps");
    expect(prompt).toContain("6 reps");
    expect(prompt).toContain("30kg");
    expect(prompt).toContain("12 reps");
  });

  it("does not show fallback text when session has exercises", () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Squat",
          sets: [{ weightKg: 80, reps: 5, isFailure: false }],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    expect(prompt).not.toContain("No previous session data available.");
  });

  it("labels sets with sequential numbers", () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Squat",
          sets: [
            { weightKg: 80, reps: 5, isFailure: false },
            { weightKg: 85, reps: 5, isFailure: false },
            { weightKg: 90, reps: 3, isFailure: false },
          ],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    expect(prompt).toContain("Set 1:");
    expect(prompt).toContain("Set 2:");
    expect(prompt).toContain("Set 3:");
  });
});

// ─── 4. Last Session with Null Weights ────────────────────

describe("buildExtractionPrompt — null weight handling", () => {
  it('shows "no weight" when weightKg is null', () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Pull-Up",
          sets: [{ weightKg: null, reps: 10, isFailure: false }],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    expect(prompt).toContain("no weight");
    expect(prompt).toContain("10 reps");
  });

  it('shows "?" when reps is null', () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Plank",
          sets: [{ weightKg: null, reps: null, isFailure: false }],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    expect(prompt).toContain("no weight");
    expect(prompt).toContain("? reps");
  });
});

// ─── 5. Last Session with Failure Sets ────────────────────

describe("buildExtractionPrompt — failure sets", () => {
  it('includes "(failure)" marker for failure sets', () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Bench Press",
          sets: [
            { weightKg: 100, reps: 8, isFailure: false },
            { weightKg: 100, reps: 6, isFailure: true },
          ],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    // The non-failure set should NOT have "(failure)"
    expect(prompt).toContain("Set 1: 100kg x 8 reps");
    expect(prompt).toMatch(/Set 1: 100kg x 8 reps[^(]*,/);
    // The failure set should have "(failure)"
    expect(prompt).toContain("Set 2: 100kg x 6 reps (failure)");
  });

  it("handles multiple failure sets across exercises", () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Squat",
          sets: [{ weightKg: 120, reps: 3, isFailure: true }],
        },
        {
          id: "ex-2",
          name: "Leg Press",
          sets: [{ weightKg: 200, reps: 5, isFailure: true }],
        },
      ],
    });

    const prompt = buildExtractionPrompt([], session);
    expect(prompt).toContain("120kg x 3 reps (failure)");
    expect(prompt).toContain("200kg x 5 reps (failure)");
  });
});

// ─── 6. Prompt Structure ──────────────────────────────────

describe("buildExtractionPrompt — prompt structure", () => {
  const sections = [
    "RULES:",
    "KNOWN EXERCISES:",
    "LAST SESSION DATA:",
    "JSON SCHEMA:",
    "EXAMPLE INPUT:",
    "EXAMPLE OUTPUT:",
  ];

  for (const section of sections) {
    it(`always contains the "${section}" section`, () => {
      const prompt = buildExtractionPrompt([], null);
      expect(prompt).toContain(section);
    });
  }

  it("contains all key sections regardless of inputs", () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Deadlift",
          sets: [{ weightKg: 140, reps: 5, isFailure: false }],
        },
      ],
    });

    const prompt = buildExtractionPrompt(["Deadlift", "Squat"], session);
    for (const section of sections) {
      expect(prompt).toContain(section);
    }
  });
});

// ─── 7. Return Type ───────────────────────────────────────

describe("buildExtractionPrompt — return type", () => {
  it("always returns a string with empty inputs", () => {
    const result = buildExtractionPrompt([], null);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("always returns a string with populated inputs", () => {
    const session = makeSession({
      exercises: [
        {
          id: "ex-1",
          name: "Bench Press",
          sets: [{ weightKg: 80, reps: 10, isFailure: false }],
        },
      ],
    });

    const result = buildExtractionPrompt(["Bench Press", "Squat"], session);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
