// React hook wrapping the Supabase sync layer.
// Provides auth-aware state loading with automatic fallback to localStorage.
// Handles migration on first load and re-sync on reconnect.

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  loadStateFromDB,
  saveStateToDB,
  saveDayLogToDB,
  loadSettingsFromDB,
  saveSettingsToDB,
  syncPendingOperations,
  hasUnsyncedChanges,
  loadHabitsFromDB,
} from "@/lib/db";
import {
  loadState,
  saveState,
  loadSettings,
  saveSettings,
  recalculateStreaks,
  DEFAULT_NOTIFICATION_SLOTS,
} from "@/lib/store";
import type { LocalState, UserSettings, DayLog } from "@/lib/store";
import { getResolvedHabits } from "@/lib/resolvedHabits";
import type { Habit, HabitLevel } from "@/types/database";
import type { SyncStatus } from "@/lib/sync/types";
import { isOnline, onOnlineChange } from "@/lib/sync/online";
import { isMigrated, migrateLocalStorageToSupabase } from "@/lib/sync/migration";
import { clearAllLocalData } from "@/lib/store";

interface UseDBResult {
  // Data
  state: LocalState;
  settings: UserSettings;
  dbHabits: Habit[] | null;       // Habits from Supabase (null if offline/unauthenticated)
  dbHabitLevels: HabitLevel[] | null;

  // Status
  loading: boolean;
  syncStatus: SyncStatus;
  isAuthenticated: boolean;

  // Actions
  saveState: (state: LocalState) => Promise<void>;
  saveDayLog: (dayLog: DayLog, fullState: LocalState) => Promise<void>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  refresh: () => Promise<void>;
  /** Recalculate streaks from log history and persist if changed. Call after write-path operations. */
  recalcStreaks: () => void;
}

const DEFAULT_STATE: LocalState = {
  totalXp: 0,
  currentLevel: 1,
  streaks: {},
  bareMinimumStreak: 0,
  logs: [],
  activeSprint: null,
  sprintHistory: [],
};

const DEFAULT_SETTINGS: UserSettings = {
  habitOverrides: {},
  levelUpStates: {},
  checkinTimes: { morning: "07:00", midday: "13:00", evening: "21:00" },
  notificationSlots: DEFAULT_NOTIFICATION_SLOTS,
  customQuotes: [],
  hiddenQuoteIds: [],
  routineChains: { morning: [], midday: [], evening: [] },
  customHabits: [],
};

/**
 * Single source of truth for streak recalculation.
 * Called once after data loads in useDB and after write-path operations.
 * Pages should NEVER recalculate streaks independently — they read state.streaks.
 */
function ensureStreaksConsistent(
  currentState: LocalState,
  habits: Habit[] | null,
  currentSettings: UserSettings,
): { state: LocalState; changed: boolean } {
  const hasData = currentState.logs.length > 0 || currentState.totalXp > 0;
  if (!hasData) return { state: currentState, changed: false };

  const allHabits = getResolvedHabits(false, habits, currentSettings);
  const habitSlugsById: Record<string, string> = {};
  for (const h of allHabits) {
    habitSlugsById[h.id] = h.slug;
  }
  const newStreaks = recalculateStreaks(currentState, habitSlugsById);
  const changed = JSON.stringify(newStreaks) !== JSON.stringify(currentState.streaks);
  if (!changed) return { state: currentState, changed: false };

  return { state: { ...currentState, streaks: newStreaks }, changed: true };
}

export function useDB(): UseDBResult {
  const { user } = useAuth();
  const [state, setState] = useState<LocalState>(() => loadState());
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [dbHabits, setDbHabits] = useState<Habit[] | null>(null);
  const [dbHabitLevels, setDbHabitLevels] = useState<HabitLevel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const loadedRef = useRef(false);
  // Sentinel: "uninitialized" means we haven't seen any user yet (first load).
  // This prevents clearAllLocalData() from firing when auth resolves
  // from null → real user on normal app startup (which isn't a user switch).
  const prevUserIdRef = useRef<string | null | "uninitialized">("uninitialized");

  // ─── Initial load ──────────────────────────────────────

  const loadData = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== "undefined" ? (window as any) : null;
    const isCapacitor = win?.Capacitor !== undefined || win?.capacitor !== undefined;

    setLoading(true);

    // In Capacitor: load from localStorage first for instant display,
    // then try to pull from Supabase in the background (if authenticated & online)
    if (isCapacitor) {
      const localState = loadState();
      const localSettings = loadSettings();
      setState(localState);
      setSettings(localSettings);
      setSyncStatus("offline");
      setLoading(false);

      // Background Supabase sync for Capacitor — pull remote data if local is empty
      if (user && isOnline()) {
        (async () => {
          try {
            const [remoteState, remoteSettings] = await Promise.all([
              loadStateFromDB(),
              loadSettingsFromDB(),
            ]);
            const localHasData = localState.logs.length > 0 || localState.totalXp > 0;
            const remoteHasData = remoteState.logs.length > 0 || remoteState.totalXp > 0;

            if (remoteHasData && !localHasData) {
              // Remote has data but local is empty — pull from Supabase
              console.log("[useDB] Capacitor: pulling data from Supabase (local was empty)");
              setState(remoteState);
              saveState(remoteState); // cache in localStorage
              setSettings(remoteSettings);
              saveSettings(remoteSettings);
            } else if (remoteHasData && localHasData) {
              // Both have data — use whichever has more logs (more complete)
              if (remoteState.logs.length > localState.logs.length) {
                console.log("[useDB] Capacitor: remote has more data, merging");
                setState(remoteState);
                saveState(remoteState);
              }
              // Always take remote settings if they exist
              setSettings(remoteSettings);
              saveSettings(remoteSettings);
            }

            // Load habits from DB
            const habitsResult = await loadHabitsFromDB();
            if (habitsResult) {
              setDbHabits(habitsResult.habits);
              setDbHabitLevels(habitsResult.levels);

              // Recalculate streaks with real habits
              const currentState = loadState(); // re-read after potential update
              const { state: streakState, changed } = ensureStreaksConsistent(
                currentState, habitsResult.habits, remoteSettings,
              );
              if (changed) {
                setState(streakState);
                saveState(streakState);
              }
            }

            setSyncStatus("idle");
          } catch (err) {
            console.warn("[useDB] Capacitor background sync failed:", err);
            // Not a problem — app works with localStorage data
          }
        })();
      }
      return;
    }

    setSyncStatus(isOnline() && user ? "syncing" : "offline");

    // Detect user switch — clear stale localStorage so new user starts fresh.
    // Only clear when BOTH the previous and current user IDs are real (non-null)
    // values that differ. The "uninitialized" sentinel and null → user transitions
    // (normal app startup) should never trigger a data wipe.
    const currentUserId = user?.id ?? null;
    const prev = prevUserIdRef.current;
    if (
      prev !== "uninitialized" &&
      prev !== null &&
      currentUserId !== null &&
      currentUserId !== prev
    ) {
      console.log("[useDB] User changed — clearing stale localStorage data");
      clearAllLocalData();
      setState(DEFAULT_STATE);
      setSettings(DEFAULT_SETTINGS);
    }
    prevUserIdRef.current = currentUserId;

    try {
      // Run migration if needed (first authenticated load)
      if (user && !isMigrated() && isOnline()) {
        try {
          await migrateLocalStorageToSupabase(user.id);
        } catch (err) {
          console.warn("[useDB] Migration failed, continuing with localStorage:", err);
        }
      }

      // Flush pending operations
      if (user && isOnline() && hasUnsyncedChanges()) {
        await syncPendingOperations();
      }

      // Load state (Supabase if possible, localStorage fallback)
      const [newState, newSettings] = await Promise.all([
        loadStateFromDB(),
        loadSettingsFromDB(),
      ]);

      // Safety: never overwrite existing data with empty state
      // This prevents race conditions where Supabase returns empty before data loads
      const currentState = loadState(); // fresh read from localStorage
      const currentHasData = currentState.logs.length > 0 || currentState.totalXp > 0;
      const newHasData = newState.logs.length > 0 || newState.totalXp > 0;

      if (currentHasData && !newHasData) {
        console.warn("[useDB] Refusing to overwrite existing data with empty state — keeping current data");
        setState(currentState);
      } else {
        setState(newState);
      }
      setSettings(newSettings);

      // Load habits from DB
      let loadedHabits: Habit[] | null = null;
      if (user) {
        const habitsResult = await loadHabitsFromDB();
        if (habitsResult) {
          loadedHabits = habitsResult.habits;
          setDbHabits(habitsResult.habits);
          setDbHabitLevels(habitsResult.levels);
        }
      }

      // ─── Single source of truth: recalculate streaks once here ───
      // All pages read state.streaks from useDB — no page should recalculate independently.
      const finalState = currentHasData && !newHasData ? currentState : newState;
      const { state: streakState, changed: streaksChanged } = ensureStreaksConsistent(
        finalState, loadedHabits, newSettings,
      );
      if (streaksChanged) {
        setState(streakState);
        saveState(streakState); // persist corrected streaks
        // Fire-and-forget Supabase sync for the corrected streaks
        saveStateToDB(streakState).catch(() => {});
      }

      setSyncStatus(isOnline() && user ? "idle" : "offline");
    } catch (err) {
      console.warn("[useDB] Load failed:", err);
      setSyncStatus("error");
      // Ensure we at least have localStorage data
      setState(loadState());
      setSettings(loadSettings());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadData();
    }
  }, [loadData]);

  // Reload when user changes (login/logout)
  useEffect(() => {
    if (loadedRef.current) {
      loadData();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Re-sync on reconnect ─────────────────────────────

  useEffect(() => {
    const unsub = onOnlineChange(async (online) => {
      if (online && user) {
        setSyncStatus("syncing");
        try {
          if (hasUnsyncedChanges()) {
            await syncPendingOperations();
          }
          // Refresh data from Supabase
          const newState = await loadStateFromDB();
          // Safety: don't overwrite good data with empty data on reconnect
          const currentLocal = loadState();
          const localHasData = currentLocal.logs.length > 0 || currentLocal.totalXp > 0;
          const remoteHasData = newState.logs.length > 0 || newState.totalXp > 0;
          if (localHasData && !remoteHasData) {
            console.warn("[useDB] Reconnect: refusing to overwrite local data with empty Supabase data");
          } else {
            setState(newState);
          }
          setSyncStatus("idle");
        } catch {
          setSyncStatus("error");
        }
      } else {
        setSyncStatus("offline");
      }
    });
    return unsub;
  }, [user]);

  // ─── Save actions ─────────────────────────────────────

  const handleSaveState = useCallback(async (newState: LocalState) => {
    setState(newState);
    saveState(newState); // localStorage immediately
    try {
      await saveStateToDB(newState);
    } catch (err) {
      console.warn("[useDB] Save state failed:", err);
    }
  }, []);

  const handleSaveDayLog = useCallback(async (dayLog: DayLog, fullState: LocalState) => {
    setState(fullState);
    try {
      await saveDayLogToDB(dayLog, fullState);
    } catch (err) {
      console.warn("[useDB] Save day log failed:", err);
    }
  }, []);

  const handleSaveSettings = useCallback(async (newSettings: UserSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings); // localStorage immediately
    try {
      await saveSettingsToDB(newSettings);
    } catch (err) {
      console.warn("[useDB] Save settings failed:", err);
    }
  }, []);

  // ─── Recalculate streaks (call after write-path operations) ──
  const handleRecalcStreaks = useCallback(() => {
    setState((prev) => {
      const { state: updated, changed } = ensureStreaksConsistent(prev, dbHabits, settings);
      if (changed) {
        saveState(updated);
        saveStateToDB(updated).catch(() => {});
      }
      return changed ? updated : prev;
    });
  }, [dbHabits, settings]);

  return {
    state,
    settings,
    dbHabits,
    dbHabitLevels,
    loading,
    syncStatus,
    isAuthenticated: !!user,
    saveState: handleSaveState,
    saveDayLog: handleSaveDayLog,
    saveSettings: handleSaveSettings,
    refresh: loadData,
    recalcStreaks: handleRecalcStreaks,
  };
}
