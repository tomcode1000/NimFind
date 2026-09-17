// End to end check against a running Worker: node scripts/smoke.mjs http://127.0.0.1:8787
// Uses a throwaway Nimiq key, and the real Nimiq network for the payment lookup.
import { Hash, KeyPair } from "@nimiq/core";

const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const encoder = new TextEncoder();

async function call(method, path, { body, token, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json() };
}

function expectStatus(label, result, status) {
  const ok = result.status === status;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${result.status})`);
  if (!ok) {
    console.log(JSON.stringify(result.json));
    process.exitCode = 1;
  }
  return result.json;
}

function signedMessage(message) {
  const bytes = encoder.encode(message);
  const prefix = encoder.encode(`\x16Nimiq Signed Message:\n${bytes.byteLength}`);
  const payload = new Uint8Array(prefix.byteLength + bytes.byteLength);
  payload.set(prefix);
  payload.set(bytes, prefix.byteLength);
  return payload;
}

const owner = KeyPair.generate();
const ownerAddress = owner.toAddress().toUserFriendlyAddress();

expectStatus("health", await call("GET", "/api/health"), 200);

const challenge = expectStatus("challenge", await call("POST", "/api/auth/challenge", { body: { address: ownerAddress } }), 200);
const signature = owner.sign(Hash.computeSha256(signedMessage(challenge.message))).toHex();
const session = expectStatus(
  "verify signature",
  await call("POST", "/api/auth/verify", { body: { nonce: challenge.nonce, publicKey: owner.publicKey.toHex(), signature } }),
  200,
);
const token = session.token;

const { tag } = expectStatus(
  "create tag",
  await call("POST", "/api/tags", { token, body: { kind: "phone", label: "Smoke test phone", rewardNim: 1 } }),
  201,
);
expectStatus("public tag view", await call("GET", `/api/public/tags/${tag.code}`), 200);

const report = expectStatus(
  "finder report",
  await call("POST", `/api/public/tags/${tag.code}/reports`, { body: { message: "Found it" } }),
  201,
);
const finderHeaders = { "x-finder-token": report.finderToken };
expectStatus(
  "finder shares address",
  await call("PUT", `/api/public/reports/${report.reportId}/finder-address`, {
    headers: finderHeaders,
    body: { address: KeyPair.generate().toAddress().toUserFriendlyAddress() },
  }),
  200,
);
expectStatus("owner prepares reward", await call("POST", `/api/reports/${report.reportId}/reward/prepare`, { token }), 200);
expectStatus(
  "reward lookup on Nimiq mainnet (nothing paid, so pending)",
  await call("POST", `/api/reports/${report.reportId}/reward/confirm`, { token }),
  202,
);
expectStatus("public stats", await call("GET", "/api/public/stats"), 200);
