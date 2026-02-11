// Sync notification schedule — called from settings page
// Immediately schedules today's remaining notifications with the user's custom times
// The cron job handles the daily reset; this handles mid-day changes

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://accountability-tracker-sandy.vercel.app";

interface SlotInput {
  id: string;
  ukHour: number;
  ukMinute: number;
  label: string;
  icon: string;
  enabled: boolean;
}

// Notification messages keyed by slot position
const MESSAGES: Record<string, { title: string; body: string; tags: string[]; priority: number }> = {
  morning: {
    title: "Morning check-in",
    body: "Time to start the day. Prayer, Bible, Cold Exposure, Keystone Task — let's go.",
    tags: ["sunrise", "white_check_mark"],
    priority: 4,
  },
  default: {
    title: "Check-in reminder",
    body: "How's the day going? Open the app and log your progress.",
    tags: ["bell", "white_check_mark"],
    priority: 3,
  },
  evening: {
    title: "Evening wrap-up",
    body: "End of day — log your training, reading, and close out strong.",
    tags: ["crescent_moon", "writing_hand"],
    priority: 4,
  },
};

function getUkNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/London" })
  );
}

export async function POST(request: Request) {
  if (!NTFY_TOPIC) {
    return NextResponse.json(
      { error: "NTFY_TOPIC not configured" },
      { status: 500 }
    );
  }

  let body: { slots: SlotInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slots } = body;
  if (!slots || !Array.isArray(slots)) {
    return NextResponse.json({ error: "slots array required" }, { status: 400 });
  }

  const ukNow = getUkNow();
  const currentMinutes = ukNow.getHours() * 60 + ukNow.getMinutes();
  const results: { label: string; time: string; status: string }[] = [];

  for (const slot of slots) {
    if (!slot.enabled) continue;

    const slotMinutes = slot.ukHour * 60 + (slot.ukMinute || 0);
    const delayMinutes = slotMinutes - currentMinutes;

    // Skip slots that have already passed today
    if (delayMinutes < 0) {
      results.push({ label: slot.label, time: `${slot.ukHour}:${String(slot.ukMinute || 0).padStart(2, "0")}`, status: "past" });
      continue;
    }

    // Pick message based on time of day
    const msgKey = slot.ukHour < 9 ? "morning" : slot.ukHour >= 20 ? "evening" : "default";
    const msg = MESSAGES[msgKey];

    try {
      // No `actions` — iOS ntfy doesn't support action buttons
      const ntfyBody: Record<string, unknown> = {
        topic: NTFY_TOPIC,
        title: `${slot.icon} ${slot.label}: ${msg.title}`,
        message: `${msg.body}\n\n👉 Tap to check in`,
        tags: msg.tags,
        priority: msg.priority,
        click: `${APP_URL}/checkin`,
      };

      if (delayMinutes > 0) {
        ntfyBody.delay = `${delayMinutes}m`;
      }

      const response = await fetch("https://ntfy.sh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ntfyBody),
      });

      if (!response.ok) {
        const text = await response.text();
        results.push({ label: slot.label, time: `${slot.ukHour}:${String(slot.ukMinute || 0).padStart(2, "0")}`, status: `error: ${text}` });
      } else {
        results.push({ label: slot.label, time: `${slot.ukHour}:${String(slot.ukMinute || 0).padStart(2, "0")}`, status: delayMinutes > 0 ? `scheduled +${delayMinutes}m` : "sent" });
      }
    } catch (error) {
      results.push({ label: slot.label, time: `${slot.ukHour}:${String(slot.ukMinute || 0).padStart(2, "0")}`, status: `error: ${String(error)}` });
    }
  }

  return NextResponse.json({
    ok: true,
    scheduled: results.filter((r) => r.status.startsWith("scheduled") || r.status === "sent").length,
    skipped: results.filter((r) => r.status === "past").length,
    errors: results.filter((r) => r.status.startsWith("error")).length,
    results,
  });
}
