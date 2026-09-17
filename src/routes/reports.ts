import { Hono } from "hono";
import type { AppEnv } from "../env";
import { findPayment } from "../lib/chain";
import { HttpError, oneOf, readJson, requireText, rewardLuna } from "../lib/http";
import { messageJson, reportJson, type MessageRow, type ReportRow } from "../lib/records";
import { randomCode } from "../lib/security";
import { requireAuth } from "./auth";

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_MESSAGES_PER_REPORT = 200;

type OwnedReport = ReportRow & { owner_address: string; tag_label: string; tag_kind: string };

export const reports = new Hono<AppEnv>();
reports.use("*", requireAuth);

/** Inbox across all of the owner's tags, newest activity first. */
reports.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, t.label AS tag_label, t.kind AS tag_kind,
       (SELECT body FROM messages m WHERE m.report_id = r.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
     FROM reports r JOIN tags t ON t.code = r.tag_code
     WHERE t.owner_address = ? ORDER BY r.updated_at DESC LIMIT 100`,
  )
    .bind(c.var.address)
    .all<OwnedReport & { last_message: string | null }>();

  return c.json({
    reports: results.map((row) => ({
      ...reportJson(row),
      tag: { label: row.tag_label, kind: row.tag_kind },
      lastMessage: row.last_message,
    })),
  });
});

reports.get("/:id", async (c) => {
  const report = await loadOwnReport(c.env.DB, c.req.param("id"), c.var.address);
  const { results } = await c.env.DB.prepare("SELECT * FROM messages WHERE report_id = ? ORDER BY created_at ASC")
    .bind(report.id)
    .all<MessageRow>();
  return c.json({
    report: { ...reportJson(report), tag: { label: report.tag_label, kind: report.tag_kind } },
    messages: results.map(messageJson),
  });
});

reports.post("/:id/messages", async (c) => {
  const report = await loadOwnReport(c.env.DB, c.req.param("id"), c.var.address);
  const body = await readJson(c);
  const message = await addMessage(c.env.DB, report.id, "owner", requireText(body.body, "Message", MAX_MESSAGE_LENGTH), c.var.now);
  return c.json({ message: messageJson(message) }, 201);
});

reports.post("/:id/status", async (c) => {
  const report = await loadOwnReport(c.env.DB, c.req.param("id"), c.var.address);
  const body = await readJson(c);
  const status = oneOf(body.status, ["open", "returned", "closed"] as const, "Status");
  await c.env.DB.prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ?").bind(status, c.var.now, report.id).run();
  return c.json({ report: reportJson({ ...report, status, updated_at: c.var.now }) });
});

/**
 * Returns the exact payment for the owner to approve in Nimiq Pay. The data tag lets
 * the server match that specific payment on chain afterwards.
 */
reports.post("/:id/reward/prepare", async (c) => {
  const report = await loadOwnReport(c.env.DB, c.req.param("id"), c.var.address);
  if (report.reward_status === "paid") throw new HttpError(409, "reward_paid", "This reward has already been paid.");
  if (!report.finder_address) {
    throw new HttpError(409, "finder_address_missing", "The finder has not shared a Nimiq address yet.");
  }

  const body = await readJson(c);
  const amount = body.amountNim === undefined ? report.reward_luna : rewardLuna(body.amountNim, "Amount");
  if (amount <= 0) throw new HttpError(400, "invalid_input", "Reward amount must be greater than 0 NIM.");

  const data = report.reward_data ?? `HW:R:${report.id}`;
  await c.env.DB.prepare(
    "UPDATE reports SET reward_luna = ?, reward_data = ?, reward_status = 'awaiting_payment', updated_at = ? WHERE id = ?",
  )
    .bind(amount, data, c.var.now, report.id)
    .run();

  return c.json({ payment: { recipient: report.finder_address, valueLuna: amount, data } });
});

reports.post("/:id/reward/confirm", async (c) => {
  const report = await loadOwnReport(c.env.DB, c.req.param("id"), c.var.address);
  if (report.reward_status === "paid") return c.json({ report: reportJson(report) });
  if (report.reward_status !== "awaiting_payment" || !report.reward_data || !report.finder_address) {
    throw new HttpError(409, "reward_not_prepared", "Start the reward payment first.");
  }

  const transactions = await fetchTransactions(c.var.chain, report.finder_address);
  const payment = findPayment(transactions, {
    to: report.finder_address,
    minValueLuna: report.reward_luna,
    data: report.reward_data,
  });
  if (!payment) return c.json({ report: reportJson(report), pending: true }, 202);

  const paid: ReportRow = {
    ...report,
    status: "returned",
    reward_status: "paid",
    reward_tx_hash: payment.hash,
    reward_paid_luna: payment.value,
    reward_paid_at: c.var.now,
    updated_at: c.var.now,
  };
  await c.env.DB.prepare(
    `UPDATE reports SET status = 'returned', reward_status = 'paid', reward_tx_hash = ?, reward_paid_luna = ?,
       reward_paid_at = ?, updated_at = ? WHERE id = ? AND reward_status != 'paid'`,
  )
    .bind(payment.hash, payment.value, c.var.now, c.var.now, report.id)
    .run();

  return c.json({ report: reportJson(paid) });
});

export async function addMessage(
  db: D1Database,
  reportId: string,
  sender: MessageRow["sender"],
  body: string,
  now: number,
): Promise<MessageRow> {
  const count = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE report_id = ?").bind(reportId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MESSAGES_PER_REPORT) {
    throw new HttpError(429, "message_limit", "This conversation has reached its message limit.");
  }
  const message: MessageRow = { id: randomCode(12), report_id: reportId, sender, body, created_at: now };
  await db.batch([
    db.prepare("INSERT INTO messages (id, report_id, sender, body, created_at) VALUES (?, ?, ?, ?, ?)").bind(
      message.id,
      reportId,
      sender,
      body,
      now,
    ),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(now, reportId),
  ]);
  return message;
}

export async function fetchTransactions(chain: AppEnv["Variables"]["chain"], address: string, max = 50) {
  try {
    return await chain.getTransactionsByAddress(address, max);
  } catch {
    throw new HttpError(502, "chain_unavailable", "Could not reach the Nimiq network. Please try again shortly.");
  }
}

async function loadOwnReport(db: D1Database, id: string, owner: string): Promise<OwnedReport> {
  const report = await db
    .prepare(
      `SELECT r.*, t.owner_address, t.label AS tag_label, t.kind AS tag_kind
       FROM reports r JOIN tags t ON t.code = r.tag_code WHERE r.id = ?`,
    )
    .bind(id)
    .first<OwnedReport>();
  if (!report || report.owner_address !== owner) throw new HttpError(404, "report_not_found", "Report not found.");
  return report;
}
