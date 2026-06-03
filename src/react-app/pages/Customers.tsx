import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  X, Upload, Clock, AlertCircle, UserPlus, Shuffle, Layers,
} from "lucide-react";
import { api } from "../lib/api";
import type { Customer, Group, Product } from "../lib/types";
import { GroupBadge } from "../components/GroupBadge";
import { StatusBadge } from "../components/StatusBadge";
import ImportModal from "../components/ImportModal";
import { useAuth } from "../hooks/useAuth";

const SOURCE_OPTIONS = [
  "Facebook", "Zalo", "Truyền miệng", "Website",
  "Data TTS", "Phone Feature", "990toeic App", "Khác",
];

type LeadForm = {
  name: string; phone: string; email: string; facebook_link: string;
  company: string; source: string; product_id: string; group_id: string;
  assigned_to: string; assigned_user_id: string;
};
const emptyForm: LeadForm = {
  name: "", phone: "", email: "", facebook_link: "",
  company: "", source: "", product_id: "", group_id: "",
  assigned_to: "", assigned_user_id: "",
};

function lastContactLabel(d: string | null | undefined) {
  if (!d) return { label: "Chưa liên hệ", urgent: true };
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return { label: "Hôm nay", urgent: false };
  if (days === 1) return { label: "Hôm qua", urgent: false };
  if (days <= 7) return { label: `${days} ngày`, urgent: false };
  return { label: `${days} ngày`, urgent: true };
}

function formatDateTime(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// ── Inline stage picker (chips) ───────────────────────────────
function StagePicker({ customer, groups, onClose }: {
  customer: Customer; groups: Group[];
  onClose: (groupId: number | null) => void;
}) {
  return (
    <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-56">
      <p className="text-xs text-gray-400 mb-2 font-medium">Chuyển giai đoạn</p>
      <button
        onClick={() => onClose(null)}
        className={`w-full text-left px-3 py-2 text-xs rounded-lg mb-1 transition-colors font-medium ${!customer.group_id ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
        Chưa có cơ hội
      </button>
      {groups.map(g => (
        <button key={g.id} onClick={() => onClose(g.id)}
          className={`w-full text-left px-3 py-2 text-xs rounded-lg mb-0.5 transition-all font-semibold flex items-center gap-2 ${customer.group_id === g.id ? "text-white" : "text-white opacity-60 hover:opacity-100"}`}
          style={{ backgroundColor: g.color }}>
          <span className="flex-1">{g.name}</span>
          {g.is_won === 1 && <span className="text-[10px] opacity-80">✓ Won</span>}
          {customer.group_id === g.id && <span className="text-[10px]">◀ hiện tại</span>}
        </button>
      ))}
    </div>
  );
}

export default function Customers() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  // Filters
  const [search, setSearch]           = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [page, setPage]               = useState(1);

  // Modals
  const [modal, setModal]         = useState<{ open: boolean; customer?: Customer }>({ open: false });
  const [form, setForm]           = useState<LeadForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Stage picker
  const [stageFor, setStageFor] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Multi-select
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState<"assign" | "stage" | "distribute" | null>(null);

  useEffect(() => {
    if (stageFor === null) return;
    const close = (e: MouseEvent) => {
      if (stageRef.current && !stageRef.current.contains(e.target as Node)) setStageFor(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [stageFor]);

  const STATIC = { staleTime: 1000 * 60 * 10 };
  const { data, isLoading } = useQuery({
    queryKey: ["customers", search, groupFilter, productFilter, page],
    queryFn: () => api.getCustomers({ q: search, group_id: groupFilter, product_id: productFilter, page }),
  });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => api.getGroups(), ...STATIC });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.getProducts(), ...STATIC });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.getUsers(), ...STATIC });

  const activeProducts = (products as Product[]).filter((p) => p.active);

  const createMut = useMutation({
    mutationFn: (d: Partial<Customer>) => api.createCustomer(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["stats"] }); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<Customer> }) => api.updateCustomer(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteCustomer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["stats"] }); setDeleteConfirm(null); },
  });
  const stageMut = useMutation({
    mutationFn: ({ id, groupId }: { id: number; groupId: number | null }) =>
      api.updateCustomer(id, { group_id: groupId } as Partial<Customer>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setStageFor(null);
    },
  });
  const bulkMut = useMutation({
    mutationFn: (body: Parameters<typeof api.bulkCustomers>[0]) => api.bulkCustomers(body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setSelected(new Set());
      setBulkModal(null);
      alert(`✅ Đã cập nhật ${r.updated} leads`);
    },
  });

  function toPayload(f: LeadForm): Partial<Customer> {
    return {
      name: f.name.trim(), phone: f.phone || null, email: f.email || null,
      facebook_link: f.facebook_link || null, company: f.company || null,
      source: f.source || null,
      product_id: f.product_id ? Number(f.product_id) : null,
      group_id: f.group_id ? Number(f.group_id) : null,
      assigned_to: f.assigned_to || null,
      assigned_user_id: f.assigned_user_id ? Number(f.assigned_user_id) : null,
    };
  }

  function openAdd() { setForm(emptyForm); setModal({ open: true }); }
  function openEdit(c: Customer) {
    setForm({
      name: c.name, phone: c.phone ?? "", email: c.email ?? "",
      facebook_link: c.facebook_link ?? "", company: c.company ?? "",
      source: c.source ?? "",
      product_id: c.product_id ? String(c.product_id) : "",
      group_id: c.group_id ? String(c.group_id) : "",
      assigned_to: c.assigned_to ?? "",
      assigned_user_id: c.assigned_user_id ? String(c.assigned_user_id) : "",
    });
    setModal({ open: true, customer: c });
  }
  function closeModal() { setModal({ open: false }); }

  function handleUserChange(userId: string) {
    const u = (users as { id: number; name: string }[]).find(u => String(u.id) === userId);
    setForm(f => ({ ...f, assigned_user_id: userId, assigned_to: u?.name ?? "" }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = toPayload(form);
    if (modal.customer) updateMut.mutate({ id: modal.customer.id, d: p });
    else createMut.mutate(p);
  }

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value); setPage(1);
  }, []);

  // Multi-select helpers
  const allIds = (data?.customers ?? []).map(c => c.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(s => { const n = new Set(s); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(s => new Set([...s, ...allIds]));
  }
  function toggleOne(id: number) {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const hasFilter = !!groupFilter || !!productFilter || !!search;
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
          <p className="text-gray-500 mt-1 text-sm">{data?.total ?? 0} leads</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload size={15} /> Import
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={17} /> Thêm lead
          </button>
        </div>
      </div>

      {/* Search + clear */}
      <div className="flex gap-3 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={handleSearch} placeholder="Tên, SĐT, email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {hasFilter && (
          <button onClick={() => { setGroupFilter(""); setProductFilter(""); setSearch(""); setPage(1); }}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 border border-gray-300 rounded-lg hover:bg-gray-50">
            Xóa lọc
          </button>
        )}
      </div>

      {/* Filter: Cơ hội */}
      {(groups as Group[]).length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 w-14 flex-shrink-0">Cơ hội:</span>
          <button onClick={() => { setGroupFilter(""); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium ${!groupFilter ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            Tất cả
          </button>
          <button onClick={() => { setGroupFilter("none"); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium ${groupFilter === "none" ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            Chưa có cơ hội
          </button>
          {(groups as Group[]).map(g => (
            <button key={g.id} onClick={() => { setGroupFilter(String(g.id)); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold text-white transition-opacity ${groupFilter === String(g.id) ? "opacity-100 ring-2 ring-offset-1" : "opacity-65 hover:opacity-100"}`}
              style={{ backgroundColor: g.color, outlineColor: g.color }}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* Filter: Sản phẩm */}
      {activeProducts.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <span className="text-xs text-gray-400 w-14 flex-shrink-0">Sản phẩm:</span>
          <button onClick={() => { setProductFilter(""); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium ${!productFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            Tất cả
          </button>
          {activeProducts.map(p => (
            <button key={p.id} onClick={() => { setProductFilter(String(p.id)); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium ${productFilter === String(p.id) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[calc(100vh-280px)] relative shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs">
              {isAdmin && (
                <th className="px-3 py-3 w-8 sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-gray-300 cursor-pointer" />
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Tên khách hàng</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">SĐT</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Sản phẩm</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Trạng thái</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Cơ hội / Giai đoạn</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Sale</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Thời gian nhận</th>
              <th className="text-left px-4 py-3 font-medium sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">
                <span className="flex items-center gap-1"><Clock size={12} /> Liên hệ cuối</span>
              </th>
              <th className="px-4 py-3 w-14 sticky top-0 bg-gray-50 z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={isAdmin ? 10 : 9} className="py-12 text-center text-gray-400">Đang tải...</td></tr>
            ) : (data?.customers.length ?? 0) === 0 ? (
              <tr><td colSpan={isAdmin ? 10 : 9} className="py-12 text-center text-gray-400">Chưa có lead nào</td></tr>
            ) : (
              data?.customers.map(c => {
                const { label: lastContact, urgent } = lastContactLabel(c.last_note_at);
                const isSel = selected.has(c.id);
                return (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${isSel ? "bg-blue-50" : ""}`}>
                    {isAdmin && (
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(c.id)}
                          className="rounded border-gray-300 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link to={`/customers/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">{c.name}</Link>
                      {c.source && <div className="text-xs text-gray-400 mt-0.5">{c.source}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      {c.product_name
                        ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{c.product_name}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>

                    {/* Stage — click để đổi */}
                    <td className="px-4 py-3 relative">
                      <div ref={stageFor === c.id ? stageRef : undefined}>
                        <button
                          onClick={() => setStageFor(stageFor === c.id ? null : c.id)}
                          className="flex items-center gap-1 group/stage hover:opacity-80 transition-opacity"
                          title="Click để đổi giai đoạn">
                          <GroupBadge customer={c} />
                          <span className="text-gray-300 text-[10px] opacity-0 group-hover/stage:opacity-100 ml-0.5">▼</span>
                        </button>
                        {stageFor === c.id && (
                          <StagePicker
                            customer={c}
                            groups={groups as Group[]}
                            onClose={(gid) => stageMut.mutate({ id: c.id, groupId: gid })}
                          />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-500 text-xs">{c.assigned_to ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{formatDateTime(c.created_at)}</td>

                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs ${urgent ? "text-red-500 font-medium" : "text-gray-400"}`}>
                        {urgent && <AlertCircle size={11} />}{lastContact}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Pencil size={13} /></button>
                        <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {(data?.totalPages ?? 0) > 1 && (
          <div className="sticky bottom-0 bg-white z-20 px-6 py-3 border-t border-gray-100 flex items-center justify-between shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
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

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && isAdmin && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm font-semibold text-white/90">
            {selected.size} leads đã chọn
          </span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={() => setBulkModal("assign")}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
            <UserPlus size={14} /> Phân công
          </button>
          <button onClick={() => setBulkModal("distribute")}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors">
            <Shuffle size={14} /> Phân phối đều
          </button>
          <button onClick={() => setBulkModal("stage")}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors">
            <Layers size={14} /> Đổi giai đoạn
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-white/50 hover:text-white p-1 ml-1"><X size={16} /></button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">{modal.customer ? "Sửa lead" : "Thêm lead mới"}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nguyễn Văn A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SĐT / Zalo</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nguồn</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chọn nguồn</option>
                    {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sản phẩm</label>
                  <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chưa rõ</option>
                    {activeProducts.map(p => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}{p.price ? ` — ${(p.price / 1000).toFixed(0)}K` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giai đoạn</label>
                  <select value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Chưa có cơ hội</option>
                    {(groups as Group[]).map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Công ty</label>
                  <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale phụ trách</label>
                <select value={form.assigned_user_id} onChange={e => handleUserChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Chưa phân công</option>
                  {(users as { id: number; name: string; role: string }[]).map(u => (
                    <option key={u.id} value={String(u.id)}>
                      {u.name}{u.role === "admin" ? " (Admin)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button type="submit" disabled={isPending}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {isPending ? "Đang lưu..." : modal.customer ? "Cập nhật" : "Thêm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bulk: Phân công ── */}
      {bulkModal === "assign" && (
        <BulkModal
          title={`Phân công ${selected.size} leads`}
          onClose={() => setBulkModal(null)}>
          <BulkAssignForm users={users as { id: number; name: string; role: string }[]}
            onSubmit={(uid, uname) => bulkMut.mutate({ ids: [...selected], action: "assign", user_id: uid, user_name: uname })}
            loading={bulkMut.isPending} />
        </BulkModal>
      )}

      {/* ── Bulk: Phân phối đều ── */}
      {bulkModal === "distribute" && (
        <BulkModal
          title={`Phân phối đều ${selected.size} leads`}
          onClose={() => setBulkModal(null)}>
          <BulkDistributeForm users={users as { id: number; name: string; role: string }[]}
            onSubmit={(uids, unames) => bulkMut.mutate({ ids: [...selected], action: "auto_distribute", user_ids: uids, user_names: unames })}
            loading={bulkMut.isPending} />
        </BulkModal>
      )}

      {/* ── Bulk: Đổi giai đoạn ── */}
      {bulkModal === "stage" && (
        <BulkModal
          title={`Đổi giai đoạn ${selected.size} leads`}
          onClose={() => setBulkModal(null)}>
          <div className="space-y-2">
            <button onClick={() => bulkMut.mutate({ ids: [...selected], action: "group", group_id: null })}
              disabled={bulkMut.isPending}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 font-medium">
              Chưa có cơ hội
            </button>
            {(groups as Group[]).map(g => (
              <button key={g.id}
                onClick={() => bulkMut.mutate({ ids: [...selected], action: "group", group_id: g.id })}
                disabled={bulkMut.isPending}
                className="w-full text-left px-4 py-3 rounded-xl text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: g.color }}>
                {g.name} {g.is_won ? "✓" : ""}
              </button>
            ))}
          </div>
        </BulkModal>
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2">Xóa lead này?</h3>
            <p className="text-gray-500 text-sm mb-6">Toàn bộ lịch sử chăm sóc cũng sẽ bị xóa.</p>
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

      {showImport && <ImportModal products={products as Product[]} groups={groups as Group[]} onClose={() => setShowImport(false)} />}
    </div>
  );
}

// ── Bulk helpers ──────────────────────────────────────────────
function BulkModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function BulkAssignForm({ users, onSubmit, loading }: {
  users: { id: number; name: string; role: string }[];
  onSubmit: (uid: number | null, uname: string | null) => void;
  loading: boolean;
}) {
  const [uid, setUid] = useState("");
  const chosen = users.find(u => String(u.id) === uid);
  return (
    <div className="space-y-3">
      <select value={uid} onChange={e => setUid(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Chọn nhân viên</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.role === "admin" ? " (Admin)" : ""}</option>)}
      </select>
      <button onClick={() => onSubmit(chosen ? chosen.id : null, chosen?.name ?? null)}
        disabled={!uid || loading}
        className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
        {loading ? "Đang phân công..." : `Phân công cho ${chosen?.name ?? "..."}`}
      </button>
    </div>
  );
}

function BulkDistributeForm({ users, onSubmit, loading }: {
  users: { id: number; name: string; role: string }[];
  onSubmit: (uids: number[], unames: string[]) => void;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(users.map(u => u.id)));
  function toggle(id: number) {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const chosen = users.filter(u => selected.has(u.id));
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Chọn nhân viên để phân phối đều (round-robin):</p>
      <div className="space-y-1.5">
        {users.map(u => (
          <label key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)}
              className="rounded border-gray-300" />
            <span className="text-sm font-medium text-gray-800">{u.name}</span>
            <span className="text-xs text-gray-400 ml-auto">{u.role}</span>
          </label>
        ))}
      </div>
      {chosen.length > 0 && (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          Mỗi người nhận ~{Math.ceil(1 / chosen.length * 100)}% số leads đã chọn
        </p>
      )}
      <button onClick={() => onSubmit(chosen.map(u => u.id), chosen.map(u => u.name))}
        disabled={chosen.length === 0 || loading}
        className="w-full py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50">
        {loading ? "Đang phân phối..." : `Phân phối đều cho ${chosen.length} người`}
      </button>
    </div>
  );
}
