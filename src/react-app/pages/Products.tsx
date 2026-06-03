import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Users, Trophy, TrendingUp, ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "../lib/api";
import type { Product } from "../lib/types";

function fmtMoney(v: number) {
  if (!v) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return Math.round(v / 1_000) + "K";
  return v.toLocaleString("vi-VN");
}

type ProductForm = { name: string; price: string; description: string };
const emptyForm: ProductForm = { name: "", price: "", description: "" };

export default function Products() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.getProducts(),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<Product>) => api.createProduct(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<Product> }) => api.updateProduct(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeModal(); },
  });
  const deleteMut = useMutation({
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
    if (modal.product) updateMut.mutate({ id: modal.product.id, d: payload });
    else createMut.mutate(payload);
  }

  function toggleActive(p: Product) {
    updateMut.mutate({ id: p.id, d: { active: p.active ? 0 : 1 } });
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const activeProducts   = products.filter((p: Product) => p.active);
  const inactiveProducts = products.filter((p: Product) => !p.active);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sản phẩm</h2>
          <p className="text-gray-500 mt-1 text-sm">{activeProducts.length} đang bán · {inactiveProducts.length} đã ẩn</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={18} /> Thêm sản phẩm
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Đang tải...</div>
      ) : (
        <div className="space-y-6">
          {/* Active products */}
          <div className="space-y-3">
            {activeProducts.map((p: Product) => (
              <ProductCard key={p.id} product={p}
                onEdit={() => openEdit(p)}
                onToggle={() => toggleActive(p)}
                onDelete={() => setDeleteConfirm(p.id)} />
            ))}
          </div>

          {/* Inactive */}
          {inactiveProducts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Đã ẩn</p>
              <div className="space-y-2 opacity-60">
                {inactiveProducts.map((p: Product) => (
                  <ProductCard key={p.id} product={p}
                    onEdit={() => openEdit(p)}
                    onToggle={() => toggleActive(p)}
                    onDelete={() => setDeleteConfirm(p.id)} />
                ))}
              </div>
            </div>
          )}

          {products.length === 0 && (
            <p className="text-center py-12 text-gray-400">Chưa có sản phẩm nào</p>
          )}
        </div>
      )}

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
                  placeholder="990TOEIC, Hệ thống LMS..."
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
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button type="submit" disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
            <h3 className="text-lg font-semibold mb-2">Ẩn/xóa sản phẩm?</h3>
            <p className="text-gray-500 text-sm mb-6">Nếu sản phẩm đã có lead, deal hoặc gói mua, hệ thống sẽ ẩn thay vì xóa để giữ báo cáo đúng.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
              <button onClick={() => deleteMut.mutate(deleteConfirm)} disabled={deleteMut.isPending}
                className="flex-1 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product: p, onEdit, onToggle, onDelete }: {
  product: Product;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const cr = (p.lead_count ?? 0) > 0 ? Math.round(((p.won_count ?? 0) / (p.lead_count ?? 1)) * 100) : 0;

  return (
    <div className={`bg-white border rounded-xl p-5 flex items-center gap-5 ${p.active ? "border-gray-200" : "border-gray-100"}`}>
      {/* Color dot */}
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${p.active ? "bg-green-400" : "bg-gray-300"}`} />

      {/* Name + price */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-900">{p.name}</span>
          {p.price > 0 && (
            <span className="text-sm font-medium text-blue-700">
              {p.price.toLocaleString("vi-VN")}đ
            </span>
          )}
          {!p.active && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Ẩn</span>}
        </div>
        {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 flex-shrink-0">
        <div className="text-center">
          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
            <Users size={11} /> leads
          </div>
          <span className="font-bold text-gray-900 text-sm">{p.lead_count ?? 0}</span>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
            <Trophy size={11} /> chốt
          </div>
          <span className="font-bold text-green-700 text-sm">{p.won_count ?? 0}</span>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-1 text-gray-500 text-xs mb-0.5">
            <TrendingUp size={11} /> CR
          </div>
          <span className={`font-bold text-sm ${cr >= 20 ? "text-green-600" : cr >= 10 ? "text-amber-600" : "text-gray-500"}`}>{cr}%</span>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Doanh thu</div>
          <span className="font-bold text-emerald-700 text-sm">{fmtMoney(p.revenue ?? 0)}đ</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onToggle} title={p.active ? "Ẩn sản phẩm" : "Hiện lại"}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          {p.active ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
        </button>
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
