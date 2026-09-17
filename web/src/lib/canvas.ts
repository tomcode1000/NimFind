import QRCode from "qrcode";

export const COLORS = {
  darkblue: "#1f2348",
  darkblue60: "rgba(31, 35, 72, 0.6)",
  darkblue40: "rgba(31, 35, 72, 0.42)",
  gold: "#e9b213",
  orange: "#ec991c",
  white: "#ffffff",
};

export const FONT = '"Mulish Variable", "Mulish", system-ui, sans-serif';

/** Canvas text uses web fonts only once they are loaded, so wait before drawing. */
export async function ensureFonts() {
  try {
    await Promise.all([document.fonts.load(`800 20px ${FONT}`), document.fonts.load(`600 20px ${FONT}`)]);
  } catch {
    // Falls back to the system font.
  }
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  addRoundedRect(ctx, x, y, w, h, r);
}

/**
 * Adds a rounded rectangle to the current path. Counter clockwise rectangles cut holes
 * under the nonzero fill rule.
 */
export function addRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  counterClockwise = false,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!counterClockwise) {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x, y, x, y + h, radius);
    ctx.arcTo(x, y + h, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x + w, y, radius);
    ctx.arcTo(x + w, y, x, y, radius);
  }
  ctx.closePath();
}

export function hexagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Draws a QR code with softened modules. Finder patterns stay solid and square-cornered enough
 * for fast detection. Only the modules are painted, so the code works in any colour on any
 * background that contrasts with it, including light modules on a dark wallpaper.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  options: { color?: string; ecc?: "L" | "M" | "Q" | "H" } = {},
) {
  const color = options.color ?? COLORS.darkblue;
  const qr = QRCode.create(text, { errorCorrectionLevel: options.ecc ?? "M" });
  const count = qr.modules.size;
  const cell = size / count;
  const isDark = (row: number, col: number) => qr.modules.data[row * count + col] === 1;
  const inFinder = (row: number, col: number) =>
    (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7);

  ctx.save();
  ctx.fillStyle = color;
  const dot = cell * 0.9;
  const inset = (cell - dot) / 2;
  // One path for all modules, so translucent colours do not darken where shapes meet.
  ctx.beginPath();
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (inFinder(row, col) || !isDark(row, col)) continue;
      addRoundedRect(ctx, x + col * cell + inset, y + row * cell + inset, dot, dot, dot * 0.3);
    }
  }
  for (const [row, col] of [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ]) {
    const fx = x + col * cell;
    const fy = y + row * cell;
    // Outer ring as a shape with a hole, so the background shows through like a real gap.
    addRoundedRect(ctx, fx, fy, cell * 7, cell * 7, cell * 1.6);
    addRoundedRect(ctx, fx + cell, fy + cell, cell * 5, cell * 5, cell * 1.1, true);
    addRoundedRect(ctx, fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, cell * 0.8);
  }
  ctx.fill("nonzero");
  ctx.restore();
  return { modules: count };
}

/** Splits text into lines that fit a width, never cutting words unless a single word is too long. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitLongWord(ctx, word, maxWidth));
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

// Web addresses have no spaces, so break them after "/" or "." where possible, else anywhere.
function splitLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  if (ctx.measureText(word).width <= maxWidth) return [word];
  const parts: string[] = [];
  let rest = word;
  while (rest && ctx.measureText(rest).width > maxWidth) {
    let end = rest.length;
    while (end > 1 && ctx.measureText(rest.slice(0, end)).width > maxWidth) end--;
    const breakAt = Math.max(rest.lastIndexOf("/", end - 1), rest.lastIndexOf(".", end - 1));
    const cut = breakAt > end / 2 ? breakAt + 1 : end;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create image"))), "image/png"),
  );
}

/**
 * iPhones save images to Photos through the share sheet ("Save Image"); Android and desktop
 * browsers save straight to the gallery or downloads. Always returns an object URL so the image
 * can also be shown for press and hold saving.
 */
export async function saveImage(canvas: HTMLCanvasElement, filename: string): Promise<{ url: string; method: "share" | "download" | "manual" }> {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const file = new File([blob], filename, { type: "image/png" });
  const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  try {
    if (isApple && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return { url, method: "share" };
    }
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") return { url, method: "manual" };
  }

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { url, method: "download" };
  } catch {
    return { url, method: "manual" };
  }
}
