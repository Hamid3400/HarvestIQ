import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  loginSchema,
  registerSchema,
  tokenSchema,
} from "./auth.schemas.js";
import * as auth from "./auth.service.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

router.use(authLimiter);

router.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  res.status(201).json(await auth.register(input));
});

router.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  res.json(await auth.login(email, password));
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = tokenSchema.parse(req.body);
  res.json(await auth.refresh(refreshToken));
});

router.post("/logout", async (req, res) => {
  const { refreshToken } = tokenSchema.parse(req.body);
  await auth.logout(refreshToken);
  res.status(204).end();
});

export default router;