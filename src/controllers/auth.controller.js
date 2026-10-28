import * as authService from "../services/auth.service.js";
import { sendSuccess } from "../lib/sendSuccess.js";
import { sendError } from "../lib/sendError.js";
import * as sessionService from "../services/session.service.js";
import { setAuthCookies, clearAuthCookies } from "../lib/auth-cookies.js";
import { generateAccessToken } from "../lib/jwt.js";

export async function registerUserController(req, res, next) {
  try {
    const newUser = await authService.registerUserService(req.body);
    const { password, resetOtp, otpExpiry, ...userWithoutSensitiveFields } =
      newUser;

    return sendSuccess(
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
    const { email, password } = req.body ?? {};

    const user = await authService.loginService({
      email,
      password,
    });

    const { session, refreshToken } = await sessionService.createSession(
      user.id,
      req,
    );

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      sessionId: session.id,
    });

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, 200, "Login successful", {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(req, res, next) {
  try {
    await sessionService.revokeCurrentSession(req.user.id, req.user.sessionId);

    clearAuthCookies(res);

    return sendSuccess(res, 200, "Logged out successfully", null);
  } catch (error) {
    next(error);
  }
}

export async function logoutAllController(req, res, next) {
  try {
    const count = await sessionService.revokeAllSessions(req.user.id);

    clearAuthCookies(res);

    return sendSuccess(res, 200, "Logged out from all devices", {
      revokedSessions: count,
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordController(req, res, next) {
  try {
    const { email } = req.body ?? {};
    await authService.forgotPasswordService(email);
    return sendSuccess(res, 200, "OTP sent successfully to your email.", null);
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(req, res, next) {
  try {
    const { email, otp, newPassword } = req.body ?? {};
    const userId = await authService.resetPasswordService({
      email,
      otp,
      newPassword,
    });
    await sessionService.revokeAllSessions(userId);
    clearAuthCookies(res);
    return sendSuccess(res, 200, "Password updated successfully.", null);
  } catch (error) {
    next(error);
  }
}

export async function refreshSessionController(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return sendError(res, 401, "Refresh token missing");
    }

    const { accessToken, newRefreshToken } =
      await sessionService.rotateSession(refreshToken);

    setAuthCookies(res, accessToken, newRefreshToken);

    return sendSuccess(res, 200, "Session rotated successfully", null);
  } catch (error) {
    if (error.statusCode === 401) {
      clearAuthCookies(res);
    }
    next(error);
  }
}
