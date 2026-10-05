import * as productService from "../services/product.service.js";
import { sendSuccess } from "../lib/sendSuccess.js";

export const getProducts = async (req, res, next) => {
  try {
    const result = await productService.queryProducts(req.query);
    return sendSuccess(res, 200, "Products retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

export const searchProducts = async (req, res, next) => {
  try {
    const result = await productService.queryProducts(req.body);
    sendSuccess(res, 200, "Products searched successfully", result);
  } catch (error) {
    next(error);
  }
};

export const queryProducts = async (req, res, next) => {
  try {
    const result = await productService.queryProducts(req.body);
    sendSuccess(res, 200, "Products queried successfully", result);
  } catch (error) {
    next(error);
  }
};

export const getProductById = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);

    if (!product) {
      const error = new Error(`Product with ID ${req.params.id} not found`);
      error.statusCode = 404;
      return next(error);
    }

    sendSuccess(res, 200, "Product retrieved successfully", product);
  } catch (error) {
    next(error);
  }
};

export const getMeta = async (req, res, next) => {
  try {
    sendSuccess(
      res,
      200,
      "Product metadata retrieved successfully",
      await productService.getMeta(),
    );
  } catch (error) {
    next(error);
  }
};
