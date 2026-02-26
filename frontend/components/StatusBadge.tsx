const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-[var(--border)] bg-[var(--card-2)] text-[var(--muted)]",
  SCRAPING: "border-[var(--primary)]/40 bg-[var(--primary)]/12 text-[var(--primary)]",
  PARSING: "border-[var(--burgundy)]/40 bg-[var(--burgundy)]/10 text-[var(--burgundy)]",
  COMPLETED: "border-[var(--success)]/35 bg-[var(--success)]/12 text-[var(--success)]",
  FAILED: "border-[var(--cherry-rose)]/40 bg-[var(--cherry-rose)]/12 text-[var(--cherry-rose)]",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SCRAPING: "Scraping",
  PARSING: "Parsing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        STATUS_STYLES[status] ?? "border-[var(--border)] bg-[var(--card-2)] text-[var(--muted)]"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
