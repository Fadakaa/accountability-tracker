// Tree Auto-Branching — dynamically assigns habits to skill tree branches
// Uses keyword matching on habit name/slug, with user override support

import { loadSettings } from "./store";
import type { Habit } from "@/types/database";

export type TreeBranchName = "Spiritual" | "Physical" | "Mind" | "Environment" | "Discipline" | "New Growth";

export interface TreeBranchDef {
  name: TreeBranchName;
  icon: string;
  color: string;
}

export const TREE_BRANCHES: TreeBranchDef[] = [
  { name: "Spiritual",   icon: "🙏", color: "#a78bfa" },
  { name: "Physical",    icon: "💪", color: "#f97316" },
  { name: "Mind",        icon: "🧠", color: "#3b82f6" },
  { name: "Environment", icon: "🏠", color: "#22c55e" },
  { name: "Discipline",  icon: "🛡️", color: "#ef4444" },
  { name: "New Growth",  icon: "🌱", color: "#14b8a6" },
];

// Keyword-to-branch mapping — checked in order (first match wins)
const KEYWORD_RULES: { keywords: string[]; branch: TreeBranchName }[] = [
  // Spiritual
  { keywords: ["prayer", "pray", "bible", "scripture", "faith", "worship", "church", "devotion", "spiritual", "god"],
    branch: "Spiritual" },
  // Physical
  { keywords: ["training", "train", "gym", "exercise", "run", "bjj", "cold", "cold-exposure", "walk", "swim", "sport", "physical", "body", "workout", "lift", "stretch", "yoga", "martial"],
    branch: "Physical" },
  // Mind
  { keywords: ["reading", "read", "journal", "write", "deep-work", "focus", "study", "learn", "book", "page", "keystone", "meditat", "nsdr", "nidra", "brain", "mental", "think", "reflect"],
    branch: "Mind" },
  // Environment
  { keywords: ["tidy", "clean", "chore", "environment", "space", "room", "house", "home", "organiz", "declutter", "hygiene"],
    branch: "Environment" },
  // Discipline (bad habits, energy tracking, meaningful action)
  { keywords: ["league", "gaming", "plates", "bad", "habit", "energy", "meaningful", "action", "rpe", "intensity"],
    branch: "Discipline" },
];

/**
 * Suggests a branch for a habit based on keyword matching.
 * Checks the habit's name and slug against keyword rules.
 * Returns "New Growth" as fallback for unmatched habits.
 */
export function suggestBranch(habit: Habit): TreeBranchName {
  const text = `${habit.name} ${habit.slug}`.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        return rule.branch;
      }
    }
  }

  return "New Growth";
}

/**
 * Gets the branch for a habit, respecting user overrides.
 * Priority: user override > keyword matching > fallback
 */
export function getBranchForHabit(habit: Habit): TreeBranchName {
  const settings = loadSettings();

  // Check user override first
  const override = settings.habitOverrides[habit.id];
  if (override?.treeBranch) {
    return override.treeBranch as TreeBranchName;
  }

  return suggestBranch(habit);
}

/**
 * Gets the branch definition by name
 */
export function getBranchDef(name: TreeBranchName): TreeBranchDef {
  return TREE_BRANCHES.find((b) => b.name === name) ?? TREE_BRANCHES[TREE_BRANCHES.length - 1];
}

/**
 * Groups habits into branches dynamically.
 * Returns only branches that have at least one habit with levels.
 */
export function groupHabitsByBranch(habits: Habit[]): Map<TreeBranchName, Habit[]> {
  const groups = new Map<TreeBranchName, Habit[]>();

  for (const habit of habits) {
    const branch = getBranchForHabit(habit);
    const list = groups.get(branch) ?? [];
    list.push(habit);
    groups.set(branch, list);
  }

  return groups;
}
