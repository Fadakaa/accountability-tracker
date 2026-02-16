// Multi-provider AI abstraction — wraps Claude, GPT, and Gemini APIs
// Each provider is a simple fetch wrapper that normalizes the response.
// Used server-side (API route) and also client-side in Capacitor (direct calls).

export interface CoachMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CoachResponse {
  content: string;
  tokensUsed?: number;
}

// ─── Anthropic (Claude) ──────────────────────────────────────

export async function callAnthropic(
  messages: CoachMessage[],
  apiKey: string,
  model: string = "claude-sonnet-4-20250514",
): Promise<CoachResponse> {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: chatMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.content?.[0]?.text ?? "",
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
  };
}

// ─── OpenAI (GPT) ────────────────────────────────────────────

export async function callOpenAI(
  messages: CoachMessage[],
  apiKey: string,
  model: string = "gpt-4o-mini",
): Promise<CoachResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    tokensUsed: data.usage?.total_tokens,
  };
}

// ─── Google (Gemini) ─────────────────────────────────────────

export async function callGoogle(
  messages: CoachMessage[],
  apiKey: string,
  model: string = "gemini-2.0-flash",
): Promise<CoachResponse> {
  // Gemini uses a different format: system instruction + contents array
  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: 2048 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const tokensUsed =
    (data.usageMetadata?.promptTokenCount ?? 0) +
    (data.usageMetadata?.candidatesTokenCount ?? 0);

  return { content, tokensUsed };
}

// ─── Dispatcher ──────────────────────────────────────────────

export type ProviderName = "anthropic" | "openai" | "google";

export async function callProvider(
  provider: ProviderName,
  messages: CoachMessage[],
  apiKey: string,
  model?: string,
): Promise<CoachResponse> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(messages, apiKey, model);
    case "openai":
      return callOpenAI(messages, apiKey, model);
    case "google":
      return callGoogle(messages, apiKey, model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ─── Local API Key Storage (for Capacitor / offline use) ─────

const LOCAL_COACH_KEY = "accountability-coach-key";

export interface LocalCoachConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
}

export function saveCoachKeyLocally(config: LocalCoachConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_COACH_KEY, JSON.stringify(config));
}

export function loadCoachKeyLocally(): LocalCoachConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_COACH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalCoachConfig;
  } catch {
    return null;
  }
}

export function hasLocalCoachKey(): boolean {
  return loadCoachKeyLocally() !== null;
}

export function clearCoachKeyLocally(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_COACH_KEY);
}

/** Call the AI provider directly from the client using the locally stored API key.
 *  Used in Capacitor where the Vercel API route is not available. */
export async function callProviderDirectly(
  messages: CoachMessage[],
  overrideProvider?: ProviderName,
  overrideModel?: string,
): Promise<CoachResponse> {
  const config = loadCoachKeyLocally();
  if (!config) throw new Error("No AI provider configured. Add your API key in Settings → AI Coach.");

  const provider = overrideProvider || config.provider;
  const model = overrideModel || config.model;
  return callProvider(provider, messages, config.apiKey, model);
}
