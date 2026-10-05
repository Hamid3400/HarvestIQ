import { Router } from "express";
import { prisma } from "../../db.js";
import { AppError } from "../../errors.js";
import { authenticate, requireRole } from "../../middleware/auth.js";

const router = Router();

router.use(authenticate); // everything below needs a valid login

router.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) throw new AppError(404, "User not found");
  res.json(user);
});

// Temporary route to prove role protection works
router.get("/admin-check", requireRole("ADMIN"), (_req, res) => {
  res.json({ message: "You are an admin" });
});

export default router;