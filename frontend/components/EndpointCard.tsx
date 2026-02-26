"use client";

import { useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import { Endpoint } from "@/lib/api";
import TryItPlayground from "./TryItPlayground";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-[var(--success)]/12 text-[var(--success)] border-[var(--success)]/30",
  POST: "bg-[var(--primary)]/12 text-[var(--primary)] border-[var(--primary)]/30",
  PUT: "bg-[var(--burgundy)]/10 text-[var(--burgundy)] border-[var(--burgundy)]/30",
  DELETE: "bg-[var(--cherry-rose)]/12 text-[var(--cherry-rose)] border-[var(--cherry-rose)]/30",
  PATCH: "bg-[var(--rich-mahogany)]/12 text-[var(--rich-mahogany)] border-[var(--rich-mahogany)]/30",
};

interface AuthScheme {
  type: string;
  header_name?: string;
  description?: string;
}

interface Props {
  endpoint: Endpoint;
  baseUrl: string;
  auth?: AuthScheme;
  isEditing?: boolean;
  onUpdate?: (updated: Endpoint) => void;
  onDelete?: (id: string) => void;
}

export default function EndpointCard({
  endpoint,
  baseUrl,
  auth,
  isEditing,
  onUpdate,
  onDelete,
}: Props) {
  const [summary, setSummary] = useState(endpoint.summary || "");

  const handleSummaryBlur = () => {
    if (onUpdate) onUpdate({ ...endpoint, summary });
  };

  return (
    <div
      className={`rounded-xl border p-4 transition ${
        isEditing
          ? "border-[var(--primary)]/45 bg-[var(--card)] shadow-[0_0_0_1px_rgba(25,167,206,0.2)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/30"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${
            METHOD_COLORS[endpoint.method] ??
            "border-[var(--border)] bg-[var(--card-2)] text-[var(--muted)]"
          }`}
        >
          {endpoint.method}
        </span>
        <code className="break-all rounded bg-[var(--card-2)] px-2 py-0.5 font-mono text-xs text-[var(--foreground)] sm:text-sm">
          {endpoint.path}
        </code>
        {endpoint.tags?.map((tag) => (
          <span
            key={tag}
            className="rounded-md border border-[var(--border)] bg-[var(--card-2)] px-2 py-0.5 text-xs text-[var(--muted)]"
          >
            {tag}
          </span>
        ))}
        {isEditing && (
          <div className="ml-auto flex items-center gap-2">
            <Pencil className="h-3.5 w-3.5 text-[var(--primary)]" />
            <button
              onClick={() => onDelete?.(endpoint.id)}
              className="flex items-center gap-1 text-xs text-[var(--cherry-rose)] transition hover:brightness-75"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={handleSummaryBlur}
          placeholder="Endpoint summary..."
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:outline-none"
        />
      ) : (
        endpoint.summary && (
          <p className="mb-2 text-sm text-[var(--muted)]">{endpoint.summary}</p>
        )
      )}

      {endpoint.parameters?.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Parameters
          </p>
          <div className="space-y-1">
            {endpoint.parameters.map((param) => (
              <div key={param.name} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="rounded bg-[var(--card-2)] px-1.5 py-0.5 font-mono text-[var(--foreground)]">
                  {param.name}
                </code>
                <span className="text-[var(--muted)]">{param.type}</span>
                <span className="text-[var(--muted)]">|</span>
                <span className="text-[var(--muted)]">{param.location}</span>
                {param.required && <span className="font-medium text-[var(--cherry-rose)]">required</span>}
                {param.description && <span className="text-[var(--muted)]">{param.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isEditing && <TryItPlayground endpoint={endpoint} baseUrl={baseUrl} auth={auth} />}
    </div>
  );
}
