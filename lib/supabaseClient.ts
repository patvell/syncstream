import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const isProd = process.env.NODE_ENV === "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  // If env is missing:
  //  - During build/prerender: return a throwaway client so module evaluation
  //    never crashes the build.
  //  - In production: fail loudly at request time with a clear error.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProd) {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    client = createClient("https://placeholder.supabase.co", "placeholder-anon-key");
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