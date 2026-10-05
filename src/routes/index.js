import express from "express";
import authRoutes from "./auth.routes.js";
import productRoutes from "./product.routes.js";

const rootRouter = express.Router();

// Mount all feature routes onto the master router
rootRouter.use("/products", productRoutes);
rootRouter.use("/auth", authRoutes);

export default rootRouter;
