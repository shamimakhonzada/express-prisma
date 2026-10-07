import { verifyAccessToken } from "../lib/jwt.js";
import { sendError } from "../lib/sendError.js";

export const authMiddleware = (req, res, next) => {
  const token = req.cookies.access_token;

  if (!token) {
    return sendError(res, 401, "Unauthorized. Token missing.");
  }

  try {
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return sendError(res, 401, "Unauthorized. Token invalid or expired.");
    }

    req.user = { id: decoded.id, email: decoded.email };

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return sendError(res, 401, "Unauthorized. Token invalid or expired.");
  }
};
