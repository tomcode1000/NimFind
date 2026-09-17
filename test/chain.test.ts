import { describe, expect, it } from "vitest";
import { createRpcChain } from "../src/lib/chain";

describe("Nimiq RPC client", () => {
  it("gives up on a node that does not answer and uses the next one", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push(url);
      if (url.includes("slow")) {
        // Never answers on its own; only the abort signal ends the request.
        return new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      return new Response(JSON.stringify({ result: { data: { balance: 42 } } }), { status: 200 });
    }) as unknown as typeof fetch;

    const chain = createRpcChain(["https://slow.example", "https://fast.example"], fakeFetch, 50);
    const started = Date.now();
    expect(await chain.getBalance("NQ00")).toBe(42);
    expect(calls).toEqual(["https://slow.example", "https://fast.example"]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("reports an error when every node fails", async () => {
    const failing = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    await expect(createRpcChain(["https://a.example", "https://b.example"], failing, 50).getBalance("NQ00")).rejects.toThrow();
  });
});
