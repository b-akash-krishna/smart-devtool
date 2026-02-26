"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Download,
  Globe,
  History,
  FileJson,
  Terminal,
  Pencil,
  Check,
  X,
  Eye,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import {
  createProject,
  getProject,
  getEndpoints,
  generateSDK,
  listProjects,
  exportOpenAPI,
  getSuggestions,
  getRateLimitStatus,
  Project,
  Endpoint,
  EndpointsResponse,
  RateLimitStatus,
  Suggestion,
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
      if (e.data === "DONE" || e.data === "FAILED") {
        es.close();
        return;
      }
      setLogs((prev) => [...prev, e.data]);
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
      } catch {
        stopPolling();
      }
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
    } catch (err: unknown) {
      const errorResponse = err as { response?: { status?: number; data?: { detail?: string } } };
      if (errorResponse.response?.status === 429) {
        setError(`Rate limit reached. ${errorResponse.response.data?.detail || "Try again later."}`);
      } else {
        setError("Failed to create project. Is the backend running?");
      }
      fetchRateLimit();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEndpoint = (updated: Endpoint) => {
    setEditedEndpoints((prev) => prev.map((ep) => (ep.id === updated.id ? updated : ep)));
  };

  const handleDeleteEndpoint = (id: string) => {
    setEditedEndpoints((prev) => prev.filter((ep) => ep.id !== id));
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
    } catch {
      setError("Failed to generate SDK.");
    } finally {
      setGenerating(false);
    }
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
    } catch {
      setError("Failed to export OpenAPI spec.");
    }
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
  const rateLimitColor =
    !rateLimit
      ? "text-[var(--muted)]"
      : rateLimit.remaining <= 2
      ? "text-[var(--burgundy)]"
      : rateLimit.remaining <= 5
      ? "text-[var(--cherry-rose)]"
      : "text-[var(--rich-mahogany)]";
  const resetMinutes = rateLimit ? Math.ceil(rateLimit.reset_in_seconds / 60) : 0;

  return (
    <main className="relative min-h-screen overflow-x-hidden text-[var(--foreground)]">
      {showPreview && project && (
        <SDKPreviewModal
          projectId={project.id}
          language={language}
          apiName={project.api_name || project.name}
          endpoints={editedEndpoints}
          onClose={() => setShowPreview(false)}
          onDownload={handleDownload}
        />
      )}

      <header className="sticky top-0 z-20 border-b border-[var(--border)]/70 bg-[var(--background)]/80 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/20 text-[var(--primary)]"> */}
              <Image
                src="/icon.png"
                alt="Smart DevTool logo"
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
            {/* </div> */}
            <div>
              <h1 className="text-lg font-semibold tracking-tight md:text-xl">Smart DevTool</h1>
              <p className="text-xs text-[var(--muted)]">Docs to SDK generation workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {rateLimit && (
              <div
                className={`hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs md:flex ${rateLimitColor}`}
                title={`Resets in ${resetMinutes} min`}
              >
                <Clock3 className="h-3.5 w-3.5" />
                <span>
                  {rateLimit.remaining}/{rateLimit.limit} requests left
                </span>
              </div>
            )}
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                loadHistory();
              }}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              <History className="h-4 w-4" />
              <span>History ({history.length})</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
        {showHistory && (
          <div className="animate-rise mb-8 rounded-2xl border border-[var(--border)] bg-[var(--card)]/80 p-4">
            <h3 className="mb-3 font-semibold text-[var(--foreground)]">Recent Projects</h3>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No projects yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleHistoryClick(p)}
                    className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-[var(--border)] hover:bg-[var(--card-2)]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{p.api_name || p.name}</p>
                      <p className="font-mono text-xs text-[var(--muted)]">{p.base_url}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <section className="mb-10 animate-rise">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)]/75 p-6 md:p-9">
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              Convert messy API docs into production SDKs
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Parse public docs, review endpoint schema, preview generated client code,
              and export typed SDK packages for Python or TypeScript.
            </p>
            {/* <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--card-2)] px-3 py-1 text-xs text-[var(--muted)]">
                OpenAPI + LLM fallback
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--card-2)] px-3 py-1 text-xs text-[var(--muted)]">
                Editable endpoint schema
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--card-2)] px-3 py-1 text-xs text-[var(--muted)]">
                One-click SDK zip
              </span>
            </div> */}
          </div>
        </section>

        <section className="mb-8 animate-rise">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--muted)]">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Stripe API"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Use Case <span className="normal-case tracking-normal text-[var(--muted)]/70">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Build a bot for API data sync"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--muted)]">Documentation URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="url"
                  placeholder="https://api.example.com/docs"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-2)] py-2.5 pl-10 pr-4 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--card-2)]"
                />
                Force re-scrape (bypass cache)
              </label>
              <button
                onClick={handleSubmit}
                disabled={loading || !url || !name || !!isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--lavender-blush)] shadow-[0_8px_20px_rgba(159,32,66,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Image
                src="/icon.png"
                alt="Smart DevTool logo"
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
                {loading ? "Starting..." : "Generate SDK"}
              </button>
            </div>

            {error && <p className="mt-3 text-sm text-[var(--burgundy)]">{error}</p>}
          </div>
        </section>

        {project && (
          <section className="space-y-6 animate-rise">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Current Project</p>
                  <h3 className="text-xl font-semibold">{project.api_name || project.name}</h3>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">{project.base_url}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={project.status} />
                  {fromCache && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--success)]/35 bg-[var(--success)]/10 px-3 py-1 text-xs text-[var(--success)]">
                      <Check className="h-3 w-3" />
                      Served from cache
                    </span>
                  )}
                </div>
              </div>
              {isProcessing && (
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--card-2)]">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--primary)]" />
                </div>
              )}
            </div>

            {showLogs && logs.length > 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--coffee-bean)] p-4 font-mono text-sm">
                <div className="mb-3 flex items-center gap-2 text-[var(--muted)]">
                  <Terminal className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest">Live Processing Logs</span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {logs.map((log, i) => (
                    <div key={i} className="text-[var(--lavender-blush)]">
                      <span className="mr-2 text-[var(--muted)]">$</span>
                      {log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}

            {project.auth_scheme && project.auth_scheme.type !== "none" && (
              <div className="flex items-start gap-3 rounded-xl border border-[var(--cherry-rose)]/30 bg-[var(--cherry-rose)]/12 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-[var(--cherry-rose)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Authentication required</p>
                  <p className="text-sm text-[var(--muted)]">
                    {project.auth_scheme.type.toUpperCase()} | {project.auth_scheme.header_name}
                  </p>
                </div>
              </div>
            )}

            {suggestions.length > 0 && <IntegrationSuggestions suggestions={suggestions} />}

            {endpoints && editedEndpoints.length > 0 && (
              <div>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold text-[var(--foreground)]">
                      {editedEndpoints.length} Endpoint{editedEndpoints.length !== 1 ? "s" : ""}
                      {endpoints.endpoints.length !== editedEndpoints.length && (
                        <span className="ml-1 text-sm text-[var(--muted)]">(of {endpoints.endpoints.length})</span>
                      )}
                    </h3>
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit schema
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--success)]/35 bg-[var(--success)]/12 px-3 py-1.5 text-xs text-[var(--success)] transition hover:brightness-90"
                        >
                          <Check className="h-3 w-3" />
                          Done
                        </button>
                        <button
                          onClick={() => {
                            setEditedEndpoints(endpoints.endpoints);
                            setIsEditing(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
                        >
                          <X className="h-3 w-3" />
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleExport("json")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      JSON
                    </button>
                    <button
                      onClick={() => handleExport("yaml")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      YAML
                    </button>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as "python" | "typescript")}
                      className="rounded-lg border border-[var(--primary)]/45 bg-[var(--card-2)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] shadow-[0_0_0_1px_rgba(159,32,66,0.15)] focus:border-[var(--primary)] focus:outline-none"
                    >
                      <option value="python" className="bg-white text-slate-900">Python</option>
                      <option value="typescript" className="bg-white text-slate-900">TypeScript</option>
                    </select>
                    <button
                      onClick={() => setShowPreview(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--card-2)]"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </button>
                    <button
                      onClick={handleDownload}
                      disabled={generating}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--success)] px-4 py-1.5 text-sm font-semibold text-[var(--lavender-blush)] shadow-[0_8px_20px_rgba(61,19,8,0.25)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {generating ? "Generating..." : "Download SDK"}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {editedEndpoints.map((ep) => (
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
          </section>
        )}
      </div>
    </main>
  );
}
