"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Zap, Globe, Code2 } from "lucide-react";
import { createProject, getProject, getEndpoints, generateSDK, Project, EndpointsResponse } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import EndpointCard from "@/components/EndpointCard";

export default function Home() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointsResponse | null>(null);
  const [language, setLanguage] = useState<"python" | "typescript">("python");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
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
        } else if (updated.status === "FAILED") {
          stopPolling();
          setError("Processing failed. Please try again.");
        }
      } catch {
        stopPolling();
      }
    }, 2000);
  };

  useEffect(() => () => stopPolling(), []);

  const handleSubmit = async () => {
    if (!url || !name) return;
    setError("");
    setProject(null);
    setEndpoints(null);
    setLoading(true);
    try {
      const p = await createProject(name, url);
      setProject(p);
      startPolling(p.id);
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
    } catch {
      setError("Failed to generate SDK.");
    } finally {
      setGenerating(false);
    }
  };

  const isProcessing = project && !["COMPLETED", "FAILED"].includes(project.status);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
        <div className="bg-blue-500 p-1.5 rounded-lg">
          <Zap className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold">Smart DevTool</h1>
        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full ml-1">beta</span>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
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

        {/* Status & Results */}
        {project && (
          <div className="space-y-6">
            {/* Project Status */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Processing</p>
                  <h3 className="text-lg font-semibold">{project.api_name || project.name}</h3>
                  <p className="text-sm text-slate-500 font-mono mt-1">{project.base_url}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              {isProcessing && (
                <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
                </div>
              )}
            </div>

            {/* Auth Info */}
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

            {/* Endpoints */}
            {endpoints && endpoints.endpoints.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-200">
                    {endpoints.endpoint_count} Endpoints Discovered
                  </h3>
                  {/* Download Controls */}
                  <div className="flex items-center gap-2">
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
                    <EndpointCard key={ep.id} endpoint={ep} />
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