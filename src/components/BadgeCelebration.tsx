"use client";

import { useEffect, useState, useMemo } from "react";
import type { BadgeDef } from "@/lib/badges";

interface BadgeCelebrationProps {
  badges: BadgeDef[];
  onDone: () => void;
}

const CONFETTI_COLORS = ["#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

/**
 * Full-screen celebration overlay when new badges are earned.
 * Shows each badge one at a time with confetti animation.
 */
export default function BadgeCelebration({ badges, onDone }: BadgeCelebrationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(true);

  // Pre-compute confetti positions so they don't change on re-render
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 1}s`,
        duration: `${2 + Math.random() * 2}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotation: `${Math.random() * 360}deg`,
      })),
    []
  );

  useEffect(() => {
    // Entrance animation
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 600);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  if (badges.length === 0) return null;

  const badge = badges[currentIndex];
  const isLast = currentIndex >= badges.length - 1;

  function handleNext() {
    if (isLast) {
      onDone();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleNext}
    >
      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confettiPieces.map((piece, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: piece.left,
              animation: `badge-confetti ${piece.duration} ${piece.delay} linear forwards`,
            }}
          >
            <div
              className="w-2 h-2 rounded-sm"
              style={{
                backgroundColor: piece.color,
                transform: `rotate(${piece.rotation})`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Badge card */}
      <div
        className={`relative flex flex-col items-center gap-4 px-8 py-10 max-w-[320px] text-center transition-all duration-500 ${
          animating ? "scale-50 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* Category label */}
        <div className="text-[10px] uppercase tracking-[0.2em] text-amber-400/70 font-bold">
          {badge.isHidden ? "Hidden Badge Unlocked" : "Badge Unlocked"}
        </div>

        {/* Icon — big and glowing */}
        <div className="relative">
          <div className="text-7xl drop-shadow-[0_0_20px_rgba(249,115,22,0.5)]">
            {badge.icon}
          </div>
          {/* Glow ring */}
          <div className="absolute inset-0 -m-4 rounded-full bg-amber-500/10 blur-xl animate-pulse" />
        </div>

        {/* Name */}
        <h2 className="text-2xl font-black text-white tracking-tight">
          {badge.name}
        </h2>

        {/* Description */}
        <p className="text-sm text-neutral-300 leading-relaxed">
          {badge.description}
        </p>

        {/* Progress indicator */}
        {badges.length > 1 && (
          <div className="flex gap-1.5 mt-2">
            {badges.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentIndex ? "bg-amber-400" : i < currentIndex ? "bg-amber-400/40" : "bg-neutral-600"
                }`}
              />
            ))}
          </div>
        )}

        {/* Tap hint */}
        <div className="text-[11px] text-neutral-500 mt-4">
          {isLast ? "Tap to close" : "Tap for next badge"}
        </div>
      </div>

      {/* Keyframe animation for confetti — injected once */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes badge-confetti {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}} />
    </div>
  );
}
