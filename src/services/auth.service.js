import argon2 from "argon2";
import crypto from "crypto";
import { db } from "../prisma/db.ts";
import { transporter } from "../lib/email.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { verifyToken } from "../lib/jwt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = statusCode;
  return error;
}

export async function registerUserService(userData) {
  const { email, password, username, name, avatar } = userData ?? {};

  if (!email) {
    throw httpError(400, "Email is required");
  }
  if (!password) {
    throw httpError(400, "Password is required");
  }

  const existingUser = await db.orm.public.User.where({ email }).first();
  if (existingUser) {
    throw httpError(409, "User already exists");
  }

  const hashedPassword = await argon2.hash(password);

  return await db.orm.public.User.create({
    email,
    password: hashedPassword,
    username: username ?? null,
    name: name ?? null,
    avatar: avatar ?? null,
  });
}

export async function loginService({ email, password } = {}) {
  const existingUser = email
    ? await db.orm.public.User.where({ email }).first()
    : null;
  const isMatch =
    existingUser?.password && password
      ? await argon2.verify(existingUser.password, password)
      : false;

  if (!isMatch) {
    throw httpError(401, "Invalid credentials");
  }

  return existingUser;
}

export async function forgotPasswordService(email) {
  if (!email) throw httpError(400, "Email is required");

  const user = await db.orm.public.User.where({ email }).first();
  if (!user) throw httpError(404, "User not found");

  const otp = crypto.randomInt(100000, 999999).toString();

  const hashedOtp = await argon2.hash(otp);
  const expiryTime = new Date(Date.now() + 10 * 60 * 1000);

  await db.orm.public.User.where({ email }).update({
    resetOtp: hashedOtp,
    otpExpiry: expiryTime,
  });

  const templatePath = path.join(__dirname, "../templates/otp-email.html");
  let htmlContent = fs.readFileSync(templatePath, "utf8");
  htmlContent = htmlContent.replace("{{OTP_CODE}}", otp);

  await transporter.sendMail({
    from: process.env.SMTP_USER || process.env.EMAIL_USER,
    to: email,
    subject: "Your Password Reset OTP Code",
    text: htmlContent.replace(/<[^>]+>/g, ""),
    html: htmlContent,
  });
}

export async function resetPasswordService({ email, otp, newPassword }) {
  if (!email || !otp || !newPassword) {
    throw httpError(400, "All fields (email, otp, newPassword) are required");
  }

  const user = await db.orm.public.User.where({ email }).first();
  if (!user) throw httpError(404, "User not found");

  if (!user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
    throw httpError(400, "OTP has expired");
  }

  const isValidOtp = await argon2.verify(user.resetOtp, otp);
  if (!isValidOtp) {
    throw httpError(400, "Invalid OTP code");
  }

  if (newPassword.length < 8) {
    throw httpError(400, `New password must be at least 8 characters long`);
  }

  const newHashedPassword = await argon2.hash(newPassword);

  await db.orm.public.User.where({ email }).update({
    password: newHashedPassword,
    resetOtp: null,
    otpExpiry: null,
  });
}

export async function saveRefreshTokenService(userId, refreshToken) {
  if (!userId || !refreshToken) {
    throw httpError(400, "User ID and refresh token are required");
  }

  await db.orm.public.User.where({ id: userId }).update({
    refreshToken,
  });
}

export async function rotateUserSessionService(incomingRefreshToken) {
  const decoded = verifyToken(user.refreshToken, incomingRefreshToken);
  if (!decoded || !decoded.id) {
    throw httpError(401, "Invalid or expired refresh token");
  }

  const user = await db.orm.public.User.where({ id: decoded.id }).first();
  if (!user || !user.refreshToken) {
    throw httpError(401, "Session not found or already revoked");
  }

  const isValid = await argon2.verify(user.refreshToken, incomingRefreshToken);
  if (!isValid) {
    await db.orm.public.User.where({ id: user.id }).update({
      refreshToken: null,
    });
    throw httpError(403, "Session compromise suspected. Please sign in again.");
  }

  const accessToken = generateToken({ id: user.id, email: user.email });
  const newRefreshToken = generateToken({ id: user.id });

  await saveRefreshTokenService(user.id, newRefreshToken);

  return { accessToken, newRefreshToken };
}
