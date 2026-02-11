// Fibonacci Escalation via ntfy.sh
// When a user taps "Later" on a habit, this schedules escalating reminders:
// +13 min → +8 min → +5 min → +3 min → +1 min = 30 min total
// Only 5 notifications are scheduled via ntfy (can't be cancelled once queued).
// The browser-side escalation handles the relentless 1-min phase after that,
// which CAN be cancelled when the habit is completed.
//
// NOTE: ntfy action buttons (view/http) don't work on iOS ntfy app.
// We rely on the `click` URL (tap notification body) and include a
// direct link in the message text as fallback.

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://accountability-tracker-sandy.vercel.app";

const FIBONACCI_DELAYS = [13, 8, 5, 3, 1]; // Only Fibonacci phase via ntfy

interface EscalationStep {
  delay: number;
  title: string;
  message: string;
  priority: number;
  tags: string[];
}

function buildSteps(habitName: string, habitIcon: string): EscalationStep[] {
  const steps: EscalationStep[] = [];
  const checkinUrl = `${APP_URL}/checkin`;

  // Fibonacci phase only (5 steps) — browser handles relentless phase
  const fibMessages = [
    {
      title: `${habitIcon} ${habitName}`,
      message: `Just checking — did you get to ${habitName} yet?\n\nNext reminder in 8 minutes.\n\n👉 Tap here or open: ${checkinUrl}`,
      priority: 3,
      tags: ["hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} ${habitName}`,
      message: `Still pending: ${habitName}. Small actions, ruthless consistency.\n\nNext reminder in 5 minutes.\n\n👉 ${checkinUrl}`,
      priority: 3,
      tags: ["hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} Warning: ${habitName}`,
      message: `${habitName} is still open. Even 30 seconds counts.\n\nNext reminder in 3 minutes.\n\n👉 ${checkinUrl}`,
      priority: 4,
      tags: ["warning", "hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} Urgent: ${habitName}`,
      message: `${habitName} — do it now. Relief later.\n\nNext reminder in 1 minute.\n\n👉 ${checkinUrl}`,
      priority: 4,
      tags: ["warning", "hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} Final call: ${habitName}`,
      message: `Last call: ${habitName}. Yes or No. No more later.\n\nOpen the app to log it now.\n\n👉 ${checkinUrl}`,
      priority: 5,
      tags: ["rotating_light", "exclamation"],
    },
  ];

  for (let i = 0; i < FIBONACCI_DELAYS.length; i++) {
    steps.push({
      delay: FIBONACCI_DELAYS[i],
      ...fibMessages[i],
    });
  }

  return steps;
}

export async function POST(request: Request) {
  if (!NTFY_TOPIC) {
    return NextResponse.json(
      { error: "NTFY_TOPIC not configured" },
      { status: 500 }
    );
  }

  let body: { habitName: string; habitIcon: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { habitName, habitIcon } = body;
  if (!habitName) {
    return NextResponse.json({ error: "habitName required" }, { status: 400 });
  }

  const steps = buildSteps(habitName, habitIcon);
  const results: { step: number; delay: string; status: string }[] = [];
  let cumulativeDelay = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    cumulativeDelay += step.delay;

    try {
      const ntfyBody: Record<string, unknown> = {
        topic: NTFY_TOPIC,
        title: step.title,
        message: step.message,
        tags: step.tags,
        priority: step.priority,
        delay: `${cumulativeDelay}m`,
        click: `${APP_URL}/checkin`,
      };

      const response = await fetch("https://ntfy.sh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ntfyBody),
      });

      if (!response.ok) {
        const text = await response.text();
        results.push({
          step: i,
          delay: `${cumulativeDelay}m`,
          status: `error: ${text}`,
        });
      } else {
        results.push({
          step: i,
          delay: `${cumulativeDelay}m`,
          status: "scheduled",
        });
      }
    } catch (error) {
      results.push({
        step: i,
        delay: `${cumulativeDelay}m`,
        status: `error: ${String(error)}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    habit: habitName,
    totalSteps: steps.length,
    totalEscalationMinutes: cumulativeDelay,
    fibonacciPhase: `${FIBONACCI_DELAYS.join(" + ")} = ${cumulativeDelay} min`,
    note: "Browser-side handles relentless 1-min phase (cancellable on completion)",
    scheduledCount: results.filter((r) => r.status === "scheduled").length,
    errorCount: results.filter((r) => r.status.startsWith("error")).length,
  });
}
