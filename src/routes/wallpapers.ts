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
  if (premium) {
    await spendWallpaperCredit(c.env.DB, c.env, c.var.address, { code: link.code, design: link.design }, c.var.now);
  }

  const token = await signPayload(link, c.env.SESSION_SECRET, LINK_TTL_SECONDS, c.var.now);
  return c.json({ path: `/w/${token}` }, 201);
});

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
