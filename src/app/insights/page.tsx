"use client";

import { useState, useEffect, useMemo } from "react";
import { loadState, loadGymSessions, getLevelForXP } from "@/lib/store";
import type { LocalState, GymSessionLocal } from "@/lib/store";
import { getHabitsWithHistory } from "@/lib/resolvedHabits";
import {
  getCompletionByDay,
  getWeeklyGameData,
  getBadHabitTrends,
  getXpCurve,
  getDayOfWeekAnalysis,
  getStreakTimeline,
  getTrainingBreakdown,
  rollingAverage,
  getSingleHabitByDay,
  getSingleHabitDayOfWeek,
  getSingleHabitStats,
} from "@/lib/analytics";
import type { Habit } from "@/types/database";

import HeatMap from "@/components/charts/HeatMap";
import LineChart from "@/components/charts/LineChart";
import BarChart from "@/components/charts/BarChart";
import DonutChart from "@/components/charts/DonutChart";
import WeeklyTable from "@/components/charts/WeeklyTable";

// ─── Time Range Filter ──────────────────────────────────────
type TimeRange = "7d" | "30d" | "90d" | "year";

function daysForRange(range: TimeRange): number {
  switch (range) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "year": return 365;
  }
}

// ─── Component ──────────────────────────────────────────────
export default function InsightsPage() {
  const [state, setState] = useState<LocalState | null>(null);
  const [gymSessions, setGymSessions] = useState<GymSessionLocal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [range, setRange] = useState<TimeRange>("30d");
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number } | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  useEffect(() => {
    setState(loadState());
    setGymSessions(loadGymSessions());
    setHabits(getHabitsWithHistory());
  }, []);

  const days = daysForRange(range);

  // Memoize computations
  const completionData = useMemo(
    () => (state ? getCompletionByDay(state.logs, habits, days) : []),
    [state, habits, days]
  );

  const rollingAvg = useMemo(
    () => rollingAverage(completionData),
    [completionData]
  );

  const weeklyData = useMemo(
    () => (state ? getWeeklyGameData(state.logs, habits) : []),
    [state, habits]
  );

  const badHabitTrends = useMemo(
    () => (state ? getBadHabitTrends(state.logs, habits, Math.ceil(days / 7)) : []),
    [state, habits, days]
  );

  const xpCurve = useMemo(
    () => (state ? getXpCurve(state.logs) : []),
    [state]
  );

  const dayOfWeek = useMemo(
    () => (state ? getDayOfWeekAnalysis(state.logs, habits) : []),
    [state, habits]
  );

  const streakTimeline = useMemo(
    () => (state ? getStreakTimeline(state.logs, habits) : []),
    [state, habits]
  );

  const trainingBreakdown = useMemo(
    () => getTrainingBreakdown(gymSessions),
    [gymSessions]
  );

  // Single-habit deep dive data
  const selectedHabit = useMemo(
    () => habits.find((h) => h.id === selectedHabitId) ?? null,
    [habits, selectedHabitId]
  );

  const singleHabitData = useMemo(
    () => (state && selectedHabitId ? getSingleHabitByDay(state.logs, selectedHabitId, days) : []),
    [state, selectedHabitId, days]
  );

  const singleHabitDOW = useMemo(
    () => (state && selectedHabitId ? getSingleHabitDayOfWeek(state.logs, selectedHabitId) : []),
    [state, selectedHabitId]
  );

  const singleHabitStats = useMemo(
    () => (state && selectedHabitId && selectedHabit ? getSingleHabitStats(state.logs, selectedHabitId, selectedHabit) : null),
    [state, selectedHabitId, selectedHabit]
  );

  const singleHabitRolling = useMemo(
    () => rollingAverage(singleHabitData.map((d) => ({ date: d.date, rate: d.done ? 1 : 0 }))),
    [singleHabitData]
  );

  // Filterable habit lists
  const activeHabits = useMemo(
    () => habits.filter((h) => h.is_active),
    [habits]
  );

  if (!state) return null;

  const levelInfo = getLevelForXP(state.totalXp);

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-4">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">🔍 Deep Dive Insights</h1>
      </header>

      {/* Time Range Tabs */}
      <div className="flex gap-1.5 mb-6">
        {(["7d", "30d", "90d", "year"] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              range === r
                ? "bg-brand text-white"
                : "bg-surface-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Habit Filter */}
      <HabitFilter
        habits={activeHabits}
        selectedId={selectedHabitId}
        onSelect={(id) => setSelectedHabitId(id === selectedHabitId ? null : id)}
      />

      {/* ─── Habit Deep Dive (when a habit is selected) ─── */}
      {selectedHabit && singleHabitStats && (
        <Section title={`${selectedHabit.icon} ${selectedHabit.name} — Deep Dive`} icon="">
          {/* Stats row */}
          <div className="flex justify-around mb-4 text-center">
            <MiniStat label="Done" value={`${singleHabitStats.doneCount}`} />
            <MiniStat label="Rate" value={`${Math.round(singleHabitStats.completionRate * 100)}%`} />
            <MiniStat label="Streak" value={`${singleHabitStats.currentStreak}d`} />
            <MiniStat label="Best" value={`${singleHabitStats.longestStreak}d`} />
            {singleHabitStats.avgValue != null && (
              <MiniStat label="Avg Value" value={`${singleHabitStats.avgValue.toFixed(1)}`} />
            )}
          </div>

          {/* Per-habit heat map */}
          <div className="mb-4">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
              Activity
            </h3>
            <HeatMap
              data={singleHabitData.map((d) => ({ date: d.date, count: d.done ? 1 : 0, total: 1 }))}
              weeks={range === "7d" ? 4 : range === "30d" ? 13 : range === "90d" ? 26 : 52}
            />
          </div>

          {/* Per-habit consistency line */}
          <div className="mb-4">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
              7-Day Rolling Completion
            </h3>
            <LineChart
              series={[{
                label: "Completion",
                color: "#22c55e",
                data: singleHabitRolling.map((d, i) => ({ x: i, y: d.avg * 100 })),
              }]}
              xLabels={singleHabitRolling.map((d) => d.date.slice(5))}
              yMax={100}
              height={140}
              yFormat={(v) => `${Math.round(v)}%`}
            />
          </div>

          {/* Per-habit day-of-week */}
          <div className="mb-4">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
              Best Days
            </h3>
            <BarChart
              bars={singleHabitDOW.map((d) => ({
                label: d.label,
                value: d.avgRate,
                color: d.avgRate >= 0.75 ? "#22c55e" : d.avgRate >= 0.5 ? "#f97316" : d.avgRate > 0 ? "#ef4444" : "#1a1a2e",
              }))}
              maxValue={1}
              height={120}
              valueFormat={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

          {/* Measured value history (if applicable) */}
          {selectedHabit.category === "measured" && singleHabitData.some((d) => d.value != null) && (
            <div>
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                Value History ({selectedHabit.unit})
              </h3>
              <LineChart
                series={[{
                  label: selectedHabit.unit ?? "Value",
                  color: "#3b82f6",
                  data: singleHabitData
                    .filter((d) => d.value != null)
                    .map((d, i) => ({ x: i, y: d.value! })),
                }]}
                xLabels={singleHabitData.filter((d) => d.value != null).map((d) => d.date.slice(5))}
                height={140}
                yFormat={(v) => `${Math.round(v)}`}
              />
            </div>
          )}
        </Section>
      )}

      {/* ─── Section 1: Activity Heat Map ─── */}
      <Section title="Activity Heat Map" icon="🟩">
        <HeatMap
          data={completionData.map((d) => ({ date: d.date, count: d.count, total: d.total }))}
          weeks={range === "7d" ? 4 : range === "30d" ? 13 : range === "90d" ? 26 : 52}
          onDayClick={(date, count) => setSelectedDay({ date, count })}
        />
        {selectedDay && (
          <div className="mt-2 text-xs text-neutral-400 text-center">
            {selectedDay.date}: <span className="text-white font-bold">{selectedDay.count}</span> habits done
          </div>
        )}
      </Section>

      {/* ─── Section 2: Consistency Trends ─── */}
      <Section title="Consistency Trends" icon="📈">
        <LineChart
          series={[
            {
              label: "Daily",
              color: "#3b82f6",
              data: completionData.map((d, i) => ({ x: i, y: d.rate * 100 })),
            },
            {
              label: "7d Avg",
              color: "#f97316",
              dashed: true,
              data: rollingAvg.map((d, i) => ({ x: i, y: d.avg * 100 })),
            },
          ]}
          xLabels={completionData.map((d) => d.date.slice(5))}
          yMax={100}
          yFormat={(v) => `${Math.round(v)}%`}
        />
        {completionData.length > 0 && (
          <div className="flex justify-around mt-3 text-center">
            <MiniStat
              label="Avg Rate"
              value={`${Math.round((completionData.reduce((s, d) => s + d.rate, 0) / completionData.length) * 100)}%`}
            />
            <MiniStat
              label="Best Day"
              value={`${Math.round(Math.max(...completionData.map((d) => d.rate)) * 100)}%`}
            />
            <MiniStat
              label="Perfect Days"
              value={`${completionData.filter((d) => d.rate === 1).length}`}
            />
          </div>
        )}
      </Section>

      {/* ─── Section 3: Weekly Numbers ─── */}
      <Section title="Weekly Numbers" icon="📊">
        <WeeklyTable rows={weeklyData} />
      </Section>

      {/* ─── Section 4: Streak Timeline ─── */}
      <Section title="Top Streaks" icon="🔥">
        {streakTimeline.slice(0, 6).length > 0 ? (
          <div className="space-y-3">
            {streakTimeline.slice(0, 6).map((ht) => (
              <div key={ht.habitId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-xs">
                    <span>{ht.habitIcon}</span>
                    <span className="text-neutral-300">{ht.habitName}</span>
                  </span>
                  <span className="text-xs font-bold text-brand">
                    {ht.currentStreak > 0 ? `${ht.currentStreak}d active` : "inactive"}
                  </span>
                </div>
                <div className="flex gap-0.5 h-3">
                  {ht.periods.slice(-10).map((p, i) => (
                    <div
                      key={i}
                      className="rounded-sm bg-done/60"
                      style={{ flex: p.length, minWidth: 4 }}
                      title={`${p.start} → ${p.end} (${p.length}d)`}
                    />
                  ))}
                  {ht.periods.length === 0 && (
                    <div className="flex-1 rounded-sm bg-surface-700 h-3" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="Start logging to see streak data" />
        )}
      </Section>

      {/* ─── Section 5: Bad Habit Trends ─── */}
      <Section title="Bad Habit Trends" icon="📉">
        {badHabitTrends.length > 0 ? (
          <>
            {/* Group by habit */}
            {Array.from(new Set(badHabitTrends.map((b) => b.habit))).map((habitName) => {
              const habitData = badHabitTrends.filter((b) => b.habit === habitName);
              const hasMinutes = habitData.some((d) => d.minutes > 0);
              return (
                <div key={habitName} className="mb-4">
                  <h3 className="text-xs font-semibold text-neutral-400 mb-2">{habitName}</h3>
                  <LineChart
                    series={[
                      {
                        label: hasMinutes ? "Minutes" : "Days",
                        color: "#ef4444",
                        data: habitData.map((d, i) => ({
                          x: i,
                          y: hasMinutes ? d.minutes : d.count,
                        })),
                      },
                    ]}
                    xLabels={habitData.map((d) => d.weekStart.slice(5))}
                    height={120}
                    yFormat={(v) => hasMinutes ? `${Math.round(v)}m` : `${Math.round(v)}`}
                  />
                </div>
              );
            })}
          </>
        ) : (
          <EmptyState text="No bad habit data yet" />
        )}
      </Section>

      {/* ─── Section 6: XP Growth ─── */}
      <Section title="XP Growth Curve" icon="⚡">
        {xpCurve.length > 0 ? (
          <>
            <LineChart
              series={[{
                label: "Cumulative XP",
                color: "#f97316",
                data: xpCurve.map((d, i) => ({ x: i, y: d.cumXp })),
              }]}
              xLabels={xpCurve.map((d) => d.date.slice(5))}
              height={160}
              yFormat={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
            <div className="flex justify-around mt-3 text-center">
              <MiniStat label="Total XP" value={state.totalXp.toLocaleString()} />
              <MiniStat label="Level" value={`${levelInfo.level}`} />
              <MiniStat label="Title" value={levelInfo.title} />
            </div>
          </>
        ) : (
          <EmptyState text="Start logging to track XP" />
        )}
      </Section>

      {/* ─── Section 7: Training Breakdown ─── */}
      <Section title="Training Breakdown" icon="🏋️">
        {trainingBreakdown.length > 0 ? (
          <div className="flex items-start gap-6">
            <DonutChart
              segments={trainingBreakdown.map((t) => ({
                label: t.label,
                value: t.count,
                color: t.type === "gym" ? "#f97316" : t.type === "bjj" ? "#8b5cf6" : "#3b82f6",
              }))}
              size={140}
              centerValue={`${trainingBreakdown.reduce((s, t) => s + t.count, 0)}`}
              centerLabel="Sessions"
            />
          </div>
        ) : (
          <EmptyState text="No gym sessions logged yet" />
        )}
      </Section>

      {/* ─── Section 8: Day-of-Week Analysis ─── */}
      <Section title="Day-of-Week Analysis" icon="📅">
        {dayOfWeek.some((d) => d.avgRate > 0) ? (
          <>
            <BarChart
              bars={dayOfWeek.map((d) => ({
                label: d.label,
                value: d.avgRate,
                color: d.avgRate >= 0.75 ? "#22c55e" : d.avgRate >= 0.5 ? "#f97316" : "#ef4444",
              }))}
              maxValue={1}
              valueFormat={(v) => `${Math.round(v * 100)}%`}
            />
            {(() => {
              const best = dayOfWeek.reduce((a, b) => (a.avgRate > b.avgRate ? a : b));
              const worst = dayOfWeek.reduce((a, b) => (a.avgRate < b.avgRate && b.avgRate > 0 ? a : b));
              return (
                <div className="flex justify-around mt-3 text-center">
                  <MiniStat label="Best Day" value={best.label} />
                  <MiniStat label="Needs Work" value={worst.label} />
                </div>
              );
            })()}
          </>
        ) : (
          <EmptyState text="Log more days to see patterns" />
        )}
      </Section>

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

// ─── Shared UI ──────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
      <h2 className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
        <span>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[10px] text-neutral-500 uppercase">{label}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center text-neutral-600 text-sm py-6">
      {text}
    </div>
  );
}

// ─── Habit Filter ───────────────────────────────────────────

function HabitFilter({
  habits,
  selectedId,
  onSelect,
}: {
  habits: Habit[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Group by category for display
  const binary = habits.filter((h) => h.category === "binary");
  const measured = habits.filter((h) => h.category === "measured");
  const bad = habits.filter((h) => h.category === "bad");

  const selectedHabit = habits.find((h) => h.id === selectedId);

  return (
    <section className="mb-4">
      {/* Selected / toggle row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors ${
          selectedId
            ? "bg-brand/10 border border-brand/30"
            : "bg-surface-800 border border-surface-700"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-neutral-500 uppercase">Filter by Habit</span>
          {selectedHabit && (
            <span className="flex items-center gap-1 text-brand font-semibold">
              <span>{selectedHabit.icon}</span>
              <span>{selectedHabit.name}</span>
            </span>
          )}
        </div>
        <span className="text-neutral-600 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded habit picker */}
      {expanded && (
        <div className="mt-2 rounded-xl bg-surface-800 border border-surface-700 p-3 space-y-3">
          {/* Clear filter */}
          {selectedId && (
            <button
              onClick={() => { onSelect(selectedId); setExpanded(false); }}
              className="w-full rounded-lg bg-surface-700 py-2 text-xs text-neutral-400 hover:text-neutral-200 font-medium transition-colors mb-1"
            >
              ✕ Clear Filter — Show All
            </button>
          )}

          {/* Binary habits */}
          {binary.length > 0 && (
            <div>
              <h4 className="text-[9px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">Habits</h4>
              <div className="flex flex-wrap gap-1.5">
                {binary.map((h) => (
                  <HabitFilterChip
                    key={h.id}
                    habit={h}
                    isSelected={h.id === selectedId}
                    onSelect={() => { onSelect(h.id); setExpanded(false); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Measured habits */}
          {measured.length > 0 && (
            <div>
              <h4 className="text-[9px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">Measured</h4>
              <div className="flex flex-wrap gap-1.5">
                {measured.map((h) => (
                  <HabitFilterChip
                    key={h.id}
                    habit={h}
                    isSelected={h.id === selectedId}
                    onSelect={() => { onSelect(h.id); setExpanded(false); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bad habits */}
          {bad.length > 0 && (
            <div>
              <h4 className="text-[9px] font-bold text-red-400/60 uppercase tracking-wider mb-1.5">Bad Habits</h4>
              <div className="flex flex-wrap gap-1.5">
                {bad.map((h) => (
                  <HabitFilterChip
                    key={h.id}
                    habit={h}
                    isSelected={h.id === selectedId}
                    onSelect={() => { onSelect(h.id); setExpanded(false); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HabitFilterChip({
  habit,
  isSelected,
  onSelect,
}: {
  habit: Habit;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95 ${
        isSelected
          ? "bg-brand text-white ring-1 ring-brand"
          : "bg-surface-700 text-neutral-400 hover:text-neutral-200 hover:bg-surface-600"
      }`}
    >
      <span>{habit.icon}</span>
      <span>{habit.name}</span>
    </button>
  );
}
