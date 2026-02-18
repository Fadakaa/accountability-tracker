// POST /api/gym/extract — Server-side AI proxy for voice workout extraction.
// Mirrors /api/coach/chat: reads user's API key from Supabase, calls the AI provider,
// returns the raw response. Client is responsible for parsing the JSON.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callProvider } from "@/lib/coach/providers";
import type { CoachMessage } from "@/lib/coach/providers";
import { buildExtractionPrompt } from "@/lib/gym/extractionPrompt";
import type { GymSessionLocal } from "@/lib/store";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  try {
    // 1. Verify auth
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { transcript, provider, model, exerciseLibrary, lastSession } = body as {
      transcript: string;
      provider: string;
      model?: string;
      exerciseLibrary: string[];
      lastSession: GymSessionLocal | null;
    };

    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    // 3. Read user's API key from Supabase
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

    // 4. Build messages with extraction prompt
    const systemPrompt = buildExtractionPrompt(exerciseLibrary || [], lastSession || null);
    const messages: CoachMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript },
    ];

    // 5. Call AI provider
    const apiKey = keyRow.api_key_encrypted;
    const effectiveProvider = (provider || keyRow.provider) as "anthropic" | "openai" | "google";
    const effectiveModel = model || keyRow.model || undefined;

    const response = await callProvider(effectiveProvider, messages, apiKey, effectiveModel);

    return NextResponse.json({
      content: response.content,
      tokensUsed: response.tokensUsed,
    });
  } catch (err) {
    console.error("[gym/extract] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
