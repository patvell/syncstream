const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz"; // no 0/O/1/l/I

/** Generate a short, URL-safe room code (e.g. "K7qP3mXw"). */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}
