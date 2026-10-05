import { Router } from "express";

import {
  getProducts,
  searchProducts,
  queryProducts,
  getProductById,
  getMeta,
} from "../controllers/product.controller.js";

const router = Router();

router.get("/", getProducts);
router.post("/search", searchProducts);
router.query("/", queryProducts);
router.get("/meta", getMeta);
router.get("/:id", getProductById);

export default router;
