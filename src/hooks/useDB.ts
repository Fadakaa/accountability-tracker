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
} from "@/lib/store";
import type { LocalState, UserSettings, DayLog } from "@/lib/store";
import type { Habit, HabitLevel } from "@/types/database";
import type { SyncStatus } from "@/lib/sync/types";
import { isOnline, onOnlineChange } from "@/lib/sync/online";
import { isMigrated, migrateLocalStorageToSupabase } from "@/lib/sync/migration";

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
  notificationSlots: [],
  customQuotes: [],
  hiddenQuoteIds: [],
  routineChains: { morning: [], midday: [], evening: [] },
  customHabits: [],
};

export function useDB(): UseDBResult {
  const { user } = useAuth();
  const [state, setState] = useState<LocalState>(() => loadState());
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [dbHabits, setDbHabits] = useState<Habit[] | null>(null);
  const [dbHabitLevels, setDbHabitLevels] = useState<HabitLevel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const loadedRef = useRef(false);

  // ─── Initial load ──────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setSyncStatus(isOnline() && user ? "syncing" : "offline");

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

      setState(newState);
      setSettings(newSettings);

      // Load habits from DB
      if (user) {
        const habitsResult = await loadHabitsFromDB();
        if (habitsResult) {
          setDbHabits(habitsResult.habits);
          setDbHabitLevels(habitsResult.levels);
        }
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
          setState(newState);
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
  };
}
