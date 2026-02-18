// Local storage-based state — works offline before Supabase is connected
// Stores check-in data, streaks, and XP on-device

import type { LogStatus, SprintIntensity, TrainingType, HabitStack, Habit } from "@/types/database";

const STORAGE_KEY = "accountability-tracker";
const GYM_STORAGE_KEY = "accountability-gym";
const GYM_ROUTINES_KEY = "accountability-gym-routines";
const GYM_EXERCISES_KEY = "accountability-gym-exercises";
const SETTINGS_KEY = "accountability-settings";
const DEFERRED_KEY = "accountability-deferred";
const ADMIN_KEY = "accountability-admin";
const SHOWING_UP_KEY = "accountability-showing-up";
const BADGES_KEY = "accountability-badges";

// All app-specific localStorage keys (for clearing on sign-out)
const ALL_STORAGE_KEYS = [
  STORAGE_KEY,
  GYM_STORAGE_KEY,
  GYM_ROUTINES_KEY,
  GYM_EXERCISES_KEY,
  SETTINGS_KEY,
  DEFERRED_KEY,
  ADMIN_KEY,
  SHOWING_UP_KEY,
  BADGES_KEY,
  "accountability-migrated",
  "accountability-habit-id-map",
  "accountability-notifications",
  "accountability-sync-queue",
];

/** Wipe all app data from localStorage (called on sign-out to prevent data leaking between users) */
export function clearAllLocalData() {
  if (typeof window === "undefined") return;
  // Log a stack trace so we can diagnose unexpected clears
  console.warn("[clearAllLocalData] CLEARING ALL DATA. Stack:", new Error().stack);
  for (const key of ALL_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

// ─── Deferred Habits (temporary reschedule for today only) ───
export interface DeferredHabit {
  habitId: string;
  fromStack: HabitStack;
  toStack: HabitStack;
  date: string; // YYYY-MM-DD — auto-clears if not today
}

export function loadDeferred(): DeferredHabit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEFERRED_KEY);
    if (!raw) return [];
    const all: DeferredHabit[] = JSON.parse(raw);
    const today = getToday();
    // Auto-clean stale entries (not today)
    const valid = all.filter((d) => d.date === today);
    if (valid.length !== all.length) {
      localStorage.setItem(DEFERRED_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

export function addDeferral(habitId: string, fromStack: HabitStack, toStack: HabitStack): void {
  const deferred = loadDeferred();
  // Remove any existing deferral for this habit (prevent duplicates)
  const filtered = deferred.filter((d) => d.habitId !== habitId);
  filtered.push({ habitId, fromStack, toStack, date: getToday() });
  localStorage.setItem(DEFERRED_KEY, JSON.stringify(filtered));
}

export function removeDeferral(habitId: string): void {
  const deferred = loadDeferred();
  const filtered = deferred.filter((d) => d.habitId !== habitId);
  localStorage.setItem(DEFERRED_KEY, JSON.stringify(filtered));
}

export function getDeferredForStack(stack: HabitStack): DeferredHabit[] {
  return loadDeferred().filter((d) => d.toStack === stack);
}

export function isDeferredAway(habitId: string): boolean {
  return loadDeferred().some((d) => d.habitId === habitId);
}

// ─── Admin Tasks (daily to-do items) ─────────────────────
export type TaskSeverity = "low" | "medium" | "high" | "critical";

export interface AdminTask {
  id: string;
  title: string;
  completed: boolean;
  date: string;           // YYYY-MM-DD — the day this task is focused for (or "" for backlog-only)
  source: "adhoc" | "planned" | "backlog"; // backlog = persistent, adhoc = added today, planned = from Plan Tomorrow
  completedAt: string | null;
  createdAt: string;
  inBacklog: boolean;     // true = lives in backlog (may also be focused today)
  dueDate?: string;       // optional ISO date string (YYYY-MM-DD) — when the task must be done
  consequence?: string;   // free-text describing what happens if not done (e.g., "Late payment fee £25")
  severity?: TaskSeverity; // impact level: low | medium | high | critical
}

// ─── Admin Task Store ─────────────────────────────────────────
// Two views:
//   Backlog: all tasks where inBacklog=true and not completed
//   Today:   all tasks where date === today (focused from backlog or added ad-hoc)
// Tasks can be in backlog AND focused today simultaneously.
// Completing a focused task also marks it done in the backlog.

// Normalize tasks from storage (backward compat — old tasks lack inBacklog)
function normalizeTask(t: AdminTask): AdminTask {
  return { ...t, inBacklog: t.inBacklog ?? false };
}

export function loadAdminTasks(date?: string): AdminTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return [];
    const all: AdminTask[] = (JSON.parse(raw) as AdminTask[]).map(normalizeTask);
    const target = date ?? getToday();
    return all.filter((t) => t.date === target);
  } catch {
    return [];
  }
}

export function loadAdminBacklog(): AdminTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return [];
    const all: AdminTask[] = (JSON.parse(raw) as AdminTask[]).map(normalizeTask);
    return all.filter((t) => t.inBacklog && !t.completed);
  } catch {
    return [];
  }
}

export function loadAllAdminTasks(): AdminTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as AdminTask[]).map(normalizeTask);
  } catch {
    return [];
  }
}

export function saveAllAdminTasks(tasks: AdminTask[]): void {
  // Auto-clean completed backlog tasks older than 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const cleaned = tasks.filter((t) => {
    // Keep all uncompleted tasks
    if (!t.completed) return true;
    // Keep completed tasks from the last 30 days
    return (t.completedAt ?? t.createdAt) >= cutoffStr;
  });
  localStorage.setItem(ADMIN_KEY, JSON.stringify(cleaned));
}

export function addAdminTask(
  title: string,
  source: "adhoc" | "planned" | "backlog",
  date?: string,
  details?: { dueDate?: string; consequence?: string; severity?: TaskSeverity },
): AdminTask {
  const all = loadAllAdminTasks();
  const isBacklog = source === "backlog";
  const task: AdminTask = {
    id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    completed: false,
    date: isBacklog ? "" : (date ?? getToday()),
    source,
    completedAt: null,
    createdAt: new Date().toISOString(),
    inBacklog: isBacklog,
    ...(details?.dueDate && { dueDate: details.dueDate }),
    ...(details?.consequence && { consequence: details.consequence }),
    ...(details?.severity && { severity: details.severity }),
  };
  all.push(task);
  saveAllAdminTasks(all);
  return task;
}

// Focus a backlog task for today — creates today's entry referencing the backlog item
export function focusBacklogTask(taskId: string): void {
  const all = loadAllAdminTasks();
  const task = all.find((t) => t.id === taskId);
  if (task) {
    task.date = getToday();
  }
  saveAllAdminTasks(all);
}

// Unfocus a backlog task (remove from today, keep in backlog)
export function unfocusBacklogTask(taskId: string): void {
  const all = loadAllAdminTasks();
  const task = all.find((t) => t.id === taskId);
  if (task && task.inBacklog) {
    task.date = "";
  }
  saveAllAdminTasks(all);
}

export function toggleAdminTask(taskId: string): void {
  const all = loadAllAdminTasks();
  const task = all.find((t) => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    saveAllAdminTasks(all);
  }
}

export function removeAdminTask(taskId: string): void {
  const all = loadAllAdminTasks();
  saveAllAdminTasks(all.filter((t) => t.id !== taskId));
}

export function getAdminSummary(date?: string): { total: number; completed: number } {
  const tasks = loadAdminTasks(date);
  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.completed).length,
  };
}

export function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Get completed admin history for insights
export function getCompletedAdminHistory(): { date: string; completed: number; total: number }[] {
  const all = loadAllAdminTasks();
  const byDate: Record<string, { completed: number; total: number }> = {};
  for (const t of all) {
    if (!t.date) continue;
    if (!byDate[t.date]) byDate[t.date] = { completed: 0, total: 0 };
    byDate[t.date].total++;
    if (t.completed) byDate[t.date].completed++;
  }
  return Object.entries(byDate)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Admin Velocity & Slipping Tasks ─────────────────────

export interface SlippingTask {
  task: AdminTask;
  ageDays: number;
}

export interface AdminVelocity {
  // Today's stats
  completedToday: number;
  totalToday: number;
  // Rolling 7-day averages
  avgCompletedPerDay: number;   // tasks completed per day over last 7 days
  avgAddedPerDay: number;       // tasks created per day over last 7 days
  // Drag-over: incomplete tasks from previous days
  dragOverCount: number;
  // Health: "green" (completing > adding), "amber" (roughly even), "red" (backlog growing)
  health: "green" | "amber" | "red";
  // Slipping tasks (in backlog > 3 days)
  slippingTasks: SlippingTask[];
}

/** Identify tasks that have been in the backlog for more than `thresholdDays` days without being completed. */
export function getSlippingTasks(thresholdDays: number = 3): SlippingTask[] {
  const all = loadAllAdminTasks();
  const now = new Date();
  const results: SlippingTask[] = [];

  for (const task of all) {
    // Only consider incomplete tasks
    if (task.completed) continue;

    // Parse the creation date — createdAt is an ISO string
    const createdDate = new Date(task.createdAt);
    if (isNaN(createdDate.getTime())) continue;

    const ageDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > thresholdDays) {
      results.push({ task, ageDays });
    }
  }

  // Sort by age descending (oldest first)
  results.sort((a, b) => b.ageDays - a.ageDays);
  return results;
}

/** Calculate completion rate vs creation rate over the last 7 days. */
export function getAdminVelocity(): AdminVelocity {
  const all = loadAllAdminTasks();
  const today = getToday();
  const now = new Date();

  // Build date strings for the last 7 days
  const last7Dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    last7Dates.push(d.toISOString().slice(0, 10));
  }
  const oldestDate = last7Dates[last7Dates.length - 1];

  // Today's stats
  const todayTasks = all.filter((t) => t.date === today);
  const completedToday = todayTasks.filter((t) => t.completed).length;
  const totalToday = todayTasks.length;

  // Count tasks completed in the last 7 days
  let completedLast7 = 0;
  for (const task of all) {
    if (!task.completed || !task.completedAt) continue;
    const completedDate = task.completedAt.slice(0, 10);
    if (completedDate >= oldestDate && completedDate <= today) {
      completedLast7++;
    }
  }

  // Count tasks created in the last 7 days
  let addedLast7 = 0;
  for (const task of all) {
    const createdDate = task.createdAt.slice(0, 10);
    if (createdDate >= oldestDate && createdDate <= today) {
      addedLast7++;
    }
  }

  // How many days of data do we actually have? (at least 1 to avoid division by zero)
  const daysWithData = Math.max(1, last7Dates.filter((d) => {
    return all.some((t) => {
      const created = t.createdAt.slice(0, 10);
      const completed = t.completedAt?.slice(0, 10);
      return created === d || completed === d || t.date === d;
    });
  }).length);

  const avgCompletedPerDay = Math.round((completedLast7 / daysWithData) * 10) / 10;
  const avgAddedPerDay = Math.round((addedLast7 / daysWithData) * 10) / 10;

  // Drag-over: incomplete tasks from previous days (not today, not backlog-only)
  const dragOverCount = all.filter((t) => {
    if (t.completed) return false;
    if (!t.date) return false; // backlog-only tasks without a focused date
    return t.date < today;
  }).length;

  // Health indicator
  let health: "green" | "amber" | "red";
  if (addedLast7 === 0 && completedLast7 === 0) {
    health = "amber"; // no activity
  } else if (completedLast7 > addedLast7) {
    health = "green"; // clearing faster than accumulating
  } else if (completedLast7 >= addedLast7 * 0.8) {
    health = "amber"; // roughly even (within 80%)
  } else {
    health = "red"; // backlog is growing
  }

  // Also factor in drag-over for health
  if (health === "green" && dragOverCount > 3) {
    health = "amber";
  }
  if (dragOverCount > 7) {
    health = "red";
  }

  const slippingTasks = getSlippingTasks(3);

  return {
    completedToday,
    totalToday,
    avgCompletedPerDay,
    avgAddedPerDay,
    dragOverCount,
    health,
    slippingTasks,
  };
}

export type MissCategory = "trade-off" | "forgot" | "energy" | "time" | "other";

export interface DayLog {
  date: string; // YYYY-MM-DD
  entries: Record<string, { status: LogStatus; value: number | null; missReason?: string; missCategory?: MissCategory }>;
  badEntries: Record<string, { occurred: boolean; durationMinutes: number | null }>;
  adminSummary?: {
    total: number;
    completed: number;
    tasks: { title: string; completed: boolean }[];
  };
  xpEarned: number;
  bareMinimumMet: boolean;
  submittedAt: string;
}

/**
 * Merge two DayLogs for the same date by taking the union of all entries.
 * For overlapping habit entries, prefer whichever has a non-null status.
 * Keeps the higher XP and the more recent submittedAt.
 */
export function mergeDayLogs(a: DayLog, b: DayLog): DayLog {
  const merged: DayLog = {
    date: a.date,
    entries: { ...a.entries },
    badEntries: { ...a.badEntries },
    xpEarned: Math.max(a.xpEarned, b.xpEarned),
    bareMinimumMet: a.bareMinimumMet || b.bareMinimumMet,
    submittedAt: a.submittedAt > b.submittedAt ? a.submittedAt : b.submittedAt,
  };

  // Union entries from b — only overwrite if a's entry has no status
  for (const [id, entry] of Object.entries(b.entries)) {
    const existing = merged.entries[id];
    if (!existing || !existing.status) {
      merged.entries[id] = entry;
    }
  }

  // Union bad entries from b — only overwrite if a's entry has no occurred value
  for (const [id, entry] of Object.entries(b.badEntries)) {
    const existing = merged.badEntries[id];
    if (!existing || existing.occurred == null) {
      merged.badEntries[id] = entry;
    }
  }

  // Keep admin summary from whichever has it (prefer the one with more tasks)
  const aAdmin = a.adminSummary;
  const bAdmin = b.adminSummary;
  if (aAdmin && bAdmin) {
    merged.adminSummary = (aAdmin.total >= bAdmin.total) ? aAdmin : bAdmin;
  } else {
    merged.adminSummary = aAdmin || bAdmin;
  }

  return merged;
}

export interface SprintTask {
  id: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  dueDate: string | null;
  completedAt: string | null;
}

export interface SprintData {
  id: string;
  name: string;
  intensity: SprintIntensity;
  startDate: string;
  deadline: string;
  status: "active" | "completed" | "cancelled";
  tasks: SprintTask[];
  bareMinimumDaysMet: number;
  completedAt: string | null;
}

export interface WrapReflection {
  id: string;
  date: string;           // date of the wrap-up
  period: "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
  question: string;
  answer: string;
  forwardIntention?: string;
}

export interface StreakShield {
  habitSlug: string;
  available: boolean;       // earned after 14-day streak
  usedDate: string | null;  // ISO date when shield was consumed (one per month)
  earnedDate: string | null; // when the shield was earned
}

export interface LocalState {
  totalXp: number;
  currentLevel: number;
  streaks: Record<string, number>; // habit slug -> current streak days
  bareMinimumStreak: number;
  logs: DayLog[];
  activeSprint: SprintData | null;
  sprintHistory: SprintData[];
  reflections?: WrapReflection[];
  lastWrapDate?: string;        // date of last completed weekly wrap
  streakShields?: Record<string, StreakShield>; // habit slug -> shield state
}

const DEFAULT_STATE: LocalState = {
  totalXp: 0,
  currentLevel: 1,
  streaks: {},
  bareMinimumStreak: 0,
  logs: [],
  activeSprint: null,
  sprintHistory: [],
};

export function loadState(): LocalState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    // Merge with defaults so any fields added after initial save are present
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: LocalState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the active sprint context — intensity rules for check-in flow */
export function getSprintContext(stateArg?: LocalState): {
  active: boolean;
  intensity: SprintIntensity | null;
  name: string | null;
  bareMinimumOnly: boolean;     // intense + critical: only show bare minimum habits
  singleCheckin: boolean;       // critical: collapse all stacks into one 9PM check-in
  targetMultiplier: number;     // moderate: 0.75, intense: 0.5, critical: 0.5
  protectStreaks: boolean;       // critical: don't break streaks on miss
} {
  const state = stateArg ?? loadState();
  const sprint = state.activeSprint;
  if (!sprint || sprint.status !== "active") {
    return { active: false, intensity: null, name: null, bareMinimumOnly: false, singleCheckin: false, targetMultiplier: 1, protectStreaks: false };
  }
  const i = sprint.intensity;
  return {
    active: true,
    intensity: i,
    name: sprint.name,
    bareMinimumOnly: i === "intense" || i === "critical",
    singleCheckin: i === "critical",
    targetMultiplier: i === "moderate" ? 0.75 : 0.5,
    protectStreaks: i === "critical",
  };
}

export function getTodayLog(state: LocalState): DayLog | undefined {
  return state.logs.find((l) => l.date === getToday());
}

/**
 * Recalculate all streaks from log history.
 * Counts consecutive days ending at today (or yesterday if today not logged yet)
 * where each habit was marked "done". This is the source of truth — never
 * relies on the stored streak counter which can drift from double-submissions.
 *
 * IMPORTANT: Walks backwards day-by-day (not just through logged dates) so that
 * any day without a "done" entry breaks the streak — even if nothing was logged.
 *
 * Streak Shield: if a habit has an available shield (earned at 14+ day streak),
 * one missed day per month can be absorbed without breaking the streak.
 */
export function recalculateStreaks(state: LocalState, habitSlugsById: Record<string, string>): Record<string, number> {
  const today = getToday();
  const streaks: Record<string, number> = {};
  const shields = state.streakShields ?? {};

  // Get all unique habit IDs that have ever been logged
  const allHabitIds = new Set<string>();
  for (const log of state.logs) {
    for (const id of Object.keys(log.entries)) {
      allHabitIds.add(id);
    }
  }

  // Build a date → log Map for O(1) lookups
  const logByDate = new Map<string, (typeof state.logs)[0]>();
  for (const log of state.logs) {
    logByDate.set(log.date, log);
  }

  for (const habitId of allHabitIds) {
    const slug = habitSlugsById[habitId];
    if (!slug) continue;

    let streak = 0;
    const todayLog = logByDate.get(today);
    const todayEntry = todayLog?.entries[habitId];
    let startDate: string;

    // Check if shield can absorb today's miss
    const shield = shields[slug];
    const shieldUsable = shield?.available && !isShieldUsedThisMonth(shield.usedDate);

    if (todayEntry?.status === "done") {
      // Today is done — start counting from today
      startDate = today;
    } else if (todayEntry?.status === "missed") {
      // Today is explicitly missed — check shield
      if (shieldUsable && (state.streaks[slug] ?? 0) >= 14) {
        // Shield absorbs the miss — streak continues from yesterday
        const d = new Date(today + "T12:00:00");
        d.setDate(d.getDate() - 1);
        startDate = d.toISOString().slice(0, 10);
      } else {
        streaks[slug] = 0;
        continue;
      }
    } else {
      // Today not logged, "later" (deferred), or no entry — grace period,
      // start counting from yesterday since the day isn't over yet
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() - 1);
      startDate = d.toISOString().slice(0, 10);
    }

    // Walk backwards day-by-day from startDate (max 365 days safety)
    const cursor = new Date(startDate + "T12:00:00");
    let steps = 0;
    let shieldUsedInWalk = false;
    while (steps < 365) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const log = logByDate.get(dateStr);

      if (log?.entries[habitId]?.status === "done") {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
        steps++;
      } else if (
        !shieldUsedInWalk &&
        shieldUsable &&
        log?.entries[habitId]?.status === "missed"
      ) {
        // Shield absorbs one missed day during the walk
        shieldUsedInWalk = true;
        streak++; // Count this day as protected
        cursor.setDate(cursor.getDate() - 1);
        steps++;
      } else {
        break;
      }
    }

    streaks[slug] = streak;
  }

  return streaks;
}

/** Check if a shield was already used this calendar month */
function isShieldUsedThisMonth(usedDate: string | null): boolean {
  if (!usedDate) return false;
  const now = new Date();
  const used = new Date(usedDate);
  return used.getFullYear() === now.getFullYear() && used.getMonth() === now.getMonth();
}

/** Evaluate and update streak shields after streak recalculation.
 *  Earns shields for habits at 14+ day streaks. */
export function updateStreakShields(state: LocalState): Record<string, StreakShield> {
  const shields: Record<string, StreakShield> = { ...(state.streakShields ?? {}) };
  const today = getToday();

  for (const [slug, days] of Object.entries(state.streaks)) {
    if (!shields[slug]) {
      shields[slug] = { habitSlug: slug, available: false, usedDate: null, earnedDate: null };
    }

    const shield = shields[slug];

    // Earn shield at 14+ days (if not already available)
    if (days >= 14 && !shield.available) {
      // Check if shield was used this month — don't re-earn until next month
      if (!isShieldUsedThisMonth(shield.usedDate)) {
        shield.available = true;
        shield.earnedDate = today;
      }
    }

    // Reset shield availability at start of new month if it was used
    if (shield.usedDate && !isShieldUsedThisMonth(shield.usedDate)) {
      // New month — if streak is still 14+, re-earn the shield
      if (days >= 14) {
        shield.available = true;
        shield.earnedDate = today;
      }
    }
  }

  return shields;
}

/** Consume a streak shield for a habit (called when a miss is absorbed) */
export function useStreakShield(state: LocalState, habitSlug: string): boolean {
  const shields = state.streakShields ?? {};
  const shield = shields[habitSlug];
  if (!shield?.available) return false;
  if (isShieldUsedThisMonth(shield.usedDate)) return false;

  shield.available = false;
  shield.usedDate = getToday();
  state.streakShields = { ...shields, [habitSlug]: shield };
  return true;
}

export function getLevelForXP(xp: number): { level: number; title: string; xpRequired: number; nextXp: number } {
  // ~435 XP per perfect day. Thresholds calibrated so:
  // Lv2 = 1 perfect day, Lv3 = 3 days, Lv5 = ~2 weeks, Lv10 = ~3 months
  const levels = [
    { level: 1,  title: "Beginner",          xpRequired: 0 },
    { level: 2,  title: "Showing Up",        xpRequired: 400 },     // ~1 day
    { level: 3,  title: "Building Momentum", xpRequired: 1200 },    // ~3 days
    { level: 4,  title: "Forming Habits",    xpRequired: 2800 },    // ~1 week
    { level: 5,  title: "Consistent",        xpRequired: 5500 },    // ~2 weeks
    { level: 6,  title: "Dedicated",         xpRequired: 9500 },    // ~3 weeks
    { level: 7,  title: "Disciplined",       xpRequired: 15000 },   // ~5 weeks
    { level: 8,  title: "Relentless",        xpRequired: 22000 },   // ~7 weeks
    { level: 9,  title: "Atomic",            xpRequired: 31000 },   // ~10 weeks
    { level: 10, title: "Unshakeable",       xpRequired: 42000 },   // ~3 months
    { level: 11, title: "Identity Shift",    xpRequired: 56000 },   // ~4 months
    { level: 12, title: "The Standard",      xpRequired: 73000 },   // ~6 months
    { level: 13, title: "Elite",             xpRequired: 95000 },   // ~7 months
    { level: 14, title: "Legendary",         xpRequired: 125000 },  // ~10 months
    { level: 15, title: "Transcendent",      xpRequired: 165000 },  // ~1 year
  ];

  let current = levels[0];
  let next = levels[1];

  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i].xpRequired) {
      current = levels[i];
      next = levels[i + 1] ?? levels[i];
      break;
    }
  }

  return { ...current, nextXp: next.xpRequired };
}

// ─── Gym Session Storage ──────────────────────────────────

export interface GymSetLocal {
  weightKg: number | null;
  reps: number | null;
  isFailure: boolean;
}

export interface GymExerciseLocal {
  id: string;
  name: string;
  sets: GymSetLocal[];
}

export interface GymSessionLocal {
  id: string;
  date: string;
  trainingType: TrainingType;
  muscleGroup: string | null;
  durationMinutes: number | null;
  rpe: number | null;
  notes: string;
  justWalkedIn: boolean;
  exercises: GymExerciseLocal[];
  createdAt: string;
}

export function loadGymSessions(): GymSessionLocal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GYM_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GymSessionLocal[];
  } catch {
    return [];
  }
}

export function saveGymSession(session: GymSessionLocal): void {
  if (typeof window === "undefined") return;
  const sessions = loadGymSessions();
  sessions.push(session);
  localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(sessions));
}

// ─── Gym Routines (saved exercise templates) ─────────────

export interface GymRoutineExercise {
  name: string;
  defaultSets: number; // how many empty sets to pre-fill
}

export interface GymRoutine {
  id: string;
  name: string;
  trainingType: TrainingType;
  muscleGroup: string | null;
  exercises: GymRoutineExercise[];
  createdAt: string;
  updatedAt: string;
}

export function loadGymRoutines(): GymRoutine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GYM_ROUTINES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GymRoutine[];
  } catch {
    return [];
  }
}

export function saveGymRoutines(routines: GymRoutine[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GYM_ROUTINES_KEY, JSON.stringify(routines));
}

export function createGymRoutine(routine: Omit<GymRoutine, "id" | "createdAt" | "updatedAt">): GymRoutine {
  const now = new Date().toISOString();
  const newRoutine: GymRoutine = {
    ...routine,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const routines = loadGymRoutines();
  routines.push(newRoutine);
  saveGymRoutines(routines);
  return newRoutine;
}

export function updateGymRoutine(id: string, updates: Partial<Pick<GymRoutine, "name" | "exercises" | "muscleGroup">>): void {
  const routines = loadGymRoutines();
  const idx = routines.findIndex((r) => r.id === id);
  if (idx === -1) return;
  routines[idx] = { ...routines[idx], ...updates, updatedAt: new Date().toISOString() };
  saveGymRoutines(routines);
}

export function deleteGymRoutine(id: string): void {
  const routines = loadGymRoutines().filter((r) => r.id !== id);
  saveGymRoutines(routines);
}

// ─── Exercise Library (saved exercise names for voice extraction) ───

/** Load the deduplicated exercise name list */
export function loadExerciseLibrary(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GYM_EXERCISES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/** Save the exercise library (overwrites) */
export function saveExerciseLibrary(exercises: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GYM_EXERCISES_KEY, JSON.stringify(exercises));
}

/** Merge new exercise names into the library (case-insensitive dedup) */
export function mergeIntoExerciseLibrary(newNames: string[]): void {
  const existing = loadExerciseLibrary();
  const lowerSet = new Set(existing.map((n) => n.toLowerCase()));
  for (const name of newNames) {
    const trimmed = name.trim();
    if (trimmed && !lowerSet.has(trimmed.toLowerCase())) {
      existing.push(trimmed);
      lowerSet.add(trimmed.toLowerCase());
    }
  }
  saveExerciseLibrary(existing);
}

// ─── "You Keep Showing Up" Counter ──────────────────────

export interface ShowingUpData {
  totalOpens: number;
  uniqueDays: number;
  lastOpenDate: string; // YYYY-MM-DD
  firstOpenDate: string; // YYYY-MM-DD
}

export function recordAppOpen(): ShowingUpData {
  if (typeof window === "undefined") return { totalOpens: 0, uniqueDays: 0, lastOpenDate: "", firstOpenDate: "" };
  const today = getToday();
  try {
    const raw = localStorage.getItem(SHOWING_UP_KEY);
    const data: ShowingUpData = raw
      ? JSON.parse(raw)
      : { totalOpens: 0, uniqueDays: 0, lastOpenDate: "", firstOpenDate: today };

    data.totalOpens += 1;
    if (data.lastOpenDate !== today) {
      data.uniqueDays += 1;
      data.lastOpenDate = today;
    }
    if (!data.firstOpenDate) data.firstOpenDate = today;

    localStorage.setItem(SHOWING_UP_KEY, JSON.stringify(data));
    return data;
  } catch {
    return { totalOpens: 1, uniqueDays: 1, lastOpenDate: today, firstOpenDate: today };
  }
}

export function loadShowingUpData(): ShowingUpData {
  if (typeof window === "undefined") return { totalOpens: 0, uniqueDays: 0, lastOpenDate: "", firstOpenDate: "" };
  try {
    const raw = localStorage.getItem(SHOWING_UP_KEY);
    if (!raw) return { totalOpens: 0, uniqueDays: 0, lastOpenDate: "", firstOpenDate: "" };
    return JSON.parse(raw) as ShowingUpData;
  } catch {
    return { totalOpens: 0, uniqueDays: 0, lastOpenDate: "", firstOpenDate: "" };
  }
}

export function getWeekLogs(state: LocalState): DayLog[] {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  return state.logs.filter((l) => l.date >= weekStartStr);
}

export function getMonthLogs(state: LocalState): DayLog[] {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return state.logs.filter((l) => l.date >= monthStart);
}

export function getPrevWeekLogs(state: LocalState): DayLog[] {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // This Sunday
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekStartStr = prevWeekStart.toISOString().slice(0, 10);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  return state.logs.filter((l) => l.date >= prevWeekStartStr && l.date < weekStartStr);
}

// ─── User Settings Storage ────────────────────────────────

export interface HabitOverride {
  stack?: HabitStack;
  is_bare_minimum?: boolean;
  is_active?: boolean;
  current_level?: number;
  sort_order?: number;
  treeBranch?: string;  // User override for skill tree branch assignment
}

export interface LevelUpState {
  lastSuggestionDate: string | null;
  declinedUntil: string | null;
  levelUpDate: string | null;
  previousLevel: number | null;
}

export interface ChainItem {
  id: string;
  type: "habit" | "anchor";
  habitId?: string;       // only for type=habit
  label?: string;         // only for type=anchor (e.g. "Wake", "Phone down")
  icon?: string;
}

export interface NotificationSlot {
  id: string;
  ukHour: number;
  ukMinute: number;
  label: string;
  icon: string;
  enabled: boolean;
}

export const DEFAULT_NOTIFICATION_SLOTS: NotificationSlot[] = [
  { id: "morning", ukHour: 7, ukMinute: 0, label: "Morning", icon: "🌅", enabled: true },
  { id: "mid-morning", ukHour: 10, ukMinute: 0, label: "Mid-morning", icon: "☕", enabled: true },
  { id: "midday", ukHour: 13, ukMinute: 0, label: "Afternoon", icon: "☀️", enabled: true },
  { id: "mid-afternoon", ukHour: 15, ukMinute: 0, label: "Mid-afternoon", icon: "🎯", enabled: true },
  { id: "early-evening", ukHour: 18, ukMinute: 0, label: "Early evening", icon: "💪", enabled: true },
  { id: "evening", ukHour: 21, ukMinute: 0, label: "Evening", icon: "🌙", enabled: true },
];

export interface UserSettings {
  habitOverrides: Record<string, HabitOverride>;
  levelUpStates: Record<string, LevelUpState>;
  checkinTimes: {
    morning: string;
    midday: string;
    evening: string;
  };
  notificationSlots: NotificationSlot[];
  customQuotes: { id: string; text: string; category: string; isDefault: false }[];
  hiddenQuoteIds: string[];
  routineChains: Record<HabitStack, ChainItem[]>;
  customHabits: Habit[];
  coachSettings?: CoachSettings;
}

// ─── Coach Settings ─────────────────────────────────────────
export type CoachProvider = "anthropic" | "openai" | "google";

export interface CoachSettings {
  provider: CoachProvider | null;
  model?: string; // e.g. "claude-sonnet-4-20250514", "gpt-4o-mini", "gemini-2.0-flash"
}

export type ExperimentScale = "small" | "medium" | "large";
export type ExperimentComplexity = "simple" | "complex";
export type ExperimentStatus = "suggested" | "active" | "completed" | "skipped";

export interface CoachExperiment {
  id: string;
  title: string;
  description: string;
  scale: ExperimentScale;
  complexity: ExperimentComplexity;
  status: ExperimentStatus;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  outcome: string | null;       // user's reflection on result
  coachAnalysis: string | null;  // AI's analysis of the experiment result
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  habitOverrides: {},
  levelUpStates: {},
  checkinTimes: {
    morning: "07:00",
    midday: "13:00",
    evening: "21:00",
  },
  notificationSlots: DEFAULT_NOTIFICATION_SLOTS,
  customQuotes: [],
  hiddenQuoteIds: [],
  routineChains: {
    morning: [],
    midday: [],
    evening: [],
  },
  customHabits: [],
};

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as UserSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Badge Persistence ──────────────────────────────────────

export interface EarnedBadgeRecord {
  badgeId: string;
  earnedAt: string; // ISO timestamp
}

export function loadEarnedBadges(): EarnedBadgeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BADGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EarnedBadgeRecord[];
  } catch {
    return [];
  }
}

export function loadEarnedBadgeIds(): Set<string> {
  return new Set(loadEarnedBadges().map((b) => b.badgeId));
}

export function saveEarnedBadges(badges: EarnedBadgeRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BADGES_KEY, JSON.stringify(badges));
}

/** Award a badge — idempotent (won't duplicate if already earned) */
export function awardBadge(badgeId: string): EarnedBadgeRecord | null {
  const existing = loadEarnedBadges();
  if (existing.some((b) => b.badgeId === badgeId)) return null; // already earned
  const record: EarnedBadgeRecord = {
    badgeId,
    earnedAt: new Date().toISOString(),
  };
  existing.push(record);
  saveEarnedBadges(existing);
  return record;
}

/** Award multiple badges at once — returns newly awarded ones */
export function awardBadges(badgeIds: string[]): EarnedBadgeRecord[] {
  const existing = loadEarnedBadges();
  const earnedSet = new Set(existing.map((b) => b.badgeId));
  const newRecords: EarnedBadgeRecord[] = [];
  for (const id of badgeIds) {
    if (!earnedSet.has(id)) {
      const record: EarnedBadgeRecord = {
        badgeId: id,
        earnedAt: new Date().toISOString(),
      };
      existing.push(record);
      newRecords.push(record);
      earnedSet.add(id);
    }
  }
  if (newRecords.length > 0) {
    saveEarnedBadges(existing);
  }
  return newRecords;
}

/** Get earned date for a specific badge */
export function getBadgeEarnedDate(badgeId: string): string | null {
  const badges = loadEarnedBadges();
  return badges.find((b) => b.badgeId === badgeId)?.earnedAt ?? null;
}
