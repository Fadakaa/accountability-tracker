"use client";

import type { AdminVelocity } from "@/lib/store";

const HEALTH_CONFIG = {
  green: { label: "Healthy", color: "text-done", bg: "bg-done/10", border: "border-done/20", icon: "🟢" },
  amber: { label: "Steady", color: "text-later", bg: "bg-later/10", border: "border-later/20", icon: "🟡" },
  red:   { label: "Growing", color: "text-missed", bg: "bg-missed/10", border: "border-missed/20", icon: "🔴" },
} as const;

export function VelocityStats({ velocity }: { velocity: AdminVelocity }) {
  const hc = HEALTH_CONFIG[velocity.health];

  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 p-3 mb-4">
      {/* 4 stats in a row */}
      <div className="grid grid-cols-4 gap-2">
        {/* Today */}
        <div className="text-center">
          <div className="text-base font-bold text-white">
            {velocity.completedToday}/{velocity.totalToday}
          </div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">
            Today
          </div>
        </div>

        {/* 7-day avg done */}
        <div className="text-center">
          <div className="text-base font-bold text-white">
            {velocity.avgCompletedPerDay}
          </div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">
            Done/day
          </div>
        </div>

        {/* Drag-over */}
        <div className="text-center">
          <div className={`text-base font-bold ${velocity.dragOverCount > 0 ? "text-later" : "text-neutral-500"}`}>
            {velocity.dragOverCount}
          </div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">
            Drag-over
          </div>
        </div>

        {/* Health */}
        <div className="text-center">
          <div className={`text-base font-bold ${hc.color}`}>
            {hc.icon}
          </div>
          <div className={`text-[10px] uppercase tracking-wider leading-tight ${hc.color}`}>
            {hc.label}
          </div>
        </div>
      </div>

      {/* Micro detail: completion vs creation rate */}
      <div className="mt-2 pt-2 border-t border-surface-700 flex justify-between text-[10px] text-neutral-600">
        <span>7d avg: {velocity.avgCompletedPerDay} done vs {velocity.avgAddedPerDay} added/day</span>
      </div>
    </div>
  );
}

export function SlippingBanner({ velocity }: { velocity: AdminVelocity }) {
  const { slippingTasks } = velocity;
  if (slippingTasks.length === 0) return null;

  const oldest = slippingTasks[0].ageDays;

  return (
    <div className="rounded-lg bg-later/10 border border-later/20 px-3 py-2 mb-4">
      <p className="text-xs text-later font-medium">
        {"⚠️ "}
        {slippingTasks.length} task{slippingTasks.length !== 1 ? "s" : ""} slipping
        {" — "}oldest is {oldest} day{oldest !== 1 ? "s" : ""}
      </p>
      <div className="mt-1.5 space-y-0.5">
        {slippingTasks.slice(0, 3).map((st) => (
          <div key={st.task.id} className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-400 truncate flex-1 mr-2">{st.task.title}</span>
            <span className={`shrink-0 font-mono ${st.ageDays > 7 ? "text-missed" : "text-later"}`}>
              {st.ageDays}d
            </span>
          </div>
        ))}
        {slippingTasks.length > 3 && (
          <p className="text-[10px] text-neutral-600">
            +{slippingTasks.length - 3} more
          </p>
        )}
      </div>
    </div>
  );
}
