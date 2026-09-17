import type { Context } from "hono";
import { nimToLuna } from "./nimiq";

const MAX_BODY_BYTES = 16_000;
const MAX_REWARD_NIM = 10_000_000;

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 502 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson(c: Context): Promise<Record<string, unknown>> {
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "Request body is too large.");
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "Request body is too large.");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to the error below.
  }
  throw new HttpError(400, "invalid_json", "Request body must be a JSON object.");
}

export function requireText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new HttpError(400, "invalid_input", `${field} is required.`);
  if (text.length > max) throw new HttpError(400, "invalid_input", `${field} must be at most ${max} characters.`);
  return text;
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireText(value, field, max);
}

export function rewardLuna(value: unknown, field = "Reward"): number {
  const nim = typeof value === "string" ? Number(value) : value;
  if (typeof nim !== "number" || !Number.isFinite(nim) || nim < 0 || nim > MAX_REWARD_NIM) {
    throw new HttpError(400, "invalid_input", `${field} must be between 0 and ${MAX_REWARD_NIM} NIM.`);
  }
  return nimToLuna(nim);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new HttpError(400, "invalid_input", `${field} must be one of: ${allowed.join(", ")}.`);
}
