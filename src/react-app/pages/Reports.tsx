import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Calendar, TrendingUp, Users, DollarSign, Target, Phone, MessageSquare, Handshake } from "lucide-react";
import { api } from "../lib/api";

function fmtM(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return Math.round(v / 1_000) + "K";
  return String(v);
}
function fmtFull(v: number) { return v.toLocaleString("vi-VN") + "đ"; }
function fmtMonth(m: string) { const [y,mo] = m.split("-"); return `T${parseInt(mo)}/${y.slice(2)}`; }

type Preset = "this_month"|"last_month"|"quarter"|"year"|"all";
function getRange(p: Preset) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2,"0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  switch(p) {
    case "this_month": return { from:`${y}-${pad(m+1)}-01`, to:iso(new Date(y,m+1,0)), label:`Tháng ${m+1}/${y}` };
    case "last_month": { const lm=m===0?12:m, ly=m===0?y-1:y; return { from:`${ly}-${pad(lm)}-01`, to:iso(new Date(ly,lm,0)), label:`Tháng ${lm}/${ly}` }; }
    case "quarter": { const q=Math.floor(m/3)*3; return { from:`${y}-${pad(q+1)}-01`, to:iso(new Date(y,q+3,0)), label:`Q${Math.floor(m/3)+1}/${y}` }; }
    case "year": return { from:`${y}-01-01`, to:`${y}-12-31`, label:`Năm ${y}` };
    default: return { from:undefined, to:undefined, label:"Tất cả thời gian" };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key:"this_month", label:"Tháng này" },
  { key:"last_month", label:"Tháng trước" },
  { key:"quarter",    label:"Quý này" },
  { key:"year",       label:"Năm này" },
  { key:"all",        label:"Tất cả" },
];

type Tab = "overview"|"staff"|"products"|"trend";

export default function Reports() {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setFrom] = useState("");
  const [customTo, setTo]     = useState("");
  const [useCustom, setCustom] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const { from, to, label } = useCustom
    ? { from: customFrom||undefined, to: customTo||undefined, label:"Tùy chọn" }
    : getRange(preset);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => api.getReports({ from, to }),
    staleTime: 1000*60*2,
  });

  const s = data?.summary;
  const total = s?.total_leads ?? 0;
  const won   = s?.total_won   ?? 0;
  const rev   = s?.total_revenue ?? 0;
  const cr    = s?.conversion_rate ?? 0;

  const TABS: { key: Tab; label: string }[] = [
    { key:"overview", label:"Tổng quan" },
    { key:"staff",    label:"Nhân viên" },
    { key:"products", label:"Sản phẩm & Nguồn" },
    { key:"trend",    label:"Xu hướng" },
  ];

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Báo cáo</h2>
          <p className="text-gray-500 text-sm mt-0.5">{label}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
            {PRESETS.map(p => (
              <button key={p.key}
                onClick={() => { setPreset(p.key); setCustom(false); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!useCustom && preset===p.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => setCustom(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${useCustom ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
            <Calendar size={12} /> Tùy chọn
          </button>
          {useCustom && (
            <>
              <input type="date" value={customFrom} onChange={e => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-gray-400 text-xs">→</span>
              <input type="date" value={customTo} onChange={e => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Đang tải...</div>
      ) : (
        <>
          {/* ── Tab 1: Tổng quan ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <KpiCard icon={<Users size={18}/>} color="blue" label="Tổng leads" value={String(total)} sub="trong kỳ đã chọn" />
                <KpiCard icon={<Target size={18}/>} color="green" label="Đã chốt" value={String(won)} sub={`tỷ lệ ${cr}%`} highlight={cr>=20} />
                <KpiCard icon={<DollarSign size={18}/>} color="emerald" label="Doanh thu" value={fmtM(rev)+"đ"} sub={won>0 ? `TB ${fmtM(Math.round(rev/won))}đ/deal` : "—"} />
                <KpiCard icon={<TrendingUp size={18}/>} color="purple" label="Conversion rate" value={`${cr}%`}
                  sub={cr>=20 ? "🟢 Tốt" : cr>=10 ? "🟡 Trung bình" : "🔴 Cần cải thiện"} />
              </div>

              {/* Revenue breakdown */}
              {(s?.revenue_lms ?? 0) > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-6 flex-wrap">
                  <span className="text-sm text-gray-500">Doanh thu:</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-sm">Khóa học / App</span>
                    <span className="font-bold text-gray-900">{fmtFull(s?.revenue_990??0)}</span>
                  </div>
                  <span className="text-gray-300">+</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-sm">LMS ({s?.lms_client_count??0} clients)</span>
                    <span className="font-bold text-gray-900">{fmtFull(s?.revenue_lms??0)}</span>
                  </div>
                  <span className="ml-auto font-bold text-lg text-gray-900">{fmtFull(rev)}</span>
                </div>
              )}

              {/* Pipeline funnel */}
              {(data?.byGroup.length ?? 0) > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="font-semibold text-gray-900 mb-1">Pipeline — leads đang ở giai đoạn nào?</h3>
                  <p className="text-xs text-gray-400 mb-5">Flow từ trái sang phải · số to = nhiều leads đang ở đây</p>
                  <div className="flex items-stretch gap-1.5">
                    <FunnelBox label="Chưa có cơ hội" count={Math.max(0, total-(data?.byGroup.reduce((s,g)=>s+g.leads,0)??0))} color="#9ca3af" total={total} />
                    {data?.byGroup.map((g, i) => (
                      <FunnelBox key={g.id} label={g.name} count={g.leads} color={g.color} total={total}
                        isWon={g.is_won===1} revenue={g.is_won ? g.revenue : undefined}
                        isLast={i===data.byGroup.length-1} />
                    ))}
                  </div>
                  {total>0 && won>0 && (
                    <p className="text-center text-xs text-gray-400 mt-4">
                      {total} leads vào → {won} chốt thành công ({cr}% conversion rate)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: Nhân viên ── */}
          {tab === "staff" && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                <strong>Hiệu quả sale</strong> = doanh thu + số deal chốt + tỷ lệ CR &nbsp;|&nbsp;
                <strong>Hoạt động</strong> = số cuộc gọi + ghi chú + gặp mặt nhân viên thực hiện trong kỳ này
              </div>

              {/* Combined table: business result + activity */}
              {(data?.byStaff.filter(r => r.staff !== "Chưa phân").length ?? 0) === 0 ? (
                <p className="text-gray-400 text-sm text-center py-12">Chưa có dữ liệu nhân viên</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                        <th className="text-left px-4 py-3 font-medium">Nhân viên</th>
                        <th className="text-center px-3 py-3 font-medium">Leads</th>
                        <th className="text-center px-3 py-3 font-medium">Đã chốt</th>
                        <th className="text-center px-3 py-3 font-medium">CR%</th>
                        <th className="text-right px-3 py-3 font-medium">Doanh thu</th>
                        <th className="text-center px-3 py-3 font-medium border-l border-gray-100">
                          <span className="flex items-center gap-1 justify-center"><Phone size={11}/> Gọi</span>
                        </th>
                        <th className="text-center px-3 py-3 font-medium">
                          <span className="flex items-center gap-1 justify-center"><MessageSquare size={11}/> Note</span>
                        </th>
                        <th className="text-center px-3 py-3 font-medium">
                          <span className="flex items-center gap-1 justify-center"><Handshake size={11}/> Gặp</span>
                        </th>
                        <th className="text-center px-3 py-3 font-medium">Tổng HĐ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data?.byStaff
                        .filter(r => r.staff !== "Chưa phân")
                        .map((row, i) => {
                          const cr2 = row.leads>0 ? Math.round((row.won/row.leads)*100) : 0;
                          const act = data.staffActivity?.find(a => a.staff === row.staff);
                          const medals = ["🥇","🥈","🥉"];
                          return (
                            <tr key={row.staff} className={i===0 ? "bg-yellow-50" : "hover:bg-gray-50"}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{medals[i] ?? ""}</span>
                                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                                    {row.staff[0]?.toUpperCase()}
                                  </div>
                                  <span className="font-medium text-gray-900">{row.staff}</span>
                                </div>
                              </td>
                              <td className="text-center px-3 py-3 text-gray-600">{row.leads}</td>
                              <td className="text-center px-3 py-3 font-semibold text-green-700">{row.won}</td>
                              <td className="text-center px-3 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cr2>=20?"bg-green-100 text-green-700":cr2>=10?"bg-amber-100 text-amber-700":"bg-gray-100 text-gray-500"}`}>
                                  {cr2}%
                                </span>
                              </td>
                              <td className="text-right px-3 py-3 font-bold text-gray-900">{fmtM(row.revenue)}đ</td>
                              <td className="text-center px-3 py-3 border-l border-gray-100 text-blue-600 font-medium">{act?.calls ?? 0}</td>
                              <td className="text-center px-3 py-3 text-gray-500">{(act?.total_activities??0) - (act?.calls??0) - (act?.meetings??0) - (act?.emails??0)}</td>
                              <td className="text-center px-3 py-3 text-purple-600 font-medium">{act?.meetings ?? 0}</td>
                              <td className="text-center px-3 py-3 font-bold text-gray-900">{act?.total_activities ?? 0}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Leads chưa phân công */}
              {(() => {
                const unassigned = data?.byStaff.find(r => r.staff === "Chưa phân");
                return unassigned && unassigned.leads > 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-orange-800">
                      <strong>{unassigned.leads}</strong> leads chưa được phân công cho ai
                    </span>
                    <Link to="/customers" className="text-xs text-orange-700 font-medium hover:underline">
                      Phân công ngay →
                    </Link>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* ── Tab 3: Sản phẩm & Nguồn ── */}
          {tab === "products" && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Theo sản phẩm</h3>
                <p className="text-xs text-gray-400 mb-4">Sản phẩm nào có nhiều leads & doanh thu nhất</p>
                <div className="space-y-3">
                  {data?.byProduct.filter(r => r.product_name !== "Chưa chọn SP").sort((a,b) => b.revenue-a.revenue).map(row => {
                    const cr3 = row.leads>0 ? Math.round((row.won/row.leads)*100) : 0;
                    const maxRev = Math.max(...(data.byProduct.map(r=>r.revenue)), 1);
                    return (
                      <div key={row.product_name} className="p-3 bg-gray-50 rounded-xl">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-semibold text-gray-900">{row.product_name}</span>
                          <span className="text-sm font-bold text-green-700">{fmtM(row.revenue)}đ</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full mb-1.5">
                          <div className="h-full bg-green-400 rounded-full" style={{ width:`${Math.round((row.revenue/maxRev)*100)}%` }} />
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>{row.leads} leads</span>
                          <span className="text-green-600 font-medium">{row.won} chốt</span>
                          <span className={`font-semibold ${cr3>=20?"text-green-600":cr3>=10?"text-amber-600":"text-gray-400"}`}>CR {cr3}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Theo nguồn</h3>
                <p className="text-xs text-gray-400 mb-4">Kênh nào mang lại leads chất lượng nhất</p>
                <div className="space-y-3">
                  {data?.bySource.map((row, i) => {
                    const maxSrc = Math.max(...(data.bySource.map(r=>r.leads)), 1);
                    const srcCr = row.leads>0 ? Math.round((row.won/row.leads)*100) : 0;
                    const COLORS = ["bg-blue-500","bg-purple-500","bg-orange-400","bg-pink-400","bg-teal-400","bg-gray-400"];
                    return (
                      <div key={row.source}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700">{row.source}</span>
                          <span className="text-gray-400">{row.leads} leads · CR {srcCr}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div className={`h-full ${COLORS[i%COLORS.length]} rounded-full`} style={{ width:`${Math.round((row.leads/maxSrc)*100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 4: Xu hướng ── */}
          {tab === "trend" && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Xu hướng theo tháng</h3>
              <p className="text-xs text-gray-400 mb-6">Xanh = leads nhận · Xanh lá = leads chốt</p>
              {(data?.monthlyTrend.length ?? 0) === 0 ? (
                <p className="text-gray-400 text-center py-8">Chưa có dữ liệu</p>
              ) : (
                <div className="space-y-4">
                  {data?.monthlyTrend.map(m => {
                    const maxL = Math.max(...(data.monthlyTrend.map(x=>x.leads)), 1);
                    const crm = m.leads>0 ? Math.round((m.won/m.leads)*100) : 0;
                    return (
                      <div key={m.month} className="flex items-center gap-4">
                        <span className="text-xs font-bold text-gray-600 w-14">{fmtMonth(m.month)}</span>
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 text-xs text-gray-400 text-right">{m.leads} leads</div>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width:`${Math.round((m.leads/maxL)*100)}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 text-xs text-gray-400 text-right">{m.won} chốt</div>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-green-400 rounded-full" style={{ width:`${m.leads>0 ? Math.round((m.won/m.leads)*100) : 0}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="text-right w-28 flex-shrink-0">
                          <div className="text-sm font-bold text-green-700">{fmtM(m.revenue)}đ</div>
                          <div className="text-xs text-gray-400">CR {crm}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────
function KpiCard({ icon, color, label, value, sub, highlight }: {
  icon: React.ReactNode; color: string; label: string; value: string; sub: string; highlight?: boolean;
}) {
  const map: Record<string,string> = { blue:"text-blue-600 bg-blue-50", green:"text-green-600 bg-green-50", emerald:"text-emerald-600 bg-emerald-50", purple:"text-purple-600 bg-purple-50" };
  return (
    <div className={`bg-white rounded-xl border p-5 ${highlight ? "border-green-300" : "border-gray-200"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${map[color]}`}>{icon}</div>
      <div className="text-2xl font-bold text-gray-900 mb-0.5">{value}</div>
      <div className="text-xs font-medium text-gray-600">{label}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

function FunnelBox({ label, count, color, total, isWon, revenue, isLast }: {
  label: string; count: number; color: string;
  total: number; isWon?: boolean; revenue?: number; isLast?: boolean;
}) {
  const pct = total > 0 ? Math.round((count/total)*100) : 0;
  const h = Math.max(48, Math.round((count/Math.max(total,1))*110) + 48);
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex-1 rounded-xl p-3 text-center"
        style={{ backgroundColor:color+"15", border:`2px solid ${color}35`, minHeight:`${h}px` }}>
        <div className="text-xl font-bold" style={{ color }}>{count}</div>
        <div className="text-xs font-medium text-gray-600 mt-0.5 leading-tight">{label}</div>
        <div className="text-xs text-gray-400">{pct}%</div>
        {isWon && revenue != null && revenue>0 && (
          <div className="text-xs font-semibold text-green-700 mt-1">
            {(revenue/1_000_000).toFixed(1)}M
          </div>
        )}
      </div>
      {!isLast && <div className="text-gray-300 flex-shrink-0 text-lg font-light">›</div>}
    </div>
  );
}
