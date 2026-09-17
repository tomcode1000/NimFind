import { normalizeAddress, textToHex } from "./nimiq";

export interface ChainTransaction {
  hash: string;
  from: string;
  to: string;
  value: number;
  senderData: string;
  recipientData: string;
  confirmations: number;
  timestamp: number;
  executionResult?: boolean;
}

export interface Chain {
  getTransactionsByAddress(address: string, max: number): Promise<ChainTransaction[]>;
  /** Balance in Luna. */
  getBalance(address: string): Promise<number>;
}

export interface PaymentQuery {
  to: string;
  minValueLuna: number;
  /** Single use, unguessable tag created for this payment. */
  data: string;
}

/**
 * Finds a confirmed payment matching recipient, minimum value and data tag.
 *
 * The sender is deliberately not checked: Nimiq Pay may pay from a different account in
 * the same wallet than the one used to sign in. The unique data tag is what binds the
 * payment to its record.
 */
export function findPayment(
  transactions: ChainTransaction[],
  query: PaymentQuery,
): ChainTransaction | undefined {
  const to = normalizeAddress(query.to);
  const accepted = acceptedDataHex(query.data);

  return transactions.find(
    (tx) =>
      tx.executionResult !== false &&
      tx.confirmations > 0 &&
      normalizeAddress(tx.to) === to &&
      // A payment to yourself is never a payment from someone else.
      normalizeAddress(tx.from) !== to &&
      tx.value >= query.minValueLuna &&
      (accepted.has(tx.recipientData?.toLowerCase()) || accepted.has(tx.senderData?.toLowerCase())),
  );
}

// The RPC returns data as hex of the raw bytes. A wallet may store the tag as UTF-8 text,
// or hex encode it first, so both encodings are accepted.
function acceptedDataHex(data: string): Set<string> {
  const textHex = textToHex(data).toLowerCase();
  return new Set([textHex, textToHex(textHex).toLowerCase()]);
}

/**
 * JSON-RPC client that tries each public node in order until one answers. Each node gets a
 * few seconds, so a slow or unreachable node never leaves a finder waiting on a spinner.
 */
export function createRpcChain(urls: string[], fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Chain {
  async function call<T>(method: string, params: unknown[]): Promise<T> {
    let lastError: unknown;
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`RPC ${url} responded ${response.status}`);
        const body = (await response.json()) as { result?: { data: T }; error?: { message: string } };
        if (body.error) throw new Error(`RPC ${url} error: ${body.error.message}`);
        if (!body.result) throw new Error(`RPC ${url} returned no result`);
        return body.result.data;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No RPC node available");
  }

  return {
    getTransactionsByAddress: (address, max) =>
      call<ChainTransaction[]>("getTransactionsByAddress", [address, max, null]),
    getBalance: async (address) => (await call<{ balance: number }>("getAccountByAddress", [address])).balance,
  };
}
