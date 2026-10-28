import { verifyAccessToken } from "../lib/jwt.js";
import { sendError } from "../lib/sendError.js";
import { db } from "../prisma/db.ts";

export const authMiddleware = async (req, res, next) => {
  const token = req.cookies?.access_token;

  if (!token) {
    return sendError(res, 401, "Unauthorized. Token missing.");
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return sendError(res, 401, "Unauthorized. Token invalid or expired.");
  }

  if (!decoded?.sub || !decoded?.sid) {
    return sendError(res, 401, "Unauthorized. Token invalid or expired.");
  }

  try {
    const session = await db.orm.public.Session.where({
      id: decoded.sid,
      userId: decoded.sub,
      revokedAt: null,
    }).first();

    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      return sendError(res, 401, "Unauthorized. Token invalid or expired.");
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      sessionId: decoded.sid,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
