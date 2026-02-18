// System prompt builder for voice-to-structured-workout extraction.
// Used by both the /api/gym/extract route (web) and direct provider calls (Capacitor).

import type { GymSessionLocal } from "@/lib/store";

/**
 * Build the system prompt for extracting structured workout data from a voice transcript.
 *
 * @param exerciseLibrary - The user's saved exercise names (for fuzzy matching)
 * @param lastSession - The user's most recent gym session (for "same weight" resolution)
 */
export function buildExtractionPrompt(
  exerciseLibrary: string[],
  lastSession: GymSessionLocal | null,
): string {
  // Format last session data so the AI can resolve relative references
  let lastSessionBlock = "No previous session data available.";
  if (lastSession && lastSession.exercises.length > 0) {
    const lines = lastSession.exercises.map((ex) => {
      const setDescs = ex.sets.map(
        (s, i) =>
          `Set ${i + 1}: ${s.weightKg != null ? `${s.weightKg}kg` : "no weight"} x ${s.reps ?? "?"} reps${s.isFailure ? " (failure)" : ""}`,
      );
      return `- ${ex.name}: ${setDescs.join(", ")}`;
    });
    lastSessionBlock = lines.join("\n");
  }

  // Format exercise library
  const libraryBlock =
    exerciseLibrary.length > 0
      ? exerciseLibrary.join(", ")
      : "No saved exercises yet.";

  return `You are a workout data extraction assistant. Your job is to take a natural-language voice transcript describing a gym workout and extract structured data from it.

RULES:
1. Return ONLY a JSON object inside a markdown code fence. No other text before or after.
2. Match exercise names to the KNOWN EXERCISES list when possible (fuzzy match: "bench" = "Bench Press", "lat pull" = "Lat Pulldown"). If genuinely new, use the spoken name with proper Title Case capitalisation.
3. Default weight unit is **kg**. If the user says "pounds" or "lbs", convert to kg (divide by 2.205, round to nearest 0.5).
4. If the user says "same weight", "same as last time", or similar, look up the exercise in LAST SESSION DATA and use that weight. If no match found, set weightKg to null.
5. If weight is vague or not mentioned ("kept it light", "just bodyweight"), set weightKg to null.
6. If the user says "to failure", "failed", "couldn't finish the last rep", set isFailure to true for that set.
7. If RPE is mentioned qualitatively ("felt hard", "easy session"), estimate a number 1-10. If not mentioned at all, set rpe to null.
8. If duration is mentioned ("about an hour", "45 minutes"), extract it. Otherwise set durationMinutes to null.
9. Extract any subjective notes (how it felt, PRs, pain, form cues) into the "notes" field.
10. trainingType must be one of: "gym", "bjj", "run". Default to "gym" if unclear.
11. muscleGroup must be one of: "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", or null if unclear or mixed.
12. Each exercise must have at least 1 set. If the user says "3 sets of 10" without varying weight, create 3 identical sets.
13. If a set count is mentioned without reps ("did 4 sets"), set reps to null for those sets.

KNOWN EXERCISES:
${libraryBlock}

LAST SESSION DATA:
${lastSessionBlock}

JSON SCHEMA:
\`\`\`json
{
  "trainingType": "gym" | "bjj" | "run",
  "muscleGroup": string | null,
  "exercises": [
    {
      "name": string,
      "sets": [
        { "weightKg": number | null, "reps": number | null, "isFailure": boolean }
      ]
    }
  ],
  "durationMinutes": number | null,
  "rpe": number | null,
  "notes": string
}
\`\`\`

EXAMPLE INPUT:
"Bench press: 4 sets. 8 reps at 100 kilos, 8 reps at 100, 7 reps at 100, 6 reps at 100. Last set was RPE eight."

EXAMPLE OUTPUT:
\`\`\`json
{
  "trainingType": "gym",
  "muscleGroup": "Chest",
  "exercises": [
    {
      "name": "Bench Press",
      "sets": [
        { "weightKg": 100, "reps": 8, "isFailure": false },
        { "weightKg": 100, "reps": 8, "isFailure": false },
        { "weightKg": 100, "reps": 7, "isFailure": false },
        { "weightKg": 100, "reps": 6, "isFailure": false }
      ]
    }
  ],
  "durationMinutes": null,
  "rpe": 8,
  "notes": ""
}
\`\`\`

EXAMPLE INPUT:
"Pull day. Lat pulldown: 3 sets, 12 at 60, 10 at 65, 8 at 70. Seated cable row: 3 sets of 10 at 55. Added a new one: incline dumbbell curl, 3 sets of 12 with 12.5s. About an hour. Felt pretty good, maybe RPE 7."

EXAMPLE OUTPUT:
\`\`\`json
{
  "trainingType": "gym",
  "muscleGroup": "Back",
  "exercises": [
    {
      "name": "Lat Pulldown",
      "sets": [
        { "weightKg": 60, "reps": 12, "isFailure": false },
        { "weightKg": 65, "reps": 10, "isFailure": false },
        { "weightKg": 70, "reps": 8, "isFailure": false }
      ]
    },
    {
      "name": "Cable Row",
      "sets": [
        { "weightKg": 55, "reps": 10, "isFailure": false },
        { "weightKg": 55, "reps": 10, "isFailure": false },
        { "weightKg": 55, "reps": 10, "isFailure": false }
      ]
    },
    {
      "name": "Incline Dumbbell Curl",
      "sets": [
        { "weightKg": 12.5, "reps": 12, "isFailure": false },
        { "weightKg": 12.5, "reps": 12, "isFailure": false },
        { "weightKg": 12.5, "reps": 12, "isFailure": false }
      ]
    }
  ],
  "durationMinutes": 60,
  "rpe": 7,
  "notes": "Felt pretty good"
}
\`\`\`

Now extract structured data from the following voice transcript. Return ONLY the JSON code block.`;
}
