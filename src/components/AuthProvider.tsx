"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { clearAllLocalData } from "@/lib/store";

const SOLO_USER_ID = "00000000-0000-0000-0000-000000000001";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isSoloMode: boolean; // true when using hardcoded solo user (not real Supabase auth)
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isCapacitorEnv(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win.Capacitor !== undefined || win.capacitor !== undefined;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSoloMode, setIsSoloMode] = useState(false);

  useEffect(() => {
    if (isCapacitorEnv()) {
      // ── Capacitor: try real Supabase auth first, fall back to solo mock user ──
      let settled = false;

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (settled) return;
        settled = true;
        if (session?.user) {
          // Real Supabase session exists — use it
          setSession(session);
          setUser(session.user);
          setIsSoloMode(false);
        } else {
          // No session — use solo mock user so app is immediately usable
          setUser({ id: SOLO_USER_ID } as User);
          setIsSoloMode(true);
        }
        setLoading(false);
      });

      // Safety timeout: if getSession hangs, fall back to solo mode after 3s
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        setUser({ id: SOLO_USER_ID } as User);
        setIsSoloMode(true);
        setLoading(false);
      }, 3000);

      // Listen for auth changes (login, logout) even in Capacitor
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (newSession?.user) {
          settled = true;
          setSession(newSession);
          setUser(newSession.user);
          setIsSoloMode(false);
        } else if (isCapacitorEnv()) {
          // Logged out in Capacitor — fall back to solo mode
          setSession(null);
          setUser({ id: SOLO_USER_ID } as User);
          setIsSoloMode(true);
        } else {
          setSession(null);
          setUser(null);
          setIsSoloMode(false);
        }
        setLoading(false);
      });

      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    }

    // ── Web: standard Supabase auth flow ──
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (isCapacitorEnv()) {
      // In Capacitor: fall back to solo mode after sign out
      // Do NOT clear localStorage — keep the user's data intact
      setSession(null);
      setUser({ id: SOLO_USER_ID } as User);
      setIsSoloMode(true);
    } else {
      // On web: clear all app data to prevent data leaking between users
      clearAllLocalData();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, isSoloMode, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
