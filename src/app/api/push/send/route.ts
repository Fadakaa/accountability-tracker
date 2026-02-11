// POST /api/push/send — send a push notification to a specific subscription
// Called by the client-side scheduler as a fallback when the tab is in background
// In production, this would be called by a Vercel Cron job

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, title, body: notifBody, tag, url } = body;

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
    }

    // VAPID keys from environment
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublicKey || !vapidPrivateKey) {
      // No VAPID keys configured — skip server push silently
      return NextResponse.json({ ok: false, reason: "VAPID keys not configured" });
    }

    // Dynamic import web-push only when VAPID keys are available
    let webpush;
    try {
      webpush = await import("web-push");
    } catch {
      return NextResponse.json({ ok: false, reason: "web-push not installed" });
    }

    webpush.setVapidDetails(
      "mailto:accountability@example.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    const payload = JSON.stringify({
      title: title || "Accountability Tracker",
      body: notifBody || "Time for a check-in!",
      tag: tag || "checkin",
      url: url || "/checkin",
    });

    await webpush.sendNotification(subscription, payload);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Push failed";
    // 410 Gone = subscription expired, client should re-subscribe
    if (message.includes("410")) {
      return NextResponse.json({ ok: false, expired: true }, { status: 410 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
