import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, Download, CheckCircle, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import type { Product } from "../lib/types";
import { STATUS_LABELS } from "./StatusBadge";

// ── Mapping trạng thái từ tiếng Việt thường gặp → code
const STATUS_MAP: Record<string, string> = {
  "mới": "new",
  "đang liên hệ": "contacting",
  "liên hệ": "contacting",
  "tiềm năng": "potential",
  "dùng thử": "trial",
  "thử": "trial",
  "đã chốt": "closed",
  "chốt": "closed",
  "không phù hợp": "lost",
  "mất": "lost",
  "new": "new",
  "contacting": "contacting",
  "potential": "potential",
  "trial": "trial",
  "closed": "closed",
  "lost": "lost",
};

// ── Cột template cố định (theo thứ tự)
const TEMPLATE_HEADERS = [
  "Tên KH", "SĐT/Zalo", "Email", "Link FB",
  "Nguồn", "Sản phẩm", "Trạng thái", "Sale phụ trách",
  "Giá niêm yết", "Giảm giá (%)", "Giá chốt", "Ghi chú",
];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if ((ch === "," || ch === "\t") && !inQ) { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    rows.push(fields);
  }
  return rows;
}

function downloadTemplate() {
  const bom = "﻿"; // UTF-8 BOM cho Excel đọc được tiếng Việt
  const header = TEMPLATE_HEADERS.join(",");
  const example = [
    "Nguyễn Văn A", "0912345678", "email@gmail.com", "https://fb.com/...",
    "Facebook", "Pre90", "Mới", "Mai Phương",
    "590000", "30", "413000", "Khách quan tâm nhiều",
  ].join(",");
  const csv = bom + header + "\n" + example;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "template_import_crm.csv"; a.click();
  URL.revokeObjectURL(url);
}

type ImportRow = {
  name: string; phone?: string; email?: string; facebook_link?: string;
  source?: string; product_id?: number; assigned_to?: string;
  status?: string; list_price?: number; discount_pct?: number;
  final_price?: number; note?: string;
};

type Props = { onClose: () => void; products: Product[] };

export default function ImportModal({ onClose, products }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [error, setError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length < 2) { setError("File không có dữ liệu."); return; }

        // Dòng đầu là header
        const hdrs = parsed[0];

        // Tìm chỉ số cột theo header
        const idx = (name: string) => {
          const i = hdrs.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
          return i >= 0 ? i : -1;
        };

        const colName = idx("tên");
        const colPhone = idx("sđt");
        const colEmail = idx("email");
        const colFb = idx("fb") >= 0 ? idx("fb") : idx("link");
        const colSource = idx("nguồn");
        const colProduct = idx("sản phẩm");
        const colStatus = idx("trạng thái");
        const colStaff = idx("sale");
        const colListPrice = idx("niêm yết");
        const colDiscount = idx("giảm");
        const colFinalPrice = idx("chốt") >= 0 && idx("chốt") !== colStatus ? idx("chốt") : idx("giá chốt");
        const colNote = idx("ghi chú");

        if (colName < 0) { setError('Không tìm thấy cột "Tên KH". Kiểm tra lại file.'); return; }

        const importRows: ImportRow[] = [];
        for (let i = 1; i < parsed.length; i++) {
          const r = parsed[i];
          const name = colName >= 0 ? r[colName] : "";
          if (!name?.trim()) continue;

          // Map product name → id
          const productName = colProduct >= 0 ? r[colProduct]?.trim() : "";
          const product = products.find(p =>
            p.name.toLowerCase() === productName?.toLowerCase()
          );

          // Map status
          const rawStatus = colStatus >= 0 ? r[colStatus]?.trim().toLowerCase() : "";
          const status = STATUS_MAP[rawStatus] ?? "new";

          const lp = colListPrice >= 0 ? parseFloat(r[colListPrice]?.replace(/[^0-9.]/g, "")) : NaN;
          const dp = colDiscount >= 0 ? parseFloat(r[colDiscount]?.replace(/[^0-9.]/g, "")) : NaN;
          const fp = colFinalPrice >= 0 ? parseFloat(r[colFinalPrice]?.replace(/[^0-9.]/g, "")) : NaN;

          importRows.push({
            name: name.trim(),
            phone: colPhone >= 0 ? r[colPhone]?.trim() || undefined : undefined,
            email: colEmail >= 0 ? r[colEmail]?.trim() || undefined : undefined,
            facebook_link: colFb >= 0 ? r[colFb]?.trim() || undefined : undefined,
            source: colSource >= 0 ? r[colSource]?.trim() || undefined : undefined,
            product_id: product?.id ?? undefined,
            assigned_to: colStaff >= 0 ? r[colStaff]?.trim() || undefined : undefined,
            status,
            list_price: !isNaN(lp) ? lp : undefined,
            discount_pct: !isNaN(dp) ? dp : undefined,
            final_price: !isNaN(fp) ? fp : undefined,
            note: colNote >= 0 ? r[colNote]?.trim() || undefined : undefined,
          });
        }
        setRows(importRows);
      } catch {
        setError("Không đọc được file. Hãy lưu dạng CSV (UTF-8).");
      }
    };
    reader.readAsText(file, "UTF-8");
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
              Điền dữ liệu vào file mẫu, sau đó lưu dạng <strong>CSV (UTF-8)</strong> rồi upload lên.
              <br />Cột "Sản phẩm" cần khớp đúng tên sản phẩm trong hệ thống.
              <br />Cột "Trạng thái": Mới / Đang liên hệ / Tiềm năng / Dùng thử / Đã chốt / Không phù hợp
            </p>
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
              <Download size={16} /> Tải file mẫu (.csv)
            </button>
          </div>

          {/* Step 2: Upload */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Bước 2 — Upload file CSV</p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
              <Upload size={24} className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">Click để chọn file, hoặc kéo thả vào đây</span>
              <span className="text-xs text-gray-400 mt-1">.csv · Excel cần lưu dạng "CSV UTF-8"</span>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
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
                              : "—"}
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
                Import hoàn tất: <span className="font-bold">{result.imported}</span> khách hàng
              </div>
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
