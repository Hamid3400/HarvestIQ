import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma, waitForDatabase } from "./db.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import listingsRoutes from "./modules/listings/listings.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import scansRoutes from "./modules/scans/scans.routes.js";
import walletRoutes from "./modules/wallet/wallet.routes.js";
import webhooksRoutes from "./modules/wallet/webhooks.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import { ensureSystemAccounts } from "./modules/wallet/ledger.js";
import { runSettlementSweep } from "./modules/orders/settlement.js";

const app = express();

app.set("trust proxy", config.trustProxyHops);

app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/health" },
    customProps: (req) => ({ ip: (req as unknown as { ip?: string }).ip }),
  })
);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));

// Safety net for every route: 120 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Slow down." },
  })
);

// Webhooks need the exact raw bytes for signature checks, so they come BEFORE express.json
app.use("/api/webhooks", webhooksRoutes);

app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "harvestiq-api" });
});

app.get("/health/db", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    next(err);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/scans", scansRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

await waitForDatabase();
await ensureSystemAccounts();

const server = app.listen(config.port, () => {
  logger.info(`HarvestIQ API running on port ${config.port} (${config.env})`);
});

// Automatic escrow deadlines: refund overdue deliveries, release unconfirmed ones
const sweepTimer = setInterval(() => {
  runSettlementSweep().catch((err) =>
    logger.error({ err }, "Settlement sweep failed")
  );
}, config.sweepIntervalSeconds * 1000);
sweepTimer.unref();

// Finish in-flight requests before exiting, so a deploy never cuts a payment in half
function shutdown(signal: string) {
  clearInterval(sweepTimer);
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) =>
  logger.error({ reason }, "Unhandled rejection")
);