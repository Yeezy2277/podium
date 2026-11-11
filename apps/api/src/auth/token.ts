import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal signed session token: `userId.expiresAtMs.signature`. Enough for a
 * demo back office with "sign in as" buttons; a real deployment would put an
 * identity provider in front and keep the same Actor resolution behind it.
 */
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function issueToken(userId: string, secret: string, ttlMs = 8 * 60 * 60 * 1000, now = Date.now()): string {
  const payload = `${userId}.${now + ttlMs}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${userId}.${exp}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!(Number(exp) > now)) return null;
  return userId;
}
