import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError, oneOf, optionalText, readJson } from "../lib/http";
import { publicTagJson, type TagRow } from "../lib/records";
import { readPayload, signPayload } from "../lib/security";
import { requireAuth } from "./auth";
import { spendWallpaperCredit } from "./wallpaper-purchases";

const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const FREE_DESIGNS = ["midnight", "mono"] as const;
const DESIGNS = ["midnight", "mono", "aurora", "ocean", "hexfield", "goldhour", "dunes", "blossom", "paper", "photo"] as const;
const FILTERS = ["original", "night", "gold", "soft"] as const;

interface SavedWallpaperRow {
  design: string;
  filter: string;
  x: number;
  y: number;
  contrast: string;
  calendar: number;
  message: string;
  paid: number;
  updated_at: number;
}

interface WallpaperLink {
  code: string;
  design: (typeof DESIGNS)[number];
  filter: (typeof FILTERS)[number];
  x: number;
  y: number;
  contrast: "blend" | "strong";
  calendar: boolean;
  message: string;
}

/**
 * Wallpaper links let an owner finish saving a wallpaper in their phone's normal browser, where
 * downloads work, when the in-app browser cannot save images. The link carries only the layout,
 * signed so paid designs cannot be unlocked by editing it. Photos are never included.
 */
export const wallpaperLinks = new Hono<AppEnv>();
wallpaperLinks.use("*", requireAuth);

wallpaperLinks.post("/", async (c) => {
  const body = await readJson(c);
  const code = typeof body.code === "string" ? body.code : "";
  const tag = await c.env.DB.prepare("SELECT owner_address FROM tags WHERE code = ? AND status != 'archived'")
    .bind(code)
    .first<{ owner_address: string }>();
  if (!tag || tag.owner_address !== c.var.address) throw new HttpError(404, "tag_not_found", "Tag not found.");

  const link: WallpaperLink = {
    code,
    design: oneOf(body.design, DESIGNS, "Design"),
    filter: body.filter === undefined ? "original" : oneOf(body.filter, FILTERS, "Filter"),
    x: fraction(body.x),
    y: fraction(body.y),
    contrast: oneOf(body.contrast, ["blend", "strong"] as const, "Contrast"),
    calendar: body.calendar === true,
    message: optionalText(body.message, "Message", 80) ?? "",
  };

  const premium = link.calendar || (link.design !== "photo" && !(FREE_DESIGNS as readonly string[]).includes(link.design));
  // A design already paid for on this tag stays open: saving it again is free, forever.
  const saved = await loadSaved(c.env.DB, link.code);
  const alreadyPaid = saved?.paid === 1 && saved.design === link.design && Boolean(saved.calendar) === link.calendar;
  if (premium && !alreadyPaid) {
    await spendWallpaperCredit(c.env.DB, c.env, c.var.address, { code: link.code, design: link.design }, c.var.now);
  }

  await c.env.DB.prepare(
    `INSERT INTO wallpapers (tag_code, owner_address, design, filter, x, y, contrast, calendar, message, paid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tag_code) DO UPDATE SET
       design = excluded.design, filter = excluded.filter, x = excluded.x, y = excluded.y,
       contrast = excluded.contrast, calendar = excluded.calendar, message = excluded.message,
       paid = MAX(wallpapers.paid, excluded.paid), updated_at = excluded.updated_at`,
  )
    .bind(
      link.code,
      c.var.address,
      link.design,
      link.filter,
      link.x,
      link.y,
      link.contrast,
      link.calendar ? 1 : 0,
      link.message,
      premium || alreadyPaid ? 1 : 0,
      c.var.now,
      c.var.now,
    )
    .run();

  const token = await signPayload(link, c.env.SESSION_SECRET, LINK_TTL_SECONDS, c.var.now);
  return c.json({ path: `/w/${token}`, saved: true }, 201);
});

/** The wallpaper this tag already has, so the studio opens where the owner left it. */
wallpaperLinks.get("/:code", async (c) => {
  const code = c.req.param("code");
  const tag = await c.env.DB.prepare("SELECT owner_address FROM tags WHERE code = ? AND status != 'archived'")
    .bind(code)
    .first<{ owner_address: string }>();
  if (!tag || tag.owner_address !== c.var.address) throw new HttpError(404, "tag_not_found", "Tag not found.");

  const saved = await loadSaved(c.env.DB, code);
  return c.json({
    wallpaper: saved
      ? {
          design: saved.design,
          filter: saved.filter,
          x: saved.x,
          y: saved.y,
          contrast: saved.contrast,
          calendar: Boolean(saved.calendar),
          message: saved.message,
          paid: Boolean(saved.paid),
          savedAt: saved.updated_at,
        }
      : null,
  });
});

function loadSaved(db: AppEnv["Bindings"]["DB"], code: string) {
  return db.prepare("SELECT * FROM wallpapers WHERE tag_code = ?").bind(code).first<SavedWallpaperRow>();
}

export const publicWallpapers = new Hono<AppEnv>();

publicWallpapers.get("/:token", async (c) => {
  const link = await readPayload<WallpaperLink>(c.req.param("token"), c.env.SESSION_SECRET, c.var.now);
  if (!link) throw new HttpError(404, "link_invalid", "This wallpaper link has expired. Make a new one in NimFind.");
  const tag = await c.env.DB.prepare("SELECT * FROM tags WHERE code = ? AND status != 'archived'").bind(link.code).first<TagRow>();
  if (!tag) throw new HttpError(404, "tag_not_found", "This tag is no longer active.");
  return c.json({ tag: publicTagJson(tag), wallpaper: link });
});

function fraction(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, "invalid_input", "Position must be a number.");
  return Math.round(Math.min(Math.max(n, 0), 1) * 1000) / 1000;
}
