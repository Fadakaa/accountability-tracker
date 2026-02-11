// Server-side Web Push API — stores subscriptions and sends push notifications
// Uses VAPID keys for authentication (set in env vars)
// Subscriptions stored in-memory for now; move to Supabase when connected

import { NextRequest, NextResponse } from "next/server";

// In-memory subscription store (replaced by DB in production)
// Key: subscription endpoint (unique per browser), Value: full PushSubscription + schedule
interface StoredSubscription {
  subscription: PushSubscriptionJSON;
  checkinTimes: { morning: string; midday: string; evening: string };
  updatedAt: string;
}

const subscriptions = new Map<string, StoredSubscription>();

// POST /api/push — subscribe or update a push subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, checkinTimes } = body;

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: "Missing subscription endpoint" }, { status: 400 });
    }

    subscriptions.set(subscription.endpoint, {
      subscription,
      checkinTimes: checkinTimes ?? { morning: "07:00", midday: "13:00", evening: "21:00" },
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, count: subscriptions.size });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET /api/push — list subscription count (debug)
export async function GET() {
  return NextResponse.json({
    subscriptionCount: subscriptions.size,
    // Don't expose actual subscriptions for security
  });
}

// DELETE /api/push — remove a subscription
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body;
    if (endpoint) {
      subscriptions.delete(endpoint);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
