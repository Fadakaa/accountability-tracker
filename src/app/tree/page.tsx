"use client";

import { useEffect, useState } from "react";
import { loadState, loadSettings } from "@/lib/store";
import type { LocalState } from "@/lib/store";
import { HABIT_LEVELS, getFlameIcon } from "@/lib/habits";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { evaluateLevelSuggestions, acceptLevelUp, declineLevelUp, acceptDropBack } from "@/lib/adaptive";
import type { LevelSuggestion } from "@/lib/adaptive";
import { DEFAULT_TREE_BRANCHES, NEW_GROWTH_BRANCH, getHabitBranch } from "@/lib/treeBranches";
import type { TreeBranchDef } from "@/lib/treeBranches";

// ─── Skill Tree Data ────────────────────────────────────────
interface SkillNode {
  habitSlug: string;
  habitId: string;
  habitName: string;
  icon: string;
  level: number;
  label: string;
  description: string | null;
}

interface SkillBranch {
  id: string;
  name: string;
  icon: string;
  color: string;
  nodes: SkillNode[];
}

// Build branches dynamically from habit data + branch assignments
function buildSkillTree(): SkillBranch[] {
  const settings = loadSettings();
  const habits = getResolvedHabits().filter((h) => h.is_active);
  const branchDefs = settings.treeBranches ?? DEFAULT_TREE_BRANCHES;

  // Build a lookup: habitId → SkillNode[] from HABIT_LEVELS
  const levelsByHabit = new Map<string, SkillNode[]>();
  for (const hl of HABIT_LEVELS) {
    const habit = habits.find((h) => h.id === hl.habit_id);
    if (!habit) continue;
    const nodes = levelsByHabit.get(habit.id) ?? [];
    nodes.push({
      habitSlug: habit.slug,
      habitId: habit.id,
      habitName: habit.name,
      icon: habit.icon || "🔵",
      level: hl.level,
      label: hl.label,
      description: hl.description,
    });
    levelsByHabit.set(habit.id, nodes);
  }

  // Assign each active habit to a branch
  const branchHabits = new Map<string, SkillNode[]>();

  for (const habit of habits) {
    // Skip bad habits — they don't belong on the skill tree
    if (habit.category === "bad") continue;

    const branchId = getHabitBranch(habit, settings);
    const existingLevels = levelsByHabit.get(habit.id);

    let nodes: SkillNode[];
    if (existingLevels && existingLevels.length > 0) {
      // Habit has HABIT_LEVELS → show Lv.1–4 progression
      nodes = existingLevels;
    } else {
      // No HABIT_LEVELS → single placeholder node
      nodes = [{
        habitSlug: habit.slug,
        habitId: habit.id,
        habitName: habit.name,
        icon: habit.icon || "🔵",
        level: 1,
        label: habit.name,
        description: "Building consistency...",
      }];
    }

    const existing = branchHabits.get(branchId) ?? [];
    branchHabits.set(branchId, [...existing, ...nodes]);
  }

  // Build final branches: default branches always show, new-growth only if populated
  const allDefs: TreeBranchDef[] = [...branchDefs, NEW_GROWTH_BRANCH];
  return allDefs
    .map((def) => ({
      id: def.id,
      name: def.name,
      icon: def.icon,
      color: def.color,
      nodes: branchHabits.get(def.id) ?? [],
    }))
    .filter((b) => {
      // Always show default branches, only show new-growth if it has habits
      const def = allDefs.find((d) => d.id === b.id);
      return b.nodes.length > 0 || (def?.isDefault ?? false);
    });
}

// ─── Component ──────────────────────────────────────────────
export default function SkillTreePage() {
  const [state, setState] = useState<LocalState | null>(null);
  const [suggestions, setSuggestions] = useState<LevelSuggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const branches = buildSkillTree();

  useEffect(() => {
    setState(loadState());
    // Show ALL suggestions — level_up and drop_back
    setSuggestions(evaluateLevelSuggestions());
  }, []);

  function handleAcceptLevelUp(habitId: string) {
    acceptLevelUp(habitId);
    setState(loadState());
    setDismissedSuggestions((prev) => new Set(prev).add(habitId));
    setSuggestions((prev) => prev.filter((s) => s.habitId !== habitId));
  }

  function handleDeclineLevelUp(habitId: string) {
    declineLevelUp(habitId);
    setDismissedSuggestions((prev) => new Set(prev).add(habitId));
    setSuggestions((prev) => prev.filter((s) => s.habitId !== habitId));
  }

  function handleAcceptDropBack(habitId: string) {
    acceptDropBack(habitId);
    setState(loadState());
    setDismissedSuggestions((prev) => new Set(prev).add(habitId));
    setSuggestions((prev) => prev.filter((s) => s.habitId !== habitId));
  }

  function handleDeclineDropBack(habitId: string) {
    // Declining a drop-back just dismisses it — same as declining a level-up (suppresses for 7 days)
    declineLevelUp(habitId);
    setDismissedSuggestions((prev) => new Set(prev).add(habitId));
    setSuggestions((prev) => prev.filter((s) => s.habitId !== habitId));
  }

  if (!state) return null;

  // Get resolved habits for current_level lookups
  const resolvedHabits = getResolvedHabits();

  // Calculate tree health: weighted score from unlocked levels (60%) + active streaks (40%)
  // This means your tree stays healthy only if you're BOTH levelling up AND staying consistent
  let totalNodes = 0;
  let unlockedNodes = 0;
  const uniqueHabitSlugs = new Set<string>();
  for (const branch of branches) {
    for (const node of branch.nodes) {
      totalNodes++;
      const habit = resolvedHabits.find((h) => h.id === node.habitId);
      const currentLevel = habit?.current_level ?? 1;
      if (node.level <= currentLevel) {
        unlockedNodes++;
      }
      if (habit) uniqueHabitSlugs.add(habit.slug);
    }
  }
  const levelScore = totalNodes > 0 ? unlockedNodes / totalNodes : 0;

  // Streak health: what % of tree habits have an active streak (>0 days)?
  let activeStreakCount = 0;
  for (const slug of uniqueHabitSlugs) {
    if ((state.streaks[slug] ?? 0) > 0) activeStreakCount++;
  }
  const streakScore = uniqueHabitSlugs.size > 0 ? activeStreakCount / uniqueHabitSlugs.size : 0;

  // Weighted: 60% level progress, 40% active consistency
  const treeHealth = Math.round((levelScore * 0.6 + streakScore * 0.4) * 100);

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">🌳 Skill Tree</h1>
      </header>

      {/* Tree Health */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Tree Health
          </h2>
          <span className="text-sm font-bold text-done">{treeHealth}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-surface-700">
          <div
            className="h-3 rounded-full bg-done transition-all duration-700"
            style={{ width: `${treeHealth}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-neutral-600 mt-1">
          <span>{unlockedNodes}/{totalNodes} nodes unlocked</span>
          <span>•</span>
          <span>{activeStreakCount}/{uniqueHabitSlugs.size} habits with active streaks</span>
        </div>
      </section>

      {/* How it works */}
      <section className="rounded-xl bg-surface-800/50 border border-surface-700 p-3 mb-6">
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          <span className="text-brand font-semibold">How it works:</span> Start at Lv.1 (easy). Stay consistent for 14 days at {">"}85% and the app suggests levelling up. Accept → new level becomes your standard. Max level is 4.
        </p>
      </section>

      {/* Level-up suggestions */}
      {suggestions.filter((s) => !dismissedSuggestions.has(s.habitId) && s.type === "level_up").length > 0 && (
        <section className="space-y-3 mb-6">
          <h2 className="text-xs font-bold text-done uppercase tracking-wider">
            Ready to Level Up
          </h2>
          {suggestions
            .filter((s) => !dismissedSuggestions.has(s.habitId) && s.type === "level_up")
            .map((s) => (
              <div
                key={s.habitId}
                className="rounded-xl bg-done/10 border border-done/30 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{s.habitIcon}</span>
                  <div>
                    <span className="text-sm font-bold text-white">{s.habitName}</span>
                    <p className="text-xs text-neutral-400">
                      Lv.{s.currentLevel} → Lv.{s.nextLevel}: {s.nextLevelLabel}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-done/80 mb-3">
                  You&apos;ve been consistent for 14+ days. Ready to raise the bar?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptLevelUp(s.habitId)}
                    className="flex-1 rounded-lg py-2 text-sm font-bold bg-done text-white active:scale-95 transition-all"
                  >
                    Level Up (+150 XP)
                  </button>
                  <button
                    onClick={() => handleDeclineLevelUp(s.habitId)}
                    className="flex-1 rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-400 active:scale-95 transition-all"
                  >
                    Not Yet
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* Drop-back suggestions (safety net) */}
      {suggestions.filter((s) => !dismissedSuggestions.has(s.habitId) && s.type === "drop_back").length > 0 && (
        <section className="space-y-3 mb-6">
          <h2 className="text-xs font-bold text-later uppercase tracking-wider">
            ⚠️ Struggling — Consider Dropping Back
          </h2>
          {suggestions
            .filter((s) => !dismissedSuggestions.has(s.habitId) && s.type === "drop_back")
            .map((s) => (
              <div
                key={s.habitId}
                className="rounded-xl bg-later/10 border border-later/30 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{s.habitIcon}</span>
                  <div>
                    <span className="text-sm font-bold text-white">{s.habitName}</span>
                    <p className="text-xs text-neutral-400">
                      Lv.{s.currentLevel} → Lv.{s.nextLevel}: {s.nextLevelLabel}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-later/80 mb-3">
                  Completion has dropped below 50% since your last level-up. No shame in going back — consistency beats ambition.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptDropBack(s.habitId)}
                    className="flex-1 rounded-lg py-2 text-sm font-bold bg-later text-white active:scale-95 transition-all"
                  >
                    Drop Back
                  </button>
                  <button
                    onClick={() => handleDeclineDropBack(s.habitId)}
                    className="flex-1 rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-400 active:scale-95 transition-all"
                  >
                    Keep Pushing
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* Branches */}
      <div className="space-y-6">
        {branches.map((branch) => (
          <BranchCard
            key={branch.id}
            branch={branch}
            streaks={state.streaks}
            resolvedHabits={resolvedHabits}
          />
        ))}
      </div>

      {/* Back */}
      <div className="mt-auto pt-6 pb-4">
        <a
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-surface-800 hover:bg-surface-700 transition-colors"
        >
          🏠 Dashboard
        </a>
      </div>
    </div>
  );
}

// ─── Branch Card ────────────────────────────────────────────
function BranchCard({
  branch,
  streaks,
  resolvedHabits,
}: {
  branch: SkillBranch;
  streaks: Record<string, number>;
  resolvedHabits: ReturnType<typeof getResolvedHabits>;
}) {
  // Group nodes by habit
  const habitGroups = new Map<string, SkillNode[]>();
  for (const node of branch.nodes) {
    const group = habitGroups.get(node.habitSlug) ?? [];
    group.push(node);
    habitGroups.set(node.habitSlug, group);
  }

  const isNewGrowth = branch.id === "new-growth";

  return (
    <section className="rounded-xl bg-surface-800 border border-surface-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{branch.icon}</span>
        <h2 className="text-sm font-bold" style={{ color: branch.color }}>
          {branch.name} Branch
        </h2>
      </div>

      {branch.nodes.length === 0 && (
        <p className="text-xs text-neutral-600 italic py-2">No habits assigned yet</p>
      )}

      <div className="space-y-4">
        {Array.from(habitGroups.entries()).map(([slug, nodes]) => {
          const currentStreak = streaks[slug] ?? 0;
          const sortedNodes = [...nodes].sort((a, b) => a.level - b.level);
          const habit = resolvedHabits.find((h) => h.slug === slug);
          const currentLevel = habit?.current_level ?? 1;

          return (
            <div key={slug}>
              {/* Habit header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{habit?.icon ?? "🔵"}</span>
                <span className="text-xs font-semibold text-neutral-300">
                  {habit?.name ?? slug}
                </span>
                <span className="text-xs text-neutral-500 ml-1">
                  Lv.{currentLevel}
                </span>
                <span className="text-xs text-neutral-600 ml-auto">
                  {getFlameIcon(currentStreak)} {currentStreak}d streak
                </span>
              </div>

              {/* Skill nodes path */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {sortedNodes.map((node, idx) => {
                  // Unlocked = level is at or below your current level
                  const isUnlocked = node.level <= currentLevel;
                  // Active = this IS your current level
                  const isActive = node.level === currentLevel;
                  // Next = the immediate next level (shows progress toward it)
                  const isNext = node.level === currentLevel + 1;

                  return (
                    <div key={node.level} className="flex items-center">
                      {idx > 0 && (
                        <div
                          className={`w-4 h-0.5 ${
                            isUnlocked ? "bg-done/60" : "bg-surface-600"
                          }`}
                          style={
                            isUnlocked ? { backgroundColor: `${branch.color}50` } : undefined
                          }
                        />
                      )}
                      <SkillNodeChip
                        node={node}
                        isUnlocked={isUnlocked}
                        isActive={isActive}
                        isNext={isNext}
                        branchColor={branch.color}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {isNewGrowth && (
        <p className="text-[10px] text-neutral-600 mt-3 italic">
          Assign these habits to a branch in Settings
        </p>
      )}
    </section>
  );
}

// ─── Skill Node ─────────────────────────────────────────────
function SkillNodeChip({
  node,
  isUnlocked,
  isActive,
  isNext,
  branchColor,
}: {
  node: SkillNode;
  isUnlocked: boolean;
  isActive: boolean;
  isNext: boolean;
  branchColor: string;
}) {
  return (
    <div
      className={`relative rounded-lg px-3 py-2 min-w-[100px] text-center transition-all ${
        isActive
          ? "border-2 shadow-lg"
          : isUnlocked
            ? "border border-done/30 bg-done/10"
            : isNext
              ? "border border-later/40 bg-later/5"
              : "border border-surface-600 bg-surface-700/50"
      }`}
      style={
        isActive
          ? { borderColor: branchColor, boxShadow: `0 0 12px ${branchColor}40` }
          : undefined
      }
    >
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
        Lv.{node.level}
      </div>
      <div
        className={`text-xs font-semibold ${
          isActive
            ? "text-white"
            : isUnlocked
              ? "text-neutral-300"
              : "text-neutral-500"
        }`}
      >
        {node.label}
      </div>
      {node.description && (isActive || isNext) && (
        <div className="text-[9px] text-neutral-400 mt-0.5 leading-tight max-w-[120px]">
          {node.description}
        </div>
      )}
      {isActive && (
        <div className="text-[9px] mt-0.5 font-bold" style={{ color: branchColor }}>
          Current
        </div>
      )}
      {isUnlocked && !isActive && (
        <div className="text-[9px] text-done mt-0.5">✓ Completed</div>
      )}
      {isNext && (
        <div className="text-[9px] text-later mt-0.5">Next level</div>
      )}
      {!isUnlocked && !isNext && (
        <div className="text-[9px] text-neutral-600 mt-0.5">🔒 Locked</div>
      )}
    </div>
  );
}
