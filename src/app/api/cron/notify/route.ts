// Vercel Cron Job — sends all daily check-in reminders via ntfy.sh
// Runs once daily at 6 AM UTC (vercel.json). Schedules all 6 notifications
// using ntfy's built-in "delay" feature so they arrive at the right UK times.
// Protected by CRON_SECRET to prevent unauthorized calls.

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://accountability-tracker-sandy.vercel.app";

interface ScheduledNotif {
  slot: string;
  ukHour: number; // Target hour in UK time (24h)
  title: string;
  body: string;
  tags: string[];
  priority: number;
}

const SCHEDULE: ScheduledNotif[] = [
  {
    slot: "morning",
    ukHour: 7,
    title: "Morning check-in",
    body: "Time to start the day. Prayer, Bible, Cold Exposure, Keystone Task — let's go.",
    tags: ["sunrise", "white_check_mark"],
    priority: 4,
  },
  {
    slot: "mid-morning",
    ukHour: 10,
    title: "Mid-morning check",
    body: "Morning stack done? If not, what's left? Deep work window is open.",
    tags: ["coffee", "brain"],
    priority: 3,
  },
  {
    slot: "midday",
    ukHour: 13,
    title: "Afternoon check-in",
    body: "Midday grind check. Deep work done? NSDR logged? Keep building.",
    tags: ["sun_with_face", "muscle"],
    priority: 3,
  },
  {
    slot: "mid-afternoon",
    ukHour: 15,
    title: "Afternoon push",
    body: "3 PM — energy dip is normal. Push through. What's still on the list?",
    tags: ["fire", "dart"],
    priority: 3,
  },
  {
    slot: "early-evening",
    ukHour: 18,
    title: "Evening prep",
    body: "6 PM — training time? Get moving. The evening stack is waiting.",
    tags: ["weight_lifting", "running_shirt_with_sash"],
    priority: 4,
  },
  {
    slot: "evening",
    ukHour: 21,
    title: "Evening wrap-up",
    body: "End of day — log your training, reading, and close out strong.",
    tags: ["crescent_moon", "writing_hand"],
    priority: 4,
  },
];

function getUkNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/London" })
  );
}

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!NTFY_TOPIC) {
    return NextResponse.json(
      { error: "NTFY_TOPIC not configured" },
      { status: 500 }
    );
  }

  const ukNow = getUkNow();
  const currentHour = ukNow.getHours();
  const currentMinute = ukNow.getMinutes();

  const results: { slot: string; delay: string; status: string }[] = [];

  for (const notif of SCHEDULE) {
    // Calculate delay in minutes from now to target UK hour
    const delayMinutes =
      (notif.ukHour - currentHour) * 60 - currentMinute;

    // If target time already passed today, skip it
    if (delayMinutes < 0) {
      results.push({ slot: notif.slot, delay: "skipped", status: "past" });
      continue;
    }

    try {
      const body: Record<string, unknown> = {
        topic: NTFY_TOPIC,
        title: notif.title,
        message: notif.body,
        tags: notif.tags,
        priority: notif.priority,
        click: `${APP_URL}/checkin`,
        actions: [
          {
            action: "view",
            label: "Open Check-in",
            url: `${APP_URL}/checkin`,
          },
        ],
      };

      // Only add delay if > 0 minutes in the future
      if (delayMinutes > 0) {
        body.delay = `${delayMinutes}m`;
      }

      const response = await fetch("https://ntfy.sh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        results.push({
          slot: notif.slot,
          delay: `${delayMinutes}m`,
          status: `error: ${text}`,
        });
      } else {
        results.push({
          slot: notif.slot,
          delay: delayMinutes > 0 ? `${delayMinutes}m` : "immediate",
          status: "scheduled",
        });
      }
    } catch (error) {
      results.push({
        slot: notif.slot,
        delay: `${delayMinutes}m`,
        status: `error: ${String(error)}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    cronTime: ukNow.toISOString(),
    ukHour: currentHour,
    results,
  });
}
