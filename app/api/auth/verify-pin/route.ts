import { NextResponse } from "next/server";

// Production requires explicit env vars. The dev fallback is ONLY used when
// NODE_ENV !== 'production', so a bad deploy can never silently use weak creds.
const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? "" : "syncstream-dev-secret");
const APP_PIN = process.env.APP_PIN || (isProd ? "" : "1234");

function base64UrlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createJWT(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(JWT_SECRET);

  const header = { alg: "HS256", typ: "JWT" };
  const base64Header = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const base64Payload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const signingInput = `${base64Header}.${base64Payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    secretKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput)
  );

  const base64Signature = base64UrlEncode(signature);

  return `${signingInput}.${base64Signature}`;
}

/**
 * Derive a stable user_id from the PIN.
 * The same PIN always resolves to the same identity across all devices.
 */
async function deriveUserId(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(`${JWT_SECRET}::pin-user::${pin}`);
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const hash = await crypto.subtle.sign("HMAC", key, encoder.encode(pin));
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // 32 hex chars -- compact, URL-safe, deterministic
  return `u_${hex.slice(0, 32)}`;
}

export async function POST(request: Request) {
  // Fail closed in production if required env vars are missing
  if (isProd && (!JWT_SECRET || !APP_PIN)) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing auth env vars" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string" || pin.length !== 4) {
      return NextResponse.json(
        { error: "Invalid PIN format" },
        { status: 400 }
      );
    }

    if (pin !== APP_PIN) {
      return NextResponse.json(
        { error: "Incorrect PIN" },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const userId = await deriveUserId(pin);
    const token = await createJWT({
      authenticated: true,
      user_id: userId,
      iat: now,
      exp: now + 60 * 60 * 24 * 365, // 1 year
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set("app_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}