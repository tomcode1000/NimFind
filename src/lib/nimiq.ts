import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export const LUNA_PER_NIM = 100_000;

// Nimiq's base32 alphabet drops I, O, W and Z to avoid lookalike characters.
const ADDRESS_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";
const SIGNED_MESSAGE_PREFIX = "\x16Nimiq Signed Message:\n";
const encoder = new TextEncoder();

export function addressFromPublicKey(publicKey: Uint8Array): string {
  const addressBytes = blake2b(publicKey, { dkLen: 32 }).slice(0, 20);
  return formatAddress(addressBytes);
}

export function formatAddress(addressBytes: Uint8Array): string {
  const body = toBase32(addressBytes);
  const check = String(98 - ibanMod97(`${body}NQ00`)).padStart(2, "0");
  return `NQ${check}${body}`.match(/.{4}/g)!.join(" ");
}

/** Returns the canonical spaced form, or null when the input is not a valid address. */
export function normalizeAddress(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.replace(/\s+/g, "").toUpperCase();
  if (!/^NQ[0-9]{2}[0-9A-HJ-NP-VXY]{32}$/.test(compact)) return null;
  if (ibanMod97(compact.slice(4) + compact.slice(0, 4)) !== 1) return null;
  return compact.match(/.{4}/g)!.join(" ");
}

export function encodeSignedMessage(message: string): Uint8Array {
  const messageBytes = encoder.encode(message);
  const prefixBytes = encoder.encode(`${SIGNED_MESSAGE_PREFIX}${messageBytes.byteLength}`);
  const payload = new Uint8Array(prefixBytes.byteLength + messageBytes.byteLength);
  payload.set(prefixBytes);
  payload.set(messageBytes, prefixBytes.byteLength);
  return payload;
}

/**
 * Verifies a signature produced by Nimiq Pay's `sign()`: an Ed25519 signature over
 * SHA-256 of the prefixed message. Returns the signer's address when valid.
 */
export function verifySignedMessage(input: {
  message: string;
  publicKeyHex: string;
  signatureHex: string;
}): string | null {
  if (!isHex(input.publicKeyHex, 64) || !isHex(input.signatureHex, 128)) return null;
  try {
    const publicKey = hexToBytes(input.publicKeyHex);
    const digest = sha256(encodeSignedMessage(input.message));
    const valid = ed25519.verify(hexToBytes(input.signatureHex), digest, publicKey);
    return valid ? addressFromPublicKey(publicKey) : null;
  } catch {
    return null;
  }
}

export function nimToLuna(nim: number): number {
  return Math.round(nim * LUNA_PER_NIM);
}

export function lunaToNim(luna: number): number {
  return luna / LUNA_PER_NIM;
}

export function textToHex(text: string): string {
  return bytesToHex(encoder.encode(text));
}

function isHex(value: string, length: number): boolean {
  return typeof value === "string" && value.length === length && /^[0-9a-fA-F]+$/.test(value);
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ADDRESS_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ADDRESS_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function ibanMod97(input: string): number {
  const digits = input
    .toUpperCase()
    .split("")
    .map((char) => parseInt(char, 36).toString())
    .join("");
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 6) {
    remainder = parseInt(`${remainder}${digits.slice(i, i + 6)}`, 10) % 97;
  }
  return remainder;
}
