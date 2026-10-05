import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { config } from "./config.js";

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 15000, // wait up to 15s for a sleeping database
  idleTimeoutMillis: 10000, // drop idle connections before Neon drops them for us
  keepAlive: true,
  max: 10,
});

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: { maxWait: 15000, timeout: 30000 },
});

// Called once at startup: retries while the database wakes up
export async function waitForDatabase(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Database not ready (attempt ${i}/${attempts}), retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}