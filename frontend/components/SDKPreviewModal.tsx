"use client";

import { useState, useEffect } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import { Endpoint, previewSDK } from "@/lib/api";

interface Props {
  projectId: string;
  language: "python" | "typescript";
  apiName: string;
  endpoints: Endpoint[];
  onClose: () => void;
  onDownload: () => void;
}

export default function SDKPreviewModal({
  projectId,
  language,
  apiName,
  endpoints,
  onClose,
  onDownload,
}: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewSDK(projectId, language, endpoints)
      .then((previewCode) => {
        if (!cancelled) setCode(previewCode);
      })
      .catch(() => {
        if (!cancelled) setCode("// Failed to load preview");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, language, endpoints]);

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--coffee-bean)]/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4 md:px-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">SDK Preview</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {apiName} | {language === "python" ? "Python" : "TypeScript"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={handleCopy}
              disabled={!code}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--success)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--success)] px-3 py-1.5 text-xs font-medium text-[var(--lavender-blush)] transition hover:brightness-110"
            >
              <Download className="h-3.5 w-3.5" />
              Download ZIP
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--card-2)] hover:text-[var(--foreground)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {code === null ? (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">
              Loading preview...
            </div>
          ) : (
            <pre className="p-5 font-mono text-xs leading-relaxed text-[var(--foreground)] md:p-6">
              {code}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
