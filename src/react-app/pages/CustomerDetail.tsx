import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, Trash2, Phone, Mail, ExternalLink,
  Tag, User, Package, X, Check, Bell, BellOff, BadgeDollarSign, MonitorPlay,
} from "lucide-react";
import { api } from "../lib/api";
import type { Customer, Product } from "../lib/types";
import { GroupBadge } from "../components/GroupBadge";
import EmailComposeModal from "../components/EmailComposeModal";

function fmtMoney(v: number | null | undefined) {
  if (v == null) return null;
  return v.toLocaleString("vi-VN") + "đ";
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("vi-VN");
}

// ── Follow-up ─────────────────────────────────────────────
function FollowUpCard({ customer }: { customer: Customer }) {
  const [date, setDate] = useState(customer.follow_up_at?.slice(0, 10) ?? "");
  const [note, setNote] = useState(customer.follow_up_note ?? "");
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();

  async function save() {
    await api.updateCustomer(customer.id, {
      follow_up_at: date || null, follow_up_note: note || null,
    } as Partial<Customer>);
    qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  async function clear() {
    setDate(""); setNote("");
    await api.updateCustomer(customer.id, { follow_up_at: null, follow_up_note: null } as Partial<Customer>);
    qc.invalidateQueries({ queryKey: ["customer", customer.id] });
  }
  const isOverdue = date && new Date(date) < new Date(new Date().toDateString());

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-2 ${customer.follow_up_at ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
          <Bell size={14} className={customer.follow_up_at ? "text-amber-500" : "text-gray-400"} />
          Nhắc follow-up
        </h3>
        {customer.follow_up_at && (
          <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
            <BellOff size={12} /> Xóa
          </button>
        )}
      </div>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isOverdue ? "border-red-300 bg-red-50" : "border-gray-300"}`} />
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder="Gọi lại, hỏi thêm..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={save}
        className={`w-full py-1.5 rounded-lg text-sm font-medium transition-colors ${saved ? "bg-green-100 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
        {saved ? "✓ Đã lưu" : "Đặt nhắc nhở"}
      </button>
      {isOverdue && <p className="text-xs text-red-600 font-medium">⚠️ Đã quá hạn!</p>}
    </div>
  );
}

const NOTE_TYPES = [
  { value: "note",    label: "Ghi chú",  icon: "📝" },
  { value: "call",    label: "Cuộc gọi", icon: "📞" },
  { value: "email",   label: "Email",    icon: "✉️" },
  { value: "meeting", label: "Gặp mặt", icon: "🤝" },
];

// ── Main ──────────────────────────────────────────────────
export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customerId = Number(id);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("note");

  // LMS convert modal
  const [lmsModal, setLmsModal] = useState(false);
  const [lmsForm, setLmsForm] = useState({
    domain: "", contract_start: new Date().toISOString().slice(0, 10),
    contract_end: "", user_count: "1", price: "", note: "",
  });
  const [lmsSuccess, setLmsSuccess] = useState(false);
  const [lmsError, setLmsError] = useState("");
  const [emailModal, setEmailModal] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => api.getCustomer(customerId),
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", customerId],
    queryFn: () => api.getNotes(customerId),
    enabled: !!customerId,
  });
  const STATIC = { staleTime: 1000 * 60 * 10 };
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.getProducts(), ...STATIC });
  const { data: groups   = [] } = useQuery({ queryKey: ["groups"],   queryFn: () => api.getGroups(),   ...STATIC });

  const updateMut = useMutation({
    mutationFn: (data: Partial<Customer>) => api.updateCustomer(customerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setEditing(false);
    },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteCustomer(customerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); navigate("/customers"); },
  });
  const addNoteMut = useMutation({
    mutationFn: ({ content, type }: { content: string; type: string }) =>
      api.createNote(customerId, content, type),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes", customerId] }); setNoteContent(""); },
  });
  const deleteNoteMut = useMutation({
    mutationFn: (noteId: number) => api.deleteNote(customerId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", customerId] }),
  });
  const createLmsMut = useMutation({
    mutationFn: () => {
      if (!customer) throw new Error("Customer not loaded");
      return api.createLmsClient({
        name: customer?.name ?? "",
        phone: customer?.phone ?? null,
        email: customer?.email ?? null,
        domain: lmsForm.domain,
        contract_start: lmsForm.contract_start,
        contract_end: lmsForm.contract_end,
        user_count: Number(lmsForm.user_count) || 1,
        price: lmsForm.price ? Number(lmsForm.price) : null,
        note: lmsForm.note || null,
        source_customer_id: customer.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-clients"] });
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setLmsSuccess(true);
      setLmsError("");
    },
    onError: (e: Error) => setLmsError(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Đang tải...</div>;
  if (!customer) return (
    <div className="p-8 text-center">
      <p className="text-gray-400">Không tìm thấy</p>
      <Link to="/customers" className="text-blue-600 text-sm mt-2 inline-block hover:underline">← Quay lại</Link>
    </div>
  );

  function startEdit() {
    setEditForm({
      name: customer!.name, phone: customer!.phone, email: customer!.email,
      facebook_link: customer!.facebook_link, company: customer!.company,
      source: customer!.source, assigned_to: customer!.assigned_to,
      product_id: customer!.product_id, group_id: customer!.group_id,
      list_price: customer!.list_price, discount_pct: customer!.discount_pct,
      final_price: customer!.final_price,
    });
    setEditing(true);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const lp = editForm.list_price;
    const dp = editForm.discount_pct ?? 0;
    const fp = editForm.final_price ?? (lp != null ? Math.round(lp * (1 - dp / 100)) : null);
    updateMut.mutate({ ...editForm, final_price: fp });
  }

  function handleGroupChange(groupId: number | null) {
    api.updateCustomer(customerId, { group_id: groupId }).then(() => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    });
  }

  function openLmsModal() {
    setLmsForm({
      domain: "", contract_start: new Date().toISOString().slice(0, 10),
      contract_end: "", user_count: "1",
      price: customer?.final_price ? String(customer.final_price) : "", note: "",
    });
    setLmsSuccess(false);
    setLmsError("");
    setLmsModal(true);
  }

  const isWon = customer.group_is_won === 1;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{customer.name}</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {customer.product_name ?? "Chưa chọn sản phẩm"}
              {customer.assigned_to ? ` · Sale: ${customer.assigned_to}` : ""}
            </p>
          </div>
          <GroupBadge customer={customer} />
        </div>
        <div className="flex gap-2">
          <button onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <Pencil size={15} /> Chỉnh sửa
          </button>
          <button onClick={() => { if (window.confirm(`Xóa "${customer.name}"?`)) deleteMut.mutate(); }}
            disabled={deleteMut.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={15} /> Xóa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── Left sidebar ── */}
        <div className="space-y-4">
          {editing ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Chỉnh sửa</h3>
              <form onSubmit={handleUpdate} className="space-y-3">
                {(["name", "phone", "email", "facebook_link", "company", "assigned_to", "source"] as const).map(key => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {{ name: "Tên *", phone: "SĐT / Zalo", email: "Email", facebook_link: "Link Facebook", company: "Công ty / Tổ chức", assigned_to: "Sale phụ trách", source: "Nguồn" }[key]}
                    </label>
                    <input
                      type={key === "email" ? "email" : "text"}
                      required={key === "name"}
                      value={(editForm[key] as string) ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value || null }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sản phẩm</label>
                  <select value={editForm.product_id ? String(editForm.product_id) : ""}
                    onChange={e => {
                      const pid = e.target.value ? Number(e.target.value) : null;
                      const prod = products.find((p: Product) => p.id === pid);
                      setEditForm(f => ({ ...f, product_id: pid, list_price: prod?.price ?? f.list_price }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chọn sản phẩm</option>
                    {products.map((p: Product) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nhóm</label>
                  <select value={editForm.group_id ? String(editForm.group_id) : ""}
                    onChange={e => setEditForm(f => ({ ...f, group_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chưa phân nhóm</option>
                    {groups.map((g: import("../lib/types").Group) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Doanh thu</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Giá niêm yết</label>
                      <input type="number" min="0"
                        value={editForm.list_price ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, list_price: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Giảm giá (%)</label>
                      <input type="number" min="0" max="100"
                        value={editForm.discount_pct ?? 0}
                        onChange={e => setEditForm(f => ({ ...f, discount_pct: Number(e.target.value) }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Giá chốt (VNĐ)</label>
                    <input type="number" min="0"
                      value={editForm.final_price ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, final_price: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="Tự tính nếu để trống"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEditing(false)}
                    className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1 text-gray-600">
                    <X size={14} /> Hủy
                  </button>
                  <button type="submit" disabled={updateMut.isPending}
                    className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                    <Check size={14} /> {updateMut.isPending ? "Đang lưu..." : "Lưu"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Contact */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h3 className="font-semibold text-gray-900">Liên hệ</h3>
                {customer.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone size={15} className="text-gray-400 flex-shrink-0" />
                    <a href={`tel:${customer.phone}`} className="text-gray-700 hover:text-blue-600">{customer.phone}</a>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center justify-between text-sm group/email-row">
                    <div className="flex items-center gap-3 min-w-0">
                      <Mail size={15} className="text-gray-400 flex-shrink-0" />
                      <a href={`mailto:${customer.email}`} className="text-gray-700 hover:text-blue-600 truncate">{customer.email}</a>
                    </div>
                    <button
                      onClick={() => setEmailModal(true)}
                      className="ml-2 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded transition-all flex items-center gap-1 font-medium cursor-pointer"
                      title="Gửi email soạn thảo"
                    >
                      <Mail size={11} /> Gửi thư
                    </button>
                  </div>
                )}
                {customer.facebook_link && (
                  <div className="flex items-center gap-3 text-sm">
                    <ExternalLink size={15} className="text-gray-400 flex-shrink-0" />
                    <a href={customer.facebook_link} target="_blank" rel="noreferrer"
                      className="text-blue-600 hover:underline truncate">Facebook</a>
                  </div>
                )}
                {customer.source && (
                  <div className="flex items-center gap-3 text-sm">
                    <Tag size={15} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">{customer.source}</span>
                  </div>
                )}
                {customer.assigned_to && (
                  <div className="flex items-center gap-3 text-sm">
                    <User size={15} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">Sale: {customer.assigned_to}</span>
                  </div>
                )}
              </div>

              {/* Sản phẩm */}
              {customer.product_name && (
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-2 text-sm">
                  <Package size={14} className="text-gray-400" />
                  <span className="font-medium text-gray-900">{customer.product_name}</span>
                </div>
              )}

              {/* Doanh thu — chỉ show khi won hoặc đã có giá */}
              {(isWon || customer.final_price != null) && (
                <div className={`rounded-xl border p-4 space-y-1.5 ${isWon ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm flex items-center gap-1.5 text-green-900">
                      <BadgeDollarSign size={14} /> Doanh thu
                    </h3>
                  </div>
                  {customer.list_price != null && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Giá niêm yết</span><span>{fmtMoney(customer.list_price)}</span>
                    </div>
                  )}
                  {(customer.discount_pct ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Giảm giá</span><span>-{customer.discount_pct}%</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-green-900 pt-1 border-t border-green-200">
                    <span>Giá chốt</span>
                    <span>{fmtMoney(customer.final_price) ?? "Chưa nhập"}</span>
                  </div>

                  {/* Convert to LMS Client button */}
                  {isWon && (
                    <button onClick={openLmsModal}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-xs font-medium text-purple-700 border border-purple-300 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                      <MonitorPlay size={13} /> Tạo LMS Client từ lead này
                    </button>
                  )}
                </div>
              )}

              {/* Group switcher */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-3 text-sm">Giai đoạn cơ hội</h3>
                <div className="space-y-1.5">
                  <button onClick={() => handleGroupChange(null)}
                    className={`w-full text-xs py-1.5 px-3 rounded-lg font-medium text-left transition-colors ${!customer.group_id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    Chưa có cơ hội
                  </button>
                  {groups.map((g: import("../lib/types").Group) => (
                    <button key={g.id} onClick={() => handleGroupChange(g.id)}
                      className={`w-full text-xs py-1.5 px-3 rounded-lg font-semibold text-left text-white transition-all ${customer.group_id === g.id ? "opacity-100 ring-2 ring-offset-1" : "opacity-60 hover:opacity-100"}`}
                      style={{ backgroundColor: g.color, outlineColor: g.color }}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>

              <FollowUpCard customer={customer} />

              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
                <p className="text-xs text-gray-400">Ngày nhận: {fmtDate(customer.created_at)}</p>
                <p className="text-xs text-gray-400">Cập nhật: {fmtDate(customer.updated_at)}</p>
              </div>
            </>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Lịch sử chăm sóc ({notes.length})</h3>

          <form onSubmit={e => {
            e.preventDefault();
            if (noteContent.trim()) addNoteMut.mutate({ content: noteContent, type: noteType });
          }} className="mb-6 pb-5 border-b border-gray-100">
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
              placeholder="Ghi lại nội dung cuộc gọi, phản hồi, kết quả..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <div className="flex gap-3 mt-2">
              <select value={noteType} onChange={e => setNoteType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
              <button type="submit" disabled={!noteContent.trim() || addNoteMut.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {addNoteMut.isPending ? "Đang lưu..." : "Thêm ghi chú"}
              </button>
            </div>
          </form>

          {notes.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Chưa có lịch sử. Ghi lại cuộc gọi đầu tiên!</p>
          ) : (
            <div className="space-y-3">
              {notes.map(note => {
                const type = NOTE_TYPES.find(t => t.value === note.type);
                return (
                  <div key={note.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg group">
                    <div className="text-xl flex-shrink-0 leading-none pt-0.5">{type?.icon ?? "📝"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-medium text-gray-500">{type?.label ?? note.type}</span>
                        <span className="text-xs text-gray-400">{new Date(note.created_at).toLocaleString("vi-VN")}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    </div>
                    <button onClick={() => deleteNoteMut.mutate(note.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 self-start">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── LMS Convert Modal ── */}
      {lmsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold">Tạo LMS Client</h3>
                <p className="text-xs text-gray-400 mt-0.5">Từ lead: {customer.name}</p>
              </div>
              <button onClick={() => setLmsModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {lmsSuccess ? (
              <div className="p-6 text-center space-y-4">
                <div className="text-4xl">✅</div>
                <p className="font-semibold text-gray-900">Đã tạo LMS Client thành công!</p>
                <p className="text-sm text-gray-500">Domain <span className="font-mono text-purple-700">{lmsForm.domain}</span> đã được provision vào KV.</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setLmsModal(false)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                    Đóng
                  </button>
                  <Link to="/lms"
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    Xem LMS Clients →
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); createLmsMut.mutate(); }} className="p-6 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domain *</label>
                  <input required value={lmsForm.domain}
                    onChange={e => setLmsForm(f => ({ ...f, domain: e.target.value }))}
                    placeholder="abc.lms.vnmentors.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  <p className="text-xs text-gray-400 mt-1">Không cần https://</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bắt đầu *</label>
                    <input required type="date" value={lmsForm.contract_start}
                      onChange={e => setLmsForm(f => ({ ...f, contract_start: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hết hạn *</label>
                    <input required type="date" value={lmsForm.contract_end}
                      onChange={e => setLmsForm(f => ({ ...f, contract_end: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số users *</label>
                    <input required type="number" min="1" value={lmsForm.user_count}
                      onChange={e => setLmsForm(f => ({ ...f, user_count: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giá hợp đồng</label>
                    <input type="number" min="0" value={lmsForm.price}
                      onChange={e => setLmsForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="VNĐ"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <input value={lmsForm.note} onChange={e => setLmsForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>

                {lmsError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                    {lmsError}
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-1">
                  <button type="button" onClick={() => setLmsModal(false)}
                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                  <button type="submit" disabled={createLmsMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                    <MonitorPlay size={15} />
                    {createLmsMut.isPending ? "Đang tạo..." : "Tạo & Provision"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Single Email compose modal */}
      <EmailComposeModal
        isOpen={emailModal}
        onClose={() => setEmailModal(false)}
        customerIds={[customer.id]}
        recipientCount={1}
        onSuccess={() => {
          setEmailModal(false);
          // Add a note that an email was sent
          addNoteMut.mutate({ content: "Đã tạo chiến dịch gửi email chăm sóc tới khách hàng.", type: "email" });
        }}
      />
    </div>
  );
}
