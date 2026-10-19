import cron from "node-cron";
import { db } from "../prisma/db.ts";

const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_CRON_SCHEDULE = "0 0 * * *"; // every day at 00:00
const CLEANUP_TIMEZONE = "Asia/Karachi";

async function purgeExpiredRefreshTokens() {
  try {
    const expiryThreshold = new Date(
      Date.now() - REFRESH_TOKEN_MAX_AGE_MS,
    ).toISOString();

    const purgedCount = await db.orm.public.User.where((user) =>
      user.updatedAt.lt(expiryThreshold),
    )
      .where((user) => user.refreshToken.isNotNull())
      .updateAndCount({ refreshToken: null });

    console.log(
      `[CleanupWorker] Purged ${purgedCount} expired refresh token(s).`,
    );
  } catch (error) {
    console.error(
      "[CleanupWorker] Failed to purge expired refresh tokens:",
      error,
    );
  }
}

export function initializeCleanupWorker() {
  // Run once on startup, since node-cron does not catch up on missed runs.
  purgeExpiredRefreshTokens();

  cron.schedule(CLEANUP_CRON_SCHEDULE, purgeExpiredRefreshTokens, {
    timezone: CLEANUP_TIMEZONE,
  });
}
