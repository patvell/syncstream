import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  // If env vars are missing (e.g. during `next build` static prerendering, or
  // a misconfigured deploy), return a throwaway client so module evaluation
  // NEVER crashes the build. Any runtime network call will simply fail
  // harmlessly against the placeholder host instead of taking down the app.
  // All real Supabase features only activate once the env vars are provided.
  if (!supabaseUrl || !supabaseAnonKey) {
    client = createClient(
      "https://placeholder.supabase.co",
      "placeholder-anon-key"
    );
    return client;
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return client;
}

export const supabase: SupabaseClient = getClient();