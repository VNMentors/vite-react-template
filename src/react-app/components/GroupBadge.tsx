import type { Customer, Group } from "../lib/types";

export function GroupBadge({ customer }: { customer: Pick<Customer, "group_name" | "group_color"> }) {
  if (!customer.group_name) {
    return <span className="text-xs text-gray-400 italic">Chưa có cơ hội</span>;
  }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: customer.group_color ?? "#6b7280" }}
    >
      {customer.group_name}
    </span>
  );
}

// Badge độc lập khi chỉ có Group object
export function GroupTag({ group }: { group: Group }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: group.color }}
    >
      {group.name}
    </span>
  );
}

// Preset colors cho color picker
export const PRESET_COLORS = [
  { label: "Đỏ",      value: "#ef4444" },
  { label: "Cam",     value: "#f97316" },
  { label: "Vàng",    value: "#f59e0b" },
  { label: "Xanh lá", value: "#10b981" },
  { label: "Xanh dương", value: "#3b82f6" },
  { label: "Tím",     value: "#8b5cf6" },
  { label: "Hồng",    value: "#ec4899" },
  { label: "Xanh nhạt", value: "#06b6d4" },
  { label: "Xám",     value: "#6b7280" },
];
