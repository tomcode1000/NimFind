import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError, oneOf, optionalText, readJson, requireText, rewardLuna } from "../lib/http";
import { TAG_KINDS, TAG_STATUSES, reportJson, tagJson, type ReportRow, type TagRow } from "../lib/records";
import { randomCode } from "../lib/security";
import { requireAuth } from "./auth";

const MAX_TAGS_PER_OWNER = 50;

export const tags = new Hono<AppEnv>();
tags.use("*", requireAuth);

tags.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM reports r WHERE r.tag_code = t.code AND r.status = 'open') AS open_reports,
       (SELECT MAX(created_at) FROM scans s WHERE s.tag_code = t.code) AS last_scan_at
     FROM tags t WHERE t.owner_address = ? AND t.status != 'archived' ORDER BY t.created_at DESC`,
  )
    .bind(c.var.address)
    .all<TagRow & { open_reports: number; last_scan_at: number | null }>();

  return c.json({
    tags: results.map((tag) => ({ ...tagJson(tag), openReports: tag.open_reports, lastScanAt: tag.last_scan_at })),
  });
});

tags.post("/", async (c) => {
  const body = await readJson(c);
  const kind = oneOf(body.kind, TAG_KINDS, "Kind");
  const label = requireText(body.label, "Label", 60);
  const note = optionalText(body.note, "Note", 280);
  const reward = rewardLuna(body.rewardNim ?? 0);

  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tags WHERE owner_address = ? AND status != 'archived'")
    .bind(c.var.address)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TAGS_PER_OWNER) {
    throw new HttpError(409, "tag_limit", `You can have up to ${MAX_TAGS_PER_OWNER} active tags.`);
  }

  const now = c.var.now;
  const tag: TagRow = {
    code: randomCode(8),
    owner_address: c.var.address,
    kind,
    label,
    note,
    reward_luna: reward,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  await c.env.DB.prepare(
    `INSERT INTO tags (code, owner_address, kind, label, note, reward_luna, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(tag.code, tag.owner_address, tag.kind, tag.label, tag.note, tag.reward_luna, tag.status, now, now)
    .run();

  return c.json({ tag: tagJson(tag) }, 201);
});

tags.get("/:code", async (c) => {
  const tag = await loadOwnTag(c.env.DB, c.req.param("code"), c.var.address);
  const [{ results }, scans] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM reports WHERE tag_code = ? ORDER BY created_at DESC").bind(tag.code).all<ReportRow>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total, MAX(created_at) AS last FROM scans WHERE tag_code = ?")
      .bind(tag.code)
      .first<{ total: number; last: number | null }>(),
  ]);
  return c.json({
    tag: { ...tagJson(tag), scanCount: scans?.total ?? 0, lastScanAt: scans?.last ?? null },
    reports: results.map(reportJson),
  });
});

tags.patch("/:code", async (c) => {
  const tag = await loadOwnTag(c.env.DB, c.req.param("code"), c.var.address);
  const body = await readJson(c);

  const updated: TagRow = {
    ...tag,
    label: body.label === undefined ? tag.label : requireText(body.label, "Label", 60),
    note: body.note === undefined ? tag.note : optionalText(body.note, "Note", 280),
    reward_luna: body.rewardNim === undefined ? tag.reward_luna : rewardLuna(body.rewardNim),
    status: body.status === undefined ? tag.status : oneOf(body.status, TAG_STATUSES, "Status"),
    kind: body.kind === undefined ? tag.kind : oneOf(body.kind, TAG_KINDS, "Kind"),
    updated_at: c.var.now,
  };

  await c.env.DB.prepare(
    "UPDATE tags SET label = ?, note = ?, reward_luna = ?, status = ?, kind = ?, updated_at = ? WHERE code = ?",
  )
    .bind(updated.label, updated.note, updated.reward_luna, updated.status, updated.kind, updated.updated_at, tag.code)
    .run();

  return c.json({ tag: tagJson(updated) });
});

async function loadOwnTag(db: D1Database, code: string, owner: string): Promise<TagRow> {
  const tag = await db.prepare("SELECT * FROM tags WHERE code = ?").bind(code).first<TagRow>();
  // Same response for missing and foreign tags, so codes cannot be probed for ownership.
  if (!tag || tag.owner_address !== owner) throw new HttpError(404, "tag_not_found", "Tag not found.");
  return tag;
}
