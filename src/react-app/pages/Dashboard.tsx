import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, TrendingUp, UserCheck, UserX } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { StatusBadge } from "../components/StatusBadge";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Đang tải...
      </div>
    );
  }

  const statCards = [
    {
      label: "Tổng khách hàng",
      value: stats?.total ?? 0,
      icon: Users,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Khách mới (30 ngày)",
      value: stats?.monthly ?? 0,
      icon: TrendingUp,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Đang hoạt động",
      value: stats?.active ?? 0,
      icon: UserCheck,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Không hoạt động",
      value: stats?.inactive ?? 0,
      icon: UserX,
      color: "text-gray-500 bg-gray-100",
    },
  ];

  const pipeline = [
    { label: "Lead", key: "lead" as const, color: "bg-yellow-400" },
    { label: "Prospect", key: "prospect" as const, color: "bg-blue-400" },
    { label: "Active", key: "active" as const, color: "bg-green-400" },
    { label: "Inactive", key: "inactive" as const, color: "bg-gray-300" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Xin chào, {user?.name} 👋
        </h2>
        <p className="text-gray-500 mt-1">Tổng quan hệ thống CRM</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-6">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${color}`}
            >
              <Icon size={20} />
            </div>
            <div className="text-3xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Pipeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-5">Phễu bán hàng</h3>
          <div className="space-y-4">
            {pipeline.map(({ label, key, color }) => {
              const val = stats?.[key] ?? 0;
              const total = stats?.total ?? 0;
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-medium text-gray-900">
                      {val}{" "}
                      <span className="text-gray-400 font-normal">
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent customers */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">Khách hàng mới nhất</h3>
            <Link
              to="/customers"
              className="text-sm text-blue-600 hover:underline"
            >
              Xem tất cả
            </Link>
          </div>
          {(stats?.recentCustomers?.length ?? 0) === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">Chưa có khách hàng nào</p>
              <Link
                to="/customers"
                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
              >
                Thêm khách hàng đầu tiên
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {stats?.recentCustomers?.map((c) => (
                <Link
                  key={c.id}
                  to={`/customers/${c.id}`}
                  className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors"
                >
                  <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.company ?? c.email ?? "—"}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
