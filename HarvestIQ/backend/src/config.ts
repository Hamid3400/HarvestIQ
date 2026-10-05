import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GEMINI_API_KEY: z.string().min(20),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  OPAY_WEBHOOK_SECRET: z.string().min(32),
  DELIVERY_DEADLINE_HOURS: z.coerce.number().positive().default(168),
  CONFIRM_WINDOW_HOURS: z.coerce.number().positive().default(72),
  SWEEP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (
  parsed.data.NODE_ENV === "production" &&
  parsed.data.CORS_ORIGINS.includes("localhost")
) {
  console.error("CORS_ORIGINS must not contain localhost in production");
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()),
  isProd: parsed.data.NODE_ENV === "production",
  databaseUrl: parsed.data.DATABASE_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  accessTtlSeconds: parsed.data.ACCESS_TOKEN_TTL_SECONDS,
  refreshTtlDays: parsed.data.REFRESH_TOKEN_TTL_DAYS,
  geminiApiKey: parsed.data.GEMINI_API_KEY,
  geminiModel: parsed.data.GEMINI_MODEL,
  opayWebhookSecret: parsed.data.OPAY_WEBHOOK_SECRET,
  deliveryDeadlineHours: parsed.data.DELIVERY_DEADLINE_HOURS,
  confirmWindowHours: parsed.data.CONFIRM_WINDOW_HOURS,
  sweepIntervalSeconds: parsed.data.SWEEP_INTERVAL_SECONDS,
  trustProxyHops: parsed.data.TRUST_PROXY_HOPS,
};