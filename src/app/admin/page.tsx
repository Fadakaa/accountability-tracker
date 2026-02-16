"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  addAdminTask,
  toggleAdminTask,
  removeAdminTask,
  focusBacklogTask,
  unfocusBacklogTask,
  getToday,
  getCompletedAdminHistory,
  getAdminVelocity,
  loadAllAdminTasks,
  loadAdminTasks as loadAdminTasksLocal,
  loadAdminBacklog as loadAdminBacklogLocal,
} from "@/lib/store";
import type { AdminTask, AdminVelocity, TaskSeverity } from "@/lib/store";
import { saveAdminTaskToDB, deleteAdminTaskFromDB } from "@/lib/db";
import { VelocityStats, SlippingBanner } from "@/components/AdminVelocity";

type Tab = "today" | "backlog" | "history";

// ─── Severity helpers ────────────────────────────────────────

const SEVERITY_CONFIG: Record<TaskSeverity, { label: string; color: string; bg: string; border: string }> = {
  low: { label: "LOW", color: "text-neutral-400", bg: "bg-neutral-700/50", border: "border-neutral-600" },
  medium: { label: "MED", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  high: { label: "HIGH", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  critical: { label: "CRIT", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
};

function SeverityBadge({ severity }: { severity: TaskSeverity }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.color} ${cfg.bg} border ${cfg.border} shrink-0 leading-none`}>
      {cfg.label}
    </span>
  );
}

// ─── Due date helpers ────────────────────────────────────────

function getDueDateInfo(dueDate: string): { label: string; isOverdue: boolean; daysAway: number } {
  const today = new Date(getToday() + "T12:00:00");
  const due = new Date(dueDate + "T12:00:00");
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `OVERDUE ${Math.abs(diffDays)}d`, isOverdue: true, daysAway: diffDays };
  } else if (diffDays === 0) {
    return { label: "Due today", isOverdue: false, daysAway: 0 };
  } else if (diffDays === 1) {
    return { label: "Due tomorrow", isOverdue: false, daysAway: 1 };
  } else {
    return { label: `Due in ${diffDays}d`, isOverdue: false, daysAway: diffDays };
  }
}

function DueDateLabel({ dueDate, completed }: { dueDate: string; completed: boolean }) {
  const info = getDueDateInfo(dueDate);
  if (completed) {
    return <span className="text-[9px] text-neutral-600 shrink-0">{info.label}</span>;
  }
  if (info.isOverdue) {
    return <span className="text-[9px] text-red-400 font-bold shrink-0 animate-pulse">{info.label}</span>;
  }
  if (info.daysAway === 0) {
    return <span className="text-[9px] text-amber-400 font-medium shrink-0">{info.label}</span>;
  }
  if (info.daysAway <= 2) {
    return <span className="text-[9px] text-amber-500/70 shrink-0">{info.label}</span>;
  }
  return <span className="text-[9px] text-neutral-500 shrink-0">{info.label}</span>;
}

function TaskMetaBadges({ task }: { task: AdminTask }) {
  return (
    <>
      {task.severity && <SeverityBadge severity={task.severity} />}
      {task.dueDate && <DueDateLabel dueDate={task.dueDate} completed={task.completed} />}
    </>
  );
}

function isTaskOverdue(task: AdminTask): boolean {
  if (!task.dueDate || task.completed) return false;
  return getDueDateInfo(task.dueDate).isOverdue;
}

// ─── Expandable details section for task creation ────────────

function TaskDetailsSection({
  dueDate,
  setDueDate,
  consequence,
  setConsequence,
  severity,
  setSeverity,
}: {
  dueDate: string;
  setDueDate: (v: string) => void;
  consequence: string;
  setConsequence: (v: string) => void;
  severity: TaskSeverity | "";
  setSeverity: (v: TaskSeverity | "") => void;
}) {
  return (
    <div className="space-y-2 py-2 px-1">
      {/* Due date */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-16 shrink-0">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="flex-1 bg-surface-700 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500/50 [color-scheme:dark]"
        />
        {dueDate && (
          <button
            onClick={() => setDueDate("")}
            className="text-[10px] text-neutral-600 hover:text-neutral-400"
          >
            clear
          </button>
        )}
      </div>

      {/* Severity */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-16 shrink-0">Severity</label>
        <div className="flex gap-1">
          {(["low", "medium", "high", "critical"] as TaskSeverity[]).map((s) => {
            const cfg = SEVERITY_CONFIG[s];
            const isSelected = severity === s;
            return (
              <button
                key={s}
                onClick={() => setSeverity(isSelected ? "" : s)}
                className={`text-[9px] font-bold px-2 py-1 rounded border transition-all ${
                  isSelected
                    ? `${cfg.color} ${cfg.bg} ${cfg.border}`
                    : "text-neutral-600 bg-surface-700/50 border-surface-600 hover:text-neutral-400"
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Consequence */}
      <div className="flex items-start gap-2">
        <label className="text-[10px] text-neutral-500 w-16 shrink-0 mt-1.5">If missed</label>
        <input
          type="text"
          value={consequence}
          onChange={(e) => setConsequence(e.target.value)}
          placeholder="e.g., Late payment fee"
          className="flex-1 bg-surface-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-neutral-600 outline-none focus:ring-1 focus:ring-blue-500/50"
        />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("today");
  const [todayTasks, setTodayTasks] = useState<AdminTask[]>([]);
  const [backlog, setBacklog] = useState<AdminTask[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [showFocusPicker, setShowFocusPicker] = useState(false);
  const [velocity, setVelocity] = useState<AdminVelocity | null>(null);

  // Details section state
  const [showDetails, setShowDetails] = useState(false);
  const [detailDueDate, setDetailDueDate] = useState("");
  const [detailConsequence, setDetailConsequence] = useState("");
  const [detailSeverity, setDetailSeverity] = useState<TaskSeverity | "">("");

  // Expanded consequence view per-task
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const resetDetails = useCallback(() => {
    setShowDetails(false);
    setDetailDueDate("");
    setDetailConsequence("");
    setDetailSeverity("");
  }, []);

  // Read from localStorage — this is always the freshest source after any action
  function refreshLocal() {
    setTodayTasks(loadAdminTasksLocal());
    setBacklog(loadAdminBacklogLocal());
    setVelocity(getAdminVelocity());
  }

  // On mount: load from localStorage immediately (instant, always correct)
  useEffect(() => {
    refreshLocal();
  }, []);

  const todayDone = todayTasks.filter((t) => t.completed).length;
  const todayTotal = todayTasks.length;
  const todayPct = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;

  // Backlog tasks NOT already focused today
  const unfocusedBacklog = useMemo(() => {
    const todayIds = new Set(todayTasks.map((t) => t.id));
    return backlog.filter((t) => !todayIds.has(t.id));
  }, [backlog, todayTasks]);

  function handleAddTask(target: "today" | "backlog") {
    if (!newTaskText.trim()) return;
    const details = (detailDueDate || detailConsequence || detailSeverity)
      ? {
          ...(detailDueDate && { dueDate: detailDueDate }),
          ...(detailConsequence && { consequence: detailConsequence }),
          ...(detailSeverity && { severity: detailSeverity as TaskSeverity }),
        }
      : undefined;
    const task = addAdminTask(
      newTaskText.trim(),
      target === "backlog" ? "backlog" : "adhoc",
      undefined,
      details,
    );
    setNewTaskText("");
    setShowAddInput(false);
    resetDetails();
    refreshLocal(); // instant UI update from localStorage
    saveAdminTaskToDB(task).catch(() => {}); // background Supabase sync
  }

  function handleFocus(taskId: string) {
    focusBacklogTask(taskId); // writes to localStorage
    refreshLocal(); // instant UI update
    const updated = loadAllAdminTasks().find((t) => t.id === taskId);
    if (updated) saveAdminTaskToDB(updated).catch(() => {}); // background sync
  }

  function handleUnfocus(taskId: string) {
    unfocusBacklogTask(taskId); // writes to localStorage
    refreshLocal(); // instant UI update
    const updated = loadAllAdminTasks().find((t) => t.id === taskId);
    if (updated) saveAdminTaskToDB(updated).catch(() => {}); // background sync
  }

  function handleToggle(taskId: string) {
    toggleAdminTask(taskId); // writes to localStorage
    refreshLocal(); // instant UI update
    const updated = loadAllAdminTasks().find((t) => t.id === taskId);
    if (updated) saveAdminTaskToDB(updated).catch(() => {}); // background sync
  }

  function handleRemove(taskId: string) {
    removeAdminTask(taskId); // writes to localStorage
    refreshLocal(); // instant UI update
    deleteAdminTaskFromDB(taskId).catch(() => {}); // background sync
  }

  // Completed admin history
  const history = useMemo(() => getCompletedAdminHistory(), []);

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <h1 className="text-lg font-bold">General Admin</h1>
          </div>
          <Link href="/" className="text-neutral-500 text-xs hover:text-neutral-300">
            Dashboard
          </Link>
        </div>
        <p className="text-sm text-neutral-400">
          Your to-do list. Add tasks to the backlog, focus on what matters today.
        </p>
      </header>

      {/* Today's Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>Today: {todayDone}/{todayTotal} done</span>
          <span>{todayPct}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-700">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${todayPct}%` }}
          />
        </div>
      </div>

      {/* Velocity Stats */}
      {velocity && <VelocityStats velocity={velocity} />}

      {/* Slipping Tasks Warning */}
      {velocity && <SlippingBanner velocity={velocity} />}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-800 rounded-xl p-1">
        {([
          { key: "today" as Tab, label: `Today (${todayTotal})`, icon: "🎯" },
          { key: "backlog" as Tab, label: `Backlog (${backlog.length})`, icon: "📥" },
          { key: "history" as Tab, label: "History", icon: "📊" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
              tab === t.key
                ? "bg-surface-700 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ─── TODAY TAB ──────────────────────────────────────── */}
      {tab === "today" && (
        <>
          {/* Today's focused tasks */}
          <section className="rounded-xl bg-surface-800 border border-blue-900/30 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                Today&apos;s Focus
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFocusPicker(!showFocusPicker)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                >
                  {showFocusPicker ? "Done" : "+ From backlog"}
                </button>
                <button
                  onClick={() => { setShowAddInput(!showAddInput); setShowFocusPicker(false); resetDetails(); }}
                  className="text-[10px] text-brand hover:text-brand-light font-medium"
                >
                  + New
                </button>
              </div>
            </div>

            {/* Add new task inline */}
            {showAddInput && (
              <div className="mb-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !showDetails) handleAddTask("today");
                    }}
                    placeholder="New task for today..."
                    className="flex-1 bg-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-blue-500/50"
                    autoFocus
                  />
                  <button
                    onClick={() => handleAddTask("today")}
                    className="rounded-lg bg-blue-500/20 text-blue-400 px-3 py-2 text-xs font-bold hover:bg-blue-500/30"
                  >
                    Add
                  </button>
                </div>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-[10px] text-neutral-600 hover:text-neutral-400 mt-1.5 ml-1 transition-colors"
                >
                  {showDetails ? "Hide details" : "+ Add details (due date, severity...)"}
                </button>
                {showDetails && (
                  <div className="mt-1 rounded-lg bg-surface-700/30 border border-surface-600 p-2">
                    <TaskDetailsSection
                      dueDate={detailDueDate}
                      setDueDate={setDetailDueDate}
                      consequence={detailConsequence}
                      setConsequence={setDetailConsequence}
                      severity={detailSeverity}
                      setSeverity={setDetailSeverity}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Focus picker — pick from backlog */}
            {showFocusPicker && (
              <div className="mb-3 rounded-lg bg-surface-700/50 border border-surface-600 p-3">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
                  Pick from backlog
                </p>
                {unfocusedBacklog.length === 0 ? (
                  <p className="text-xs text-neutral-600 py-1">
                    No unfocused backlog tasks. Add some in the Backlog tab.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {unfocusedBacklog.map((task) => (
                      <div key={task.id} className="flex items-center gap-2">
                        <button
                          onClick={() => handleFocus(task.id)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 active:text-blue-200 font-bold shrink-0 px-2 py-1.5 -my-1"
                        >
                          + Focus
                        </button>
                        <span className="text-xs text-neutral-400 flex-1">{task.title}</span>
                        <TaskMetaBadges task={task} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Today's task list */}
            <div className="space-y-1">
              {todayTasks.length === 0 && !showAddInput && (
                <p className="text-xs text-neutral-600 py-3 text-center">
                  No tasks focused for today.
                  <br />
                  <span className="text-blue-500">Add a task</span> or <span className="text-blue-500">focus from backlog</span>.
                </p>
              )}
              {todayTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 py-1.5 group">
                  <button
                    onClick={() => handleToggle(task.id)}
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      task.completed
                        ? "bg-done border-done text-white"
                        : "border-neutral-600 hover:border-neutral-400 active:border-neutral-300"
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
                  {task.inBacklog && (
                    <span className="text-[9px] text-blue-500/50 shrink-0">backlog</span>
                  )}
                  {task.source === "planned" && (
                    <span className="text-[9px] text-amber-500/50 shrink-0">planned</span>
                  )}
                  <div className="flex items-center gap-0">
                    {task.inBacklog && (
                      <button
                        onClick={() => handleUnfocus(task.id)}
                        className="text-[11px] text-neutral-500 hover:text-neutral-300 active:text-neutral-200 px-2 py-1.5 -my-1"
                      >
                        unfocus
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(task.id)}
                      className="text-sm text-neutral-600 hover:text-red-400 active:text-red-400 px-2 py-1.5 -my-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Quick actions */}
          <Link
            href="/checkin"
            className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-bold py-3 text-center transition-colors active:scale-[0.98] block"
          >
            📝 Go to Check-in
          </Link>
        </>
      )}

      {/* ─── BACKLOG TAB ────────────────────────────────────── */}
      {tab === "backlog" && (
        <section className="rounded-xl bg-surface-800 border border-surface-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Backlog
            </h2>
            <button
              onClick={() => setShowAddInput(!showAddInput)}
              className="text-[10px] text-brand hover:text-brand-light font-medium"
            >
              + Add
            </button>
          </div>

          <p className="text-[10px] text-neutral-600 mb-3">
            Persistent tasks. Focus the ones you want to tackle today.
          </p>

          {/* Add to backlog */}
          {showAddInput && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTask("backlog")}
                placeholder="Add to backlog..."
                className="flex-1 bg-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-brand/50"
                autoFocus
              />
              <button
                onClick={() => handleAddTask("backlog")}
                className="rounded-lg bg-brand/20 text-brand px-3 py-2 text-xs font-bold hover:bg-brand/30"
              >
                Add
              </button>
            </div>
          )}

          <div className="space-y-1">
            {backlog.length === 0 && (
              <p className="text-xs text-neutral-600 py-3 text-center">
                Backlog is empty. Add tasks that you need to get done eventually.
              </p>
            )}
            {backlog.map((task) => {
              const isFocused = task.date === getToday();
              return (
                <div key={task.id} className="flex items-center gap-2 py-1.5 group">
                  <span className="w-5 h-5 rounded-md border-2 border-neutral-700 flex items-center justify-center shrink-0 text-[10px] text-neutral-600">
                    {isFocused ? "🎯" : "○"}
                  </span>
                  <span className="text-sm flex-1 text-neutral-300">{task.title}</span>
                  <div className="flex items-center gap-0">
                    {isFocused ? (
                      <button
                        onClick={() => handleUnfocus(task.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 active:text-blue-200 font-medium px-2 py-1.5 -my-1"
                      >
                        Unfocus
                      </button>
                    ) : (
                      <button
                        onClick={() => handleFocus(task.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 active:text-blue-200 font-medium px-2 py-1.5 -my-1"
                      >
                        Focus today
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(task.id)}
                      className="text-sm text-neutral-600 hover:text-red-400 active:text-red-400 px-2 py-1.5 -my-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── HISTORY TAB ────────────────────────────────────── */}
      {tab === "history" && (
        <section className="rounded-xl bg-surface-800 border border-surface-700 p-4">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
            Completion History
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-neutral-600 py-3 text-center">
              No completed admin tasks yet.
            </p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 14).map((day) => {
                const pct = day.total > 0 ? Math.round((day.completed / day.total) * 100) : 0;
                const isToday = day.date === getToday();
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className={`text-xs font-mono w-20 ${isToday ? "text-blue-400 font-bold" : "text-neutral-500"}`}>
                      {isToday ? "Today" : day.date.slice(5)}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-700">
                      <div
                        className="h-1.5 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 w-12 text-right">
                      {day.completed}/{day.total}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
