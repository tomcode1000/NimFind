import type { TagKind } from "./api";

export const KIND_LABELS: Record<TagKind, string> = {
  phone: "Phone",
  keys: "Keys",
  bag: "Bag",
  wallet: "Wallet",
  laptop: "Laptop",
  other: "Something else",
};

export function formatNim(value: number): string {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)} NIM`;
}

export function shortAddress(address: string): string {
  const parts = address.split(" ");
  return parts.length > 2 ? `${parts[0]} ${parts[1]} … ${parts.at(-1)}` : address;
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function tagUrl(code: string): string {
  return `${location.origin}/t/${code}`;
}

export function explorerTxUrl(hash: string, network: "mainnet" | "testnet"): string {
  return network === "testnet" ? `https://testnet.nimiqscan.com/tx/${hash}` : `https://nimiqscan.com/tx/${hash}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
