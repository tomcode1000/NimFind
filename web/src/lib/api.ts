export type TagKind = "phone" | "keys" | "bag" | "wallet" | "laptop" | "other";
export type TagStatus = "active" | "lost" | "archived";

export interface Tag {
  code: string;
  kind: TagKind;
  label: string;
  note: string | null;
  rewardNim: number;
  status: TagStatus;
  createdAt: number;
  updatedAt: number;
  openReports?: number;
  lastScanAt?: number | null;
  scanCount?: number;
}

export interface PublicTag {
  code: string;
  kind: TagKind;
  label: string;
  note: string | null;
  rewardNim: number;
  markedLost: boolean;
  /** Whether the owner's wallet holds the reward right now; null when it could not be checked. */
  rewardFunded: boolean | null;
}

export interface Report {
  id: string;
  tagCode: string;
  status: "open" | "returned" | "closed";
  finderAddress: string | null;
  rewardNim: number;
  rewardStatus: "none" | "awaiting_payment" | "paid";
  rewardTxHash: string | null;
  rewardPaidNim: number | null;
  rewardPaidAt: number | null;
  createdAt: number;
  updatedAt: number;
  tag?: { label: string; kind: TagKind };
  lastMessage?: string | null;
}

export interface Message {
  id: string;
  sender: "owner" | "finder";
  body: string;
  createdAt: number;
}

export interface PaymentRequest {
  recipient: string;
  valueLuna: number;
  data: string;
}

export interface WallpaperLinkOptions {
  design: string;
  filter: string;
  x: number;
  y: number;
  contrast: "blend" | "strong";
  calendar: boolean;
  message: string;
}

export interface AppConfig {
  network: "mainnet" | "testnet";
  wallpaperPriceNim: number;
  paymentsAvailable: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  body?: unknown;
  token?: string | null;
  finderToken?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [600, 1800];
/** Gateways answer with these while the app itself never ran, so the same request is safe to send again. */
const RETRYABLE = new Set([0, 502, 503, 504]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt<T>(method: string, path: string, options: RequestOptions): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.finderToken) headers["x-finder-token"] = options.finderToken;

  // A phone on a weak connection can leave a request hanging; give it a firm limit instead.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "offline", "The connection dropped. Check your internet and try again.");
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (data as { error?: { code: string; message: string } }).error;
    const fallback = response.status >= 500 ? "The server did not answer. Please try again." : "Something went wrong.";
    throw new ApiError(response.status, error?.code ?? "unknown", error?.message ?? fallback);
  }
  return { status: response.status, data: data as T };
}

/**
 * Sends the request, and quietly sends it again when the network or a gateway drops it.
 * Anything the server actually answered, including its errors, is passed straight through.
 */
async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<{ status: number; data: T }> {
  for (let tries = 0; ; tries++) {
    try {
      return await attempt<T>(method, path, options);
    } catch (error) {
      const retryable = error instanceof ApiError && RETRYABLE.has(error.status);
      if (!retryable || tries >= RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[tries]);
    }
  }
}

const get = <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options).then((r) => r.data);

export const api = {
  config: () => get<AppConfig>("/api/config"),
  stats: () => get<{ activeTags: number; itemsReturned: number; rewardsPaidNim: number }>("/api/public/stats"),

  challenge: () => request<{ nonce: string; message: string }>("POST", "/api/auth/challenge", { body: {} }).then((r) => r.data),
  verify: (body: { nonce: string; publicKey: string; signature: string }) =>
    request<{ token: string; address: string }>("POST", "/api/auth/verify", { body }).then((r) => r.data),

  tags: (token: string) => get<{ tags: Tag[] }>("/api/tags", { token }).then((d) => d.tags),
  tag: (token: string, code: string) => get<{ tag: Tag; reports: Report[] }>(`/api/tags/${code}`, { token }),
  createTag: (token: string, body: { kind: TagKind; label: string; note?: string; rewardNim: number }) =>
    request<{ tag: Tag }>("POST", "/api/tags", { token, body }).then((r) => r.data.tag),
  updateTag: (token: string, code: string, body: Partial<Pick<Tag, "label" | "note" | "rewardNim" | "status" | "kind">>) =>
    request<{ tag: Tag }>("PATCH", `/api/tags/${code}`, { token, body }).then((r) => r.data.tag),

  inbox: (token: string) => get<{ reports: Report[] }>("/api/reports", { token }).then((d) => d.reports),
  ownerReport: (token: string, id: string) => get<{ report: Report; messages: Message[] }>(`/api/reports/${id}`, { token }),
  ownerMessage: (token: string, id: string, body: string) =>
    request<{ message: Message }>("POST", `/api/reports/${id}/messages`, { token, body: { body } }).then((r) => r.data.message),
  setReportStatus: (token: string, id: string, status: Report["status"]) =>
    request<{ report: Report }>("POST", `/api/reports/${id}/status`, { token, body: { status } }).then((r) => r.data.report),
  prepareReward: (token: string, id: string, amountNim?: number) =>
    request<{ payment: PaymentRequest }>("POST", `/api/reports/${id}/reward/prepare`, {
      token,
      body: amountNim === undefined ? {} : { amountNim },
    }).then((r) => r.data.payment),
  confirmReward: (token: string, id: string) =>
    request<{ report: Report; pending?: boolean }>("POST", `/api/reports/${id}/reward/confirm`, { token }),

  wallpaperCredits: (token: string) => get<{ priceNim: number; available: boolean; credits: number }>("/api/wallpaper-purchases", { token }),
  prepareWallpaperPayment: (token: string) =>
    request<{ payment: PaymentRequest }>("POST", "/api/wallpaper-purchases/prepare", { token }).then((r) => r.data.payment),
  confirmWallpaperPayment: (token: string) =>
    request<{ paid: boolean; pending?: boolean; credits: number; txHash?: string }>("POST", "/api/wallpaper-purchases/confirm", { token }),

  savedWallpaper: (token: string, code: string) =>
    get<{ wallpaper: (WallpaperLinkOptions & { paid: boolean; savedAt: number }) | null }>(`/api/wallpaper-links/${code}`, { token }),
  createWallpaperLink: (token: string, body: WallpaperLinkOptions & { code: string }) =>
    request<{ path: string }>("POST", "/api/wallpaper-links", { token, body }).then((r) => r.data.path),
  publicWallpaper: (linkToken: string) =>
    get<{ tag: PublicTag; wallpaper: WallpaperLinkOptions & { code: string } }>(`/api/public/wallpapers/${linkToken}`),
  recordScan: (code: string, token?: string | null) => request("POST", `/api/public/tags/${code}/scan`, { token }),

  publicTag: (code: string) => get<{ tag: PublicTag }>(`/api/public/tags/${code}`).then((d) => d.tag),
  openReport: (code: string, body: { message: string; finderAddress?: string }) =>
    request<{ reportId: string; finderToken: string; rewardNim: number }>("POST", `/api/public/tags/${code}/reports`, { body }).then(
      (r) => r.data,
    ),
  finderReport: (id: string, finderToken: string) =>
    get<{ report: Report; messages: Message[] }>(`/api/public/reports/${id}`, { finderToken }),
  finderMessage: (id: string, finderToken: string, body: string) =>
    request<{ message: Message }>("POST", `/api/public/reports/${id}/messages`, { finderToken, body: { body } }).then(
      (r) => r.data.message,
    ),
  setFinderAddress: (id: string, finderToken: string, address: string) =>
    request<{ report: Report }>("PUT", `/api/public/reports/${id}/finder-address`, { finderToken, body: { address } }).then(
      (r) => r.data.report,
    ),
};
