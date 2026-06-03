import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, TrendingUp, DollarSign, Trophy,
  Bell, CheckCircle, Inbox, ArrowRight, UserCheck,
  PhoneCall, Kanban,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { GroupBadge } from "../components/GroupBadge";
import type { Customer } from "../lib/types";

function fmtMoney(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + "K";
  return v.toLocaleString("vi-VN");
}
function isOverdue(d: string) {
  return new Date(d) < new Date(new Date().toDateString());
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon size={18} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Follow-up list ───────────────────────────────────────────────────────────
function FollowUpList({ followUps, onClear }: {
  followUps: Customer[];
  onClear: (id: number) => void;
}) {
  if (followUps.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={16} className="text-amber-600" />
        <span className="font-semibold text-amber-900 text-sm">
          {followUps.length} khách cần follow-up hôm nay
        </span>
        <Link to="/pipeline" className="ml-auto text-xs text-amber-700 hover:underline flex items-center gap-1">
          Mở Pipeline <ArrowRight size={12} />
        </Link>
      </div>
      <div className="space-y-2">
        {followUps.slice(0, 6).map(c => (
          <div key={c.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 shadow-sm">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue(c.follow_up_at!) ? "bg-red-500" : "bg-amber-400"}`} />
            <Link to={`/customers/${c.id}`} className="flex-1 min-w-0 hover:text-blue-600">
              <p className="text-sm font-medium text-gray-900 truncate">
                {isOverdue(c.follow_up_at!) && <span className="text-red-500">⚠️ </span>}
                {c.name}
                <span className="text-xs text-gray-400 ml-2 font-normal">
                  {new Date(c.follow_up_at!).toLocaleDateString("vi-VN")}
                </span>
              </p>
              {c.follow_up_note && <p className="text-xs text-gray-500 truncate">{c.follow_up_note}</p>}
            </Link>
            <GroupBadge customer={c} />
            <button
              onClick={() => onClear(c.id)}
              title="Đánh dấu đã follow"
              className="p-1 text-gray-300 hover:text-green-600 flex-shrink-0 transition-colors"
            >
              <CheckCircle size={16} />
            </button>
          </div>
        ))}
        {followUps.length > 6 && (
          <Link to="/customers" className="text-xs text-amber-700 hover:underline block mt-1">
            Xem thêm {followUps.length - 6} khách →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Staff Dashboard ──────────────────────────────────────────────────────────
function StaffDashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn:  () => api.getStats(),
  });

  const clearFollowUp = useMutation({
    mutationFn: (id: number) =>
      api.updateCustomer(id, { follow_up_at: null, follow_up_note: null } as Partial<Customer>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Đang tải...</div>;

  const followUps  = stats?.followUps  ?? [];
  const myLeads    = stats?.myLeads    ?? 0;
  const unassigned = stats?.unassigned ?? 0;
  const won        = stats?.won        ?? 0;

  return (
    <div className="p-8 max-w-3xl">
      {/* Greeting */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Xin chào, {user?.name} 👋</h2>
        <p className="text-gray-500 text-sm mt-1">Đây là tổng quan công việc của bạn hôm nay</p>
      </div>

      {/* Inbox alert — leads mới chưa ai nhận */}
      {unassigned > 0 && (
        <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
              <Inbox size={20} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-blue-900 text-base">
                {unassigned} lead mới chưa có người nhận
              </p>
              <p className="text-blue-700 text-sm mt-0.5">
                Vào Pipeline → cột "Chưa phân nhóm" → nhấn <strong>Nhận lead</strong> để bắt đầu CSKH
              </p>
            </div>
            <button
              onClick={() => navigate("/pipeline")}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <Kanban size={15} /> Vào Pipeline
            </button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Leads của tôi"
          value={myLeads}
          icon={UserCheck}
          color="text-blue-600 bg-blue-50"
          sub="đang phụ trách"
        />
        <StatCard
          label="Follow-up hôm nay"
          value={followUps.length}
          icon={Bell}
          color={followUps.length > 0 ? "text-amber-600 bg-amber-50" : "text-gray-400 bg-gray-50"}
          sub={followUps.length > 0 ? "cần xử lý ngay" : "không có"}
        />
        <StatCard
          label="Đã chốt"
          value={won}
          icon={Trophy}
          color="text-emerald-600 bg-emerald-50"
          sub="toàn hệ thống"
        />
      </div>

      {/* Follow-up list */}
      <FollowUpList followUps={followUps} onClear={id => clearFollowUp.mutate(id)} />

      {/* Hướng dẫn sử dụng */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 text-sm">📋 Quy trình CSKH</h3>
        <div className="space-y-3">
          {[
            { step: "1", icon: <Inbox size={15} />, title: "Nhận lead được phân công",
              desc: 'Admin phân công lead cho bạn. Vào Pipeline hoặc Leads để xem đúng các khách đang thuộc trách nhiệm của mình.', color: "bg-blue-100 text-blue-700" },
            { step: "2", icon: <PhoneCall size={15} />, title: "Liên hệ & ghi chú",
              desc: "Vào chi tiết lead → ghi lại kết quả: Gọi bắt máy / Không bắt / Nhắn Zalo. Mọi hoạt động đều được log.", color: "bg-purple-100 text-purple-700" },
            { step: "3", icon: <Kanban size={15} />, title: "Chuyển giai đoạn cơ hội",
              desc: "Kéo card trên Pipeline hoặc click badge → chuyển: Đang tiếp cận → Đang tư vấn → Đã chốt.", color: "bg-amber-100 text-amber-700" },
            { step: "4", icon: <Bell size={15} />, title: "Đặt nhắc follow-up",
              desc: "Vào chi tiết khách → Đặt ngày nhắc. Dashboard sẽ hiện cảnh báo khi đến ngày cần gọi lại.", color: "bg-green-100 text-green-700" },
          ].map(s => (
            <div key={s.step} className="flex gap-3 items-start">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${s.color}`}>
                {s.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn:  () => api.getStats(),
  });

  const clearFollowUp = useMutation({
    mutationFn: (id: number) =>
      api.updateCustomer(id, { follow_up_at: null, follow_up_note: null } as Partial<Customer>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Đang tải...</div>;

  const byGroup    = stats?.byGroup ?? [];
  const followUps  = stats?.followUps ?? [];
  const total      = stats?.total ?? 0;
  const unassigned = stats?.unassigned ?? 0;

  return (
    <div className="p-8">
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-gray-900">Xin chào, {user?.name} 👋</h2>
        <p className="text-gray-500 text-sm mt-1">Tổng quan hệ thống CRM</p>
      </div>

      {/* Follow-up alerts */}
      <FollowUpList followUps={followUps} onClear={id => clearFollowUp.mutate(id)} />

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label="Tổng leads"         value={total}            icon={Users}      color="text-blue-600 bg-blue-50" />
        <StatCard label="Chưa được nhận"     value={unassigned}       icon={Inbox}      color={unassigned > 0 ? "text-orange-600 bg-orange-50" : "text-gray-400 bg-gray-50"} sub="chưa assign cho ai" />
        <StatCard label="Đã chốt"            value={stats?.won ?? 0}  icon={Trophy}     color="text-emerald-600 bg-emerald-50" />
        <StatCard label="Doanh thu"          value={fmtMoney(stats?.revenue ?? 0) + "đ"} icon={DollarSign} color="text-purple-600 bg-purple-50" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Pipeline by group */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Phân bổ theo nhóm</h3>
            <Link to="/pipeline" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Pipeline <ArrowRight size={12} />
            </Link>
          </div>
          {byGroup.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">
              Chưa có nhóm nào.{" "}
              <Link to="/groups" className="text-blue-600 hover:underline">Tạo nhóm ngay</Link>
            </p>
          ) : (
            <div className="space-y-2.5">
              {/* Dòng "Chưa phân nhóm" */}
              {unassigned > 0 && (
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      Chưa phân nhóm
                    </span>
                    <span className="font-semibold text-orange-600">{unassigned}</span>
                  </div>
                </div>
              )}
              {byGroup.map(g => {
                const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
                return (
                  <div key={g.id}>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-gray-700 font-medium">{g.name}</span>
                        {g.is_won === 1 && <span className="text-emerald-600">✓</span>}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {g.count} <span className="text-gray-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent leads */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Leads mới nhất</h3>
            <Link to="/customers" className="text-xs text-blue-600 hover:underline">Xem tất cả</Link>
          </div>
          {(stats?.recentCustomers?.length ?? 0) === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Chưa có lead nào</p>
          ) : (
            <div className="space-y-1">
              {stats?.recentCustomers.map(c => (
                <Link key={c.id} to={`/customers/${c.id}`}
                  className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.product_name ?? c.source ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <GroupBadge customer={c} />
                    {!c.assigned_user_id && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">
                        Chưa nhận
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monthly trend chip */}
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
        <TrendingUp size={15} className="text-green-500" />
        <span><strong className="text-gray-900">{stats?.monthly ?? 0}</strong> leads mới trong 30 ngày qua</span>
        <span className="mx-2">·</span>
        <Link to="/reports" className="text-blue-600 hover:underline text-xs">Xem báo cáo chi tiết →</Link>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <StaffDashboard />;
}
