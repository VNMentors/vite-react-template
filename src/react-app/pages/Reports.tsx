import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign, Trophy, Award } from "lucide-react";
import { api } from "../lib/api";

function fmtMoney(v: number, short = false) {
  if (short) {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return String(v);
  }
  return v.toLocaleString("vi-VN") + "đ";
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return `T${parseInt(mo)}/${y.slice(2)}`;
}

export default function Reports() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.getReports(),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Đang tải...</div>;
  }

  const s = data?.summary;
  const maxLeads = Math.max(...(data?.monthlyTrend.map(m => m.leads) ?? [1]), 1);
  const maxSrcLeads = Math.max(...(data?.bySource.map(r => r.leads) ?? [1]), 1);

  return (
    <div className="p-8">
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-gray-900">Báo cáo</h2>
        <p className="text-gray-500 text-sm mt-1">Hiệu quả kinh doanh tổng hợp</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Tổng leads",   value: s?.total_leads ?? 0,   icon: Users,    color: "text-blue-600 bg-blue-50",    fmt: String },
          { label: "Đã chốt",      value: s?.total_won ?? 0,     icon: Trophy,   color: "text-green-600 bg-green-50",  fmt: String },
          { label: "Doanh thu",    value: s?.total_revenue ?? 0, icon: DollarSign,color:"text-emerald-600 bg-emerald-50",fmt:(v:number)=>fmtMoney(v,true)+"đ" },
          { label: "Tỷ lệ chốt",  value: s?.conversion_rate??0, icon: TrendingUp,color:"text-purple-600 bg-purple-50", fmt:(v:number)=>`${v}%` },
        ].map(({ label, value, icon: Icon, color, fmt }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon size={20} />
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-0.5">{fmt(value)}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Group funnel — dynamic */}
      {(data?.byGroup.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-5 text-sm">Phân bổ theo nhóm</h3>
          <div className="flex items-end gap-2 justify-center mb-4">
            {data?.byGroup.map(g => {
              const maxCount = Math.max(...(data.byGroup.map(x => x.leads)), 1);
              const pct = Math.max(12, Math.round((g.leads / maxCount) * 100));
              return (
                <div key={g.id} className="flex flex-col items-center gap-2 flex-1">
                  <span className="text-base font-bold text-gray-900">{g.leads}</span>
                  <div className="w-full rounded-lg" style={{ height: `${pct}px`, backgroundColor: g.color, minHeight: "20px" }} />
                  <span className="text-xs text-gray-500 text-center leading-tight">{g.name}</span>
                  {g.is_won === 1 && (
                    <span className="text-xs text-green-600 font-medium">{fmtMoney(g.revenue, true)}đ</span>
                  )}
                </div>
              );
            })}
          </div>
          {s && s.total_leads > 0 && (
            <p className="text-center text-sm text-gray-500">
              Tỷ lệ chốt:{" "}
              <span className="font-bold text-green-700 text-lg">{s.conversion_rate}%</span>
              {" "}({s.total_won}/{s.total_leads})
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Monthly trend */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-5 text-sm">Xu hướng theo tháng</h3>
          {(data?.monthlyTrend.length ?? 0) === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-4">
              {data?.monthlyTrend.map(m => (
                <div key={m.month}>
                  <div className="flex justify-between items-baseline mb-1.5 text-xs">
                    <span className="font-semibold text-gray-700 w-12">{fmtMonth(m.month)}</span>
                    <div className="flex gap-5">
                      <span className="text-blue-600">{m.leads} leads</span>
                      <span className="text-green-600">{m.won} chốt</span>
                      <span className="text-emerald-700 font-semibold">{fmtMoney(m.revenue, true)}đ</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12 text-right">leads</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((m.leads / maxLeads) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-6 text-right">{m.leads}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400 w-12 text-right">chốt</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full" style={{ width: `${m.leads > 0 ? Math.round((m.won / m.leads) * 100) : 0}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-6 text-right">{m.won}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By source */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-5 text-sm">Theo nguồn</h3>
          {(data?.bySource.length ?? 0) === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {data?.bySource.map((row, i) => {
                const total = s?.total_leads ?? 0;
                const pct = total > 0 ? Math.round((row.leads / total) * 100) : 0;
                const colors = ["bg-blue-500","bg-purple-500","bg-orange-400","bg-pink-400","bg-teal-400","bg-gray-400"];
                return (
                  <div key={row.source}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium truncate">{row.source}</span>
                      <span className="text-gray-500 flex-shrink-0 ml-1">{row.leads} <span className="text-gray-400">({pct}%)</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${colors[i % colors.length]} rounded-full`} style={{ width: `${Math.round((row.leads / maxSrcLeads) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-green-600 w-8 text-right flex-shrink-0">{row.won}✓</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Staff leaderboard */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm flex items-center gap-2">
            <Award size={15} className="text-yellow-500" /> Hiệu quả sale
          </h3>
          {(data?.byStaff.length ?? 0) === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {data?.byStaff.map((row, i) => {
                const cr = row.leads > 0 ? Math.round((row.won / row.leads) * 100) : 0;
                return (
                  <div key={row.staff}
                    className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50"}`}>
                    <span className="text-sm w-7 text-center">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </span>
                    <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {row.staff[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{row.staff}</p>
                      <p className="text-xs text-gray-500">{row.leads} leads · {row.won} chốt · {cr}% CR</p>
                    </div>
                    <p className="text-sm font-bold text-green-700 flex-shrink-0">{fmtMoney(row.revenue, true)}đ</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By product */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Theo sản phẩm</h3>
          {(data?.byProduct.length ?? 0) === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {data?.byProduct.map(row => {
                const cr = row.leads > 0 ? Math.round((row.won / row.leads) * 100) : 0;
                return (
                  <div key={row.product_name} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-semibold text-gray-900">{row.product_name}</span>
                      <span className="text-sm font-bold text-green-700">{fmtMoney(row.revenue, true)}đ</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{row.leads} leads</span>
                      <span className="text-green-600 font-medium">{row.won} chốt</span>
                      <span className={`font-semibold ${cr >= 20 ? "text-green-600" : cr >= 10 ? "text-yellow-600" : "text-red-500"}`}>
                        {cr}% CR
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${cr}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
