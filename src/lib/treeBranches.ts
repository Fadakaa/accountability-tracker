// Tree branch auto-categorization — keyword heuristics + user override resolution

import type { Habit } from "@/types/database";
import type { UserSettings } from "./store";

export interface TreeBranchDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export const DEFAULT_TREE_BRANCHES: TreeBranchDef[] = [
  { id: "spiritual",   name: "Spiritual",   icon: "🙏", color: "#a78bfa", isDefault: true },
  { id: "physical",    name: "Physical",    icon: "💪", color: "#f97316", isDefault: true },
  { id: "mind",        name: "Mind",        icon: "🧠", color: "#3b82f6", isDefault: true },
  { id: "environment", name: "Environment", icon: "🏠", color: "#22c55e", isDefault: true },
];

export const NEW_GROWTH_BRANCH: TreeBranchDef = {
  id: "new-growth",
  name: "New Growth",
  icon: "🌱",
  color: "#facc15",
  isDefault: false,
};

const BRANCH_KEYWORDS: Record<string, string[]> = {
  spiritual:   ["pray", "bible", "faith", "church", "meditat", "worship", "devotion", "scripture", "nsdr", "yoga nidra"],
  physical:    ["train", "gym", "run", "cold", "stretch", "exercise", "walk", "swim", "bjj", "martial", "push-up", "plank", "rpe", "energy"],
  mind:        ["read", "journal", "deep work", "deep-work", "focus", "study", "learn", "write", "keystone", "book", "pages"],
  environment: ["tidy", "clean", "chore", "organiz", "environment", "space", "home", "room"],
};

/** Auto-suggest a branch based on habit name/slug keywords */
export function suggestBranch(habitName: string, habitSlug: string): string {
  const text = `${habitName} ${habitSlug}`.toLowerCase();
  for (const [branchId, keywords] of Object.entries(BRANCH_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return branchId;
  }
  return "new-growth";
}

/** Resolve the branch for a habit: user override > keyword heuristic > "new-growth" */
export function getHabitBranch(habit: Habit, settings: UserSettings): string {
  const override = settings.habitOverrides[habit.id]?.treeBranch;
  if (override) return override;
  return suggestBranch(habit.name, habit.slug);
}

/** Get all branch definitions (defaults + any custom, always includes new-growth if needed) */
export function getAllBranches(settings: UserSettings): TreeBranchDef[] {
  return settings.treeBranches ?? DEFAULT_TREE_BRANCHES;
}
