import { Router } from "express";
import {
  registerUserController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
  logoutController,
  logoutAllController,
  refreshSessionController,
} from "../controllers/auth.controller.js";
import { authMiddleware } from "../middlewares/authenticate.middleware.js";
import {
  loginLimiter,
  passwordResetLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = Router();

router.post("/signup", registerUserController);
router.post("/signin", loginLimiter, loginController);
router.post("/logout", authMiddleware, logoutController);
router.post("/logout-all", authMiddleware, logoutAllController);
router.post("/forgot-password", passwordResetLimiter, forgotPasswordController);
router.post("/reset-password", passwordResetLimiter, resetPasswordController);

router.post("/refresh", refreshSessionController);

export default router;
