import { db } from "../prisma/db.ts";
import { generateAccessToken } from "../lib/jwt.js";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "../lib/session-token.js";

const REFRESH_DAYS = 7;

const unauthorized = (message) =>
  Object.assign(new Error(message), { statusCode: 401 });

export async function createSession(userId, req) {
  const refreshToken = generateRefreshToken();

  const session = await db.orm.public.Session.create({
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
    ipAddress: req.ip ?? null,
    expiresAt: new Date(
      Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
  });

  return { session, refreshToken };
}

export async function rotateSession(refreshToken) {
  const oldHash = hashRefreshToken(refreshToken);

  const session = await db.orm.public.Session.where({
    refreshTokenHash: oldHash,
  }).first();

  if (
    !session ||
    session.revokedAt !== null ||
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    throw unauthorized("Invalid or expired refresh session");
  }

  const newRefreshToken = generateRefreshToken();
  const now = new Date().toISOString();

  // Atomic conditional update prevents two successful
  // rotations using the same refresh token.
  const updatedCount = await db.orm.public.Session.where({
    id: session.id,
    refreshTokenHash: oldHash,
    revokedAt: null,
  }).updateAndCount({
    refreshTokenHash: hashRefreshToken(newRefreshToken),
    lastUsedAt: now,
  });

  if (updatedCount !== 1) {
    throw unauthorized("Refresh token already used or revoked");
  }

  const accessToken = generateAccessToken({
    id: session.userId,
    sessionId: session.id,
  });

  return { accessToken, newRefreshToken };
}

export async function revokeCurrentSession(userId, sessionId) {
  return db.orm.public.Session.where({
    id: sessionId,
    userId,
    revokedAt: null,
  }).updateAndCount({
    revokedAt: new Date().toISOString(),
  });
}

export async function revokeAllSessions(userId) {
  return db.orm.public.Session.where({
    userId,
    revokedAt: null,
  }).updateAndCount({
    revokedAt: new Date().toISOString(),
  });
}
