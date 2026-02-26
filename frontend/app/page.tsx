"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Zap, Globe, History, FileJson, Terminal, Pencil, Check, X, Eye } from "lucide-react";
import {
  createProject, getProject, getEndpoints, generateSDK,
  listProjects, exportOpenAPI, getSuggestions, getRateLimitStatus,
  Project, Endpoint, EndpointsResponse, RateLimitStatus
} from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import EndpointCard from "@/components/EndpointCard";
import IntegrationSuggestions from "@/components/IntegrationSuggestions";
import SDKPreviewModal from "@/components/SDKPreviewModal";

export default function Home() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointsResponse | null>(null);
  const [editedEndpoints, setEditedEndpoints] = useState<Endpoint[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [language, setLanguage] = useState<"python" | "typescript">("python");
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Project[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [useCase, setUseCase] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

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
          setEditedEndpoints(eps.endpoints);
          const sugg = await getSuggestions(projectId);
          setSuggestions(sugg.suggestions || []);
          loadHistory();
          fetchRateLimit();
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

  const fetchRateLimit = async () => {
    try {
      const status = await getRateLimitStatus();
      setRateLimit(status);
    } catch {}
  };

  useEffect(() => {
    loadHistory();
    fetchRateLimit();
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
    setEditedEndpoints([]);
    setIsEditing(false);
    setFromCache(false);
    setSuggestions([]);
    setLogs([]);
    setShowLogs(false);
    setLoading(true);
    try {
      const p = await createProject(name, url, useCase, forceRefresh);
      setProject(p);
      if (p.status === "COMPLETED") {
        setFromCache(true);
        const eps = await getEndpoints(p.id);
        setEndpoints(eps);
        setEditedEndpoints(eps.endpoints);
        const sugg = await getSuggestions(p.id);
        setSuggestions(sugg.suggestions || []);
        fetchRateLimit();
      } else {
        setFromCache(false);
        startPolling(p.id);
        startLogs(p.id);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError(`⏳ Rate limit reached. ${err.response.data.detail}`);
      } else {
        setError("Failed to create project. Is the backend running?");
      }
      fetchRateLimit();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEndpoint = (updated: Endpoint) => {
    setEditedEndpoints(prev => prev.map(ep => ep.id === updated.id ? updated : ep));
  };

  const handleDeleteEndpoint = (id: string) => {
    setEditedEndpoints(prev => prev.filter(ep => ep.id !== id));
  };

  const handleDownload = async () => {
    if (!project) return;
    setGenerating(true);
    setShowPreview(false);
    try {
      const blob = await generateSDK(project.id, language, editedEndpoints);
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
    setIsEditing(false);
    if (p.status === "COMPLETED") {
      const eps = await getEndpoints(p.id);
      setEndpoints(eps);
      setEditedEndpoints(eps.endpoints);
    }
  };

  const isProcessing = project && !["COMPLETED", "FAILED"].includes(project.status);

  // Rate limit display
  const rateLimitColor = !rateLimit ? "text-slate-500"
    : rateLimit.remaining <= 2 ? "text-red-400"
    : rateLimit.remaining <= 5 ? "text-yellow-400"
    : "text-green-400";

  const resetMinutes = rateLimit ? Math.ceil(rateLimit.reset_in_seconds / 60) : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* SDK Preview Modal */}
      {showPreview && project && (
        <SDKPreviewModal
          projectId={project.id}
          language={language}
          apiName={project.api_name || project.name}
          onClose={() => setShowPreview(false)}
          onDownload={handleDownload}
        />
      )}

      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-1.5 rounded-lg">
            <Zap className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold">Smart DevTool</h1>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">beta</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Rate limit indicator */}
          {rateLimit && (
            <div className={`text-xs ${rateLimitColor} flex items-center gap-1.5`} title={`Resets in ${resetMinutes} min`}>
              <div className={`w-1.5 h-1.5 rounded-full ${rateLimit.remaining <= 2 ? "bg-red-400" : rateLimit.remaining <= 5 ? "bg-yellow-400" : "bg-green-400"}`} />
              {rateLimit.remaining}/{rateLimit.limit} requests left
            </div>
          )}
          <button
            onClick={() => { setShowHistory(!showHistory); loadHistory(); }}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition text-sm"
          >
            <History className="w-4 h-4" />
            History ({history.length})
          </button>
        </div>
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
                  <button
                    key={p.id}
                    onClick={() => handleHistoryClick(p)}
                    className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{p.api_name || p.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{p.base_url}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </button>
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
                  Use Case <span className="text-slate-600">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Build a cat facts Telegram bot"
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
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={forceRefresh}
                onChange={e => setForceRefresh(e.target.checked)}
                className="rounded"
              />
              Force re-scrape (bypass cache)
            </label>
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
                <div className="flex items-center gap-3">
                  <StatusBadge status={project.status} />
                  {fromCache && (
                    <span className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-full">
                      ⚡ Served from cache
                    </span>
                  )}
                </div>
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

            {endpoints && editedEndpoints.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-slate-200">
                      {editedEndpoints.length} Endpoint{editedEndpoints.length !== 1 ? "s" : ""}
                      {endpoints.endpoints.length !== editedEndpoints.length && (
                        <span className="text-slate-500 text-sm ml-1">
                          (of {endpoints.endpoints.length})
                        </span>
                      )}
                    </h3>
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-lg transition"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 border border-green-500/30 px-2.5 py-1 rounded-lg transition"
                        >
                          <Check className="w-3 h-3" />
                          Done
                        </button>
                        <button
                          onClick={() => { setEditedEndpoints(endpoints.endpoints); setIsEditing(false); }}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 px-2.5 py-1 rounded-lg transition"
                        >
                          <X className="w-3 h-3" />
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
                    <select
                      value={language}
                      onChange={e => setLanguage(e.target.value as "python" | "typescript")}
                      className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                    >
                      <option value="python">Python</option>
                      <option value="typescript">TypeScript</option>
                    </select>
                    <button
                      onClick={() => setShowPreview(true)}
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white text-sm px-4 py-1.5 rounded-lg transition"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
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
                  {editedEndpoints.map(ep => (
                    <EndpointCard
                      key={ep.id}
                      endpoint={ep}
                      baseUrl={project.base_url}
                      auth={project.auth_scheme}
                      isEditing={isEditing}
                      onUpdate={handleUpdateEndpoint}
                      onDelete={handleDeleteEndpoint}
                    />
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