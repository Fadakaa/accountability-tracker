import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Chainable no-op query builder for Capacitor (mimics Supabase PostgREST builder)
// Every method returns itself so .from("x").select("*").eq("a", "b").order("c") works
function noopQueryBuilder(): Record<string, unknown> {
  const result = { data: null, error: null, count: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
    catch: (fn: (e: unknown) => void) => Promise.resolve(result).catch(fn),
  };
  // All query builder methods return the builder itself for chaining
  const chainMethods = [
    "select", "insert", "upsert", "update", "delete",
    "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
    "is", "in", "contains", "containedBy", "range",
    "filter", "not", "or", "and",
    "order", "limit", "single", "maybeSingle",
    "csv", "returns", "match", "textSearch",
  ];
  for (const method of chainMethods) {
    builder[method] = () => builder;
  }
  return builder;
}

// Guard: only create a real client if URL/key are present (won't be in Capacitor static builds)
export const supabase: SupabaseClient<Database> = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : (new Proxy({} as SupabaseClient<Database>, {
      get(_target, prop) {
        // Return a safe no-op for auth and other methods so imports don't crash
        if (prop === "auth") {
          return {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: () => Promise.resolve({ error: new Error("Supabase not configured") }),
            signUp: () => Promise.resolve({ error: new Error("Supabase not configured") }),
            signOut: () => Promise.resolve(),
          };
        }
        if (prop === "from") {
          return () => noopQueryBuilder();
        }
        return undefined;
      },
    }));
