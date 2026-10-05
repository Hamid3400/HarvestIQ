import { z } from "zod";

export const createOrderSchema = z.object({
  listingId: z.string().uuid(),
  quantityKg: z.number().int().min(1).max(1_000_000),
});

export const disputeSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});