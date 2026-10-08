import { prisma } from "../../db.js";
import { AppError } from "../../errors.js";
import { logger } from "../../logger.js";
import { refundToBuyer, releaseToFarmer } from "../orders/settlement.js";

export async function resolveDispute(
  adminId: string,
  disputeId: string,
  outcome: "RELEASED_TO_FARMER" | "REFUNDED_TO_BUYER",
  note: string
) {
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: { include: { listing: { select: { farmerId: true } } } },
      },
    });
    if (!dispute) throw new AppError(404, "Dispute not found");

    const { order } = dispute;
    // An admin who is a party to the order cannot judge it
    if (order.buyerId === adminId || order.listing.farmerId === adminId) {
      throw new AppError(403, "You cannot resolve a dispute you are part of");
    }

    const closed = await tx.dispute.updateMany({
      where: { id: dispute.id, status: "OPEN" },
      data: {
        status: "RESOLVED",
        outcome,
        resolvedById: adminId,
        resolutionNote: note,
        resolvedAt: new Date(),
      },
    });
    if (closed.count !== 1) throw new AppError(409, "Dispute already resolved");

    const release = outcome === "RELEASED_TO_FARMER";
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: "DISPUTED" },
      data: { status: release ? "COMPLETED" : "CANCELLED" },
    });
    if (moved.count !== 1) throw new AppError(409, "Order is not in dispute");

    if (release) await releaseToFarmer(tx, order, order.listing.farmerId);
    else await refundToBuyer(tx, order);

    logger.info({ adminId, disputeId, outcome }, "Dispute resolved");
    return { id: dispute.id, status: "RESOLVED", outcome };
  });
}