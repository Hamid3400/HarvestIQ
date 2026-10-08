import argon2 from "argon2";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { AppError } from "../../errors.js";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "../../utils/tokens.js";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Used to keep login timing the same when the email does not exist
const DUMMY_HASH = await argon2.hash("not-a-real-password");

async function issueTokens(user: { id: string; role: string }) {
  const refresh = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: refresh.hash,
      userId: user.id,
      expiresAt: new Date(
        Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000
      ),
    },
  });
  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.token,
    expiresIn: config.accessTtlSeconds,
  };
}

export async function register(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: "FARMER" | "BUYER" | "PROCESSOR";
}) {
  const passwordHash = await argon2.hash(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        fullName: input.fullName,
        role: input.role,
        passwordHash,
      },
      select: { id: true, email: true, fullName: true, role: true },
    });
    return { user, ...(await issueTokens(user)) };
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      throw new AppError(409, "An account with those details already exists");
    }
    throw err;
  }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(429, "Too many failed attempts. Try again later.");
  }

  const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);

  if (!user || !user.isActive || !valid) {
    if (user) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
        },
      });
    }
    throw new AppError(401, "Invalid email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  return {
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    ...(await issueTokens(user)),
  };
}

export async function refresh(token: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record) throw new AppError(401, "Invalid refresh token");

  // A revoked token being used again means it may have been stolen
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, "Invalid refresh token");
  }

  if (record.expiresAt < new Date() || !record.user.isActive) {
    throw new AppError(401, "Invalid refresh token");
  }

  // Revoke the old token; count check stops two parallel requests from both succeeding
  const revoked = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) throw new AppError(401, "Invalid refresh token");

  return issueTokens(record.user);
}

export async function logout(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}