import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, X, ChevronDown, ChevronUp,
  Phone, Mail, Globe, Users, CalendarDays, Receipt,
  CheckCircle2, AlertTriangle, PauseCircle, PlayCircle, RefreshCw,
} from "lucide-react";
import { api } from "../lib/api";
import type { LmsClient, LmsInvoice } from "../lib/types";

function fmtMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("vi-VN") + "đ";
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("vi-VN");
}
function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// ── Status badge ──────────────────────────────────────────
function StatusBadge({ client }: { client: LmsClient }) {
  if (client.status === "suspended") {
    return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium"><PauseCircle size={10} /> Tạm dừng</span>;
  }
  const days = daysUntil(client.contract_end);
  if (days < 0) return (
    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
      <AlertTriangle size={10} /> Hết hạn {Math.abs(days)} ngày trước
    </span>
  );
  if (days <= 30) return (
    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
      <AlertTriangle size={10} /> Còn {days} ngày
    </span>
  );
  return (
    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Còn {days} ngày</span>
  );
}

// ── Invoice panel ─────────────────────────────────────────
function InvoicePanel({ client }: { client: LmsClient }) {
  const qc = useQueryClient();
  const { data: invoices = [] } = useQuery({
    queryKey: ["lms-invoices", client.id],
    queryFn: () => api.getLmsInvoices(client.id),
  });
  const [adding, setAdding] = useState(false);
  const emptyInv = { amount: "", issued_at: new Date().toISOString().slice(0, 10), note: "" };
  const [form, setForm] = useState(emptyInv);

  const createMut = useMutation({
    mutationFn: (d: Partial<LmsInvoice>) => api.createLmsInvoice(client.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lms-invoices", client.id] }); setAdding(false); setForm(emptyInv); },
  });
  const payMut = useMutation({
    mutationFn: (id: number) => api.markLmsInvoicePaid(client.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-invoices", client.id] }),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.deleteLmsInvoice(client.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-invoices", client.id] }),
  });

  const totalPaid = invoices.filter(i => i.paid_at).reduce((s, i) => s + i.amount, 0);
  const totalUnpaid = invoices.filter(i => !i.paid_at).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-gray-700">Hóa đơn ({invoices.length})</span>
          {totalPaid > 0 && <span className="text-green-600 text-xs">Đã thu: {fmtMoney(totalPaid)}</span>}
          {totalUnpaid > 0 && <span className="text-amber-600 text-xs font-medium">Còn nợ: {fmtMoney(totalUnpaid)}</span>}
        </div>
        <button onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
          <Plus size={13} /> Thêm hóa đơn
        </button>
      </div>

      {adding && (
        <form onSubmit={e => { e.preventDefault(); createMut.mutate({ amount: Number(form.amount), issued_at: form.issued_at, note: form.note || null }); }}
          className="flex gap-2 mb-3 p-3 bg-blue-50 rounded-lg flex-wrap">
          <input required type="number" placeholder="Số tiền *" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-36" />
          <input type="date" value={form.issued_at}
            onChange={e => setForm(f => ({ ...f, issued_at: e.target.value }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="Ghi chú" value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-24" />
          <button type="submit" disabled={createMut.isPending}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">Lưu</button>
          <button type="button" onClick={() => setAdding(false)}
            className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Hủy</button>
        </form>
      )}

      {invoices.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Chưa có hóa đơn nào.</p>
      ) : (
        <div className="space-y-1.5">
          {invoices.map(inv => (
            <div key={inv.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg group hover:bg-gray-50">
              {inv.paid_at
                ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                : <Receipt size={14} className="text-amber-500 flex-shrink-0" />}
              <span className="font-semibold text-sm text-gray-800 w-28 flex-shrink-0">{fmtMoney(inv.amount)}</span>
              <span className="text-xs text-gray-400 flex-1 truncate">
                {fmtDate(inv.issued_at)}{inv.note ? ` · ${inv.note}` : ""}
                {inv.paid_at ? <span className="text-green-600 ml-1">· Đã thu {fmtDate(inv.paid_at)}</span> : ""}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                {!inv.paid_at && (
                  <button onClick={() => payMut.mutate(inv.id)}
                    className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">Thu tiền</button>
                )}
                <button onClick={() => delMut.mutate(inv.id)}
                  className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client card ───────────────────────────────────────────
function ClientCard({ client, onEdit, onDelete }: {
  client: LmsClient;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [reprovMsg, setReprovMsg] = useState("");

  const statusMut = useMutation({
    mutationFn: (status: string) => api.setLmsClientStatus(client.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-clients"] }),
  });
  const reprovMut = useMutation({
    mutationFn: () => api.reprovisionLmsClient(client.id),
    onSuccess: (r) => { setReprovMsg(`✓ KV key: ${r.kv_key}`); setTimeout(() => setReprovMsg(""), 3000); },
  });

  const isSuspended = client.status === "suspended";
  const days = daysUntil(client.contract_end);
  const borderColor = isSuspended ? "border-gray-300" : days < 0 ? "border-red-200" : days <= 30 ? "border-amber-300" : "border-gray-200";

  return (
    <div className={`bg-white rounded-xl border ${borderColor}`}>
      <div className="p-4 flex items-start gap-3">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${isSuspended ? "bg-gray-400" : days < 0 ? "bg-red-400" : days <= 30 ? "bg-amber-400" : "bg-green-400"}`} />

        <div className="flex-1 min-w-0">
          {/* Name + status + domain */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-base">{client.name}</span>
            <StatusBadge client={client} />
          </div>

          {/* Domain — nổi bật */}
          <div className="mt-1 mb-2">
            <a href={`https://${client.domain}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-mono text-blue-600 hover:text-blue-700 hover:underline bg-blue-50 px-2 py-0.5 rounded-md">
              <Globe size={12} /> {client.domain}
            </a>
          </div>

          {/* Details row */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            {client.phone && <span className="flex items-center gap-1"><Phone size={11} />{client.phone}</span>}
            {client.email && <span className="flex items-center gap-1"><Mail size={11} />{client.email}</span>}
            <span className="flex items-center gap-1">
              <CalendarDays size={11} /> {fmtDate(client.contract_start)} → {fmtDate(client.contract_end)}
            </span>
            <span className="flex items-center gap-1"><Users size={11} /> {client.user_count} users</span>
            {client.price && <span className="font-medium text-gray-700">{fmtMoney(client.price)}</span>}
          </div>
          {client.note && <p className="text-xs text-gray-400 mt-1">{client.note}</p>}
          {reprovMsg && <p className="text-xs text-green-600 mt-1 font-medium">{reprovMsg}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
          {/* Suspend / Reactivate */}
          {isSuspended ? (
            <button onClick={() => statusMut.mutate("active")} disabled={statusMut.isPending}
              title="Kích hoạt lại"
              className="flex items-center gap-1 text-xs px-2 py-1 text-green-700 border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50">
              <PlayCircle size={13} /> Kích hoạt
            </button>
          ) : (
            <button onClick={() => statusMut.mutate("suspended")} disabled={statusMut.isPending}
              title="Tạm dừng"
              className="flex items-center gap-1 text-xs px-2 py-1 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <PauseCircle size={13} /> Tạm dừng
            </button>
          )}
          <button onClick={() => reprovMut.mutate()} disabled={reprovMut.isPending}
            title="Sync lại KV"
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
            <RefreshCw size={14} className={reprovMut.isPending ? "animate-spin" : ""} />
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
            <Trash2 size={14} />
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4">
          <InvoicePanel client={client} />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────
type ClientForm = {
  name: string; phone: string; email: string; domain: string;
  contract_start: string; contract_end: string;
  user_count: string; price: string; note: string;
};
const emptyForm: ClientForm = {
  name: "", phone: "", email: "", domain: "",
  contract_start: new Date().toISOString().slice(0, 10),
  contract_end: "", user_count: "1", price: "", note: "",
};

export default function LmsClients() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; client?: LmsClient }>({ open: false });
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["lms-clients"],
    queryFn: () => api.getLmsClients(),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<LmsClient>) => api.createLmsClient(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lms-clients"] }); closeModal(); },
    onError: (e: Error) => setFormError(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<LmsClient> }) => api.updateLmsClient(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lms-clients"] }); closeModal(); },
    onError: (e: Error) => setFormError(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteLmsClient(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lms-clients"] }); setDeleteConfirm(null); },
  });

  function openAdd() { setForm(emptyForm); setFormError(""); setModal({ open: true }); }
  function openEdit(c: LmsClient) {
    setForm({
      name: c.name, phone: c.phone ?? "", email: c.email ?? "", domain: c.domain,
      contract_start: c.contract_start, contract_end: c.contract_end,
      user_count: String(c.user_count), price: c.price ? String(c.price) : "", note: c.note ?? "",
    });
    setFormError(""); setModal({ open: true, client: c });
  }
  function closeModal() { setModal({ open: false }); setFormError(""); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const payload: Partial<LmsClient> = {
      name: form.name.trim(), phone: form.phone || null, email: form.email || null,
      domain: form.domain.trim(), contract_start: form.contract_start, contract_end: form.contract_end,
      user_count: Number(form.user_count) || 1, price: form.price ? Number(form.price) : null,
      note: form.note || null,
    };
    if (modal.client) updateMut.mutate({ id: modal.client.id, d: payload });
    else createMut.mutate(payload);
  }

  const isPending = createMut.isPending || updateMut.isPending;

  // Sort: sắp hết hạn lên đầu, đã hết ở sau
  const sorted = [...clients].sort((a, b) => daysUntil(a.contract_end) - daysUntil(b.contract_end));
  const activeCount = clients.filter(c => c.status === "active" && daysUntil(c.contract_end) > 0).length;
  const expiringSoon = clients.filter(c => c.status === "active" && daysUntil(c.contract_end) <= 30 && daysUntil(c.contract_end) > 0).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">LMS Clients</h2>
          <div className="flex gap-3 mt-1 text-sm text-gray-500">
            <span>{activeCount} đang active</span>
            {expiringSoon > 0 && (
              <span className="text-amber-600 font-medium">· {expiringSoon} sắp hết hạn</span>
            )}
          </div>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={17} /> Thêm khách LMS
        </button>
      </div>

      {/* KV info box */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 text-xs text-gray-500">
        <span className="font-mono font-medium text-gray-700">KV key format:</span>
        {" "}<span className="font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded">tenant:{"{domain}"}</span>
        {" "}→ LMS Worker đọc key này để route đúng tenant. Mỗi lần tạo/update/suspend đều tự sync.
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Đang tải...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-base font-medium mb-1">Chưa có khách LMS nào</p>
          <p className="text-sm">Thêm khách đã ký hợp đồng — hệ thống sẽ tự provision domain vào KV.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onEdit={() => openEdit(client)}
              onDelete={() => setDeleteConfirm(client.id)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">{modal.client ? "Sửa khách LMS" : "Thêm khách LMS mới"}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nguyễn Văn A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domain * {!modal.client && <span className="text-gray-400 font-normal text-xs">(không thể đổi sau khi tạo)</span>}
                </label>
                <input required value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                  disabled={!!modal.client}
                  placeholder="abc.lms.vnmentors.com hoặc hoc.example.com"
                  className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${modal.client ? "bg-gray-50 text-gray-500" : ""}`} />
                <p className="text-xs text-gray-400 mt-1">Không cần https:// — hệ thống tự xử lý.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SĐT</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bắt đầu *</label>
                  <input required type="date" value={form.contract_start}
                    onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hết hạn *</label>
                  <input required type="date" value={form.contract_end}
                    onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số users *</label>
                  <input required type="number" min="1" value={form.user_count}
                    onChange={e => setForm(f => ({ ...f, user_count: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá hợp đồng (VNĐ)</label>
                  <input type="number" min="0" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              {!modal.client && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                  Sau khi tạo, hệ thống tự ghi KV key <span className="font-mono">tenant:{form.domain || "{domain}"}</span> để LMS Worker nhận diện tenant này.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button type="submit" disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {isPending ? "Đang lưu..." : modal.client ? "Cập nhật" : "Tạo & Provision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2">Xóa khách LMS này?</h3>
            <p className="text-gray-500 text-sm mb-1">Domain sẽ bị xóa khỏi KV — LMS của họ ngừng hoạt động ngay.</p>
            <p className="text-gray-500 text-sm mb-6">Hóa đơn liên quan cũng bị xóa.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
              <button onClick={() => deleteMut.mutate(deleteConfirm)} disabled={deleteMut.isPending}
                className="flex-1 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? "Đang xóa..." : "Xóa & Thu hồi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
