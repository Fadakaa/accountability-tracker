"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { BADGES, type BadgeDef, type BadgeCategory, getBadgeCounts, evaluateNewBadges } from "@/lib/badges";
import { loadEarnedBadges, loadEarnedBadgeIds, awardBadges, type EarnedBadgeRecord } from "@/lib/store";
import { loadState } from "@/lib/store";
import BadgeCelebration from "@/components/BadgeCelebration";

const CATEGORY_TABS: { key: BadgeCategory | "all"; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "🏆" },
  { key: "consistency", label: "Streaks", icon: "🔥" },
  { key: "volume", label: "Volume", icon: "📊" },
  { key: "special", label: "Special", icon: "⭐" },
  { key: "sprint", label: "Sprint", icon: "🏃" },
  { key: "review", label: "Review", icon: "📋" },
  { key: "hidden", label: "Hidden", icon: "👻" },
];

export default function BadgesPage() {
  const [earned, setEarned] = useState<EarnedBadgeRecord[]>([]);
  const [activeTab, setActiveTab] = useState<BadgeCategory | "all">("all");
  const [newBadges, setNewBadges] = useState<BadgeDef[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeDef | null>(null);

  useEffect(() => {
    // Load earned badges
    const earnedBadges = loadEarnedBadges();
    setEarned(earnedBadges);

    // Run badge evaluation to catch any we missed
    const state = loadState();
    const earnedIds = new Set(earnedBadges.map((b) => b.badgeId));
    const freshBadges = evaluateNewBadges({ state, earnedBadgeIds: earnedIds });

    if (freshBadges.length > 0) {
      const newRecords = awardBadges(freshBadges.map((b) => b.id));
      if (newRecords.length > 0) {
        setEarned(loadEarnedBadges());
        setNewBadges(freshBadges);
      }
    }
  }, []);

  const earnedMap = useMemo(() => {
    const map = new Map<string, EarnedBadgeRecord>();
    for (const b of earned) map.set(b.badgeId, b);
    return map;
  }, [earned]);

  const earnedIds = useMemo(() => new Set(earned.map((b) => b.badgeId)), [earned]);

  const counts = useMemo(() => getBadgeCounts(earnedIds), [earnedIds]);

  const totalEarned = earned.length;
  const totalBadges = BADGES.length;

  // Filter badges by active tab
  const filteredBadges = useMemo(() => {
    if (activeTab === "all") return BADGES;
    return BADGES.filter((b) => b.category === activeTab);
  }, [activeTab]);

  // Sort: earned first, then locked
  const sortedBadges = useMemo(() => {
    return [...filteredBadges].sort((a, b) => {
      const aEarned = earnedIds.has(a.id) ? 0 : 1;
      const bEarned = earnedIds.has(b.id) ? 0 : 1;
      return aEarned - bEarned;
    });
  }, [filteredBadges, earnedIds]);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0f] px-4 py-6 pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="mb-6">
        <Link href="/" className="text-neutral-500 text-sm hover:text-neutral-300 transition-colors">
          ← Dashboard
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-xl font-black text-white tracking-tight">
            🏆 Collection Wall
          </h1>
          <div className="flex items-center gap-1.5 bg-[#12121a] px-3 py-1.5 rounded-full">
            <span className="text-amber-400 font-bold text-sm">{totalEarned}</span>
            <span className="text-neutral-500 text-sm">/ {totalBadges}</span>
          </div>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tab.key === "all"
            ? totalEarned
            : counts[tab.key as BadgeCategory]?.earned ?? 0;
          const total = tab.key === "all"
            ? totalBadges
            : counts[tab.key as BadgeCategory]?.total ?? 0;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
                  : "bg-[#12121a] text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`ml-0.5 ${isActive ? "text-amber-400/70" : "text-neutral-600"}`}>
                {count}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Badge Grid */}
      <div className="grid grid-cols-3 gap-3">
        {sortedBadges.map((badge) => {
          const isEarned = earnedIds.has(badge.id);
          const record = earnedMap.get(badge.id);

          return (
            <button
              key={badge.id}
              onClick={() => setSelectedBadge(badge)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all active:scale-[0.97] ${
                isEarned
                  ? "bg-[#12121a] ring-1 ring-amber-500/20"
                  : "bg-[#0e0e14] opacity-50"
              }`}
            >
              {/* Icon */}
              <div className={`text-3xl ${isEarned ? "" : "grayscale opacity-40"}`}>
                {badge.isHidden && !isEarned ? "❓" : badge.icon}
              </div>

              {/* Name or hint */}
              <div className="text-center">
                <div className={`text-[11px] font-bold leading-tight ${
                  isEarned ? "text-white" : "text-neutral-600"
                }`}>
                  {badge.isHidden && !isEarned ? "???" : badge.name}
                </div>
                {isEarned && record && (
                  <div className="text-[9px] text-amber-400/60 mt-0.5">
                    {formatEarnedDate(record.earnedAt)}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {sortedBadges.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-neutral-600 text-sm">No badges in this category yet</p>
        </div>
      )}

      {/* Badge Detail Modal */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="bg-[#12121a] rounded-2xl p-6 max-w-[320px] w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className={`text-6xl mb-4 ${earnedIds.has(selectedBadge.id) ? "" : "grayscale opacity-40"}`}>
              {selectedBadge.isHidden && !earnedIds.has(selectedBadge.id) ? "❓" : selectedBadge.icon}
            </div>

            {/* Name */}
            <h3 className="text-lg font-black text-white mb-1">
              {selectedBadge.isHidden && !earnedIds.has(selectedBadge.id) ? "Hidden Badge" : selectedBadge.name}
            </h3>

            {/* Category */}
            <div className="text-[10px] uppercase tracking-[0.15em] text-amber-400/60 font-bold mb-3">
              {selectedBadge.category}
            </div>

            {/* Description or hint */}
            <p className="text-sm text-neutral-400 leading-relaxed mb-4">
              {earnedIds.has(selectedBadge.id)
                ? selectedBadge.description
                : selectedBadge.isHidden
                  ? "Keep going — this badge is waiting to surprise you."
                  : selectedBadge.hint}
            </p>

            {/* Earned date */}
            {earnedMap.has(selectedBadge.id) && (
              <div className="text-xs text-amber-400/80 mb-4">
                Earned {formatEarnedDateFull(earnedMap.get(selectedBadge.id)!.earnedAt)}
              </div>
            )}

            {/* Status */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              earnedIds.has(selectedBadge.id)
                ? "bg-green-500/20 text-green-400"
                : "bg-neutral-800 text-neutral-500"
            }`}>
              {earnedIds.has(selectedBadge.id) ? "✅ Earned" : "🔒 Locked"}
            </div>

            {/* Close button */}
            <button
              onClick={() => setSelectedBadge(null)}
              className="block w-full mt-4 py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Badge celebration overlay */}
      {newBadges.length > 0 && (
        <BadgeCelebration
          badges={newBadges}
          onDone={() => setNewBadges([])}
        />
      )}
    </div>
  );
}

function formatEarnedDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  return `${day} ${month}`;
}

function formatEarnedDateFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
