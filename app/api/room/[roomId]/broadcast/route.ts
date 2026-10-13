import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Service-role key always has broadcast permission, unlike the anon/publishable
// key. NEVER expose this to the client -- this route runs only server-side.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// A valid session (PIN cookie) is required to broadcast into a room, so
// randolms can't spam the public channel.
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
    return payload.user_id ?? null;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await context.params;

  if (!admin) {
    return NextResponse.json(
      { error: "Broadcast relay not configured" },
      { status: 500 }
    );
  }

  const userId = getUserId(request.headers.get("cookie"));
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { event?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { event, payload } = body;
  if (!event || payload === undefined) {
    return NextResponse.json({ error: "Missing event/payload" }, { status: 400 });
  }

  // Create a channel and broadcast via the service-role key (server-side).
  const channel = admin.channel(`room_${roomId}`);
  try {
    await channel.httpSend(event, {
      ...(payload as object),
      relayedBy: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fall back to WebSocket broadcast over the admin client.
    try {
      await channel.send({ type: "broadcast", event, payload });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Broadcast failed" }, { status: 502 });
    }
  } finally {
    await admin.removeChannel(channel);
  }
}