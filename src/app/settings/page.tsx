"use client";

import { useState, useEffect } from "react";
import { loadSettings as loadSettingsLocal, loadState as loadStateLocal, DEFAULT_NOTIFICATION_SLOTS, recalculateStreaks } from "@/lib/store";
import type { UserSettings, HabitOverride, LocalState, NotificationSlot } from "@/lib/store";
import { HABITS, DEFAULT_QUOTES } from "@/lib/habits";
import type { QuoteCategory } from "@/lib/habits";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import { getHabitLevel } from "@/lib/habits";
import type { Habit, HabitStack, HabitCategory } from "@/types/database";
import { isBinaryLike } from "@/types/database";
import { syncScheduleToServiceWorker } from "@/lib/notifications";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { createHabit, updateCustomHabit, deleteCustomHabit, isDefaultHabit, type CreateHabitInput } from "@/lib/habitCrud";
import { useDB } from "@/hooks/useDB";
import { saveSettingsToDB, saveStateToDB, loadStateFromDB, loadSettingsFromDB, loadHabitsFromDB } from "@/lib/db";
import { migrateLocalStorageToSupabase, isMigrated } from "@/lib/sync/migration";

const STACKS: { key: HabitStack; label: string; icon: string }[] = [
  { key: "morning", label: "AM", icon: "🌅" },
  { key: "midday", label: "Mid", icon: "☀️" },
  { key: "evening", label: "PM", icon: "🌙" },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { state, settings, dbHabits, loading, saveState: dbSaveState, saveSettings: dbSaveSettings } = useDB();
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);

  // Sync from useDB once loaded
  useEffect(() => {
    if (!loading) {
      setLocalSettings(settings);
      setHabits(getResolvedHabits(false, dbHabits, settings));
    }
  }, [loading, settings, dbHabits]);

  if (loading || !localSettings) return null;

  // Group habits by stack
  const byStack: Record<HabitStack, Habit[]> = {
    morning: [],
    midday: [],
    evening: [],
  };
  for (const h of habits) {
    if (h.is_active) byStack[h.stack].push(h);
  }
  const inactiveHabits = habits.filter((h) => !h.is_active);

  // Persist changes immediately
  function updateHabit(habitId: string, overrideUpdate: Partial<HabitOverride>) {
    if (!localSettings) return;
    const newSettings = {
      ...localSettings,
      habitOverrides: {
        ...localSettings.habitOverrides,
        [habitId]: {
          ...localSettings.habitOverrides[habitId],
          ...overrideUpdate,
        },
      },
    };
    setLocalSettings(newSettings);
    dbSaveSettings(newSettings);
    // Refresh habits
    setHabits(getResolvedHabits(false, dbHabits, newSettings));
  }

  function moveHabit(habit: Habit, direction: "up" | "down") {
    const stackHabits = habits
      .filter((h) => h.stack === habit.stack && h.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = stackHabits.findIndex((h) => h.id === habit.id);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === stackHabits.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const swapHabit = stackHabits[swapIdx];

    // Swap sort orders
    updateHabit(habit.id, { sort_order: swapHabit.sort_order });
    updateHabit(swapHabit.id, { sort_order: habit.sort_order });
  }

  function resetToDefaults() {
    const newSettings: UserSettings = {
      habitOverrides: {},
      levelUpStates: localSettings?.levelUpStates ?? {},
      checkinTimes: { morning: "07:00", midday: "13:00", evening: "21:00" },
      notificationSlots: DEFAULT_NOTIFICATION_SLOTS,
      customQuotes: [],
      hiddenQuoteIds: [],
      routineChains: { morning: [], midday: [], evening: [] },
      customHabits: localSettings?.customHabits ?? [], // Preserve custom habits on settings reset
    };
    setLocalSettings(newSettings);
    dbSaveSettings(newSettings);
    setHabits(getResolvedHabits(false, dbHabits, newSettings));
  }

  function refreshHabits() {
    // Custom habit CRUD functions write directly to localStorage,
    // so re-read settings from localStorage to pick up changes
    const freshSettings = loadSettingsLocal();
    setLocalSettings(freshSettings);
    dbSaveSettings(freshSettings);
    setHabits(getResolvedHabits(false, dbHabits, freshSettings));
  }

  return (
    <div className="flex flex-col min-h-screen px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300">
          ← Dashboard
        </a>
        <h1 className="text-xl font-bold mt-1">⚙️ Settings</h1>
      </header>

      {/* Account */}
      <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
          Account
        </h2>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-300 truncate">
              {user?.email ?? "Not signed in"}
            </p>
            <p className="text-[10px] text-neutral-600 mt-0.5">
              Signed in via email
            </p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              window.location.href = "/login";
            }}
            className="ml-4 rounded-lg bg-surface-700 hover:bg-surface-600 px-4 py-2 text-xs
                       text-neutral-400 hover:text-white transition-colors flex-shrink-0"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Data Sync */}
      <DataSyncSection />

      {/* Notifications & Schedule (unified) */}
      <NotificationSection />

      {/* Habit Management */}
      <section className="mb-6">
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
          Habits by Stack
        </h2>
        <p className="text-xs text-neutral-600 mb-4">
          Move habits between stacks, toggle bare minimum status, or archive
        </p>

        {/* Create Habit Button */}
        <CreateHabitForm onCreated={refreshHabits} />

        {STACKS.map((stack) => (
          <div key={stack.key} className="mb-6">
            <h3 className="text-xs font-bold text-brand uppercase tracking-wider mb-2 flex items-center gap-1">
              {stack.icon} {stack.key}
            </h3>
            <div className="space-y-2">
              {byStack[stack.key]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((habit, idx) => (
                  <HabitSettingsRow
                    key={habit.id}
                    habit={habit}
                    isFirst={idx === 0}
                    isLast={idx === byStack[stack.key].length - 1}
                    onStackChange={(newStack) => {
                      const targetHabits = habits.filter((h) => h.stack === newStack && h.is_active);
                      const maxOrder = targetHabits.reduce((max, h) => Math.max(max, h.sort_order), 0);
                      updateHabit(habit.id, { stack: newStack, sort_order: maxOrder + 1 });
                    }}
                    onBareMinToggle={() => {
                      updateHabit(habit.id, { is_bare_minimum: !habit.is_bare_minimum });
                    }}
                    onArchive={() => {
                      updateHabit(habit.id, { is_active: false });
                    }}
                    onMoveUp={() => moveHabit(habit, "up")}
                    onMoveDown={() => moveHabit(habit, "down")}
                    onEditCustom={(updates) => {
                      updateCustomHabit(habit.id, updates);
                      refreshHabits();
                    }}
                  />
                ))}
              {byStack[stack.key].length === 0 && (
                <p className="text-xs text-neutral-600 italic py-2">
                  No habits in this stack
                </p>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Archived Habits */}
      {inactiveHabits.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
            Archived Habits
          </h2>
          <div className="space-y-2">
            {inactiveHabits.map((habit) => (
              <div
                key={habit.id}
                className="flex items-center justify-between rounded-xl bg-surface-800/50 border border-surface-700/50 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm text-neutral-500">
                  <span>{habit.icon}</span>
                  <span>{habit.name}</span>
                  {isDefaultHabit(habit.id) && (
                    <span className="text-[9px] bg-surface-700 text-neutral-600 px-1.5 py-0.5 rounded-full uppercase font-bold">
                      Default
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { updateHabit(habit.id, { is_active: true }); }}
                    className="text-xs text-brand hover:text-brand-dark font-medium transition-colors"
                  >
                    Restore
                  </button>
                  {!isDefaultHabit(habit.id) && (
                    <DeleteHabitButton
                      habitId={habit.id}
                      habitName={habit.name}
                      onDeleted={refreshHabits}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quotes Management */}
      <QuotesSection settings={localSettings} onUpdate={(newSettings) => { setLocalSettings(newSettings); dbSaveSettings(newSettings); }} />

      {/* Reset */}
      <section className="mb-6 space-y-2">
        <button
          onClick={resetToDefaults}
          className="w-full rounded-xl border border-surface-700 py-3 text-sm text-neutral-500 hover:text-neutral-300 hover:border-neutral-600 transition-colors"
        >
          Reset All Settings to Default
        </button>
        <ResetDataButton />
      </section>

      {/* Back */}
      <div className="mt-auto pt-4 pb-4">
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

// ─── Data Sync Section ──────────────────────────────────────
function DataSyncSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"idle" | "uploading" | "downloading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [migrated, setMigrated] = useState(false);

  // Check migration status on mount (must be in useEffect to avoid SSR issues)
  useEffect(() => {
    setMigrated(isMigrated());
  }, [status]);

  async function handleUpload() {
    if (!user) { setMessage("Sign in first"); return; }

    // Check if there's actually data to upload
    const localRaw = typeof window !== "undefined" ? localStorage.getItem("accountability-tracker") : null;
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw);
        if (!parsed.logs || parsed.logs.length === 0) {
          setStatus("error");
          setMessage("No check-in data on this device to upload. Use Download to pull from cloud instead.");
          return;
        }
      } catch { /* proceed anyway */ }
    } else {
      setStatus("error");
      setMessage("No data found on this device. Use Download to pull from cloud instead.");
      return;
    }

    setStatus("uploading");
    setMessage("");
    try {
      // Clear migration flag so it re-runs
      if (typeof window !== "undefined") {
        localStorage.removeItem("accountability-migrated");
      }
      await migrateLocalStorageToSupabase(user.id);
      setStatus("success");
      setMigrated(true);
      setMessage("This device's data has been uploaded to the cloud!");
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err: unknown) {
      console.error("[sync] Upload failed:", err);
      setStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Upload failed: ${msg}`);
    }
  }

  async function handleDownload() {
    if (!user) { setMessage("Sign in first"); return; }
    setStatus("downloading");
    setMessage("");
    try {
      // Pull fresh state from Supabase and overwrite localStorage
      const [cloudState, cloudSettings] = await Promise.all([
        loadStateFromDB(),
        loadSettingsFromDB(),
      ]);

      // Write to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("accountability-tracker", JSON.stringify(cloudState));
        localStorage.setItem("accountability-settings", JSON.stringify(cloudSettings));
        // Mark as migrated so it doesn't try to re-upload
        localStorage.setItem("accountability-migrated", "true");
      }

      setStatus("success");
      setMigrated(true);
      setMessage("Cloud data downloaded — reloading...");
      // Reload the page to pick up the new data everywhere
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error("[sync] Download failed:", err);
      setStatus("error");
      setMessage("Download failed — check console for details");
    }
  }

  return (
    <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
      <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
        Data Sync
      </h2>

      {/* Status */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${
          !user ? "bg-neutral-600" :
          migrated ? "bg-done" : "bg-later"
        }`} />
        <span className="text-xs text-neutral-400">
          {!user
            ? "Not signed in — data is local only"
            : migrated
              ? "Synced to cloud"
              : "Not yet synced — tap Upload to sync this device"
          }
        </span>
      </div>

      {/* Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleUpload}
          disabled={status === "uploading" || status === "downloading" || !user}
          className={`w-full rounded-lg py-3 text-sm font-medium transition-all active:scale-[0.98] ${
            status === "uploading"
              ? "bg-surface-700 text-neutral-500"
              : "bg-brand hover:bg-brand-dark text-white font-bold disabled:opacity-40"
          }`}
        >
          {status === "uploading" ? "Uploading..." : "Upload This Device's Data"}
        </button>
        <p className="text-[10px] text-neutral-600 text-center">
          Sends all data from this browser to the cloud (overwrites cloud data)
        </p>

        <button
          onClick={handleDownload}
          disabled={status === "uploading" || status === "downloading" || !user}
          className={`w-full rounded-lg py-3 text-sm font-medium transition-all active:scale-[0.98] ${
            status === "downloading"
              ? "bg-surface-700 text-neutral-500"
              : "bg-surface-700 hover:bg-surface-600 text-neutral-300 font-bold disabled:opacity-40"
          }`}
        >
          {status === "downloading" ? "Downloading..." : "Download From Cloud"}
        </button>
        <p className="text-[10px] text-neutral-600 text-center">
          Pulls the latest data from the cloud to this browser (overwrites local data)
        </p>
      </div>

      {/* Status message */}
      {message && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs text-center ${
          status === "success" ? "bg-done/10 text-done" :
          status === "error" ? "bg-missed/10 text-missed" :
          "bg-surface-700 text-neutral-400"
        }`}>
          {message}
        </div>
      )}

      {/* Data Diagnostic */}
      <LocalDataDiagnostic />
    </section>
  );
}

/** Shows what data still exists in this browser's localStorage */
function LocalDataDiagnostic() {
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!show || typeof window === "undefined") return;
    const keys = [
      "accountability-tracker",
      "accountability-settings",
      "accountability-admin",
      "accountability-gym",
      "accountability-gym-routines",
      "accountability-showing-up",
      "accountability-migrated",
      "accountability-habit-id-map",
    ];
    const result: Record<string, string> = {};
    for (const key of keys) {
      const val = localStorage.getItem(key);
      if (!val) {
        result[key] = "EMPTY";
      } else {
        try {
          const parsed = JSON.parse(val);
          if (key === "accountability-tracker") {
            const logs = parsed.logs?.length ?? 0;
            const xp = parsed.totalXp ?? 0;
            const level = parsed.currentLevel ?? 0;
            const streakCount = Object.keys(parsed.streaks ?? {}).length;
            result[key] = `${logs} logs, ${xp} XP, Lv${level}, ${streakCount} streaks`;
          } else if (key === "accountability-admin") {
            const count = Array.isArray(parsed) ? parsed.length : 0;
            result[key] = `${count} tasks`;
          } else if (key === "accountability-gym") {
            const count = Array.isArray(parsed) ? parsed.length : 0;
            result[key] = `${count} sessions`;
          } else if (key === "accountability-gym-routines") {
            const count = Array.isArray(parsed) ? parsed.length : 0;
            result[key] = `${count} routines`;
          } else if (key === "accountability-showing-up") {
            result[key] = `${parsed.totalOpens ?? 0} opens, ${parsed.uniqueDays ?? 0} days`;
          } else if (key === "accountability-settings") {
            const customs = parsed.customHabits?.length ?? 0;
            const overrides = Object.keys(parsed.habitOverrides ?? {}).length;
            result[key] = `${customs} custom habits, ${overrides} overrides`;
          } else {
            result[key] = val.length > 50 ? val.slice(0, 50) + "..." : val;
          }
        } catch {
          result[key] = val.length > 50 ? val.slice(0, 50) + "..." : val;
        }
      }
    }
    setInfo(result);
  }, [show]);

  return (
    <div className="mt-4 border-t border-surface-700 pt-3">
      <button
        onClick={() => setShow(!show)}
        className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
      >
        {show ? "Hide" : "Show"} local data diagnostic
      </button>
      {show && (
        <div className="mt-2 space-y-1">
          {Object.entries(info).map(([key, val]) => (
            <div key={key} className="flex justify-between text-[10px]">
              <span className="text-neutral-600 truncate mr-2">{key.replace("accountability-", "")}</span>
              <span className={val === "EMPTY" ? "text-missed" : "text-done"}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Habit Form ──────────────────────────────────────
function CreateHabitForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [category, setCategory] = useState<HabitCategory>("binary");
  const [stack, setStack] = useState<HabitStack>("morning");
  const [unit, setUnit] = useState<string | null>(null);
  const [bareMin, setBareMin] = useState(false);

  function handleSubmit() {
    if (!name.trim()) return;
    createHabit({
      name: name.trim(),
      icon: icon || "✨",
      category,
      stack,
      is_bare_minimum: isBinaryLike(category) ? bareMin : false,
      unit: category === "measured" ? (unit || "count") : null,
    });
    // Reset form
    setName("");
    setIcon("");
    setCategory("binary");
    setStack("morning");
    setUnit(null);
    setBareMin(false);
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-brand/30 py-3 text-sm text-brand hover:bg-brand/5 hover:border-brand/50 transition-colors mb-6"
      >
        ➕ Create Custom Habit
      </button>
    );
  }

  const TYPES: { key: HabitCategory; label: string; emoji: string }[] = [
    { key: "binary", label: "Binary", emoji: "✅" },
    { key: "measured", label: "Measured", emoji: "📊" },
    { key: "bad", label: "Bad Habit", emoji: "💀" },
    { key: "manual-skill", label: "Skill", emoji: "🌳" },
  ];

  const UNITS = [
    { value: "count", label: "Count" },
    { value: "minutes", label: "Minutes" },
    { value: "1-5", label: "1–5 Scale" },
    { value: "1-10", label: "1–10 Scale" },
  ];

  return (
    <div className="rounded-xl bg-surface-800 border border-brand/30 p-4 mb-6 space-y-4">
      <h3 className="text-xs font-bold text-brand uppercase tracking-wider">New Habit</h3>

      {/* Name + Icon */}
      <div className="flex gap-2">
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="😊"
          maxLength={2}
          className="w-12 rounded-lg bg-surface-700 border border-surface-600 px-2 py-2.5 text-center text-lg
                     focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Habit name..."
          className="flex-1 rounded-lg bg-surface-700 border border-surface-600 px-3 py-2.5 text-sm text-white
                     placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
      </div>

      {/* Type */}
      <div>
        <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5 block">Type</label>
        <div className="grid grid-cols-4 gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setCategory(t.key); if (t.key !== "measured") setUnit(null); }}
              className={`rounded-lg py-2 text-[10px] font-bold transition-colors ${
                category === t.key
                  ? "bg-brand text-white"
                  : "bg-surface-700 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unit (for measured only) */}
      {category === "measured" && (
        <div>
          <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5 block">Unit</label>
          <div className="grid grid-cols-4 gap-1.5">
            {UNITS.map((u) => (
              <button
                key={u.value}
                onClick={() => setUnit(u.value)}
                className={`rounded-lg py-2 text-[10px] font-bold transition-colors ${
                  unit === u.value
                    ? "bg-brand text-white"
                    : "bg-surface-700 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stack */}
      <div>
        <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5 block">Stack</label>
        <div className="flex gap-1.5">
          {STACKS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStack(s.key)}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                stack === s.key
                  ? "bg-brand text-white"
                  : "bg-surface-700 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bare Minimum toggle */}
      {isBinaryLike(category) && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">Non-negotiable (bare minimum)</span>
          <button
            onClick={() => setBareMin(!bareMin)}
            className={`w-10 h-5 rounded-full transition-colors relative ${
              bareMin ? "bg-brand" : "bg-surface-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                bareMin ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="flex-1 rounded-lg py-2.5 text-sm font-bold bg-brand text-white disabled:opacity-40 active:scale-95 transition-all"
        >
          Create Habit
        </button>
        <button
          onClick={() => { setOpen(false); setName(""); setIcon(""); }}
          className="flex-1 rounded-lg py-2.5 text-sm font-medium bg-surface-700 text-neutral-400 active:scale-95 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Delete Habit Button (with confirmation) ─────────────────
function DeleteHabitButton({ habitId, habitName, onDeleted }: { habitId: string; habitName: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <button
        onClick={() => { deleteCustomHabit(habitId); onDeleted(); }}
        className="text-xs text-missed font-bold hover:text-missed/80 transition-colors"
      >
        Confirm delete
      </button>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-neutral-600 hover:text-missed transition-colors"
    >
      Delete
    </button>
  );
}

// ─── Habit Settings Row ─────────────────────────────────────
function HabitSettingsRow({
  habit,
  isFirst,
  isLast,
  onStackChange,
  onBareMinToggle,
  onArchive,
  onMoveUp,
  onMoveDown,
  onEditCustom,
}: {
  habit: Habit;
  isFirst: boolean;
  isLast: boolean;
  onStackChange: (stack: HabitStack) => void;
  onBareMinToggle: () => void;
  onArchive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEditCustom: (updates: Partial<Pick<Habit, "name" | "icon">>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(habit.name);
  const [editIcon, setEditIcon] = useState(habit.icon || "");
  const level = getHabitLevel(habit.id, habit.current_level);
  const isCustom = !isDefaultHabit(habit.id);

  return (
    <div className="rounded-xl bg-surface-800 border border-surface-700 overflow-hidden">
      {/* Main row — tap to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{habit.icon}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{habit.name}</span>
            {level && (
              <span className="text-xs text-neutral-500">
                Lv.{habit.current_level}
              </span>
            )}
            {isCustom && (
              <span className="text-[9px] bg-brand/20 text-brand px-1.5 py-0.5 rounded-full uppercase font-bold">
                Custom
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {habit.is_bare_minimum && (
            <span className="text-[10px] text-brand font-bold uppercase">
              Min
            </span>
          )}
          <span className="text-neutral-600 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded controls */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-700 pt-3 space-y-3">
          {/* Edit name/icon (custom habits only) */}
          {isCustom && (
            <div>
              <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1 block">
                Name & Icon
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  maxLength={2}
                  className="w-12 rounded-lg bg-surface-700 border border-surface-600 px-2 py-2 text-center text-lg
                             focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-lg bg-surface-700 border border-surface-600 px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
                <button
                  onClick={() => {
                    if (editName.trim() && (editName !== habit.name || editIcon !== (habit.icon || ""))) {
                      onEditCustom({ name: editName.trim(), icon: editIcon || null });
                    }
                  }}
                  disabled={!editName.trim() || (editName === habit.name && editIcon === (habit.icon || ""))}
                  className="rounded-lg bg-done/20 text-done px-3 py-2 text-xs font-bold disabled:opacity-30 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Stack selector */}
          <div>
            <label className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1 block">
              Stack
            </label>
            <div className="flex gap-1.5">
              {STACKS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => onStackChange(s.key)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                    habit.stack === s.key
                      ? "bg-brand text-white"
                      : "bg-surface-700 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bare minimum toggle */}
          {isBinaryLike(habit.category) && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Non-negotiable (bare minimum)</span>
              <button
                onClick={onBareMinToggle}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  habit.is_bare_minimum ? "bg-brand" : "bg-surface-600"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    habit.is_bare_minimum ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Reorder */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Reorder</span>
            <div className="flex gap-1">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  isFirst
                    ? "bg-surface-700/50 text-neutral-700"
                    : "bg-surface-700 text-neutral-400 hover:text-white"
                }`}
              >
                ↑
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  isLast
                    ? "bg-surface-700/50 text-neutral-700"
                    : "bg-surface-700 text-neutral-400 hover:text-white"
                }`}
              >
                ↓
              </button>
            </div>
          </div>

          {/* Archive */}
          <button
            onClick={onArchive}
            className="w-full rounded-lg border border-missed/30 py-2 text-xs text-missed hover:bg-missed/10 transition-colors"
          >
            Archive Habit
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Quotes Management ─────────────────────────────────────
const CATEGORY_LABELS: Record<QuoteCategory, string> = {
  prompt: "Reflection",
  rule: "Rule",
  liner: "Mindset",
  strong_thought: "Discipline",
};

const CATEGORY_COLORS: Record<QuoteCategory, string> = {
  prompt: "text-blue-400",
  rule: "text-brand",
  liner: "text-done",
  strong_thought: "text-later",
};

function QuotesSection({ settings, onUpdate }: { settings: UserSettings; onUpdate: (s: UserSettings) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<QuoteCategory>("liner");

  const hiddenIds = new Set(settings.hiddenQuoteIds ?? []);
  const customQuotes = settings.customQuotes ?? [];

  function toggleDefault(quoteId: string) {
    const hidden = new Set(settings.hiddenQuoteIds ?? []);
    if (hidden.has(quoteId)) {
      hidden.delete(quoteId);
    } else {
      hidden.add(quoteId);
    }
    onUpdate({ ...settings, hiddenQuoteIds: Array.from(hidden) });
  }

  function addCustomQuote() {
    if (!newText.trim()) return;
    const quote = {
      id: `cq-${Date.now()}`,
      text: newText.trim(),
      category: newCategory,
      isDefault: false as const,
    };
    onUpdate({
      ...settings,
      customQuotes: [...customQuotes, quote],
    });
    setNewText("");
    setShowAdd(false);
  }

  function removeCustomQuote(quoteId: string) {
    onUpdate({
      ...settings,
      customQuotes: customQuotes.filter((q) => q.id !== quoteId),
    });
  }

  return (
    <section className="mb-6">
      <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
        Motivational Quotes
      </h2>
      <p className="text-xs text-neutral-600 mb-4">
        Toggle default quotes on/off or add your own
      </p>

      {/* Custom quotes */}
      {customQuotes.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] font-bold text-done uppercase tracking-wider mb-2">Your Quotes</h3>
          <div className="space-y-2">
            {customQuotes.map((q) => (
              <div key={q.id} className="flex items-start gap-2 rounded-lg bg-surface-800 border border-surface-700 px-3 py-2">
                <span className={`text-[10px] font-bold uppercase mt-0.5 ${CATEGORY_COLORS[q.category as QuoteCategory] ?? "text-neutral-500"}`}>
                  {CATEGORY_LABELS[q.category as QuoteCategory] ?? q.category}
                </span>
                <p className="flex-1 text-xs text-neutral-300 italic">{q.text}</p>
                <button
                  onClick={() => removeCustomQuote(q.id)}
                  className="text-xs text-neutral-600 hover:text-missed transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add button / form */}
      {showAdd ? (
        <div className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-4">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter your quote..."
            rows={2}
            className="w-full bg-surface-700 rounded-lg px-3 py-2 text-sm text-white border-none outline-none resize-none focus:ring-2 focus:ring-brand/50 mb-3"
          />
          <div className="flex gap-1.5 mb-3">
            {(Object.keys(CATEGORY_LABELS) as QuoteCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setNewCategory(cat)}
                className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase transition-colors ${
                  newCategory === cat
                    ? "bg-brand text-white"
                    : "bg-surface-700 text-neutral-500"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={addCustomQuote}
              disabled={!newText.trim()}
              className="flex-1 rounded-lg py-2 text-sm font-bold bg-done text-white disabled:opacity-40 active:scale-95 transition-all"
            >
              Add Quote
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewText(""); }}
              className="flex-1 rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-400 active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-xl border border-dashed border-surface-600 py-3 text-sm text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 transition-colors mb-4"
        >
          + Add Custom Quote
        </button>
      )}

      {/* Default quotes by category */}
      {(Object.keys(CATEGORY_LABELS) as QuoteCategory[]).map((cat) => {
        const catQuotes = DEFAULT_QUOTES.filter((q) => q.category === cat);
        if (catQuotes.length === 0) return null;
        return (
          <div key={cat} className="mb-3">
            <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${CATEGORY_COLORS[cat]}`}>
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="space-y-1">
              {catQuotes.map((q) => {
                const isHidden = hiddenIds.has(q.id);
                return (
                  <button
                    key={q.id}
                    onClick={() => toggleDefault(q.id)}
                    className={`w-full text-left flex items-start gap-2 rounded-lg px-3 py-2 transition-colors ${
                      isHidden ? "bg-surface-800/30 opacity-40" : "bg-surface-800"
                    }`}
                  >
                    <span className="text-xs mt-0.5 shrink-0">{isHidden ? "⬜" : "✅"}</span>
                    <p className="text-xs text-neutral-400 italic">{q.text}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─── Notification Settings ──────────────────────────────────
function NotificationSection() {
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function sendTestNotification() {
    setTestStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(apiUrl("/api/notify/test"), { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestStatus("sent");
        setTimeout(() => setTestStatus("idle"), 4000);
      } else {
        setTestStatus("error");
        setErrorMsg(data.error || "Failed to send");
      }
    } catch {
      setTestStatus("error");
      setErrorMsg("Network error — is the server running?");
    }
  }

  return (
    <section className="rounded-xl bg-surface-800 border border-surface-700 p-4 mb-6">
      <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
        Phone Notifications (ntfy.sh)
      </h2>

      <div className="space-y-4">
        <p className="text-xs text-neutral-400 leading-relaxed">
          Real push notifications to your phone — even when the app is closed.
          Powered by <span className="text-brand font-semibold">ntfy.sh</span> (free, no account needed).
        </p>

        {/* Setup instructions */}
        <div className="rounded-lg bg-surface-700/50 p-3 space-y-2">
          <h3 className="text-xs font-bold text-neutral-300">Setup (one-time):</h3>
          <ol className="text-xs text-neutral-400 space-y-1.5 list-decimal list-inside">
            <li>Install the <span className="text-white font-medium">ntfy</span> app on your phone (free on App Store / Play Store)</li>
            <li>Open the app and tap <span className="text-white font-medium">+ Subscribe</span></li>
            <li>Enter the topic: <code className="text-brand bg-surface-700 px-1.5 py-0.5 rounded font-bold select-all">accountability-mk-662c59e795fd</code></li>
            <li>That&apos;s it — you&apos;ll get 6 daily check-ins + Fibonacci escalation for &quot;Later&quot; habits</li>
          </ol>
        </div>

        {/* Editable Schedule */}
        <NotificationScheduleEditor />

        {/* Fibonacci Escalation Info */}
        <div className="rounded-lg bg-surface-700/50 p-3">
          <h3 className="text-xs font-bold text-neutral-300 mb-2">Fibonacci Escalation:</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            When you tap <span className="text-later font-semibold">Later</span> on a habit, escalating reminders hit your phone:
          </p>
          <div className="mt-2 text-[10px] text-neutral-500 font-mono">
            +13 min → +8 min → +5 min → +3 min → +1 min
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            Then <span className="text-missed font-semibold">every minute for 30 more minutes</span> with rotating motivational messages.
            Each notification tells you when the next one is coming. Total: ~60 minutes of relentless reminders.
          </p>
        </div>

        {/* Test button */}
        <button
          onClick={sendTestNotification}
          disabled={testStatus === "sending"}
          className={`w-full rounded-lg py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
            testStatus === "sent"
              ? "bg-done/20 text-done border border-done/30"
              : testStatus === "error"
                ? "bg-missed/20 text-missed border border-missed/30"
                : testStatus === "sending"
                  ? "bg-surface-700 text-neutral-500"
                  : "bg-brand hover:bg-brand-dark text-white font-bold"
          }`}
        >
          {testStatus === "sending"
            ? "Sending..."
            : testStatus === "sent"
              ? "✓ Check your phone!"
              : testStatus === "error"
                ? "✕ Failed — check setup"
                : "📱 Send Test Notification"}
        </button>

        {testStatus === "error" && errorMsg && (
          <p className="text-xs text-missed/80">{errorMsg}</p>
        )}
      </div>
    </section>
  );
}

// ─── Notification Schedule Editor ────────────────────────
function NotificationScheduleEditor() {
  const [slots, setSlots] = useState<NotificationSlot[]>(() => {
    const s = loadSettingsLocal();
    return s.notificationSlots?.length > 0
      ? s.notificationSlots
      : DEFAULT_NOTIFICATION_SLOTS;
  });
  const [editing, setEditing] = useState(false);
  const [synced, setSynced] = useState(false);

  function formatSlotTime(slot: NotificationSlot): string {
    const h = slot.ukHour;
    const m = slot.ukMinute;
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  }

  // Derive checkinTimes from notification slots so dashboard/browser notifications stay in sync
  function syncCheckinTimesFromSlots(slotList: NotificationSlot[]) {
    const enabled = slotList.filter((s) => s.enabled).sort((a, b) => a.ukHour * 60 + a.ukMinute - (b.ukHour * 60 + b.ukMinute));
    const morning = enabled.find((s) => s.ukHour < 12) || enabled[0];
    const midday = enabled.find((s) => s.ukHour >= 12 && s.ukHour < 18);
    const evening = enabled.find((s) => s.ukHour >= 18);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      morning: morning ? `${pad(morning.ukHour)}:${pad(morning.ukMinute)}` : "07:00",
      midday: midday ? `${pad(midday.ukHour)}:${pad(midday.ukMinute)}` : "13:00",
      evening: evening ? `${pad(evening.ukHour)}:${pad(evening.ukMinute)}` : "21:00",
    };
  }

  function saveSlots(next: NotificationSlot[]) {
    const currentSettings = loadSettingsLocal();
    currentSettings.notificationSlots = next;
    currentSettings.checkinTimes = syncCheckinTimesFromSlots(next);
    // Save to localStorage + Supabase
    saveSettingsToDB(currentSettings);
    // Push updated schedule to service worker immediately
    syncScheduleToServiceWorker();
  }

  function updateSlot(id: string, updates: Partial<NotificationSlot>) {
    setSlots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      saveSlots(next);
      return next;
    });
  }

  function addSlot() {
    const newSlot: NotificationSlot = {
      id: `custom-${Date.now()}`,
      ukHour: 12,
      ukMinute: 0,
      label: "Custom",
      icon: "🔔",
      enabled: true,
    };
    setSlots((prev) => {
      const next = [...prev, newSlot].sort((a, b) => a.ukHour * 60 + a.ukMinute - (b.ukHour * 60 + b.ukMinute));
      saveSlots(next);
      return next;
    });
  }

  function removeSlot(id: string) {
    setSlots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSlots(next);
      return next;
    });
  }

  function resetToDefault() {
    setSlots(DEFAULT_NOTIFICATION_SLOTS);
    saveSlots(DEFAULT_NOTIFICATION_SLOTS);
  }

  async function syncSchedule() {
    // Call the sync API to update the server-side schedule
    try {
      const res = await fetch(apiUrl("/api/notify/sync-schedule"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: slots.filter((s) => s.enabled) }),
      });
      if (res.ok) {
        setSynced(true);
        setTimeout(() => setSynced(false), 3000);
      }
    } catch {
      // Silent fail — schedule will use defaults on next cron
    }
  }

  const enabledCount = slots.filter((s) => s.enabled).length;

  return (
    <div className="rounded-lg bg-surface-700/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-neutral-300">
          Daily Schedule ({enabledCount} check-in{enabledCount !== 1 ? "s" : ""})
        </h3>
        <button
          onClick={() => setEditing(!editing)}
          className="text-[10px] text-brand hover:text-brand-dark font-medium"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="space-y-1.5">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
              slot.enabled ? "text-neutral-300" : "text-neutral-600 opacity-50"
            }`}
          >
            {editing && (
              <button
                onClick={() => updateSlot(slot.id, { enabled: !slot.enabled })}
                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                  slot.enabled ? "bg-done/20 text-done" : "bg-surface-600 text-neutral-600"
                }`}
              >
                {slot.enabled ? "✓" : ""}
              </button>
            )}
            <span className="w-5 text-center">{slot.icon}</span>
            {editing ? (
              <>
                <input
                  type="time"
                  value={`${slot.ukHour.toString().padStart(2, "0")}:${slot.ukMinute.toString().padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    updateSlot(slot.id, { ukHour: h, ukMinute: m });
                  }}
                  className="bg-surface-600 rounded px-2 py-1 text-xs text-white border-none outline-none w-24"
                />
                <input
                  type="text"
                  value={slot.label}
                  onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                  className="bg-surface-600 rounded px-2 py-1 text-xs text-white border-none outline-none flex-1"
                  placeholder="Label"
                />
                {slot.id.startsWith("custom-") && (
                  <button
                    onClick={() => removeSlot(slot.id)}
                    className="text-missed/60 hover:text-missed text-[10px]"
                  >
                    ✕
                  </button>
                )}
              </>
            ) : (
              <span>
                {formatSlotTime(slot)} — {slot.label}
              </span>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={addSlot}
            className="flex-1 rounded-lg bg-surface-600 py-2 text-[10px] font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            + Add Time
          </button>
          <button
            onClick={resetToDefault}
            className="flex-1 rounded-lg bg-surface-600 py-2 text-[10px] font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Reset Defaults
          </button>
        </div>
      )}

      {/* Sync button — pushes schedule to server */}
      <button
        onClick={syncSchedule}
        className={`w-full mt-2 rounded-lg py-2 text-[10px] font-medium transition-all ${
          synced
            ? "bg-done/20 text-done"
            : "bg-surface-600 text-neutral-400 hover:text-neutral-200"
        }`}
      >
        {synced ? "✓ Schedule synced" : "🔄 Sync to notifications"}
      </button>
    </div>
  );
}

// ─── Reset Buttons ──────────────────────────────────────
function ResetDataButton() {
  const [streakResetDone, setStreakResetDone] = useState(false);
  const [recalcDone, setRecalcDone] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState("");
  const [fullResetStep, setFullResetStep] = useState(0);
  const [fullResetDone, setFullResetDone] = useState(false);

  function handleRecalculateStreaks() {
    const state = loadStateLocal();
    const allHabits = getResolvedHabits();
    const habitSlugsById: Record<string, string> = {};
    for (const h of allHabits) {
      habitSlugsById[h.id] = h.slug;
    }
    const calculatedStreaks = recalculateStreaks(state, habitSlugsById);
    state.streaks = calculatedStreaks;
    saveStateToDB(state);

    const nonZero = Object.entries(calculatedStreaks).filter(([, v]) => v > 0);
    setRecalcMessage(
      nonZero.length > 0
        ? `✓ Recalculated — ${nonZero.map(([k, v]) => `${k}: ${v}d`).join(", ")}`
        : "✓ Recalculated — all streaks start fresh"
    );
    setRecalcDone(true);
    setTimeout(() => setRecalcDone(false), 5000);
  }

  function handleStreakReset() {
    const state = loadStateLocal();
    // Reset all individual habit streaks to 0
    state.streaks = {};
    // Reset bare minimum streak to 0 (day 1 starts fresh)
    state.bareMinimumStreak = 0;
    saveStateToDB(state);
    setStreakResetDone(true);
    setTimeout(() => setStreakResetDone(false), 3000);
  }

  function handleFullReset() {
    if (fullResetStep === 0) {
      setFullResetStep(1);
      return;
    }

    const freshState: LocalState = {
      totalXp: 0,
      currentLevel: 1,
      streaks: {},
      bareMinimumStreak: 0,
      logs: [],
      activeSprint: null,
      sprintHistory: [],
    };
    saveStateToDB(freshState);

    if (typeof window !== "undefined") {
      localStorage.removeItem("accountability-gym");
      localStorage.removeItem("accountability-notifications");
    }

    setFullResetDone(true);
    setFullResetStep(0);
    setTimeout(() => setFullResetDone(false), 3000);
  }

  return (
    <div className="space-y-2">
      {/* Recalculate streaks from log history — fixes incorrect counts */}
      <button
        onClick={handleRecalculateStreaks}
        className={`w-full rounded-xl border py-3 text-sm transition-colors ${
          recalcDone
            ? "border-done/30 bg-done/10 text-done font-medium"
            : "border-brand/30 text-brand hover:bg-brand/10 hover:border-brand/50"
        }`}
      >
        {recalcDone ? recalcMessage : "🔄 Recalculate Streaks from History"}
      </button>
      <p className="text-[10px] text-neutral-600 text-center -mt-1">
        Fixes incorrect streak counts by scanning your log history
      </p>

      {/* Streak reset — keeps XP, logs, gym data */}
      <button
        onClick={handleStreakReset}
        className={`w-full rounded-xl border py-3 text-sm transition-colors ${
          streakResetDone
            ? "border-done/30 bg-done/10 text-done font-medium"
            : "border-surface-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
        }`}
      >
        {streakResetDone
          ? "✓ All streaks reset to Day 1"
          : "Reset All Streaks to Day 1"}
      </button>

      {/* Full data reset */}
      {fullResetDone ? (
        <div className="w-full rounded-xl border border-done/30 bg-done/10 py-3 text-sm text-done font-medium text-center">
          All data reset to zero
        </div>
      ) : (
        <button
          onClick={handleFullReset}
          className={`w-full rounded-xl border py-3 text-sm transition-colors ${
            fullResetStep === 1
              ? "border-missed/50 bg-missed/10 text-missed font-bold hover:bg-missed/20"
              : "border-missed/20 text-neutral-600 hover:text-missed hover:border-missed/40"
          }`}
        >
          {fullResetStep === 1
            ? "Tap again to confirm — erases ALL XP, streaks, logs, and gym data"
            : "Nuclear Reset (erase everything)"}
        </button>
      )}
    </div>
  );
}
