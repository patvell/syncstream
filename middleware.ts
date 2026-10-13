import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";
// In production the secret MUST come from env; an empty secret fails verification.
const JWT_SECRET =
  process.env.JWT_SECRET || (isProd ? "" : "syncstream-dev-secret");
const PUBLIC_PATHS = ["/login", "/api/auth/verify-pin"];

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;

    // Verify signature with HMAC-SHA256 using the JWT secret
    const encoder = new TextEncoder();
    const signingInput = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput))
    );

    const received = new Uint8Array(
      Array.from(base64UrlDecode(parts[2])).map((c) => c.charCodeAt(0))
    );

    if (expected.length !== received.length) return null;
    let same = true;
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== received[i]) {
        same = false;
        break;
      }
    }
    if (!same) return null;

    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fail closed: in production, if JWT_SECRET is unset, block protected routes
  if (isProd && !process.env.JWT_SECRET) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/placeholder-poster.svg") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // Check for valid session cookie
  const sessionCookie = request.cookies.get("app_session");

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify JWT signature + expiry
  const payload = await verifyJWT(sessionCookie.value);

  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("app_session");
    return response;
  }

  // Attach user_id header for downstream server code
  const response = NextResponse.next();
  if (payload.user_id) {
    response.headers.set("x-syncstream-user-id", String(payload.user_id));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};