import path from "node:path";
import { generateAccessToken, generateRefreshToken } from "../lib/jwt.js";
import { sendSuccess } from "../lib/sendSuccess.js";
import {
  loginService,
  registerUserService,
  forgotPasswordService,
  resetPasswordService,
  saveRefreshTokenService,
  rotateUserSessionService,
} from "../services/auth.service.js";
import { sendError } from "../lib/sendError.js";

const isProduction = process.env.NODE_ENV === "production";

export async function registerUserController(req, res, next) {
  try {
    const newUser = await registerUserService(req.body);
    const { password, resetOtp, otpExpiry, ...userWithoutSensitiveFields } =
      newUser;

    sendSuccess(
      res,
      201,
      "User registered successfully",
      userWithoutSensitiveFields,
    );
  } catch (error) {
    next(error);
  }
}

export async function loginController(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await loginService({ email, password });
    const accessToken = generateAccessToken({ id: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ id: user.id }); // Refresh token valid for 7 days

    // Save the refresh token in the database
    await saveRefreshTokenService(user.id, refreshToken);

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 15 * 60 * 1000, // 15 mins in ms
      path: "/",
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: "/api/v1/auth/refresh",
    });

    sendSuccess(res, 200, "Login successful", {
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(req, res) {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/api/v1/auth/refresh" });
  sendSuccess(res, 200, "Logged out successfully", null);
}

export async function forgotPasswordController(req, res, next) {
  try {
    const { email } = req.body;
    await forgotPasswordService(email);
    sendSuccess(res, 200, "OTP sent successfully to your email.", null);
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(req, res, next) {
  try {
    const { email, otp, newPassword } = req.body;
    await resetPasswordService({ email, otp, newPassword });
    sendSuccess(res, 200, "Password updated successfully.", null);
  } catch (error) {
    next(error);
  }
}

export async function refreshSessionController(req, res, next) {
  try {
    const tokenFromCookie = req.cookies.refresh_token;

    if (!tokenFromCookie) {
      sendError(res, 401, "Refresh token missing");
      return;
    }

    const { accessToken, newRefreshToken } =
      await rotateUserSessionService(tokenFromCookie);

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    res.cookie("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth/refresh", // Scoped specifically to this route for security and network performance
    });

    res
      .status(200)
      .json({ success: true, message: "Session rotated successfully" });
  } catch (error) {
    next(error);
  }
}
