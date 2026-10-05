import { Router } from "express";
import { prisma } from "../../db.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { idParamSchema } from "../listings/listings.schemas.js";
import { createOrderSchema, disputeSchema } from "./orders.schemas.js";
import * as orders from "./orders.service.js";

const router = Router();
router.use(authenticate);

const buyers = requireRole("BUYER", "PROCESSOR");

router.post("/", buyers, async (req, res) => {
  const { listingId, quantityKg } = createOrderSchema.parse(req.body);
  res.status(201).json(await orders.createOrder(req.user!.id, listingId, quantityKg));
});

router.get("/mine", buyers, async (req, res) => {
  const items = await prisma.order.findMany({
    where: { buyerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { cropName: true, location: true } },
    },
  });
  res.json({ items });
});

// Farmers see orders placed on their own listings
router.get("/received", requireRole("FARMER"), async (req, res) => {
  const items = await prisma.order.findMany({
    where: { listing: { farmerId: req.user!.id } },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { cropName: true } },
      buyer: { select: { fullName: true } },
    },
  });
  res.json({ items });
});

router.post("/:id/cancel", buyers, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await orders.cancelOrder(req.user!.id, id));
});

router.post("/:id/pay", buyers, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await orders.payOrder(req.user!.id, id));
});

router.post("/:id/confirm", buyers, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await orders.confirmDelivery(req.user!.id, id));
});

router.post("/:id/refund", requireRole("FARMER"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await orders.refundOrder(req.user!.id, id));
});

router.post("/:id/deliver", requireRole("FARMER"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await orders.markDelivered(req.user!.id, id));
});

router.post("/:id/dispute", buyers, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { reason } = disputeSchema.parse(req.body);
  res.status(201).json(await orders.openDispute(req.user!.id, id, reason));
});

export default router;