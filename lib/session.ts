/**
 * Shared session helpers.
 * The app_session cookie holds a signed JWT that includes a stable user_id
 * derived from the PIN. This lets the same PIN map to the same user across
 * all devices (phone, TV, laptop, iPad).
 */

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url decode
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Read user_id from the app_session cookie (client-side). */
export function getUserIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith("app_session="));
  if (!cookie) return null;
  const token = cookie.split("=", 2)[1];
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return payload.user_id as string | null;
}