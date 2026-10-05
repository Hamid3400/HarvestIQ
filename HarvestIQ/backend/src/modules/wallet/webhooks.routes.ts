import express, { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { AppError } from "../../errors.js";
import {
  EXTERNAL_ACCOUNT_ID,
  ensureWallet,
  postTransaction,
} from "./ledger.js";

const router = Router();

// NOTE: this is a MOCK payload and signature scheme. The real OPay format
// must follow OPay's own documentation once you have partner credentials.
const webhookSchema = z.object({
  reference: z.string().min(8).max(100),
  userId: z.string().uuid(),
  amountKobo: z.number().int().min(100).max(2_000_000_000),
  status: z.enum(["SUCCESS", "FAILED"]),
});

function validSignature(rawBody: Buffer, signature: string) {
  const expected = createHmac("sha256", config.opayWebhookSecret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b); // constant-time compare
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

// express.raw keeps the exact bytes, which the signature is computed over
router.post(
  "/opay",
  express.raw({ type: "application/json", limit: "10kb" }),
  async (req, res) => {
    const rawBody = req.body;
    const signature = req.header("x-opay-signature") ?? "";

    if (!Buffer.isBuffer(rawBody) || !validSignature(rawBody, signature)) {
      throw new AppError(401, "Invalid signature");
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError(400, "Malformed JSON");
    }
    const payload = webhookSchema.parse(json);

    if (payload.status !== "SUCCESS") {
      return res.json({ status: "ignored" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) throw new AppError(422, "Unknown user");

    try {
      await prisma.$transaction(async (tx) => {
        const wallet = await ensureWallet(tx, user.id);
        await postTransaction(tx, {
          type: "DEPOSIT",
          idempotencyKey: `deposit-${payload.reference}`,
          legs: [
            { accountId: EXTERNAL_ACCOUNT_ID, amountKobo: -payload.amountKobo },
            { accountId: wallet.id, amountKobo: payload.amountKobo },
          ],
        });
      });
    } catch (err) {
      // Providers retry webhooks: a repeat of the same reference is not an error
      if (isUniqueViolation(err)) return res.json({ status: "already_processed" });
      throw err;
    }

    res.json({ status: "credited" });
  }
);

export default router;