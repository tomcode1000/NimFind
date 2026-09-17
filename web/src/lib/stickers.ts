import { COLORS, FONT, drawQr, roundedRect, wrapText } from "./canvas";

// A4 at 150 dots per inch. The image has A4 proportions, so printing it "fit to page" keeps sizes close to true.
const PAGE_W = 1240;
const PAGE_H = 1754;
const MM = 150 / 25.4;

export interface StickerInput {
  qrText: string;
  linkText: string;
  code: string;
  label: string;
  headline: string;
  rewardNim: number;
}

export function renderStickerSheet(canvas: HTMLCanvasElement, input: StickerInput) {
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const margin = 70;
  ctx.textBaseline = "top";
  ctx.fillStyle = COLORS.darkblue;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(`NimFind tags for ${input.label}`, margin, 60, PAGE_W - margin * 2);
  ctx.fillStyle = COLORS.darkblue60;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText("Print on A4 at 100% or \"fit to page\". Cut along the dotted lines. Clear tape keeps them waterproof.", margin, 108, PAGE_W - margin * 2);

  let y = 180;

  // Keychain tags, 25 mm wide.
  y = sectionTitle(ctx, "Keychain tags, 2.5 cm", margin, y);
  const keySize = 25 * MM;
  const keyH = keySize + 34;
  const keyGap = (PAGE_W - margin * 2 - keySize * 6) / 5;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      const x = margin + col * (keySize + keyGap);
      const top = y + row * (keyH + 18);
      cutLine(ctx, x - 6, top - 6, keySize + 12, keyH + 12);
      drawQr(ctx, input.qrText, x + 8, top + 8, keySize - 16, { ecc: "Q" });
      ctx.fillStyle = COLORS.darkblue;
      ctx.font = `800 17px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(input.code, x + keySize / 2, top + keySize + 4, keySize);
      ctx.textAlign = "left";
    }
  }
  y += 2 * (keyH + 18) + 40;

  // Wallet cards, 85 by 55 mm.
  y = sectionTitle(ctx, "Cards, 85 × 55 mm", margin, y);
  const cardW = 85 * MM;
  const cardH = 55 * MM;
  const cardGap = PAGE_W - margin * 2 - cardW * 2;
  for (let col = 0; col < 2; col++) {
    const x = margin + col * (cardW + cardGap);
    cutLine(ctx, x, y, cardW, cardH);
    const qr = cardH - 60;
    drawQr(ctx, input.qrText, x + 30, y + 30, qr, { ecc: "Q" });
    const tx = x + 30 + qr + 26;
    const tw = cardW - (tx - x) - 26;
    let ty = y + 40;
    ctx.fillStyle = COLORS.darkblue;
    ctx.font = `800 28px ${FONT}`;
    for (const line of wrapText(ctx, input.headline, tw, 2)) {
      ctx.fillText(line, tx, ty);
      ty += 34;
    }
    ty += 8;
    ctx.fillStyle = COLORS.darkblue60;
    ctx.font = `600 18px ${FONT}`;
    for (const line of wrapText(ctx, "Scan to message the owner privately.", tw, 3)) {
      ctx.fillText(line, tx, ty);
      ty += 24;
    }
    if (input.rewardNim > 0) {
      ty += 12;
      const label = `Reward ${new Intl.NumberFormat("en").format(input.rewardNim)} NIM`;
      ctx.font = `800 17px ${FONT}`;
      const pillW = Math.min(ctx.measureText(label).width + 26, tw);
      ctx.fillStyle = COLORS.gold;
      roundedRect(ctx, tx, ty, pillW, 34, 17);
      ctx.fill();
      ctx.fillStyle = COLORS.darkblue;
      ctx.textBaseline = "middle";
      ctx.fillText(label, tx + 13, ty + 18, pillW - 26);
      ctx.textBaseline = "top";
      ty += 46;
    }
    ctx.fillStyle = COLORS.darkblue40;
    ctx.font = `600 15px ${FONT}`;
    for (const line of wrapText(ctx, input.linkText.replace(/^https?:\/\//, ""), tw, 2)) {
      ctx.fillText(line, tx, ty);
      ty += 20;
    }
  }
  y += cardH + 40;

  // Round cornered stickers, 40 mm.
  y = sectionTitle(ctx, "Stickers, 4 cm", margin, y);
  const stickerSize = 40 * MM;
  const stickerH = stickerSize + 40;
  const perRow = 4;
  const stickerGap = (PAGE_W - margin * 2 - stickerSize * perRow) / (perRow - 1);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < perRow; col++) {
      const x = margin + col * (stickerSize + stickerGap);
      const top = y + row * (stickerH + 18);
      cutLine(ctx, x, top, stickerSize, stickerH, 24);
      drawQr(ctx, input.qrText, x + 18, top + 18, stickerSize - 36, { ecc: "Q" });
      ctx.fillStyle = COLORS.darkblue;
      ctx.font = `800 20px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("Found me? Scan", x + stickerSize / 2, top + stickerSize - 6, stickerSize - 20);
      ctx.textAlign = "left";
    }
  }
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.fillStyle = COLORS.darkblue60;
  ctx.font = `800 18px ${FONT}`;
  ctx.fillText(text.toUpperCase(), x, y);
  return y + 44;
}

function cutLine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 14) {
  ctx.save();
  ctx.strokeStyle = "rgba(31, 35, 72, 0.3)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 7]);
  roundedRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}
