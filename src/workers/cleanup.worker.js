import cron from "node-cron";
import { db } from "../prisma/db.js";

export function initializeCleanupWorker() {
  cron.schedule("0 0 * * *", async () => {
    console.log(
      "[Worker] Starting database cleanup: Purging expired refresh tokens...",
    );

    try {
      // 1. Calculate the 7-day expiration boundary
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // 2. Execute a fast, optimized batch update statement via Prisma 8
      const result = await db.orm.public.User.where({
        updatedAt: {
          lt: sevenDaysAgo, // Less than 7 days ago
        },
        NOT: {
          refreshToken: null, // Only scan active tokens to optimize database index performance
        },
      }).update({
        refreshToken: null,
      });

      console.log(`[Worker] Token cleanup completed successfully.`);
    } catch (error) {
      console.error("[Worker Error] Failed to purge expired sessions:", error);
    }
  });
}
