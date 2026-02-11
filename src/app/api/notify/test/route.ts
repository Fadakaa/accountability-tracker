// Test notification endpoint — sends a test message via ntfy.sh
// Called from the settings page to verify ntfy is working

import { NextResponse } from "next/server";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://accountability-tracker-sandy.vercel.app";

export async function POST() {
  if (!NTFY_TOPIC) {
    return NextResponse.json({ error: "NTFY_TOPIC not configured. Add it to your Vercel environment variables." }, { status: 500 });
  }

  try {
    const response = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: "Test notification",
        message: "Notifications are working! You'll get check-in reminders at 7 AM, 1 PM, 9 PM, and an 11 PM warning.",
        tags: ["white_check_mark", "bell"],
        priority: 4,
        click: `${APP_URL}/settings`,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: "ntfy failed", details: text }, { status: 500 });
    }

    return NextResponse.json({ ok: true, topic: NTFY_TOPIC });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send", details: String(error) }, { status: 500 });
  }
}
