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

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-missed/10 border border-missed/30 px-3 py-2">
                <p className="text-sm text-missed text-center">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand hover:bg-brand-dark py-3.5 text-sm font-bold
                         text-white transition-all active:scale-[0.98] disabled:opacity-50
                         disabled:active:scale-100 mt-2"
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
