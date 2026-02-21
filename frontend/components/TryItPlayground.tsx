"use client";

import { useState } from "react";
import { Play, ChevronDown, ChevronUp } from "lucide-react";
import { Endpoint } from "@/lib/api";

interface Props {
  endpoint: Endpoint;
  baseUrl: string;
}

export default function TryItPlayground({ endpoint, baseUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const url = new URL(`${baseUrl}${endpoint.path}`);
      endpoint.parameters?.forEach(p => {
        if (p.location === "query" && paramValues[p.name]) {
          url.searchParams.set(p.name, paramValues[p.name]);
        }
      });

      const res = await fetch(url.toString(), {
        method: endpoint.method,
        headers: { "Accept": "application/json" },
      });

      setStatus(res.status);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResponse(`Error: ${e.message}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition"
      >
        <Play className="w-3 h-3" />
        Try It
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Parameters */}
          {endpoint.parameters?.filter(p => p.location === "query").map(param => (
            <div key={param.name} className="flex items-center gap-3">
              <label className="text-xs font-mono text-gray-500 w-28 shrink-0">
                {param.name}
                {param.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <input
                type="text"
                placeholder={param.type}
                value={paramValues[param.name] || ""}
                onChange={e => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 font-mono focus:outline-none focus:border-blue-400"
              />
            </div>
          ))}

          <button
            onClick={handleRun}
            disabled={loading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded transition"
          >
            <Play className="w-3 h-3" />
            {loading ? "Running..." : `Run ${endpoint.method}`}
          </button>

          {/* Response */}
          {response && (
            <div className="rounded-lg overflow-hidden border border-gray-200">
              <div className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-2 ${
                status && status < 300 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {status && <span>HTTP {status}</span>}
              </div>
              <pre className="text-xs bg-gray-950 text-green-400 p-3 overflow-auto max-h-48 font-mono">
                {response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}