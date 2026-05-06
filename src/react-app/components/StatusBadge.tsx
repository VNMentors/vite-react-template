const STATUS_STYLES: Record<string, string> = {
  lead: "bg-yellow-100 text-yellow-800",
  prospect: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  prospect: "Prospect",
  active: "Active",
  inactive: "Inactive",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
