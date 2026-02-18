import { describe, it, expect } from "vitest";
import { parseExtractionResponse } from "../gym/parseExtraction";
import type { ExtractionResult } from "../gym/parseExtraction";

// ─── Helpers ──────────────────────────────────────────────

/** Wrap a JS object in a ```json code fence. */
function fenced(obj: unknown): string {
  return "```json\n" + JSON.stringify(obj) + "\n```";
}

/** Wrap a JS object in a ``` code fence (no language tag). */
function fencedPlain(obj: unknown): string {
  return "```\n" + JSON.stringify(obj) + "\n```";
}

/** Minimal valid payload — one exercise with one set. */
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    trainingType: "gym",
    muscleGroup: "Chest",
    exercises: [
      {
        name: "Bench Press",
        sets: [{ weightKg: 80, reps: 10, isFailure: false }],
      },
    ],
    durationMinutes: 60,
    rpe: 7,
    notes: "Good session",
    ...overrides,
  };
}

/** Type-guard: asserts value is a successful ExtractionResult. */
function expectSuccess(result: ReturnType<typeof parseExtractionResponse>): ExtractionResult {
  expect(result).not.toHaveProperty("error");
  return result as ExtractionResult;
}

/** Type-guard: asserts value is an error result and returns the error string. */
function expectError(result: ReturnType<typeof parseExtractionResponse>): string {
  expect(result).toHaveProperty("error");
  return (result as { error: string }).error;
}

// ─── JSON Extraction ──────────────────────────────────────

describe("JSON extraction", () => {
  it("extracts JSON from ```json code fence", () => {
    const result = parseExtractionResponse(fenced(validPayload()));
    expectSuccess(result);
  });

  it("extracts JSON from ``` code fence without language tag", () => {
    const result = parseExtractionResponse(fencedPlain(validPayload()));
    expectSuccess(result);
  });

  it("extracts raw JSON without code fence", () => {
    const result = parseExtractionResponse(JSON.stringify(validPayload()));
    expectSuccess(result);
  });

  it("returns error when no JSON found", () => {
    const err = expectError(parseExtractionResponse("no json here at all"));
    expect(err).toBe("No JSON found in AI response.");
  });

  it("returns error for invalid JSON", () => {
    const err = expectError(parseExtractionResponse("```json\n{broken json}\n```"));
    expect(err).toBe("AI returned invalid JSON.");
  });

  it("returns error for JSON array (not object)", () => {
    const err = expectError(parseExtractionResponse("```json\n[1,2,3]\n```"));
    expect(err).toBe("AI response is not a JSON object.");
  });

  it("returns error when JSON is a primitive (not object)", () => {
    const err = expectError(parseExtractionResponse('```json\n"hello"\n```'));
    expect(err).toBe("AI response is not a JSON object.");
  });
});

// ─── trainingType Validation ──────────────────────────────

describe("trainingType validation", () => {
  it.each(["gym", "bjj", "run"] as const)("preserves valid trainingType '%s'", (type) => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ trainingType: type }))),
    );
    expect(result.trainingType).toBe(type);
  });

  it("defaults to 'gym' for invalid trainingType", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ trainingType: "yoga" }))),
    );
    expect(result.trainingType).toBe("gym");
  });

  it("defaults to 'gym' when trainingType is missing", () => {
    const payload = validPayload();
    delete payload.trainingType;
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.trainingType).toBe("gym");
  });
});

// ─── muscleGroup Validation ───────────────────────────────

describe("muscleGroup validation", () => {
  it.each(["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body"])(
    "preserves valid muscleGroup '%s'",
    (group) => {
      const result = expectSuccess(
        parseExtractionResponse(fenced(validPayload({ muscleGroup: group }))),
      );
      expect(result.muscleGroup).toBe(group);
    },
  );

  it("returns null for invalid muscleGroup", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ muscleGroup: "Glutes" }))),
    );
    expect(result.muscleGroup).toBeNull();
  });

  it("returns null when muscleGroup is missing", () => {
    const payload = validPayload();
    delete payload.muscleGroup;
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.muscleGroup).toBeNull();
  });

  it("returns null when muscleGroup is a number", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ muscleGroup: 42 }))),
    );
    expect(result.muscleGroup).toBeNull();
  });
});

// ─── durationMinutes Validation ───────────────────────────

describe("durationMinutes validation", () => {
  it("rounds a positive decimal number", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ durationMinutes: 45.7 }))),
    );
    expect(result.durationMinutes).toBe(46);
  });

  it("preserves an exact positive integer", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ durationMinutes: 60 }))),
    );
    expect(result.durationMinutes).toBe(60);
  });

  it("returns null for 0", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ durationMinutes: 0 }))),
    );
    expect(result.durationMinutes).toBeNull();
  });

  it("returns null for negative value", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ durationMinutes: -10 }))),
    );
    expect(result.durationMinutes).toBeNull();
  });

  it("returns null when missing", () => {
    const payload = validPayload();
    delete payload.durationMinutes;
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.durationMinutes).toBeNull();
  });
});

// ─── rpe Validation ───────────────────────────────────────

describe("rpe validation", () => {
  it("rounds rpe within 1-10 range", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ rpe: 7.4 }))),
    );
    expect(result.rpe).toBe(7);
  });

  it("preserves rpe at lower bound (1)", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ rpe: 1 }))),
    );
    expect(result.rpe).toBe(1);
  });

  it("preserves rpe at upper bound (10)", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ rpe: 10 }))),
    );
    expect(result.rpe).toBe(10);
  });

  it("returns null for rpe 0", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ rpe: 0 }))),
    );
    expect(result.rpe).toBeNull();
  });

  it("returns null for rpe 11", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ rpe: 11 }))),
    );
    expect(result.rpe).toBeNull();
  });

  it("returns null when rpe is missing", () => {
    const payload = validPayload();
    delete payload.rpe;
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.rpe).toBeNull();
  });
});

// ─── notes Validation ─────────────────────────────────────

describe("notes validation", () => {
  it("preserves a valid notes string", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ notes: "Felt strong today" }))),
    );
    expect(result.notes).toBe("Felt strong today");
  });

  it("defaults to empty string when notes is missing", () => {
    const payload = validPayload();
    delete payload.notes;
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.notes).toBe("");
  });

  it("defaults to empty string when notes is a number", () => {
    const result = expectSuccess(
      parseExtractionResponse(fenced(validPayload({ notes: 123 }))),
    );
    expect(result.notes).toBe("");
  });
});

// ─── Exercise Validation ──────────────────────────────────

describe("exercise validation", () => {
  it("returns error for empty exercises array", () => {
    const err = expectError(
      parseExtractionResponse(fenced(validPayload({ exercises: [] }))),
    );
    expect(err).toBe("No exercises found in AI response.");
  });

  it("returns error when exercises is missing", () => {
    const payload = validPayload();
    delete payload.exercises;
    const err = expectError(parseExtractionResponse(fenced(payload)));
    expect(err).toBe("No exercises found in AI response.");
  });

  it("preserves exercise with valid name and sets", () => {
    const result = expectSuccess(parseExtractionResponse(fenced(validPayload())));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].name).toBe("Bench Press");
    expect(result.exercises[0].sets).toHaveLength(1);
  });

  it("skips exercise with empty string name", () => {
    const payload = validPayload({
      exercises: [
        { name: "", sets: [{ weightKg: 50, reps: 10, isFailure: false }] },
        { name: "Squat", sets: [{ weightKg: 100, reps: 5, isFailure: false }] },
      ],
    });
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].name).toBe("Squat");
  });

  it("skips non-object exercise entries", () => {
    const payload = validPayload({
      exercises: [
        "not an object",
        null,
        42,
        { name: "Curl", sets: [{ weightKg: 12, reps: 12, isFailure: false }] },
      ],
    });
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].name).toBe("Curl");
  });

  it("returns 'No valid exercises found' when all exercises are invalid", () => {
    const payload = validPayload({
      exercises: [{ name: "", sets: [] }, { name: "   ", sets: [] }, null],
    });
    const err = expectError(parseExtractionResponse(fenced(payload)));
    expect(err).toBe("No valid exercises found in AI response.");
  });

  it("trims exercise name whitespace", () => {
    const payload = validPayload({
      exercises: [
        { name: "  Bench Press  ", sets: [{ weightKg: 80, reps: 10, isFailure: false }] },
      ],
    });
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.exercises[0].name).toBe("Bench Press");
  });
});

// ─── Set Validation ───────────────────────────────────────

describe("set validation", () => {
  function payloadWithSets(sets: unknown[]): string {
    return fenced(validPayload({
      exercises: [{ name: "Test Exercise", sets }],
    }));
  }

  it("rounds weightKg to nearest 0.5 (12.3 → 12.5)", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 12.3, reps: 10, isFailure: false }]),
    ));
    expect(result.exercises[0].sets[0].weightKg).toBe(12.5);
  });

  it("rounds weightKg to nearest 0.5 (12.7 → 12.5)", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 12.7, reps: 10, isFailure: false }]),
    ));
    expect(result.exercises[0].sets[0].weightKg).toBe(12.5);
  });

  it("preserves exact 0.5 increment (80.5)", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 80.5, reps: 10, isFailure: false }]),
    ));
    expect(result.exercises[0].sets[0].weightKg).toBe(80.5);
  });

  it("returns null for missing weightKg", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ reps: 10, isFailure: false }]),
    ));
    expect(result.exercises[0].sets[0].weightKg).toBeNull();
  });

  it("rounds reps to nearest integer", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 50, reps: 8.7, isFailure: false }]),
    ));
    expect(result.exercises[0].sets[0].reps).toBe(9);
  });

  it("returns null for missing reps", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 50, isFailure: false }]),
    ));
    expect(result.exercises[0].sets[0].reps).toBeNull();
  });

  it("preserves isFailure true", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 50, reps: 10, isFailure: true }]),
    ));
    expect(result.exercises[0].sets[0].isFailure).toBe(true);
  });

  it("defaults isFailure to false when missing", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 50, reps: 10 }]),
    ));
    expect(result.exercises[0].sets[0].isFailure).toBe(false);
  });

  it("defaults isFailure to false for non-boolean value", () => {
    const result = expectSuccess(parseExtractionResponse(
      payloadWithSets([{ weightKg: 50, reps: 10, isFailure: "yes" }]),
    ));
    expect(result.exercises[0].sets[0].isFailure).toBe(false);
  });

  it("adds dummy set when exercise has empty sets array", () => {
    const payload = validPayload({
      exercises: [{ name: "Plank", sets: [] }],
    });
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.exercises[0].sets).toHaveLength(1);
    expect(result.exercises[0].sets[0]).toEqual({
      weightKg: null,
      reps: null,
      isFailure: false,
    });
  });

  it("adds dummy set when exercise has no sets property", () => {
    const payload = validPayload({
      exercises: [{ name: "Plank" }],
    });
    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.exercises[0].sets).toHaveLength(1);
    expect(result.exercises[0].sets[0]).toEqual({
      weightKg: null,
      reps: null,
      isFailure: false,
    });
  });
});

// ─── End-to-End ───────────────────────────────────────────

describe("end-to-end", () => {
  it("parses a full valid response with multiple exercises and sets", () => {
    const payload = {
      trainingType: "gym",
      muscleGroup: "Chest",
      exercises: [
        {
          name: "Bench Press",
          sets: [
            { weightKg: 80, reps: 10, isFailure: false },
            { weightKg: 85, reps: 8, isFailure: false },
            { weightKg: 90, reps: 6, isFailure: true },
          ],
        },
        {
          name: "Incline Dumbbell Press",
          sets: [
            { weightKg: 30, reps: 12, isFailure: false },
            { weightKg: 32.5, reps: 10, isFailure: false },
          ],
        },
      ],
      durationMinutes: 55,
      rpe: 8,
      notes: "Great chest day. Hit a PR on bench.",
    };

    const result = expectSuccess(parseExtractionResponse(fenced(payload)));

    expect(result.trainingType).toBe("gym");
    expect(result.muscleGroup).toBe("Chest");
    expect(result.durationMinutes).toBe(55);
    expect(result.rpe).toBe(8);
    expect(result.notes).toBe("Great chest day. Hit a PR on bench.");
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].sets).toHaveLength(3);
    expect(result.exercises[0].sets[2].isFailure).toBe(true);
    expect(result.exercises[1].sets[1].weightKg).toBe(32.5);
  });

  it("handles response with extra text around the JSON code fence", () => {
    const payload = validPayload();
    const raw = [
      "Here is the extracted data:\n",
      "```json",
      JSON.stringify(payload, null, 2),
      "```",
      "\nLet me know if you need changes!",
    ].join("\n");

    const result = expectSuccess(parseExtractionResponse(raw));
    expect(result.trainingType).toBe("gym");
    expect(result.exercises).toHaveLength(1);
  });

  it("handles BJJ session with bodyweight exercises", () => {
    const payload = {
      trainingType: "bjj",
      muscleGroup: null,
      exercises: [
        { name: "Rolling", sets: [] },
        { name: "Drilling", sets: [{ weightKg: null, reps: 20, isFailure: false }] },
      ],
      durationMinutes: 90,
      rpe: 9,
      notes: "Hard sparring day.",
    };

    const result = expectSuccess(parseExtractionResponse(fenced(payload)));
    expect(result.trainingType).toBe("bjj");
    expect(result.muscleGroup).toBeNull();
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].sets).toEqual([{ weightKg: null, reps: null, isFailure: false }]);
    expect(result.durationMinutes).toBe(90);
  });
});
