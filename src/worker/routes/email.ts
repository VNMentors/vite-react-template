import { Hono } from 'hono';
import { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { processEmailJob } from '../lib/email-processor';

const emailRouter = new Hono<AppEnv>();

// 1. Get campaigns history
emailRouter.get('/campaigns', requireAuth, async (c) => {
  const db = c.env.DB;
  try {
    const jobs = await db
      .prepare(
        `SELECT j.*, u.name as creator_name 
         FROM background_jobs j
         LEFT JOIN users u ON j.created_by = u.id
         WHERE j.type = 'SEND_BULK_EMAIL'
         ORDER BY j.created_at DESC`
      )
      .all();
    return c.json({ success: true, data: jobs.results });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 2. Get campaign by ID
emailRouter.get('/campaigns/:id', requireAuth, async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  try {
    const job = await db
      .prepare(
        `SELECT j.*, u.name as creator_name 
         FROM background_jobs j
         LEFT JOIN users u ON j.created_by = u.id
         WHERE j.id = ?`
      )
      .bind(id)
      .first();

    if (!job) {
      return c.json({ success: false, message: 'Campaign not found' }, 404);
    }

    // Get stats on email_queue
    const stats = await db
      .prepare(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
         FROM email_queue 
         WHERE job_id = ?`
      )
      .bind(id)
      .first();

    // Get last few failed emails
    const failures = await db
      .prepare(
        `SELECT to_email, error_message, retry_count 
         FROM email_queue 
         WHERE job_id = ? AND status = 'FAILED' 
         LIMIT 20`
      )
      .bind(id)
      .all();

    return c.json({
      success: true,
      data: {
        job,
        stats,
        failures: failures.results,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 2b. Get email recipients count
emailRouter.get('/recipients-count', requireAuth, async (c) => {
  const db = c.env.DB;
  const role = c.get('userRole');
  const userId = c.get('userId');

  try {
    let query = `
      SELECT COUNT(*) as count 
      FROM customers 
      WHERE email IS NOT NULL AND email != ''
        AND (status IS NULL OR status NOT IN ('converted_lms', 'archived'))
    `;
    const params: any[] = [];
    if (role !== 'admin') {
      query += ' AND assigned_user_id = ?';
      params.push(userId);
    }

    const row = await db.prepare(query).bind(...params).first<{ count: number }>();
    return c.json({ success: true, count: row?.count ?? 0 });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 2c. Get email recipients autocomplete list
emailRouter.get('/recipients-autocomplete', requireAuth, async (c) => {
  const db = c.env.DB;
  const role = c.get('userRole');
  const userId = c.get('userId');

  try {
    let query = `
      SELECT id, name, email 
      FROM customers 
      WHERE email IS NOT NULL AND email != ''
        AND (status IS NULL OR status NOT IN ('converted_lms', 'archived'))
    `;
    const params: any[] = [];
    if (role !== 'admin') {
      query += ' AND assigned_user_id = ?';
      params.push(userId);
    }

    const res = await db.prepare(query).bind(...params).all<{ id: number; name: string; email: string }>();
    return c.json({ success: true, data: res.results });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 3. Create a bulk email campaign
emailRouter.post('/campaigns', requireAuth, async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  const body = await c.req.json<{
    subject: string;
    htmlContent: string;
    customerIds: number[];
    customEmails?: string[];
    status?: 'DRAFT' | 'PENDING' | 'SCHEDULED';
    scheduledAt?: string;
  }>();

  if (!body.subject || !body.htmlContent || (!body.customerIds && !body.customEmails)) {
    return c.json({ success: false, message: 'Missing subject, content, or targets' }, 400);
  }

  try {
    const nowUtc = new Date().toISOString();
    const scheduledAt = body.status === 'SCHEDULED' && body.scheduledAt
      ? new Date(body.scheduledAt)
      : null;

    if (body.status === 'SCHEDULED') {
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        return c.json({ success: false, message: 'Thời gian lên lịch không hợp lệ.' }, 400);
      }
      if (scheduledAt.getTime() <= Date.now()) {
        return c.json({ success: false, message: 'Thời gian lên lịch phải lớn hơn thời điểm hiện tại.' }, 400);
      }
    }

    // Prevent running multiple bulk email jobs concurrently to optimize cost and prevent locks
    const activeJob = await db
      .prepare(
        `SELECT id FROM background_jobs 
         WHERE type = 'SEND_BULK_EMAIL' 
           AND status IN ('PENDING', 'PROCESSING') 
         LIMIT 1`
      )
      .first();

    if (activeJob && body.status !== 'SCHEDULED') {
      return c.json(
        {
          success: false,
          message: 'Có một chiến dịch gửi email khác đang chạy. Vui lòng chờ đến khi hoàn thành.',
        },
        409
      );
    }

    // Fetch customer email info
    let customers;
    if (body.customEmails && body.customEmails.length > 0) {
      customers = body.customEmails.map((email, idx) => ({
        id: null as any,
        name: email.split('@')[0] || `Test User ${idx + 1}`,
        email: email
      }));
    } else if (body.customerIds && body.customerIds.length > 0) {
      const placeholders = body.customerIds.map(() => '?').join(',');
      const res = await db
        .prepare(
          `SELECT id, name, email 
           FROM customers 
           WHERE id IN (${placeholders}) AND email IS NOT NULL AND email != ''`
        )
        .bind(...body.customerIds)
        .all<{ id: number; name: string; email: string }>();
      customers = res.results;
    } else {
      const role = c.get('userRole');
      const currentUserId = c.get('userId');
      let query = `
        SELECT id, name, email 
        FROM customers 
        WHERE email IS NOT NULL AND email != ''
          AND (status IS NULL OR status NOT IN ('converted_lms', 'archived'))
      `;
      const params: any[] = [];
      if (role !== 'admin') {
        query += ' AND assigned_user_id = ?';
        params.push(currentUserId);
      }
      const res = await db.prepare(query).bind(...params).all<{ id: number; name: string; email: string }>();
      customers = res.results;
    }

    if (!customers || customers.length === 0) {
      return c.json({ success: false, message: 'Không tìm thấy khách hàng nào có email hợp lệ.' }, 400);
    }

    const scheduledAtIso = scheduledAt?.toISOString() ?? null;
    const payloadStr = JSON.stringify({
      subject: body.subject,
      htmlContent: body.htmlContent,
      scheduledAt: scheduledAtIso,
    });

    // 1. Insert Background Job
    const initialStatus = body.status === 'DRAFT' ? 'DRAFT' : body.status === 'SCHEDULED' ? 'SCHEDULED' : 'PENDING';
    const jobResult = await db
      .prepare(
        `INSERT INTO background_jobs (type, status, payload, progress, total, created_by, scheduled_at, created_at, updated_at)
         VALUES ('SEND_BULK_EMAIL', ?, ?, 0, ?, ?, ?, ?, ?)`
      )
      .bind(initialStatus, payloadStr, customers.length, userId, scheduledAtIso, nowUtc, nowUtc)
      .run();

    const jobId = jobResult.meta.last_row_id;

    // 2. Insert into email_queue in batches using db.batch to avoid multiple trips
    const queueStatements = customers.map((cust) => {
      return db
        .prepare(
          `INSERT INTO email_queue (job_id, to_email, to_name, customer_id, status, created_at)
           VALUES (?, ?, ?, ?, 'PENDING', ?)`
        )
        .bind(jobId, cust.email, cust.name, cust.id, nowUtc);
    });

    if (queueStatements.length > 0) {
      await db.batch(queueStatements);
    }

    // 3. Trigger immediate processing using ctx.waitUntil (only if not DRAFT/SCHEDULED)
    if (initialStatus === 'PENDING') {
      console.log(`[Campaigns API] Triggering direct background process loop for job ${jobId}`);
      c.executionCtx.waitUntil(
        (async () => {
          try {
            let chain = 1;
            let res = await processEmailJob(jobId, c.env, chain);
            while (res.success && res.shouldChain && chain < 100) {
              chain++;
              res = await processEmailJob(jobId, c.env, chain);
            }
          } catch (err) {
            console.error(`[Campaigns API] Error in direct process loop for job ${jobId}:`, err);
          }
        })()
      );
    }

    return c.json({
      success: true,
      message: initialStatus === 'DRAFT'
        ? 'Đã tạo bản nháp chiến dịch thành công.'
        : initialStatus === 'SCHEDULED'
          ? 'Đã lên lịch gửi chiến dịch email thành công.'
          : 'Đã tạo chiến dịch gửi email và đang chạy ngầm.',
      data: { jobId, total: customers.length },
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 3b. Start a draft campaign
emailRouter.post('/campaigns/:id/start', requireAuth, async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const nowUtc = new Date().toISOString();

  try {
    const job = await db
      .prepare("SELECT status FROM background_jobs WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();

    if (!job) {
      return c.json({ success: false, message: 'KhÃ´ng tÃ¬m tháº¥y chiáº¿n dá»‹ch.' }, 404);
    }

    if (job.status !== 'DRAFT') {
      return c.json({ success: false, message: 'Chiáº¿n dá»‹ch nÃ y Ä‘Ã£ báº¯t Ä‘áº§u hoáº·c Ä‘Ã£ káº¿t thÃºc.' }, 400);
    }

    // Set to PENDING
    await db
      .prepare("UPDATE background_jobs SET status = 'PENDING', updated_at = ? WHERE id = ?")
      .bind(nowUtc, id)
      .run();

    // Trigger processing
    console.log(`[Campaigns API] Triggering start of draft process directly for job ${id}`);
    c.executionCtx.waitUntil(
      (async () => {
        try {
          let chain = 1;
          let res = await processEmailJob(id, c.env, chain);
          while (res.success && res.shouldChain && chain < 100) {
            chain++;
            res = await processEmailJob(id, c.env, chain);
          }
        } catch (err) {
          console.error(`[Campaigns API] Error starting job ${id} in direct loop:`, err);
        }
      })()
    );

    return c.json({
      success: true,
      message: 'Chiáº¿n dá»‹ch Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t vÃ  báº¯t Ä‘áº§u gá»­i ngáº§m.'
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 4. Cancel campaigns
emailRouter.patch('/campaigns/:id/cancel', requireAuth, async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const nowUtc = new Date().toISOString();
  try {
    const result = await db
      .prepare(
        `UPDATE background_jobs 
         SET status = 'CANCELLED', locked_until = NULL, updated_at = ? 
         WHERE id = ? AND status IN ('PENDING', 'PROCESSING', 'STALLED', 'SCHEDULED')`
      )
      .bind(nowUtc, id)
      .run();

    if (result.meta.changes === 0) {
      return c.json(
        {
          success: false,
          message: 'Chiáº¿n dá»‹ch khÃ´ng thá»ƒ há»§y (cÃ³ thá»ƒ Ä‘Ã£ hoÃ n thÃ nh hoáº·c tháº¥t báº¡i).',
        },
        400
      );
    }

    // Cancel remaining pending emails in queue
    await db
      .prepare(
        `UPDATE email_queue 
         SET status = 'FAILED', error_message = 'Cancelled by user' 
         WHERE job_id = ? AND status = 'PENDING'`
      )
      .bind(id)
      .run();

    return c.json({ success: true, message: 'ÄÃ£ há»§y chiáº¿n dá»‹ch thÃ nh cÃ´ng.' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 5. Test/Preview Endpoint (Single email to current Admin user)
emailRouter.post('/campaigns/test', requireAuth, async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  const body = await c.req.json<{
    subject: string;
    htmlContent: string;
  }>();

  if (!body.subject || !body.htmlContent) {
    return c.json({ success: false, message: 'Missing subject or content' }, 400);
  }

  try {
    // Get Admin user email
    const adminUser = await db
      .prepare('SELECT email, name FROM users WHERE id = ?')
      .bind(userId)
      .first<{ email: string; name: string }>();

    if (!adminUser || !adminUser.email) {
      return c.json({ success: false, message: 'TÃ i khoáº£n admin hiá»‡n táº¡i khÃ´ng cÃ³ email.' }, 400);
    }

    // Call Firebase API immediately (blocking for preview)
    console.log(`[Campaigns API] Preview mail sending to admin: ${adminUser.email}`);
    const res = await fetch(c.env.EMAIL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: adminUser.email,
        subject: `[PREVIEW] ${body.subject}`,
        html: body.htmlContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ success: false, message: `Lá»—i gá»­i mail: ${res.status} - ${errText}` }, 500);
    }

    const resBody = (await res.json()) as { success: boolean; message?: string };
    if (!resBody.success) {
      return c.json({ success: false, message: resBody.message || 'Lá»—i gá»­i mail tá»« Firebase API' }, 500);
    }

    return c.json({ success: true, message: `ÄÃ£ gá»­i mail xem trÆ°á»›c thÃ nh cÃ´ng tá»›i ${adminUser.email}` });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 6. Direct single send for CustomerDetail page
emailRouter.post('/send-single', requireAuth, async (c) => {
  const body = await c.req.json<{
    toEmail: string;
    subject: string;
    htmlContent: string;
  }>();

  if (!body.toEmail || !body.subject || !body.htmlContent) {
    return c.json({ success: false, message: 'Missing fields' }, 400);
  }

  try {
    console.log(`[Campaigns API] Sending single email to: ${body.toEmail}`);
    const res = await fetch(c.env.EMAIL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: body.toEmail,
        subject: body.subject,
        html: body.htmlContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ success: false, message: `Lá»—i gá»­i mail: ${res.status} - ${errText}` }, 500);
    }

    const resBody = (await res.json()) as { success: boolean; message?: string };
    if (!resBody.success) {
      return c.json({ success: false, message: resBody.message || 'Lá»—i gá»­i mail tá»« Firebase API' }, 500);
    }

    return c.json({ success: true, message: `ÄÃ£ gá»­i email thÃ nh cÃ´ng tá»›i ${body.toEmail}` });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 7. Internal Process Endpoint (Called via ctx.waitUntil self-chaining)
emailRouter.post('/process/:jobId', async (c) => {
  const jobId = parseInt(c.req.param('jobId'), 10);
  const internalKey = c.req.header('X-Internal-Key');
  const chainCountHeader = c.req.header('X-Chain-Count') || '1';
  const chainCount = parseInt(chainCountHeader, 10);

  // Authenticate internal key
  const expectedKey = c.env.API_KEY || 'vncrm-default-internal-key-2026';
  if (internalKey !== expectedKey) {
    console.warn(`[Internal Process] Unauthorized access attempt to /process/${jobId}`);
    return c.json({ success: false, message: 'Forbidden' }, 403);
  }

  try {
    const result = await processEmailJob(jobId, c.env, chainCount);

    if (result.success && result.shouldChain) {
      // Chain worker execution
      const internalUrl = `${new URL(c.req.url).origin}/api/email/process/${jobId}`;
      console.log(`[Internal Process] Self-chaining job ${jobId}. Next chainCount: ${chainCount + 1}`);

      c.executionCtx.waitUntil(
        fetch(internalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': c.env.API_KEY || 'vncrm-default-internal-key-2026',
            'X-Chain-Count': (chainCount + 1).toString(),
          },
        })
      );
    }

    return c.json({ success: true, shouldChain: result.shouldChain });
  } catch (err: any) {
    console.error(`[Internal Process] Error processing job ${jobId}:`, err);
    return c.json({ success: false, message: err.message }, 500);
  }
});

export default emailRouter;


