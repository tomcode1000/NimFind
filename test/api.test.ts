import { Hash, KeyPair } from "@nimiq/core";
import { describe, expect, it } from "vitest";
import { encodeSignedMessage } from "../src/lib/nimiq";
import { createHarness, newAddress } from "./helpers";

describe("sign in", () => {
  it("issues a session for a valid Nimiq Pay signature", async () => {
    const { call, signIn } = createHarness();
    const { address, token } = await signIn();
    expect(token).toBeTruthy();

    const list = await call("GET", "/api/tags", { token });
    expect(list.status).toBe(200);
    expect(list.json.tags).toEqual([]);
    expect(address).toMatch(/^NQ\d{2}/);
  });

  it("rejects reusing a challenge", async () => {
    const { call } = createHarness();
    const keyPair = KeyPair.generate();
    const address = keyPair.toAddress().toUserFriendlyAddress();
    const challenge = await call("POST", "/api/auth/challenge", { body: { address } });
    const signature = keyPair.sign(Hash.computeSha256(encodeSignedMessage(challenge.json.message))).toHex();
    const body = { nonce: challenge.json.nonce, publicKey: keyPair.publicKey.toHex(), signature };

    expect((await call("POST", "/api/auth/verify", { body })).status).toBe(200);
    expect((await call("POST", "/api/auth/verify", { body })).status).toBe(401);
  });

  it("signs in as whichever wallet account actually signed", async () => {
    const { call } = createHarness();
    const signingAccount = KeyPair.generate();
    const challenge = await call("POST", "/api/auth/challenge", { body: {} });
    expect(challenge.json.message).not.toMatch(/NQ\d{2}/);
    const signature = signingAccount.sign(Hash.computeSha256(encodeSignedMessage(challenge.json.message))).toHex();

    const result = await call("POST", "/api/auth/verify", {
      body: { nonce: challenge.json.nonce, publicKey: signingAccount.publicKey.toHex(), signature },
    });
    expect(result.status).toBe(200);
    expect(result.json.address).toBe(signingAccount.toAddress().toUserFriendlyAddress());
  });

  it("rejects a public key that did not make the signature", async () => {
    const { call } = createHarness();
    const signer = KeyPair.generate();
    const impostor = KeyPair.generate();
    const challenge = await call("POST", "/api/auth/challenge", { body: {} });
    const signature = signer.sign(Hash.computeSha256(encodeSignedMessage(challenge.json.message))).toHex();

    const result = await call("POST", "/api/auth/verify", {
      body: { nonce: challenge.json.nonce, publicKey: impostor.publicKey.toHex(), signature },
    });
    expect(result.status).toBe(401);
  });

  it("rejects an expired challenge", async () => {
    const { call, clock } = createHarness();
    const keyPair = KeyPair.generate();
    const challenge = await call("POST", "/api/auth/challenge", {
      body: { address: keyPair.toAddress().toUserFriendlyAddress() },
    });
    clock.now += 6 * 60 * 1000;
    const signature = keyPair.sign(Hash.computeSha256(encodeSignedMessage(challenge.json.message))).toHex();
    const result = await call("POST", "/api/auth/verify", {
      body: { nonce: challenge.json.nonce, publicKey: keyPair.publicKey.toHex(), signature },
    });
    expect(result.status).toBe(401);
  });

  it("requires a session for owner routes", async () => {
    const { call } = createHarness();
    expect((await call("GET", "/api/tags")).status).toBe(401);
    expect((await call("GET", "/api/tags", { token: "forged.token" })).status).toBe(401);
  });
});

describe("tags", () => {
  it("creates, lists, updates and hides tags from other owners", async () => {
    const { call, signIn } = createHarness();
    const owner = await signIn();
    const stranger = await signIn();

    const created = await call("POST", "/api/tags", {
      token: owner.token,
      body: { kind: "keys", label: "House keys", note: "Blue keyring", rewardNim: 500 },
    });
    expect(created.status).toBe(201);
    expect(created.json.tag).toMatchObject({ kind: "keys", label: "House keys", rewardNim: 500, status: "active" });
    const code = created.json.tag.code as string;
    expect(code).toMatch(/^[a-z2-9]{8}$/);

    const list = await call("GET", "/api/tags", { token: owner.token });
    expect(list.json.tags).toHaveLength(1);

    const updated = await call("PATCH", `/api/tags/${code}`, { token: owner.token, body: { status: "lost", rewardNim: 750 } });
    expect(updated.json.tag).toMatchObject({ status: "lost", rewardNim: 750 });

    expect((await call("GET", `/api/tags/${code}`, { token: stranger.token })).status).toBe(404);
    expect((await call("PATCH", `/api/tags/${code}`, { token: stranger.token, body: { label: "Mine" } })).status).toBe(404);
  });

  it("validates input", async () => {
    const { call, signIn } = createHarness();
    const { token } = await signIn();
    expect((await call("POST", "/api/tags", { token, body: { kind: "car", label: "x" } })).status).toBe(400);
    expect((await call("POST", "/api/tags", { token, body: { kind: "bag", label: "" } })).status).toBe(400);
    expect((await call("POST", "/api/tags", { token, body: { kind: "bag", label: "Bag", rewardNim: -1 } })).status).toBe(400);
  });
});

describe("finding an item and paying the reward", () => {
  async function setup() {
    const harness = createHarness();
    const owner = await harness.signIn();
    const created = await harness.call("POST", "/api/tags", {
      token: owner.token,
      body: { kind: "phone", label: "My phone", rewardNim: 500 },
    });
    return { ...harness, owner, code: created.json.tag.code as string };
  }

  it("shows finders the tag without revealing the owner", async () => {
    const { call, code, owner } = await setup();
    const view = await call("GET", `/api/public/tags/${code}`);
    expect(view.status).toBe(200);
    expect(view.json.tag).toMatchObject({ label: "My phone", rewardNim: 500, markedLost: false });
    expect(JSON.stringify(view.json)).not.toContain(owner.address);
  });

  it("runs the whole conversation and reward flow", async () => {
    const { call, chain, code, owner } = await setup();

    const report = await call("POST", `/api/public/tags/${code}/reports`, {
      body: { message: "Found your phone at the bus stop" },
      headers: { "cf-connecting-ip": "1.1.1.1" },
    });
    expect(report.status).toBe(201);
    const { reportId, finderToken } = report.json;
    const finderHeaders = { "x-finder-token": finderToken };

    // Finder conversation is private to the token holder.
    expect((await call("GET", `/api/public/reports/${reportId}`)).status).toBe(404);
    expect((await call("GET", `/api/public/reports/${reportId}`, { headers: { "x-finder-token": "wrong" } })).status).toBe(404);
    const finderView = await call("GET", `/api/public/reports/${reportId}`, { headers: finderHeaders });
    expect(finderView.json.messages).toHaveLength(1);
    expect(JSON.stringify(finderView.json)).not.toContain(owner.address);

    // Owner sees it in the inbox and replies.
    const inbox = await call("GET", "/api/reports", { token: owner.token });
    expect(inbox.json.reports[0]).toMatchObject({ id: reportId, lastMessage: "Found your phone at the bus stop" });
    await call("POST", `/api/reports/${reportId}/messages`, { token: owner.token, body: { body: "Thank you! Can we meet?" } });
    await call("POST", `/api/public/reports/${reportId}/messages`, { headers: finderHeaders, body: { body: "Yes, 5pm" } });
    const thread = await call("GET", `/api/reports/${reportId}`, { token: owner.token });
    expect(thread.json.messages.map((m: any) => m.sender)).toEqual(["finder", "owner", "finder"]);

    // Reward cannot be prepared until the finder shares an address.
    expect((await call("POST", `/api/reports/${reportId}/reward/prepare`, { token: owner.token })).status).toBe(409);

    const finderAddress = newAddress();
    expect((await call("PUT", `/api/public/reports/${reportId}/finder-address`, { headers: finderHeaders, body: { address: "bad" } })).status).toBe(400);
    const setAddress = await call("PUT", `/api/public/reports/${reportId}/finder-address`, {
      headers: finderHeaders,
      body: { address: finderAddress.replace(/ /g, "") },
    });
    expect(setAddress.json.report.finderAddress).toBe(finderAddress);

    const prepared = await call("POST", `/api/reports/${reportId}/reward/prepare`, { token: owner.token });
    expect(prepared.status).toBe(200);
    expect(prepared.json.payment).toMatchObject({ recipient: finderAddress, valueLuna: 50_000_000 });
    const tagData = prepared.json.payment.data as string;
    // The payment tag is random and not derived from anything the finder can see.
    expect(tagData).toMatch(/^NF:R:[a-z2-9]{20}$/);
    expect(tagData).not.toContain(reportId);
    expect(JSON.stringify((await call("GET", `/api/public/reports/${reportId}`, { headers: finderHeaders })).json)).not.toContain(tagData);

    // The destination is locked while payment is in progress.
    expect((await call("PUT", `/api/public/reports/${reportId}/finder-address`, { headers: finderHeaders, body: { address: newAddress() } })).status).toBe(409);

    // Not on chain yet.
    const pending = await call("POST", `/api/reports/${reportId}/reward/confirm`, { token: owner.token });
    expect(pending.status).toBe(202);

    // Payments that do not match exactly are ignored.
    chain.pay({ from: owner.address, to: finderAddress, valueLuna: 10_000_000, data: tagData });
    chain.pay({ from: finderAddress, to: newAddress(), valueLuna: 50_000_000, data: tagData });
    chain.pay({ from: owner.address, to: finderAddress, valueLuna: 50_000_000, data: "NF:R:other" });
    chain.pay({ from: owner.address, to: finderAddress, valueLuna: 50_000_000, data: tagData, confirmations: 0 });
    // A finder paying themselves, even with the right tag, is not the owner paying.
    chain.pay({ from: finderAddress, to: finderAddress, valueLuna: 50_000_000, data: tagData });
    expect((await call("POST", `/api/reports/${reportId}/reward/confirm`, { token: owner.token })).status).toBe(202);

    const tx = chain.pay({ from: owner.address, to: finderAddress, valueLuna: 50_000_000, data: tagData });
    const confirmed = await call("POST", `/api/reports/${reportId}/reward/confirm`, { token: owner.token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.report).toMatchObject({ status: "returned", rewardStatus: "paid", rewardTxHash: tx.hash, rewardPaidNim: 500 });

    // Finder sees the payment, and public stats count it.
    const final = await call("GET", `/api/public/reports/${reportId}`, { headers: finderHeaders });
    expect(final.json.report).toMatchObject({ rewardStatus: "paid", rewardTxHash: tx.hash });
    const stats = await call("GET", "/api/public/stats");
    expect(stats.json).toEqual({ activeTags: 1, itemsReturned: 1, rewardsPaidNim: 500 });

    expect((await call("POST", `/api/reports/${reportId}/reward/prepare`, { token: owner.token })).status).toBe(409);
  });

  it("accepts a reward paid from another account in the owner's wallet, with a hex encoded tag", async () => {
    const { call, chain, code, owner } = await setup();
    const finderAddress = newAddress();
    const report = await call("POST", `/api/public/tags/${code}/reports`, { body: { message: "Found it", finderAddress } });
    const id = report.json.reportId;
    const prepared = await call("POST", `/api/reports/${id}/reward/prepare`, { token: owner.token });

    const hexTag = Buffer.from(prepared.json.payment.data).toString("hex");
    chain.pay({ from: newAddress(), to: finderAddress, valueLuna: 50_000_000, data: hexTag });

    const confirmed = await call("POST", `/api/reports/${id}/reward/confirm`, { token: owner.token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.report.rewardStatus).toBe("paid");
  });

  it("keeps other owners out of a report", async () => {
    const { call, code, signIn } = await setup();
    const report = await call("POST", `/api/public/tags/${code}/reports`, { body: { message: "Found it" } });
    const stranger = await signIn();
    expect((await call("GET", `/api/reports/${report.json.reportId}`, { token: stranger.token })).status).toBe(404);
  });

  it("rate limits reports from one IP", async () => {
    const { call, code } = await setup();
    const headers = { "cf-connecting-ip": "9.9.9.9" };
    for (let i = 0; i < 10; i++) {
      expect((await call("POST", `/api/public/tags/${code}/reports`, { headers, body: { message: `Report ${i}` } })).status).toBe(201);
    }
    expect((await call("POST", `/api/public/tags/${code}/reports`, { headers, body: { message: "One more" } })).status).toBe(429);
  });

  it("hides archived tags from finders", async () => {
    const { call, code, owner } = await setup();
    await call("PATCH", `/api/tags/${code}`, { token: owner.token, body: { status: "archived" } });
    expect((await call("GET", `/api/public/tags/${code}`)).status).toBe(404);
  });

  it("reports a clear error when the Nimiq network is unreachable", async () => {
    const { call, chain, code, owner } = await setup();
    const report = await call("POST", `/api/public/tags/${code}/reports`, { body: { message: "Found it", finderAddress: newAddress() } });
    const id = report.json.reportId;
    await call("POST", `/api/reports/${id}/reward/prepare`, { token: owner.token });
    chain.failing = true;
    const result = await call("POST", `/api/reports/${id}/reward/confirm`, { token: owner.token });
    expect(result.status).toBe(502);
    expect(result.json.error.code).toBe("chain_unavailable");
  });
});

describe("scans", () => {
  async function ownerWithTag(envOverrides = {}) {
    const harness = createHarness(envOverrides);
    const owner = await harness.signIn();
    const created = await harness.call("POST", "/api/tags", { token: owner.token, body: { kind: "keys", label: "House keys", rewardNim: 500 } });
    return { ...harness, owner, code: created.json.tag.code as string };
  }


  it("records a scan once per visitor and shows it to the owner", async () => {
    const { call, code, owner, clock } = await ownerWithTag();
    const visitor = { "cf-connecting-ip": "5.5.5.5" };
    expect((await call("POST", `/api/public/tags/${code}/scan`, { headers: visitor })).json).toEqual({ recorded: true });
    expect((await call("POST", `/api/public/tags/${code}/scan`, { headers: visitor })).json).toEqual({ recorded: false });
    expect((await call("POST", `/api/public/tags/${code}/scan`, { headers: { "cf-connecting-ip": "6.6.6.6" } })).json).toEqual({ recorded: true });

    const list = await call("GET", "/api/tags", { token: owner.token });
    expect(list.json.tags[0].lastScanAt).toBe(clock.now);
    const detail = await call("GET", `/api/tags/${code}`, { token: owner.token });
    expect(detail.json.tag).toMatchObject({ scanCount: 2, lastScanAt: clock.now });
  });

  it("does not count the owner opening their own tag page", async () => {
    const { call, code, owner } = await ownerWithTag();
    expect((await call("POST", `/api/public/tags/${code}/scan`, { token: owner.token })).json).toEqual({ recorded: false });
    expect((await call("GET", `/api/tags/${code}`, { token: owner.token })).json.tag.scanCount).toBe(0);
  });

  it("does not count link previews, because a plain GET records nothing", async () => {
    const { call, code, owner } = await ownerWithTag();
    await call("GET", `/api/public/tags/${code}`);
    const detail = await call("GET", `/api/tags/${code}`, { token: owner.token });
    expect(detail.json.tag.scanCount).toBe(0);
  });

  it("tells finders whether the reward is covered by the owner's wallet, without revealing it", async () => {
    const h = await ownerWithTag();
    h.chain.balances.set(h.owner.address, 60_000_000);
    const funded = await h.call("GET", `/api/public/tags/${h.code}`);
    expect(funded.json.tag.rewardFunded).toBe(true);
    expect(JSON.stringify(funded.json)).not.toContain(h.owner.address);

    h.chain.balances.set(h.owner.address, 10_000_000);
    expect((await h.call("GET", `/api/public/tags/${h.code}`)).json.tag.rewardFunded).toBe(false);

    h.chain.failing = true;
    expect((await h.call("GET", `/api/public/tags/${h.code}`)).json.tag.rewardFunded).toBeNull();
  });
});

describe("wallpaper links", () => {
  const layout = { design: "midnight", x: 0.07, y: 0.37, contrast: "blend", calendar: false, message: "Scan me" };

  it("signs a layout the owner can open in a normal browser, and rejects edits", async () => {
    const { call, signIn } = createHarness();
    const owner = await signIn();
    const stranger = await signIn();
    const code = (await call("POST", "/api/tags", { token: owner.token, body: { kind: "phone", label: "My phone", rewardNim: 100 } })).json.tag.code;

    const link = await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout } });
    expect(link.status).toBe(201);
    const token = (link.json.path as string).replace("/w/", "");

    const opened = await call("GET", `/api/public/wallpapers/${token}`);
    expect(opened.json.wallpaper).toMatchObject({ code, design: "midnight", x: 0.07, y: 0.37, message: "Scan me" });
    expect(opened.json.tag).toMatchObject({ label: "My phone", kind: "phone" });
    expect(JSON.stringify(opened.json)).not.toContain(owner.address);

    const [body, signature] = token.split(".");
    const edited = Buffer.from(JSON.stringify({ ...opened.json.wallpaper, design: "aurora", exp: 9999999999 })).toString("base64url");
    expect((await call("GET", `/api/public/wallpapers/${edited}.${signature}`)).status).toBe(404);
    expect(body).toBeTruthy();

    expect((await call("POST", "/api/wallpaper-links", { token: stranger.token, body: { code, ...layout } })).status).toBe(404);
  });

  it("requires an active Designer Pass for designer backgrounds and the calendar", async () => {
    const treasury = newAddress();
    const { call, chain, signIn } = createHarness({ TREASURY_ADDRESS: treasury });
    const owner = await signIn();
    const code = (await call("POST", "/api/tags", { token: owner.token, body: { kind: "keys", label: "Keys" } })).json.tag.code;

    expect((await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout } })).status).toBe(201);
    expect((await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout, design: "photo" } })).status).toBe(201);
    expect((await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout, design: "aurora" } })).status).toBe(403);
    expect((await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout, calendar: true } })).status).toBe(403);

    const prepared = await call("POST", "/api/pass/prepare", { token: owner.token });
    chain.pay({ from: owner.address, to: treasury, valueLuna: prepared.json.payment.valueLuna, data: prepared.json.payment.data });
    await call("POST", "/api/pass/confirm", { token: owner.token });
    expect((await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout, design: "aurora" } })).status).toBe(201);
  });

  it("expires after seven days", async () => {
    const { call, signIn, clock } = createHarness();
    const owner = await signIn();
    const code = (await call("POST", "/api/tags", { token: owner.token, body: { kind: "bag", label: "Bag" } })).json.tag.code;
    const token = (await call("POST", "/api/wallpaper-links", { token: owner.token, body: { code, ...layout } })).json.path.replace("/w/", "");
    clock.now += 8 * 24 * 60 * 60 * 1000;
    expect((await call("GET", `/api/public/wallpapers/${token}`)).status).toBe(404);
  });
});

describe("designer pass", () => {
  it("is unavailable until a treasury address is configured", async () => {
    const { call, signIn } = createHarness();
    const { token } = await signIn();
    expect((await call("POST", "/api/pass/prepare", { token })).status).toBe(503);
  });

  it("activates after the matching NIM payment reaches the treasury", async () => {
    const treasury = newAddress();
    const { call, chain, signIn, clock } = createHarness({ TREASURY_ADDRESS: treasury, PASS_PRICE_NIM: "1000" });
    const buyer = await signIn();

    const before = await call("GET", "/api/pass", { token: buyer.token });
    expect(before.json).toMatchObject({ period: "2026-09", priceNim: 1000, active: false });

    const prepared = await call("POST", "/api/pass/prepare", { token: buyer.token });
    expect(prepared.json.payment).toMatchObject({ recipient: treasury, valueLuna: 100_000_000 });
    const again = await call("POST", "/api/pass/prepare", { token: buyer.token });
    expect(again.json.payment.data).toBe(prepared.json.payment.data);

    expect((await call("POST", "/api/pass/confirm", { token: buyer.token })).status).toBe(202);

    chain.pay({ from: buyer.address, to: treasury, valueLuna: 100_000_000, data: prepared.json.payment.data });
    const confirmed = await call("POST", "/api/pass/confirm", { token: buyer.token });
    expect(confirmed.json).toMatchObject({ period: "2026-09", active: true });

    expect((await call("POST", "/api/pass/prepare", { token: buyer.token })).status).toBe(409);

    // A new month needs a new pass.
    clock.now = Date.UTC(2026, 9, 1, 0, 0, 1);
    const nextMonth = await call("GET", "/api/pass", { token: buyer.token });
    expect(nextMonth.json).toMatchObject({ period: "2026-10", active: false });
  });
});

describe("configuration", () => {
  it("picks RPC nodes for the configured network", async () => {
    const { rpcUrls } = await import("../src/app");
    const base = createHarness().env;
    expect(rpcUrls({ ...base, NIMIQ_NETWORK: "testnet" })[0]).toContain("testnet");
    expect(rpcUrls({ ...base, NIMIQ_NETWORK: "mainnet" })[0]).not.toContain("testnet");
    expect(rpcUrls({ ...base, NIMIQ_NETWORK: undefined })[0]).not.toContain("testnet");
    expect(rpcUrls({ ...base, RPC_URLS: "https://example.test" })).toEqual(["https://example.test"]);
  });

  it("exposes public app configuration", async () => {
    const { call } = createHarness({ NIMIQ_NETWORK: "testnet", TREASURY_ADDRESS: newAddress(), PASS_PRICE_NIM: "250" });
    const config = await call("GET", "/api/config");
    expect(config.json).toEqual({ network: "testnet", passPriceNim: 250, passAvailable: true });
  });

  it("refuses to run without a strong session secret", async () => {
    const { call } = createHarness({ SESSION_SECRET: "short" });
    expect((await call("GET", "/api/health")).status).toBe(503);
  });
});
