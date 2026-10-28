# Repository guidance

## Runtime and structure

- This is an ES module Node.js application using Express 5 and Prisma 8 with PostgreSQL.
- Keep HTTP handling in `src/controllers`, route definitions in `src/routes`, and database/business
  operations in `src/services`.
- `src/prisma/contract.prisma` is the data-model source. After changing it, regenerate
  `src/prisma/contract.json` and `src/prisma/contract.d.ts` with `npm run contract:emit`, then review
  and apply the corresponding database migration.

## Authentication and sessions

- Access tokens use `JWT_ACCESS_SECRET`. Refresh tokens are random opaque values; store only their
  SHA-256 hashes in `Session.refreshTokenHash`.
- Keep the refresh-cookie path scoped to `/api/v1/auth/refresh` and use the shared cookie helpers in
  `src/lib/auth-cookies.js` for setting and clearing cookies.
- Protected requests must verify the access-token claims and the matching active session. Session
  revocation must invalidate access and refresh tokens.
- Use Prisma 8 ORM mutation terminals such as `.updateAndCount(...)`; `.updateCount(...)` is not a
  supported method in the installed Prisma version.
- Keep refresh-token lifetime consistent between the stored session expiry and cookie `maxAge`.

## Configuration and documentation

- Add new environment settings to `.env.example` and document them in `README.md`.
- Credentialed CORS must use an explicit configured client origin, not `*`.
- Keep `README.md` aligned with the current contract, routes, token behavior, scripts, and worker.
- API changes should also update `src/docs/openapi.js`.

## Checks

- Run applicable project checks after code changes when the Node.js runtime is available.
- The current `npm test` script is a placeholder and does not run a test suite.
