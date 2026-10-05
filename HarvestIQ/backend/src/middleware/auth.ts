import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Authentication required");
  }

  const token = header.slice(7);

  let userId: string;
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret, {
      algorithms: ["HS256"], // only accept the algorithm we use
      issuer: "harvestiq-api",
    });
    if (typeof payload === "string" || !payload.sub) throw new Error("bad payload");
    userId = payload.sub;
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid or expired token");
  }

  req.user = { id: user.id, role: user.role };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, "You do not have permission to do this");
    }
    next();
  };
}