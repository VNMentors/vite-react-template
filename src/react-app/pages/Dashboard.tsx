import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, TrendingUp, DollarSign, Trophy, Bell, CheckCircle } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { GroupBadge } from "../components/GroupBadge";
import type { Customer } from "../lib/types";

function fmtMoney(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return v.toLocaleString("vi-VN");
}

function isOverdue(d: string) {
  return new Date(d) < new Date(new Date().toDateString());
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
  });

  const clearFollowUp = useMutation({
    mutationFn: (id: number) =>
      api.updateCustomer(id, { follow_up_at: null, follow_up_note: null } as Partial<Customer>),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stats"] }); qc.invalidateQueries({ queryKey: ["customers"] }); },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Đang tải...</div>;
  }

  const byGroup = stats?.byGroup ?? [];
  const followUps = stats?.followUps ?? [];
  const total = stats?.total ?? 0;

  return (
    <div className="p-8">
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-gray-900">Xin chào, {user?.name} 👋</h2>
        <p className="text-gray-500 text-sm mt-1">Tổng quan hệ thống CRM</p>
      </div>

      {/* Follow-up alerts */}
      {followUps.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={17} className="text-amber-600" />
            <span className="font-semibold text-amber-900 text-sm">
              {followUps.length} khách cần follow-up hôm nay
            </span>
          </div>
          <div className="space-y-2">
            {followUps.slice(0, 5).map(c => (
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
                <button onClick={() => clearFollowUp.mutate(c.id)} title="Đã follow"
                  className="p-1 text-gray-300 hover:text-green-600 flex-shrink-0 transition-colors">
                  <CheckCircle size={16} />
                </button>
              </div>
            ))}
            {followUps.length > 5 && (
              <Link to="/customers?follow_up_today=1" className="text-xs text-amber-700 hover:underline block mt-1">
                Xem tất cả {followUps.length} →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        {[
          { label: "Tổng leads",       value: total,             icon: Users,    color: "text-blue-600 bg-blue-50",    fmt: String },
          { label: "Leads mới 30 ngày",value: stats?.monthly??0, icon: TrendingUp,color:"text-green-600 bg-green-50",  fmt: String },
          { label: "Đã chốt",          value: stats?.won??0,     icon: Trophy,   color: "text-emerald-600 bg-emerald-50", fmt: String },
          { label: "Doanh thu",        value: stats?.revenue??0, icon: DollarSign,color:"text-purple-600 bg-purple-50",fmt: (v:number) => fmtMoney(v)+"đ" },
        ].map(({ label, value, icon: Icon, color, fmt }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon size={18} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmt(value)}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Dynamic group pipeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Phân bổ theo nhóm</h3>
          {byGroup.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">
              Chưa có nhóm nào.{" "}
              <Link to="/groups" className="text-blue-600 hover:underline">Tạo nhóm ngay</Link>
            </p>
          ) : (
            <div className="space-y-2.5">
              {byGroup.map(g => {
                const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
                return (
                  <div key={g.id}>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-gray-700 font-medium">{g.name}</span>
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

        {/* Recent customers */}
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
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.product_name ?? c.source ?? "—"}</p>
                  </div>
                  <GroupBadge customer={c} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
