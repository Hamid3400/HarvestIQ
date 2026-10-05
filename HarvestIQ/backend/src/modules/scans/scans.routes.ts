import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../../errors.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { analyseCrop } from "./gemini.service.js";
import { scanBodySchema } from "./scans.schemas.js";

const router = Router();

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(), // never written to disk
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 5 },
});

// Each scan costs money, so limit per user (not per IP): 20 per hour
const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  message: { error: "Scan limit reached. Try again later." },
});

// Order matters: check login, role and limits BEFORE accepting the upload
router.post(
  "/",
  authenticate,
  requireRole("FARMER"),
  scanLimiter,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "Image file is required (field name: image)");
    }

    // Do not trust the filename or the client's content type: read the real bytes
    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !ALLOWED.includes(detected.mime)) {
      throw new AppError(415, "Only JPEG, PNG or WebP images are allowed");
    }

    const { language } = scanBodySchema.parse(req.body);
    const result = await analyseCrop(req.file.buffer, detected.mime, language);

    res.json({
      result,
      disclaimer: "AI guidance only. Confirm with a local agricultural extension officer.",
    });
  }
);

export default router;