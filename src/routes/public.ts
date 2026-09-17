import type { Database } from "../lib/db";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, readJson, requireText } from "../lib/http";
import { lunaToNim, normalizeAddress } from "../lib/nimiq";
import { messageJson, publicTagJson, reportJson, type MessageRow, type ReportRow, type TagRow } from "../lib/records";
import { randomCode, randomToken, readSessionToken, sha256Hex } from "../lib/security";
import { MAX_MESSAGE_LENGTH, addMessage } from "./reports";

// Phones on the same mobile network often share one address, so this stays generous.
const REPORTS_PER_IP_PER_HOUR = 25;
const REPORTS_PER_TAG_PER_DAY = 40;
const HOUR_MS = 60 * 60 * 1000;
const SCAN_WINDOW_MS = 10 * 60 * 1000;

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/tags/:code", async (c) => {
  const tag = await loadActiveTag(c.env.DB, c.req.param("code"));
  // A trust signal for finders: whether the owner's wallet currently holds the promised reward.
  // The address itself is never revealed, and the reward stays in the owner's wallet.
  let rewardFunded: boolean | null = null;
  if (tag.reward_luna > 0) {
    try {
      rewardFunded = (await c.var.chain.getBalance(tag.owner_address)) >= tag.reward_luna;
    } catch {
      rewardFunded = null;
    }
  }
  return c.json({ tag: { ...publicTagJson(tag), rewardFunded } });
});

/**
 * Called by the finder page when it opens, not on GET, so link previews in chat apps do not
 * count as scans. Repeat visits from the same connection within 10 minutes count once.
 */
publicRoutes.post("/tags/:code/scan", async (c) => {
  const tag = await loadActiveTag(c.env.DB, c.req.param("code"));
  const now = c.var.now;

  // The owner checking their own tag page is not a finder.
  const header = c.req.header("authorization") ?? "";
  const viewer = header.startsWith("Bearer ") ? await readSessionToken(header.slice(7), c.env.SESSION_SECRET, now) : null;
  if (viewer === tag.owner_address) return c.json({ recorded: false });

  const ipHash = await hashIp(c);
  const sameVisitor = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM scans WHERE tag_code = ? AND ip_hash = ? AND created_at > ?")
    .bind(tag.code, ipHash, now - SCAN_WINDOW_MS)
    .first<{ n: number }>();
  if ((sameVisitor?.n ?? 0) > 0) return c.json({ recorded: false });

  await c.env.DB.prepare("INSERT INTO scans (id, tag_code, ip_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(randomCode(12), tag.code, ipHash, now)
    .run();
  return c.json({ recorded: true });
});

/** A finder opens a report. The returned token is the only key to that conversation. */
publicRoutes.post("/tags/:code/reports", async (c) => {
  const tag = await loadActiveTag(c.env.DB, c.req.param("code"));
  const body = await readJson(c);
  const message = requireText(body.message, "Message", MAX_MESSAGE_LENGTH);
  const finderAddress = parseOptionalAddress(body.finderAddress);

  const now = c.var.now;
  const ipHash = await hashIp(c);
  const [byIp, byTag] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter_ip_hash = ? AND created_at > ?")
      .bind(ipHash, now - HOUR_MS)
      .first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE tag_code = ? AND created_at > ?")
      .bind(tag.code, now - 24 * HOUR_MS)
      .first<{ n: number }>(),
  ]);
  if ((byIp?.n ?? 0) >= REPORTS_PER_IP_PER_HOUR || (byTag?.n ?? 0) >= REPORTS_PER_TAG_PER_DAY) {
    throw new HttpError(429, "rate_limited", "Too many reports. Please try again later.");
  }

  const reportId = randomCode(12);
  const finderToken = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO reports (id, tag_code, finder_token_hash, finder_address, reporter_ip_hash, reward_luna, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(reportId, tag.code, await sha256Hex(finderToken), finderAddress, ipHash, tag.reward_luna, now, now),
    c.env.DB.prepare("INSERT INTO messages (id, report_id, sender, body, created_at) VALUES (?, ?, 'finder', ?, ?)").bind(
      randomCode(12),
      reportId,
      message,
      now,
    ),
  ]);

  return c.json({ reportId, finderToken, rewardNim: lunaToNim(tag.reward_luna) }, 201);
});

publicRoutes.get("/reports/:id", async (c) => {
  const report = await loadFinderReport(c);
  const { results } = await c.env.DB.prepare("SELECT * FROM messages WHERE report_id = ? ORDER BY created_at ASC")
    .bind(report.id)
    .all<MessageRow>();
  return c.json({
    report: { ...reportJson(report), tag: { label: report.tag_label, kind: report.tag_kind } },
    messages: results.map(messageJson),
  });
});

publicRoutes.post("/reports/:id/messages", async (c) => {
  const report = await loadFinderReport(c);
  const body = await readJson(c);
  const message = await addMessage(c.env.DB, report.id, "finder", requireText(body.body, "Message", MAX_MESSAGE_LENGTH), c.var.now);
  return c.json({ message: messageJson(message) }, 201);
});

publicRoutes.put("/reports/:id/finder-address", async (c) => {
  const report = await loadFinderReport(c);
  // Once the owner has started paying, the destination must not change underneath them.
  if (report.reward_status !== "none") {
    throw new HttpError(409, "reward_in_progress", "The reward payment has already started.");
  }
  const body = await readJson(c);
  const address = normalizeAddress(body.address);
  if (!address) throw new HttpError(400, "invalid_address", "A valid Nimiq address is required.");

  await c.env.DB.prepare("UPDATE reports SET finder_address = ?, updated_at = ? WHERE id = ?")
    .bind(address, c.var.now, report.id)
    .run();
  return c.json({ report: reportJson({ ...report, finder_address: address, updated_at: c.var.now }) });
});

/** Aggregate numbers only, for the public landing page. */
publicRoutes.get("/stats", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM tags WHERE status != 'archived') AS tags,
       (SELECT COUNT(*) FROM reports WHERE status = 'returned') AS returned,
       (SELECT COALESCE(SUM(reward_paid_luna), 0) FROM reports WHERE reward_status = 'paid') AS paid_luna`,
  ).first<{ tags: number; returned: number; paid_luna: number }>();
  return c.json({
    activeTags: row?.tags ?? 0,
    itemsReturned: row?.returned ?? 0,
    rewardsPaidNim: lunaToNim(row?.paid_luna ?? 0),
  });
});

async function loadActiveTag(db: Database, code: string): Promise<TagRow> {
  const tag = await db.prepare("SELECT * FROM tags WHERE code = ?").bind(code.toLowerCase()).first<TagRow>();
  if (!tag || tag.status === "archived") throw new HttpError(404, "tag_not_found", "This tag is not active.");
  return tag;
}

async function loadFinderReport(c: Context<AppEnv>) {
  const token = c.req.header("x-finder-token") ?? "";
  const report = await c.env.DB.prepare(
    `SELECT r.*, t.label AS tag_label, t.kind AS tag_kind FROM reports r JOIN tags t ON t.code = r.tag_code WHERE r.id = ?`,
  )
    .bind(c.req.param("id"))
    .first<ReportRow & { tag_label: string; tag_kind: string }>();
  if (!report || !token || report.finder_token_hash !== (await sha256Hex(token))) {
    throw new HttpError(404, "report_not_found", "Report not found.");
  }
  return report;
}

function hashIp(c: Context<AppEnv>): Promise<string> {
  // Vercel sets x-real-ip and x-forwarded-for; the first forwarded address is the visitor.
  const ip =
    c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? "unknown";
  return sha256Hex(`${c.env.SESSION_SECRET}:${ip}`);
}

function parseOptionalAddress(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const address = normalizeAddress(value);
  if (!address) throw new HttpError(400, "invalid_address", "That Nimiq address is not valid.");
  return address;
}
