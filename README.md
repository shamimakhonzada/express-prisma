# Nexura Backend

Production-shaped REST API built with **Express 5** and **Prisma 8 (Next)** on PostgreSQL. It ships a
cookie-based auth system (access + refresh tokens, OTP password reset) and a heavily filterable,
paginated product catalogue.

- Runtime: Node.js 22.18+ / 24+ (uses native TypeScript type-stripping, no build step)
- Database: PostgreSQL 15+
- Repo: `shamimakhonzada/express-prisma`

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Database & Prisma 8 Workflow](#database--prisma-8-workflow)
- [Project Structure](#project-structure)
- [Response Envelope](#response-envelope)
- [Implemented Features](#implemented-features)
- [Endpoint Reference](#endpoint-reference)
- [Product Filtering](#product-filtering)
- [Rate Limiting](#rate-limiting)
- [Background Workers](#background-workers)
- [Known Issues](#known-issues)

---

## Tech Stack

| Concern         | Choice                                                   |
| --------------- | -------------------------------------------------------- |
| HTTP server     | Express 5.2 (`router.query` for the HTTP `QUERY` method) |
| Database client | Prisma 8 RC (`@prisma/orm-postgres`), contract-first     |
| Auth            | `jsonwebtoken` + `argon2` + httpOnly cookies             |
| Email           | `nodemailer` over SMTP (Gmail) with an HTML OTP template |
| Scheduling      | `node-cron`                                              |
| Hardening       | `express-rate-limit`, cookie-flag hardening              |
| Logging         | `morgan` (`dev` format)                                  |
| Config          | `dotenv` loaded through `src/config/index.js`            |

---

## Setup

```bash
npm install
cp .env.example .env     # then fill in the values
npm start                # or: npm run dev  (node --watch)
```

The server listens on `http://localhost:4000` (override with `PORT`).

Set a reusable base URL in your API client:

```text
base_url = http://localhost:4000
```

Seeding the catalogue (100 products):

```bash
npm run db:seed
```

---

## Environment Variables

Defined in `.env` (template: `.env.example`), consumed via `src/config/index.js`. Startup **throws**
if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is missing.

| Variable                 | Required | Default          | Description                                                           |
| ------------------------ | -------- | ---------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`           | Yes      | –                | PostgreSQL connection string                                          |
| `PORT`                   | No       | `4000`           | HTTP port                                                             |
| `NODE_ENV`               | No       | development      | Switches cookie `secure` / `sameSite` flags                           |
| `JWT_ACCESS_SECRET`      | Yes      | –                | Signing key for access tokens; `openssl rand -base64 32`              |
| `JWT_REFRESH_SECRET`     | Yes      | –                | Signing key for refresh tokens — must be **different** from the above |
| `JWT_ACCESS_EXPIRES_IN`  | No       | `15m`            | Access-token lifetime                                                 |
| `JWT_REFRESH_EXPIRES_IN` | No       | `7d`             | Refresh-token lifetime                                                |
| `SMTP_HOST`              | Yes¹     | `smtp.gmail.com` | SMTP host                                                             |
| `SMTP_PORT`              | No       | `587`            | SMTP port (`465` used in `.env.example`)                              |
| `SMTP_USER`              | Yes¹     | –                | Sender address                                                        |
| `SMTP_PASS`              | Yes¹     | –                | Sender password / app password                                        |

¹ Required for the password-reset flow only.

---

## Database & Prisma 8 Workflow

This project uses **Prisma 8 (formerly Prisma Next)**. There is no `schema.prisma` and no generated
client — models live in a _contract_, and the client is built from the emitted `contract.json`.

| File                         | Role                                     |
| ---------------------------- | ---------------------------------------- |
| `src/prisma/contract.prisma` | Source of truth for `User` and `Product` |
| `src/prisma/contract.json`   | Emitted contract consumed at runtime     |
| `src/prisma/contract.d.ts`   | Emitted types for editor autocomplete    |
| `src/prisma/db.ts`           | Typed client (`db.orm.public.<Model>`)   |
| `prisma.config.ts`           | CLI config: contract path + connection   |

Commands:

```bash
npm run contract:emit              # = npx prisma contract emit
npx prisma db init                 # create tables matching the contract and sign the DB
npx prisma db schema               # inspect live schema
npx prisma db verify               # contract vs. live schema drift check
npx prisma migration status        # migration state
```

After editing `contract.prisma`, always re-run `contract:emit` and commit `contract.json` +
`contract.d.ts`.

### Models

```prisma
model User {                       // table: users
  id           String      @id @default(uuid())
  email        String      @unique
  username     String?     @unique
  avatar       String?
  password     String?              // argon2 hash
  name         String?
  resetOtp     String?              // argon2 hash of the 6-digit OTP
  otpExpiry    TimestamptzString?
  refreshToken String?              // argon2 hash of the active refresh token
  createdAt    TimestamptzString    @default(now())
  updatedAt    temporal.updatedAtString()
}

model Product {                    // table: products
  id          String  @id @default(uuid())
  name        String
  category    String
  brand       String
  price       Float
  rating      Float
  stock       Int
  status      String
  featured    Boolean
  releaseYear Int     @map("release_year")
  color       String?
  ram         Int?
  storage     Int?
  processor   String?

  @@index([category, brand, price, rating, releaseYear])
}
```

---

## Project Structure

```text
.
├── index.js                     # entrypoint: boots app + cleanup worker
├── prisma.config.ts             # Prisma CLI config
├── docs/                        # learning notes (SQL fundamentals)
├── migrations/                  # contract snapshots + signed DB refs
└── src
    ├── app.js                   # express app assembly, middleware order
    ├── config/index.js          # env loading + validation
    ├── controllers/             # HTTP layer (auth, product)
    ├── data/products.js         # 100-product seed dataset
    ├── lib/                     # jwt, email transporter, response helpers
    ├── middlewares/             # auth, rate limiters, error handlers
    ├── prisma/                  # contract.prisma, contract.json/.d.ts, db.ts, seed.js
    ├── routes/                  # route tables (index, auth, product)
    ├── services/                # business logic (auth, product)
    ├── templates/otp-email.html # OTP email body
    └── workers/                 # node-cron jobs
```

Request flow: **route → rate limiter → controller → service → Prisma**, with
`notFoundHandler` → `errorHandler` as the terminal layers.

---

## Response Envelope

Success (`src/lib/sendSuccess.js`):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "data": {}
}
```

Error — via `errorHandler` for thrown errors / unknown routes:

```json
{
  "success": false,
  "message": "Product with ID 99 not found",
  "method": "GET",
  "data": null
}
```

Error — via `sendError` for auth rejections (includes `statusCode`, no `data`):

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized. Token missing."
}
```

`POST /api/v1/auth/refresh` is the one exception: it returns a bare `{ "success": true, "message": "..." }`.

---

## Implemented Features

**Architecture**

- Layered MVC-ish separation (routes → controllers → services → Prisma)
- Centralised response helpers (`sendSuccess` / `sendError`) with a consistent envelope
- Centralised error + 404 handling driven by `error.statusCode`
- Versioned API surface mounted at `/api/v1`
- Request logging with `morgan`

**Authentication & sessions**

- Email/password signup and login with **argon2** password hashing
- Dual-token JWT scheme: **15-minute** access token + **7-day** refresh token, each signed with
  its own secret so neither token can be replayed as the other
- Tokens delivered as **httpOnly cookies**, not in the JSON body
- Access cookie scoped to `/`; refresh cookie scoped to `/api/v1/auth/refresh` so it is only ever
  sent to the rotation endpoint
- `secure` and `sameSite: strict` cookies automatically in production, `lax` in development
- Refresh-token **rotation** with reuse detection: a replayed token wipes the stored session and
  returns `403 Session compromise suspected`
- Logout clears both cookies
- Cookie-based `authMiddleware` guard on protected routes

**Password reset**

- 6-digit cryptographically random OTP (`crypto.randomInt`) hashed with argon2 before storage
- 10-minute OTP expiry enforced server-side
- Minimum 8-character password policy on reset
- HTML email via nodemailer with a plain-text fallback, templated from `src/templates/otp-email.html`
- OTP + expiry nulled after a successful reset

**Products**

- 19 filter parameters, combinable, available on `GET`, `POST /search`, and `QUERY`
- Case-insensitive `ILIKE` search across name, brand, and category
- Range filters on price, rating, stock, release year; minimums on RAM and storage
- Multi-brand filtering via comma-separated list or array
- Whitelist-protected sort fields (no user input reaches `ORDER BY`)
- Offset pagination with a `count()` aggregate run in parallel to the page query
- `hasNextPage` / `hasPreviousPage` navigation flags
- Metadata endpoint returning distinct categories and brands for building filter UIs
- 100-product seed dataset spanning 11 categories and 31 brands

**Security & reliability**

- Three rate limiters: global, login, password reset
- Global 100 req / 15 min budget on every route
- Strict 5 attempts / hour on credential and reset endpoints
- Secrets read only from the environment; the app refuses to boot without `JWT_ACCESS_SECRET` and
  `JWT_REFRESH_SECRET`
- OTP and refresh tokens never stored in plaintext
- Refresh tokens purged nightly by a scheduled worker

---

## Endpoint Reference

Base URL: `http://localhost:4000`

### Public

| Method | Path      | Auth   | Description                                                       |
| ------ | --------- | ------ | ----------------------------------------------------------------- |
| `GET`  | `/`       | –      | Service greeting                                                  |
| `GET`  | `/secure` | Cookie | Echoes the authenticated user; `401` without a valid access token |

### Auth — `/api/v1/auth`

| Method | Path               | Auth    | Rate limit | Description                                |
| ------ | ------------------ | ------- | ---------- | ------------------------------------------ |
| `POST` | `/signup`          | –       | Global     | Register; returns `201` with the new user  |
| `POST` | `/signin`          | –       | 5 / hour   | Verify credentials, set auth cookies       |
| `POST` | `/logout`          | –       | Global     | Clear both auth cookies                    |
| `POST` | `/forgot-password` | –       | 5 / hour   | Email a 6-digit OTP (10 min TTL)           |
| `POST` | `/reset-password`  | –       | 5 / hour   | Consume the OTP and set a new password     |
| `POST` | `/refresh`         | Cookie¹ | Global     | Rotate the refresh token, re-issue cookies |

¹ Requires the `refresh_token` cookie, whose path is scoped to this exact route.

<details>
<summary>Request / response bodies</summary>

**`POST /api/v1/auth/signup`**

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "username": "user",
  "name": "User",
  "avatar": "https://…"
}
```

Only `email` and `password` are required. Responds `201`; `password`, `resetOtp`, and `otpExpiry`
are stripped from the payload. `409` if the email is taken.

**`POST /api/v1/auth/signin`**

```json
{ "email": "user@example.com", "password": "secret123" }
```

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": { "user": { "id": "…", "email": "user@example.com", "name": "User" } }
}
```

Sets `access_token` (15 min) and `refresh_token` (7 days). `401 Invalid credentials` on failure.

**`POST /api/v1/auth/forgot-password`**

```json
{ "email": "user@example.com" }
```

`404` if the user does not exist.

**`POST /api/v1/auth/reset-password`**

```json
{ "email": "user@example.com", "otp": "123456", "newPassword": "newsecret123" }
```

`400` for a missing field, expired OTP, wrong OTP, or a password under 8 characters.

</details>

### Products — `/api/v1/products`

| Method  | Path      | Auth | Description                                        |
| ------- | --------- | ---- | -------------------------------------------------- |
| `GET`   | `/`       | –    | List products; filters via **query string**        |
| `POST`  | `/search` | –    | Same filters as a **JSON body**                    |
| `QUERY` | `/`       | –    | Same filters as a **JSON body** (Express 5 method) |
| `GET`   | `/meta`   | –    | Total count, distinct categories and brands        |
| `GET`   | `/:id`    | –    | Single product; `404` if missing                   |

```http
GET {{base_url}}/api/v1/products/meta
```

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Product metadata retrieved successfully",
  "data": {
    "total": 100,
    "categories": ["accessory", "camera", "desktop", "…", "watch"],
    "brands": ["ASUS", "Acer", "Amazon", "…", "Xiaomi"]
  }
}
```

---

## Product Filtering

The same filter object works as query parameters (`GET`) or a JSON body (`POST /search`, `QUERY /`).
Filters combine with AND.

```http
GET {{base_url}}/api/v1/products?category=laptop&brand=Apple&maxPrice=1200&page=1&limit=10&sortBy=price&order=asc
```

```http
POST {{base_url}}/api/v1/products/search
Content-Type: application/json

{ "category": "laptop", "minRam": 16, "minStorage": 512, "processor": "M4", "minRating": 4.5 }
```

```http
QUERY {{base_url}}/api/v1/products
Content-Type: application/json

{ "brands": ["Apple", "Dell", "Lenovo"], "featured": true, "sortBy": "rating", "order": "desc" }
```

### Supported Filters

| Parameter                 | Example         | Type        | Description                                                     |
| ------------------------- | --------------- | ----------- | --------------------------------------------------------------- |
| `search`                  | `MacBook`       | string      | Case-insensitive match on name, brand, or category              |
| `category`                | `laptop`        | string      | Exact category match                                            |
| `brand`                   | `Dell`          | string      | Exact brand match                                               |
| `brands`                  | `Apple,Dell`    | array / CSV | Match any brand in the list                                     |
| `minPrice` / `maxPrice`   | `500` / `2000`  | number      | Price range                                                     |
| `minRating` / `maxRating` | `4` / `5`       | number      | Rating range                                                    |
| `minStock` / `maxStock`   | `1` / `100`     | number      | Stock range                                                     |
| `minYear` / `maxYear`     | `2022` / `2025` | number      | Release-year range                                              |
| `releaseYear`             | `2024`          | number      | Exact release year                                              |
| `minRam`                  | `8`             | number      | Minimum RAM (GB)                                                |
| `minStorage`              | `256`           | number      | Minimum storage (GB)                                            |
| `featured`                | `true`          | boolean     | Featured flag                                                   |
| `status`                  | `active`        | string      | Exact status match                                              |
| `color`                   | `black`         | string      | Case-insensitive color match                                    |
| `processor`               | `M4 Pro`        | string      | Case-insensitive processor match                                |
| `page`                    | `1`             | number      | Page number, floored at `1`                                     |
| `limit`                   | `10`            | number      | Page size, clamped to `1`–`100`                                 |
| `sortBy`                  | `price`         | string      | `id`, `name`, `price`, `rating`, `stock`, `releaseYear`         |
| `order`                   | `desc`          | string      | `asc` (default) or `desc`; unknown values fall back to `id` asc |

Non-numeric values passed to numeric filters are ignored rather than throwing, and unknown `sortBy`
values fall back to `id` ascending.

### Product List Response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "data": {
    "data": [
      {
        "id": "1",
        "name": "MacBook Pro 14",
        "category": "laptop",
        "brand": "Apple",
        "price": 2499,
        "rating": 4.9,
        "stock": 12,
        "status": "active",
        "featured": true,
        "releaseYear": 2025,
        "color": "Space Black",
        "ram": 24,
        "storage": 512,
        "processor": "M4 Pro"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

The message varies by endpoint: `Products retrieved successfully` (GET), `Products searched
successfully` (`POST /search`), `Products queried successfully` (`QUERY`).

---

## Rate Limiting

| Limiter                | Window     | Max requests | Applied to                                                              |
| ---------------------- | ---------- | ------------ | ----------------------------------------------------------------------- |
| `globalLimiter`        | 15 minutes | 100          | Every request                                                           |
| `loginLimiter`         | 1 hour     | 5            | `POST /api/v1/auth/signin`                                              |
| `passwordResetLimiter` | 1 hour     | 5            | `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` |

Rate-limited responses return `429` with a `success: false` body. Standard `RateLimit-*` headers are
emitted and the legacy `X-RateLimit-*` headers are disabled.

---

## Background Workers

`src/workers/cleanup.worker.js` is initialised from `index.js` before the server listens.

| Schedule               | Task                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0 0 * * *` (midnight) | Nulls `refreshToken` for users whose `updatedAt` is older than 7 days, so stale sessions cannot be replayed. Failures are caught and logged; the server keeps running. |

---

## Known Issues

1. **`POST /api/v1/auth/logout`** clears the cookies but does not null the stored `refreshToken`, so
   a stolen refresh token stays valid until the nightly cleanup or the next rotation.

### Resolved

The following defects were fixed and are kept here for context:

- `src/workers/cleanup.worker.js` imported `../prisma/db.js` while the client is `db.ts`, so
  `npm start` failed with `ERR_MODULE_NOT_FOUND` — now imports `../prisma/db.ts`.
- `rotateUserSessionService` read `user.refreshToken` before `user` was declared, so
  `POST /api/v1/auth/refresh` threw `ReferenceError: Cannot access 'user' before initialization`.
  The incoming token is now verified directly.
- That same function called `generateToken` without importing it, and verified the token with
  `verifyToken(a, b)` even though `verifyToken` takes one argument.
- Refresh tokens were stored as plaintext JWTs but verified with `argon2.verify`, which throws on a
  non-hash. Tokens are now argon2-hashed on save (legacy plaintext rows fall back to a timing-safe
  string comparison).
- Access and refresh tokens shared one secret and one `JWT_EXPIRES_IN`, so refresh tokens expired
  after 15 minutes. They are now signed with separate secrets and separate expiries
  (`15m` / `7d`).
