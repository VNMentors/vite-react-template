#!/usr/bin/env node
/**
 * Chuyển file CSV khách hàng → SQL migration để seed vào D1.
 *
 * Cách dùng:
 *   node scripts/csv-to-migration.mjs "Lead_990.csv" > migrations/0007_seed_leads.sql
 *
 * Sau đó chạy:
 *   wrangler d1 migrations apply vn-crm --remote          (cho migration 0006 nếu chưa apply)
 *   wrangler d1 execute vn-crm --file=migrations/0007_seed_leads.sql --remote
 */

import { readFileSync } from 'node:fs';

const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error('Usage: node scripts/csv-to-migration.mjs <csv-file>');
  process.exit(1);
}

// Map trạng thái CSV → status code trong hệ thống
const STATUS_MAP = {
  'Đã chốt':      'closed',
  'Dùng thử':     'trial',
  'Tiềm năng':    'potential',
  'Mới':          'new',
  'Đang liên hệ': 'contacting',
  'Đang tư vấn':  'contacting',
};

/** dd/mm/yyyy → yyyy-mm-dd, null nếu không hợp lệ */
function parseDate(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Escape string cho SQLite, trả về NULL nếu rỗng */
function sql(v) {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).trim();
  if (!s) return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}

/** Làm sạch số điện thoại (xóa khoảng trắng, xuống dòng) */
function cleanPhone(v) {
  if (!v) return null;
  const s = v.replace(/[\s\n\r]/g, '').trim();
  return s || null;
}

// ── CSV Parser đơn giản, hỗ trợ field có quote và xuống dòng ──────────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQ) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        row.push(field.trim());
        field = '';
      } else if (c === '\n') {
        row.push(field.trim());
        field = '';
        if (row.some(f => f !== '')) rows.push(row);
        row = [];
      } else if (c !== '\r') {
        field += c;
      }
    }
  }
  // Dòng cuối không có \n
  if (field.trim() || row.length > 0) {
    row.push(field.trim());
    if (row.some(f => f !== '')) rows.push(row);
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────
const content = readFileSync(csvPath, 'utf-8');
const allRows = parseCSV(content);

if (allRows.length < 2) {
  console.error('CSV trống hoặc chỉ có header');
  process.exit(1);
}

// Column indexes (theo thứ tự: ID, Ngày nhận, Tên KH, SĐT, Email, FB, Nguồn, SP, Trạng thái, Ngày chốt)
const C = { id: 0, date: 1, name: 2, phone: 3, email: 4, fb: 5, source: 6, product: 7, status: 8 };

const [, ...dataRows] = allRows; // bỏ header

const lines = [
  '-- Auto-generated from CSV import. Chỉ chạy 1 lần.',
  `-- Generated: ${new Date().toISOString()}`,
  '',
  'BEGIN TRANSACTION;',
  '',
];

let count = 0;
let skipped = 0;

for (const row of dataRows) {
  const name = row[C.name]?.trim();
  if (!name) { skipped++; continue; }

  const phone      = cleanPhone(row[C.phone]);
  const email      = row[C.email]?.trim() || null;
  const fb         = row[C.fb]?.trim()    || null;
  const source     = row[C.source]?.trim()  || null;
  const productRaw = row[C.product]?.trim().toLowerCase() || null;
  const statusRaw  = row[C.status]?.trim() || '';
  const status     = STATUS_MAP[statusRaw] ?? 'new';
  const receivedDate = parseDate(row[C.date]);
  const dateExpr   = receivedDate ? `'${receivedDate} 07:00:00'` : "datetime('now')";

  // Product subquery – dùng LOWER() để match không phân biệt hoa thường (ASCII)
  const productExpr = productRaw
    ? `(SELECT id FROM products WHERE LOWER(name) = ${sql(productRaw)} LIMIT 1)`
    : 'NULL';

  lines.push(
    `INSERT INTO customers (name, phone, email, facebook_link, source, product_id, status, created_at, updated_at)`,
    `VALUES (${sql(name)}, ${sql(phone)}, ${sql(email)}, ${sql(fb)}, ${sql(source)}, ${productExpr}, '${status}', ${dateExpr}, ${dateExpr});`,
    '',
  );
  count++;
}

lines.push('COMMIT;');

console.log(lines.join('\n'));
console.error(`\n✓ ${count} khách hàng | ✗ ${skipped} dòng bỏ qua (thiếu tên)`);
