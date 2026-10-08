import { Router } from "express";
import { prisma } from "../../db.js";
import { authenticate } from "../../middleware/auth.js";
import { balanceOf, ensureWallet } from "./ledger.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const wallet = await ensureWallet(prisma, req.user!.id);
  const [balanceKobo, recent] = await Promise.all([
    balanceOf(prisma, wallet.id),
    prisma.ledgerEntry.findMany({
      where: { accountId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        amountKobo: true,
        createdAt: true,
        transaction: { select: { type: true, orderId: true } },
      },
    }),
  ]);
  res.json({ balanceKobo, recent });
});

export default router;