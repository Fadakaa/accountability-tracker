"use client";

import { useState, useEffect, useCallback } from "react";
import { getToday, getLevelForXP } from "@/lib/store";
import type { LocalState, SprintData, DayLog } from "@/lib/store";
import type { SprintIntensity } from "@/types/database";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { useDB } from "@/hooks/useDB";

// ─── Types ──────────────────────────────────────────────────
type Phase = "activation" | "dashboard" | "summary";

// ─── Component ──────────────────────────────────────────────
export default function SprintPage() {
  const { state: dbState, settings, dbHabits, loading, saveState: dbSaveState, refresh } = useDB();
  const [state, setState] = useState<LocalState | null>(null);
  const [phase, setPhase] = useState<Phase>("activation");
  const [completedSprint, setCompletedSprint] = useState<SprintData | null>(null);

  // Sync from useDB on load
  useEffect(() => {
    if (loading) return;
    setState(dbState);
    if (dbState.activeSprint && dbState.activeSprint.status === "active") {
      setPhase("dashboard");
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh state helper — re-read from useDB
  const refreshState = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // Keep local state in sync with dbState
  useEffect(() => {
    if (!loading) setState(dbState);
  }, [dbState, loading]);

  if (loading || !state) return null;

  if (phase === "summary" && completedSprint) {
    return (
      <SprintSummary
        sprint={completedSprint}
        state={state}
        onNewSprint={() => {
          setCompletedSprint(null);
          setPhase("activation");
        }}
      />
    );
  }

  if (phase === "dashboard" && state.activeSprint) {
    return (
      <SprintDashboard
        state={state}
        sprint={state.activeSprint}
        dbSaveState={dbSaveState}
        dbHabits={dbHabits}
        settings={settings}
        onRefresh={refreshState}
        onEndSprint={(archived) => {
          setCompletedSprint(archived);
          setPhase("summary");
        }}
      />
    );
  }

  return (
    <SprintActivation
      state={state}
      dbSaveState={dbSaveState}
      onActivated={async () => {
        await refreshState();
        setPhase("dashboard");
      }}
    />
  );
}

// ─── Sprint Activation ──────────────────────────────────────
function SprintActivation({ state, dbSaveState, onActivated }: {
  state: LocalState;
  dbSaveState: (s: LocalState) => Promise<void>;
  onActivated: () => void;
}) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [intensity, setIntensity] = useState<SprintIntensity>("moderate");

  const pastSprints = state.sprintHistory ?? [];

  const canActivate = name.trim().length > 0 && deadline.length > 0;

  async function handleActivate() {
    if (!canActivate) return;

    const sprint: SprintData = {
      id: crypto.randomUUID(),
      name: name.trim(),
      intensity,
      startDate: getToday(),
      deadline,
      status: "active",
      tasks: [],
      bareMinimumDaysMet: 0,
      completedAt: null,
    };

    const updated = { ...state, activeSprint: sprint };
    await dbSaveState(updated);
    onActivated();
  }

  const intensityOptions: { value: SprintIntensity; icon: string; label: string; desc: string }[] = [
    {
      value: "moderate",
      icon: "🟡",
      label: "Moderate",
      desc: "All habits active, targets -25%, Fibonacci starts at 21 min",
    },
    {
      value: "intense",
      icon: "🟠",
      label: "Intense",
      desc: "Only bare minimum prompted, targets -50%, extras trackable",
    },
    {
      value: "critical",
      icon: "🔴",
      label: "Critical",
      desc: "Only bare minimum, single 9 PM check-in, streaks protected",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">🚀 Activate Sprint Mode</h1>
          <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
            ← Back
          </a>
        </div>
        <p className="text-sm text-neutral-400 mt-1">
          Focus on a deadline. The system scales back to protect your bare minimum.
        </p>
      </header>

      {/* Sprint Name */}
      <div className="mb-5">
        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 block">
          What&apos;s the sprint?
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. KMBF Final Submission"
          className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-600 outline-none focus:ring-2 focus:ring-brand/50"
        />
      </div>

      {/* Deadline */}
      <div className="mb-5">
        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 block">
          Deadline
        </label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          min={getToday()}
          className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-brand/50 [color-scheme:dark]"
        />
      </div>

      {/* Intensity */}
      <div className="mb-8">
        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 block">
          How intense?
        </label>
        <div className="space-y-2">
          {intensityOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setIntensity(opt.value)}
              className={`w-full text-left rounded-xl border p-4 transition-all ${
                intensity === opt.value
                  ? "bg-brand/10 border-brand/40"
                  : "bg-surface-800 border-surface-700 hover:border-surface-600"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span>{opt.icon}</span>
                <span className="text-sm font-bold">{opt.label}</span>
              </div>
              <p className="text-xs text-neutral-400">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Activate */}
      <button
        onClick={handleActivate}
        disabled={!canActivate}
        className={`w-full rounded-xl py-4 text-base font-bold transition-all ${
          canActivate
            ? "bg-brand hover:bg-brand-dark text-white active:scale-[0.98]"
            : "bg-surface-700 text-neutral-600 cursor-not-allowed"
        }`}
      >
        Activate Sprint →
      </button>

      {/* Past Sprints Archive */}
      {pastSprints.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Past Sprints
          </h2>
          <div className="space-y-2">
            {[...pastSprints].reverse().map((s) => {
              const topTasks = s.tasks.filter((t) => !t.parentId);
              const doneTasks = topTasks.filter((t) => t.completed);
              const taskPct = topTasks.length > 0 ? Math.round((doneTasks.length / topTasks.length) * 100) : 0;
              const intensityIcon = s.intensity === "moderate" ? "🟡" : s.intensity === "intense" ? "🟠" : "🔴";
              return (
                <div key={s.id} className="rounded-xl bg-surface-800 border border-surface-700 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white">{s.name}</span>
                    <span className="text-[10px] text-neutral-500">{intensityIcon} {s.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span>{s.startDate} → {s.deadline}</span>
                    {topTasks.length > 0 && (
                      <span className="text-neutral-400">Tasks: {doneTasks.length}/{topTasks.length} ({taskPct}%)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sprint Dashboard ───────────────────────────────────────
function SprintDashboard({
  state,
  sprint,
  dbSaveState,
  dbHabits,
  settings,
  onRefresh,
  onEndSprint,
}: {
  state: LocalState;
  sprint: SprintData;
  dbSaveState: (s: LocalState) => Promise<void>;
  dbHabits: import("@/types/database").Habit[] | null;
  settings: import("@/lib/store").UserSettings;
  onRefresh: () => void;
  onEndSprint: (archived: SprintData) => void;
}) {
  const [tasks, setTasks] = useState(sprint.tasks);
  const [newTask, setNewTask] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Calculate days
  const today = new Date();
  const deadlineDate = new Date(sprint.deadline + "T23:59:59");
  const startDate = new Date(sprint.startDate);
  const totalDays = Math.max(1, Math.ceil((deadlineDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const elapsedDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.max(0, Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const progressPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  // Task stats
  const topLevelTasks = tasks.filter((t) => !t.parentId);
  const completedTasks = topLevelTasks.filter((t) => t.completed);
  const taskPct = topLevelTasks.length > 0 ? Math.round((completedTasks.length / topLevelTasks.length) * 100) : 0;

  // Today's bare minimum status
  const todayLog = state.logs.find((l) => l.date === getToday());

  // Intensity badge
  const intensityBadge =
    sprint.intensity === "moderate" ? "🟡 Moderate" :
    sprint.intensity === "intense" ? "🟠 Intense" : "🔴 Critical";

  function addTask() {
    if (!newTask.trim()) return;
    const task = {
      id: crypto.randomUUID(),
      parentId: null,
      title: newTask.trim(),
      completed: false,
      dueDate: null,
      completedAt: null,
    };
    const updated = [...tasks, task];
    setTasks(updated);
    persistTasks(updated);
    setNewTask("");
    setShowAddTask(false);
  }

  function toggleTask(taskId: string) {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          completed: !t.completed,
          completedAt: !t.completed ? new Date().toISOString() : null,
        };
      }
      return t;
    });
    setTasks(updated);
    persistTasks(updated);
  }

  function addSubTask(parentId: string, title: string) {
    const sub = {
      id: crypto.randomUUID(),
      parentId,
      title,
      completed: false,
      dueDate: null,
      completedAt: null,
    };
    const updated = [...tasks, sub];
    setTasks(updated);
    persistTasks(updated);
  }

  function removeTask(taskId: string) {
    const updated = tasks.filter((t) => t.id !== taskId && t.parentId !== taskId);
    setTasks(updated);
    persistTasks(updated);
  }

  async function persistTasks(updatedTasks: SprintData["tasks"]) {
    if (state.activeSprint) {
      const updated = {
        ...state,
        activeSprint: { ...state.activeSprint, tasks: updatedTasks },
      };
      await dbSaveState(updated);
      onRefresh();
    }
  }

  async function handleEndSprint() {
    const archived: SprintData = {
      ...sprint,
      tasks: tasks,
      status: "completed",
      completedAt: new Date().toISOString(),
    };

    const updated = {
      ...state,
      sprintHistory: [...(state.sprintHistory ?? []), archived],
      activeSprint: null,
    };
    await dbSaveState(updated);

    setShowConfirm(false);
    onEndSprint(archived);
  }

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Sprint Header */}
      <header className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚀</span>
            <h1 className="text-lg font-bold">SPRINT MODE</h1>
          </div>
          <a href="/" className="text-neutral-500 text-xs hover:text-neutral-300">
            Dashboard
          </a>
        </div>
        <div className="text-sm font-semibold text-brand">{sprint.name}</div>
        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
          <span>{intensityBadge}</span>
          <span>⏰ {remainingDays} days remaining</span>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>Day {elapsedDays}/{totalDays}</span>
          <span>{progressPct}% elapsed</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-700">
          <div
            className="h-2 rounded-full bg-brand transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Sprint Tasks */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            📋 Sprint Tasks — {completedTasks.length}/{topLevelTasks.length}
          </h2>
          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className="text-xs text-brand hover:text-brand-light font-bold"
          >
            + Add
          </button>
        </div>

        {/* Add task input */}
        {showAddTask && (
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="New task..."
              className="flex-1 bg-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-brand/50"
              autoFocus
            />
            <button
              onClick={addTask}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-dark"
            >
              Add
            </button>
          </div>
        )}

        {/* Task list */}
        <div className="space-y-1">
          {topLevelTasks.length === 0 && (
            <p className="text-xs text-neutral-600 py-2">No tasks yet. Add your sprint goals above.</p>
          )}
          {topLevelTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              subTasks={tasks.filter((t) => t.parentId === task.id)}
              onToggle={toggleTask}
              onAddSub={addSubTask}
              onRemove={removeTask}
            />
          ))}
        </div>

        {/* Task progress bar */}
        {topLevelTasks.length > 0 && (
          <div className="mt-3">
            <div className="w-full h-1.5 rounded-full bg-surface-700">
              <div
                className="h-1.5 rounded-full bg-done transition-all duration-500"
                style={{ width: `${taskPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Bare Minimum Status */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
          🛡️ Bare Minimum Status
        </h2>
        {todayLog ? (
          <div className="text-sm">
            <span className="text-white font-medium">
              Today: {todayLog.bareMinimumMet ? "✅ Met" : "⏳ In progress"}
            </span>
          </div>
        ) : (
          <div className="text-sm text-neutral-500">Not logged yet today</div>
        )}
        <div className="text-xs text-neutral-400 mt-1">
          Sprint streak: {sprint.bareMinimumDaysMet} days of minimums
        </div>
      </section>

      {/* Streaks (protected mode for Critical) */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
          🔥 Streaks {sprint.intensity === "critical" ? "(protected mode)" : ""}
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {["prayer", "bible-reading", "training", "journal"].map((slug) => {
            const habit = getResolvedHabits(false, dbHabits, settings).find((h: { slug: string }) => h.slug === slug);
            return (
              <div key={slug} className="flex items-center gap-1 text-neutral-300">
                <span>{habit?.icon ?? "🔥"}</span>
                <span>{state.streaks[slug] ?? 0}d</span>
                <span className="text-neutral-500 text-xs">{habit?.name ?? slug}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bad Habits During Sprint */}
      <section className="rounded-xl bg-surface-800 border border-red-900/30 p-4 mb-6">
        <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
          ⚠️ Bad Habits (still watching)
        </h2>
        <p className="text-xs text-neutral-500">
          Bad habits are tracked during sprints — they tend to spike under stress.
        </p>
      </section>

      {/* End Sprint Confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="bg-surface-800 border border-surface-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">End Sprint?</h3>
            <p className="text-sm text-neutral-400 mb-1">
              &ldquo;{sprint.name}&rdquo; will be archived with all its tasks.
            </p>
            <p className="text-xs text-neutral-500 mb-6">
              {completedTasks.length}/{topLevelTasks.length} tasks completed ({taskPct}%)
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl bg-surface-700 py-3 text-sm font-medium text-neutral-300 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSprint}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white active:scale-95 transition-all"
              >
                End Sprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-3 pb-4">
        <a
          href="/checkin"
          className="flex-1 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-bold py-3 text-center transition-colors"
        >
          📝 Check-in
        </a>
        <button
          onClick={() => setShowConfirm(true)}
          className="rounded-xl bg-surface-700 hover:bg-surface-600 text-neutral-300 text-sm font-medium px-4 py-3 transition-colors"
        >
          End Sprint
        </button>
      </div>
    </div>
  );
}

// ─── Sprint Summary ─────────────────────────────────────────
function SprintSummary({
  sprint,
  state,
  onNewSprint,
}: {
  sprint: SprintData;
  state: LocalState;
  onNewSprint: () => void;
}) {
  const startDate = new Date(sprint.startDate);
  const endDate = sprint.completedAt ? new Date(sprint.completedAt) : new Date();
  const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Task stats
  const topTasks = sprint.tasks.filter((t) => !t.parentId);
  const completedTasks = topTasks.filter((t) => t.completed);
  const incompleteTasks = topTasks.filter((t) => !t.completed);
  const taskPct = topTasks.length > 0 ? Math.round((completedTasks.length / topTasks.length) * 100) : 0;

  // Sub-task stats
  const allSubTasks = sprint.tasks.filter((t) => t.parentId);
  const completedSubTasks = allSubTasks.filter((t) => t.completed);

  // XP earned during sprint period
  const sprintLogs = state.logs.filter(
    (l) => l.date >= sprint.startDate && l.date <= (sprint.completedAt?.slice(0, 10) ?? getToday())
  );
  const xpDuringSprint = sprintLogs.reduce((sum, l) => sum + l.xpEarned, 0);
  const bareMinDays = sprintLogs.filter((l) => l.bareMinimumMet).length;

  // Intensity
  const intensityLabel =
    sprint.intensity === "moderate" ? "🟡 Moderate" :
    sprint.intensity === "intense" ? "🟠 Intense" : "🔴 Critical";

  // Grade
  const grade =
    taskPct >= 90 && bareMinDays >= totalDays * 0.8 ? { label: "S", color: "text-amber-400", msg: "Exceptional. You delivered under pressure AND protected the system." } :
    taskPct >= 75 ? { label: "A", color: "text-done", msg: "Strong sprint. Tasks delivered, system protected." } :
    taskPct >= 50 ? { label: "B", color: "text-blue-400", msg: "Solid effort. Room to grow but you showed up." } :
    taskPct >= 25 ? { label: "C", color: "text-later", msg: "Sprint was tough. The fact you ran one shows intent." } :
    { label: "D", color: "text-missed", msg: "This sprint didn't go as planned. What would you do differently?" };

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="text-center mb-8 pt-4">
        <div className="text-5xl mb-3">🏁</div>
        <h1 className="text-2xl font-black text-white mb-1">Sprint Complete</h1>
        <p className="text-brand font-semibold">{sprint.name}</p>
        <p className="text-xs text-neutral-500 mt-1">
          {sprint.startDate} → {sprint.completedAt?.slice(0, 10)} • {totalDays} days • {intensityLabel}
        </p>
      </header>

      {/* Grade */}
      <section className="text-center mb-6">
        <div className={`text-7xl font-black ${grade.color}`}>{grade.label}</div>
        <p className="text-sm text-neutral-400 mt-2 max-w-xs mx-auto">{grade.msg}</p>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <StatBox label="Tasks Done" value={`${completedTasks.length}/${topTasks.length}`} sub={`${taskPct}%`} color="text-done" />
        <StatBox label="Duration" value={`${totalDays}`} sub="days" color="text-brand" />
        <StatBox label="Bare Min Days" value={`${bareMinDays}`} sub={`of ${totalDays}`} color="text-blue-400" />
        <StatBox label="XP Earned" value={`+${xpDuringSprint}`} sub="during sprint" color="text-amber-400" />
      </section>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <section className="rounded-xl bg-surface-800 border border-done/20 p-4 mb-4">
          <h2 className="text-xs font-bold text-done uppercase tracking-wider mb-3">
            ✅ Completed ({completedTasks.length})
          </h2>
          <div className="space-y-1.5">
            {completedTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="text-done text-xs">✓</span>
                <span className="text-sm text-neutral-300">{t.title}</span>
                {t.completedAt && (
                  <span className="text-[10px] text-neutral-600 ml-auto">
                    {t.completedAt.slice(0, 10)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* Sub-tasks */}
          {completedSubTasks.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              + {completedSubTasks.length} sub-task{completedSubTasks.length !== 1 ? "s" : ""} completed
            </p>
          )}
        </section>
      )}

      {/* Incomplete Tasks */}
      {incompleteTasks.length > 0 && (
        <section className="rounded-xl bg-surface-800 border border-later/20 p-4 mb-4">
          <h2 className="text-xs font-bold text-later uppercase tracking-wider mb-3">
            ⏳ Unfinished ({incompleteTasks.length})
          </h2>
          <div className="space-y-1.5">
            {incompleteTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="text-neutral-600 text-xs">○</span>
                <span className="text-sm text-neutral-500">{t.title}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-600 mt-2 italic">
            These can carry into your next sprint.
          </p>
        </section>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-3 pb-4 pt-4">
        <button
          onClick={onNewSprint}
          className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-bold py-4 transition-colors active:scale-[0.98]"
        >
          🚀 Start New Sprint
        </button>
        <a
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-surface-800 hover:bg-surface-700 transition-colors"
        >
          🏠 Dashboard
        </a>
      </div>
    </div>
  );
}

// ─── Stat Box ───────────────────────────────────────────────
function StatBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 p-4 text-center">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-neutral-500">{sub}</p>
    </div>
  );
}

// ─── Task Item Component ────────────────────────────────────
function TaskItem({
  task,
  subTasks,
  onToggle,
  onAddSub,
  onRemove,
}: {
  task: SprintData["tasks"][0];
  subTasks: SprintData["tasks"];
  onToggle: (id: string) => void;
  onAddSub: (parentId: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const [showSubInput, setShowSubInput] = useState(false);
  const [subTitle, setSubTitle] = useState("");

  function handleAddSub() {
    if (!subTitle.trim()) return;
    onAddSub(task.id, subTitle.trim());
    setSubTitle("");
    setShowSubInput(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 group">
        <button
          onClick={() => onToggle(task.id)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
            task.completed
              ? "bg-done border-done text-white"
              : "border-neutral-600 hover:border-neutral-400"
          }`}
        >
          {task.completed && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <span className={`text-sm flex-1 ${task.completed ? "line-through text-neutral-600" : "text-neutral-200"}`}>
          {task.title}
        </span>
        <div className="hidden group-hover:flex items-center gap-1">
          <button
            onClick={() => setShowSubInput(!showSubInput)}
            className="text-[10px] text-neutral-600 hover:text-neutral-400"
            title="Add sub-task"
          >
            +sub
          </button>
          <button
            onClick={() => onRemove(task.id)}
            className="text-[10px] text-neutral-600 hover:text-red-400"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Sub-tasks */}
      {subTasks.length > 0 && (
        <div className="ml-7 space-y-0.5">
          {subTasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 py-1 group">
              <button
                onClick={() => onToggle(sub.id)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                  sub.completed
                    ? "bg-done border-done text-white"
                    : "border-neutral-700 hover:border-neutral-500"
                }`}
              >
                {sub.completed && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <span className={`text-xs flex-1 ${sub.completed ? "line-through text-neutral-600" : "text-neutral-400"}`}>
                {sub.title}
              </span>
              <button
                onClick={() => onRemove(sub.id)}
                className="hidden group-hover:block text-[10px] text-neutral-700 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add sub-task input */}
      {showSubInput && (
        <div className="ml-7 flex gap-2 mt-1 mb-2">
          <input
            type="text"
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSub()}
            placeholder="Sub-task..."
            className="flex-1 bg-surface-700 rounded px-2 py-1.5 text-xs text-white placeholder-neutral-600 outline-none"
            autoFocus
          />
          <button
            onClick={handleAddSub}
            className="rounded bg-brand/20 text-brand px-2 py-1.5 text-xs font-bold hover:bg-brand/30"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
