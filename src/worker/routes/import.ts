import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";
import {
  cleanEmail,
  cleanPhone,
  parseDateString,
  parseMoney,
  parsePercent,
  resolveGroupId,
  resolveProductId,
  resolveUser,
  statusFromLabel,
  type LookupGroup,
  type LookupProduct,
  type LookupUser,
} from "../lib/crm";

type ImportRow = {
  name: string;
  phone?: string | number | null;
  email?: string | null;
  facebook_link?: string | null;
  company?: string | null;
  source?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  group_id?: number | null;
  group_name?: string | null;
  assigned_to?: string | null;
  status?: string;
  received_at?: string | number | null;
  list_price?: string | number | null;
  discount_pct?: string | number | null;
  final_price?: string | number | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const importRoute = new Hono<AppEnv>();
importRoute.use("*", requireAuth);

importRoute.post("/customers", async (c) => {
  const { rows, duplicate_mode } = await c.req.json<{
    rows: ImportRow[];
    duplicate_mode?: "update" | "skip" | "create";
  }>();
  if (!Array.isArray(rows) || rows.length === 0)
    return c.json({ error: "No data" }, 400);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  const [products, groups, users] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, active FROM products WHERE active=1 ORDER BY id")
      .all<LookupProduct>(),
    c.env.DB.prepare("SELECT id, name, order_index, is_won FROM groups ORDER BY order_index")
      .all<LookupGroup>(),
    c.env.DB.prepare("SELECT id, name, email, role FROM users ORDER BY id")
      .all<LookupUser>(),
  ]);

  const duplicateMode = duplicate_mode ?? "update";
  const CHUNK_SIZE = 100;

  // Pre-load all customers in memory to avoid SELECT query per row
  const allCustomers = await c.env.DB.prepare("SELECT id, phone, email FROM customers").all<{ id: number; phone: string | null; email: string | null }>();
  const phoneMap = new Map<string, number>();
  const emailMap = new Map<string, number>();
  for (const cust of allCustomers.results) {
    if (cust.phone) phoneMap.set(cust.phone, cust.id);
    if (cust.email) emailMap.set(cust.email.toLowerCase(), cust.id);
  }

  // Pre-load all deals in memory to know if a deal exists for syncPrimaryDeal
  let hasDealsTable = false;
  const dealMap = new Map<number, number>();
  try {
    const allDeals = await c.env.DB.prepare("SELECT id, customer_id FROM deals").all<{ id: number; customer_id: number }>();
    for (const deal of allDeals.results) {
      dealMap.set(deal.customer_id, deal.id);
    }
    hasDealsTable = true;
  } catch {
    // Table deals may not exist yet on production D1
  }

  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    
    // We will build a batch of queries for this chunk
    const customerStmts: {
      stmt: any;
      row: ImportRow;
      phone: string | null;
      email: string | null;
      productId: number | null;
      groupId: number | null;
      assignedUser: LookupUser | null;
      status: string | null;
      listPrice: number | null;
      discountPct: number;
      finalPrice: number | null;
      dateValue: string | null;
      existingId: number | null;
    }[] = [];

    for (const row of chunk) {
      if (!row.name?.trim()) { errors.push(`Bỏ qua dòng thiếu tên`); continue; }
      try {
        const phone = cleanPhone(row.phone);
        const email = cleanEmail(row.email);
        const productId = resolveProductId(products.results, row.product_id, row.product_name);
        const groupId = resolveGroupId(groups.results, row.group_id, row.group_name, row.status);
        const assignedUser = resolveUser(users.results, row.assigned_to);
        const status = row.status ? statusFromLabel(row.status) : null;
        const receivedDate = parseDateString(row.received_at || row.created_at);
        const dateValue = receivedDate ? `${receivedDate} 07:00:00` : null;
        const listPrice = parseMoney(row.list_price);
        const discountPct = parsePercent(row.discount_pct) ?? 0;
        const finalPrice = parseMoney(row.final_price);

        if (row.product_name && !productId) warnings.push(`Không map được sản phẩm "${row.product_name}" cho "${row.name}"`);
        if (row.assigned_to && !assignedUser) warnings.push(`Không map được sale "${row.assigned_to}" cho "${row.name}"`);

        // Find duplicate in memory
        let existingId: number | null = null;
        if (duplicateMode !== "create") {
          if (phone && phoneMap.has(phone)) {
            existingId = phoneMap.get(phone)!;
          } else if (email && emailMap.has(email.toLowerCase())) {
            existingId = emailMap.get(email.toLowerCase())!;
          }
        }

        if (existingId && duplicateMode === "skip") {
          skipped++;
          continue;
        }

        let stmt;
        if (existingId) {
          stmt = c.env.DB.prepare(`
            UPDATE customers SET
              name=?, phone=COALESCE(?, phone), email=COALESCE(?, email),
              facebook_link=COALESCE(?, facebook_link), company=COALESCE(?, company),
              source=COALESCE(?, source), product_id=COALESCE(?, product_id),
              group_id=COALESCE(?, group_id), assigned_to=COALESCE(?, assigned_to),
              assigned_user_id=COALESCE(?, assigned_user_id), status=COALESCE(?, status),
              list_price=COALESCE(?, list_price), discount_pct=COALESCE(?, discount_pct),
              final_price=COALESCE(?, final_price), updated_at=datetime('now')
            WHERE id=?
          `).bind(
            row.name.trim(), phone, email, row.facebook_link?.trim() || null,
            row.company?.trim() || null, row.source?.trim() || null, productId,
            groupId, assignedUser?.name ?? row.assigned_to?.trim() ?? null,
            assignedUser?.id ?? null, status, listPrice, discountPct, finalPrice,
            existingId
          );
        } else {
          const createdAt = dateValue ?? new Date().toISOString().replace("T", " ").slice(0, 19);
          stmt = c.env.DB.prepare(`
            INSERT INTO customers
              (name, phone, email, facebook_link, company, source, product_id, group_id,
               assigned_to, assigned_user_id, status, list_price, discount_pct, final_price,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            row.name.trim(), phone, email, row.facebook_link?.trim() || null,
            row.company?.trim() || null, row.source?.trim() || null, productId,
            groupId, assignedUser?.name ?? row.assigned_to?.trim() ?? null,
            assignedUser?.id ?? null, status ?? "new", listPrice, discountPct, finalPrice,
            createdAt, createdAt
          );
        }

        customerStmts.push({
          stmt, row, phone, email, productId, groupId, assignedUser,
          status, listPrice, discountPct, finalPrice, dateValue, existingId
        });
      } catch (err) {
        errors.push(`Lỗi khi phân tích dòng "${row.name}": ${String(err)}`);
      }
    }

    if (customerStmts.length === 0) continue;

    try {
      // Execute first batch (insert/update customers)
      const customerResults = await c.env.DB.batch(customerStmts.map(x => x.stmt));

      // Now build secondary statements (notes and deals)
      const secondaryStmts: any[] = [];

      for (let i = 0; i < customerStmts.length; i++) {
        const item = customerStmts[i];
        const res = customerResults[i];
        
        let customerId = item.existingId;
        if (item.existingId) {
          updated++;
        } else {
          customerId = Number(res.meta.last_row_id);
          imported++;
          // Update local maps so duplicates within the SAME import file are also caught
          if (item.phone) phoneMap.set(item.phone, customerId);
          if (item.email) emailMap.set(item.email.toLowerCase(), customerId);
        }

        if (!customerId) continue;

        // Note
        if (item.row.note?.trim()) {
          secondaryStmts.push(
            c.env.DB.prepare(
              "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
            ).bind(customerId, item.row.note.trim())
          );
        }

        // Deal Syncing
        if (hasDealsTable) {
          const group = groups.results.find(g => g.id === item.groupId);
          const isWon = group?.is_won === 1;
          const amount = item.finalPrice ?? 0;
          const dealId = dealMap.get(customerId);

          if (isWon && amount > 0) {
            if (dealId) {
              secondaryStmts.push(
                c.env.DB.prepare(`
                  UPDATE deals
                  SET product_id=?, amount=?, status='won', closed_at=COALESCE(closed_at, date('now')),
                      note=COALESCE(note, 'CRM primary deal')
                  WHERE id=?
                `).bind(item.productId, amount, dealId)
              );
            } else {
              secondaryStmts.push(
                c.env.DB.prepare(`
                  INSERT INTO deals (customer_id, product_id, amount, status, closed_at, note)
                  VALUES (?, ?, ?, 'won', date('now'), 'CRM primary deal')
                `).bind(customerId, item.productId, amount)
              );
            }
          } else if (dealId && !isWon) {
            secondaryStmts.push(
              c.env.DB.prepare(
                "UPDATE deals SET status='open', closed_at=NULL WHERE id=? AND note IN ('CRM primary deal', 'Migrated từ final_price cũ')"
              ).bind(dealId)
            );
          }
        }
      }

      // Execute secondary batch
      if (secondaryStmts.length > 0) {
        await c.env.DB.batch(secondaryStmts);
      }
    } catch (err) {
      errors.push(`Lỗi khi lưu dữ liệu lên database: ${String(err)}`);
    }
  }

  return c.json({
    imported,
    updated,
    skipped,
    errors,
    warnings: warnings.slice(0, 50),
  });
});

export default importRoute;
