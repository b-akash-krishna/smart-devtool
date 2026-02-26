"use client";

import { useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import { Endpoint } from "@/lib/api";
import TryItPlayground from "./TryItPlayground";

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-green-100 text-green-700 border-green-200",
  POST:   "bg-blue-100 text-blue-700 border-blue-200",
  PUT:    "bg-yellow-100 text-yellow-700 border-yellow-200",
  DELETE: "bg-red-100 text-red-700 border-red-200",
  PATCH:  "bg-purple-100 text-purple-700 border-purple-200",
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

export default function EndpointCard({ endpoint, baseUrl, auth, isEditing, onUpdate, onDelete }: Props) {
  const [summary, setSummary] = useState(endpoint.summary || "");

  const handleSummaryBlur = () => {
    if (onUpdate) onUpdate({ ...endpoint, summary });
  };

  return (
    <div className={`border rounded-lg p-4 transition-shadow bg-white ${isEditing ? "border-blue-300 shadow-sm" : "border-gray-200 hover:shadow-md"}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-2 py-0.5 rounded border text-xs font-bold font-mono ${METHOD_COLORS[endpoint.method] ?? "bg-gray-100"}`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-gray-800">{endpoint.path}</code>
        {endpoint.tags?.map(tag => (
          <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
            {tag}
          </span>
        ))}
        {isEditing && (
          <div className="ml-auto flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-blue-400" />
            <button
              onClick={() => onDelete?.(endpoint.id)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <input
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          onBlur={handleSummaryBlur}
          placeholder="Endpoint summary..."
          className="w-full text-sm border border-blue-200 rounded px-2 py-1 mb-2 focus:outline-none focus:border-blue-400 text-gray-700"
        />
      ) : (
        endpoint.summary && (
          <p className="text-sm text-gray-600 mb-2">{endpoint.summary}</p>
        )
      )}

      {endpoint.parameters?.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Parameters</p>
          <div className="space-y-1">
            {endpoint.parameters.map(param => (
              <div key={param.name} className="flex items-center gap-2 text-xs">
                <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{param.name}</code>
                <span className="text-gray-400">{param.type}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-400">{param.location}</span>
                {param.required && <span className="text-red-500 font-medium">required</span>}
                {param.description && <span className="text-gray-500">— {param.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isEditing && <TryItPlayground endpoint={endpoint} baseUrl={baseUrl} auth={auth} />}
    </div>
  );
}