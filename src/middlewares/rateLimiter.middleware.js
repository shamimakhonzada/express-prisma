import { rateLimit } from "express-rate-limit";

// Default/Global limiter for standard API usage
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Generous limit for standard browsing
  message: {
    success: false,
    statusCode: 429,
    message: "Too many requests to the API. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for sensitive authentication / password reset routes
export const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  limit: 5, // Strict limit: Only 5 attempts per hour per IP
  message: {
    success: false,
    statusCode: 429,
    message: "Too many login attempts. Please try again in an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  limit: 5, // Strict limit: Only 5 attempts per hour per IP
  message: {
    success: false,
    statusCode: 429,
    message: "Too many password reset attempts. Please try again in an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
