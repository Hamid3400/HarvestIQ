import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

export function signAccessToken(user: { id: string; role: string }) {
  return jwt.sign({ role: user.role }, config.jwtAccessSecret, {
    subject: user.id,
    expiresIn: config.accessTtlSeconds,
    algorithm: "HS256",
    issuer: "harvestiq-api",
  });
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken() {
  const token = randomBytes(48).toString("base64url");
  return { token, hash: hashToken(token) };
}