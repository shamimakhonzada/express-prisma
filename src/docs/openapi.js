/**
 * OpenAPI 3.1 document for the Nexura API.
 * Served at /api/docs (Swagger UI) and /api/docs.json (raw spec).
 */

const filterDefs = {
  search: {
    type: "string",
    description:
      "Case-insensitive partial match across `name`, `brand` and `category`.",
  },
  category: { type: "string", description: "Exact category match." },
  brand: { type: "string", description: "Exact brand match." },
  brands: {
    type: "string",
    description: "Comma-separated list of brands, matched with `IN (...)`.",
    example: "Apple,Samsung",
  },
  minPrice: { type: "number", description: "Minimum price (inclusive)." },
  maxPrice: { type: "number", description: "Maximum price (inclusive)." },
  minRating: { type: "number", description: "Minimum rating (inclusive)." },
  maxRating: { type: "number", description: "Maximum rating (inclusive)." },
  minStock: { type: "integer", description: "Minimum stock (inclusive)." },
  maxStock: { type: "integer", description: "Maximum stock (inclusive)." },
  minYear: {
    type: "integer",
    description: "Minimum release year (inclusive).",
  },
  maxYear: {
    type: "integer",
    description: "Maximum release year (inclusive).",
  },
  minRam: { type: "integer", description: "Minimum RAM in GB." },
  minStorage: { type: "integer", description: "Minimum storage in GB." },
  releaseYear: { type: "integer", description: "Exact release year." },
  featured: {
    type: "boolean",
    description: "Only `true` returns featured products.",
  },
  status: {
    type: "string",
    description: "Exact status match.",
    example: "Available",
  },
  color: { type: "string", description: "Case-insensitive match on color." },
  processor: {
    type: "string",
    description: "Case-insensitive match on processor.",
  },
  page: {
    type: "integer",
    minimum: 1,
    default: 1,
    description: "Page number (1-based).",
  },
  limit: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 10,
    description: "Page size, clamped to 1–100.",
  },
  sortBy: {
    type: "string",
    enum: ["id", "name", "price", "rating", "stock", "releaseYear"],
    default: "id",
    description: "Sort field. Unknown values fall back to `id`.",
  },
  order: {
    type: "string",
    enum: ["asc", "desc"],
    default: "asc",
    description: "Sort direction.",
  },
};

const productQueryParameters = Object.entries(filterDefs).map(
  ([name, schema]) => ({
    name,
    in: "query",
    required: false,
    description: schema.description,
    schema: Object.fromEntries(
      Object.entries(schema).filter(([key]) => key !== "description"),
    ),
  }),
);

const productFiltersSchema = Object.fromEntries(
  Object.entries(filterDefs).map(([name, schema]) => [
    name,
    name === "brands"
      ? {
          description: schema.description,
          oneOf: [
            { type: "array", items: { type: "string" } },
            { type: "string" },
          ],
        }
      : { ...schema },
  ]),
);

const successEnvelope = {
  type: "object",
  required: ["success", "statusCode", "message"],
  properties: {
    success: { type: "boolean", enum: [true] },
    statusCode: { type: "integer" },
    message: { type: "string" },
    data: { description: "Payload. `null` when there is nothing to return." },
  },
};

const errorEnvelope = {
  type: "object",
  required: ["success", "message"],
  properties: {
    success: { type: "boolean", enum: [false] },
    statusCode: { type: "integer" },
    message: { type: "string" },
    method: {
      type: "string",
      description: "Present on 404 and unhandled errors.",
    },
    data: { type: "null" },
  },
};

const success = (description, dataSchema) => ({
  description,
  content: {
    "application/json": {
      schema: dataSchema
        ? {
            allOf: [
              { $ref: "#/components/schemas/SuccessEnvelope" },
              { type: "object", properties: { data: dataSchema } },
            ],
          }
        : { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
});

const errorResponse = (description) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
    },
  },
});

const setCookieNote = (lines) => [`**Sets cookies:**`, "", ...lines].join("\n");

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Nexura API",
    version: "1.0.0",
    summary: "Product catalogue and authentication API.",
    description: [
      "Express 5 + Prisma 8 backend.",
      "",
      "### Response envelope",
      "Successful responses use:",
      "```json",
      '{ "success": true, "statusCode": 200, "message": "...", "data": null }',
      "```",
      "Errors use:",
      "```json",
      '{ "success": false, "statusCode": 401, "message": "..." }',
      "```",
      "",
      "### Authentication",
      "Authentication is cookie-based (`httpOnly`), not `Authorization` header based:",
      "",
      "- `access_token` — 15 min, scoped to `/`, read by `GET /secure`.",
      "- `refresh_token` — 7 days, scoped to `/api/v1/auth/refresh`, rotated on every refresh.",
      "",
      "Sign in with `POST /api/v1/auth/signin`, then use **Authorize** in Swagger UI to send cookies.",
      "",
      "### Rate limiting",
      "100 requests / 15 min per IP globally. `signin`, `forgot-password` and `reset-password` are limited to 5 / hour (HTTP 429).",
    ].join("\n"),
    contact: { name: "Nexura API", url: "http://localhost:4000" },
    license: { name: "ISC", identifier: "ISC" },
  },
  // Public by default; individual operations opt in via `security`.
  security: [],
  servers: [
    { url: "http://localhost:4000", description: "Local development" },
    { url: "/", description: "Current host" },
  ],
  tags: [
    {
      name: "System",
      description: "Service metadata and protected probe route.",
    },
    {
      name: "Auth",
      description: "Registration, login, token rotation and password reset.",
    },
    {
      name: "Products",
      description: "Product catalogue with filtering, sorting and pagination.",
    },
  ],
  paths: {
    "/": {
      get: {
        tags: ["System"],
        operationId: "getRoot",
        summary: "API welcome message",
        responses: {
          200: success("Service is up.", { type: "null" }),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/secure": {
      get: {
        tags: ["System"],
        operationId: "getSecure",
        summary: "Protected probe route",
        description:
          "Requires the `access_token` cookie issued by `POST /api/v1/auth/signin`.",
        security: [{ accessCookie: [] }],
        responses: {
          200: success("Authenticated request.", {
            type: "object",
            required: ["id", "email"],
            properties: {
              id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
            },
          }),
          401: errorResponse("Token missing, invalid or expired."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/auth/signup": {
      post: {
        tags: ["Auth"],
        operationId: "signUp",
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SignupRequest" },
            },
          },
        },
        responses: {
          201: success("User registered successfully.", {
            $ref: "#/components/schemas/User",
          }),
          400: errorResponse("Email or password missing."),
          409: errorResponse("User already exists."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/auth/signin": {
      post: {
        tags: ["Auth"],
        operationId: "signIn",
        summary: "Log in and receive auth cookies",
        description: setCookieNote([
          "`access_token=<jwt>; Path=/; Max-Age=900; HttpOnly`",
          "`refresh_token=<jwt>; Path=/api/v1/auth/refresh; Max-Age=604800; HttpOnly`",
          "",
          "A refresh token is also stored server-side, hashed with Argon2.",
        ]),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SigninRequest" },
            },
          },
        },
        responses: {
          200: success("Login successful.", {
            type: "object",
            required: ["user"],
            properties: {
              user: {
                type: "object",
                required: ["id", "email"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  email: { type: "string", format: "email" },
                  name: { type: ["string", "null"] },
                },
              },
            },
          }),
          401: errorResponse("Invalid credentials."),
          429: errorResponse("Too many login attempts (5 per hour)."),
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        operationId: "refreshSession",
        summary: "Rotate the session (new access + refresh cookies)",
        description: [
          "Reads the `refresh_token` cookie, verifies it against the stored Argon2 hash,",
          "then issues a fresh pair of cookies. Re-using a previously rotated token revokes the session (403).",
          "",
          setCookieNote([
            "`access_token=<jwt>; Path=/; Max-Age=900; HttpOnly`",
            "`refresh_token=<jwt>; Path=/api/v1/auth/refresh; Max-Age=604800; HttpOnly`",
          ]),
        ].join("\n"),
        security: [{ refreshCookie: [] }],
        responses: {
          200: {
            description: "Session rotated successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["success", "message"],
                  properties: {
                    success: { type: "boolean", enum: [true] },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          401: errorResponse(
            "Refresh token missing, invalid, expired or revoked.",
          ),
          403: errorResponse(
            "Token reuse detected — session revoked, sign in again.",
          ),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        operationId: "signOut",
        summary: "Clear auth cookies",
        responses: {
          200: success("Logged out successfully.", { type: "null" }),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        operationId: "forgotPassword",
        summary: "Request a password-reset OTP by email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
            },
          },
        },
        responses: {
          200: success("OTP sent successfully to your email.", {
            type: "null",
          }),
          400: errorResponse("Email is required."),
          404: errorResponse("User not found."),
          429: errorResponse("Too many password reset attempts (5 per hour)."),
        },
      },
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        operationId: "resetPassword",
        summary: "Reset the password using the OTP",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
            },
          },
        },
        responses: {
          200: success("Password updated successfully.", { type: "null" }),
          400: errorResponse(
            "Missing fields, expired OTP, invalid OTP or password shorter than 8 characters.",
          ),
          404: errorResponse("User not found."),
          429: errorResponse("Too many password reset attempts (5 per hour)."),
        },
      },
    },
    "/api/v1/products": {
      get: {
        tags: ["Products"],
        operationId: "getProducts",
        summary: "List products",
        description: [
          "Filtering, sorting and pagination for the product catalogue.",
          "",
          "The same operation is also exposed as **`QUERY /api/v1/products`** (Express 5),",
          "which accepts these filters as a JSON body instead of a query string.",
        ].join("\n"),
        parameters: productQueryParameters,
        responses: {
          200: success("Products retrieved successfully.", {
            $ref: "#/components/schemas/ProductListPayload",
          }),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/products/search": {
      post: {
        tags: ["Products"],
        operationId: "searchProducts",
        summary: "Search products (filters as JSON body)",
        description:
          "Identical semantics to `GET /api/v1/products`, but filters travel in the body.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductFilters" },
            },
          },
        },
        responses: {
          200: success("Products searched successfully.", {
            $ref: "#/components/schemas/ProductListPayload",
          }),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/products/meta": {
      get: {
        tags: ["Products"],
        operationId: "getProductsMeta",
        summary: "Distinct categories, brands and total count",
        responses: {
          200: success("Product metadata retrieved successfully.", {
            $ref: "#/components/schemas/ProductMetaPayload",
          }),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    "/api/v1/products/{id}": {
      get: {
        tags: ["Products"],
        operationId: "getProductById",
        summary: "Fetch a single product",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Product UUID.",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: success("Product retrieved successfully.", {
            $ref: "#/components/schemas/Product",
          }),
          404: errorResponse("Product not found."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      accessCookie: {
        type: "apiKey",
        in: "cookie",
        name: "access_token",
        description:
          "Short-lived (15 min) JWT set by `POST /api/v1/auth/signin`.",
      },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "refresh_token",
        description:
          "Long-lived (7 days) JWT set by `POST /api/v1/auth/signin` and rotated by `POST /api/v1/auth/refresh`.",
      },
    },
    schemas: {
      SuccessEnvelope: successEnvelope,
      ErrorEnvelope: errorEnvelope,
      User: {
        type: "object",
        description:
          "User as returned by registration (sensitive fields removed).",
        required: ["id", "email"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          username: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
          avatar: { type: ["string", "null"] },
          refreshToken: {
            type: ["string", "null"],
            description:
              "Argon2 hash of the current refresh token. Internal — should not be exposed in responses.",
            examples: ["$argon2id$v=19$m=65536,p=4,t=3$..."],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Product: {
        type: "object",
        required: [
          "id",
          "name",
          "category",
          "brand",
          "price",
          "rating",
          "stock",
          "status",
          "featured",
          "releaseYear",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          category: { type: "string" },
          brand: { type: "string" },
          price: { type: "number" },
          rating: { type: "number" },
          stock: { type: "integer" },
          status: { type: "string" },
          featured: { type: "boolean" },
          releaseYear: { type: "integer" },
          color: { type: ["string", "null"] },
          ram: { type: ["integer", "null"] },
          storage: { type: ["integer", "null"] },
          processor: { type: ["string", "null"] },
        },
      },
      Pagination: {
        type: "object",
        required: [
          "page",
          "limit",
          "total",
          "totalPages",
          "hasNextPage",
          "hasPreviousPage",
        ],
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
          hasNextPage: { type: "boolean" },
          hasPreviousPage: { type: "boolean" },
        },
      },
      ProductListPayload: {
        type: "object",
        required: ["data", "pagination"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Product" },
          },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
      },
      ProductMetaPayload: {
        type: "object",
        required: ["total", "categories", "brands"],
        properties: {
          total: { type: "integer" },
          categories: { type: "array", items: { type: "string" } },
          brands: { type: "array", items: { type: "string" } },
        },
      },
      SignupRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
          username: { type: "string" },
          name: { type: "string" },
          avatar: { type: "string", description: "Avatar URL." },
        },
      },
      SigninRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
      },
      ForgotPasswordRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
      ResetPasswordRequest: {
        type: "object",
        required: ["email", "otp", "newPassword"],
        properties: {
          email: { type: "string", format: "email" },
          otp: {
            type: "string",
            pattern: "^[0-9]{6}$",
            description:
              "6-digit code from the reset email. Valid for 10 minutes.",
          },
          newPassword: { type: "string", format: "password", minLength: 8 },
        },
      },
      ProductFilters: {
        type: "object",
        description:
          "Filter, sort and pagination parameters accepted by the product list and search endpoints.",
        properties: productFiltersSchema,
      },
    },
  },
  externalDocs: {
    description: "README — endpoint reference and filtering guide",
    url: "https://github.com/shamimakhonzada/express-prisma#readme",
  },
};

export default openapi;
