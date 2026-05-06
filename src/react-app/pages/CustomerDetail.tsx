import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Building2,
  Tag,
  X,
  Check,
} from "lucide-react";
import { api } from "../lib/api";
import type { Customer } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";

const STATUS_OPTIONS = ["lead", "prospect", "active", "inactive"];

const NOTE_TYPES = [
  { value: "note", label: "Ghi chú" },
  { value: "call", label: "Cuộc gọi" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Gặp mặt" },
];

const NOTE_ICONS: Record<string, string> = {
  note: "📝",
  call: "📞",
  email: "✉️",
  meeting: "🤝",
};

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

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) =>
      api.updateCustomer(customerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
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
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Đang tải...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">Không tìm thấy khách hàng</p>
        <Link
          to="/customers"
          className="text-blue-600 text-sm mt-2 inline-block hover:underline"
        >
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  function startEdit() {
    setEditForm({
      name: customer!.name,
      email: customer!.email ?? "",
      phone: customer!.phone ?? "",
      company: customer!.company ?? "",
      status: customer!.status,
      source: customer!.source ?? "",
    });
    setEditing(true);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      ...editForm,
      email: editForm.email || null,
      phone: editForm.phone || null,
      company: editForm.company || null,
      source: editForm.source || null,
    });
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    addNoteMutation.mutate({ content: noteContent, type: noteType });
  }

  function handleDelete() {
    if (window.confirm(`Xóa khách hàng "${customer?.name}"? Hành động này không thể hoàn tác.`)) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/customers"
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {customer.name}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {customer.company ?? "Khách hàng cá nhân"}
            </p>
          </div>
          <StatusBadge status={customer.status} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Pencil size={15} />
            Chỉnh sửa
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={15} />
            Xóa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Customer info */}
        <div className="col-span-1">
          {editing ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">
                Chỉnh sửa thông tin
              </h3>
              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tên *
                  </label>
                  <input
                    required
                    value={editForm.name ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    SĐT
                  </label>
                  <input
                    value={editForm.phone ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Công ty
                  </label>
                  <input
                    value={editForm.company ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, company: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nguồn
                  </label>
                  <input
                    value={editForm.source ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, source: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Trạng thái
                  </label>
                  <select
                    value={editForm.status ?? "lead"}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, status: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 text-gray-600"
                  >
                    <X size={14} /> Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Check size={14} />
                    {updateMutation.isPending ? "Đang lưu..." : "Lưu"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Thông tin liên hệ</h3>

              {customer.phone ? (
                <div className="flex items-center gap-3 text-sm">
                  <Phone size={16} className="text-gray-400 flex-shrink-0" />
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-gray-700 hover:text-blue-600"
                  >
                    {customer.phone}
                  </a>
                </div>
              ) : null}

              {customer.email ? (
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={16} className="text-gray-400 flex-shrink-0" />
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-gray-700 hover:text-blue-600 truncate"
                  >
                    {customer.email}
                  </a>
                </div>
              ) : null}

              {customer.company ? (
                <div className="flex items-center gap-3 text-sm">
                  <Building2
                    size={16}
                    className="text-gray-400 flex-shrink-0"
                  />
                  <span className="text-gray-700">{customer.company}</span>
                </div>
              ) : null}

              {customer.source ? (
                <div className="flex items-center gap-3 text-sm">
                  <Tag size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{customer.source}</span>
                </div>
              ) : null}

              {!customer.phone &&
                !customer.email &&
                !customer.company &&
                !customer.source && (
                  <p className="text-sm text-gray-400">
                    Chưa có thông tin liên hệ
                  </p>
                )}

              <div className="pt-2 border-t border-gray-100 space-y-1">
                <p className="text-xs text-gray-400">
                  Ngày tạo:{" "}
                  {new Date(customer.created_at).toLocaleDateString("vi-VN")}
                </p>
                <p className="text-xs text-gray-400">
                  Cập nhật:{" "}
                  {new Date(customer.updated_at).toLocaleDateString("vi-VN")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">
              Lịch sử tương tác ({notes.length})
            </h3>

            {/* Add note form */}
            <form onSubmit={handleAddNote} className="mb-6 pb-6 border-b border-gray-100">
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Ghi chú nội dung cuộc gọi, email, gặp mặt..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center gap-3 mt-2">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!noteContent.trim() || addNoteMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {addNoteMutation.isPending ? "Đang lưu..." : "Thêm ghi chú"}
                </button>
              </div>
            </form>

            {/* Notes list */}
            {notes.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                Chưa có ghi chú nào. Bắt đầu ghi lại tương tác với khách hàng!
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="flex gap-3 p-4 bg-gray-50 rounded-lg group"
                  >
                    <div className="text-xl flex-shrink-0 leading-none pt-0.5">
                      {NOTE_ICONS[note.type] ?? "📝"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-medium text-gray-500">
                          {NOTE_TYPES.find((t) => t.value === note.type)
                            ?.label ?? note.type}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(note.created_at).toLocaleString("vi-VN")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {note.content}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      disabled={deleteNoteMutation.isPending}
                      className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 self-start"
                      title="Xóa ghi chú"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
