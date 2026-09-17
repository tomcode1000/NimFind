import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QR_ERROR_CORRECTION, qrMatrix } from "../web/src/lib/canvas";

// A tag's QR code must look identical everywhere: the tag page, wallpapers and printed stickers.
// These tests fail if any screen draws a QR code with its own settings.

const webSrc = fileURLToPath(new URL("../web/src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|vue)$/.test(name) ? [path] : [];
  });
}

function matrixKey(text: string): string {
  const matrix = qrMatrix(text);
  let key = `${matrix.size}:`;
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) key += matrix.isDark(row, col) ? "1" : "0";
  }
  return key;
}

describe("QR code consistency", () => {
  it("uses one fixed error correction level", () => {
    expect(QR_ERROR_CORRECTION).toBe("Q");
  });

  it("gives the same link the identical pattern every time", () => {
    const link = "https://nimfind.app/t/k7p2m9xq";
    expect(matrixKey(link)).toBe(matrixKey(link));
    expect(matrixKey(link)).not.toBe(matrixKey("https://nimfind.app/t/k7p2m9xr"));
  });

  it("only creates QR codes in the shared drawing module, and no screen passes its own settings", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(webSrc)) {
      const source = readFileSync(file, "utf8");
      const isSharedModule = file.endsWith(join("lib", "canvas.ts"));
      if (!isSharedModule && /QRCode\.|from "qrcode"|errorCorrectionLevel|\becc\s*:/.test(source)) offenders.push(file);
      for (const call of source.match(/drawQr\([^;]*\);/g) ?? []) {
        if (/ecc|errorCorrection/.test(call)) offenders.push(`${file}: ${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
