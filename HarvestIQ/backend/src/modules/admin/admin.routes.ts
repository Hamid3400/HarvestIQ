import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { idParamSchema } from "../listings/listings.schemas.js";
import { resolveDispute } from "./admin.service.js";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

const resolveSchema = z.object({
  outcome: z.enum(["RELEASED_TO_FARMER", "REFUNDED_TO_BUYER"]),
  note: z.string().trim().min(5).max(500),
});

router.get("/disputes", async (_req, res) => {
  const items = await prisma.dispute.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          totalKobo: true,
          quantityKg: true,
          buyer: { select: { fullName: true, email: true } },
          listing: {
            select: {
              cropName: true,
              farmer: { select: { fullName: true, email: true } },
            },
          },
        },
      },
    },
  });
  res.json({ items });
});

router.post("/disputes/:id/resolve", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { outcome, note } = resolveSchema.parse(req.body);
  res.json(await resolveDispute(req.user!.id, id, outcome, note));
});

export default router;