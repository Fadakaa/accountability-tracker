// Parse and validate AI extraction responses for voice gym logging.
// Extracts JSON from code fences, validates structure, normalizes types.

import type { TrainingType } from "@/types/database";

export interface ExtractionResult {
  trainingType: TrainingType;
  muscleGroup: string | null;
  exercises: Array<{
    name: string;
    sets: Array<{
      weightKg: number | null;
      reps: number | null;
      isFailure: boolean;
    }>;
  }>;
  durationMinutes: number | null;
  rpe: number | null;
  notes: string;
}

const VALID_TRAINING_TYPES = new Set(["gym", "bjj", "run"]);
const VALID_MUSCLE_GROUPS = new Set([
  "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body",
]);

/**
 * Parse the AI response and extract a validated ExtractionResult.
 * Returns `{ error: string }` if parsing or validation fails.
 */
export function parseExtractionResponse(
  raw: string,
): ExtractionResult | { error: string } {
  // 1. Try to extract JSON from a code fence
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = fenceMatch ? fenceMatch[1].trim() : null;

  // 2. Fallback: find a top-level { ... } block
  if (!jsonStr) {
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    jsonStr = braceMatch ? braceMatch[0].trim() : null;
  }

  if (!jsonStr) {
    return { error: "No JSON found in AI response." };
  }

  // 3. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { error: "AI returned invalid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "AI response is not a JSON object." };
  }

  const obj = parsed as Record<string, unknown>;

  // 4. Validate and normalize
  const trainingType = VALID_TRAINING_TYPES.has(obj.trainingType as string)
    ? (obj.trainingType as TrainingType)
    : "gym";

  const muscleGroup =
    typeof obj.muscleGroup === "string" && VALID_MUSCLE_GROUPS.has(obj.muscleGroup)
      ? obj.muscleGroup
      : null;

  const durationMinutes =
    typeof obj.durationMinutes === "number" && obj.durationMinutes > 0
      ? Math.round(obj.durationMinutes)
      : null;

  const rpe =
    typeof obj.rpe === "number" && obj.rpe >= 1 && obj.rpe <= 10
      ? Math.round(obj.rpe)
      : null;

  const notes = typeof obj.notes === "string" ? obj.notes : "";

  // 5. Validate exercises array
  if (!Array.isArray(obj.exercises) || obj.exercises.length === 0) {
    return { error: "No exercises found in AI response." };
  }

  const exercises: ExtractionResult["exercises"] = [];

  for (const rawEx of obj.exercises) {
    if (!rawEx || typeof rawEx !== "object") continue;
    const ex = rawEx as Record<string, unknown>;
    const name = typeof ex.name === "string" ? ex.name.trim() : "";
    if (!name) continue;

    const rawSets = Array.isArray(ex.sets) ? ex.sets : [];
    const sets: ExtractionResult["exercises"][0]["sets"] = [];

    for (const rawSet of rawSets) {
      if (!rawSet || typeof rawSet !== "object") continue;
      const s = rawSet as Record<string, unknown>;
      sets.push({
        weightKg:
          typeof s.weightKg === "number" ? Math.round(s.weightKg * 2) / 2 : null, // round to 0.5
        reps: typeof s.reps === "number" ? Math.round(s.reps) : null,
        isFailure: s.isFailure === true,
      });
    }

    // Ensure at least 1 set
    if (sets.length === 0) {
      sets.push({ weightKg: null, reps: null, isFailure: false });
    }

    exercises.push({ name, sets });
  }

  if (exercises.length === 0) {
    return { error: "No valid exercises found in AI response." };
  }

  return { trainingType, muscleGroup, exercises, durationMinutes, rpe, notes };
}
