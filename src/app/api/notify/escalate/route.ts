// Fibonacci Escalation via ntfy.sh
// When a user taps "Later" on a habit, this schedules escalating reminders:
// +13 min → +8 min → +5 min → +3 min → +1 min → auto-miss after 30 min total
// Called from the client when a habit is marked as "Later"

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://accountability-tracker-sandy.vercel.app";

// Fibonacci escalation intervals in minutes (from spec)
const FIBONACCI_DELAYS = [13, 8, 5, 3, 1];

const ESCALATION_MESSAGES = [
  { prefix: "", template: "Just checking — did you get to {habit} yet?" },
  { prefix: "", template: "Still pending: {habit}. Small actions, ruthless consistency." },
  { prefix: "Warning", template: "{habit} is still open. Even 30 seconds counts." },
  { prefix: "Urgent", template: "{habit} — do it now. Relief later." },
  { prefix: "Final", template: "Last call: {habit}. Yes or No. No more later." },
];

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

  const results: { step: number; delay: string; status: string }[] = [];
  let cumulativeDelay = 0;

  for (let i = 0; i < FIBONACCI_DELAYS.length; i++) {
    cumulativeDelay += FIBONACCI_DELAYS[i];
    const msg = ESCALATION_MESSAGES[i];
    const messageText = msg.template.replace("{habit}", habitName);

    // Priority escalates: 3 → 3 → 4 → 4 → 5
    const priority = i < 2 ? 3 : i < 4 ? 4 : 5;

    // Tags escalate: gentle → urgent
    const tags = i < 2
      ? ["hourglass_flowing_sand"]
      : i < 4
        ? ["warning", "hourglass_flowing_sand"]
        : ["rotating_light", "exclamation"];

    try {
      const ntfyBody: Record<string, unknown> = {
        topic: NTFY_TOPIC,
        title: `${habitIcon} ${msg.prefix ? msg.prefix + ": " : ""}${habitName}`,
        message: messageText,
        tags,
        priority,
        delay: `${cumulativeDelay}m`,
        click: `${APP_URL}/checkin`,
        actions: [
          {
            action: "view",
            label: "Log Now",
            url: `${APP_URL}/checkin`,
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
    totalEscalationMinutes: cumulativeDelay,
    results,
  });
}
