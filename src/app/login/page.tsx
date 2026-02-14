"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [honestyAgreed, setHonestyAgreed] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      window.location.href = "/";
    }
  }, [user, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (mode === "signin") {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
      }
      // On success, onAuthStateChange fires → user updates → useEffect redirects
    } else {
      const result = await signUp(email, password);
      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
      } else {
        // If email confirmation is required, show a message
        // If disabled, onAuthStateChange fires and auto-redirects
        setSignupSuccess(true);
        setSubmitting(false);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-500 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // Already logged in — will redirect
  if (user) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <span className="text-5xl">🔥</span>
          <h1 className="text-2xl font-bold mt-3 tracking-tight">
            Accountability Tracker
          </h1>
          <p className="text-sm text-neutral-500 mt-1.5">
            {mode === "signin"
              ? "Welcome back. Let\u2019s keep the streak alive."
              : "Create your account. Day 1 starts now."}
          </p>
        </div>

        {/* Sign-up success message */}
        {signupSuccess && (
          <div className="rounded-xl bg-done/10 border border-done/30 p-4 mb-6 text-center">
            <p className="text-sm text-done font-medium">Account created!</p>
            <p className="text-xs text-neutral-400 mt-1">
              Check your email for a confirmation link, then sign in.
            </p>
            <button
              onClick={() => {
                setMode("signin");
                setSignupSuccess(false);
                setError("");
              }}
              className="mt-3 text-sm text-brand font-medium hover:text-brand-light"
            >
              Go to Sign In
            </button>
          </div>
        )}

        {!signupSuccess && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-neutral-500 mb-1.5 ml-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3
                           text-sm text-white placeholder-neutral-600
                           focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand
                           transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-neutral-500 mb-1.5 ml-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "signup" ? "Min 6 characters" : "Your password"
                }
                required
                minLength={6}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                className="w-full rounded-xl bg-surface-800 border border-surface-700 px-4 py-3
                           text-sm text-white placeholder-neutral-600
                           focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand
                           transition-all"
              />
            </div>

            {/* Honesty Agreement — signup only */}
            {mode === "signup" && (
              <div className="rounded-2xl bg-surface-800/80 border border-surface-700/50 p-4 mt-2">
                <p className="text-xs font-bold text-neutral-200 mb-2.5 tracking-tight">
                  ⚔️ The Pact
                </p>
                <div className="space-y-2 mb-3.5">
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    This system only works with <span className="text-white font-semibold">radical honesty</span>.
                    If you miss a day, you record it. If you fail, you own it. No hiding, no excuses, no
                    adjusting the numbers to feel better.
                  </p>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Once you begin, <span className="text-white font-semibold">you don&apos;t walk from the path</span>.
                    The streaks will break. The numbers will hurt. Record them anyway. That&apos;s how you grow.
                  </p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={honestyAgreed}
                      onChange={(e) => setHonestyAgreed(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-surface-600 bg-surface-700
                                    peer-checked:bg-brand peer-checked:border-brand transition-all
                                    group-hover:border-surface-500 flex items-center justify-center">
                      {honestyAgreed && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-neutral-300 font-medium leading-relaxed">
                    I commit to recording honestly — even when it&apos;s uncomfortable
                  </span>
                </label>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-missed/10 border border-missed/30 px-3 py-2">
                <p className="text-sm text-missed text-center">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || (mode === "signup" && !honestyAgreed)}
              className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all
                         active:scale-[0.98] disabled:active:scale-100 mt-2 ${
                           mode === "signup" && !honestyAgreed
                             ? "bg-surface-700 text-neutral-500 cursor-not-allowed"
                             : "bg-brand hover:bg-brand-dark disabled:opacity-50"
                         }`}
            >
              {submitting
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>
        )}

        {/* Toggle mode */}
        <p className="text-center text-sm text-neutral-500 mt-8">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setSignupSuccess(false);
                }}
                className="text-brand hover:text-brand-light font-medium transition-colors"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("signin");
                  setError("");
                  setSignupSuccess(false);
                }}
                className="text-brand hover:text-brand-light font-medium transition-colors"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
