const encoder = new TextEncoder();

// Lowercase, without lookalikes (0/o, 1/l/i), so short codes are easy to type from a sticker.
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function randomCode(length: number): string {
  // Reject bytes past the last full multiple of the alphabet size to avoid modulo bias.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface SessionPayload {
  sub: string;
  exp: number;
}

export async function createSessionToken(address: string, secret: string, ttlSeconds: number, now = Date.now()) {
  const payload: SessionPayload = { sub: address, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(secret, body);
  return `${body}.${signature}`;
}

export async function readSessionToken(token: string, secret: string, now = Date.now()): Promise<string | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(secret, body);
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.sub !== "string" || payload.exp * 1000 < now) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Signs a small JSON payload so it can travel in a URL and be trusted when it comes back. */
export async function signPayload(payload: object, secret: string, ttlSeconds: number, now = Date.now()): Promise<string> {
  const body = base64Url(encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds })));
  return `${body}.${await hmac(`payload:${secret}`, body)}`;
}

export async function readPayload<T>(token: string, secret: string, now = Date.now()): Promise<T | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  if (!constantTimeEqual(signature, await hmac(`payload:${secret}`, body))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T & { exp: number };
    return payload.exp * 1000 < now ? null : payload;
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
