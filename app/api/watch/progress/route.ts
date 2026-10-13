import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Parse JWT payload from app_session cookie (same helper as middleware)
function getUserId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("app_session="));
  if (!match) return null;
  const token = match.split("=", 2)[1];
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload.user_id;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const userId = getUserId(request.headers.get("cookie"));
  if (!userId) {
    return NextResponse.json({ entries: [] });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "8"), 20);

  const { data, error } = await supabase
    .from("watch_progress")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ entries: [] });
  }

  return NextResponse.json({ entries: data });
}

export async function DELETE(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const userId = getUserId(request.headers.get("cookie"));
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("watch_progress")
    .delete()
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}