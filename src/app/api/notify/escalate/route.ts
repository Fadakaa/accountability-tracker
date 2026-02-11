// Fibonacci Escalation via ntfy.sh
// When a user taps "Later" on a habit, this schedules escalating reminders:
// +13 min → +8 min → +5 min → +3 min → +1 min → then every 1 min for 30 more mins
// Each message includes a countdown to the next reminder.
// Total: ~60 minutes of escalating then relentless reminders.

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://accountability-tracker-sandy.vercel.app";

// Fibonacci intervals then repeating 1-min
// After step 4, every 1 min for 30 more iterations
const FIBONACCI_DELAYS = [13, 8, 5, 3, 1];
const RELENTLESS_COUNT = 30; // 30 extra 1-min reminders after Fibonacci

interface EscalationStep {
  delay: number; // interval in minutes
  title: string;
  message: string;
  priority: number;
  tags: string[];
}

function buildSteps(habitName: string, habitIcon: string): EscalationStep[] {
  const steps: EscalationStep[] = [];

  // Fibonacci phase (5 steps)
  const fibMessages = [
    {
      title: `${habitIcon} ${habitName}`,
      message: `Just checking — did you get to ${habitName} yet?\n\nNext reminder in 8 minutes.`,
      priority: 3,
      tags: ["hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} ${habitName}`,
      message: `Still pending: ${habitName}. Small actions, ruthless consistency.\n\nNext reminder in 5 minutes.`,
      priority: 3,
      tags: ["hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} Warning: ${habitName}`,
      message: `${habitName} is still open. Even 30 seconds counts.\n\nNext reminder in 3 minutes.`,
      priority: 4,
      tags: ["warning", "hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} Urgent: ${habitName}`,
      message: `${habitName} — do it now. Relief later.\n\nNext reminder in 1 minute.`,
      priority: 4,
      tags: ["warning", "hourglass_flowing_sand"],
    },
    {
      title: `${habitIcon} Final call: ${habitName}`,
      message: `Last call: ${habitName}. Yes or No. No more later.\n\nReminders will continue every minute until you log it.`,
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

  // Relentless phase — every 1 minute
  const relentlessMessages = [
    "I don't negotiate with the plan. I execute it.",
    "Still waiting. Log it or miss it.",
    "Every minute you delay is a minute you chose comfort over discipline.",
    "This is the resistance. Push through it.",
    "The habit takes 2 minutes. The regret lasts all day.",
    "You said 'later'. Later is now.",
    "No shortcuts. No excuses. Log it.",
    "The system only works if you work the system.",
    "One more minute of avoidance won't make it easier.",
    "You're better than this. Prove it.",
  ];

  for (let i = 0; i < RELENTLESS_COUNT; i++) {
    const msgText = relentlessMessages[i % relentlessMessages.length];
    const minutesLeft = RELENTLESS_COUNT - i;
    steps.push({
      delay: 1,
      title: `${habitIcon} ${habitName} — still unlogged`,
      message: `${msgText}\n\n${minutesLeft > 1 ? `Reminders continue for ${minutesLeft} more minutes.` : "Final reminder."}`,
      priority: 5,
      tags: ["rotating_light"],
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
        actions: [
          {
            action: "view",
            label: "Log Now",
            url: `${APP_URL}/checkin`,
            clear: true,
          },
        ],
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
    fibonacciPhase: `${FIBONACCI_DELAYS.join(" + ")} = 30 min`,
    relentlessPhase: `${RELENTLESS_COUNT} x 1 min = ${RELENTLESS_COUNT} min`,
    scheduledCount: results.filter((r) => r.status === "scheduled").length,
    errorCount: results.filter((r) => r.status.startsWith("error")).length,
  });
}
