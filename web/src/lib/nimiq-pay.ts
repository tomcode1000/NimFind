import { init, type NimiqProvider } from "@nimiq/mini-app-sdk";

let providerPromise: Promise<NimiqProvider> | null = null;

/** True when the page runs inside Nimiq Pay, which injects its host context before scripts load. */
export function insideNimiqPay(): boolean {
  return typeof window !== "undefined" && (Boolean(window.nimiqPay) || Boolean(window.nimiq));
}

export class WalletError extends Error {
  constructor(
    readonly kind: "not_in_nimiq_pay" | "cancelled" | "failed",
    message: string,
  ) {
    super(message);
  }
}

async function provider(): Promise<NimiqProvider> {
  if (!insideNimiqPay()) {
    throw new WalletError("not_in_nimiq_pay", "Open NimFind inside Nimiq Pay to use your wallet.");
  }
  providerPromise ??= init({ timeout: 10_000 }).catch((error) => {
    providerPromise = null;
    throw error;
  });
  return providerPromise;
}

// Provider calls either throw or resolve with { error }. Both are normalized here, and a user
// cancelling the confirmation dialog is treated as a normal outcome, not a failure.
function unwrap<T>(result: T | { error: { type: string; message: string } }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw toWalletError(result.error);
  }
  return result as T;
}

function toWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  const text = `${(error as { type?: string })?.type ?? ""} ${(error as Error)?.message ?? error}`.toLowerCase();
  if (/denied|reject|cancel|abort|declin/.test(text)) {
    return new WalletError("cancelled", "You cancelled the request in Nimiq Pay.");
  }
  return new WalletError("failed", "Nimiq Pay could not complete the request. Please try again.");
}

export async function firstAccount(): Promise<string | null> {
  try {
    const accounts = unwrap(await (await provider()).listAccounts());
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

export async function signMessage(message: string) {
  try {
    return unwrap(await (await provider()).sign(message));
  } catch (error) {
    throw toWalletError(error);
  }
}

/** Sends NIM with the data tag the server uses to find the payment on chain. */
export async function payWithData(payment: { recipient: string; valueLuna: number; data: string }) {
  try {
    return unwrap(
      await (await provider()).sendBasicTransactionWithData({
        recipient: payment.recipient,
        value: payment.valueLuna,
        data: payment.data,
      }),
    );
  } catch (error) {
    throw toWalletError(error);
  }
}
