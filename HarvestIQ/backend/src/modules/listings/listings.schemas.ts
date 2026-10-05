import { z } from "zod";

export const createListingSchema = z.object({
  cropName: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  quantityKg: z.number().int().min(1).max(1_000_000),
  pricePerKgKobo: z.number().int().min(100).max(100_000_000),
  location: z.string().trim().min(2).max(100),
});

export const updateListingSchema = createListingSchema
  .partial()
  .extend({ status: z.enum(["ACTIVE", "CANCELLED"]).optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const listQuerySchema = z.object({
  crop: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const idParamSchema = z.object({ id: z.string().uuid() });