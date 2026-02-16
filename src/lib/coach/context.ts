// Data context builder — compresses all user metrics into a structured
// text summary for the AI prompt. Token-efficient: ~500-800 tokens instead
// of dumping thousands of raw log entries.

import type { LocalState, DayLog, CoachExperiment, MissCategory } from "@/lib/store";
import type { UserSettings } from "@/lib/store";
import type { Habit } from "@/types/database";
import { isBinaryLike } from "@/types/database";
import { getLevelForXP } from "@/lib/store";
import {
  getCompletionByDay,
  getDayOfWeekAnalysis,
  getBadHabitTrends,
  getSingleHabitStats,
  WEEKLY_TARGETS,
} from "@/lib/analytics";

interface CoachContextInput {
  state: LocalState;
  settings: UserSettings;
  habits: Habit[];
  gymSessions?: { date: string; trainingType: string; muscleGroup: string | null; durationMinutes: number | null; rpe: number | null }[];
  showingUp?: { totalOpens: number; uniqueDays: number; firstOpenDate: string };
  experiments?: CoachExperiment[];
  pastConversationSummaries?: Array<{ summary: string; createdAt: string }>;
}

/** Build a compressed text summary of all user data for the AI coach */
export function buildCoachContext(input: CoachContextInput): string {
  const { state, settings, habits, gymSessions, showingUp, experiments, pastConversationSummaries } = input;
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // ── Identity ──
  const levelInfo = getLevelForXP(state.totalXp);
  lines.push("## USER PROFILE");
  lines.push(`Level: ${levelInfo.level} "${levelInfo.title}" | Total XP: ${state.totalXp} | Next level at: ${levelInfo.nextXp} XP`);
  if (showingUp) {
    lines.push(`App opens: ${showingUp.totalOpens} total, ${showingUp.uniqueDays} unique days since ${showingUp.firstOpenDate}`);
  }
  lines.push(`Total logs: ${state.logs.length} days tracked`);
  lines.push(`Bare minimum streak: ${state.bareMinimumStreak} days`);

  // ── Usage Pattern (critical for contextualizing all metrics) ──
  const usagePattern = calculateUsagePattern(state.logs, today);
  lines.push(`Avg check-in frequency: ${usagePattern.avgDaysPerWeek} days/week (over last ${usagePattern.weeksAnalysed} weeks)`);
  if (usagePattern.recentTrend !== "stable") {
    lines.push(`Check-in trend: ${usagePattern.recentTrend} (${usagePattern.recentAvg} days/week last 2 weeks vs ${usagePattern.olderAvg} days/week prior)`);
  }
  if (usagePattern.daysSinceLastCheckin > 1) {
    lines.push(`Days since last check-in: ${usagePattern.daysSinceLastCheckin}`);
  }
  lines.push(`Most active days: ${usagePattern.mostActiveDays.join(", ")}`);
  lines.push(`Least active days: ${usagePattern.leastActiveDays.join(", ")}`);
  lines.push("");

  // ── This Week ──
  const weekLogs = getWeekLogs(state.logs, today);
  const prevWeekLogs = getPrevWeekLogs(state.logs, today);
  // How many days have elapsed so far this week (Sun=1 through Sat=7)
  const todayDate = new Date(today + "T12:00:00");
  const elapsedDaysThisWeek = todayDate.getDay() + 1; // Sun=1, Mon=2, ..., Sat=7
  lines.push("## THIS WEEK");
  lines.push(`Days logged: ${weekLogs.length}/${elapsedDaysThisWeek} days elapsed so far (user averages ~${usagePattern.avgDaysPerWeek} days/week)`);
  lines.push(`Bare minimum met: ${weekLogs.filter(l => l.bareMinimumMet).length}/${weekLogs.length} logged days`);
  lines.push(`XP earned this week: ${weekLogs.reduce((s, l) => s + l.xpEarned, 0)}`);

  // Best/worst day
  if (weekLogs.length > 0) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const withCounts = weekLogs.map(l => {
      const done = Object.values(l.entries).filter(e => e.status === "done").length;
      const d = new Date(l.date + "T12:00:00");
      return { day: dayNames[d.getDay()], date: l.date, done };
    }).sort((a, b) => b.done - a.done);
    lines.push(`Best day: ${withCounts[0].day} (${withCounts[0].done} habits) | Worst: ${withCounts[withCounts.length - 1].day} (${withCounts[withCounts.length - 1].done} habits)`);
  }

  // Week-over-week XP comparison
  const prevXp = prevWeekLogs.reduce((s, l) => s + l.xpEarned, 0);
  const thisXp = weekLogs.reduce((s, l) => s + l.xpEarned, 0);
  if (prevXp > 0) {
    const pct = Math.round(((thisXp - prevXp) / prevXp) * 100);
    lines.push(`XP vs last week: ${pct >= 0 ? "+" : ""}${pct}%`);
  }
  lines.push("");

  // ── Streaks ──
  const activeStreaks = Object.entries(state.streaks)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  if (activeStreaks.length > 0) {
    lines.push("## ACTIVE STREAKS");
    for (const [slug, days] of activeStreaks) {
      const habit = habits.find(h => h.slug === slug);
      lines.push(`- ${habit?.icon || ""} ${habit?.name || slug}: ${days} days`);
    }
    lines.push("");
  }

  // ── Per-Habit Stats (14-day window) ──
  const activeHabits = habits.filter(h => h.is_active);
  const binaryHabits = activeHabits.filter(h => isBinaryLike(h.category));
  const measuredHabits = activeHabits.filter(h => h.category === "measured");
  const badHabits = activeHabits.filter(h => h.category === "bad");

  // Habits needing attention
  const needsAttention: { name: string; rate: number }[] = [];
  const doing_well: { name: string; rate: number }[] = [];

  for (const h of binaryHabits) {
    const stats = getSingleHabitStats(state.logs, h.id, h);
    // Use recent 14-day window
    const recent14 = state.logs.filter(l => {
      const diff = daysBetween(l.date, today);
      return diff >= 0 && diff < 14;
    });
    let done14 = 0;
    for (const log of recent14) {
      if (log.entries[h.id]?.status === "done") done14++;
    }
    const rate14 = recent14.length > 0 ? done14 / Math.min(recent14.length, 14) : 0;

    if (rate14 < 0.5 && recent14.length >= 3) {
      needsAttention.push({ name: `${h.icon || ""} ${h.name}`, rate: rate14 });
    } else if (rate14 > 0.85) {
      doing_well.push({ name: `${h.icon || ""} ${h.name}`, rate: rate14 });
    }
  }

  // Note: recent14.length = number of days the user actually checked in (within 14-day window)
  // The rate is: done / days_checked_in — already normalized to actual usage
  const daysCheckedIn14 = state.logs.filter(l => {
    const diff = daysBetween(l.date, today);
    return diff >= 0 && diff < 14;
  }).length;

  if (doing_well.length > 0) {
    lines.push(`## HABITS DOING WELL (>85% of ${daysCheckedIn14} check-in days in last 14 days)`);
    for (const h of doing_well) {
      lines.push(`- ${h.name}: ${Math.round(h.rate * 100)}%`);
    }
    lines.push("");
  }

  if (needsAttention.length > 0) {
    lines.push(`## HABITS NEEDING ATTENTION (<50% of ${daysCheckedIn14} check-in days in last 14 days)`);
    for (const h of needsAttention) {
      lines.push(`- ${h.name}: ${Math.round(h.rate * 100)}%`);
    }
    lines.push("");
  }

  // ── Miss Reasons (14-day window) ──
  const missReasonSummary = buildMissReasonSummary(state.logs, habits, today);
  if (missReasonSummary) {
    lines.push(missReasonSummary);
  }

  // ── Bad Habits ──
  if (badHabits.length > 0) {
    lines.push("## BAD HABITS (this week vs last week)");
    for (const bh of badHabits) {
      let thisCount = 0, thisMin = 0, prevCount = 0, prevMin = 0;
      for (const log of weekLogs) {
        const entry = log.badEntries[bh.id];
        if (entry?.occurred) { thisCount++; thisMin += entry.durationMinutes ?? 0; }
      }
      for (const log of prevWeekLogs) {
        const entry = log.badEntries[bh.id];
        if (entry?.occurred) { prevCount++; prevMin += entry.durationMinutes ?? 0; }
      }
      const unit = bh.unit === "minutes" ? `${thisMin}m (was ${prevMin}m)` : `${thisCount} days (was ${prevCount})`;
      const trend = (bh.unit === "minutes" ? thisMin < prevMin : thisCount < prevCount) ? "improving" :
        (bh.unit === "minutes" ? thisMin > prevMin : thisCount > prevCount) ? "worsening" : "stable";
      lines.push(`- ${bh.icon || ""} ${bh.name}: ${unit} [${trend}]`);
    }
    lines.push("");
  }

  // ── Measured Habits ──
  if (measuredHabits.length > 0) {
    lines.push("## MEASURED HABITS (this week)");
    for (const mh of measuredHabits) {
      let total = 0, count = 0;
      for (const log of weekLogs) {
        const val = log.entries[mh.id]?.value;
        if (val != null && val > 0) { total += val; count++; }
      }
      const target = WEEKLY_TARGETS[mh.name] ?? null;
      const targetStr = target ? ` / target: ${target}` : "";
      lines.push(`- ${mh.icon || ""} ${mh.name}: ${total} total (${count} days)${targetStr}`);
    }
    lines.push("");
  }

  // ── Training ──
  if (gymSessions && gymSessions.length > 0) {
    const weekStart = getWeekStartDate(today);
    const weekSessions = gymSessions.filter(s => s.date >= weekStart);
    if (weekSessions.length > 0) {
      lines.push("## TRAINING THIS WEEK");
      const byType: Record<string, number> = {};
      for (const s of weekSessions) {
        byType[s.trainingType] = (byType[s.trainingType] ?? 0) + 1;
      }
      for (const [type, count] of Object.entries(byType)) {
        lines.push(`- ${type}: ${count} sessions`);
      }
      lines.push(`Total: ${weekSessions.length} sessions (target: 5)`);
      lines.push("");
    }
  }

  // ── Sprint ──
  if (state.activeSprint) {
    const sp = state.activeSprint;
    const completedTasks = sp.tasks.filter(t => t.completed).length;
    const daysLeft = daysBetween(today, sp.deadline);
    lines.push("## ACTIVE SPRINT");
    lines.push(`"${sp.name}" | Intensity: ${sp.intensity} | ${completedTasks}/${sp.tasks.length} tasks done | ${daysLeft} days left`);
    lines.push("");
  }

  // ── Forward Intention Accountability (placed early for prominence) ──
  const intentionCheck = buildIntentionAccountability(state, habits, today);
  if (intentionCheck) {
    lines.push(intentionCheck);
  }

  // ── Reflections ──
  const reflections = state.reflections ?? [];
  if (reflections.length > 0) {
    const recent = reflections.slice(0, 3);
    lines.push("## RECENT REFLECTIONS");
    for (const r of recent) {
      lines.push(`[${r.date}] Q: "${r.question}"`);
      lines.push(`A: "${r.answer}"`);
      if (r.forwardIntention) {
        lines.push(`Forward intention: "${r.forwardIntention}"`);
      }
    }
    lines.push("");
  }

  // ── Past Coaching Sessions ──
  const summaries = pastConversationSummaries ?? [];
  if (summaries.length > 0) {
    lines.push("## PAST COACHING SESSIONS");
    for (const s of summaries.slice(0, 5)) {
      const dateStr = new Date(s.createdAt).toISOString().slice(0, 10);
      lines.push(`[${dateStr}] ${s.summary}`);
    }
    lines.push("");
  }

  // ── Day-of-week patterns ──
  if (state.logs.length >= 14) {
    const dow = getDayOfWeekAnalysis(state.logs, habits);
    const best = dow.reduce((a, b) => a.avgRate > b.avgRate ? a : b);
    const worst = dow.reduce((a, b) => a.avgRate < b.avgRate ? a : b);
    lines.push("## DAY-OF-WEEK PATTERNS");
    lines.push(`Best day: ${best.label} (${Math.round(best.avgRate * 100)}% avg) | Worst: ${worst.label} (${Math.round(worst.avgRate * 100)}% avg)`);
    lines.push("");
  }

  // ── Active Experiments ──
  if (experiments && experiments.length > 0) {
    const active = experiments.filter(e => e.status === "active");
    const completed = experiments.filter(e => e.status === "completed").slice(0, 3);

    if (active.length > 0) {
      lines.push("## ACTIVE EXPERIMENTS");
      for (const exp of active) {
        const daysIn = exp.startDate ? daysBetween(exp.startDate, today) : 0;
        lines.push(`- [${exp.scale.toUpperCase()}] "${exp.title}" — day ${daysIn}/${exp.durationDays}`);
      }
      lines.push("");
    }

    if (completed.length > 0) {
      lines.push("## RECENT COMPLETED EXPERIMENTS");
      for (const exp of completed) {
        lines.push(`- "${exp.title}" — outcome: ${exp.outcome || "not recorded"}`);
      }
      lines.push("");
    }
  }

  // ── Admin Tasks ──
  const todayLogs = weekLogs.filter(l => l.adminSummary);
  if (todayLogs.length > 0) {
    const totalAdmin = todayLogs.reduce((s, l) => s + (l.adminSummary?.total ?? 0), 0);
    const completedAdmin = todayLogs.reduce((s, l) => s + (l.adminSummary?.completed ?? 0), 0);
    if (totalAdmin > 0) {
      lines.push("## ADMIN TASKS THIS WEEK");
      lines.push(`${completedAdmin}/${totalAdmin} completed (${Math.round((completedAdmin / totalAdmin) * 100)}%)`);
      lines.push("");
    }
  }

  // ── Pattern Disconnects ──
  const disconnects = detectPatternDisconnects(state.logs, activeHabits, today);
  if (disconnects.length > 0) {
    lines.push("## PATTERN DISCONNECTS");
    lines.push("(Patterns where habit effort and measured outcomes don't align — worth exploring, not definitive)");
    for (const d of disconnects) {
      lines.push(`- ${d.summary}`);
    }
    lines.push("");
  }

  // ── Tracking Blind Spots ──
  const blindSpots = detectTrackingGaps(habits, state.logs, today);
  if (blindSpots.length > 0) {
    lines.push("## TRACKING BLIND SPOTS");
    lines.push("(Areas not covered by current habits, or time periods with sparse data — patterns here are invisible)");
    for (const spot of blindSpots) {
      lines.push(`- ${spot}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Forward Intention Accountability ─────────────────────

/**
 * Extract the most recent forward intention and compare it against
 * this week's habit/training/measured data. Returns a structured text
 * block for the AI context, or null if no intention exists.
 */
function buildIntentionAccountability(
  state: LocalState,
  habits: Habit[],
  today: string,
): string | null {
  const reflections = state.reflections ?? [];
  if (reflections.length === 0) return null;

  // Find the most recent reflection that has a forward intention
  // Reflections are sorted newest-first from the load path
  const withIntention = reflections.find(r => r.forwardIntention?.trim());
  if (!withIntention || !withIntention.forwardIntention) return null;

  const intention = withIntention.forwardIntention.trim();
  const intentionDate = withIntention.date;

  const weekLogs = getWeekLogs(state.logs, today);

  const lines: string[] = [];
  lines.push("## FORWARD INTENTION CHECK");
  lines.push(`Set on ${intentionDate}: "${intention}"`);
  lines.push("");

  // Try to match the intention text against known habit names/slugs
  const intentionLower = intention.toLowerCase();
  const activeHabits = habits.filter(h => h.is_active);
  const matched: string[] = [];

  for (const h of activeHabits) {
    const nameWords = h.name.toLowerCase().split(/\s+/);
    const slugWords = h.slug.toLowerCase().split("-");
    const allTerms = [...nameWords, ...slugWords];

    // Check if any habit word (3+ chars) appears in the intention
    const isMatch = allTerms.some(word =>
      word.length >= 3 && intentionLower.includes(word)
    );

    if (isMatch) {
      if (h.category === "bad") {
        let count = 0, minutes = 0;
        for (const log of weekLogs) {
          const entry = log.badEntries[h.id];
          if (entry?.occurred) { count++; minutes += entry.durationMinutes ?? 0; }
        }
        const display = h.unit === "minutes"
          ? `${minutes}m across ${count} days`
          : `${count} days this week`;
        matched.push(`- ${h.icon || ""} ${h.name}: ${display}`);
      } else if (h.category === "measured") {
        let total = 0, count = 0;
        for (const log of weekLogs) {
          const val = log.entries[h.id]?.value;
          if (val != null && val > 0) { total += val; count++; }
        }
        matched.push(`- ${h.icon || ""} ${h.name}: ${total} total across ${count} days`);
      } else {
        // Binary habit
        let done = 0, missed = 0;
        for (const log of weekLogs) {
          const entry = log.entries[h.id];
          if (entry?.status === "done") done++;
          else if (entry?.status === "missed") missed++;
        }
        matched.push(`- ${h.icon || ""} ${h.name}: Done ${done}/${weekLogs.length} days (missed ${missed})`);
      }
    }
  }

  if (matched.length > 0) {
    lines.push("Relevant data this week:");
    lines.push(...matched);
  } else {
    lines.push("(No direct habit match found — interpret the intention against the full data above)");
  }

  lines.push("");
  lines.push("IMPORTANT: Address this intention directly in your analysis. Did they follow through? Be specific.");
  lines.push("");

  return lines.join("\n");
}

// ─── Usage Pattern Calculator ─────────────────────────────

interface UsagePattern {
  avgDaysPerWeek: number;       // e.g. 4.5
  weeksAnalysed: number;        // how many full weeks of data
  recentAvg: number;            // avg days/week over last 2 weeks
  olderAvg: number;             // avg days/week over the 2 weeks before that
  recentTrend: "increasing" | "decreasing" | "stable";
  daysSinceLastCheckin: number;
  mostActiveDays: string[];     // e.g. ["Mon", "Tue", "Wed"]
  leastActiveDays: string[];    // e.g. ["Sat", "Sun"]
}

/**
 * Analyse actual check-in patterns from log history.
 * Returns real usage frequency so the coach can judge against
 * the user's actual behavior, not a theoretical 7-day week.
 */
function calculateUsagePattern(logs: DayLog[], today: string): UsagePattern {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Default for insufficient data
  const defaultPattern: UsagePattern = {
    avgDaysPerWeek: 0,
    weeksAnalysed: 0,
    recentAvg: 0,
    olderAvg: 0,
    recentTrend: "stable",
    daysSinceLastCheckin: 0,
    mostActiveDays: [],
    leastActiveDays: [],
  };

  if (logs.length === 0) return defaultPattern;

  // Sort logs by date ascending
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  // Days since last check-in
  const lastLogDate = sorted[sorted.length - 1].date;
  const daysSinceLastCheckin = daysBetween(lastLogDate, today);

  // Calculate weekly buckets over the last 8 weeks (or however much data exists)
  const weeksToAnalyse = 8;
  const weekBuckets: number[] = []; // count of logs per week, newest first
  const todayD = new Date(today + "T12:00:00");

  for (let w = 0; w < weeksToAnalyse; w++) {
    const weekEnd = new Date(todayD);
    weekEnd.setDate(todayD.getDate() - (w * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);
    const count = logs.filter(l => l.date >= startStr && l.date <= endStr).length;
    weekBuckets.push(count);
  }

  // Only consider weeks that fall within the user's tracking history
  const firstLogDate = sorted[0].date;
  const totalDaysTracked = daysBetween(firstLogDate, today);
  const fullWeeksAvailable = Math.min(Math.floor(totalDaysTracked / 7), weeksToAnalyse);
  const relevantWeeks = weekBuckets.slice(0, Math.max(fullWeeksAvailable, 1));

  const avgDaysPerWeek = relevantWeeks.length > 0
    ? Math.round((relevantWeeks.reduce((s, c) => s + c, 0) / relevantWeeks.length) * 10) / 10
    : 0;

  // Trend: compare last 2 weeks vs prior 2 weeks
  const recent2 = relevantWeeks.slice(0, 2);
  const older2 = relevantWeeks.slice(2, 4);
  const recentAvg = recent2.length > 0
    ? Math.round((recent2.reduce((s, c) => s + c, 0) / recent2.length) * 10) / 10
    : 0;
  const olderAvg = older2.length > 0
    ? Math.round((older2.reduce((s, c) => s + c, 0) / older2.length) * 10) / 10
    : 0;

  let recentTrend: "increasing" | "decreasing" | "stable" = "stable";
  if (older2.length > 0) {
    const diff = recentAvg - olderAvg;
    if (diff >= 1) recentTrend = "increasing";
    else if (diff <= -1) recentTrend = "decreasing";
  }

  // Day-of-week frequency (which days does the user actually check in?)
  const dayFrequency = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // how many of each weekday exist in range
  const analysisStart = new Date(todayD);
  analysisStart.setDate(todayD.getDate() - Math.min(totalDaysTracked, 56)); // up to 8 weeks

  for (let d = new Date(analysisStart); d <= todayD; d.setDate(d.getDate() + 1)) {
    dayTotals[d.getDay()]++;
  }

  for (const log of logs) {
    const logD = new Date(log.date + "T12:00:00");
    const diff = daysBetween(log.date, today);
    if (diff >= 0 && diff <= 56) {
      dayFrequency[logD.getDay()]++;
    }
  }

  // Calculate rates per day-of-week
  const dayRates = dayNames.map((name, i) => ({
    name,
    rate: dayTotals[i] > 0 ? dayFrequency[i] / dayTotals[i] : 0,
  }));

  const sortedByRate = [...dayRates].sort((a, b) => b.rate - a.rate);
  const mostActiveDays = sortedByRate.filter(d => d.rate >= 0.5).map(d => d.name);
  const leastActiveDays = sortedByRate.filter(d => d.rate < 0.3).map(d => d.name);

  return {
    avgDaysPerWeek,
    weeksAnalysed: relevantWeeks.length,
    recentAvg,
    olderAvg,
    recentTrend,
    daysSinceLastCheckin,
    mostActiveDays: mostActiveDays.length > 0 ? mostActiveDays : [sortedByRate[0]?.name || "N/A"],
    leastActiveDays: leastActiveDays.length > 0 ? leastActiveDays : [sortedByRate[sortedByRate.length - 1]?.name || "N/A"],
  };
}

// ─── Pattern Disconnect Detection ─────────────────────────

export interface PatternDisconnect {
  /** Descriptive summary for the coach context */
  summary: string;
  /** The type of disconnect detected */
  type: "effort-no-outcome" | "no-effort-fine-outcome" | "uncorrelated-pair";
  /** The habit/metric names involved */
  habitA: string;
  habitB: string;
  /** Confidence: higher = more data points, more convincing pattern */
  confidence: number; // 0-1
}

/**
 * Known relationships between habits. Each pair defines:
 * - driverSlug: the binary habit (or bad habit) expected to influence the outcome
 * - outcomeSlug: the measured habit expected to reflect the driver's impact
 * - expectedDirection: "positive" = doing the driver should increase the outcome,
 *                      "negative" = the driver (bad habit) should decrease the outcome
 */
const HABIT_RELATIONSHIPS: {
  driverSlug: string;
  outcomeSlug: string;
  expectedDirection: "positive" | "negative";
}[] = [
  // Binary -> Measured (doing it should improve the score)
  { driverSlug: "tidy",            outcomeSlug: "environment-score", expectedDirection: "positive" },
  { driverSlug: "training",        outcomeSlug: "energy-level",      expectedDirection: "positive" },
  { driverSlug: "cold-exposure",   outcomeSlug: "energy-level",      expectedDirection: "positive" },
  { driverSlug: "meditation",      outcomeSlug: "energy-level",      expectedDirection: "positive" },
  { driverSlug: "reading",         outcomeSlug: "pages-read",        expectedDirection: "positive" },
  { driverSlug: "bible-reading",   outcomeSlug: "bible-chapters",    expectedDirection: "positive" },
  { driverSlug: "keystone-task",   outcomeSlug: "deep-work",         expectedDirection: "positive" },
  // Bad habit -> Measured (doing the bad habit should decrease the outcome)
  { driverSlug: "league",          outcomeSlug: "deep-work",         expectedDirection: "negative" },
  { driverSlug: "league",          outcomeSlug: "energy-level",      expectedDirection: "negative" },
];

/**
 * Detect disconnects between habit effort and measured outcomes over the
 * last 14-30 days. Only returns disconnects with sufficient data (7+ days
 * for both metrics) and a strong enough signal to be meaningful.
 *
 * Conservative approach: we require a clear pattern before flagging, to
 * avoid false positives that would erode trust in the coaching.
 */
export function detectPatternDisconnects(
  logs: DayLog[],
  habits: Habit[],
  today: string,
): PatternDisconnect[] {
  const disconnects: PatternDisconnect[] = [];

  // Build a lookup of habits by slug
  const habitBySlug = new Map<string, Habit>();
  for (const h of habits) {
    if (h.is_active) habitBySlug.set(h.slug, h);
  }

  // Get logs from the last 30 days
  const recentLogs = logs.filter(l => {
    const diff = daysBetween(l.date, today);
    return diff >= 0 && diff < 30;
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (recentLogs.length < 7) return disconnects; // Not enough data

  for (const rel of HABIT_RELATIONSHIPS) {
    const driverHabit = habitBySlug.get(rel.driverSlug);
    const outcomeHabit = habitBySlug.get(rel.outcomeSlug);
    if (!driverHabit || !outcomeHabit) continue;

    const isBadHabitDriver = driverHabit.category === "bad";
    const isDriverBinary = isBinaryLike(driverHabit.category);

    // Collect days where both driver and outcome have data
    const pairedDays: {
      date: string;
      driverActive: boolean;     // binary: done, bad: occurred
      outcomeValue: number;
    }[] = [];

    for (const log of recentLogs) {
      let driverActive: boolean | null = null;
      let outcomeValue: number | null = null;

      // Determine driver status
      if (isBadHabitDriver) {
        const badEntry = log.badEntries[driverHabit.id];
        if (badEntry !== undefined) {
          driverActive = badEntry.occurred;
        }
      } else if (isDriverBinary) {
        const entry = log.entries[driverHabit.id];
        if (entry && (entry.status === "done" || entry.status === "missed")) {
          driverActive = entry.status === "done";
        }
      }

      // Determine outcome value
      const outcomeEntry = log.entries[outcomeHabit.id];
      if (outcomeEntry?.value != null && outcomeEntry.value > 0) {
        outcomeValue = outcomeEntry.value;
      }

      // Only include days where we have data for both
      if (driverActive !== null && outcomeValue !== null) {
        pairedDays.push({ date: log.date, driverActive, outcomeValue });
      }
    }

    // Need at least 7 paired days for any conclusion
    if (pairedDays.length < 7) continue;

    // Split into days-with-driver and days-without-driver
    const withDriver = pairedDays.filter(d => d.driverActive);
    const withoutDriver = pairedDays.filter(d => !d.driverActive);

    // Need at least 3 data points in each group to compare
    if (withDriver.length < 3 || withoutDriver.length < 3) continue;

    const avgWith = withDriver.reduce((s, d) => s + d.outcomeValue, 0) / withDriver.length;
    const avgWithout = withoutDriver.reduce((s, d) => s + d.outcomeValue, 0) / withoutDriver.length;

    // Calculate the driver completion rate
    const driverRate = withDriver.length / pairedDays.length;

    // Determine the unit context for the outcome
    const outcomeUnit = outcomeHabit.unit;
    const isScale = outcomeUnit === "1-5" || outcomeUnit === "1-10";

    // Thresholds for "disconnect" — adaptive to the measurement scale
    // For 1-5 scales: a difference of 0.3 is meaningful
    // For counts: a difference of 15% is meaningful
    const minDifference = isScale ? 0.3 : Math.max(0.5, avgWith * 0.15);

    const actualDiff = avgWith - avgWithout;

    // Check for each disconnect type
    if (rel.expectedDirection === "positive") {
      // Effort without outcome: driver done often (>70%) but outcome doesn't improve
      if (driverRate >= 0.70 && Math.abs(actualDiff) < minDifference) {
        const confidence = Math.min(1, pairedDays.length / 21) * Math.min(1, driverRate);
        if (confidence >= 0.5) {
          disconnects.push({
            type: "effort-no-outcome",
            habitA: `${driverHabit.icon || ""} ${driverHabit.name}`,
            habitB: `${outcomeHabit.icon || ""} ${outcomeHabit.name}`,
            confidence,
            summary: `${driverHabit.icon || ""} ${driverHabit.name} done ${Math.round(driverRate * 100)}% of days but ${outcomeHabit.icon || ""} ${outcomeHabit.name} unchanged (avg ${avgWith.toFixed(1)} on done-days vs ${avgWithout.toFixed(1)} on miss-days, over ${pairedDays.length} days)`,
          });
        }
      }

      // No effort but outcome fine: driver rarely done (<30%) but outcome stays high
      // "High" = above the midpoint of the scale or above overall average
      const overallAvg = pairedDays.reduce((s, d) => s + d.outcomeValue, 0) / pairedDays.length;
      const midpoint = isScale ? (outcomeUnit === "1-5" ? 3 : 5) : overallAvg;
      if (driverRate <= 0.30 && avgWithout >= midpoint) {
        const confidence = Math.min(1, pairedDays.length / 21) * Math.min(1, 1 - driverRate);
        if (confidence >= 0.5) {
          disconnects.push({
            type: "no-effort-fine-outcome",
            habitA: `${driverHabit.icon || ""} ${driverHabit.name}`,
            habitB: `${outcomeHabit.icon || ""} ${outcomeHabit.name}`,
            confidence,
            summary: `${driverHabit.icon || ""} ${driverHabit.name} only done ${Math.round(driverRate * 100)}% of days yet ${outcomeHabit.icon || ""} ${outcomeHabit.name} stays solid (avg ${avgWithout.toFixed(1)}, over ${pairedDays.length} days) — is this habit as critical as assumed?`,
          });
        }
      }

      // Uncorrelated: both have decent data but correlation is opposite to expected
      // (doing the habit actually correlates with WORSE outcome)
      if (driverRate >= 0.30 && driverRate <= 0.70 && actualDiff < -minDifference) {
        const confidence = Math.min(1, pairedDays.length / 21) * 0.8;
        if (confidence >= 0.5) {
          disconnects.push({
            type: "uncorrelated-pair",
            habitA: `${driverHabit.icon || ""} ${driverHabit.name}`,
            habitB: `${outcomeHabit.icon || ""} ${outcomeHabit.name}`,
            confidence,
            summary: `Unexpected pattern: ${outcomeHabit.icon || ""} ${outcomeHabit.name} averages ${avgWithout.toFixed(1)} on days ${driverHabit.icon || ""} ${driverHabit.name} is missed vs ${avgWith.toFixed(1)} on done-days (${pairedDays.length} days of data) — worth investigating`,
          });
        }
      }
    }

    if (rel.expectedDirection === "negative") {
      // Bad habit occurring but outcome unaffected
      // For negative direction: driver active = bad, so avgWith should be LOWER
      // Disconnect = bad habit occurs often but outcome doesn't suffer
      if (driverRate >= 0.30 && actualDiff >= -minDifference) {
        const confidence = Math.min(1, pairedDays.length / 21) * Math.min(1, driverRate);
        if (confidence >= 0.45) {
          disconnects.push({
            type: "effort-no-outcome",
            habitA: `${driverHabit.icon || ""} ${driverHabit.name}`,
            habitB: `${outcomeHabit.icon || ""} ${outcomeHabit.name}`,
            confidence,
            summary: `${driverHabit.icon || ""} ${driverHabit.name} occurs ${Math.round(driverRate * 100)}% of days but ${outcomeHabit.icon || ""} ${outcomeHabit.name} doesn't seem to suffer (avg ${avgWith.toFixed(1)} on bad days vs ${avgWithout.toFixed(1)} on clean days, over ${pairedDays.length} days) — may not be as harmful as expected, or something else compensates`,
          });
        }
      }

      // Bad habit rarely occurs but outcome still low
      const overallAvgNeg = pairedDays.reduce((s, d) => s + d.outcomeValue, 0) / pairedDays.length;
      const lowThreshold = isScale ? (outcomeUnit === "1-5" ? 2.5 : 4) : overallAvgNeg * 0.7;
      if (driverRate <= 0.20 && avgWithout <= lowThreshold) {
        const confidence = Math.min(1, pairedDays.length / 21) * 0.7;
        if (confidence >= 0.5) {
          disconnects.push({
            type: "uncorrelated-pair",
            habitA: `${driverHabit.icon || ""} ${driverHabit.name}`,
            habitB: `${outcomeHabit.icon || ""} ${outcomeHabit.name}`,
            confidence,
            summary: `${driverHabit.icon || ""} ${driverHabit.name} barely occurs (${Math.round(driverRate * 100)}% of days) yet ${outcomeHabit.icon || ""} ${outcomeHabit.name} remains low (avg ${avgWithout.toFixed(1)}, over ${pairedDays.length} days) — something else is likely driving this`,
          });
        }
      }
    }
  }

  // Sort by confidence (most convincing first) and limit to top 3
  disconnects.sort((a, b) => b.confidence - a.confidence);
  return disconnects.slice(0, 3);
}

// ─── Tracking Gaps / Survivorship Bias Detection ─────────

/**
 * Wellbeing categories and the habit slugs that map to each.
 * A category is "covered" if at least one active habit matches.
 * This is deliberately broad — false negatives (missing a mapping)
 * are safer than false positives (claiming coverage that doesn't exist).
 */
const WELLBEING_CATEGORIES: { category: string; label: string; matchSlugs: string[] }[] = [
  {
    category: "physical",
    label: "Physical health",
    matchSlugs: ["training", "cold-exposure", "training-minutes", "rpe", "energy-level"],
  },
  {
    category: "mental",
    label: "Mental wellness / mindfulness",
    matchSlugs: ["meditation", "journal", "prayer"],
  },
  {
    category: "social",
    label: "Social connections",
    matchSlugs: [], // User has no social habits currently — this is intentional to flag
  },
  {
    category: "financial",
    label: "Financial wellness",
    matchSlugs: [], // No financial habits tracked
  },
  {
    category: "creative",
    label: "Creative output",
    matchSlugs: [], // No dedicated creative habit
  },
  {
    category: "environmental",
    label: "Living environment",
    matchSlugs: ["tidy", "chore", "environment-score"],
  },
  {
    category: "professional",
    label: "Professional / career growth",
    matchSlugs: ["deep-work", "keystone-task", "admin-tasks"],
  },
  {
    category: "learning",
    label: "Learning / intellectual growth",
    matchSlugs: ["reading", "pages-read", "bible-reading", "bible-chapters"],
  },
  {
    category: "sleep",
    label: "Sleep quality / quantity",
    matchSlugs: [], // No sleep tracking
  },
  {
    category: "nutrition",
    label: "Nutrition / diet",
    matchSlugs: [], // No nutrition tracking
  },
];

/**
 * Detect what the user ISN'T tracking — category coverage gaps and
 * time-period gaps. Returns an array of human-readable blind spot
 * descriptions for the coach context.
 *
 * Conservative: only flags clearly missing categories and genuinely
 * sparse time periods. Wrong suggestions erode trust.
 */
export function detectTrackingGaps(
  habits: Habit[],
  logs: DayLog[],
  today: string,
): string[] {
  const gaps: string[] = [];
  const activeHabits = habits.filter(h => h.is_active);
  const activeSlugs = new Set(activeHabits.map(h => h.slug));

  // ── 1. Category coverage gaps ──
  const uncoveredCategories: string[] = [];
  for (const cat of WELLBEING_CATEGORIES) {
    const hasCoverage = cat.matchSlugs.some(slug => activeSlugs.has(slug));
    if (!hasCoverage) {
      uncoveredCategories.push(cat.label);
    }
  }

  if (uncoveredCategories.length > 0) {
    gaps.push(`No habits tracked for: ${uncoveredCategories.join(", ")}`);
  }

  // ── 2. Stack coverage gaps ──
  // Check if any stacks have very few habits (user may have deactivated most)
  const stackCounts: Record<string, number> = { morning: 0, midday: 0, evening: 0 };
  for (const h of activeHabits) {
    if (h.category !== "bad") {
      stackCounts[h.stack] = (stackCounts[h.stack] ?? 0) + 1;
    }
  }
  for (const [stack, count] of Object.entries(stackCounts)) {
    if (count === 0) {
      gaps.push(`No active habits in the ${stack} stack — this time period is completely untracked`);
    }
  }

  // ── 3. Time period gaps (day-of-week sparse data) ──
  // Only analyse if we have at least 14 days of logs
  if (logs.length >= 14) {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayD = new Date(today + "T12:00:00");

    // Count logs per day-of-week in the last 30 days
    const last30Logs = logs.filter(l => {
      const diff = daysBetween(l.date, today);
      return diff >= 0 && diff < 30;
    });

    // Count how many of each weekday exist in the last 30 days
    const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
    const weekdayLogs = [0, 0, 0, 0, 0, 0, 0];
    const startDate = new Date(todayD);
    startDate.setDate(todayD.getDate() - 29);

    for (let d = new Date(startDate); d <= todayD; d.setDate(d.getDate() + 1)) {
      weekdayOccurrences[d.getDay()]++;
    }

    for (const log of last30Logs) {
      const logD = new Date(log.date + "T12:00:00");
      weekdayLogs[logD.getDay()]++;
    }

    // Flag days with very low logging rate (< 25% of possible days in last 30 days)
    const sparseDays: string[] = [];
    const sparseDetails: string[] = [];
    for (let i = 0; i < 7; i++) {
      if (weekdayOccurrences[i] > 0) {
        const rate = weekdayLogs[i] / weekdayOccurrences[i];
        if (rate < 0.25 && weekdayOccurrences[i] >= 3) {
          sparseDays.push(dayNames[i]);
          sparseDetails.push(`${weekdayLogs[i]} ${dayNames[i]} logs`);
        }
      }
    }

    if (sparseDays.length > 0) {
      // Group weekends together if both are sparse
      const hasWeekendGap = sparseDays.includes("Saturday") && sparseDays.includes("Sunday");
      if (hasWeekendGap && sparseDays.length <= 3) {
        const weekendLogs = weekdayLogs[0] + weekdayLogs[6];
        gaps.push(`Weekend data sparse: only ${weekendLogs} weekend logs in 30 days — weekend patterns are invisible`);
      } else {
        gaps.push(`${sparseDays.join(", ")} data sparse: only ${sparseDetails.join(", ")} in 30 days`);
      }
    }
  }

  // ── 4. Measured habit gaps ──
  // If user has binary habits for an area but no measured counterpart,
  // the depth of data is limited (e.g., "Training: done" but no duration/RPE)
  const hasTrainingBinary = activeSlugs.has("training");
  const hasTrainingMeasured = activeSlugs.has("training-minutes") || activeSlugs.has("rpe");
  if (hasTrainingBinary && !hasTrainingMeasured) {
    gaps.push("Training tracked as done/miss only — no duration or intensity data for deeper analysis");
  }

  const hasReadingBinary = activeSlugs.has("reading");
  const hasReadingMeasured = activeSlugs.has("pages-read");
  if (hasReadingBinary && !hasReadingMeasured) {
    gaps.push("Reading tracked as done/miss only — no pages/time data to measure depth");
  }

  return gaps;
}

// ─── Miss Reason Summary ─────────────────────────────────

const MISS_CATEGORY_LABELS: Record<MissCategory, string> = {
  "trade-off": "Trade-off",
  "forgot": "Forgot",
  "energy": "Low Energy",
  "time": "No Time",
  "other": "Other",
};

/**
 * Summarize miss reasons from the last 14 days.
 * Groups by category with counts and lists specific habits per category.
 */
function buildMissReasonSummary(logs: DayLog[], habits: Habit[], today: string): string | null {
  const recent14 = logs.filter(l => {
    const diff = daysBetween(l.date, today);
    return diff >= 0 && diff < 14;
  });

  if (recent14.length === 0) return null;

  // Collect all miss reasons grouped by category
  const byCategory: Record<string, { count: number; habits: Set<string>; reasons: string[] }> = {};
  let totalWithReason = 0;
  let totalMisses = 0;

  const habitById = new Map(habits.map(h => [h.id, h]));

  for (const log of recent14) {
    for (const [habitId, entry] of Object.entries(log.entries)) {
      if (entry.status !== "missed") continue;
      totalMisses++;

      const cat = entry.missCategory;
      if (!cat) continue;
      totalWithReason++;

      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, habits: new Set(), reasons: [] };
      }
      byCategory[cat].count++;

      const habit = habitById.get(habitId);
      if (habit) {
        byCategory[cat].habits.add(`${habit.icon || ""} ${habit.name}`);
      }
      if (entry.missReason) {
        byCategory[cat].reasons.push(entry.missReason);
      }
    }
  }

  // Only include section if there's at least one miss with a reason
  if (totalWithReason === 0) return null;

  const lines: string[] = [];
  lines.push(`## MISS REASONS (last 14 days — ${totalWithReason}/${totalMisses} misses have reasons)`);

  // Sort categories by count descending
  const sorted = Object.entries(byCategory).sort(([, a], [, b]) => b.count - a.count);
  for (const [cat, data] of sorted) {
    const label = MISS_CATEGORY_LABELS[cat as MissCategory] ?? cat;
    const habitList = [...data.habits].join(", ");
    lines.push(`- ${label}: ${data.count} times — ${habitList}`);
    // Include up to 2 custom reasons for context
    const uniqueReasons = [...new Set(data.reasons)].slice(0, 2);
    if (uniqueReasons.length > 0) {
      lines.push(`  Reasons: ${uniqueReasons.map(r => `"${r}"`).join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────────────

function getWeekLogs(logs: DayLog[], today: string): DayLog[] {
  const d = new Date(today + "T12:00:00");
  const dayOfWeek = d.getDay(); // 0=Sun
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dayOfWeek);
  const startStr = weekStart.toISOString().slice(0, 10);
  return logs.filter(l => l.date >= startStr && l.date <= today);
}

function getPrevWeekLogs(logs: DayLog[], today: string): DayLog[] {
  const d = new Date(today + "T12:00:00");
  const dayOfWeek = d.getDay();
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dayOfWeek);
  const prevEnd = new Date(weekStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 6);
  const startStr = prevStart.toISOString().slice(0, 10);
  const endStr = prevEnd.toISOString().slice(0, 10);
  return logs.filter(l => l.date >= startStr && l.date <= endStr);
}

function getWeekStartDate(today: string): string {
  const d = new Date(today + "T12:00:00");
  const dayOfWeek = d.getDay();
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dayOfWeek);
  return weekStart.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00");
  const b = new Date(to + "T12:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
