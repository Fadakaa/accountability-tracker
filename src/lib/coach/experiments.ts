// Experiment CRUD — load/save/update experiments from Supabase
// Falls back to localStorage when offline.

import { supabase } from "@/lib/supabase";
import { isOnline } from "@/lib/sync/online";
import type { CoachExperiment, ExperimentScale, ExperimentComplexity, ExperimentStatus } from "@/lib/store";

const LOCAL_KEY = "accountability-coach-experiments";

// ─── Local storage helpers ──────────────────────────────────

function loadLocal(): CoachExperiment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal(experiments: CoachExperiment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(experiments));
}

// ─── Auth helper ────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch { return null; }
}

// ─── CRUD ──────────────────────────────────────────────────

export async function loadExperiments(): Promise<CoachExperiment[]> {
  const userId = await getUserId();
  if (!userId || !isOnline()) return loadLocal();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("coach_experiments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !data) return loadLocal();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const experiments: CoachExperiment[] = (data as any[]).map(rowToExperiment);
    saveLocal(experiments);
    return experiments;
  } catch {
    return loadLocal();
  }
}

export async function saveExperiment(experiment: CoachExperiment): Promise<void> {
  // Save locally first
  const local = loadLocal();
  const idx = local.findIndex(e => e.id === experiment.id);
  if (idx >= 0) { local[idx] = experiment; } else { local.unshift(experiment); }
  saveLocal(local);

  const userId = await getUserId();
  if (!userId || !isOnline()) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("coach_experiments").upsert(
      experimentToRow(experiment, userId),
      { onConflict: "id" },
    );
  } catch (err) {
    console.warn("[coach/experiments] Save failed:", err);
  }
}

export async function deleteExperiment(experimentId: string): Promise<void> {
  // Remove locally
  const local = loadLocal().filter(e => e.id !== experimentId);
  saveLocal(local);

  const userId = await getUserId();
  if (!userId || !isOnline()) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("coach_experiments").delete().eq("id", experimentId);
  } catch (err) {
    console.warn("[coach/experiments] Delete failed:", err);
  }
}

// ─── Quick action helpers ──────────────────────────────────

export async function acceptExperiment(experimentId: string): Promise<void> {
  const local = loadLocal();
  const exp = local.find(e => e.id === experimentId);
  if (!exp) return;

  const today = new Date().toISOString().slice(0, 10);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + exp.durationDays);

  exp.status = "active";
  exp.startDate = today;
  exp.endDate = endDate.toISOString().slice(0, 10);
  exp.updatedAt = new Date().toISOString();
  await saveExperiment(exp);
}

export async function completeExperiment(experimentId: string, outcome: string): Promise<void> {
  const local = loadLocal();
  const exp = local.find(e => e.id === experimentId);
  if (!exp) return;

  exp.status = "completed";
  exp.outcome = outcome;
  exp.updatedAt = new Date().toISOString();
  await saveExperiment(exp);
}

export async function skipExperiment(experimentId: string): Promise<void> {
  const local = loadLocal();
  const exp = local.find(e => e.id === experimentId);
  if (!exp) return;

  exp.status = "skipped";
  exp.updatedAt = new Date().toISOString();
  await saveExperiment(exp);
}

export function createExperimentFromAI(
  title: string,
  description: string,
  scale: ExperimentScale,
  complexity: ExperimentComplexity,
  durationDays: number,
): CoachExperiment {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    scale,
    complexity,
    status: "suggested",
    durationDays,
    startDate: null,
    endDate: null,
    outcome: null,
    coachAnalysis: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Row transforms ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToExperiment(row: any): CoachExperiment {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    scale: row.scale as ExperimentScale,
    complexity: row.complexity as ExperimentComplexity,
    status: row.status as ExperimentStatus,
    durationDays: row.duration_days ?? 5,
    startDate: row.start_date,
    endDate: row.end_date,
    outcome: row.outcome,
    coachAnalysis: row.coach_analysis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function experimentToRow(exp: CoachExperiment, userId: string) {
  return {
    id: exp.id,
    user_id: userId,
    title: exp.title,
    description: exp.description,
    scale: exp.scale,
    complexity: exp.complexity,
    status: exp.status,
    duration_days: exp.durationDays,
    start_date: exp.startDate,
    end_date: exp.endDate,
    outcome: exp.outcome,
    coach_analysis: exp.coachAnalysis,
    created_at: exp.createdAt,
    updated_at: exp.updatedAt,
  };
}
