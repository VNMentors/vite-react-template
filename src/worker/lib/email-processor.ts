import { Bindings } from '../types';

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface BulkEmailPayload {
  subject: string;
  htmlContent: string;
}

export async function processEmailJob(
  jobId: number,
  env: Bindings,
  chainCount: number
): Promise<{ success: boolean; shouldChain: boolean; error?: string }> {
  const db = env.DB;
  const batchSize = parseInt(env.EMAIL_BATCH_SIZE || '50', 10);
  const maxRetry = parseInt(env.EMAIL_MAX_RETRY || '3', 10);

  // 1. Lock job atomically to prevent concurrent processing by cron / duplicate hooks
  // locked_until: 60s lock duration
  const nowUtc = new Date().toISOString();
  const lockUntilStr = new Date(Date.now() + 60 * 1000).toISOString();

  const lockQuery = await db
    .prepare(
      `UPDATE background_jobs 
       SET locked_until = ?, updated_at = ? 
       WHERE id = ? 
         AND status IN ('PENDING', 'PROCESSING', 'STALLED')
         AND (locked_until IS NULL OR locked_until < ?)`
    )
    .bind(lockUntilStr, nowUtc, jobId, nowUtc)
    .run();

  if (!lockQuery.success || lockQuery.meta.changes === 0) {
    console.log(`[EmailProcessor] Job ${jobId} is currently locked or not in a processable state.`);
    return { success: false, shouldChain: false, error: 'Job is locked or completed' };
  }

  // 2. Load job detail & status check
  const job = await db
    .prepare('SELECT * FROM background_jobs WHERE id = ?')
    .bind(jobId)
    .first<{
      status: string;
      payload: string;
      progress: number;
      total: number;
    }>();

  if (!job) {
    return { success: false, shouldChain: false, error: 'Job not found' };
  }

  if (job.status === 'CANCELLED') {
    // Release lock & update status
    await db
      .prepare("UPDATE background_jobs SET locked_until = NULL, updated_at = ? WHERE id = ?")
      .bind(nowUtc, jobId)
      .run();
    return { success: true, shouldChain: false };
  }

  // Double check status - if it's already COMPLETED or FAILED, release and return
  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    await db
      .prepare("UPDATE background_jobs SET locked_until = NULL, updated_at = ? WHERE id = ?")
      .bind(nowUtc, jobId)
      .run();
    return { success: true, shouldChain: false };
  }

  // Update status to PROCESSING if it was PENDING/STALLED
  await db
    .prepare("UPDATE background_jobs SET status = 'PROCESSING', updated_at = ? WHERE id = ?")
    .bind(nowUtc, jobId)
    .run();

  // Parse payload
  let payload: BulkEmailPayload;
  try {
    payload = JSON.parse(job.payload);
  } catch (err: any) {
    await db
      .prepare("UPDATE background_jobs SET status = 'FAILED', error_message = ?, locked_until = NULL, updated_at = ? WHERE id = ?")
      .bind(`Invalid payload JSON: ${err.message}`, nowUtc, jobId)
      .run();
    return { success: false, shouldChain: false, error: 'Invalid payload' };
  }

  // 3. Fetch a batch of PENDING/FAILED email queue items
  const queueItems = await db
    .prepare(
      `SELECT * FROM email_queue 
       WHERE job_id = ? AND status IN ('PENDING', 'FAILED') 
       AND retry_count < ? 
       LIMIT ?`
    )
    .bind(jobId, maxRetry, batchSize)
    .all<{
      id: number;
      to_email: string;
      to_name: string | null;
      retry_count: number;
    }>();

  if (!queueItems.results || queueItems.results.length === 0) {
    // No more email to process. Complete the job.
    await db
      .prepare(
        `UPDATE background_jobs 
         SET status = 'COMPLETED', progress = total, locked_until = NULL, updated_at = ? 
         WHERE id = ?`
      )
      .bind(nowUtc, jobId)
      .run();
    return { success: true, shouldChain: false };
  }

  // 4. Send emails with small delay in between
  const emailApiUrl = env.EMAIL_API_URL;

  const results: {
    id: number;
    status: 'COMPLETED' | 'FAILED';
    errorMessage?: string;
    retryCount: number;
  }[] = [];

  let processedCount = 0;

  for (const item of queueItems.results) {
    // Double check cancellation before each email send
    const currentJobStatus = await db
      .prepare('SELECT status FROM background_jobs WHERE id = ?')
      .bind(jobId)
      .first<{ status: string }>();

    if (currentJobStatus?.status === 'CANCELLED') {
      console.log(`[EmailProcessor] Job ${jobId} was cancelled during batch processing.`);
      await db
        .prepare("UPDATE background_jobs SET locked_until = NULL, updated_at = ? WHERE id = ?")
        .bind(nowUtc, jobId)
        .run();
      return { success: true, shouldChain: false };
    }

    // 100ms throttle between emails to prevent Firebase Cloud Function spike/quota exhaustion
    if (processedCount > 0) {
      await delay(100);
    }

    try {
      console.log(`[EmailProcessor] Sending email to ${item.to_email} (Job: ${jobId}, Item: ${item.id})`);
      const res = await fetch(emailApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: item.to_email,
          subject: payload.subject,
          html: payload.htmlContent,
        }),
      });

      if (res.status === 429) {
        // Firebase Cloud Function/API tells us too many requests. We should pause and mark as stalled
        console.warn(`[EmailProcessor] Received 429 Too Many Requests from Firebase API.`);
        results.push({
          id: item.id,
          status: 'FAILED',
          errorMessage: '429 Too Many Requests from Firebase API',
          retryCount: item.retry_count + 1,
        });
      } else if (!res.ok) {
        const errText = await res.text();
        console.error(`[EmailProcessor] Failed to send to ${item.to_email}: ${res.status} - ${errText}`);
        results.push({
          id: item.id,
          status: 'FAILED',
          errorMessage: `HTTP ${res.status}: ${errText.substring(0, 100)}`,
          retryCount: item.retry_count + 1,
        });
      } else {
        const body = (await res.json()) as { success: boolean; message?: string };
        if (body.success) {
          results.push({
            id: item.id,
            status: 'COMPLETED',
            retryCount: item.retry_count,
          });
        } else {
          console.error(`[EmailProcessor] Send API responded with error: ${body.message}`);
          results.push({
            id: item.id,
            status: 'FAILED',
            errorMessage: body.message || 'API responded false',
            retryCount: item.retry_count + 1,
          });
        }
      }
    } catch (err: any) {
      console.error(`[EmailProcessor] Error fetching send email endpoint:`, err);
      results.push({
        id: item.id,
        status: 'FAILED',
        errorMessage: err.message || 'Fetch error',
        retryCount: item.retry_count + 1,
      });
    }

    processedCount++;
  }

  // 5. Batch update email queue status to save D1 write cycles
  const batchStatements = results.map((r) => {
    if (r.status === 'COMPLETED') {
      return db
        .prepare(
          `UPDATE email_queue 
           SET status = 'COMPLETED', sent_at = ?, retry_count = ? 
           WHERE id = ?`
        )
        .bind(nowUtc, r.retryCount, r.id);
    } else {
      return db
        .prepare(
          `UPDATE email_queue 
           SET status = 'FAILED', error_message = ?, retry_count = ? 
           WHERE id = ?`
        )
        .bind(r.errorMessage || 'Unknown error', r.retryCount, r.id);
    }
  });

  // Execute batch writes in one transaction
  if (batchStatements.length > 0) {
    await db.batch(batchStatements);
  }

  // 6. Update progress on background_job
  const processedBatchCount = queueItems.results.length;
  const newProgress = Math.min(job.progress + processedBatchCount, job.total);

  // Check if there are any remaining items in queue (either pending or failed that can be retried)
  const remainingCountResult = await db
    .prepare(
      `SELECT COUNT(*) as remaining 
       FROM email_queue 
       WHERE job_id = ? AND status IN ('PENDING', 'FAILED') AND retry_count < ?`
    )
    .bind(jobId, maxRetry)
    .first<{ remaining: number }>();

  const remainingCount = remainingCountResult?.remaining || 0;

  // Determine final status
  let finalStatus = 'PROCESSING';
  let shouldChain = remainingCount > 0;

  if (remainingCount === 0) {
    // Count successful vs failed
    const failedCountResult = await db
      .prepare(`SELECT COUNT(*) as failed FROM email_queue WHERE job_id = ? AND status = 'FAILED'`)
      .bind(jobId)
      .first<{ failed: number }>();

    const failedCount = failedCountResult?.failed || 0;
    if (failedCount === job.total) {
      finalStatus = 'FAILED';
    } else {
      finalStatus = 'COMPLETED';
    }
    shouldChain = false;
  } else if (chainCount >= 100) {
    // Infinite loop protection / execution threshold. Stalled for next cron restart.
    finalStatus = 'STALLED';
    shouldChain = false;
    console.warn(`[EmailProcessor] Job ${jobId} reached max chain count (100). Marking as STALLED.`);
  }

  // Release lock and update job status
  await db
    .prepare(
      `UPDATE background_jobs 
       SET status = ?, progress = ?, locked_until = NULL, updated_at = ? 
       WHERE id = ?`
    )
    .bind(finalStatus, newProgress, nowUtc, jobId)
    .run();

  return { success: true, shouldChain };
}
