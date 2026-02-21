const STATUS_STYLES: Record<string, string> = {
  PENDING:   "bg-gray-100 text-gray-600",
  SCRAPING:  "bg-blue-100 text-blue-700",
  PARSING:   "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED:    "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING:   "⏳ Pending",
  SCRAPING:  "🔍 Scraping",
  PARSING:   "🧠 Parsing",
  COMPLETED: "✅ Completed",
  FAILED:    "❌ Failed",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_STYLES[status] ?? "bg-gray-100"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}