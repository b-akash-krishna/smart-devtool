"use client";

import { useState } from "react";
import { Play, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { Endpoint } from "@/lib/api";

interface AuthScheme {
  type: string;
  header_name?: string;
  description?: string;
}

interface Props {
  endpoint: Endpoint;
  baseUrl: string;
  auth?: AuthScheme | null;
}

export default function TryItPlayground({ endpoint, baseUrl, auth }: Props) {
  const [open, setOpen] = useState(false);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState("");

  const authRequired = auth && auth.type !== "none";
  const isApiKey = auth?.type === "api_key";
  const headerName = auth?.header_name || "Authorization";

  const handleRun = async () => {
    setLoading(true);
    setResponse(null);
    try {
      let path = endpoint.path;
      endpoint.parameters?.forEach((p) => {
        if (p.location === "path" && paramValues[p.name]) {
          path = path.replace(`{${p.name}}`, paramValues[p.name]);
        }
      });

      const url = new URL(`${baseUrl}${path}`);
      endpoint.parameters?.forEach((p) => {
        if (p.location === "query" && paramValues[p.name]) {
          url.searchParams.set(p.name, paramValues[p.name]);
        }
      });

      const headers: Record<string, string> = { Accept: "application/json" };
      if (authToken) {
        if (isApiKey) {
          headers[headerName] = authToken;
        } else {
          headers[headerName] = authToken.startsWith("Bearer ")
            ? authToken
            : `Bearer ${authToken}`;
        }
      }

      const res = await fetch(url.toString(), {
        method: endpoint.method,
        headers,
      });

      setStatus(res.status);
      try {
        const data = await res.json();
        setResponse(JSON.stringify(data, null, 2));
      } catch {
        const text = await res.text();
        setResponse(text || "(empty response)");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setResponse(`Error: ${message}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] transition hover:brightness-110"
      >
        <Play className="h-3 w-3" />
        Try It
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {authRequired && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--cherry-rose)]/30 bg-[var(--cherry-rose)]/10 p-2.5">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--cherry-rose)]" />
              <label className="w-24 shrink-0 font-mono text-xs text-[var(--foreground)]">
                {isApiKey ? "API Key" : "Bearer Token"}
              </label>
              <input
                type="password"
                placeholder={isApiKey ? "your-api-key" : "your-token"}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="flex-1 rounded border border-[var(--cherry-rose)]/30 bg-[var(--card-2)] px-2 py-1.5 font-mono text-xs text-[var(--foreground)] focus:border-[var(--cherry-rose)] focus:outline-none"
              />
            </div>
          )}

          {endpoint.parameters
            ?.filter((p) => p.location === "query")
            .map((param) => (
              <div key={param.name} className="flex items-center gap-3">
                <label className="w-28 shrink-0 font-mono text-xs text-[var(--muted)]">
                  {param.name}
                  {param.required && <span className="ml-0.5 text-[var(--cherry-rose)]">*</span>}
                </label>
                <input
                  type="text"
                  placeholder={param.type}
                  value={paramValues[param.name] || ""}
                  onChange={(e) =>
                    setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                  }
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--card-2)] px-2 py-1.5 font-mono text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            ))}

          {endpoint.parameters
            ?.filter((p) => p.location === "path")
            .map((param) => (
              <div key={param.name} className="flex items-center gap-3">
                <label className="w-28 shrink-0 font-mono text-xs text-[var(--muted)]">
                  {param.name}
                  <span className="ml-0.5 text-[var(--cherry-rose)]">*</span>
                  <span className="ml-1 text-[var(--muted)]/70">(path)</span>
                </label>
                <input
                  type="text"
                  placeholder={`Enter ${param.name}`}
                  value={paramValues[param.name] || ""}
                  onChange={(e) =>
                    setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                  }
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--card-2)] px-2 py-1.5 font-mono text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            ))}

          <button
            onClick={handleRun}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--lavender-blush)] transition hover:brightness-110 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            {loading ? "Running..." : `Run ${endpoint.method}`}
          </button>

          {response && (
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${
                  status && status < 300
                    ? "bg-[var(--success)]/12 text-[var(--success)]"
                    : "bg-[var(--cherry-rose)]/12 text-[var(--cherry-rose)]"
                }`}
              >
                {status && <span>HTTP {status}</span>}
              </div>
              <pre className="max-h-48 overflow-auto bg-[var(--coffee-bean)] p-3 font-mono text-xs text-[var(--lavender-blush)]">
                {response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
