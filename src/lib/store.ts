// Local storage-based state — works offline before Supabase is connected
// Stores check-in data, streaks, and XP on-device

import type { LogStatus, SprintIntensity, TrainingType, HabitStack } from "@/types/database";

const STORAGE_KEY = "accountability-tracker";
const GYM_STORAGE_KEY = "accountability-gym";
const SETTINGS_KEY = "accountability-settings";
const DEFERRED_KEY = "accountability-deferred";
const ADMIN_KEY = "accountability-admin";

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
export interface AdminTask {
  id: string;
  title: string;
  completed: boolean;
  date: string;           // YYYY-MM-DD — the day this task is for
  source: "adhoc" | "planned"; // planned = from Plan Tomorrow, adhoc = added during the day
  completedAt: string | null;
  createdAt: string;
}

export function loadAdminTasks(date?: string): AdminTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return [];
    const all: AdminTask[] = JSON.parse(raw);
    const target = date ?? getToday();
    return all.filter((t) => t.date === target);
  } catch {
    return [];
  }
}

function loadAllAdminTasks(): AdminTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveAllAdminTasks(tasks: AdminTask[]): void {
  // Auto-clean tasks older than 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const cleaned = tasks.filter((t) => t.date >= cutoffStr);
  localStorage.setItem(ADMIN_KEY, JSON.stringify(cleaned));
}

export function addAdminTask(title: string, source: "adhoc" | "planned", date?: string): AdminTask {
  const all = loadAllAdminTasks();
  const task: AdminTask = {
    id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    completed: false,
    date: date ?? getToday(),
    source,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  all.push(task);
  saveAllAdminTasks(all);
  return task;
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

export interface DayLog {
  date: string; // YYYY-MM-DD
  entries: Record<string, { status: LogStatus; value: number | null }>;
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
export function getSprintContext(): {
  active: boolean;
  intensity: SprintIntensity | null;
  name: string | null;
  bareMinimumOnly: boolean;     // intense + critical: only show bare minimum habits
  singleCheckin: boolean;       // critical: collapse all stacks into one 9PM check-in
  targetMultiplier: number;     // moderate: 0.75, intense: 0.5, critical: 0.5
  protectStreaks: boolean;       // critical: don't break streaks on miss
} {
  const state = loadState();
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
 */
export function recalculateStreaks(state: LocalState, habitSlugsById: Record<string, string>): Record<string, number> {
  const today = getToday();
  const streaks: Record<string, number> = {};

  // Get all unique habit IDs that have ever been logged
  const allHabitIds = new Set<string>();
  for (const log of state.logs) {
    for (const id of Object.keys(log.entries)) {
      allHabitIds.add(id);
    }
  }

  // Sort logs by date descending
  const sortedDates = state.logs
    .map((l) => l.date)
    .sort((a, b) => b.localeCompare(a));
  const uniqueDates = [...new Set(sortedDates)];

  // For each habit, count consecutive days with "done" working backwards from today
  for (const habitId of allHabitIds) {
    const slug = habitSlugsById[habitId];
    if (!slug) continue;

    let streak = 0;
    let expectedDate = today;

    for (const date of uniqueDates) {
      // Skip future dates
      if (date > today) continue;

      // If this date is what we expect (consecutive day)
      if (date === expectedDate) {
        const log = state.logs.find((l) => l.date === date);
        if (log?.entries[habitId]?.status === "done") {
          streak++;
          // Calculate the previous day
          const d = new Date(date + "T12:00:00");
          d.setDate(d.getDate() - 1);
          expectedDate = d.toISOString().slice(0, 10);
        } else {
          break; // Chain broken
        }
      } else if (date < expectedDate) {
        // We skipped a day — streak is broken
        break;
      }
    }

    // If today isn't logged yet, try starting from yesterday
    if (streak === 0 && !state.logs.find((l) => l.date === today)?.entries[habitId]) {
      const yesterday = new Date(today + "T12:00:00");
      yesterday.setDate(yesterday.getDate() - 1);
      let expectedDateAlt = yesterday.toISOString().slice(0, 10);

      for (const date of uniqueDates) {
        if (date > yesterday.toISOString().slice(0, 10)) continue;
        if (date === expectedDateAlt) {
          const log = state.logs.find((l) => l.date === date);
          if (log?.entries[habitId]?.status === "done") {
            streak++;
            const d = new Date(date + "T12:00:00");
            d.setDate(d.getDate() - 1);
            expectedDateAlt = d.toISOString().slice(0, 10);
          } else {
            break;
          }
        } else if (date < expectedDateAlt) {
          break;
        }
      }
    }

    streaks[slug] = streak;
  }

  return streaks;
}

export function getLevelForXP(xp: number): { level: number; title: string; xpRequired: number; nextXp: number } {
  const levels = [
    { level: 1,  title: "Beginner",          xpRequired: 0 },
    { level: 2,  title: "Showing Up",        xpRequired: 500 },
    { level: 3,  title: "Building Momentum", xpRequired: 1200 },
    { level: 4,  title: "Forming Habits",    xpRequired: 2500 },
    { level: 5,  title: "Consistent",        xpRequired: 4500 },
    { level: 6,  title: "Dedicated",         xpRequired: 7500 },
    { level: 7,  title: "Disciplined",       xpRequired: 11500 },
    { level: 8,  title: "Relentless",        xpRequired: 17000 },
    { level: 9,  title: "Atomic",            xpRequired: 24000 },
    { level: 10, title: "Unshakeable",       xpRequired: 33000 },
    { level: 11, title: "Identity Shift",    xpRequired: 45000 },
    { level: 12, title: "The Standard",      xpRequired: 60000 },
    { level: 13, title: "Elite",             xpRequired: 80000 },
    { level: 14, title: "Legendary",         xpRequired: 105000 },
    { level: 15, title: "Transcendent",      xpRequired: 140000 },
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
