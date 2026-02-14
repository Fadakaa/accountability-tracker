// Data context builder — compresses all user metrics into a structured
// text summary for the AI prompt. Token-efficient: ~500-800 tokens instead
// of dumping thousands of raw log entries.

import type { LocalState, DayLog, CoachExperiment } from "@/lib/store";
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
}

/** Build a compressed text summary of all user data for the AI coach */
export function buildCoachContext(input: CoachContextInput): string {
  const { state, settings, habits, gymSessions, showingUp, experiments } = input;
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
  lines.push("");

  // ── This Week ──
  const weekLogs = getWeekLogs(state.logs, today);
  const prevWeekLogs = getPrevWeekLogs(state.logs, today);
  lines.push("## THIS WEEK");
  lines.push(`Days logged: ${weekLogs.length}/7`);
  lines.push(`Bare minimum met: ${weekLogs.filter(l => l.bareMinimumMet).length}/7`);
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

  if (doing_well.length > 0) {
    lines.push("## HABITS DOING WELL (>85% last 14 days)");
    for (const h of doing_well) {
      lines.push(`- ${h.name}: ${Math.round(h.rate * 100)}%`);
    }
    lines.push("");
  }

  if (needsAttention.length > 0) {
    lines.push("## HABITS NEEDING ATTENTION (<50% last 14 days)");
    for (const h of needsAttention) {
      lines.push(`- ${h.name}: ${Math.round(h.rate * 100)}%`);
    }
    lines.push("");
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
