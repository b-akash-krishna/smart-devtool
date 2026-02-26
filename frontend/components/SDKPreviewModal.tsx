"use client";

import { useState, useEffect } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import { previewSDK } from "@/lib/api";

interface Props {
  projectId: string;
  language: "python" | "typescript";
  apiName: string;
  onClose: () => void;
  onDownload: () => void;
}

export default function SDKPreviewModal({ projectId, language, apiName, onClose, onDownload }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    previewSDK(projectId, language)
      .then(setCode)
      .catch(() => setCode("// Failed to load preview"))
      .finally(() => setLoading(false));
  }, [projectId, language]);

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-semibold text-white">SDK Preview</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {apiName} · {language === "python" ? "Python" : "TypeScript"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!code}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Download ZIP
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
              Loading preview...
            </div>
          ) : (
            <pre className="text-xs text-green-300 font-mono p-6 leading-relaxed whitespace-pre-wrap">
              {code}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}