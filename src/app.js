import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// Middlewares
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";
import { authMiddleware } from "./middlewares/authenticate.middleware.js";
import { globalLimiter } from "./middlewares/rateLimiter.middleware.js";

// Routes
import rootRouter from "./routes/index.js";

// Utility function
import { sendSuccess } from "./lib/sendSuccess.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.use(globalLimiter); // Apply global rate limiter to all routes

// Base endpoint
app.get("/", (req, res) => {
  sendSuccess(res, 200, "Welcome to the API", null);
});

// Routes
app.use("/api/v1", rootRouter);

app.get("/secure", authMiddleware, (req, res) => {
  sendSuccess(res, 200, "Authenticated request", req.user);
});

// Error handling layers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
