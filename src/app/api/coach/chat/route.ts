// POST /api/coach/chat — Server-side AI proxy
// Reads the user's API key from Supabase, calls the appropriate AI provider.
// The client NEVER sees the raw API key.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callProvider } from "@/lib/coach/providers";
import type { CoachMessage } from "@/lib/coach/providers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  try {
    // 1. Get the auth token from the request
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    // 2. Create a Supabase client with the user's token to verify auth
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    // 3. Parse request body
    const body = await request.json();
    const { messages, provider, model } = body as {
      messages: CoachMessage[];
      provider: string;
      model?: string;
    };

    if (!messages || !provider) {
      return NextResponse.json({ error: "Missing messages or provider" }, { status: 400 });
    }

    // 4. Read the user's API key from Supabase
    // Use service role key if available (bypasses RLS), otherwise use user's token
    const supabaseAdmin = SUPABASE_SERVICE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
      : supabaseUser;

    const { data: keyRow, error: keyError } = await supabaseAdmin
      .from("coach_api_keys")
      .select("api_key_encrypted, provider, model")
      .eq("user_id", user.id)
      .single();

    if (keyError || !keyRow) {
      return NextResponse.json(
        { error: "No API key configured. Add one in Settings → AI Coach." },
        { status: 400 },
      );
    }

    // 5. Call the AI provider
    const apiKey = keyRow.api_key_encrypted;
    const effectiveProvider = (provider || keyRow.provider) as "anthropic" | "openai" | "google";
    const effectiveModel = model || keyRow.model || undefined;

    const response = await callProvider(effectiveProvider, messages, apiKey, effectiveModel);

    return NextResponse.json({
      content: response.content,
      tokensUsed: response.tokensUsed,
    });
  } catch (err) {
    console.error("[coach/chat] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
