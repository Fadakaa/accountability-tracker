"use client";

import { useState, useEffect } from "react";
import { loadState, saveState, getToday, saveGymSession, loadGymSessions } from "@/lib/store";
import type { GymSessionLocal, GymExerciseLocal, GymSetLocal } from "@/lib/store";
import type { TrainingType } from "@/types/database";
import { XP_VALUES } from "@/lib/habits";
import { getResolvedHabits } from "@/lib/resolvedHabits";

// ─── Constants ──────────────────────────────────────────────
const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body"];
const COMMON_EXERCISES: Record<string, string[]> = {
  Chest: ["Bench Press", "Incline Bench", "DB Flyes", "Cable Crossover", "Push Ups", "Dips"],
  Back: ["Deadlift", "Barbell Row", "Lat Pulldown", "Cable Row", "Pull Ups", "T-Bar Row"],
  Shoulders: ["Overhead Press", "Lateral Raise", "Face Pulls", "Arnold Press", "Front Raise"],
  Arms: ["Barbell Curl", "Tricep Pushdown", "Hammer Curl", "Skull Crushers", "Preacher Curl"],
  Legs: ["Squat", "Leg Press", "RDL", "Leg Curl", "Leg Extension", "Lunges", "Calf Raise"],
  Core: ["Plank", "Cable Crunch", "Hanging Leg Raise", "Russian Twist", "Ab Rollout"],
  "Full Body": ["Clean & Press", "Thruster", "Burpees", "Turkish Get Up"],
};

type Phase = "setup" | "logging" | "complete" | "archive";

export default function GymPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [trainingType, setTrainingType] = useState<TrainingType>("gym");
  const [muscleGroup, setMuscleGroup] = useState<string>("");
  const [exercises, setExercises] = useState<GymExerciseLocal[]>([]);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [savedSession, setSavedSession] = useState<GymSessionLocal | null>(null);

  // Past sessions for history
  const [pastSessions, setPastSessions] = useState<GymSessionLocal[]>([]);
  useEffect(() => {
    setPastSessions(loadGymSessions());
  }, []);

  // ─── Just Walked In ────────────────────────────────────
  function handleJustWalkedIn() {
    const state = loadState();
    const today = getToday();
    const trainingHabit = getResolvedHabits().find((h) => h.slug === "training");

    if (trainingHabit) {
      const existingLog = state.logs.find((l) => l.date === today);
      if (existingLog) {
        existingLog.entries[trainingHabit.id] = { status: "done", value: null };
      } else {
        state.logs.push({
          date: today,
          entries: { [trainingHabit.id]: { status: "done", value: null } },
          badEntries: {},
          xpEarned: XP_VALUES.BARE_MINIMUM_HABIT,
          bareMinimumMet: false,
          submittedAt: new Date().toISOString(),
        });
      }
      // Update streak
      state.streaks["training"] = (state.streaks["training"] ?? 0) + 1;
      state.totalXp += XP_VALUES.BARE_MINIMUM_HABIT;
      saveState(state);
    }

    // Save minimal gym session
    const session: GymSessionLocal = {
      id: crypto.randomUUID(),
      date: today,
      trainingType: "gym",
      muscleGroup: null,
      durationMinutes: null,
      rpe: null,
      notes: "",
      justWalkedIn: true,
      exercises: [],
      createdAt: new Date().toISOString(),
    };
    saveGymSession(session);
    setSavedSession(session);
    setPhase("complete");
  }

  // ─── Start Logging ─────────────────────────────────────
  function handleStartLogging() {
    setPhase("logging");
  }

  // ─── Exercise Management ───────────────────────────────
  function addExercise(name: string) {
    if (!name.trim()) return;
    setExercises((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        sets: [{ weightKg: null, reps: null, isFailure: false }],
      },
    ]);
  }

  function removeExercise(id: string) {
    setExercises((prev) => prev.filter((e) => e.id !== id));
  }

  function addSet(exerciseId: string) {
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: [...e.sets, { weightKg: null, reps: null, isFailure: false }] }
          : e
      )
    );
  }

  function removeSet(exerciseId: string, setIdx: number) {
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.filter((_, i) => i !== setIdx) }
          : e
      )
    );
  }

  function updateSet(exerciseId: string, setIdx: number, update: Partial<GymSetLocal>) {
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s, i) => (i === setIdx ? { ...s, ...update } : s)),
            }
          : e
      )
    );
  }

  // ─── Save Session ──────────────────────────────────────
  function handleSave() {
    const session: GymSessionLocal = {
      id: crypto.randomUUID(),
      date: getToday(),
      trainingType,
      muscleGroup: trainingType === "gym" ? muscleGroup || null : null,
      durationMinutes,
      rpe,
      notes,
      justWalkedIn: false,
      exercises,
      createdAt: new Date().toISOString(),
    };
    saveGymSession(session);

    // Update state — mark training as done + add XP
    const state = loadState();
    const today = getToday();
    const trainingHabit = getResolvedHabits().find((h) => h.slug === "training");
    const trainingMinutesHabit = getResolvedHabits().find((h) => h.slug === "training-minutes");
    const rpeHabit = getResolvedHabits().find((h) => h.slug === "rpe");

    let xp = 0;

    if (trainingHabit) {
      const existingLog = state.logs.find((l) => l.date === today);
      if (existingLog) {
        existingLog.entries[trainingHabit.id] = { status: "done", value: null };
        if (trainingMinutesHabit && durationMinutes) {
          existingLog.entries[trainingMinutesHabit.id] = { status: "done", value: durationMinutes };
        }
        if (rpeHabit && rpe) {
          existingLog.entries[rpeHabit.id] = { status: "done", value: rpe };
        }
      } else {
        const entries: Record<string, { status: "done"; value: number | null }> = {
          [trainingHabit.id]: { status: "done", value: null },
        };
        if (trainingMinutesHabit && durationMinutes) {
          entries[trainingMinutesHabit.id] = { status: "done", value: durationMinutes };
        }
        if (rpeHabit && rpe) {
          entries[rpeHabit.id] = { status: "done", value: rpe };
        }
        state.logs.push({
          date: today,
          entries,
          badEntries: {},
          xpEarned: 0,
          bareMinimumMet: false,
          submittedAt: new Date().toISOString(),
        });
      }

      // XP: bare minimum for training + detailed log bonus
      xp += XP_VALUES.BARE_MINIMUM_HABIT;
      if (exercises.length > 0) {
        xp += XP_VALUES.GYM_FULL_DETAIL;
      }
      if (trainingMinutesHabit && durationMinutes && durationMinutes > 0) {
        xp += XP_VALUES.MEASURED_AT_TARGET;
      }

      // Update streak
      state.streaks["training"] = (state.streaks["training"] ?? 0) + 1;
      state.totalXp += xp;

      // Update today's log XP
      const todayLog = state.logs.find((l) => l.date === today);
      if (todayLog) todayLog.xpEarned += xp;

      saveState(state);
    }

    setSavedSession(session);
    setPhase("complete");
  }

  // ─── Setup Phase ───────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="flex flex-col min-h-screen px-4 py-6">
        <header className="mb-6">
          <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
            ← Dashboard
          </a>
          <h1 className="text-xl font-bold mt-1">🏋️ Gym Log</h1>
        </header>

        {/* Just Walked In */}
        <button
          onClick={handleJustWalkedIn}
          className="w-full rounded-xl bg-done/20 border border-done/30 py-4 mb-6 text-done font-bold text-base active:scale-[0.98] transition-all"
        >
          ✅ Just Walked In — Auto-Win
        </button>

        {/* Training Type */}
        <section className="mb-6">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Training Type
          </h2>
          <div className="flex gap-2">
            {(["gym", "bjj", "run"] as TrainingType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTrainingType(t)}
                className={`flex-1 rounded-lg py-3 text-sm font-bold uppercase transition-colors ${
                  trainingType === t
                    ? "bg-brand text-white"
                    : "bg-surface-800 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t === "gym" ? "🏋️ Gym" : t === "bjj" ? "🥋 BJJ" : "🏃 Run"}
              </button>
            ))}
          </div>
        </section>

        {/* Muscle Group (gym only) */}
        {trainingType === "gym" && (
          <section className="mb-6">
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
              Muscle Group
            </h2>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUPS.map((mg) => (
                <button
                  key={mg}
                  onClick={() => setMuscleGroup(mg)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    muscleGroup === mg
                      ? "bg-brand text-white"
                      : "bg-surface-800 text-neutral-400 hover:text-neutral-300"
                  }`}
                >
                  {mg}
                </button>
              ))}
            </div>
          </section>
        )}

        <button
          onClick={handleStartLogging}
          className="w-full rounded-xl bg-brand hover:bg-brand-dark py-4 text-white font-bold text-base active:scale-[0.98] transition-all mt-auto mb-4"
        >
          Start Logging →
        </button>

        {/* Session Archive Link */}
        {pastSessions.length > 0 && (
          <button
            onClick={() => setPhase("archive")}
            className="w-full rounded-xl bg-surface-800 border border-surface-700 py-3 text-sm text-neutral-400 hover:text-neutral-200 font-medium transition-colors mt-4"
          >
            📂 View Session Archive ({pastSessions.length} sessions)
          </button>
        )}
      </div>
    );
  }

  // ─── Logging Phase ─────────────────────────────────────
  if (phase === "logging") {
    const suggestions =
      trainingType === "gym" && muscleGroup
        ? COMMON_EXERCISES[muscleGroup] ?? []
        : [];

    return (
      <div className="flex flex-col min-h-screen px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => setPhase("setup")}
              className="text-neutral-500 text-sm hover:text-neutral-300"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold mt-1">
              {trainingType === "gym"
                ? `🏋️ ${muscleGroup || "Gym"} Session`
                : trainingType === "bjj"
                  ? "🥋 BJJ Session"
                  : "🏃 Run Session"}
            </h1>
          </div>
        </header>

        {/* Duration */}
        <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 block">
            Duration (minutes)
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDurationMinutes(Math.max(0, (durationMinutes ?? 0) - 5))}
              className="w-10 h-10 rounded-lg bg-surface-700 text-neutral-400 hover:bg-surface-600 text-lg font-bold active:scale-95 transition-all"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              value={durationMinutes ?? ""}
              onChange={(e) =>
                setDurationMinutes(e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="60"
              className="flex-1 bg-surface-700 rounded-lg px-4 py-2.5 text-center text-lg font-bold text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
            />
            <button
              onClick={() => setDurationMinutes(Math.min(300, (durationMinutes ?? 0) + 5))}
              className="w-10 h-10 rounded-lg bg-surface-700 text-neutral-400 hover:bg-surface-600 text-lg font-bold active:scale-95 transition-all"
            >
              +
            </button>
          </div>
        </section>

        {/* Exercises (gym only) */}
        {trainingType === "gym" && (
          <section className="mb-4">
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
              Exercises
            </h2>

            {/* Exercise list */}
            <div className="space-y-4 mb-4">
              {exercises.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onAddSet={() => addSet(exercise.id)}
                  onRemoveSet={(idx) => removeSet(exercise.id, idx)}
                  onUpdateSet={(idx, update) => updateSet(exercise.id, idx, update)}
                  onRemove={() => removeExercise(exercise.id)}
                />
              ))}
            </div>

            {/* Quick add from suggestions */}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {suggestions
                  .filter((s) => !exercises.some((e) => e.name === s))
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => addExercise(s)}
                      className="rounded-lg bg-surface-800 border border-surface-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-300 hover:border-brand/30 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            )}

            {/* Custom exercise input */}
            <AddExerciseInput onAdd={addExercise} />
          </section>
        )}

        {/* Session Intensity */}
        <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 block">
            Session Intensity
          </label>
          <p className="text-[11px] text-neutral-600 mb-2">How hard did it feel? (1 = easy, 10 = max effort)</p>
          <div className="flex gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setRpe(n)}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-95 ${
                  rpe === n
                    ? n >= 8
                      ? "bg-missed text-white"
                      : n >= 5
                        ? "bg-later text-white"
                        : "bg-done text-white"
                    : "bg-surface-700 text-neutral-400 hover:bg-surface-600"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 block">
            Session Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did the session feel? Any PRs?"
            rows={3}
            className="w-full bg-surface-700 rounded-lg px-4 py-3 text-sm text-white border-none outline-none resize-none focus:ring-2 focus:ring-brand/50"
          />
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className="w-full rounded-xl bg-brand hover:bg-brand-dark py-4 text-white font-bold text-base active:scale-[0.98] transition-all mt-auto mb-4"
        >
          Save Session →
        </button>
      </div>
    );
  }

  // ─── Archive Phase ─────────────────────────────────────
  if (phase === "archive") {
    // Group sessions by date
    const grouped = new Map<string, GymSessionLocal[]>();
    for (const s of [...pastSessions].reverse()) {
      const existing = grouped.get(s.date) || [];
      existing.push(s);
      grouped.set(s.date, existing);
    }

    return (
      <div className="flex flex-col min-h-screen px-4 py-6">
        <header className="mb-6">
          <button
            onClick={() => setPhase("setup")}
            className="text-neutral-500 text-sm hover:text-neutral-300"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold mt-1">📂 Session Archive</h1>
          <p className="text-xs text-neutral-500 mt-1">
            {pastSessions.length} total session{pastSessions.length !== 1 ? "s" : ""}
          </p>
        </header>

        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([date, sessions]) => (
            <ArchiveDateGroup key={date} date={date} sessions={sessions} />
          ))}
        </div>

        {pastSessions.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
            No sessions logged yet.
          </div>
        )}
      </div>
    );
  }

  // ─── Complete Phase ────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 text-center">
      <div className="text-6xl mb-4">💪</div>
      <h1 className="text-2xl font-black text-brand mb-2">Session Logged!</h1>
      {savedSession?.justWalkedIn ? (
        <p className="text-neutral-400 text-sm mb-6">
          Just showing up counts. Training binary habit marked done.
        </p>
      ) : (
        <div className="text-neutral-400 text-sm mb-6 space-y-1">
          <p>
            {savedSession?.trainingType === "gym"
              ? `🏋️ ${savedSession.muscleGroup || "Gym"}`
              : savedSession?.trainingType === "bjj"
                ? "🥋 BJJ"
                : "🏃 Run"}
            {savedSession?.durationMinutes ? ` • ${savedSession.durationMinutes} min` : ""}
            {savedSession?.rpe ? ` • Intensity ${savedSession.rpe}/10` : ""}
          </p>
          {savedSession && savedSession.exercises.length > 0 && (
            <p>
              {savedSession.exercises.length} exercise{savedSession.exercises.length > 1 ? "s" : ""} logged
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <a
          href="/"
          className="rounded-xl bg-surface-800 hover:bg-surface-700 px-6 py-3 text-sm font-medium transition-colors"
        >
          🏠 Dashboard
        </a>
        <button
          onClick={() => {
            setPhase("setup");
            setExercises([]);
            setRpe(null);
            setNotes("");
            setDurationMinutes(null);
            setMuscleGroup("");
            setSavedSession(null);
          }}
          className="rounded-xl bg-brand hover:bg-brand-dark px-6 py-3 text-sm font-bold text-white transition-colors"
        >
          Log Another
        </button>
      </div>
    </div>
  );
}

// ─── Exercise Card ──────────────────────────────────────────
function ExerciseCard({
  exercise,
  onAddSet,
  onRemoveSet,
  onUpdateSet,
  onRemove,
}: {
  exercise: GymExerciseLocal;
  onAddSet: () => void;
  onRemoveSet: (idx: number) => void;
  onUpdateSet: (idx: number, update: Partial<GymSetLocal>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">{exercise.name}</h3>
        <button
          onClick={onRemove}
          className="text-xs text-neutral-600 hover:text-missed transition-colors"
        >
          Remove
        </button>
      </div>

      {/* Sets table */}
      <div className="space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_1fr_2rem_2rem] gap-2 text-[10px] text-neutral-600 uppercase tracking-wider">
          <span>Set</span>
          <span>kg</span>
          <span>Reps</span>
          <span>F</span>
          <span></span>
        </div>

        {exercise.sets.map((set, idx) => (
          <div key={idx} className="grid grid-cols-[2rem_1fr_1fr_2rem_2rem] gap-2 items-center">
            <span className="text-xs text-neutral-500 text-center">{idx + 1}</span>
            <input
              type="number"
              inputMode="decimal"
              value={set.weightKg ?? ""}
              onChange={(e) =>
                onUpdateSet(idx, {
                  weightKg: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="0"
              className="bg-surface-700 rounded-lg px-2 py-1.5 text-center text-sm text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
            />
            <input
              type="number"
              inputMode="numeric"
              value={set.reps ?? ""}
              onChange={(e) =>
                onUpdateSet(idx, {
                  reps: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="0"
              className="bg-surface-700 rounded-lg px-2 py-1.5 text-center text-sm text-white border-none outline-none focus:ring-2 focus:ring-brand/50"
            />
            <button
              onClick={() => onUpdateSet(idx, { isFailure: !set.isFailure })}
              className={`text-xs text-center transition-colors ${
                set.isFailure ? "text-missed" : "text-neutral-600"
              }`}
            >
              {set.isFailure ? "🔴" : "⚪"}
            </button>
            {exercise.sets.length > 1 && (
              <button
                onClick={() => onRemoveSet(idx)}
                className="text-xs text-neutral-600 hover:text-missed transition-colors text-center"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add set */}
      {exercise.sets.length < 6 && (
        <button
          onClick={onAddSet}
          className="mt-2 text-xs text-neutral-500 hover:text-brand transition-colors"
        >
          + Add Set
        </button>
      )}
    </div>
  );
}

// ─── Archive Date Group ─────────────────────────────────────
function ArchiveDateGroup({ date, sessions }: { date: string; sessions: GymSessionLocal[] }) {
  const [expanded, setExpanded] = useState(false);
  const dateObj = new Date(date + "T12:00:00");
  const dayLabel = dateObj.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Summary of training types for this date
  const typeIcons = sessions.map((s) =>
    s.trainingType === "gym" ? "🏋️" : s.trainingType === "bjj" ? "🥋" : "🏃"
  );
  const typeSummary = sessions
    .map((s) =>
      s.trainingType === "gym"
        ? s.muscleGroup || "Gym"
        : s.trainingType === "bjj"
          ? "BJJ"
          : "Run"
    )
    .join(" + ");

  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{typeIcons.join("")}</span>
          <div>
            <span className="text-sm font-semibold text-neutral-200">{typeSummary}</span>
            <span className="text-xs text-neutral-500 ml-2">{dayLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-600">
            {sessions.length} session{sessions.length > 1 ? "s" : ""}
          </span>
          <span className="text-neutral-600 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-surface-700 px-4 py-3 space-y-3">
          {sessions.map((session) => (
            <ArchiveSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Archive Session Card ───────────────────────────────────
function ArchiveSessionCard({ session }: { session: GymSessionLocal }) {
  const typeLabel =
    session.trainingType === "gym"
      ? `🏋️ ${session.muscleGroup || "Gym"}`
      : session.trainingType === "bjj"
        ? "🥋 BJJ"
        : "🏃 Run";

  return (
    <div className="rounded-lg bg-surface-700/50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{typeLabel}</span>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {session.justWalkedIn && (
            <span className="text-done font-medium">Just walked in</span>
          )}
          {session.durationMinutes && (
            <span>{session.durationMinutes} min</span>
          )}
          {session.rpe && (
            <span className={`font-bold ${
              session.rpe >= 8 ? "text-missed" : session.rpe >= 5 ? "text-later" : "text-done"
            }`}>
              RPE {session.rpe}
            </span>
          )}
        </div>
      </div>

      {/* Exercises */}
      {session.exercises.length > 0 && (
        <div className="space-y-1.5">
          {session.exercises.map((ex) => (
            <div key={ex.id} className="text-xs">
              <span className="text-neutral-300 font-medium">{ex.name}</span>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {ex.sets.map((set, i) => (
                  <span
                    key={i}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                      set.isFailure
                        ? "bg-missed/20 text-missed"
                        : "bg-surface-600 text-neutral-400"
                    }`}
                  >
                    {set.weightKg ?? "?"}kg × {set.reps ?? "?"}
                    {set.isFailure && " F"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {session.notes && (
        <p className="text-xs text-neutral-500 italic">{session.notes}</p>
      )}

      {/* Time logged */}
      <div className="text-[10px] text-neutral-600">
        Logged at {new Date(session.createdAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

// ─── Add Exercise Input ─────────────────────────────────────
function AddExerciseInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onAdd(value);
            setValue("");
          }
        }}
        placeholder="Add custom exercise..."
        className="flex-1 bg-surface-800 rounded-lg px-4 py-2.5 text-sm text-white border border-surface-700 outline-none focus:ring-2 focus:ring-brand/50"
      />
      <button
        onClick={() => {
          if (value.trim()) {
            onAdd(value);
            setValue("");
          }
        }}
        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark transition-colors"
      >
        +
      </button>
    </div>
  );
}
