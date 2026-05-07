import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { Product } from "../lib/types";

type ProductForm = { name: string; price: string; description: string };
const emptyForm: ProductForm = { name: "", price: "", description: "" };

function fmtMoney(v: number) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Products() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.getProducts(),
  });

  const createMutation = useMutation({
    mutationFn: (d: Partial<Product>) => api.createProduct(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeModal(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<Product> }) => api.updateProduct(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeModal(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setDeleteConfirm(null); },
  });

  function openAdd() { setForm(emptyForm); setModal({ open: true }); }
  function openEdit(p: Product) {
    setForm({ name: p.name, price: String(p.price), description: p.description ?? "" });
    setModal({ open: true, product: p });
  }
  function closeModal() { setModal({ open: false }); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Partial<Product> = {
      name: form.name.trim(),
      price: Number(form.price) || 0,
      description: form.description || null,
    };
    if (modal.product) updateMutation.mutate({ id: modal.product.id, d: payload });
    else createMutation.mutate(payload);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sản phẩm</h2>
          <p className="text-gray-500 mt-1">Quản lý danh sách sản phẩm và giá</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={18} /> Thêm sản phẩm
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="text-left px-6 py-3 font-medium">Tên sản phẩm</th>
              <th className="text-left px-6 py-3 font-medium">Giá niêm yết</th>
              <th className="text-left px-6 py-3 font-medium">Mô tả</th>
              <th className="px-6 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">Đang tải...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">Chưa có sản phẩm nào</td></tr>
            ) : (
              products.map((p: Product) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{p.name}</td>
                  <td className="px-6 py-4 font-semibold text-blue-700">{fmtMoney(p.price)}</td>
                  <td className="px-6 py-4 text-gray-500">{p.description ?? "—"}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteConfirm(p.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">{modal.product ? "Sửa sản phẩm" : "Thêm sản phẩm"}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Pre90, 30 Ngày..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá niêm yết (VNĐ)</label>
                <input type="number" min="0" value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="590000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Ghi chú về sản phẩm..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              {(createMutation.error ?? updateMutation.error) && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {(createMutation.error ?? updateMutation.error)?.message}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Hủy</button>
                <button type="submit" disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {isPending ? "Đang lưu..." : modal.product ? "Cập nhật" : "Thêm"}
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
            <h3 className="text-lg font-semibold mb-2">Xóa sản phẩm?</h3>
            <p className="text-gray-500 text-sm mb-6">Các lead liên quan sẽ mất thông tin sản phẩm.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
