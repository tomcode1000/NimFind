import { Hash, KeyPair } from "@nimiq/core";
import { describe, expect, it } from "vitest";
import {
  addressFromPublicKey,
  encodeSignedMessage,
  lunaToNim,
  nimToLuna,
  normalizeAddress,
  verifySignedMessage,
} from "../src/lib/nimiq";

// Cross-checks our lightweight implementation against Nimiq's official core library.
describe("nimiq primitives", () => {
  it("derives the same address as @nimiq/core", () => {
    for (let i = 0; i < 25; i++) {
      const keyPair = KeyPair.generate();
      const expected = keyPair.toAddress().toUserFriendlyAddress();
      expect(addressFromPublicKey(keyPair.publicKey.serialize())).toBe(expected);
    }
  });

  it("verifies a signature made the way Nimiq Pay signs messages", () => {
    const keyPair = KeyPair.generate();
    const message = "Sign in to NimFind\nCode: 1234";
    const signature = keyPair.sign(Hash.computeSha256(encodeSignedMessage(message)));

    const signer = verifySignedMessage({
      message,
      publicKeyHex: keyPair.publicKey.toHex(),
      signatureHex: signature.toHex(),
    });

    expect(signer).toBe(keyPair.toAddress().toUserFriendlyAddress());
  });

  it("rejects a signature over a different message", () => {
    const keyPair = KeyPair.generate();
    const signature = keyPair.sign(Hash.computeSha256(encodeSignedMessage("original")));

    expect(
      verifySignedMessage({
        message: "tampered",
        publicKeyHex: keyPair.publicKey.toHex(),
        signatureHex: signature.toHex(),
      }),
    ).toBeNull();
  });

  it("rejects malformed keys and signatures", () => {
    expect(verifySignedMessage({ message: "x", publicKeyHex: "zz", signatureHex: "00" })).toBeNull();
  });

  it("normalizes valid addresses and rejects bad checksums", () => {
    const address = KeyPair.generate().toAddress().toUserFriendlyAddress();
    expect(normalizeAddress(address.replace(/ /g, "").toLowerCase())).toBe(address);

    const lastChar = address.at(-1) === "0" ? "1" : "0";
    expect(normalizeAddress(address.slice(0, -1) + lastChar)).toBeNull();
    expect(normalizeAddress("not an address")).toBeNull();
    expect(normalizeAddress(42)).toBeNull();
  });

  it("converts between NIM and Luna", () => {
    expect(nimToLuna(1.5)).toBe(150_000);
    expect(lunaToNim(250_000)).toBe(2.5);
  });
});
