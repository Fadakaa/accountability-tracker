# Tree Auto-Branching — Implementation Plan

## Overview
Replace the hardcoded branch→habit mapping in the Skill Tree with a data-driven system that automatically categorizes habits into branches, supports user overrides, and gracefully handles new/unmapped habits.

---

## Step 1: Data Model Changes

### 1a. Add `treeBranch` to `HabitOverride` (`src/lib/store.ts`)
```ts
export interface HabitOverride {
  stack?: HabitStack;
  is_bare_minimum?: boolean;
  is_active?: boolean;
  current_level?: number;
  sort_order?: number;
  treeBranch?: string;  // NEW — "spiritual" | "physical" | "mind" | "environment" | custom
}
```

### 1b. Add branch definitions to `UserSettings` (`src/lib/store.ts`)
```ts
export interface TreeBranchDef {
  id: string;       // e.g. "spiritual", "physical", or "custom-xyz"
  name: string;     // Display name
  icon: string;     // Emoji
  color: string;    // Hex color
  isDefault: boolean; // Can't be deleted
}

export interface UserSettings {
  // ... existing fields ...
  treeBranches?: TreeBranchDef[];  // NEW — user's branch definitions
}
```

### 1c. Define default branches
```ts
const DEFAULT_TREE_BRANCHES: TreeBranchDef[] = [
  { id: "spiritual",   name: "Spiritual",   icon: "🙏", color: "#a78bfa", isDefault: true },
  { id: "physical",    name: "Physical",    icon: "💪", color: "#f97316", isDefault: true },
  { id: "mind",        name: "Mind",        icon: "🧠", color: "#3b82f6", isDefault: true },
  { id: "environment", name: "Environment", icon: "🏠", color: "#22c55e", isDefault: true },
];
```

---

## Step 2: Keyword Heuristics for Auto-Suggestion (`src/lib/treeBranches.ts` — new file)

Create a lightweight auto-categorizer:

```ts
const BRANCH_KEYWORDS: Record<string, string[]> = {
  spiritual:   ["pray", "bible", "faith", "church", "meditat", "worship", "devotion", "scripture", "nsdr", "yoga nidra"],
  physical:    ["train", "gym", "run", "cold", "stretch", "exercise", "walk", "swim", "bjj", "martial", "push-up", "plank", "rpe"],
  mind:        ["read", "journal", "deep work", "focus", "study", "learn", "write", "keystone", "book", "pages"],
  environment: ["tidy", "clean", "chore", "organiz", "environment", "space", "home", "room"],
};

export function suggestBranch(habitName: string, habitSlug: string): string {
  const text = `${habitName} ${habitSlug}`.toLowerCase();
  for (const [branchId, keywords] of Object.entries(BRANCH_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return branchId;
  }
  return "new-growth"; // fallback
}
```

Also export a function to resolve the branch for a habit:
```ts
export function getHabitBranch(habit: Habit, settings: UserSettings): string {
  // 1. User override takes priority
  const override = settings.habitOverrides[habit.id]?.treeBranch;
  if (override) return override;
  // 2. Auto-suggest based on name/slug
  return suggestBranch(habit.name, habit.slug);
}
```

---

## Step 3: Pre-Map Existing Habits (Migration)

On first load (no `treeBranches` in settings), seed the overrides for existing habits using the **current hardcoded mapping** so nothing changes visually:

```
prayer, bible-reading, meditation → "spiritual"
training, training-minutes, cold-exposure → "physical"
reading, journal, deep-work, keystone-task → "mind"
tidy → "environment"
chore, meaningful-action → "environment"  (auto-suggested)
```

Habits without HABIT_LEVELS (like "Chore", "Meaningful Action", "Energy Level") will appear in the tree with a **single placeholder node** showing their current state.

---

## Step 4: Refactor `buildSkillTree()` in `src/app/tree/page.tsx`

Replace the hardcoded branch arrays with a dynamic builder:

```ts
function buildSkillTree(settings: UserSettings): SkillBranch[] {
  const habits = getResolvedHabits().filter(h => h.is_active);
  const branches = settings.treeBranches ?? DEFAULT_TREE_BRANCHES;

  // Add "New Growth" fallback branch
  const allBranches = [...branches, NEW_GROWTH_BRANCH];

  // Build branch → habits mapping
  const branchHabits = new Map<string, SkillNode[]>();

  for (const habit of habits) {
    const branchId = getHabitBranch(habit, settings);
    const levels = HABIT_LEVELS.filter(hl => hl.habit_id === habit.id);

    const nodes: SkillNode[] = levels.length > 0
      ? levels.map(hl => ({ habitSlug: habit.slug, habitId: habit.id, ... }))
      : [{ /* single placeholder node at current level */ }];

    const existing = branchHabits.get(branchId) ?? [];
    branchHabits.set(branchId, [...existing, ...nodes]);
  }

  // Build final SkillBranch array, skip empty branches (except "New Growth" which only shows when non-empty)
  return allBranches
    .map(def => ({ ...def, nodes: branchHabits.get(def.id) ?? [] }))
    .filter(b => b.nodes.length > 0 || b.isDefault);
}
```

**Key behavior:**
- Habits with HABIT_LEVELS → show Lv.1–4 progression nodes (same as today)
- Habits without HABIT_LEVELS → show a **single "Active" node** with the habit name as label
- "New Growth" branch only renders if it has habits

---

## Step 5: Settings UI — Branch Assignment (`src/app/settings/page.tsx`)

In the existing `HabitSettingsRow` expanded controls, add a **branch picker** below the stack selector:

```
[Branch]
[🙏 Spiritual] [💪 Physical] [🧠 Mind] [🏠 Environment]
```

Same UI pattern as the existing stack selector — a row of toggle buttons. The current branch is highlighted with `bg-brand`.

This writes to `settings.habitOverrides[habitId].treeBranch`.

---

## Step 6: "New Growth" Fallback Branch

```ts
const NEW_GROWTH_BRANCH: TreeBranchDef = {
  id: "new-growth",
  name: "New Growth",
  icon: "🌱",
  color: "#facc15", // yellow
  isDefault: false,
};
```

Any habit that:
- Has no `treeBranch` override AND
- Doesn't match any keyword heuristic

...lands here. The tree page renders it at the bottom with a subtle prompt: *"Assign these habits to a branch in Settings"*.

---

## Step 7: Single-Node Habits (No HABIT_LEVELS)

For habits like "Chore", "Meaningful Action", "Energy Level" that don't have level definitions:

```ts
// In buildSkillTree, when no HABIT_LEVELS exist for a habit:
const placeholderNode: SkillNode = {
  habitSlug: habit.slug,
  habitId: habit.id,
  habitName: habit.name,
  icon: habit.icon || "🔵",
  level: 1,
  label: habit.name,
  description: "Building consistency...",
};
```

These render as a single chip on the branch, showing streak info. They participate in tree health calculation as a 1-node habit (always "unlocked" at Lv.1).

---

## File Change Summary

| File | Change |
|------|--------|
| `src/lib/store.ts` | Add `treeBranch` to `HabitOverride`, add `TreeBranchDef`, add `treeBranches` to `UserSettings`, add `DEFAULT_TREE_BRANCHES` |
| `src/lib/treeBranches.ts` | **NEW** — keyword heuristics, `suggestBranch()`, `getHabitBranch()`, migration helper |
| `src/app/tree/page.tsx` | Refactor `buildSkillTree()` to be data-driven, handle single-node habits, render "New Growth" branch |
| `src/app/settings/page.tsx` | Add branch picker to `HabitSettingsRow`, add `resetToDefaults` update for `treeBranches` |
| `src/types/database.ts` | No changes needed (tree branch is a settings concern, not a habit field) |

---

## Implementation Order

1. **store.ts** — data model changes (types + defaults)
2. **treeBranches.ts** — new file with heuristics + branch resolution
3. **tree/page.tsx** — refactor buildSkillTree to be dynamic
4. **settings/page.tsx** — add branch picker UI
5. Test: verify existing habits appear in correct branches, new/unmapped habits go to "New Growth", branch picker works
