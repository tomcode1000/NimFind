import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { findPayment } from "../lib/chain";
import type { Database } from "../lib/db";
import { HttpError } from "../lib/http";
import { nimToLuna, normalizeAddress } from "../lib/nimiq";
import { randomCode } from "../lib/security";
import { requireAuth } from "./auth";
import { fetchTransactions } from "./reports";

/** A designer wallpaper costs this much unless the deployment sets another price. */
export const DEFAULT_WALLPAPER_PRICE_NIM = 100;
/** Saving the same wallpaper again within this window reuses the payment instead of charging twice. */
const REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface PurchaseRow {
  id: string;
  buyer_address: string;
  price_luna: number;
  payment_data: string;
  status: "pending" | "paid";
  tx_hash: string | null;
  used_at: number | null;
  used_code: string | null;
  used_design: string | null;
}

/**
 * Designer wallpapers are bought one at a time: the owner pays in Nimiq Pay, NimFind finds that
 * exact payment on chain, and the credit is spent when the wallpaper is saved.
 */
export const wallpaperPurchases = new Hono<AppEnv>();
wallpaperPurchases.use("*", requireAuth);

wallpaperPurchases.get("/", async (c) =>
  c.json({
    priceNim: priceNim(c.env),
    available: Boolean(normalizeAddress(c.env.TREASURY_ADDRESS)),
    credits: await countCredits(c.env.DB, c.var.address),
  }),
);

wallpaperPurchases.post("/prepare", async (c) => {
  const treasury = requireTreasury(c.env);
  const luna = nimToLuna(priceNim(c.env));

  // One pending payment at a time: a wallet that started and abandoned one gets the same tag back.
  let row = await c.env.DB.prepare(
    "SELECT * FROM wallpaper_purchases WHERE buyer_address = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(c.var.address)
    .first<PurchaseRow>();

  if (!row || row.price_luna !== luna) {
    const id = randomCode(12);
    await c.env.DB.prepare(
      `INSERT INTO wallpaper_purchases (id, buyer_address, price_luna, payment_data, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    )
      .bind(id, c.var.address, luna, `NF:W:${id}`, c.var.now)
      .run();
    row = (await c.env.DB.prepare("SELECT * FROM wallpaper_purchases WHERE id = ?").bind(id).first<PurchaseRow>())!;
  }

  return c.json({ payment: { recipient: treasury, valueLuna: row.price_luna, data: row.payment_data } });
});

wallpaperPurchases.post("/confirm", async (c) => {
  const treasury = requireTreasury(c.env);
  const row = await c.env.DB.prepare(
    "SELECT * FROM wallpaper_purchases WHERE buyer_address = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(c.var.address)
    .first<PurchaseRow>();
  if (!row) throw new HttpError(409, "not_prepared", "Start the payment first.");

  // Search the treasury, not the buyer: Nimiq Pay may pay from another account in the same wallet.
  const transactions = await fetchTransactions(c.var.chain, treasury, 100);
  const payment = findPayment(transactions, { to: treasury, minValueLuna: row.price_luna, data: row.payment_data });
  if (!payment) return c.json({ paid: false, pending: true, credits: await countCredits(c.env.DB, c.var.address) }, 202);

  await c.env.DB.prepare("UPDATE wallpaper_purchases SET status = 'paid', tx_hash = ?, paid_at = ? WHERE id = ? AND status = 'pending'")
    .bind(payment.hash, c.var.now, row.id)
    .run();
  return c.json({ paid: true, txHash: payment.hash, credits: await countCredits(c.env.DB, c.var.address) });
});

/**
 * Spends one paid wallpaper on this design, or reuses the payment if the same wallpaper was saved
 * in the last day. Always allowed while no treasury is configured, so a deployment without one
 * simply gives the designs away.
 */
export async function spendWallpaperCredit(
  db: Database,
  env: Env,
  address: string,
  wallpaper: { code: string; design: string },
  now: number,
): Promise<void> {
  if (!normalizeAddress(env.TREASURY_ADDRESS)) return;

  const reused = await db
    .prepare(
      `SELECT id FROM wallpaper_purchases
       WHERE buyer_address = ? AND status = 'paid' AND used_code = ? AND used_design = ? AND used_at > ?
       LIMIT 1`,
    )
    .bind(address, wallpaper.code, wallpaper.design, now - REUSE_WINDOW_MS)
    .first<{ id: string }>();
  if (reused) return;

  const spent = await db
    .prepare(
      `UPDATE wallpaper_purchases SET used_at = ?, used_code = ?, used_design = ?
       WHERE id = (
         SELECT id FROM wallpaper_purchases
         WHERE buyer_address = ? AND status = 'paid' AND used_at IS NULL
         ORDER BY paid_at ASC LIMIT 1
       )`,
    )
    .bind(now, wallpaper.code, wallpaper.design, address)
    .run();

  if (spent.meta.changes === 0) {
    throw new HttpError(
      402,
      "payment_required",
      `Designer wallpapers cost ${priceNim(env)} NIM each. Pay in Nimiq Pay to save this one.`,
    );
  }
}

export function priceNim(env: Env): number {
  const price = Number(env.WALLPAPER_PRICE_NIM);
  return Number.isFinite(price) && price > 0 ? price : DEFAULT_WALLPAPER_PRICE_NIM;
}

function requireTreasury(env: Env): string {
  const treasury = normalizeAddress(env.TREASURY_ADDRESS);
  if (!treasury) throw new HttpError(503, "payments_unavailable", "Wallpaper payments are not set up yet.");
  return treasury;
}

function countCredits(db: Database, address: string): Promise<number> {
  return db
    .prepare("SELECT COUNT(*) AS n FROM wallpaper_purchases WHERE buyer_address = ? AND status = 'paid' AND used_at IS NULL")
    .bind(address)
    .first<{ n: number }>()
    .then((row) => row?.n ?? 0);
}
