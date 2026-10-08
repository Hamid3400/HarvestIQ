import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Invalid input",
      details: err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }

  // Malformed JSON body
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type: string }).type === "entity.parse.failed"
  ) {
    return res.status(400).json({ error: "Malformed JSON" });
  }

    // Upload problems from multer (file too big, too many files, etc.)
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "MulterError"
  ) {
    const code = (err as { code?: string }).code;
    const tooBig = code === "LIMIT_FILE_SIZE";
    return res
      .status(tooBig ? 413 : 400)
      .json({ error: tooBig ? "Image too large (max 4 MB)" : "Invalid upload" });
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    error: "Something went wrong",
    ...(config.isProd ? {} : { debug: String(err) }),
  });
}