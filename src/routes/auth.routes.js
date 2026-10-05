import { Router } from "express";
import {
  registerUserController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
  logoutController,
  refreshSessionController,
} from "../controllers/auth.controller.js";
import {
  loginLimiter,
  passwordResetLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = Router();

router.post("/signup", registerUserController);
router.post("/signin", loginLimiter, loginController);
router.post("/logout", logoutController);
router.post("/forgot-password", passwordResetLimiter, forgotPasswordController);
router.post("/reset-password", passwordResetLimiter, resetPasswordController);

router.post("/refresh", refreshSessionController);

export default router;
