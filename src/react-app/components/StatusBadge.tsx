export const STATUS_LIST = [
  { value: "new", label: "Mới" },
  { value: "contacting", label: "Đang liên hệ" },
  { value: "potential", label: "Tiềm năng" },
  { value: "trial", label: "Dùng thử" },
  { value: "closed", label: "Đã chốt" },
  { value: "lost", label: "Không phù hợp" },
];

const STATUS_STYLES: Record<string, string> = {
  new: "bg-gray-100 text-gray-700",
  contacting: "bg-blue-100 text-blue-700",
  potential: "bg-yellow-100 text-yellow-800",
  trial: "bg-purple-100 text-purple-800",
  closed: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-600",
};

export const STATUS_LABELS: Record<string, string> = {
  new: "Mới",
  contacting: "Đang liên hệ",
  potential: "Tiềm năng",
  trial: "Dùng thử",
  closed: "Đã chốt",
  lost: "Không phù hợp",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
