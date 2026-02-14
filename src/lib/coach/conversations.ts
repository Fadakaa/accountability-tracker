// Coach conversation persistence — save/load coaching sessions
// Falls back to localStorage when offline. Follows experiments.ts pattern.

import { supabase } from "@/lib/supabase";
import { isOnline } from "@/lib/sync/online";

const LOCAL_KEY = "accountability-coach-conversations";
const MAX_LOCAL = 10; // cap localStorage entries

// ─── Types ──────────────────────────────────────────────────

export interface CoachConversation {
  id: string;
  messages: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  summary: string;
  createdAt: string;
}

// ─── Local storage helpers ──────────────────────────────────

function loadLocal(): CoachConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal(conversations: CoachConversation[]) {
  if (typeof window === "undefined") return;
  // Keep only the most recent entries to avoid bloat
  const capped = conversations
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_LOCAL);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(capped));
}

// ─── Auth helper ────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch { return null; }
}

// ─── Summary generation ─────────────────────────────────────

/**
 * Generate a conversation summary from the messages.
 * Uses the last assistant message, stripped of markdown, truncated to ~150 words.
 * No AI call needed — the last response naturally summarises the session.
 */
export function generateConversationSummary(
  messages: Array<{ role: string; content: string }>
): string {
  // Find the last assistant message
  const assistantMessages = messages.filter(m => m.role === "assistant");
  if (assistantMessages.length === 0) return "";

  const last = assistantMessages[assistantMessages.length - 1].content;

  // Strip markdown formatting
  const cleaned = last
    .replace(/\*\*(.+?)\*\*/g, "$1")   // bold
    .replace(/\*(.+?)\*/g, "$1")       // italic
    .replace(/^#+\s+/gm, "")           // headings
    .replace(/^[-*]\s+/gm, "• ")       // list items
    .replace(/\n{2,}/g, " ")           // collapse line breaks
    .replace(/\n/g, " ")
    .trim();

  // Truncate to ~150 words
  const words = cleaned.split(/\s+/);
  if (words.length <= 150) return cleaned;
  return words.slice(0, 150).join(" ") + "…";
}

// ─── CRUD ──────────────────────────────────────────────────

/**
 * Load recent conversation summaries for context injection.
 * Lightweight: only fetches id, summary, and created_at.
 */
export async function loadRecentConversationSummaries(
  limit: number = 5
): Promise<ConversationSummary[]> {
  const userId = await getUserId();
  if (!userId || !isOnline()) {
    // Fallback to localStorage
    return loadLocal()
      .filter(c => c.summary)
      .slice(0, limit)
      .map(c => ({ id: c.id, summary: c.summary!, createdAt: c.createdAt }));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("coach_conversations")
      .select("id, summary, created_at")
      .eq("user_id", userId)
      .not("summary", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return loadLocal()
        .filter(c => c.summary)
        .slice(0, limit)
        .map(c => ({ id: c.id, summary: c.summary!, createdAt: c.createdAt }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(row => ({
      id: row.id,
      summary: row.summary,
      createdAt: row.created_at,
    }));
  } catch {
    return loadLocal()
      .filter(c => c.summary)
      .slice(0, limit)
      .map(c => ({ id: c.id, summary: c.summary!, createdAt: c.createdAt }));
  }
}

/**
 * Save or update a conversation (full messages + summary).
 * Saves locally first, then upserts to Supabase.
 */
export async function saveConversation(conversation: CoachConversation): Promise<void> {
  // Save locally first
  const local = loadLocal();
  const idx = local.findIndex(c => c.id === conversation.id);
  if (idx >= 0) { local[idx] = conversation; } else { local.unshift(conversation); }
  saveLocal(local);

  const userId = await getUserId();
  if (!userId || !isOnline()) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("coach_conversations").upsert(
      conversationToRow(conversation, userId),
      { onConflict: "id" },
    );
  } catch (err) {
    console.warn("[coach/conversations] Save failed:", err);
  }
}

// ─── Row transforms ──────────────────────────────────────

function conversationToRow(conv: CoachConversation, userId: string) {
  return {
    id: conv.id,
    user_id: userId,
    messages: conv.messages, // JSONB column accepts objects directly
    summary: conv.summary,
    created_at: conv.createdAt,
    updated_at: conv.updatedAt,
  };
}
