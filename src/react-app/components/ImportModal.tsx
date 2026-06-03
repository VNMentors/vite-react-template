import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, Download, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import type { Group, Product } from "../lib/types";
import { STATUS_LABELS } from "./StatusBadge";

// ── Mapping trạng thái từ tiếng Việt thường gặp → code
const STATUS_MAP: Record<string, string> = {
  "mới": "new",
  "đang liên hệ": "contacting",
  "liên hệ": "contacting",
  "tiềm năng": "potential",
  "dùng thử": "trial",
  "thử": "trial",
  "đang tư vấn": "consulting",
  "tư vấn": "consulting",
  "đã chốt": "closed",
  "chốt": "closed",
  "không phù hợp": "lost",
  "mất": "lost",
  "new": "new",
  "contacting": "contacting",
  "potential": "potential",
  "trial": "trial",
  "consulting": "consulting",
  "closed": "closed",
  "lost": "lost",
};

// ── Map trạng thái → group_id dựa trên pipeline thực tế
function statusToGroupId(rawStatus: string, groups: Group[]): number | null {
  const s = rawStatus.toLowerCase().trim();
  const nonWon = [...groups].filter(g => !g.is_won).sort((a, b) => a.order_index - b.order_index);
  const won = [...groups].filter(g => g.is_won).sort((a, b) => a.order_index - b.order_index);

  if (s === "đã chốt" || s === "chốt") return won[0]?.id ?? null;
  if (s === "dùng thử" || s === "thử" || s === "đang tư vấn" || s === "tư vấn")
    return nonWon[nonWon.length - 1]?.id ?? null;
  if (s === "tiềm năng" || s === "đang liên hệ" || s === "liên hệ")
    return nonWon[1]?.id ?? null;
  return null;
}

// ── Cột template cố định (theo thứ tự)
const TEMPLATE_HEADERS = [
  "Tên KH", "SĐT/Zalo", "Email", "Link FB",
  "Công ty", "Nguồn", "Sản phẩm", "Trạng thái", "Sale phụ trách",
  "Ngày nhận", "Giá niêm yết", "Giảm giá (%)", "Giá chốt", "Ghi chú",
];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const firstLine = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[0] ?? "";
  const delimiters = [",", ";", "\t"];
  const delimiter = delimiters
    .map(d => ({ d, count: firstLine.split(d).length }))
    .sort((a, b) => b.count - a.count)[0]?.d ?? ",";
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && inQ) { cur += '"'; i++; }
      else if (ch === '"') { inQ = !inQ; }
      else if (ch === delimiter && !inQ) { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    rows.push(fields);
  }
  return rows;
}

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    [
      "Nguyễn Văn A", "0912345678", "email@gmail.com", "https://fb.com/...",
      "", "Facebook", "990TOEIC", "Mới", "Khánh Vy",
      new Date().toISOString().slice(0, 10), "590000", "0", "", "Khách quan tâm nhiều",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, "template_import_crm.xlsx");
}

type ImportRow = {
  name: string;
  phone?: string;
  email?: string;
  facebook_link?: string;
  company?: string;
  source?: string;
  product_id?: number;
  product_name?: string;
  group_id?: number | null;
  group_name?: string;
  assigned_to?: string;
  status?: string;
  received_at?: string;
  list_price?: string | number;
  discount_pct?: string | number;
  final_price?: string | number;
  note?: string;
  created_at?: string;
  updated_at?: string;
};

type Props = {
  onClose: () => void;
  products: Product[];
  groups: Group[];
};

function parseExcelDate(val: any): string | undefined {
  if (val == null) return undefined;
  
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return formatDate(val);
    }
  }

  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return formatDate(date);
  }

  const cleanVal = String(val).trim();
  if (!cleanVal) return undefined;
  
  const parts = cleanVal.split(/[/\-]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2].trim();
    if (year.includes(" ")) {
      const timePart = year.split(/\s+/)[1];
      year = year.split(/\s+/)[0];
      return `${year}-${month}-${day} ${timePart}`;
    }
    return `${year}-${month}-${day} 00:00:00`;
  }
  
  if (/^\d+$/.test(cleanVal)) {
    return undefined;
  }

  const d = new Date(cleanVal);
  if (!isNaN(d.getTime())) {
    return formatDate(d);
  }
  return cleanVal;
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function ImportModal({ onClose, products, groups }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[]; warnings: string[] } | null>(null);
  const [error, setError] = useState("");

  function rowsFromSheet(sheetRows: unknown[][]) {
    if (sheetRows.length < 2) { setError("File không có dữ liệu."); return; }

    const hdrs = sheetRows[0].map(v => String(v ?? "").trim());
    const idx = (...names: string[]) => {
      for (const name of names) {
        const i = hdrs.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
        if (i >= 0) return i;
      }
      return -1;
    };

    const colName = idx("tên", "họ tên", "name");
    const colPhone = idx("sđt", "phone", "zalo", "điện thoại");
    const colEmail = idx("email");
    const colFb = idx("fb", "facebook", "link");
    const colCompany = idx("công ty", "company", "trường", "trung tâm");
    const colSource = idx("nguồn", "source");
    const colProduct = idx("sản phẩm", "product", "khóa", "gói");
    const colStatus = idx("trạng thái", "giai đoạn", "stage", "status");
    const colStaff = idx("sale", "nhân viên", "phụ trách");
    const colReceived = idx("ngày nhận", "ngày tạo", "received", "created");
    const colListPrice = idx("niêm yết", "list price");
    const colDiscount = idx("giảm", "discount");
    const colFinalPrice = idx("giá chốt", "chốt", "thanh toán", "doanh thu");
    const colNote = idx("ghi chú", "note");

    if (colName < 0) { setError('Không tìm thấy cột "Tên KH". Kiểm tra lại file.'); return; }

    const importRows: ImportRow[] = [];
    for (let i = 1; i < sheetRows.length; i++) {
      const r = sheetRows[i].map(v => String(v ?? "").trim());
      const name = colName >= 0 ? r[colName] : "";
      if (!name?.trim()) continue;

      let productName = colProduct >= 0 ? r[colProduct]?.trim() : "";
      if (productName?.toLowerCase() === "pre90") {
        productName = "990TOEIC";
      }
      const product = products.find(p => p.name.toLowerCase() === productName?.toLowerCase());
      const rawStatus = colStatus >= 0 ? r[colStatus]?.trim() : "";
      const status = STATUS_MAP[rawStatus.toLowerCase()] ?? (rawStatus || "new");
      const group_id = rawStatus ? statusToGroupId(rawStatus, groups) : null;

      importRows.push({
        name: name.trim(),
        phone: colPhone >= 0 ? r[colPhone]?.trim() || undefined : undefined,
        email: colEmail >= 0 ? r[colEmail]?.trim() || undefined : undefined,
        facebook_link: colFb >= 0 ? r[colFb]?.trim() || undefined : undefined,
        company: colCompany >= 0 ? r[colCompany]?.trim() || undefined : undefined,
        source: colSource >= 0 ? r[colSource]?.trim() || undefined : undefined,
        product_id: product?.id ?? undefined,
        product_name: productName || undefined,
        group_id,
        group_name: rawStatus || undefined,
        assigned_to: colStaff >= 0 ? r[colStaff]?.trim() || undefined : undefined,
        status,
        received_at: colReceived >= 0 ? r[colReceived]?.trim() || undefined : undefined,
        list_price: colListPrice >= 0 ? r[colListPrice]?.trim() || undefined : undefined,
        discount_pct: colDiscount >= 0 ? r[colDiscount]?.trim() || undefined : undefined,
        final_price: colFinalPrice >= 0 ? r[colFinalPrice]?.trim() || undefined : undefined,
        note: colNote >= 0 ? r[colNote]?.trim() || undefined : undefined,
      });
    }
    setRows(importRows);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult(null);
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const reader = new FileReader();

    reader.onload = ev => {
      try {
        const importRows: ImportRow[] = [];

        if (isExcel) {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const parsedSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            if (parsedSheet.length < 2) continue;

            const hdrs = parsedSheet[0].map(h => String(h || "").trim());
            const idx = (names: string[]) => {
              return hdrs.findIndex(h => {
                const lowerH = h.toLowerCase().trim();
                return names.some(name => lowerH.includes(name) || name.includes(lowerH));
              });
            };

            const colCreatedAt = idx(["nhận", "ngày nhận", "ngay nhan", "created"]);
            const colName = idx(["tên", "ten", "khách hàng", "khach hang", "name"]);
            const colPhone = idx(["sđt", "phone", "zalo", "điện thoại", "dien thoai"]);
            const colEmail = idx(["email", "mail"]);
            const colFb = idx(["fb", "facebook", "link fb"]);
            const colSource = idx(["nguồn", "nguon", "source"]);
            const colProduct = idx(["sản phẩm", "san pham", "product"]);
            const colStatus = idx(["trạng thái", "trang thai", "status"]);
            const colStaff = idx(["sale", "nhân viên", "nhan vien", "staff"]);
            const colListPrice = idx(["niêm yết", "list price"]);
            const colDiscount = idx(["giảm", "discount"]);
            const colFinalPrice = idx(["giá chốt", "gia chot", "chốt", "chot"]);
            const colNote = idx(["ghi chú", "ghi chu", "note"]);
            const colUpdatedAt = idx(["ngày chốt", "ngay chot", "chốt ngày", "chot ngay"]);

            const lowerSheet = sheetName.toLowerCase();
            const isLmsSheet = lowerSheet.includes("lms");
            const is990Sheet = lowerSheet.includes("990");

            for (let i = 1; i < parsedSheet.length; i++) {
              const r = parsedSheet[i];
              if (!r) continue;
              const name = colName >= 0 ? String(r[colName] || "") : "";
              if (!name?.trim()) continue;

              // Map product name → id
              let productName = colProduct >= 0 ? String(r[colProduct] || "").trim() : "";
              if (productName.toLowerCase() === "pre90") {
                productName = "990TOEIC";
              }
              if (!productName) {
                if (isLmsSheet) productName = "Hệ thống LMS";
                else if (is990Sheet) productName = "990TOEIC";
              }
              const product = products.find(p =>
                p.name.toLowerCase() === productName?.toLowerCase()
              );

              // Map status
              const rawStatus = colStatus >= 0 ? String(r[colStatus] || "").trim().toLowerCase() : "";
              const status = STATUS_MAP[rawStatus] ?? "new";

              // Map source
              let source = colSource >= 0 ? String(r[colSource] || "").trim() : "";
              if (source.toLowerCase() === "phone feature") {
                source = "990toeic App";
              }
              if (!source) {
                if (isLmsSheet) source = ""; // LMS nguồn để trống
                else if (is990Sheet) source = "990toeic App";
              }

              const lp = colListPrice >= 0 ? parseFloat(String(r[colListPrice] || "").replace(/[^0-9.]/g, "")) : NaN;
              const dp = colDiscount >= 0 ? parseFloat(String(r[colDiscount] || "").replace(/[^0-9.]/g, "")) : NaN;
              const fp = colFinalPrice >= 0 ? parseFloat(String(r[colFinalPrice] || "").replace(/[^0-9.]/g, "")) : NaN;

              const createdAtVal = colCreatedAt >= 0 ? String(r[colCreatedAt] || "") : "";
              const updatedAtVal = colUpdatedAt >= 0 ? String(r[colUpdatedAt] || "") : "";

              importRows.push({
                name: name.trim(),
                phone: colPhone >= 0 ? String(r[colPhone] || "").trim() || undefined : undefined,
                email: colEmail >= 0 ? String(r[colEmail] || "").trim() || undefined : undefined,
                facebook_link: colFb >= 0 ? String(r[colFb] || "").trim() || undefined : undefined,
                source: source || undefined,
                product_id: product?.id ?? undefined,
                assigned_to: colStaff >= 0 ? String(r[colStaff] || "").trim() || undefined : undefined,
                status,
                list_price: !isNaN(lp) ? lp : undefined,
                discount_pct: !isNaN(dp) ? dp : undefined,
                final_price: !isNaN(fp) ? fp : undefined,
                note: colNote >= 0 ? String(r[colNote] || "").trim() || undefined : undefined,
                created_at: parseExcelDate(createdAtVal) || new Date().toISOString().replace("T", " ").slice(0, 19),
                updated_at: parseExcelDate(updatedAtVal) || new Date().toISOString().replace("T", " ").slice(0, 19),
              });
            }
          }
        } else {
          // File CSV
          const text = ev.target?.result as string;
          const parsedSheet = parseCSV(text);
          if (parsedSheet.length >= 2) {
            const hdrs = parsedSheet[0].map(h => String(h || "").trim());
            const idx = (names: string[]) => {
              return hdrs.findIndex(h => {
                const lowerH = h.toLowerCase().trim();
                return names.some(name => lowerH.includes(name) || name.includes(lowerH));
              });
            };

            const colCreatedAt = idx(["nhận", "ngày nhận", "ngay nhan", "created"]);
            const colName = idx(["tên", "ten", "khách hàng", "khach hang", "name"]);
            const colPhone = idx(["sđt", "phone", "zalo", "điện thoại", "dien thoai"]);
            const colEmail = idx(["email", "mail"]);
            const colFb = idx(["fb", "facebook", "link fb"]);
            const colSource = idx(["nguồn", "nguon", "source"]);
            const colProduct = idx(["sản phẩm", "san pham", "product"]);
            const colStatus = idx(["trạng thái", "trang thai", "status"]);
            const colStaff = idx(["sale", "nhân viên", "nhan vien", "staff"]);
            const colListPrice = idx(["niêm yết", "list price"]);
            const colDiscount = idx(["giảm", "discount"]);
            const colFinalPrice = idx(["giá chốt", "gia chot", "chốt", "chot"]);
            const colNote = idx(["ghi chú", "ghi chu", "note"]);
            const colUpdatedAt = idx(["ngày chốt", "ngay chot", "chốt ngày", "chot ngay"]);

            for (let i = 1; i < parsedSheet.length; i++) {
              const r = parsedSheet[i];
              const name = colName >= 0 ? String(r[colName] || "") : "";
              if (!name?.trim()) continue;

              const productName = colProduct >= 0 ? String(r[colProduct] || "").trim() : "";
              const product = products.find(p =>
                p.name.toLowerCase() === productName?.toLowerCase()
              );

              const rawStatus = colStatus >= 0 ? String(r[colStatus] || "").trim().toLowerCase() : "";
              const status = STATUS_MAP[rawStatus] ?? "new";

              let source = colSource >= 0 ? String(r[colSource] || "").trim() : "";
              if (source.toLowerCase() === "phone feature") {
                source = "990toeic App";
              }

              const lp = colListPrice >= 0 ? parseFloat(String(r[colListPrice] || "").replace(/[^0-9.]/g, "")) : NaN;
              const dp = colDiscount >= 0 ? parseFloat(String(r[colDiscount] || "").replace(/[^0-9.]/g, "")) : NaN;
              const fp = colFinalPrice >= 0 ? parseFloat(String(r[colFinalPrice] || "").replace(/[^0-9.]/g, "")) : NaN;

              const createdAtVal = colCreatedAt >= 0 ? String(r[colCreatedAt] || "") : "";
              const updatedAtVal = colUpdatedAt >= 0 ? String(r[colUpdatedAt] || "") : "";

              importRows.push({
                name: name.trim(),
                phone: colPhone >= 0 ? String(r[colPhone] || "").trim() || undefined : undefined,
                email: colEmail >= 0 ? String(r[colEmail] || "").trim() || undefined : undefined,
                facebook_link: colFb >= 0 ? String(r[colFb] || "").trim() || undefined : undefined,
                source: source || undefined,
                product_id: product?.id ?? undefined,
                assigned_to: colStaff >= 0 ? String(r[colStaff] || "").trim() || undefined : undefined,
                status,
                list_price: !isNaN(lp) ? lp : undefined,
                discount_pct: !isNaN(dp) ? dp : undefined,
                final_price: !isNaN(fp) ? fp : undefined,
                note: colNote >= 0 ? String(r[colNote] || "").trim() || undefined : undefined,
                created_at: parseExcelDate(createdAtVal) || new Date().toISOString().replace("T", " ").slice(0, 19),
                updated_at: parseExcelDate(updatedAtVal) || new Date().toISOString().replace("T", " ").slice(0, 19),
              });
            }
          }
        }

        if (importRows.length === 0) {
          setError("Không tìm thấy dòng dữ liệu hợp lệ (thiếu cột Tên KH).");
          return;
        }
        setRows(importRows);
      } catch (err) {
        setError(isExcel ? "Không đọc được file Excel." : "Không đọc được file CSV. Hãy lưu dạng CSV (UTF-8).");
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, "UTF-8");
    }
  }

  async function handleImport() {
    setLoading(true);
    try {
      const res = await api.importCustomers(rows);
      setResult(res);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold">Import từ Excel / CSV</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: Download template */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-medium text-blue-900 mb-1">Bước 1 — Tải file mẫu</p>
            <p className="text-xs text-blue-700 mb-3">
              Điền dữ liệu vào file mẫu rồi upload lại file Excel.
              <br />Cột "Sản phẩm" có thể ghi 990TOEIC, LMS/web lms, TOEIC LR, hoặc TOEIC 4 kỹ năng.
              <br />Trùng SĐT/email sẽ được cập nhật, không tạo lead trùng.
              <br />Cột "Trạng thái": Mới / Đang liên hệ / Tiềm năng / Dùng thử / Đã chốt / Không phù hợp
            </p>
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
              <Download size={16} /> Tải file mẫu (.xlsx)
            </button>
          </div>

          {/* Step 2: Upload */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Bước 2 — Upload file Excel hoặc CSV</p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
              <Upload size={24} className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">Click để chọn file, hoặc kéo thả vào đây</span>
              <span className="text-xs text-gray-400 mt-1">Hỗ trợ file .xlsx, .xls, .csv</span>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Bước 3 — Kiểm tra trước khi import
                <span className="ml-2 text-blue-600 font-semibold">{rows.length} dòng</span>
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {["Tên KH", "SĐT", "Sản phẩm", "Trạng thái", "Sale", "Giá chốt"].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2 text-gray-500">{r.phone ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {r.product_id
                              ? products.find(p => p.id === r.product_id)?.name
                              : r.product_name ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-gray-600">
                              {STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{r.assigned_to ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {r.final_price ? r.final_price.toLocaleString("vi-VN") + "đ" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 8 && (
                  <div className="px-3 py-2 bg-gray-50 text-xs text-gray-400 border-t border-gray-100">
                    ... và {rows.length - 8} dòng nữa
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-800 font-medium">
                <CheckCircle size={18} />
                Import hoàn tất:
                <span className="font-bold">{result.imported}</span> mới
                <span className="font-bold">{result.updated}</span> cập nhật
                {result.skipped > 0 && <><span className="font-bold">{result.skipped}</span> bỏ qua</>}
              </div>
              {result.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-amber-700 font-medium">{result.warnings.length} cảnh báo map dữ liệu:</p>
                  {result.warnings.slice(0, 5).map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">• {w}</p>
                  ))}
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-red-700 font-medium">{result.errors.length} dòng bị lỗi:</p>
                  {result.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-red-600">• {e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            {result ? "Đóng" : "Hủy"}
          </button>
          {rows.length > 0 && !result && (
            <button onClick={handleImport} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <Upload size={16} />
              {loading ? "Đang import..." : `Import ${rows.length} khách hàng`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
