import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  email,
  password: z.string().min(10).max(128),
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, "Invalid phone number")
    .optional(),
  role: z.enum(["FARMER", "BUYER", "PROCESSOR"]), // ADMIN can never self-register
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const tokenSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});