# Nexura Backend

REST API built with Express 5 and Prisma 8 on PostgreSQL. It provides cookie-based authentication
with per-device sessions, OTP password reset, and a filterable product catalogue.

## Requirements

- Node.js 22.18+ (Node.js 24+ recommended)
- PostgreSQL 15+

## Setup

```bash
npm install
cp .env.example .env
# Set DATABASE_URL, JWT_ACCESS_SECRET, and SMTP credentials in .env.
npm run dev
```

The API listens on `http://localhost:4000` by default. Set `PORT` to change it. `CLIENT_ORIGIN`
must match the browser application's origin; it defaults to `http://localhost:3000`.

To seed product data, run:

```bash
npm run seed
```

## Environment variables

| Variable                 | Required           | Default                 | Purpose                                    |
| ------------------------ | ------------------ | ----------------------- | ------------------------------------------ |
| `DATABASE_URL`           | Yes                | —                       | PostgreSQL connection string               |
| `JWT_ACCESS_SECRET`      | Yes                | —                       | Secret for signing 15-minute access tokens |
| `PORT`                   | No                 | `4000`                  | HTTP server port                           |
| `NODE_ENV`               | No                 | `development`           | Production mode enables secure cookies     |
| `CLIENT_ORIGIN`          | No                 | `http://localhost:3000` | Allowed credentialed browser origin        |
| `REFRESH_TOKEN_TTL_DAYS` | No                 | `7`                     | Refresh-session and cookie lifetime        |
| `SMTP_HOST`              | No                 | `smtp.gmail.com`        | SMTP server host                           |
| `SMTP_PORT`              | No                 | `587`                   | SMTP port; port 465 uses TLS               |
| `SMTP_USER`              | For password reset | —                       | SMTP sender username/address               |
| `SMTP_PASS`              | For password reset | —                       | SMTP password or app password              |

Refresh tokens are random opaque values, not JWTs, so a refresh-token signing secret is not used.

## Database and Prisma

Prisma 8 uses `src/prisma/contract.prisma` as the data-model source. The emitted `contract.json` is
used at runtime, and `contract.d.ts` provides generated types. After editing the contract, emit the
artifacts with:

```bash
npm run contract:emit
```

Review and apply a database migration for contract changes before deploying the application. The
Prisma CLI configuration is in `prisma.config.ts`; the runtime client is in `src/prisma/db.ts`.

Current models:

- `User`: account details and password-reset OTP fields.
- `Session`: one row per device/login, storing a SHA-256 refresh-token hash, expiry, revocation
  time, user agent, and IP address.
- `Product`: catalogue fields and filter indexes.

## Authentication and sessions

- `POST /api/v1/auth/signup` creates an account; passwords are hashed with Argon2.
- `POST /api/v1/auth/signin` creates a session and sets `access_token` and `refresh_token` as
  httpOnly cookies.
- Access tokens expire after 15 minutes. Refresh tokens are opaque, rotated on use, and stored only
  as SHA-256 hashes in the `sessions` table.
- Each access token carries its user and session IDs. Protected requests check that the session is
  still active, so logout and logout-all invalidate access and refresh immediately.
- `POST /api/v1/auth/logout` revokes the current session.
- `POST /api/v1/auth/logout-all` revokes all active sessions for the user and clears the current
  browser's cookies. Its response includes `revokedSessions`.
- Password reset revokes all sessions after changing the password.
- A daily worker marks expired sessions as revoked.

The refresh endpoint rotates tokens atomically. Reusing a previous token fails with `401`; the
server does not claim to detect token theft from an old token after it has been rotated.

## API routes

| Method  | Path                           | Access         | Description                            |
| ------- | ------------------------------ | -------------- | -------------------------------------- |
| `GET`   | `/`                            | Public         | Service greeting                       |
| `GET`   | `/secure`                      | Access cookie  | Authenticated user/session details     |
| `POST`  | `/api/v1/auth/signup`          | Public         | Register an account                    |
| `POST`  | `/api/v1/auth/signin`          | Public         | Sign in and set cookies                |
| `POST`  | `/api/v1/auth/logout`          | Access cookie  | Revoke the current session             |
| `POST`  | `/api/v1/auth/logout-all`      | Access cookie  | Revoke all user sessions               |
| `POST`  | `/api/v1/auth/refresh`         | Refresh cookie | Rotate the current session tokens      |
| `POST`  | `/api/v1/auth/forgot-password` | Public         | Send a six-digit OTP                   |
| `POST`  | `/api/v1/auth/reset-password`  | Public         | Reset password and revoke sessions     |
| `GET`   | `/api/v1/products`             | Public         | List and filter products               |
| `POST`  | `/api/v1/products/search`      | Public         | Search products with JSON filters      |
| `QUERY` | `/api/v1/products`             | Public         | Query products with JSON filters       |
| `GET`   | `/api/v1/products/meta`        | Public         | Product counts, categories, and brands |
| `GET`   | `/api/v1/products/:id`         | Public         | Read one product                       |

API documentation is served at `/api/docs` and `/api/docs.json`.

## Product filters

Product list/search routes support `search`, `category`, `brand`, `brands`, `minPrice`, `maxPrice`,
`minRating`, `maxRating`, `minStock`, `maxStock`, `minYear`, `maxYear`, `releaseYear`, `minRam`,
`minStorage`, `featured`, `status`, `color`, `processor`, `page`, `limit`, `sortBy`, and `order`.
Filters combine with AND. Page size is capped at 100 and sort fields are allow-listed.

## Rate limits and responses

- Global limit: 100 requests per 15 minutes.
- Sign-in and password-reset routes: 5 requests per hour.
- Responses use the shared success/error helpers in `src/lib`.

## Project layout

```text
index.js                     Server entry point and cleanup worker
src/app.js                   Express middleware and route setup
src/config/index.js          Environment configuration
src/controllers/             HTTP controllers
src/lib/                     JWT, cookies, token helpers, email, response helpers
src/middlewares/             Authentication, rate limiting, error handling
src/prisma/                  Contract, emitted artifacts, and database client
src/routes/                  API route definitions
src/services/                Auth, session, and product business logic
src/workers/                 Scheduled cleanup jobs
migrations/                  Prisma migration snapshots and refs
```

See [AGENTS.md](AGENTS.md) for repository-specific implementation guidance.
