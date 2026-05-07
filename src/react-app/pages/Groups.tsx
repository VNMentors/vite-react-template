import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Trophy } from "lucide-react";
import { api } from "../lib/api";
import type { Group } from "../lib/types";
import { GroupTag, PRESET_COLORS } from "../components/GroupBadge";

type GroupForm = {
  name: string;
  description: string;
  color: string;
  is_won: boolean;
};

const emptyForm: GroupForm = { name: "", description: "", color: "#3b82f6", is_won: false };

export default function Groups() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; group?: Group }>({ open: false });
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<Group | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.getGroups(),
  });

  const createMutation = useMutation({
    mutationFn: (d: Partial<Group>) => api.createGroup(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["groups"] }); closeModal(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<Group> }) => api.updateGroup(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["groups"] }); closeModal(); },
  });
  const reorderMutation = useMutation({
    mutationFn: ({ id, dir }: { id: number; dir: "up" | "down" }) => api.reorderGroup(id, dir),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["groups"] }); setDeleteConfirm(null); },
    onError: (err) => alert(err.message),
  });

  function openAdd() { setForm(emptyForm); setModal({ open: true }); }
  function openEdit(g: Group) {
    setForm({ name: g.name, description: g.description ?? "", color: g.color, is_won: g.is_won === 1 });
    setModal({ open: true, group: g });
  }
  function closeModal() { setModal({ open: false }); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Partial<Group> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      is_won: form.is_won ? 1 : 0,
    };
    if (modal.group) updateMutation.mutate({ id: modal.group.id, d: payload });
    else createMutation.mutate(payload);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cài đặt nhóm khách hàng</h2>
          <p className="text-gray-500 mt-1 text-sm">
            Tùy chỉnh quy trình phân loại lead theo đặc thù kinh doanh của bạn
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={17} /> Thêm nhóm
        </button>
      </div>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <p className="font-medium mb-1">💡 Cách hoạt động</p>
        <p>Mỗi khách hàng thuộc 1 nhóm. Nhóm đánh dấu <strong>Đã chốt ✓</strong> sẽ được tính vào doanh thu báo cáo.
        Kéo thứ tự để thể hiện đúng quy trình chuyển đổi của bạn.</p>
      </div>

      {/* Danh sách nhóm */}
      {isLoading ? (
        <div className="text-gray-400 text-center py-10">Đang tải...</div>
      ) : (
        <div className="space-y-2">
          {groups.map((g: Group, i: number) => (
            <div key={g.id}
              className="bg-white border border-gray-200 rounded-xl px-4 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
              {/* Order */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => reorderMutation.mutate({ id: g.id, dir: "up" })}
                  disabled={i === 0 || reorderMutation.isPending}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors">
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => reorderMutation.mutate({ id: g.id, dir: "down" })}
                  disabled={i === groups.length - 1 || reorderMutation.isPending}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors">
                  <ChevronDown size={16} />
                </button>
              </div>

              {/* Color dot */}
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <GroupTag group={g} />
                  {g.is_won === 1 && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                      <Trophy size={10} /> Đã chốt
                    </span>
                  )}
                </div>
                {g.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{g.description}</p>
                )}
              </div>

              {/* Customer count */}
              <div className="text-center flex-shrink-0">
                <div className="text-lg font-bold text-gray-900">{g.customer_count ?? 0}</div>
                <div className="text-xs text-gray-400">khách</div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(g)}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeleteConfirm(g)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">
                {modal.group ? "Sửa nhóm" : "Thêm nhóm mới"}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên nhóm *</label>
                <input required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nhóm 1, Đã tư vấn, Chốt đơn..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Mô tả tiêu chí khách hàng thuộc nhóm này..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Màu badge</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button key={c.value} type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${form.color === c.value ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                {/* Preview */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Xem trước:</span>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: form.color }}>
                    {form.name || "Tên nhóm"}
                  </span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-10 h-6 rounded-full transition-colors ${form.is_won ? "bg-green-500" : "bg-gray-300"}`}
                    onClick={() => setForm(f => ({ ...f, is_won: !f.is_won }))}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_won ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Trophy size={14} className={form.is_won ? "text-green-600" : "text-gray-400"} />
                      Đánh dấu là "Đã chốt"
                    </div>
                    <div className="text-xs text-gray-500">Khách trong nhóm này sẽ được tính doanh thu</div>
                  </div>
                </label>
              </div>

              {(createMutation.error ?? updateMutation.error) && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {(createMutation.error ?? updateMutation.error)?.message}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  Hủy
                </button>
                <button type="submit" disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {isPending ? "Đang lưu..." : modal.group ? "Cập nhật" : "Thêm nhóm"}
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
            <h3 className="text-lg font-semibold mb-2">Xóa nhóm "{deleteConfirm.name}"?</h3>
            {(deleteConfirm.customer_count ?? 0) > 0 ? (
              <p className="text-red-600 text-sm mb-6">
                Nhóm này còn <strong>{deleteConfirm.customer_count}</strong> khách hàng.
                Hãy chuyển họ sang nhóm khác trước khi xóa.
              </p>
            ) : (
              <p className="text-gray-500 text-sm mb-6">Hành động này không thể hoàn tác.</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-sm font-medium bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending || (deleteConfirm.customer_count ?? 0) > 0}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
                {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
