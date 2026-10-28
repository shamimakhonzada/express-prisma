import cron from "node-cron";
import { db } from "../prisma/db.ts";

const CLEANUP_CRON_SCHEDULE = "0 0 * * *"; // every day at 00:00
const CLEANUP_TIMEZONE = "Asia/Karachi";

async function revokeExpiredSessions() {
  try {
    const now = new Date().toISOString();

    const revokedCount = await db.orm.public.Session.where({ revokedAt: null })
      .where((session) => session.expiresAt.lt(now))
      .updateAndCount({ revokedAt: now });

    console.log(`[CleanupWorker] Revoked ${revokedCount} expired session(s).`);
  } catch (error) {
    console.error("[CleanupWorker] Failed to revoke expired sessions:", error);
  }
}

export function initializeCleanupWorker() {
  // Run once on startup, since node-cron does not catch up on missed runs.
  revokeExpiredSessions();

  cron.schedule(CLEANUP_CRON_SCHEDULE, revokeExpiredSessions, {
    timezone: CLEANUP_TIMEZONE,
  });
}
