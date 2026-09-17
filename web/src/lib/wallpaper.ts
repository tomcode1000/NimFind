import { FONT, drawQr, hexagonPath, roundedRect, wrapText } from "./canvas";

export type DesignId = "midnight" | "mono" | "aurora" | "ocean" | "hexfield" | "goldhour" | "dunes" | "blossom" | "paper";

export const DESIGNS: { id: DesignId; name: string; premium: boolean }[] = [
  { id: "midnight", name: "Midnight", premium: false },
  { id: "mono", name: "Mono", premium: false },
  { id: "aurora", name: "Aurora", premium: true },
  { id: "ocean", name: "Ocean", premium: true },
  { id: "hexfield", name: "Hexfield", premium: true },
  { id: "goldhour", name: "Gold hour", premium: true },
  { id: "dunes", name: "Dunes", premium: true },
  { id: "blossom", name: "Blossom", premium: true },
  { id: "paper", name: "Paper", premium: true },
];

export type PhotoFilter = "original" | "night" | "gold" | "soft";

export const PHOTO_FILTERS: { id: PhotoFilter; name: string }[] = [
  { id: "original", name: "Original" },
  { id: "night", name: "Night" },
  { id: "gold", name: "Gold" },
  { id: "soft", name: "Soft" },
];

export type WallpaperBackground =
  | { kind: "design"; design: DesignId }
  | { kind: "photo"; image: HTMLImageElement; filter: PhotoFilter };

export interface OverlayInput {
  qrText: string;
  headline: string;
  message: string;
  rewardNim: number;
  /** Top left corner of the block, as fractions of the screen. Clamped to stay on screen. */
  x: number;
  y: number;
  /** "blend" puts the code on a soft frosted plate; "strong" on a solid white one. */
  contrast: "blend" | "strong";
  calendar: boolean;
  date: Date;
}

export interface BlockLayout {
  /** Block position and size as fractions of the screen, for dragging and guides. */
  x: number;
  y: number;
  w: number;
  h: number;
  qrWidthFraction: number;
}

/** Physical screen size in pixels, falling back to a common phone when the device reports little. */
export function wallpaperSize(): { width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.round(Math.min(window.screen.width, window.screen.height) * ratio);
  const height = Math.round(Math.max(window.screen.width, window.screen.height) * ratio);
  if (width < 600 || height < 1000 || height / width < 1.6) return { width: 1179, height: 2556 };
  return { width: Math.min(width, 1440), height: Math.min(height, 3200) };
}

/* Background layer */

export function renderBackground(canvas: HTMLCanvasElement, background: WallpaperBackground, W: number, H: number) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (background.kind === "photo") drawPhoto(ctx, background.image, background.filter, W, H);
  else drawDesign(ctx, background.design, W, H);
}

function drawDesign(ctx: CanvasRenderingContext2D, design: DesignId, W: number, H: number) {
  const u = W / 100;
  switch (design) {
    case "midnight": {
      verticalGradient(ctx, W, H, [
        [0, "#2c3163"],
        [1, "#11132a"],
      ]);
      glow(ctx, W * 0.85, H * 0.12, W * 0.95, "rgba(12, 166, 254, 0.32)");
      glow(ctx, W * 0.05, H * 0.95, W * 0.9, "rgba(120, 92, 220, 0.18)");
      return;
    }
    case "mono": {
      ctx.fillStyle = "#08080c";
      ctx.fillRect(0, 0, W, H);
      glow(ctx, W * 0.7, H * 0.3, W * 0.9, "rgba(255, 255, 255, 0.05)");
      ctx.lineWidth = 0.3 * u;
      ctx.strokeStyle = "rgba(233, 178, 19, 0.55)";
      hexagonPath(ctx, W * 0.92, H * 0.22, 34 * u);
      ctx.stroke();
      ctx.strokeStyle = "rgba(233, 178, 19, 0.18)";
      hexagonPath(ctx, W * 0.92, H * 0.22, 40 * u);
      ctx.stroke();
      return;
    }
    case "aurora": {
      verticalGradient(ctx, W, H, [
        [0, "#050b1d"],
        [1, "#0a1330"],
      ]);
      const ribbons: [number, number, number, string][] = [
        [0.2, 0.18, 0.75, "rgba(33, 188, 165, 0.42)"],
        [0.65, 0.3, 0.7, "rgba(12, 166, 254, 0.38)"],
        [0.9, 0.08, 0.55, "rgba(150, 110, 255, 0.3)"],
        [0.4, 0.48, 0.6, "rgba(33, 188, 165, 0.18)"],
      ];
      for (const [x, y, r, color] of ribbons) glow(ctx, W * x, H * y, W * r, color);
      stars(ctx, W, H * 0.55, 70, 0.5 * u, 11);
      return;
    }
    case "ocean": {
      verticalGradient(ctx, W, H, [
        [0, "#0e3a66"],
        [0.5, "#0a2446"],
        [1, "#050f24"],
      ]);
      glow(ctx, W * 0.5, H * 0.02, W * 0.9, "rgba(120, 210, 255, 0.28)");
      waves(ctx, W, H, 0.42, ["rgba(12, 166, 254, 0.10)", "rgba(12, 166, 254, 0.08)", "rgba(5, 130, 202, 0.10)", "rgba(3, 20, 50, 0.35)"], 3.2 * u);
      return;
    }
    case "hexfield": {
      const base = ctx.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, "#23284f");
      base.addColorStop(1, "#141733");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      glow(ctx, W * 0.9, H * 0.18, W * 0.8, "rgba(233, 178, 19, 0.18)");
      const r = 7 * u;
      ctx.lineWidth = 0.28 * u;
      hexGrid(W, H, r, (cx, cy) => {
        const nearHighlight = Math.hypot(cx - W * 0.82, cy - H * 0.2) < W * 0.32;
        hexagonPath(ctx, cx, cy, r * 0.92);
        ctx.strokeStyle = nearHighlight ? "rgba(233, 178, 19, 0.28)" : "rgba(255, 255, 255, 0.055)";
        ctx.stroke();
      });
      return;
    }
    case "goldhour": {
      verticalGradient(ctx, W, H, [
        [0, "#241a44"],
        [0.45, "#5b3563"],
        [0.75, "#d7784a"],
        [1, "#e9b213"],
      ]);
      glow(ctx, W * 0.5, H * 0.8, W * 0.7, "rgba(255, 214, 120, 0.45)");
      return;
    }
    case "dunes": {
      verticalGradient(ctx, W, H, [
        [0, "#2a1e3f"],
        [0.35, "#8a4f5c"],
        [0.55, "#e6a06a"],
        [1, "#f3cf96"],
      ]);
      glow(ctx, W * 0.72, H * 0.4, W * 0.35, "rgba(255, 230, 170, 0.55)");
      const layers = ["#c9774f", "#a55a4a", "#7a4050", "#4d2c48", "#2c1d38"];
      layers.forEach((color, i) => {
        const top = H * (0.56 + i * 0.085);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 60) {
          const y = top + Math.sin(x / W * Math.PI * (1.4 + i * 0.35) + i * 1.7) * H * 0.025;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      });
      return;
    }
    case "blossom": {
      ctx.fillStyle = "#fbeef2";
      ctx.fillRect(0, 0, W, H);
      const blobs: [number, number, number, string][] = [
        [0.15, 0.15, 0.7, "rgba(245, 163, 192, 0.55)"],
        [0.9, 0.35, 0.65, "rgba(201, 182, 242, 0.6)"],
        [0.3, 0.75, 0.75, "rgba(255, 210, 176, 0.55)"],
        [0.85, 0.9, 0.55, "rgba(245, 163, 192, 0.4)"],
      ];
      for (const [x, y, r, color] of blobs) glow(ctx, W * x, H * y, W * r, color);
      return;
    }
    case "paper": {
      ctx.fillStyle = "#f3f0e8";
      ctx.fillRect(0, 0, W, H);
      const r = 16 * u;
      ctx.lineWidth = 0.35 * u;
      hexGrid(W, H, r, (cx, cy) => {
        const closeness = Math.max(0, 1 - Math.hypot(cx - W * 0.85, cy - H * 0.1) / (W * 0.5));
        hexagonPath(ctx, cx, cy, r * 0.9);
        if (closeness > 0) {
          ctx.fillStyle = `rgba(233, 178, 19, ${0.16 * closeness})`;
          ctx.fill();
        }
        ctx.strokeStyle = closeness > 0 ? `rgba(233, 178, 19, ${0.12 + 0.3 * closeness})` : "rgba(31, 35, 72, 0.07)";
        ctx.stroke();
      });
      return;
    }
  }
}

function drawPhoto(ctx: CanvasRenderingContext2D, image: HTMLImageElement, filter: PhotoFilter, W: number, H: number) {
  const scale = Math.max(W / image.width, H / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;

  if (filter === "soft") {
    // Downscale then upscale: a smooth blur that works in every webview.
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(W / 14));
    small.height = Math.max(1, Math.round(H / 14));
    small.getContext("2d")!.drawImage(image, (small.width - dw / 14) / 2, (small.height - dh / 14) / 2, dw / 14, dh / 14);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, W, H);
    ctx.fillStyle = "rgba(10, 12, 30, 0.22)";
    ctx.fillRect(0, 0, W, H);
    return;
  }

  ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
  if (filter === "original") return;

  // Duotone: map brightness onto a two colour Nimiq ramp.
  const [from, to] = filter === "night" ? [[17, 19, 42], [12, 166, 254]] : [[36, 26, 68], [233, 178, 19]];
  const pixels = ctx.getImageData(0, 0, W, H);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    data[i] = from[0] + (to[0] - from[0]) * l;
    data[i + 1] = from[1] + (to[1] - from[1]) * l;
    data[i + 2] = from[2] + (to[2] - from[2]) * l;
  }
  ctx.putImageData(pixels, 0, 0);
}

/* Overlay: QR code, text and the soft shade that keeps them readable */

function blockMetrics(ctx: CanvasRenderingContext2D, W: number, input: OverlayInput) {
  const u = W / 100;
  const blockW = 52 * u;
  const qr = 27 * u;
  // The light plate behind the code; its padding doubles as the scanner's quiet zone.
  const platePad = 3.4 * u;
  const plate = qr + platePad * 2;
  const calH = input.calendar ? 33 * u : 0;
  const calGap = input.calendar ? 4 * u : 0;

  ctx.font = `800 ${4.3 * u}px ${FONT}`;
  const headlineLines = wrapText(ctx, input.headline, blockW, 2);
  ctx.font = `600 ${2.9 * u}px ${FONT}`;
  const messageLines = input.message.trim() ? wrapText(ctx, input.message.trim(), blockW, 2) : [];

  const textTop = calH + calGap + plate + 3.4 * u;
  const headlineH = headlineLines.length * 5.2 * u;
  const messageH = messageLines.length ? 1.2 * u + messageLines.length * 3.9 * u : 0;
  const pillH = input.rewardNim > 0 ? 2.4 * u + 5.4 * u : 0;
  return {
    u,
    blockW,
    qr,
    platePad,
    plate,
    calH,
    calGap,
    headlineLines,
    messageLines,
    textTop,
    height: textTop + headlineH + messageH + pillH,
  };
}

export function renderWallpaper(target: HTMLCanvasElement, background: HTMLCanvasElement, input: OverlayInput): BlockLayout {
  const W = background.width;
  const H = background.height;
  target.width = W;
  target.height = H;
  const ctx = target.getContext("2d")!;
  ctx.drawImage(background, 0, 0);

  const m = blockMetrics(ctx, W, input);
  const { u } = m;
  const margin = 5 * u;
  const bx = clamp(input.x * W, margin, W - m.blockW - margin);
  const by = clamp(input.y * H, margin, H - m.height - margin);

  // Light or dark treatment depends on what is actually underneath the block.
  const dark = regionStats(background, bx, by, m.blockW, m.height).mean < 0.56;
  const strong = input.contrast === "strong";
  const ink = dark ? "255, 255, 255" : "22, 25, 56";
  const shade = dark ? "6, 8, 24" : "255, 255, 255";
  const qrY = by + m.calH + m.calGap;

  // A feathered shade: invisible as a shape, but it lifts contrast for the text.
  featheredRect(ctx, bx - 5 * u, by - 5 * u, m.blockW + 10 * u, m.height + 10 * u, 10 * u, `rgba(${shade}, ${dark ? 0.28 : 0.36})`);

  // The code is always dark on light: tested on real phones, many scanners cannot read a light
  // code on a dark background. "Blend in" uses a soft frosted plate, "High contrast" a solid one.
  ctx.save();
  ctx.shadowColor = "rgba(6, 8, 24, 0.22)";
  ctx.shadowBlur = 3 * u;
  ctx.shadowOffsetY = 0.6 * u;
  ctx.fillStyle = strong ? "#ffffff" : dark ? "rgba(244, 245, 250, 0.93)" : "rgba(255, 255, 255, 0.9)";
  roundedRect(ctx, bx, qrY, m.plate, m.plate, (strong ? 2.6 : 3.6) * u);
  ctx.fill();
  ctx.restore();

  if (input.calendar) drawCalendar(ctx, bx, by, m.blockW, input.date, ink, u);

  drawQr(ctx, input.qrText, bx + m.platePad, qrY + m.platePad, m.qr, { color: "#161938" });

  let ty = by + m.textTop;
  ctx.textBaseline = "top";
  ctx.fillStyle = `rgba(${ink}, 0.96)`;
  ctx.font = `800 ${4.3 * u}px ${FONT}`;
  for (const line of m.headlineLines) {
    ctx.fillText(line, bx, ty);
    ty += 5.2 * u;
  }
  if (m.messageLines.length) {
    ty += 1.2 * u;
    ctx.fillStyle = `rgba(${ink}, 0.72)`;
    ctx.font = `600 ${2.9 * u}px ${FONT}`;
    for (const line of m.messageLines) {
      ctx.fillText(line, bx, ty);
      ty += 3.9 * u;
    }
  }
  if (input.rewardNim > 0) {
    ty += 2.4 * u;
    const label = `Reward ${new Intl.NumberFormat("en").format(input.rewardNim)} NIM`;
    ctx.font = `800 ${2.6 * u}px ${FONT}`;
    const pillW = ctx.measureText(label).width + 4.4 * u;
    ctx.fillStyle = dark ? "rgba(233, 178, 19, 0.92)" : "rgba(233, 178, 19, 0.85)";
    roundedRect(ctx, bx, ty, pillW, 5.4 * u, 2.7 * u);
    ctx.fill();
    ctx.fillStyle = "#1f2348";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + 2.2 * u, ty + 2.8 * u);
  }

  return { x: bx / W, y: by / H, w: m.blockW / W, h: m.height / H, qrWidthFraction: m.qr / W };
}

function drawCalendar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, date: Date, ink: string, u: number) {
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = `rgba(${ink}, 0.96)`;
  ctx.font = `800 ${3 * u}px ${FONT}`;
  ctx.fillText(date.toLocaleDateString("en", { month: "long", year: "numeric" }), x, y);

  const colW = w / 7;
  const gridTop = y + 4.8 * u;
  ctx.textAlign = "center";
  ctx.font = `700 ${1.9 * u}px ${FONT}`;
  ctx.fillStyle = `rgba(${ink}, 0.55)`;
  ["M", "T", "W", "T", "F", "S", "S"].forEach((d, i) => ctx.fillText(d, x + colW * (i + 0.5), gridTop));

  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  ctx.font = `700 ${2.4 * u}px ${FONT}`;
  for (let day = 1; day <= days; day++) {
    const index = firstWeekday + day - 1;
    const cx = x + colW * ((index % 7) + 0.5);
    const cy = gridTop + 3.6 * u + Math.floor(index / 7) * 3.9 * u;
    if (day === date.getDate()) {
      ctx.fillStyle = "#e9b213";
      ctx.beginPath();
      ctx.arc(cx, cy + 1.2 * u, 2.1 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f2348";
    } else {
      ctx.fillStyle = `rgba(${ink}, 0.9)`;
    }
    ctx.fillText(String(day), cx, cy);
  }
  ctx.textAlign = "left";
}

/* Helpers */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function verticalGradient(ctx: CanvasRenderingContext2D, W: number, H: number, stops: [number, string][]) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function hexGrid(W: number, H: number, r: number, draw: (cx: number, cy: number) => void) {
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  for (let col = -1; col * dx < W + r; col++) {
    for (let row = -1; row * dy < H + r; row++) draw(col * dx, row * dy + (col % 2 ? dy / 2 : 0));
  }
}

function waves(ctx: CanvasRenderingContext2D, W: number, H: number, start: number, colors: string[], amplitude: number) {
  colors.forEach((color, i) => {
    const top = H * (start + i * 0.13);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 60) {
      ctx.lineTo(x, top + Math.sin((x / W) * Math.PI * 2 * (1 + i * 0.3) + i) * amplitude);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  });
}

/** Deterministic stars, so the same design always renders identically. */
function stars(ctx: CanvasRenderingContext2D, W: number, maxY: number, count: number, size: number, seed: number) {
  let state = seed;
  const random = () => ((state = (state * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    // Kept faint so the shade behind a QR code hides them; bright specks read as extra modules.
    ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + random() * 0.28})`;
    ctx.beginPath();
    ctx.arc(random() * W, random() * maxY, size * (0.4 + random()), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws only the blurred shadow of a rectangle, giving a soft edged shade in every webview. */
function featheredRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, blur: number, color: string) {
  const offset = ctx.canvas.width * 2;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offset;
  ctx.fillStyle = "#000";
  roundedRect(ctx, x - offset, y, w, h, blur);
  ctx.fill();
  ctx.restore();
}

/** Mean brightness and how much it varies, from 0 to 1, over a region of the background. */
function regionStats(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const sx = Math.min(Math.max(0, Math.floor(x)), canvas.width - 1);
  const sy = Math.min(Math.max(0, Math.floor(y)), canvas.height - 1);
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(w)));
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(h)));
  const { data } = ctx.getImageData(sx, sy, sw, sh);
  let total = 0;
  let squares = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    total += l;
    squares += l * l;
    samples++;
  }
  const mean = samples ? total / samples : 0;
  return { mean, deviation: samples ? Math.sqrt(Math.max(0, squares / samples - mean * mean)) : 0 };
}
