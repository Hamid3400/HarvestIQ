import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db.js";
import { AppError } from "../../errors.js";

export type Tx = Prisma.TransactionClient;

export const ESCROW_ACCOUNT_ID = "system-escrow";
export const EXTERNAL_ACCOUNT_ID = "system-external";

type LedgerTxType =
  | "DEPOSIT"
  | "ESCROW_HOLD"
  | "ESCROW_RELEASE"
  | "ESCROW_REFUND";

type Leg = { accountId: string; amountKobo: number };

// Called once at startup
export async function ensureSystemAccounts() {
  await prisma.account.upsert({
    where: { id: ESCROW_ACCOUNT_ID },
    update: {},
    create: { id: ESCROW_ACCOUNT_ID, type: "ESCROW" },
  });
  await prisma.account.upsert({
    where: { id: EXTERNAL_ACCOUNT_ID },
    update: {},
    create: { id: EXTERNAL_ACCOUNT_ID, type: "EXTERNAL" },
  });
}

// Every user gets a wallet the first time it is needed
export async function ensureWallet(tx: Tx, userId: string) {
  return tx.account.upsert({
    where: { userId },
    update: {},
    create: { type: "USER_WALLET", userId },
  });
}

export async function balanceOf(tx: Tx, accountId: string) {
  const result = await tx.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { amountKobo: true },
  });
  return result._sum.amountKobo ?? 0;
}

export async function postTransaction(
  tx: Tx,
  input: {
    type: LedgerTxType;
    idempotencyKey: string;
    orderId?: string;
    legs: Leg[];
    noOverdraft?: string[]; // account ids that must never go below zero
  }
) {
  // Rule 1: legs must balance to exactly zero, in whole kobo
  const sum = input.legs.reduce((s, l) => s + l.amountKobo, 0);
  const bad = input.legs.some(
    (l) => !Number.isInteger(l.amountKobo) || l.amountKobo === 0
  );
  if (sum !== 0 || bad) throw new Error("Unbalanced ledger transaction");

  // Rule 2: lock accounts that need an overdraft check, in a fixed order
  // so two payments can never deadlock each other
  const guarded = [...(input.noOverdraft ?? [])].sort();
  for (const accountId of guarded) {
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
  }

  // Rule 3: no overdrafts (checked while holding the lock)
  for (const accountId of guarded) {
    const change = input.legs
      .filter((l) => l.accountId === accountId)
      .reduce((s, l) => s + l.amountKobo, 0);
    if (change < 0 && (await balanceOf(tx, accountId)) + change < 0) {
      throw new AppError(402, "Insufficient wallet balance");
    }
  }

  return tx.ledgerTransaction.create({
    data: {
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      orderId: input.orderId,
      entries: {
        create: input.legs.map((l) => ({
          accountId: l.accountId,
          amountKobo: l.amountKobo,
        })),
      },
    },
  });
}