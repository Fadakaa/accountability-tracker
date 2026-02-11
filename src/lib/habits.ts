import type { Habit, HabitLevel } from "@/types/database";

// Static habit definitions — matches seed.sql
// Used for local rendering before Supabase is connected

const USER_ID = "00000000-0000-0000-0000-000000000001";

export const HABITS: Habit[] = [
  // Binary habits
  { id: "10000000-0000-0000-0000-000000000001", user_id: USER_ID, name: "Prayer",            slug: "prayer",            category: "binary",   stack: "morning", is_bare_minimum: true,  unit: null,      icon: "🙏", sort_order: 1,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000002", user_id: USER_ID, name: "Bible Reading",     slug: "bible-reading",     category: "binary",   stack: "morning", is_bare_minimum: true,  unit: null,      icon: "📖", sort_order: 2,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000003", user_id: USER_ID, name: "Journal",           slug: "journal",           category: "binary",   stack: "morning", is_bare_minimum: true,  unit: null,      icon: "📓", sort_order: 3,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000004", user_id: USER_ID, name: "NSDR / Yoga Nidra", slug: "meditation",        category: "binary",   stack: "midday",  is_bare_minimum: true,  unit: null,      icon: "🧘", sort_order: 4,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000010", user_id: USER_ID, name: "Cold Exposure",      slug: "cold-exposure",     category: "binary",   stack: "morning", is_bare_minimum: true,  unit: null,      icon: "🧊", sort_order: 5,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000011", user_id: USER_ID, name: "Keystone Task",      slug: "keystone-task",     category: "binary",   stack: "morning", is_bare_minimum: true,  unit: null,      icon: "🔑", sort_order: 6,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000005", user_id: USER_ID, name: "Tidy Up Space",     slug: "tidy",              category: "binary",   stack: "midday",  is_bare_minimum: true,  unit: null,      icon: "🏠", sort_order: 7,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000006", user_id: USER_ID, name: "Chore",             slug: "chore",             category: "binary",   stack: "midday",  is_bare_minimum: false, unit: null,      icon: "🧹", sort_order: 8,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000007", user_id: USER_ID, name: "Training",          slug: "training",          category: "binary",   stack: "evening", is_bare_minimum: true,  unit: null,      icon: "💪", sort_order: 9,  is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000008", user_id: USER_ID, name: "Reading",           slug: "reading",           category: "binary",   stack: "evening", is_bare_minimum: true,  unit: null,      icon: "📚", sort_order: 10, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "10000000-0000-0000-0000-000000000009", user_id: USER_ID, name: "Meaningful Action", slug: "meaningful-action", category: "binary",   stack: "evening", is_bare_minimum: false, unit: null,      icon: "🎯", sort_order: 11, is_active: true, current_level: 1, created_at: "", updated_at: "" },

  // Measured habits
  { id: "20000000-0000-0000-0000-000000000001", user_id: USER_ID, name: "Bible Chapters",    slug: "bible-chapters",    category: "measured", stack: "morning", is_bare_minimum: false, unit: "count",   icon: "📖", sort_order: 12, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "20000000-0000-0000-0000-000000000002", user_id: USER_ID, name: "Training Minutes",  slug: "training-minutes",  category: "measured", stack: "evening", is_bare_minimum: false, unit: "minutes", icon: "⏱️", sort_order: 13, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "20000000-0000-0000-0000-000000000003", user_id: USER_ID, name: "RPE",               slug: "rpe",               category: "measured", stack: "evening", is_bare_minimum: false, unit: "1-10",    icon: "📊", sort_order: 14, is_active: false, current_level: 1, created_at: "", updated_at: "" },
  { id: "20000000-0000-0000-0000-000000000004", user_id: USER_ID, name: "Deep Work Blocks",  slug: "deep-work",         category: "measured", stack: "midday",  is_bare_minimum: false, unit: "count",   icon: "🧠", sort_order: 15, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "20000000-0000-0000-0000-000000000005", user_id: USER_ID, name: "Pages Read",        slug: "pages-read",        category: "measured", stack: "evening", is_bare_minimum: false, unit: "count",   icon: "📄", sort_order: 16, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "20000000-0000-0000-0000-000000000006", user_id: USER_ID, name: "Environment Score", slug: "environment-score", category: "measured", stack: "midday",  is_bare_minimum: false, unit: "1-5",     icon: "🏡", sort_order: 17, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "20000000-0000-0000-0000-000000000007", user_id: USER_ID, name: "Energy Level",      slug: "energy-level",      category: "measured", stack: "evening", is_bare_minimum: false, unit: "1-5",     icon: "⚡", sort_order: 18, is_active: true, current_level: 1, created_at: "", updated_at: "" },

  // Admin — special measured habit auto-populated from admin task store
  { id: "20000000-0000-0000-0000-000000000010", user_id: USER_ID, name: "Admin Tasks",       slug: "admin-tasks",       category: "measured", stack: "evening", is_bare_minimum: false, unit: "tasks",   icon: "📋", sort_order: 19, is_active: true, current_level: 1, created_at: "", updated_at: "" },

  // Bad habits
  { id: "30000000-0000-0000-0000-000000000001", user_id: USER_ID, name: "League of Legends", slug: "league",  category: "bad", stack: "evening", is_bare_minimum: false, unit: "minutes", icon: "🎮", sort_order: 20, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "30000000-0000-0000-0000-000000000002", user_id: USER_ID, name: "Plates Not Washed", slug: "plates",  category: "bad", stack: "evening", is_bare_minimum: false, unit: null,      icon: "🍽️", sort_order: 21, is_active: true, current_level: 1, created_at: "", updated_at: "" },
  { id: "30000000-0000-0000-0000-000000000003", user_id: USER_ID, name: "Hygiene Delayed",   slug: "hygiene", category: "bad", stack: "evening", is_bare_minimum: false, unit: null,      icon: "🚿", sort_order: 22, is_active: true, current_level: 1, created_at: "", updated_at: "" },
];

export const HABIT_LEVELS: HabitLevel[] = [
  // Prayer
  { id: "", habit_id: "10000000-0000-0000-0000-000000000001", level: 1, label: "Pray (any length)",  description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000001", level: 2, label: "5 min prayer",       description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000001", level: 3, label: "10 min prayer",      description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000001", level: 4, label: "Journaled prayer",   description: null },
  // Bible Reading
  { id: "", habit_id: "10000000-0000-0000-0000-000000000002", level: 1, label: "Read 1 verse",       description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000002", level: 2, label: "Read 1 chapter",     description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000002", level: 3, label: "Read 2 chapters",    description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000002", level: 4, label: "Chapter + notes",    description: null },
  // Journal
  { id: "", habit_id: "10000000-0000-0000-0000-000000000003", level: 1, label: "Write 1 sentence",   description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000003", level: 2, label: "Write 5 min",        description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000003", level: 3, label: "Full page",          description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000003", level: 4, label: "Reflection + plan",  description: null },
  // NSDR / Yoga Nidra (lying-down guided practice)
  { id: "", habit_id: "10000000-0000-0000-0000-000000000004", level: 1, label: "5 min NSDR",         description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000004", level: 2, label: "10 min session",     description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000004", level: 3, label: "15 min session",     description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000004", level: 4, label: "20 min deep NSDR",   description: null },
  // Cold Exposure (cold showers / ice baths)
  { id: "", habit_id: "10000000-0000-0000-0000-000000000010", level: 1, label: "30 sec cold",        description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000010", level: 2, label: "1 min cold",         description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000010", level: 3, label: "2 min cold",         description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000010", level: 4, label: "3+ min cold",        description: null },
  // Keystone Task (one impossible-to-fail task, 25 min max, first thing)
  { id: "", habit_id: "10000000-0000-0000-0000-000000000011", level: 1, label: "Do the task",        description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000011", level: 2, label: "10 min focused",     description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000011", level: 3, label: "20 min focused",     description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000011", level: 4, label: "25 min deep block",  description: null },
  // Tidy
  { id: "", habit_id: "10000000-0000-0000-0000-000000000005", level: 1, label: "Move 1 thing",       description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000005", level: 2, label: "15 min reset",       description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000005", level: 3, label: "Full room",          description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000005", level: 4, label: "Score 4+ daily",     description: null },
  // Training (showing up — frequency of attendance)
  { id: "", habit_id: "10000000-0000-0000-0000-000000000007", level: 1, label: "Show up",            description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000007", level: 2, label: "3x per week",        description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000007", level: 3, label: "4x per week",        description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000007", level: 4, label: "5x per week",        description: null },
  // Training Minutes (session duration — stay longer each level)
  { id: "", habit_id: "20000000-0000-0000-0000-000000000002", level: 1, label: "15+ minutes",        description: null },
  { id: "", habit_id: "20000000-0000-0000-0000-000000000002", level: 2, label: "30+ minutes",        description: null },
  { id: "", habit_id: "20000000-0000-0000-0000-000000000002", level: 3, label: "45+ minutes",        description: null },
  { id: "", habit_id: "20000000-0000-0000-0000-000000000002", level: 4, label: "60+ minutes",        description: null },
  // Reading
  { id: "", habit_id: "10000000-0000-0000-0000-000000000008", level: 1, label: "Read 1 page",        description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000008", level: 2, label: "10 pages",            description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000008", level: 3, label: "20 pages",            description: null },
  { id: "", habit_id: "10000000-0000-0000-0000-000000000008", level: 4, label: "30+ pages",           description: null },
  // Deep Work — Focus Gym progression (Easy → Intermediate → Hard → Elite)
  { id: "", habit_id: "20000000-0000-0000-0000-000000000004", level: 1, label: "Easy: 2-min rule start",     description: "Beat activation resistance. Open the work, do ONE tiny action, then build." },
  { id: "", habit_id: "20000000-0000-0000-0000-000000000004", level: 2, label: "Structured: 35 min block",   description: "One task only, define the win before starting, no switching tabs." },
  { id: "", habit_id: "20000000-0000-0000-0000-000000000004", level: 3, label: "Raw: 45 min silence",        description: "No music, no YouTube, no background stimulation. Pure mental endurance." },
  { id: "", habit_id: "20000000-0000-0000-0000-000000000004", level: 4, label: "Elite: 60 min warrior",      description: "10 min silent meditation then 50 min deep work in total silence." },
];

// ─── Quote System ──────────────────────────────────────────

export type QuoteCategory = "prompt" | "rule" | "liner" | "strong_thought";

export interface Quote {
  id: string;
  text: string;
  category: QuoteCategory;
  isDefault: boolean;
}

export const DEFAULT_QUOTES: Quote[] = [
  // Prompts — reflective questions for morning / start of check-in
  { id: "q-p1", text: "Did I cast votes today for the man I want to be?", category: "prompt", isDefault: true },
  { id: "q-p2", text: "What is the smallest action that keeps the streak alive?", category: "prompt", isDefault: true },
  { id: "q-p3", text: "If today repeats for 365 days, where do I end up?", category: "prompt", isDefault: true },

  // Rules — non-negotiable principles
  { id: "q-r1", text: "I don't negotiate with the plan — I execute it.", category: "rule", isDefault: true },
  { id: "q-r2", text: "This is automatic — no debate.", category: "rule", isDefault: true },
  { id: "q-r3", text: "The system protects me from my moods.", category: "rule", isDefault: true },

  // Liners — short punchy one-liners for wins
  { id: "q-l1", text: "Small actions. Ruthless consistency.", category: "liner", isDefault: true },
  { id: "q-l2", text: "Discipline first. Motivation follows.", category: "liner", isDefault: true },
  { id: "q-l3", text: "Progress beats perfection — every time.", category: "liner", isDefault: true },
  { id: "q-l4", text: "I only need to start. Momentum will carry me.", category: "liner", isDefault: true },
  { id: "q-l5", text: "Do it now. Relief later.", category: "liner", isDefault: true },

  // Strong Thoughts — for when discipline is needed (after a miss, low streak)
  { id: "q-s1", text: "Bad days still count if the minimum is met.", category: "strong_thought", isDefault: true },
  { id: "q-s2", text: "Indecision is the initiation of procrastination. Choose and move.", category: "strong_thought", isDefault: true },
  { id: "q-s3", text: "One small action keeps the identity alive.", category: "strong_thought", isDefault: true },
  { id: "q-s4", text: "I can do hard things even when I don't feel like it.", category: "strong_thought", isDefault: true },
  { id: "q-s5", text: "Finish the rep. Finish the set. Finish the day.", category: "strong_thought", isDefault: true },
  { id: "q-s6", text: "If I do the minimum, I protect the streak and protect the future.", category: "strong_thought", isDefault: true },

  // Focus Gym — principles for deep work / focus training
  { id: "q-f1", text: "You don't have focus. You enter it.", category: "rule", isDefault: true },
  { id: "q-f2", text: "Focus is a muscle. Train it like one — progressive overload.", category: "liner", isDefault: true },
  { id: "q-f3", text: "The enemy isn't distraction — it's activation resistance.", category: "strong_thought", isDefault: true },
  { id: "q-f4", text: "Calm nervous system = controlled attention. Breathe first.", category: "prompt", isDefault: true },
  { id: "q-f5", text: "I'll just sit with this for 2 minutes. That's all.", category: "prompt", isDefault: true },
  { id: "q-f6", text: "Silence is the advanced weight room of the mind.", category: "liner", isDefault: true },
];

// Legacy support
export const MOTIVATIONAL_QUOTES = DEFAULT_QUOTES.map((q) => q.text);

function getAllActiveQuotes(): Quote[] {
  // Merge defaults with custom quotes from settings
  // Lazy import to avoid circular — settings may not be loaded on server
  if (typeof window === "undefined") return DEFAULT_QUOTES;
  try {
    const raw = localStorage.getItem("accountability-settings");
    if (!raw) return DEFAULT_QUOTES;
    const settings = JSON.parse(raw);
    const customQuotes: Quote[] = settings.customQuotes ?? [];
    const hiddenQuoteIds: string[] = settings.hiddenQuoteIds ?? [];
    return [
      ...DEFAULT_QUOTES.filter((q) => !hiddenQuoteIds.includes(q.id)),
      ...customQuotes,
    ];
  } catch {
    return DEFAULT_QUOTES;
  }
}

export function getRandomQuote(): string {
  const quotes = getAllActiveQuotes();
  return quotes[Math.floor(Math.random() * quotes.length)].text;
}

/** Deterministic quote of the day — same quote all day, changes at midnight */
export function getQuoteOfTheDay(): Quote {
  const quotes = getAllActiveQuotes();
  if (quotes.length === 0) return DEFAULT_QUOTES[0];
  // Hash the date string to get a stable index
  const dateStr = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % quotes.length;
  return quotes[idx];
}

type QuoteContext = "morning" | "streak_milestone" | "after_miss" | "default";

/** Context-aware quote — picks from the most relevant category */
export function getContextualQuote(context: QuoteContext): Quote {
  const quotes = getAllActiveQuotes();
  let pool: Quote[];

  switch (context) {
    case "morning":
      pool = quotes.filter((q) => q.category === "prompt");
      break;
    case "streak_milestone":
      pool = quotes.filter((q) => q.category === "liner" || q.category === "strong_thought");
      break;
    case "after_miss":
      pool = quotes.filter((q) => q.category === "strong_thought");
      break;
    default:
      pool = quotes;
  }

  if (pool.length === 0) pool = quotes;
  if (pool.length === 0) return DEFAULT_QUOTES[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getHabitsByStack(stack: Habit["stack"]) {
  return HABITS.filter((h) => h.stack === stack && h.is_active);
}

export function getHabitLevel(habitId: string, level: number): HabitLevel | undefined {
  return HABIT_LEVELS.find((hl) => hl.habit_id === habitId && hl.level === level);
}

export function getFlameIcon(days: number): string {
  if (days === 0) return "💀";
  if (days <= 3) return "🕯️";
  if (days <= 7) return "🔥";
  if (days <= 14) return "🔥🔥";
  if (days <= 30) return "🔥🔥🔥";
  if (days <= 60) return "💎🔥";
  if (days <= 90) return "⭐🔥";
  return "👑🔥";
}

// XP values from spec
export const XP_VALUES = {
  BARE_MINIMUM_HABIT: 10,
  STRETCH_HABIT: 15,
  MEASURED_AT_TARGET: 20,
  MEASURED_EXCEED: 30,
  LOG_BAD_HABIT_HONESTLY: 5,
  ZERO_BAD_HABIT_DAY: 15,
  ALL_BARE_MINIMUM: 50,
  PERFECT_DAY: 100,
  STREAK_MILESTONE: 200,
  LEVEL_UP_ACCEPTED: 150,
  GYM_FULL_DETAIL: 25,
  ADMIN_TASK_CLEARED: 5,
  ADMIN_ALL_CLEARED: 25,
  PLAN_TOMORROW_SET: 10,
  WEEKLY_TARGET_MET: 300,
  MONTHLY_TARGET_MET: 1000,
} as const;

export const ADMIN_HABIT_ID = "20000000-0000-0000-0000-000000000010";
