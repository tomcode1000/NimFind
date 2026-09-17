import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError, readJson } from "../lib/http";
import { verifySignedMessage } from "../lib/nimiq";
import { createSessionToken, randomCode, readSessionToken } from "../lib/security";
import type { MiddlewareHandler } from "hono";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const auth = new Hono<AppEnv>();

auth.post("/challenge", async (c) => {
  const now = c.var.now;
  const nonce = randomCode(16);
  const expiresAt = now + CHALLENGE_TTL_MS;
  // This exact text is shown to the user in Nimiq Pay's signing prompt. It names no wallet:
  // Nimiq Pay may sign with any account the user holds, and the signer becomes the identity.
  const message = [
    "Sign in to NimFind",
    "",
    "This proves you own this wallet. It does not move any funds.",
    "",
    `Code: ${nonce}`,
    `Valid until: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now - CHALLENGE_TTL_MS),
    c.env.DB.prepare("INSERT INTO auth_challenges (nonce, message, expires_at) VALUES (?, ?, ?)").bind(
      nonce,
      message,
      expiresAt,
    ),
  ]);

  return c.json({ nonce, message, expiresAt });
});

auth.post("/verify", async (c) => {
  const body = await readJson(c);
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const publicKey = typeof body.publicKey === "string" ? body.publicKey : "";
  const signature = typeof body.signature === "string" ? body.signature : "";

  const challenge = await c.env.DB.prepare("SELECT message, expires_at, used_at FROM auth_challenges WHERE nonce = ?")
    .bind(nonce)
    .first<{ message: string; expires_at: number; used_at: number | null }>();

  if (!challenge || challenge.used_at !== null || challenge.expires_at < c.var.now) {
    throw new HttpError(401, "challenge_invalid", "This sign in request has expired. Please try again.");
  }

  const signer = verifySignedMessage({ message: challenge.message, publicKeyHex: publicKey, signatureHex: signature });
  if (!signer) {
    throw new HttpError(401, "signature_invalid", "The wallet signature could not be verified.");
  }

  const consumed = await c.env.DB.prepare("UPDATE auth_challenges SET used_at = ? WHERE nonce = ? AND used_at IS NULL")
    .bind(c.var.now, nonce)
    .run();
  if (consumed.meta.changes !== 1) {
    throw new HttpError(401, "challenge_invalid", "This sign in request was already used.");
  }

  await c.env.DB.prepare(
    `INSERT INTO users (address, public_key, created_at) VALUES (?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET public_key = excluded.public_key`,
  )
    .bind(signer, publicKey.toLowerCase(), c.var.now)
    .run();

  const token = await createSessionToken(signer, c.env.SESSION_SECRET, SESSION_TTL_SECONDS, c.var.now);
  return c.json({ token, address: signer });
});

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const address = token ? await readSessionToken(token, c.env.SESSION_SECRET, c.var.now) : null;
  if (!address) throw new HttpError(401, "unauthorized", "Please sign in with your wallet.");
  c.set("address", address);
  await next();
};
