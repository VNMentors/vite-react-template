import { Hono } from "hono";
import type { AppEnv, Bindings } from "./types";
import auth from "./routes/auth";
import customers from "./routes/customers";
import products from "./routes/products";
import stats from "./routes/stats";
import reports from "./routes/reports";
import users from "./routes/users";
import importRoute from "./routes/import";
import publicRoute from "./routes/public";
import groupsRoute from "./routes/groups";
import subscriptionsRoute from "./routes/subscriptions";
import lmsRoute from "./routes/lms";
import emailRoute from "./routes/email";
import { processEmailJob } from "./lib/email-processor";

const app = new Hono<AppEnv>();

app.route("/api/auth", auth);
app.route("/api/customers", customers);
app.route("/api/products", products);
app.route("/api/stats", stats);
app.route("/api/reports", reports);
app.route("/api/users", users);
app.route("/api/import", importRoute);
app.route("/api/public", publicRoute);
app.route("/api/groups", groupsRoute);
app.route("/api", subscriptionsRoute);
app.route("/api/lms", lmsRoute);
app.route("/api/email", emailRoute);

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Scheduled Worker] Running cron trigger at: ${event.scheduledTime}`);
    const db = env.DB;

    try {
      const nowUtc = new Date().toISOString();

      const runningJob = await db
        .prepare(
          `SELECT id FROM background_jobs
           WHERE type = 'SEND_BULK_EMAIL'
             AND status IN ('PENDING', 'PROCESSING')
           LIMIT 1`
        )
        .first<{ id: number }>();

      if (!runningJob) {
        const dueScheduledJobs = await db
          .prepare(
            `SELECT id FROM background_jobs
             WHERE type = 'SEND_BULK_EMAIL'
               AND status = 'SCHEDULED'
               AND scheduled_at IS NOT NULL
               AND scheduled_at <= ?
             ORDER BY scheduled_at ASC
             LIMIT 1`
          )
          .bind(nowUtc)
          .all<{ id: number }>();

        for (const job of dueScheduledJobs.results || []) {
          await db
            .prepare("UPDATE background_jobs SET status = 'PENDING', updated_at = ? WHERE id = ? AND status = 'SCHEDULED'")
            .bind(nowUtc, job.id)
            .run();

          console.log(`[Scheduled Worker] Activating scheduled email job ${job.id}`);
          ctx.waitUntil(
            (async () => {
              let nextChain = true;
              let currentChainCount = 1;
              while (nextChain && currentChainCount <= 100) {
                const res = await processEmailJob(job.id, env, currentChainCount);
                nextChain = res.success && res.shouldChain;
                currentChainCount++;
              }
            })()
          );
        }
      }
      // 1. Optimization check: Count STALLED/PROCESSING jobs that could be restarted
      const activeJobsCount = await db
        .prepare(
          `SELECT COUNT(*) as count 
           FROM background_jobs 
           WHERE type = 'SEND_BULK_EMAIL' 
             AND status IN ('STALLED', 'PROCESSING')`
        )
        .first<{ count: number }>();

      if (!activeJobsCount || activeJobsCount.count === 0) {
        console.log(`[Scheduled Worker] No stalled or active processing jobs to check. Exiting early.`);
        return;
      }

      // 2. Fetch jobs that are STALLED or stuck in PROCESSING with expired lock
      const stalledJobs = await db
        .prepare(
          `SELECT id, status FROM background_jobs 
           WHERE type = 'SEND_BULK_EMAIL' 
             AND (status = 'STALLED' OR (status = 'PROCESSING' AND (locked_until IS NULL OR locked_until < ?)))
           LIMIT 10`
        )
        .bind(nowUtc)
        .all<{ id: number; status: string }>();

      if (!stalledJobs.results || stalledJobs.results.length === 0) {
        console.log(`[Scheduled Worker] Stalled job count was positive but no processable jobs found. Exiting.`);
        return;
      }

      console.log(`[Scheduled Worker] Found ${stalledJobs.results.length} jobs to restart/recover.`);

      for (const job of stalledJobs.results) {
        console.log(`[Scheduled Worker] Recovering/Triggering job ${job.id} (Status: ${job.status})`);
        
        // Execute background job recovery in ctx.waitUntil using our secure internal process
        // We use localhost address which is local to the Cloudflare Worker env, calling our Hono router
        // Since scheduled runs on the same worker, we can just trigger it by sending a request
        // Alternatively, we can invoke processEmailJob directly, which is safer and doesn't rely on HTTP loopback!
        ctx.waitUntil(
          (async () => {
            let nextChain = true;
            let currentChainCount = 1;
            while (nextChain && currentChainCount <= 100) {
              const res = await processEmailJob(job.id, env, currentChainCount);
              nextChain = res.success && res.shouldChain;
              currentChainCount++;
            }
          })()
        );
      }
    } catch (err: any) {
      console.error(`[Scheduled Worker] Error running cron recovery:`, err);
    }
  }
};


