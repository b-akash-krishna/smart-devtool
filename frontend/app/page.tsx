"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Zap, Globe, Code2, History, FileJson, Terminal } from "lucide-react";
import {
  createProject, getProject, getEndpoints, generateSDK,
  listProjects, exportOpenAPI, getSuggestions,
  Project, EndpointsResponse
} from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import EndpointCard from "@/components/EndpointCard";


import IntegrationSuggestions from "@/components/IntegrationSuggestions";

export default function Home() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointsResponse | null>(null);
  const [language, setLanguage] = useState<"python" | "typescript">("python");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Project[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [useCase, setUseCase] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [fromCache, setFromCache] = useState(false);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const startLogs = (projectId: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setLogs([]);
    setShowLogs(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const es = new EventSource(`${apiUrl}/api/v1/projects/${projectId}/logs`);
    es.onmessage = (e) => {
      if (e.data === "ping") return;
      if (e.data === "DONE" || e.data === "FAILED") { es.close(); return; }
      setLogs(prev => [...prev, e.data]);
    };
    eventSourceRef.current = es;
  };

  const startPolling = (projectId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const updated = await getProject(projectId);
        setProject(updated);
        if (updated.status === "COMPLETED") {
          stopPolling();
          const eps = await getEndpoints(projectId);
          setEndpoints(eps);
          const sugg = await getSuggestions(projectId);
          setSuggestions(sugg.suggestions || []);
          loadHistory();
        } else if (updated.status === "FAILED") {
          stopPolling();
          setError("Processing failed. Please try again.");
        }
      } catch { stopPolling(); }
    }, 2000);
  };

  const loadHistory = async () => {
    try {
      const projects = await listProjects();
      setHistory(projects);
    } catch {}
  };

  useEffect(() => {
    loadHistory();
    return () => {
      stopPolling();
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSubmit = async () => {
    if (!url || !name) return;
    setError("");
    setProject(null);
    setEndpoints(null);
    setFromCache(false);
    setSuggestions([]);
    setLogs([]);
    setShowLogs(false);
    setLoading(true);
    try {
      const p = await createProject(name, url, useCase);
      setProject(p);
      if (p.status === "COMPLETED") {
          // Cache hit — no need to poll
          setFromCache(true);
          const eps = await getEndpoints(p.id);
          setEndpoints(eps);
          const sugg = await getSuggestions(p.id);
          setSuggestions(sugg.suggestions || []);
      } else {
          setFromCache(false);
          startPolling(p.id);
          startLogs(p.id);
      }
    } catch {
      setError("Failed to create project. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      const blob = await generateSDK(project.id, language);
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${project.api_name || "sdk"}_${language}_sdk.zip`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch { setError("Failed to generate SDK."); }
    finally { setGenerating(false); }
  };

  const handleExport = async (format: "json" | "yaml") => {
    if (!project) return;
    try {
      const blob = await exportOpenAPI(project.id, format);
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `openapi.${format}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch { setError("Failed to export OpenAPI spec."); }
  };

  const handleHistoryClick = async (p: Project) => {
    setProject(p);
    setShowHistory(false);
    if (p.status === "COMPLETED") {
      const eps = await getEndpoints(p.id);
      setEndpoints(eps);
    }
  };

  const isProcessing = project && !["COMPLETED", "FAILED"].includes(project.status);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-1.5 rounded-lg">
            <Zap className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold">Smart DevTool</h1>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">beta</span>
        </div>
        <button
          onClick={() => { setShowHistory(!showHistory); loadHistory(); }}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition text-sm"
        >
          <History className="w-4 h-4" />
          History ({history.length})
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* History Panel */}
        {showHistory && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8">
            <h3 className="font-semibold mb-3 text-slate-300">Recent Projects</h3>
            {history.length === 0 ? (
              <p className="text-slate-500 text-sm">No projects yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleHistoryClick(p)}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.api_name || p.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{p.base_url}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            API Docs → SDK in{" "}
            <span className="text-blue-400">30 seconds</span>
          </h2>
          <p className="text-slate-400 text-lg">
            Paste any API documentation URL. Get a production-ready SDK instantly.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Stripe API"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <div className="flex-[2]">
                <label className="text-xs text-slate-400 mb-1 block">Documentation URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="url"
                    placeholder="https://api.example.com/docs"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Use Case <span className="text-slate-600">(optional but recommended)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Build a cat facts Telegram bot in Python"
                  value={useCase}
                  onChange={e => setUseCase(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !url || !name || !!isProcessing}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-lg transition flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              {loading ? "Starting..." : "Generate SDK"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        {/* Live Logs Terminal */}
        {showLogs && logs.length > 0 && (
          <div className="bg-black/60 border border-white/10 rounded-xl p-4 mb-6 font-mono text-sm">
            <div className="flex items-center gap-2 mb-3 text-slate-400">
              <Terminal className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Live Processing Logs</span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className="text-green-400">
                  <span className="text-slate-600 mr-2">$</span>{log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Status & Results */}
        {project && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Processing</p>
                  <h3 className="text-lg font-semibold">{project.api_name || project.name}</h3>
                  <p className="text-sm text-slate-500 font-mono mt-1">{project.base_url}</p>
                </div>
                <StatusBadge status={project.status} />
                {fromCache && (
                    <span className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-full">
                        ⚡ Served from cache
                    </span>
                )}
              </div>
              {isProcessing && (
                <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
                </div>
              )}
            </div>

            {project.auth_scheme && project.auth_scheme.type !== "none" && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
                <span className="text-yellow-400 mt-0.5">🔐</span>
                <div>
                  <p className="text-sm font-medium text-yellow-300">Authentication Required</p>
                  <p className="text-sm text-yellow-400/70">
                    {project.auth_scheme.type.toUpperCase()} · {project.auth_scheme.header_name}
                  </p>
                </div>
              </div>
            )}

            {suggestions.length > 0 && (
              <IntegrationSuggestions suggestions={suggestions} />
            )}

            {endpoints && endpoints.endpoints.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-200">
                    {endpoints.endpoint_count} Endpoints Discovered
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* OpenAPI Export */}
                    <button
                      onClick={() => handleExport("json")}
                      className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-1.5 rounded-lg transition"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      JSON
                    </button>
                    <button
                      onClick={() => handleExport("yaml")}
                      className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-1.5 rounded-lg transition"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      YAML
                    </button>
                    {/* SDK Download */}
                    <select
                      value={language}
                      onChange={e => setLanguage(e.target.value as "python" | "typescript")}
                      className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                    >
                      <option value="python">Python</option>
                      <option value="typescript">TypeScript</option>
                    </select>
                    <button
                      onClick={handleDownload}
                      disabled={generating}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition"
                    >
                      <Download className="w-4 h-4" />
                      {generating ? "Generating..." : "Download SDK"}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {endpoints.endpoints.map(ep => (
                    <EndpointCard key={ep.id} endpoint={ep} baseUrl={project.base_url} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}