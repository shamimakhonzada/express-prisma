import jwt from "jsonwebtoken";
import config from "../config/index.js";

const ACCESS_SECRET = config.jwtAccessSecret;
const REFRESH_SECRET = config.jwtRefreshSecret;
const ACCESS_EXPIRES_IN = config.jwtAccessExpiresIn;
const REFRESH_EXPIRES_IN = config.jwtRefreshExpiresIn;

export const generateAccessToken = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

export const generateRefreshToken = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch {
    return null; // expired, bad signature, malformed
  }
};

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (error) {
    if (config.nodeEnv !== "production") {
      console.warn(
        `[jwt] refresh token rejected: ${error.name} - ${error.message}`,
      );
    }
    return null; // expired, bad signature, malformed
  }
};
