import { Router } from "express";
import { prisma } from "../../db.js";
import { AppError } from "../../errors.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import {
  createListingSchema,
  idParamSchema,
  listQuerySchema,
  updateListingSchema,
} from "./listings.schemas.js";

const router = Router();
router.use(authenticate);

// What other users are allowed to see (no farmer email or phone)
const publicSelect = {
  id: true,
  cropName: true,
  description: true,
  quantityKg: true,
  pricePerKgKobo: true,
  location: true,
  createdAt: true,
  farmer: { select: { id: true, fullName: true } },
} as const;

router.get("/", async (req, res) => {
  const { crop, page, limit } = listQuerySchema.parse(req.query);
  const where = {
    status: "ACTIVE" as const,
    quantityKg: { gt: 0 },
    ...(crop ? { cropName: { contains: crop, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: publicSelect,
    }),
    prisma.listing.count({ where }),
  ]);
  res.json({ items, total, page, limit });
});

// Must be defined before "/:id"
router.get("/mine", requireRole("FARMER"), async (req, res) => {
  const items = await prisma.listing.findMany({
    where: { farmerId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items });
});

router.get("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const listing = await prisma.listing.findFirst({
    where: { id, status: "ACTIVE" },
    select: publicSelect,
  });
  if (!listing) throw new AppError(404, "Listing not found");
  res.json(listing);
});

router.post("/", requireRole("FARMER"), async (req, res) => {
  const data = createListingSchema.parse(req.body);
  const listing = await prisma.listing.create({
    data: { ...data, farmerId: req.user!.id },
  });
  res.status(201).json(listing);
});

router.patch("/:id", requireRole("FARMER"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const data = updateListingSchema.parse(req.body);
  const result = await prisma.listing.updateMany({
    where: { id, farmerId: req.user!.id }, // ownership enforced in the query
    data,
  });
  if (result.count === 0) throw new AppError(404, "Listing not found");
  res.json(await prisma.listing.findUnique({ where: { id } }));
});

router.delete("/:id", requireRole("FARMER"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const result = await prisma.listing.updateMany({
    where: { id, farmerId: req.user!.id },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) throw new AppError(404, "Listing not found");
  res.status(204).end();
});

export default router;