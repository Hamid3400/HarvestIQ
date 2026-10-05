import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import {
  ESCROW_ACCOUNT_ID,
  ensureWallet,
  postTransaction,
  type Tx,
} from "../wallet/ledger.js";

type SettleableOrder = {
  id: string;
  buyerId: string;
  listingId: string;
  quantityKg: number;
  totalKobo: number;
};

// Escrow -> farmer
export async function releaseToFarmer(
  tx: Tx,
  order: SettleableOrder,
  farmerId: string
) {
  const wallet = await ensureWallet(tx, farmerId);
  await postTransaction(tx, {
    type: "ESCROW_RELEASE",
    idempotencyKey: `order-release-${order.id}`,
    orderId: order.id,
    legs: [
      { accountId: ESCROW_ACCOUNT_ID, amountKobo: -order.totalKobo },
      { accountId: wallet.id, amountKobo: order.totalKobo },
    ],
  });
}

// Escrow -> buyer, and the stock goes back on sale
export async function refundToBuyer(tx: Tx, order: SettleableOrder) {
  const wallet = await ensureWallet(tx, order.buyerId);
  await postTransaction(tx, {
    type: "ESCROW_REFUND",
    idempotencyKey: `order-refund-${order.id}`,
    orderId: order.id,
    legs: [
      { accountId: ESCROW_ACCOUNT_ID, amountKobo: -order.totalKobo },
      { accountId: wallet.id, amountKobo: order.totalKobo },
    ],
  });
  await tx.listing.updateMany({
    where: { id: order.listingId, status: "SOLD_OUT" },
    data: { status: "ACTIVE" },
  });
  await tx.listing.update({
    where: { id: order.listingId },
    data: { quantityKg: { increment: order.quantityKg } },
  });
}

async function autoRefund(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "CANCELLED" },
    });
    if (moved.count !== 1) return; // someone else already settled it
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await refundToBuyer(tx, order);
  });
}

async function autoRelease(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: "DELIVERED" },
      data: { status: "COMPLETED" },
    });
    if (moved.count !== 1) return;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { listing: { select: { farmerId: true } } },
    });
    await releaseToFarmer(tx, order, order.listing.farmerId);
  });
}

// Runs on a timer. Safe to run twice at once: every step is guarded.
export async function runSettlementSweep() {
  const now = Date.now();
  const refundBefore = new Date(now - config.deliveryDeadlineHours * 3_600_000);
  const releaseBefore = new Date(now - config.confirmWindowHours * 3_600_000);

  const overdue = await prisma.order.findMany({
    where: { status: "PAID", paidAt: { lt: refundBefore } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of overdue) {
    try {
      await autoRefund(id);
      logger.info({ orderId: id }, "Auto-refunded: farmer missed delivery deadline");
    } catch (err) {
      logger.error({ err, orderId: id }, "Auto-refund failed");
    }
  }

  const unconfirmed = await prisma.order.findMany({
    where: { status: "DELIVERED", deliveredAt: { lt: releaseBefore } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of unconfirmed) {
    try {
      await autoRelease(id);
      logger.info({ orderId: id }, "Auto-released: buyer did not respond in time");
    } catch (err) {
      logger.error({ err, orderId: id }, "Auto-release failed");
    }
  }
}