export type LookupProduct = { id: number; name: string; active?: number };
export type LookupGroup = { id: number; name: string; order_index: number; is_won: number };
export type LookupUser = { id: number; name: string; email: string; role: string };

export function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function cleanPhone(value: string | number | null | undefined) {
  if (value == null) return null;
  let digits = String(value).trim().replace(/\.0$/, "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("84") && digits.length >= 11) digits = "0" + digits.slice(2);
  if (digits.length === 9 && /^[35789]/.test(digits)) digits = "0" + digits;
  return digits;
}

export function cleanEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email || null;
}

export function parseMoney(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const sign = value.includes("-") ? -1 : 1;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits) * sign;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parsePercent(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = value.trim().replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseDateString(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    // Excel serial date, based on 1899-12-30.
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = value.trim();
  const vn = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (vn) {
    const [, d, m, y] = vn;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function statusFromLabel(value: string | null | undefined) {
  const key = normalizeText(value);
  if (!key || key === "moi" || key === "new") return "new";
  if (key.includes("lienhe") || key.includes("tiepcan") || key.includes("contact")) return "contacting";
  if (key.includes("tiemnang") || key.includes("potential")) return "potential";
  if (key.includes("dungthu") || key.includes("trial")) return "trial";
  if (key.includes("tuvan") || key.includes("consult")) return "consulting";
  if (key.includes("chot") || key.includes("won") || key.includes("closed")) return "closed";
  if (key.includes("mat") || key.includes("khongphuhop") || key.includes("lost")) return "lost";
  return "new";
}

export function resolveProductId(
  products: LookupProduct[],
  productId?: number | null,
  productName?: string | null,
) {
  if (productId && products.some((p) => p.id === productId)) return productId;
  let key = normalizeText(productName);
  if (!key) return null;
  if (key === "pre90") {
    key = "990toeic";
  }

  const exact = products.find((p) => normalizeText(p.name) === key);
  if (exact) return exact.id;

  const contains = products.find((p) => {
    const pn = normalizeText(p.name);
    return pn.includes(key) || key.includes(pn);
  });
  if (contains) return contains.id;

  if (key.includes("990")) return products.find((p) => normalizeText(p.name).includes("990"))?.id ?? null;
  if (key.includes("lms") || key.includes("weblms")) return products.find((p) => normalizeText(p.name).includes("lms"))?.id ?? null;
  if (key.includes("4kynang") || key.includes("4skills")) return products.find((p) => normalizeText(p.name).includes("4kynang"))?.id ?? null;
  if (key.includes("lr")) return products.find((p) => normalizeText(p.name).includes("lr"))?.id ?? null;

  return null;
}

export function resolveUser(
  users: LookupUser[],
  value?: string | null,
) {
  const key = normalizeText(value);
  if (!key) return null;
  const exact = users.find((u) => normalizeText(u.name) === key || normalizeText(u.email) === key);
  if (exact) return exact;

  const fuzzy = users.filter((u) => {
    const name = normalizeText(u.name);
    const email = normalizeText(u.email);
    return name.includes(key) || key.includes(name) || email.includes(key);
  });
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

export function resolveGroupId(
  groups: LookupGroup[],
  groupId?: number | null,
  groupName?: string | null,
  statusLabel?: string | null,
) {
  if (groupId && groups.some((g) => g.id === groupId)) return groupId;

  const groupKey = normalizeText(groupName);
  if (groupKey && groupKey !== "moi" && groupKey !== "new") {
    const exact = groups.find((g) => normalizeText(g.name) === groupKey);
    if (exact) return exact.id;
    const fuzzy = groups.find((g) => {
      const gn = normalizeText(g.name);
      return gn.includes(groupKey) || groupKey.includes(gn);
    });
    if (fuzzy) return fuzzy.id;
  }

  const key = normalizeText(statusLabel);
  const nonWon = [...groups].filter((g) => !g.is_won).sort((a, b) => a.order_index - b.order_index);
  const won = [...groups].filter((g) => g.is_won).sort((a, b) => a.order_index - b.order_index);
  if (!key || key === "moi" || key === "new") return null;
  if (key.includes("gioithieu")) return won.find((g) => normalizeText(g.name).includes("gioithieu"))?.id ?? won[0]?.id ?? null;
  if (key.includes("chot") || key.includes("won") || key.includes("closed")) return won[0]?.id ?? null;
  if (key.includes("tuvan") || key.includes("trial") || key.includes("dungthu") || key.includes("tiemnang")) {
    return nonWon[nonWon.length - 1]?.id ?? null;
  }
  if (key.includes("lienhe") || key.includes("tiepcan") || key.includes("contact")) return nonWon[0]?.id ?? null;
  return null;
}

export async function syncPrimaryDeal(db: D1Database, customerId: string | number) {
  try {
    const customer = await db.prepare(`
      SELECT c.id, c.product_id, c.final_price, g.is_won AS group_is_won
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE c.id = ?
    `).bind(customerId).first<{
      id: number;
      product_id: number | null;
      final_price: number | null;
      group_is_won: number | null;
    }>();
    if (!customer) return;

    const existing = await db.prepare(
      "SELECT id FROM deals WHERE customer_id = ? ORDER BY id ASC LIMIT 1"
    ).bind(customer.id).first<{ id: number }>();

    const amount = customer.final_price ?? 0;
    const isWon = customer.group_is_won === 1;
    if (isWon && amount > 0) {
      if (existing) {
        await db.prepare(`
          UPDATE deals
          SET product_id=?, amount=?, status='won', closed_at=COALESCE(closed_at, date('now')),
              note=COALESCE(note, 'CRM primary deal')
          WHERE id=?
        `).bind(customer.product_id, amount, existing.id).run();
      } else {
        await db.prepare(`
          INSERT INTO deals (customer_id, product_id, amount, status, closed_at, note)
          VALUES (?, ?, ?, 'won', date('now'), 'CRM primary deal')
        `).bind(customer.id, customer.product_id, amount).run();
      }
    } else if (existing && !isWon) {
      await db.prepare(
        "UPDATE deals SET status='open', closed_at=NULL WHERE id=? AND note IN ('CRM primary deal', 'Migrated từ final_price cũ')"
      ).bind(existing.id).run();
    }
  } catch {
    // Keep lead creation/import usable when the deals migration is not present yet.
  }
}
