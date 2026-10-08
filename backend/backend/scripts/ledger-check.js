import { prisma } from "../src/db.js";
let failed = false;
function check(label, ok, detail) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
    if (!ok)
        failed = true;
}
// 1. Money is never created or destroyed: all entries add up to zero
const total = await prisma.ledgerEntry.aggregate({ _sum: { amountKobo: true } });
check("All ledger entries sum to zero", (total._sum.amountKobo ?? 0) === 0, `sum = ${total._sum.amountKobo ?? 0}`);
// 2. Escrow holds exactly the money of orders still in flight
const escrow = await prisma.ledgerEntry.aggregate({
    where: { accountId: "system-escrow" },
    _sum: { amountKobo: true },
});
const inFlight = await prisma.order.aggregate({
    where: { status: { in: ["PAID", "DELIVERED", "DISPUTED"] } },
    _sum: { totalKobo: true },
});
const escrowBal = escrow._sum.amountKobo ?? 0;
const inFlightTotal = inFlight._sum.totalKobo ?? 0;
check("Escrow equals money in unfinished orders", escrowBal === inFlightTotal, `escrow = ${escrowBal}, orders = ${inFlightTotal}`);
// 3. No user wallet is below zero
const groups = await prisma.ledgerEntry.groupBy({ by: ["accountId"], _sum: { amountKobo: true } });
const accounts = await prisma.account.findMany({ select: { id: true, type: true } });
const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
const negative = groups.filter((g) => typeOf.get(g.accountId) === "USER_WALLET" && (g._sum.amountKobo ?? 0) < 0);
check("No wallet is overdrawn", negative.length === 0, `${negative.length} negative wallets`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
