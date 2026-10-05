import { prisma } from "../../db.js";
import { AppError } from "../../errors.js";
import {
  ESCROW_ACCOUNT_ID,
  ensureWallet,
  postTransaction,
} from "../wallet/ledger.js";
import { refundToBuyer, releaseToFarmer } from "./settlement.js";

const MAX_ORDER_KOBO = 2_000_000_000; // fits a 32-bit integer; we can widen this later with BigInt

export async function createOrder(
  buyerId: string,
  listingId: string,
  quantityKg: number
) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "ACTIVE") {
      throw new AppError(404, "Listing not available");
    }
    if (listing.farmerId === buyerId) {
      throw new AppError(400, "You cannot buy your own listing");
    }

    const total = listing.pricePerKgKobo * quantityKg;
    if (total > MAX_ORDER_KOBO) throw new AppError(400, "Order value too large");

    // One atomic step: only succeeds if enough stock remains and the price is unchanged
    const reserved = await tx.listing.updateMany({
      where: {
        id: listing.id,
        status: "ACTIVE",
        quantityKg: { gte: quantityKg },
        pricePerKgKobo: listing.pricePerKgKobo,
      },
      data: { quantityKg: { decrement: quantityKg } },
    });
    if (reserved.count !== 1) {
      throw new AppError(409, "Not enough stock or the price changed. Please retry.");
    }

    await tx.listing.updateMany({
      where: { id: listing.id, status: "ACTIVE", quantityKg: 0 },
      data: { status: "SOLD_OUT" },
    });

    return tx.order.create({
      data: {
        buyerId,
        listingId: listing.id,
        quantityKg,
        unitPriceKobo: listing.pricePerKgKobo,
        totalKobo: total,
      },
    });
  });
}

// Buyer pays: money moves from their wallet into escrow
export async function payOrder(buyerId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, buyerId } });
    if (!order) throw new AppError(404, "Order not found");

    // Atomic guard: only one request can move PENDING to PAID
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (moved.count !== 1) throw new AppError(409, "Order is not awaiting payment");

    const wallet = await ensureWallet(tx, buyerId);
    // If the balance is too low this throws and the status change rolls back too
    await postTransaction(tx, {
      type: "ESCROW_HOLD",
      idempotencyKey: `order-hold-${order.id}`,
      orderId: order.id,
      legs: [
        { accountId: wallet.id, amountKobo: -order.totalKobo },
        { accountId: ESCROW_ACCOUNT_ID, amountKobo: order.totalKobo },
      ],
      noOverdraft: [wallet.id],
    });

    return { id: order.id, status: "PAID" };
  });
}

// Farmer says the goods were handed over: starts the buyer's confirmation window
export async function markDelivered(farmerId: string, orderId: string) {
  const moved = await prisma.order.updateMany({
    where: { id: orderId, status: "PAID", listing: { farmerId } },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
  if (moved.count !== 1) {
    throw new AppError(409, "Order not found or not in a deliverable state");
  }
  return { id: orderId, status: "DELIVERED" };
}

// Buyer confirms: escrow pays the farmer
export async function confirmDelivery(buyerId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, buyerId },
      include: { listing: { select: { farmerId: true } } },
    });
    if (!order) throw new AppError(404, "Order not found");

    const moved = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["PAID", "DELIVERED"] } },
      data: { status: "COMPLETED" },
    });
    if (moved.count !== 1) {
      throw new AppError(409, "Order is not awaiting confirmation");
    }

    await releaseToFarmer(tx, order, order.listing.farmerId);
    return { id: order.id, status: "COMPLETED" };
  });
}

// Farmer cancels and refunds the buyer
export async function refundOrder(farmerId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, listing: { farmerId } },
    });
    if (!order) throw new AppError(404, "Order not found");

    const moved = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["PAID", "DELIVERED"] } },
      data: { status: "CANCELLED" },
    });
    if (moved.count !== 1) {
      throw new AppError(409, "Only paid orders can be refunded");
    }

    await refundToBuyer(tx, order);
    return { id: order.id, status: "CANCELLED" };
  });
}

// Buyer disagrees with the farmer's "delivered": freezes the money for an admin
export async function openDispute(
  buyerId: string,
  orderId: string,
  reason: string
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, buyerId } });
    if (!order) throw new AppError(404, "Order not found");

    const moved = await tx.order.updateMany({
      where: { id: order.id, status: "DELIVERED" },
      data: { status: "DISPUTED" },
    });
    if (moved.count !== 1) {
      throw new AppError(409, "Only delivered orders can be disputed");
    }

    await tx.dispute.create({
      data: { orderId: order.id, openedById: buyerId, reason },
    });
    return { id: order.id, status: "DISPUTED" };
  });
}

// Buyer cancels an order they have not paid for yet
export async function cancelOrder(buyerId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, buyerId } });
    if (!order) throw new AppError(404, "Order not found");

    const changed = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) {
      throw new AppError(409, "Only pending orders can be cancelled");
    }

    // Put the stock back
    await tx.listing.updateMany({
      where: { id: order.listingId, status: "SOLD_OUT" },
      data: { status: "ACTIVE" },
    });
    await tx.listing.update({
      where: { id: order.listingId },
      data: { quantityKg: { increment: order.quantityKg } },
    });

    return { id: order.id, status: "CANCELLED" };
  });
}