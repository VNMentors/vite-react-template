import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, X, Upload } from "lucide-react";
import { api } from "../lib/api";
import type { Customer, Group, Product } from "../lib/types";
import { GroupBadge } from "../components/GroupBadge";
import ImportModal from "../components/ImportModal";

const SOURCE_OPTIONS = ["Facebook", "Zalo", "Truyền miệng", "Website", "Data TTS", "990toeic App", "Khác"];

type CustomerForm = {
  name: string; phone: string; email: string; facebook_link: string;
  source: string; product_id: string; group_id: string; assigned_to: string;
  list_price: string; discount_pct: string; final_price: string;
};

const emptyForm: CustomerForm = {
  name: "", phone: "", email: "", facebook_link: "", source: "",
  product_id: "", group_id: "", assigned_to: "",
  list_price: "", discount_pct: "0", final_price: "",
};

function calcFinal(lp: string, dp: string) {
  const l = parseFloat(lp), d = parseFloat(dp);
  return !isNaN(l) && !isNaN(d) ? String(Math.round(l * (1 - d / 100))) : lp;
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer }>({ open: false });
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [groupPickerFor, setGroupPickerFor] = useState<number | null>(null);

  useEffect(() => {
    if (groupPickerFor === null) return;
    const close = () => setGroupPickerFor(null);
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [groupPickerFor]);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search, groupFilter, page],
    queryFn: () => api.getCustomers({ q: search, group_id: groupFilter, page }),
  });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => api.getGroups() });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.getProducts() });

  const createMutation = useMutation({
    mutationFn: (d: Partial<Customer>) => api.createCustomer(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["stats"] }); closeModal(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<Customer> }) => api.updateCustomer(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); closeModal(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCustomer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["stats"] }); setDeleteConfirm(null); },
  });

  const changeGroupMutation = useMutation({
    mutationFn: ({ id, groupId }: { id: number; groupId: number | null }) =>
      api.updateCustomer(id, { group_id: groupId } as Partial<Customer>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setGroupPickerFor(null);
    },
  });

  function toPayload(f: CustomerForm): Partial<Customer> {
    return {
      name: f.name.trim(),
      phone: f.phone || null, email: f.email || null,
      facebook_link: f.facebook_link || null,
      source: f.source || null,
      product_id: f.product_id ? Number(f.product_id) : null,
      group_id: f.group_id ? Number(f.group_id) : null,
      assigned_to: f.assigned_to || null,
      list_price: f.list_price ? Number(f.list_price) : null,
      discount_pct: Number(f.discount_pct) || 0,
      final_price: f.final_price ? Number(f.final_price) : null,
    };
  }

  function openAdd() { setForm(emptyForm); setModal({ open: true }); }
  function openEdit(c: Customer) {
    setForm({
      name: c.name, phone: c.phone ?? "", email: c.email ?? "",
      facebook_link: c.facebook_link ?? "", source: c.source ?? "",
      product_id: c.product_id ? String(c.product_id) : "",
      group_id: c.group_id ? String(c.group_id) : "",
      assigned_to: c.assigned_to ?? "",
      list_price: c.list_price ? String(c.list_price) : "",
      discount_pct: c.discount_pct != null ? String(c.discount_pct) : "0",
      final_price: c.final_price ? String(c.final_price) : "",
    });
    setModal({ open: true, customer: c });
  }
  function closeModal() { setModal({ open: false }); }

  function handleProductChange(pid: string) {
    const p = products.find((p: Product) => String(p.id) === pid);
    const lp = p ? String(p.price) : form.list_price;
    setForm(f => ({ ...f, product_id: pid, list_price: lp, final_price: calcFinal(lp, f.discount_pct) }));
  }
  function handlePriceChange(field: "list_price" | "discount_pct", val: string) {
    const next = { ...form, [field]: val };
    next.final_price = calcFinal(next.list_price, next.discount_pct);
    setForm(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(form);
    if (modal.customer) updateMutation.mutate({ id: modal.customer.id, d: payload });
    else createMutation.mutate(payload);
  }

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value); setPage(1);
  }, []);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Khách hàng</h2>
          <p className="text-gray-500 mt-1 text-sm">{data?.total ?? 0} leads</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Upload size={15} /> Import Excel
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={17} /> Thêm lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={handleSearch} placeholder="Tên, SĐT, email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tất cả nhóm</option>
          {groups.map((g: Group) => (
            <option key={g.id} value={String(g.id)}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Group quick-filter pills */}
      {groups.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button onClick={() => setGroupFilter("")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!groupFilter ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            Tất cả
          </button>
          {groups.map((g: Group) => (
            <button key={g.id} onClick={() => setGroupFilter(String(g.id))}
              className={`px-3 py-1 rounded-full text-xs font-semibold text-white transition-opacity ${groupFilter === String(g.id) ? "opacity-100 ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
              style={{ backgroundColor: g.color, outlineColor: g.color }}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
              <th className="text-left px-4 py-3 font-medium">Tên khách hàng</th>
              <th className="text-left px-4 py-3 font-medium">SĐT</th>
              <th className="text-left px-4 py-3 font-medium">Sản phẩm</th>
              <th className="text-left px-4 py-3 font-medium">Giá chốt</th>
              <th className="text-left px-4 py-3 font-medium">Sale</th>
              <th className="text-left px-4 py-3 font-medium">Nhóm</th>
              <th className="text-left px-4 py-3 font-medium">Ngày nhận</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">Đang tải...</td></tr>
            ) : (data?.customers.length ?? 0) === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">Chưa có lead nào</td></tr>
            ) : (
              data?.customers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/customers/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">{c.name}</Link>
                    {c.source && <div className="text-xs text-gray-400 mt-0.5">{c.source}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.product_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.final_price != null ? (
                      <span className="font-medium text-gray-900 text-xs">
                        {fmtMoney(c.final_price)}
                        {c.discount_pct ? <span className="text-green-600 ml-1">-{c.discount_pct}%</span> : null}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.assigned_to ?? "—"}</td>
                  <td className="px-4 py-3 relative">
                    <button
                      onClick={() => setGroupPickerFor(groupPickerFor === c.id ? null : c.id)}
                      className="flex items-center gap-1 group/gb"
                      title="Click để đổi nhóm"
                    >
                      <GroupBadge customer={c} />
                      <span className="text-gray-300 text-xs opacity-0 group-hover/gb:opacity-100 transition-opacity">▼</span>
                    </button>

                    {/* Inline group picker */}
                    {groupPickerFor === c.id && (
                      <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-44">
                        <button
                          onClick={() => changeGroupMutation.mutate({ id: c.id, groupId: null })}
                          className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          Chưa phân nhóm
                        </button>
                        {groups.map((g: Group) => (
                          <button
                            key={g.id}
                            onClick={() => changeGroupMutation.mutate({ id: c.id, groupId: g.id })}
                            className="w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg mt-0.5 text-white transition-opacity hover:opacity-90"
                            style={{ backgroundColor: g.color }}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Pencil size={13} /></button>
                      <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {(data?.totalPages ?? 0) > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">Trang {page} / {data?.totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <button onClick={() => setPage(p => Math.min(data?.totalPages ?? p, p + 1))} disabled={page === data?.totalPages}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold">{modal.customer ? "Sửa lead" : "Thêm lead mới"}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Thông tin KH */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Thông tin khách hàng</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên *</label>
                    <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Nguyễn Văn A"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SĐT / Zalo</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Link Facebook</label>
                    <input value={form.facebook_link} onChange={e => setForm(f => ({ ...f, facebook_link: e.target.value }))}
                      placeholder="https://facebook.com/..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Lead info */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Phân loại & Phân công</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nguồn</label>
                    <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Chọn nguồn</option>
                      {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sale phụ trách</label>
                    <input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                      placeholder="Tên nhân viên"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sản phẩm</label>
                    <select value={form.product_id} onChange={e => handleProductChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Chọn sản phẩm</option>
                      {products.map((p: Product) => (
                        <option key={p.id} value={String(p.id)}>{p.name} — {p.price.toLocaleString("vi-VN")}đ</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhóm khách hàng</label>
                    <select value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Chưa phân nhóm</option>
                      {groups.map((g: Group) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Giá</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giá niêm yết</label>
                    <input type="number" value={form.list_price} onChange={e => handlePriceChange("list_price", e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giảm (%)</label>
                    <input type="number" min="0" max="100" value={form.discount_pct}
                      onChange={e => handlePriceChange("discount_pct", e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giá chốt</label>
                    <input type="number" value={form.final_price}
                      onChange={e => setForm(f => ({ ...f, final_price: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button type="submit" disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {isPending ? "Đang lưu..." : modal.customer ? "Cập nhật" : "Thêm mới"}
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
            <h3 className="text-lg font-semibold mb-2">Xóa lead này?</h3>
            <p className="text-gray-500 text-sm mb-6">Toàn bộ lịch sử chăm sóc cũng sẽ bị xóa.</p>
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

      {showImport && <ImportModal products={products} onClose={() => setShowImport(false)} />}
    </div>
  );
}
