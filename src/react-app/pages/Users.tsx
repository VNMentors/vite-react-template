import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Shield, User, Eye, EyeOff, Check } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

type UserRow = { id: number; email: string; name: string; role: string; created_at: string };
type UserForm = { name: string; email: string; password: string; role: string };

const emptyForm: UserForm = { name: "", email: "", password: "", role: "staff" };

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  // Modal state: null = closed, "add" = thêm mới, UserRow = đang sửa
  const [modal, setModal] = useState<null | "add" | UserRow>(null);
  const [form, setForm]   = useState<UserForm>(emptyForm);
  const [showPwd, setShowPwd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [roleChangeId, setRoleChangeId] = useState<number | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.getUsers(),
    staleTime: 1000 * 60 * 5,
  });

  const createMut = useMutation({
    mutationFn: (f: UserForm) => api.createUser(f.name, f.email, f.password, f.role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserForm> }) => api.updateUser(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); closeModal(); },
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => api.updateUserRole(id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setRoleChangeId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setDeleteTarget(null); },
  });

  function openAdd() {
    setForm(emptyForm);
    setShowPwd(false);
    setModal("add");
  }

  function openEdit(u: UserRow) {
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setShowPwd(false);
    setModal(u);
  }

  function closeModal() { setModal(null); setShowPwd(false); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modal === "add") {
      createMut.mutate(form);
    } else if (modal && typeof modal === "object") {
      const data: Partial<UserForm> = {};
      if (form.name !== modal.name)       data.name     = form.name;
      if (form.email !== modal.email)     data.email    = form.email;
      if (form.role  !== modal.role)      data.role     = form.role;
      if (form.password.trim())           data.password = form.password.trim();
      updateMut.mutate({ id: modal.id, data });
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const isEditing = modal !== null && typeof modal === "object";

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Nhân viên</h2>
          <p className="text-gray-500 mt-1 text-sm">{users.length} tài khoản</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus size={17} /> Thêm nhân viên
        </button>
      </div>

      {/* Phân quyền info */}
      <div className="flex gap-4 mb-5 text-xs">
        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
          <Shield size={13} className="text-purple-600" />
          <div>
            <span className="font-semibold text-purple-800">Admin</span>
            <span className="text-purple-600 ml-1">— thấy tất cả leads, báo cáo, quản lý hệ thống</span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <User size={13} className="text-blue-600" />
          <div>
            <span className="font-semibold text-blue-800">Nhân viên</span>
            <span className="text-blue-600 ml-1">— chỉ thấy leads được assign cho mình</span>
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-left px-5 py-3 font-medium">Nhân viên</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Quyền hạn</th>
                <th className="text-left px-4 py-3 font-medium">Ngày tạo</th>
                <th className="px-4 py-3 w-24 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u: UserRow) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    {/* Name + avatar */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${u.role==="admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {u.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                          {isMe && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Bạn</span>}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3.5 text-gray-600">{u.email}</td>

                    {/* Role — click để đổi nhanh */}
                    <td className="px-4 py-3.5">
                      {isMe ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${u.role==="admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {u.role==="admin" ? <><Shield size={10}/> Admin</> : <><User size={10}/> Nhân viên</>}
                        </span>
                      ) : (
                        <button
                          onClick={() => { setRoleChangeId(u.id === roleChangeId ? null : u.id); }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold hover:ring-2 ring-offset-1 transition-all ${u.role==="admin" ? "bg-purple-100 text-purple-700 ring-purple-300" : "bg-blue-100 text-blue-700 ring-blue-300"}`}
                          title="Click để đổi quyền">
                          {u.role==="admin" ? <><Shield size={10}/> Admin ▾</> : <><User size={10}/> Nhân viên ▾</>}
                        </button>
                      )}
                      {/* Role picker popover */}
                      {roleChangeId === u.id && (
                        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-40">
                          {["staff","admin"].map(r => (
                            <button key={r}
                              onClick={() => { roleMut.mutate({ id: u.id, role: r }); }}
                              disabled={roleMut.isPending}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${u.role===r ? "bg-gray-100 text-gray-400" : "hover:bg-gray-50 text-gray-700"}`}>
                              {r==="admin" ? <><Shield size={11} className="text-purple-600"/> Admin</> : <><User size={11} className="text-blue-600"/> Nhân viên</>}
                              {u.role===r && <Check size={11} className="ml-auto text-gray-400"/>}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3.5 text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString("vi-VN")}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(u)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                          <Pencil size={12} /> Sửa
                        </button>
                        {!isMe && (
                          <button onClick={() => setDeleteTarget(u)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 size={12} /> Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">
                {isEditing ? `Sửa thông tin — ${(modal as UserRow).name}` : "Thêm nhân viên mới"}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18}/></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên nhân viên *</label>
                <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  placeholder="Nguyễn Thị A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email đăng nhập *</label>
                <input type="email" required value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  placeholder="nhanvien@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu {isEditing ? "(để trống = giữ nguyên)" : "*"}
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    required={!isEditing}
                    minLength={isEditing ? 0 : 6}
                    value={form.password}
                    onChange={e => setForm(f => ({...f, password: e.target.value}))}
                    placeholder={isEditing ? "Nhập mới nếu muốn đổi mật khẩu" : "Tối thiểu 6 ký tự"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quyền hạn</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v:"staff", icon:<User size={14}/>, label:"Nhân viên", desc:"Chỉ thấy leads của mình" },
                    { v:"admin", icon:<Shield size={14}/>, label:"Admin", desc:"Toàn quyền hệ thống" },
                  ].map(r => (
                    <button key={r.v} type="button"
                      onClick={() => setForm(f => ({...f, role: r.v}))}
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl border-2 text-left transition-all ${form.role===r.v ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className={`flex items-center gap-1.5 text-sm font-semibold ${form.role===r.v ? "text-blue-700" : "text-gray-700"}`}>
                        {r.icon}{r.label}
                      </div>
                      <span className="text-xs text-gray-400">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Errors */}
              {(createMut.error || updateMut.error) && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {(createMut.error || updateMut.error)?.message}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button type="submit" disabled={isPending}
                  className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {isPending ? "Đang lưu..." : isEditing ? "Cập nhật" : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-1">Xóa tài khoản?</h3>
            <p className="text-gray-600 text-sm mb-1">
              Bạn đang xóa tài khoản của <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
            </p>
            <p className="text-gray-400 text-xs mb-6">
              Nhân viên này sẽ không thể đăng nhập. Leads đang phụ trách vẫn giữ nguyên.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">Hủy</button>
              <button onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}
                className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                {deleteMut.isPending ? "Đang xóa..." : `Xóa ${deleteTarget.name}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
