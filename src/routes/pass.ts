import type { Database } from "../lib/db";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { findPayment } from "../lib/chain";
import { HttpError } from "../lib/http";
import { nimToLuna, normalizeAddress } from "../lib/nimiq";
import { randomCode } from "../lib/security";
import { requireAuth } from "./auth";
import { fetchTransactions } from "./reports";

interface PassRow {
  id: string;
  buyer_address: string;
  period: string;
  price_luna: number;
  payment_data: string;
  status: "pending" | "paid";
  tx_hash: string | null;
  paid_at: number | null;
}

/** The Designer Pass unlocks designer wallpapers and the calendar layer for one calendar month (UTC). */
export const pass = new Hono<AppEnv>();
pass.use("*", requireAuth);

pass.get("/", async (c) => {
  const period = currentPeriod(c.var.now);
  const row = await loadPass(c.env.DB, c.var.address, period);
  return c.json({
    period,
    priceNim: configuredPrice(c).nim,
    active: row?.status === "paid",
    txHash: row?.tx_hash ?? null,
  });
});

pass.post("/prepare", async (c) => {
  const treasury = normalizeAddress(c.env.TREASURY_ADDRESS);
  if (!treasury) throw new HttpError(503, "pass_unavailable", "The Designer Pass is not available yet.");

  const period = currentPeriod(c.var.now);
  let row = await loadPass(c.env.DB, c.var.address, period);
  if (row?.status === "paid") throw new HttpError(409, "pass_active", "Your Designer Pass is already active this month.");

  if (!row) {
    const id = randomCode(12);
    row = {
      id,
      buyer_address: c.var.address,
      period,
      price_luna: configuredPrice(c).luna,
      payment_data: `NF:P:${id}`,
      status: "pending",
      tx_hash: null,
      paid_at: null,
    };
    await c.env.DB.prepare(
      `INSERT INTO passes (id, buyer_address, period, price_luna, payment_data, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(buyer_address, period) DO NOTHING`,
    )
      .bind(row.id, row.buyer_address, period, row.price_luna, row.payment_data, c.var.now)
      .run();
    // Another request may have created the row first; always answer with the stored one.
    row = (await loadPass(c.env.DB, c.var.address, period))!;
  }

  return c.json({ payment: { recipient: treasury, valueLuna: row.price_luna, data: row.payment_data } });
});

pass.post("/confirm", async (c) => {
  const treasury = normalizeAddress(c.env.TREASURY_ADDRESS);
  if (!treasury) throw new HttpError(503, "pass_unavailable", "The Designer Pass is not available yet.");

  const period = currentPeriod(c.var.now);
  const row = await loadPass(c.env.DB, c.var.address, period);
  if (!row) throw new HttpError(409, "pass_not_prepared", "Start the Designer Pass payment first.");
  if (row.status === "paid") return c.json({ period, active: true, txHash: row.tx_hash });

  // Search the treasury, not the buyer: the buyer may pay from another account in their wallet.
  const transactions = await fetchTransactions(c.var.chain, treasury, 100);
  const payment = findPayment(transactions, {
    to: treasury,
    minValueLuna: row.price_luna,
    data: row.payment_data,
  });
  if (!payment) return c.json({ period, active: false, pending: true }, 202);

  await c.env.DB.prepare("UPDATE passes SET status = 'paid', tx_hash = ?, paid_at = ? WHERE id = ? AND status = 'pending'")
    .bind(payment.hash, c.var.now, row.id)
    .run();
  return c.json({ period, active: true, txHash: payment.hash });
});

/** Whether this wallet may use Designer Pass features right now. Always true while the pass is not offered. */
export async function hasDesignerAccess(db: Database, env: AppEnv["Bindings"], address: string, now: number): Promise<boolean> {
  if (!normalizeAddress(env.TREASURY_ADDRESS)) return true;
  const row = await loadPass(db, address, currentPeriod(now));
  return row?.status === "paid";
}

function currentPeriod(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

function configuredPrice(c: Context<AppEnv>) {
  const nim = Number(c.env.PASS_PRICE_NIM);
  const safeNim = Number.isFinite(nim) && nim > 0 ? nim : 1000;
  return { nim: safeNim, luna: nimToLuna(safeNim) };
}

async function loadPass(db: Database, buyer: string, period: string) {
  return db.prepare("SELECT * FROM passes WHERE buyer_address = ? AND period = ?").bind(buyer, period).first<PassRow>();
}
