import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Phone, Calendar, MoreVertical,
  PhoneOff, PhoneCall, MessageSquare, CheckCircle, Clock,
  UserCheck, Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { Group, PipelineCustomer } from "../lib/types";

// ─── Quick-log actions ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: <PhoneCall   size={12} />, label: "Gọi – bắt máy",  content: "Đã gọi, khách bắt máy.",          type: "call", followUpDays: null },
  { icon: <PhoneOff    size={12} />, label: "Không bắt máy",  content: "Gọi điện nhưng không có ai bắt.", type: "call", followUpDays: 1    },
  { icon: <MessageSquare size={12}/>, label: "Nhắn Zalo",     content: "Đã nhắn tin Zalo.",               type: "note", followUpDays: null },
  { icon: <Clock       size={12} />, label: "Hẹn gọi lại",   content: "Khách hẹn gọi lại sau.",          type: "call", followUpDays: 1    },
  { icon: <CheckCircle size={12} />, label: "Đã chốt ✅",     content: "Khách đã đồng ý mua. ✅",         type: "note", followUpDays: null },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}
function isNew(dateStr: string) {
  return Date.now() - new Date(dateStr).getTime() < 24 * 3_600_000;
}
function daysAgo(dateStr: string | null) {
  if (!dateStr) return null;
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (d === 0) return "hôm nay";
  if (d === 1) return "1 ngày trước";
  return `${d} ngày trước`;
}
function noteIcon(type: string | null) {
  if (type === "call")    return <PhoneCall    size={10} className="text-blue-400" />;
  if (type === "email")   return <MessageSquare size={10} className="text-purple-400" />;
  if (type === "meeting") return <CheckCircle   size={10} className="text-green-400" />;
  return null;
}

// ─── CustomerCard ─────────────────────────────────────────────────────────────
type CardProps = {
  customer: PipelineCustomer;
  isDragging:    boolean;
  currentUserId: number;
  onDragStart:   (e: React.DragEvent) => void;
  onDragEnd:     () => void;
  onQuickAction: (content: string, type: string, followUpDays: number | null) => void;
  onClaim:       () => void;
};

function CustomerCard({
  customer: c, isDragging, currentUserId,
  onDragStart, onDragEnd, onQuickAction, onClaim,
}: CardProps) {
  const [open, setOpen]     = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const overdue   = isOverdue(c.follow_up_at);
  const ago       = daysAgo(c.last_note_at);
  const brandNew  = isNew(c.created_at);
  const unclaimed = !c.assigned_user_id;
  const mine      = c.assigned_user_id === currentUserId;

  function doAction(a: typeof QUICK_ACTIONS[0]) {
    onQuickAction(a.content, a.type, a.followUpDays);
    setLogged(a.label);
    setOpen(false);
    setTimeout(() => setLogged(null), 2500);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-xl border p-3 shadow-sm select-none transition-all
        hover:shadow-md cursor-grab active:cursor-grabbing
        ${isDragging ? "opacity-40 scale-95" : ""}
        ${brandNew ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}
      `}
    >
      {/* New badge */}
      {brandNew && (
        <div className="flex items-center gap-1 text-xs text-blue-600 font-semibold mb-1.5">
          <Sparkles size={11} /> MỚI
        </div>
      )}

      {/* Name + menu */}
      <div className="flex items-start justify-between gap-1.5">
        <Link
          to={`/customers/${c.id}`}
          onClick={e => e.stopPropagation()}
          className="font-semibold text-gray-900 text-sm hover:text-blue-600 leading-snug flex-1 min-w-0 truncate"
        >
          {c.name}
        </Link>

        <div className="relative flex-shrink-0 flex items-center gap-0.5" ref={ref}>
          {/* Claim button for unassigned */}
          {unclaimed && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={onClaim}
              title="Nhận lead này"
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              <UserCheck size={11} /> Nhận
            </button>
          )}

          {/* Quick log menu */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setOpen(v => !v)}
            className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <MoreVertical size={14} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-44">
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100">
                Ghi nhanh
              </div>
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.label}
                  onClick={() => doAction(a)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex-shrink-0 text-gray-400">{a.icon}</span>
                  {a.label}
                </button>
              ))}
              <div className="border-t border-gray-100 px-3 py-1.5">
                <Link
                  to={`/customers/${c.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Xem chi tiết →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logged toast */}
      {logged && (
        <p className="text-xs text-green-600 font-medium mt-1">✓ {logged}</p>
      )}

      {/* Phone */}
      {c.phone && (
        <a
          href={`tel:${c.phone}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 hover:text-blue-600 group"
        >
          <Phone size={11} className="flex-shrink-0" />
          <span className="group-hover:underline">{c.phone}</span>
        </a>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mt-2">
        {c.product_name && (
          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md font-medium border border-blue-100">
            {c.product_name}
          </span>
        )}
        {c.source && (
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">
            {c.source}
          </span>
        )}
        {mine && (
          <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-md font-medium border border-green-100">
            Của tôi
          </span>
        )}
        {!unclaimed && !mine && c.assigned_to && (
          <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md">
            {c.assigned_to}
          </span>
        )}
      </div>

      {/* Follow-up warning */}
      {c.follow_up_at && (
        <div className={`mt-2 flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-medium" : "text-amber-600"}`}>
          <Calendar size={10} />
          {overdue ? "⚠️ Quá hạn " : "Nhắc: "}
          {new Date(c.follow_up_at).toLocaleDateString("vi-VN")}
          {c.follow_up_note && (
            <span className="text-gray-400 truncate ml-1">· {c.follow_up_note}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(c.created_at).toLocaleDateString("vi-VN")}
        </span>
        {c.last_note_at && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            {noteIcon(c.last_note_type)}
            {ago}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────
type ViewMode = "all" | "mine" | "unassigned";

export default function Pipeline() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [draggedId, setDraggedId]   = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | "ungrouped" | null>(null);
  const [search, setSearch]         = useState("");
  const [view, setView]             = useState<ViewMode>("all");

  const { data: groups = [] } = useQuery<Group[]>({ queryKey: ["groups"], queryFn: () => api.getGroups(), staleTime: 1000 * 60 * 10 });
  const { data: allLeads = [], isLoading } = useQuery<PipelineCustomer[]>({
    queryKey: ["pipeline"],
    queryFn:  () => api.getPipeline(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Filter leads
  const filtered = allLeads.filter(c => {
    const matchSearch = !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search);
    const matchView =
      view === "all"        ? true :
      view === "mine"       ? c.assigned_user_id === (user?.id ?? -1) :
      /* unassigned */        !c.assigned_user_id;
    return matchSearch && matchView;
  });

  // Move mutation (optimistic)
  const moveMutation = useMutation({
    mutationFn: ({ id, groupId }: { id: number; groupId: number | null }) =>
      api.updateCustomer(id, { group_id: groupId } as Parameters<typeof api.updateCustomer>[1]),
    onMutate: async ({ id, groupId }) => {
      await qc.cancelQueries({ queryKey: ["pipeline"] });
      const prev = qc.getQueryData<PipelineCustomer[]>(["pipeline"]);
      qc.setQueryData<PipelineCustomer[]>(["pipeline"], old =>
        old?.map(c => c.id === id ? { ...c, group_id: groupId } : c) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["pipeline"], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  // Claim mutation (staff nhận lead)
  const claimMutation = useMutation({
    mutationFn: (id: number) =>
      api.updateCustomer(id, {
        assigned_user_id: user!.id,
        assigned_to: user!.name,
      } as Parameters<typeof api.updateCustomer>[1]),
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: ["pipeline"] });
      const prev = qc.getQueryData<PipelineCustomer[]>(["pipeline"]);
      qc.setQueryData<PipelineCustomer[]>(["pipeline"], old =>
        old?.map(c => c.id === id
          ? { ...c, assigned_user_id: user!.id, assigned_to: user!.name }
          : c
        ) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["pipeline"], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  // Quick-log mutation
  const logMutation = useMutation({
    mutationFn: ({
      customerId, content, type, followUpDays,
    }: { customerId: number; content: string; type: string; followUpDays: number | null }) =>
      Promise.all([
        api.createNote(customerId, content, type),
        followUpDays != null
          ? api.updateCustomer(customerId, {
              follow_up_at: new Date(Date.now() + followUpDays * 86_400_000)
                .toISOString().slice(0, 10),
            } as Parameters<typeof api.updateCustomer>[1])
          : Promise.resolve(null),
      ]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  // Build columns
  const ungrouped = filtered.filter(c => !c.group_id);
  const byGroup: Record<number, PipelineCustomer[]> = Object.fromEntries(groups.map(g => [g.id, []]));
  for (const c of filtered) {
    if (c.group_id != null && byGroup[c.group_id] !== undefined) byGroup[c.group_id].push(c);
  }

  type Col = { id: number | null; name: string; color: string; is_won: number; customers: PipelineCustomer[] };
  const columns: Col[] = [
    { id: null, name: "Chưa có cơ hội", color: "#9ca3af", is_won: 0, customers: ungrouped },
    ...groups.map(g => ({ id: g.id, name: g.name, color: g.color, is_won: g.is_won, customers: byGroup[g.id] ?? [] })),
  ];

  // DnD
  function handleDragStart(e: React.DragEvent, id: number) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e: React.DragEvent, colId: number | null) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId ?? "ungrouped");
  }
  function handleDrop(e: React.DragEvent, colId: number | null) {
    e.preventDefault();
    if (draggedId === null) return;
    const curr = allLeads.find(c => c.id === draggedId);
    if (curr?.group_id !== colId) moveMutation.mutate({ id: draggedId, groupId: colId });
    setDraggedId(null);
    setDragOverCol(null);
  }

  // Count badges for view toggle
  const myCount    = allLeads.filter(c => c.assigned_user_id === user?.id).length;
  const newCount   = allLeads.filter(c => !c.assigned_user_id).length;
  const overdueCount = allLeads.filter(c => c.follow_up_at && !c.group_is_won && isOverdue(c.follow_up_at)).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Pipeline CSKH</h2>
          <p className="text-xs text-gray-400">Kéo thả để chuyển giai đoạn</p>
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 ml-2">
          {([
            { key: "all",        label: "Tất cả",    count: allLeads.length },
            { key: "mine",       label: "Của tôi",   count: myCount },
            { key: "unassigned", label: "Chưa nhận", count: newCount },
          ] as { key: ViewMode; label: string; count: number }[]).map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1
                ${view === v.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              {v.label}
              <span className={`text-xs px-1.5 py-0 rounded-full font-bold
                ${v.key === "unassigned" && v.count > 0 ? "bg-orange-500 text-white" :
                  v.key === "mine"       && v.count > 0 ? "bg-blue-500 text-white" :
                  "bg-gray-200 text-gray-600"}`}>
                {v.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm tên / SĐT..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 ml-auto"
        />

        {/* Overdue chip */}
        {overdueCount > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">
            ⚠️ {overdueCount} quá hạn
          </span>
        )}
      </div>

      {/* ── Board ── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Đang tải...</div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-3 p-4" style={{ minWidth: `${columns.length * 292}px` }}>
            {columns.map(col => {
              const colKey = col.id ?? "ungrouped";
              const isOver = dragOverCol === colKey;
              const newLeadsInCol = col.customers.filter(c => isNew(c.created_at)).length;

              return (
                <div
                  key={colKey}
                  className={`flex-shrink-0 w-72 flex flex-col rounded-2xl transition-colors duration-150
                    ${isOver ? "bg-blue-50 ring-2 ring-blue-400" :
                      col.is_won ? "bg-emerald-50/80" :
                      col.id === null ? "bg-orange-50/60" :
                      "bg-gray-100/80"}`}
                  onDragOver={e => handleDragOver(e, col.id)}
                  onDrop={e => handleDrop(e, col.id)}
                >
                  {/* Column header */}
                  <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                    <span className="text-sm font-bold text-gray-800 flex-1 truncate">
                      {col.name}
                      {col.is_won === 1 && <span className="ml-1 text-emerald-600">✓</span>}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                      style={{ backgroundColor: col.color }}>
                      {col.customers.length}
                    </span>
                    {newLeadsInCol > 0 && col.id === null && (
                      <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                        +{newLeadsInCol} mới
                      </span>
                    )}
                  </div>

                  {/* Cards */}
                  <div
                    className="flex-1 overflow-y-auto px-2 pb-3 space-y-2"
                    style={{ maxHeight: "calc(100vh - 108px)" }}
                  >
                    {col.customers.length === 0 && (
                      <div className={`border-2 border-dashed rounded-xl py-8 flex items-center justify-center text-xs transition-colors
                        ${isOver ? "border-blue-400 text-blue-500 bg-blue-50" : "border-gray-300 text-gray-400"}`}>
                        {isOver ? "Thả để chuyển nhóm" : "Chưa có lead"}
                      </div>
                    )}
                    {col.customers.map(c => (
                      <CustomerCard
                        key={c.id}
                        customer={c}
                        isDragging={draggedId === c.id}
                        currentUserId={user?.id ?? -1}
                        onDragStart={e => handleDragStart(e, c.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                        onQuickAction={(content, type, followUpDays) =>
                          logMutation.mutate({ customerId: c.id, content, type, followUpDays })
                        }
                        onClaim={() => claimMutation.mutate(c.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
