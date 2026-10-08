import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.isProd ? "info" : "debug",
  // Tokens and signatures must never appear in logs
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-opay-signature"]',
    ],
    censor: "[redacted]",
  },
  ...(config.isProd ? {} : { transport: { target: "pino-pretty" } }),
});