import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, Trash2, Phone, Mail, ExternalLink,
  Building2, Tag, User, Package, X, Check, Bell, BellOff,
} from "lucide-react";
import { api } from "../lib/api";
import type { Customer, Product } from "../lib/types";
import { GroupBadge } from "../components/GroupBadge";

function FollowUpCard({ customer }: { customer: Customer }) {
  const [date, setDate] = useState(customer.follow_up_at?.slice(0, 10) ?? "");
  const [note, setNote] = useState(customer.follow_up_note ?? "");
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();

  async function save() {
    await api.updateCustomer(customer.id, { follow_up_at: date || null, follow_up_note: note || null } as Partial<Customer>);
    qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function clear() {
    setDate(""); setNote("");
    await api.updateCustomer(customer.id, { follow_up_at: null, follow_up_note: null } as Partial<Customer>);
    qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    qc.invalidateQueries({ queryKey: ["stats"] });
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
        placeholder="Ghi chú (gọi về... hỏi thêm...)"
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={save}
        className={`w-full py-1.5 rounded-lg text-sm font-medium transition-colors ${saved ? "bg-green-100 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
        {saved ? "✓ Đã lưu" : "Đặt nhắc nhở"}
      </button>
      {isOverdue && (
        <p className="text-xs text-red-600 font-medium">⚠️ Đã quá hạn follow-up!</p>
      )}
    </div>
  );
}

const NOTE_TYPES = [
  { value: "note", label: "Ghi chú", icon: "📝" },
  { value: "call", label: "Cuộc gọi", icon: "📞" },
  { value: "email", label: "Email", icon: "✉️" },
  { value: "meeting", label: "Gặp mặt", icon: "🤝" },
];

function fmtMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("vi-VN") + "đ";
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customerId = Number(id);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("note");

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => api.getCustomer(customerId),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", customerId],
    queryFn: () => api.getNotes(customerId),
    enabled: !!customerId,
  });

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.getProducts() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => api.getGroups() });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => api.updateCustomer(customerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteCustomer(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      navigate("/customers");
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ content, type }: { content: string; type: string }) =>
      api.createNote(customerId, content, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes", customerId] });
      setNoteContent("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => api.deleteNote(customerId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", customerId] }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Đang tải...</div>;
  }
  if (!customer) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">Không tìm thấy khách hàng</p>
        <Link to="/customers" className="text-blue-600 text-sm mt-2 inline-block hover:underline">← Quay lại</Link>
      </div>
    );
  }

  function startEdit() {
    setEditForm({ ...customer });
    setEditing(true);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const lp = editForm.list_price ?? null;
    const dp = editForm.discount_pct ?? 0;
    const fp = lp != null ? Math.round(lp * (1 - dp / 100)) : editForm.final_price ?? null;
    updateMutation.mutate({ ...editForm, final_price: fp });
  }

  function handleGroupChange(groupId: number | null) {
    api.updateCustomer(customerId, { group_id: groupId }).then(() => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    });
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    addNoteMutation.mutate({ content: noteContent, type: noteType });
  }

  function handleDelete() {
    if (window.confirm(`Xóa khách hàng "${customer?.name}"?`)) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Pencil size={15} /> Chỉnh sửa
          </button>
          <button onClick={handleDelete} disabled={deleteMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
            <Trash2 size={15} /> Xóa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Info */}
        <div className="space-y-4">
          {editing ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Chỉnh sửa thông tin</h3>
              <form onSubmit={handleUpdate} className="space-y-3">
                {[
                  { label: "Tên *", key: "name", type: "text", required: true },
                  { label: "SĐT / Zalo", key: "phone", type: "text" },
                  { label: "Email", key: "email", type: "email" },
                  { label: "Link Facebook", key: "facebook_link", type: "text" },
                  { label: "Sale phụ trách", key: "assigned_to", type: "text" },
                  { label: "Nguồn", key: "source", type: "text" },
                ].map(({ label, key, type, required }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      type={type}
                      required={required}
                      value={(editForm[key as keyof Customer] as string) ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value || null }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sản phẩm</label>
                  <select
                    value={editForm.product_id ? String(editForm.product_id) : ""}
                    onChange={e => {
                      const pid = e.target.value ? Number(e.target.value) : null;
                      const prod = products.find((p: Product) => p.id === pid);
                      setEditForm(f => ({ ...f, product_id: pid, list_price: prod ? prod.price : f.list_price }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chọn sản phẩm</option>
                    {products.map((p: Product) => (
                      <option key={p.id} value={String(p.id)}>{p.name} — {p.price.toLocaleString("vi-VN")}đ</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nhóm khách hàng</label>
                  <select value={editForm.group_id ? String(editForm.group_id) : ""}
                    onChange={e => setEditForm(f => ({ ...f, group_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chưa phân nhóm</option>
                    {groups.map((g: import("../lib/types").Group) => (
                      <option key={g.id} value={String(g.id)}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Giá niêm yết</label>
                    <input type="number" value={editForm.list_price ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, list_price: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Giảm giá (%)</label>
                    <input type="number" min="0" max="100" value={editForm.discount_pct ?? 0}
                      onChange={e => setEditForm(f => ({ ...f, discount_pct: Number(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEditing(false)}
                    className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1 text-gray-600">
                    <X size={14} /> Hủy
                  </button>
                  <button type="submit" disabled={updateMutation.isPending}
                    className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                    <Check size={14} /> {updateMutation.isPending ? "Đang lưu..." : "Lưu"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Contact info */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h3 className="font-semibold text-gray-900">Liên hệ</h3>
                {customer.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone size={15} className="text-gray-400 flex-shrink-0" />
                    <a href={`tel:${customer.phone}`} className="text-gray-700 hover:text-blue-600">{customer.phone}</a>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail size={15} className="text-gray-400 flex-shrink-0" />
                    <a href={`mailto:${customer.email}`} className="text-gray-700 hover:text-blue-600 truncate">{customer.email}</a>
                  </div>
                )}
                {customer.facebook_link && (
                  <div className="flex items-center gap-3 text-sm">
                    <ExternalLink size={15} className="text-gray-400 flex-shrink-0" />
                    <a href={customer.facebook_link} target="_blank" rel="noreferrer"
                      className="text-blue-600 hover:underline truncate">Facebook</a>
                  </div>
                )}
                {customer.company && (
                  <div className="flex items-center gap-3 text-sm">
                    <Building2 size={15} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">{customer.company}</span>
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

              {/* Product & Pricing */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h3 className="font-semibold text-gray-900">Sản phẩm & Giá</h3>
                {customer.product_name ? (
                  <div className="flex items-center gap-3 text-sm">
                    <Package size={15} className="text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-900">{customer.product_name}</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Chưa chọn sản phẩm</p>
                )}
                {customer.list_price != null && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-500">
                      <span>Giá niêm yết</span>
                      <span>{fmtMoney(customer.list_price)}</span>
                    </div>
                    {(customer.discount_pct ?? 0) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Giảm giá</span>
                        <span>-{customer.discount_pct}%</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200">
                      <span>Giá chốt</span>
                      <span className="text-blue-700">{fmtMoney(customer.final_price)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick group change */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3 text-sm">Chuyển nhóm</h3>
                {groups.length === 0 ? (
                  <p className="text-xs text-gray-400">Chưa có nhóm nào được cài đặt</p>
                ) : (
                  <div className="space-y-1.5">
                    <button onClick={() => handleGroupChange(null)}
                      className={`w-full text-xs py-1.5 px-3 rounded-lg font-medium text-left transition-colors ${
                        !customer.group_id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}>
                      Chưa phân nhóm
                    </button>
                    {groups.map((g: import("../lib/types").Group) => (
                      <button key={g.id} onClick={() => handleGroupChange(g.id)}
                        className={`w-full text-xs py-1.5 px-3 rounded-lg font-semibold text-left transition-all ${
                          customer.group_id === g.id ? "text-white ring-2 ring-offset-1" : "text-white opacity-60 hover:opacity-100"
                        }`}
                        style={{
                          backgroundColor: g.color,
                          outlineColor: g.color,
                        }}>
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Follow-up */}
              <FollowUpCard customer={customer} />

              {/* Dates */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
                <p className="text-xs text-gray-400">Ngày nhận: {new Date(customer.created_at).toLocaleDateString("vi-VN")}</p>
                <p className="text-xs text-gray-400">Cập nhật: {new Date(customer.updated_at).toLocaleDateString("vi-VN")}</p>
              </div>
            </>
          )}
        </div>

        {/* Right: Notes */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">
              Lịch sử chăm sóc ({notes.length})
            </h3>

            <form onSubmit={handleAddNote} className="mb-6 pb-5 border-b border-gray-100">
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Ghi lại nội dung cuộc gọi, phản hồi của khách, kết quả tư vấn..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-3 mt-2">
                <select value={noteType} onChange={e => setNoteType(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {NOTE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
                <button type="submit" disabled={!noteContent.trim() || addNoteMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {addNoteMutation.isPending ? "Đang lưu..." : "Thêm ghi chú"}
                </button>
              </div>
            </form>

            {notes.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Chưa có lịch sử chăm sóc. Ghi lại cuộc gọi đầu tiên!
              </p>
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
                          <span className="text-xs text-gray-400">
                            {new Date(note.created_at).toLocaleString("vi-VN")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                      </div>
                      <button onClick={() => deleteNoteMutation.mutate(note.id)}
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
      </div>
    </div>
  );
}
