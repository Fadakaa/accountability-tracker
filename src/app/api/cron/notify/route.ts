// Vercel Cron Job — sends check-in reminders via ntfy.sh
// Runs at 07:00, 13:00, 21:00, and 23:00 UTC (configured in vercel.json)
// Protected by CRON_SECRET to prevent unauthorized calls

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://accountability-tracker-sandy.vercel.app";

// Notification messages per time slot
interface NotifMessage {
  title: string;
  body: string;
  tags: string[];
  priority: number; // 1-5 (1=min, 3=default, 4=high, 5=urgent)
}

const MESSAGES: Record<string, NotifMessage> = {
  morning: {
    title: "Morning check-in",
    body: "Time to start the day. Prayer, Bible, Cold Exposure, Keystone Task — let's go.",
    tags: ["sunrise", "white_check_mark"],
    priority: 4,
  },
  midday: {
    title: "Afternoon check-in",
    body: "Midday grind check. Deep work done? NSDR logged? Keep building.",
    tags: ["sun_with_face", "muscle"],
    priority: 3,
  },
  evening: {
    title: "Evening wrap-up",
    body: "End of day — log your training, reading, and close out strong.",
    tags: ["crescent_moon", "writing_hand"],
    priority: 4,
  },
  warning: {
    title: "Day isn't logged yet",
    body: "It's 11 PM. Habits still unlogged. Don't let the day slip — go log now.",
    tags: ["warning", "hourglass_flowing_sand"],
    priority: 5,
  },
};

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!NTFY_TOPIC) {
    return NextResponse.json({ error: "NTFY_TOPIC not configured" }, { status: 500 });
  }

  // Determine which notification to send based on current UK time
  const now = new Date();
  const ukTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const hour = ukTime.getHours();

  let slot: string;
  if (hour >= 6 && hour <= 8) {
    slot = "morning";
  } else if (hour >= 12 && hour <= 14) {
    slot = "midday";
  } else if (hour >= 20 && hour <= 22) {
    slot = "evening";
  } else if (hour === 23) {
    slot = "warning";
  } else {
    return NextResponse.json({ ok: true, skipped: true, hour });
  }

  const msg = MESSAGES[slot];

  try {
    const response = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: msg.title,
        message: msg.body,
        tags: msg.tags,
        priority: msg.priority,
        click: `${APP_URL}/checkin`,
        actions: [
          {
            action: "view",
            label: "Open Check-in",
            url: `${APP_URL}/checkin`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: "ntfy failed", status: response.status, body: text }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slot, hour, sent: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send notification", details: String(error) }, { status: 500 });
  }
}
