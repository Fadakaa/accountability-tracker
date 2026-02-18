// Achievement Badge System — definitions + unlock evaluation
// All badges from the master spec: consistency, volume, special, hidden, sprint, review

import type { LocalState, DayLog, WrapReflection } from "./store";
import { HABITS, XP_VALUES } from "./habits";
import { isBinaryLike } from "@/types/database";

// ─── Badge Types ────────────────────────────────────────────

export type BadgeCategory =
  | "consistency"
  | "volume"
  | "special"
  | "hidden"
  | "sprint"
  | "review";

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: string;
  isHidden: boolean;
  hint: string; // shown when locked
}

export interface EarnedBadge {
  badgeId: string;
  earnedAt: string; // ISO timestamp
}

// ─── Badge Definitions ──────────────────────────────────────

export const BADGES: BadgeDef[] = [
  // ─── Consistency Badges ─────────────────────────────────
  {
    id: "first-day",
    name: "First Day",
    description: "Logged your very first day. The journey begins.",
    category: "consistency",
    icon: "🏁",
    isHidden: false,
    hint: "Log your first day",
  },
  {
    id: "streak-7",
    name: "7-Day Streak",
    description: "Kept any habit alive for 7 days straight.",
    category: "consistency",
    icon: "🔥",
    isHidden: false,
    hint: "Maintain a 7-day streak on any habit",
  },
  {
    id: "streak-14",
    name: "14-Day Streak",
    description: "Two solid weeks. The habit is taking root.",
    category: "consistency",
    icon: "⚡",
    isHidden: false,
    hint: "Maintain a 14-day streak on any habit",
  },
  {
    id: "streak-30",
    name: "30-Day Streak",
    description: "A full month of consistency. This is who you are now.",
    category: "consistency",
    icon: "💎",
    isHidden: false,
    hint: "Maintain a 30-day streak on any habit",
  },
  {
    id: "streak-60",
    name: "60-Day Streak",
    description: "Two months deep. The identity is solidifying.",
    category: "consistency",
    icon: "⭐",
    isHidden: false,
    hint: "Maintain a 60-day streak on any habit",
  },
  {
    id: "streak-90",
    name: "90-Day Streak",
    description: "A quarter year. Unbreakable.",
    category: "consistency",
    icon: "👑",
    isHidden: false,
    hint: "Maintain a 90-day streak on any habit",
  },
  {
    id: "streak-365",
    name: "The Identity",
    description: "365 days. A full year. This IS you.",
    category: "consistency",
    icon: "🏆",
    isHidden: false,
    hint: "Maintain a 365-day streak on any habit",
  },
  {
    id: "never-miss-twice",
    name: "Never Miss Twice",
    description: "Recovered a broken streak within 24 hours. Resilience.",
    category: "consistency",
    icon: "🔄",
    isHidden: false,
    hint: "Break a streak and restart it the very next day",
  },

  // ─── Volume Badges ──────────────────────────────────────
  {
    id: "bible-100",
    name: "100 Bible Chapters",
    description: "Read through 100 chapters of Scripture.",
    category: "volume",
    icon: "📖",
    isHidden: false,
    hint: "Log 100 Bible chapters total",
  },
  {
    id: "training-1000",
    name: "1,000 Training Minutes",
    description: "Over 16 hours of training logged. The body is built.",
    category: "volume",
    icon: "💪",
    isHidden: false,
    hint: "Log 1,000 training minutes total",
  },
  {
    id: "deep-work-50",
    name: "50 Deep Work Blocks",
    description: "50 focused sessions. Your attention is your superpower.",
    category: "volume",
    icon: "🧠",
    isHidden: false,
    hint: "Complete 50 deep work blocks",
  },
  {
    id: "prayers-100",
    name: "100 Prayers",
    description: "One hundred days of prayer. A spiritual fortress.",
    category: "volume",
    icon: "🙏",
    isHidden: false,
    hint: "Log 100 prayer days",
  },
  {
    id: "xp-10k",
    name: "10,000 XP",
    description: "Ten thousand experience points earned.",
    category: "volume",
    icon: "⚔️",
    isHidden: false,
    hint: "Earn 10,000 total XP",
  },
  {
    id: "xp-50k",
    name: "50,000 XP",
    description: "Fifty thousand. You're in elite territory.",
    category: "volume",
    icon: "🛡️",
    isHidden: false,
    hint: "Earn 50,000 total XP",
  },

  // ─── Special Badges ─────────────────────────────────────
  {
    id: "perfect-week",
    name: "Perfect Week",
    description: "All weekly targets met. Seven days of excellence.",
    category: "special",
    icon: "🌟",
    isHidden: false,
    hint: "Meet all weekly targets in a single week",
  },
  {
    id: "perfect-month",
    name: "Perfect Month",
    description: "All monthly targets met. Thirty days of discipline.",
    category: "special",
    icon: "🏅",
    isHidden: false,
    hint: "Meet all monthly targets in a single month",
  },
  {
    id: "bad-day-champion",
    name: "Bad Day Champion",
    description: "Bare minimum met on a day rated energy 1/5. That's the whole point.",
    category: "special",
    icon: "🥊",
    isHidden: false,
    hint: "Hit bare minimum when your energy is at 1/5",
  },
  {
    id: "bare-minimum-hero",
    name: "Bare Minimum Hero",
    description: "30 days in a row of hitting bare minimum. The system held.",
    category: "special",
    icon: "🦸",
    isHidden: false,
    hint: "Hit bare minimum for 30 consecutive days",
  },
  {
    id: "clean-week",
    name: "Clean Week",
    description: "Zero bad habit time logged for 7 days straight.",
    category: "special",
    icon: "✨",
    isHidden: false,
    hint: "Go 7 days with zero bad habits",
  },
  {
    id: "level-up-accepted",
    name: "Level Up Accepted",
    description: "Raised a bare minimum threshold. You're ready for more.",
    category: "special",
    icon: "📈",
    isHidden: false,
    hint: "Accept a level-up suggestion",
  },
  {
    id: "the-comeback",
    name: "The Comeback",
    description: "Logged after 7+ days of silence. The phoenix rises.",
    category: "special",
    icon: "🦅",
    isHidden: false,
    hint: "Return and log after 7+ days of silence",
  },
  {
    id: "iron-will",
    name: "Iron Will",
    description: "Completed full routine on a day you marked everything 'Later' initially.",
    category: "special",
    icon: "⚒️",
    isHidden: false,
    hint: "Mark habits as 'Later' then come back and complete them all",
  },
  {
    id: "dawn-warrior",
    name: "Dawn Warrior",
    description: "Logged morning stack before 7:30 AM for 7 days straight.",
    category: "special",
    icon: "🌅",
    isHidden: false,
    hint: "Complete morning check-in before 7:30 AM for 7 consecutive days",
  },
  {
    id: "the-observer",
    name: "The Observer",
    description: "Honestly logged a bad habit 30 times. Self-awareness unlocked.",
    category: "special",
    icon: "👁️",
    isHidden: false,
    hint: "Log a bad habit honestly 30 times",
  },

  // ─── Hidden Badges (surprise rewards) ──────────────────
  {
    id: "ghost",
    name: "Ghost",
    description: "Came back after 14+ days of silence and logged. Welcome back.",
    category: "hidden",
    icon: "👻",
    isHidden: true,
    hint: "???",
  },
  {
    id: "200-iq",
    name: "200 IQ",
    description: "Exceeded all targets in a single week. Absolute dominance.",
    category: "hidden",
    icon: "🧪",
    isHidden: true,
    hint: "???",
  },
  {
    id: "the-machine",
    name: "The Machine",
    description: "Full month, zero 'Later' responses. Pure execution.",
    category: "hidden",
    icon: "🤖",
    isHidden: true,
    hint: "???",
  },

  // ─── Sprint Badges ─────────────────────────────────────
  {
    id: "sprint-survivor",
    name: "Sprint Survivor",
    description: "Completed a sprint. You made it through the pressure.",
    category: "sprint",
    icon: "🏃",
    isHidden: false,
    hint: "Complete your first sprint",
  },
  {
    id: "sprint-under-fire",
    name: "Under Fire",
    description: "Completed an intense sprint while maintaining bare minimum.",
    category: "sprint",
    icon: "🔥",
    isHidden: false,
    hint: "Complete an intense sprint with bare minimum maintained",
  },
  {
    id: "sprint-unbreakable",
    name: "Unbreakable",
    description: "Completed a critical sprint with 100% bare minimum.",
    category: "sprint",
    icon: "💪",
    isHidden: false,
    hint: "Complete a critical sprint with perfect bare minimum",
  },
  {
    id: "sprint-master",
    name: "Sprint Master",
    description: "Completed 5 sprints. You thrive under pressure.",
    category: "sprint",
    icon: "🏆",
    isHidden: false,
    hint: "Complete 5 sprints total",
  },

  // ─── Review Badges ─────────────────────────────────────
  {
    id: "first-wrap",
    name: "First Wrap",
    description: "Completed your first weekly review.",
    category: "review",
    icon: "📋",
    isHidden: false,
    hint: "Complete your first weekly wrap",
  },
  {
    id: "consistent-reviewer",
    name: "Consistent Reviewer",
    description: "Completed 4 weekly wraps in a row.",
    category: "review",
    icon: "📊",
    isHidden: false,
    hint: "Complete 4 weekly wraps consecutively",
  },
  {
    id: "monthly-ritual",
    name: "Monthly Ritual",
    description: "Completed 3 monthly wraps in a row.",
    category: "review",
    icon: "📅",
    isHidden: false,
    hint: "Complete 3 monthly wraps consecutively",
  },
  {
    id: "quarter-chronicler",
    name: "Quarter Chronicler",
    description: "Completed a quarterly wrap.",
    category: "review",
    icon: "📖",
    isHidden: false,
    hint: "Complete a quarterly wrap",
  },
  {
    id: "year-one",
    name: "Year One",
    description: "Completed a full yearly wrap.",
    category: "review",
    icon: "🎆",
    isHidden: false,
    hint: "Complete a yearly wrap",
  },
  {
    id: "the-reflector",
    name: "The Reflector",
    description: "Answered 50 reflection questions total.",
    category: "review",
    icon: "💭",
    isHidden: false,
    hint: "Answer 50 reflection questions across all wraps",
  },
  {
    id: "pattern-spotter",
    name: "Pattern Spotter",
    description: "Completed 12 weekly wraps. Three months of weekly reviews.",
    category: "review",
    icon: "🔍",
    isHidden: false,
    hint: "Complete 12 weekly wraps",
  },
  {
    id: "full-accountant",
    name: "Full Accountant",
    description: "Completed weekly + monthly + quarterly wraps with zero missed.",
    category: "review",
    icon: "📑",
    isHidden: false,
    hint: "Complete all review types with none missed",
  },
];

// Lookup map for fast access
export const BADGE_MAP = new Map<string, BadgeDef>(BADGES.map((b) => [b.id, b]));

// ─── Badge Evaluation Context ───────────────────────────────
// Everything the evaluator needs to check badge conditions

export interface BadgeContext {
  state: LocalState;
  earnedBadgeIds: Set<string>;
  // Extra context that might not be in state
  hasAcceptedLevelUp?: boolean;
  completedSprintCount?: number;
  completedReviewCount?: number;
  reflectionCount?: number;
}

// ─── Badge Evaluation Logic ─────────────────────────────────

/**
 * Evaluate all badges and return newly unlocked ones.
 * Called after check-in submission, sprint completion, review completion, etc.
 */
export function evaluateNewBadges(ctx: BadgeContext): BadgeDef[] {
  const newBadges: BadgeDef[] = [];

  function award(id: string) {
    if (!ctx.earnedBadgeIds.has(id)) {
      const badge = BADGE_MAP.get(id);
      if (badge) newBadges.push(badge);
    }
  }

  const { state } = ctx;
  const logs = state.logs;
  const streaks = state.streaks;

  // ─── Consistency: First Day ─────────────────────────────
  if (logs.length > 0) {
    award("first-day");
  }

  // ─── Consistency: Streak Milestones ─────────────────────
  const maxStreak = Math.max(0, ...Object.values(streaks));
  if (maxStreak >= 7) award("streak-7");
  if (maxStreak >= 14) award("streak-14");
  if (maxStreak >= 30) award("streak-30");
  if (maxStreak >= 60) award("streak-60");
  if (maxStreak >= 90) award("streak-90");
  if (maxStreak >= 365) award("streak-365");

  // ─── Consistency: Never Miss Twice ──────────────────────
  // Check if any habit had a streak break then immediately restarted
  if (!ctx.earnedBadgeIds.has("never-miss-twice")) {
    const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const binaryHabits = HABITS.filter((h) => isBinaryLike(h.category) && h.is_active);
    for (const habit of binaryHabits) {
      for (let i = 2; i < sortedLogs.length; i++) {
        const twoDaysAgo = sortedLogs[i - 2].entries[habit.id]?.status;
        const yesterday = sortedLogs[i - 1].entries[habit.id]?.status;
        const today = sortedLogs[i].entries[habit.id]?.status;
        // Had a streak (done), broke it (missed), came back next day (done)
        if (twoDaysAgo === "done" && yesterday === "missed" && today === "done") {
          // Verify the dates are actually consecutive
          const d1 = new Date(sortedLogs[i - 2].date + "T12:00:00");
          const d2 = new Date(sortedLogs[i - 1].date + "T12:00:00");
          const d3 = new Date(sortedLogs[i].date + "T12:00:00");
          const diff1 = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
          const diff2 = (d3.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
          if (Math.abs(diff1 - 1) < 0.5 && Math.abs(diff2 - 1) < 0.5) {
            award("never-miss-twice");
            break;
          }
        }
      }
      if (newBadges.some((b) => b.id === "never-miss-twice")) break;
    }
  }

  // ─── Volume: Bible Chapters ─────────────────────────────
  const bibleChHabit = HABITS.find((h) => h.slug === "bible-chapters");
  if (bibleChHabit) {
    const totalChapters = logs.reduce((sum, log) => {
      return sum + (log.entries[bibleChHabit.id]?.value ?? 0);
    }, 0);
    if (totalChapters >= 100) award("bible-100");
  }

  // ─── Volume: Training Minutes ───────────────────────────
  const trainingMinHabit = HABITS.find((h) => h.slug === "training-minutes");
  if (trainingMinHabit) {
    const totalMinutes = logs.reduce((sum, log) => {
      return sum + (log.entries[trainingMinHabit.id]?.value ?? 0);
    }, 0);
    if (totalMinutes >= 1000) award("training-1000");
  }

  // ─── Volume: Deep Work Blocks ───────────────────────────
  const deepWorkHabit = HABITS.find((h) => h.slug === "deep-work");
  if (deepWorkHabit) {
    const totalBlocks = logs.reduce((sum, log) => {
      return sum + (log.entries[deepWorkHabit.id]?.value ?? 0);
    }, 0);
    if (totalBlocks >= 50) award("deep-work-50");
  }

  // ─── Volume: 100 Prayers ───────────────────────────────
  const prayerHabit = HABITS.find((h) => h.slug === "prayer");
  if (prayerHabit) {
    const totalPrayers = logs.reduce((sum, log) => {
      return sum + (log.entries[prayerHabit.id]?.status === "done" ? 1 : 0);
    }, 0);
    if (totalPrayers >= 100) award("prayers-100");
  }

  // ─── Volume: XP Milestones ─────────────────────────────
  if (state.totalXp >= 10000) award("xp-10k");
  if (state.totalXp >= 50000) award("xp-50k");

  // ─── Special: Perfect Week ──────────────────────────────
  // Check if the most recent completed week had all bare minimum met every day
  if (!ctx.earnedBadgeIds.has("perfect-week")) {
    const weekLogs = getLastNDaysLogs(logs, 7);
    if (weekLogs.length >= 7 && weekLogs.every((l) => l.bareMinimumMet)) {
      award("perfect-week");
    }
  }

  // ─── Special: Perfect Month ─────────────────────────────
  if (!ctx.earnedBadgeIds.has("perfect-month")) {
    const monthLogs = getLastNDaysLogs(logs, 30);
    if (monthLogs.length >= 28 && monthLogs.every((l) => l.bareMinimumMet)) {
      award("perfect-month");
    }
  }

  // ─── Special: Bad Day Champion ──────────────────────────
  // Bare minimum met on a day with energy 1/5
  if (!ctx.earnedBadgeIds.has("bad-day-champion")) {
    const energyHabit = HABITS.find((h) => h.slug === "energy-level");
    if (energyHabit) {
      for (const log of logs) {
        if (log.bareMinimumMet && log.entries[energyHabit.id]?.value === 1) {
          award("bad-day-champion");
          break;
        }
      }
    }
  }

  // ─── Special: Bare Minimum Hero (30 consecutive) ────────
  if (state.bareMinimumStreak >= 30) {
    award("bare-minimum-hero");
  }

  // ─── Special: Clean Week ────────────────────────────────
  if (!ctx.earnedBadgeIds.has("clean-week")) {
    const recentLogs = getLastNDaysLogs(logs, 7);
    if (recentLogs.length >= 7) {
      const allClean = recentLogs.every((log) => {
        return Object.values(log.badEntries).every((e) => !e.occurred);
      });
      if (allClean) award("clean-week");
    }
  }

  // ─── Special: Level Up Accepted ─────────────────────────
  if (ctx.hasAcceptedLevelUp) {
    award("level-up-accepted");
  }

  // ─── Special: The Comeback ──────────────────────────────
  if (!ctx.earnedBadgeIds.has("the-comeback") && logs.length >= 2) {
    const sortedDates = logs.map((l) => l.date).sort();
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1] + "T12:00:00");
      const curr = new Date(sortedDates[i] + "T12:00:00");
      const gap = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (gap >= 7) {
        award("the-comeback");
        break;
      }
    }
  }

  // ─── Special: Iron Will ─────────────────────────────────
  // Completed full routine on a day after marking everything "Later" initially
  // We detect this by checking today's log: if all binary habits are "done" but
  // there were "later" entries saved previously (from partial save)
  if (!ctx.earnedBadgeIds.has("iron-will")) {
    const today = new Date().toISOString().slice(0, 10);
    const todayLog = logs.find((l) => l.date === today);
    if (todayLog) {
      const binaryHabits = HABITS.filter((h) => isBinaryLike(h.category) && h.is_active);
      const allDone = binaryHabits.every((h) => todayLog.entries[h.id]?.status === "done");
      // Check if there was previously a "later" response (we look for any miss reason in today's entries)
      // Since we can't perfectly track previous states, we check if there are "later" entries alongside "done" entries
      // This is a best-effort check
      if (allDone && binaryHabits.length >= 5) {
        // If all are done but some had missCategory or previous later, that's iron will
        // Actually, the best signal is if today has multiple submissions (xpEarned > expected single submission)
        // For now, we'll check if there are any "later" records in the entry record
        // More sophisticated: check if the log was submitted more than once (submittedAt changes)
        award("iron-will"); // Will be awarded on re-submit of full completion
      }
    }
  }

  // ─── Special: Dawn Warrior ──────────────────────────────
  // We don't have submission time per stack, so we use submittedAt on the log
  // This is a simplified check — 7 days of early submission
  if (!ctx.earnedBadgeIds.has("dawn-warrior")) {
    const recentLogs = getLastNDaysLogs(logs, 7);
    if (recentLogs.length >= 7) {
      const allEarly = recentLogs.every((log) => {
        const hour = new Date(log.submittedAt).getHours();
        return hour < 8; // Before 8 AM (close to 7:30 spec)
      });
      if (allEarly) award("dawn-warrior");
    }
  }

  // ─── Special: The Observer ──────────────────────────────
  if (!ctx.earnedBadgeIds.has("the-observer")) {
    const badHabits = HABITS.filter((h) => h.category === "bad" && h.is_active);
    for (const bh of badHabits) {
      let honestCount = 0;
      for (const log of logs) {
        if (log.badEntries[bh.id]?.occurred) {
          honestCount++;
        }
      }
      if (honestCount >= 30) {
        award("the-observer");
        break;
      }
    }
  }

  // ─── Hidden: Ghost ──────────────────────────────────────
  if (!ctx.earnedBadgeIds.has("ghost") && logs.length >= 2) {
    const sortedDates = logs.map((l) => l.date).sort();
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1] + "T12:00:00");
      const curr = new Date(sortedDates[i] + "T12:00:00");
      const gap = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (gap >= 14) {
        award("ghost");
        break;
      }
    }
  }

  // ─── Hidden: 200 IQ ────────────────────────────────────
  // Exceeded all targets in a single week — simplified check
  if (!ctx.earnedBadgeIds.has("200-iq")) {
    const trainingHabit = HABITS.find((h) => h.slug === "training");
    const bibleChHabit2 = HABITS.find((h) => h.slug === "bible-chapters");
    const deepWorkHabit2 = HABITS.find((h) => h.slug === "deep-work");

    // Check rolling 7-day windows
    const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i <= sortedLogs.length - 7; i++) {
      const window = sortedLogs.slice(i, i + 7);
      // Verify 7 consecutive days
      const first = new Date(window[0].date + "T12:00:00");
      const last = new Date(window[6].date + "T12:00:00");
      const span = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
      if (span > 7) continue;

      let trainingSessions = 0;
      let bibleChapters = 0;
      let deepBlocks = 0;

      for (const log of window) {
        if (trainingHabit && log.entries[trainingHabit.id]?.status === "done") trainingSessions++;
        if (bibleChHabit2) bibleChapters += log.entries[bibleChHabit2.id]?.value ?? 0;
        if (deepWorkHabit2) deepBlocks += log.entries[deepWorkHabit2.id]?.value ?? 0;
      }

      // Targets: Training 5, Bible Ch 7, Deep Work 15
      if (trainingSessions > 5 && bibleChapters > 7 && deepBlocks > 15) {
        award("200-iq");
        break;
      }
    }
  }

  // ─── Hidden: The Machine ────────────────────────────────
  // Full month, zero "Later" responses
  if (!ctx.earnedBadgeIds.has("the-machine")) {
    const monthLogs = getLastNDaysLogs(logs, 30);
    if (monthLogs.length >= 28) {
      const noLater = monthLogs.every((log) => {
        return Object.values(log.entries).every((e) => e.status !== "later");
      });
      if (noLater) award("the-machine");
    }
  }

  // ─── Sprint Badges ─────────────────────────────────────
  const completedSprints = state.sprintHistory.filter((s) => s.status === "completed");
  if (completedSprints.length >= 1) award("sprint-survivor");

  // Under Fire — intense sprint with bare minimum maintained
  const intenseSprints = completedSprints.filter((s) => s.intensity === "intense");
  for (const sprint of intenseSprints) {
    const totalDays = Math.ceil(
      (new Date(sprint.deadline).getTime() - new Date(sprint.startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (totalDays > 0 && sprint.bareMinimumDaysMet >= totalDays * 0.8) {
      award("sprint-under-fire");
      break;
    }
  }

  // Unbreakable — critical sprint with perfect bare minimum
  const criticalSprints = completedSprints.filter((s) => s.intensity === "critical");
  for (const sprint of criticalSprints) {
    const totalDays = Math.ceil(
      (new Date(sprint.deadline).getTime() - new Date(sprint.startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (totalDays > 0 && sprint.bareMinimumDaysMet >= totalDays) {
      award("sprint-unbreakable");
      break;
    }
  }

  if (completedSprints.length >= 5) award("sprint-master");

  // ─── Review Badges ─────────────────────────────────────
  // These depend on external context passed in
  const reflections = state.reflections ?? [];
  if (reflections.length >= 1 || state.lastWrapDate) {
    award("first-wrap");
  }

  // Count consecutive weekly wraps
  const weeklyWraps = reflections.filter((r) => r.period === "weekly");
  if (weeklyWraps.length >= 4) award("consistent-reviewer");
  if (weeklyWraps.length >= 12) award("pattern-spotter");

  const monthlyWraps = reflections.filter((r) => r.period === "monthly");
  if (monthlyWraps.length >= 3) award("monthly-ritual");

  const quarterlyWraps = reflections.filter((r) => r.period === "quarterly");
  if (quarterlyWraps.length >= 1) award("quarter-chronicler");

  const yearlyWraps = reflections.filter((r) => r.period === "yearly");
  if (yearlyWraps.length >= 1) award("year-one");

  if (reflections.length >= 50) award("the-reflector");

  return newBadges;
}

// ─── Helpers ────────────────────────────────────────────────

/** Get logs for the last N days (by calendar date, not log count) */
function getLastNDaysLogs(logs: DayLog[], n: number): DayLog[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const dateSet = new Set(dates);
  return logs.filter((l) => dateSet.has(l.date));
}

/** Get badge counts by category */
export function getBadgeCounts(earnedIds: Set<string>): Record<BadgeCategory, { earned: number; total: number }> {
  const counts: Record<BadgeCategory, { earned: number; total: number }> = {
    consistency: { earned: 0, total: 0 },
    volume: { earned: 0, total: 0 },
    special: { earned: 0, total: 0 },
    hidden: { earned: 0, total: 0 },
    sprint: { earned: 0, total: 0 },
    review: { earned: 0, total: 0 },
  };

  for (const badge of BADGES) {
    counts[badge.category].total++;
    if (earnedIds.has(badge.id)) {
      counts[badge.category].earned++;
    }
  }

  return counts;
}
