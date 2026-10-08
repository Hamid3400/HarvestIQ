import { describe, expect, it } from "vitest";
import { postTransaction, type Tx } from "../src/modules/wallet/ledger.js";

// These rules are checked before any database call, so a fake tx is enough
const fakeTx = {} as Tx;

describe("ledger rules", () => {
  it("rejects a transaction that does not add up to zero", async () => {
    await expect(
      postTransaction(fakeTx, {
        type: "DEPOSIT",
        idempotencyKey: "t1",
        legs: [
          { accountId: "a", amountKobo: 100 },
          { accountId: "b", amountKobo: -50 },
        ],
      })
    ).rejects.toThrow("Unbalanced");
  });

  it("rejects fractional kobo", async () => {
    await expect(
      postTransaction(fakeTx, {
        type: "DEPOSIT",
        idempotencyKey: "t2",
        legs: [
          { accountId: "a", amountKobo: 10.5 },
          { accountId: "b", amountKobo: -10.5 },
        ],
      })
    ).rejects.toThrow("Unbalanced");
  });

  it("rejects zero amounts", async () => {
    await expect(
      postTransaction(fakeTx, {
        type: "DEPOSIT",
        idempotencyKey: "t3",
        legs: [
          { accountId: "a", amountKobo: 0 },
          { accountId: "b", amountKobo: 0 },
        ],
      })
    ).rejects.toThrow("Unbalanced");
  });
});