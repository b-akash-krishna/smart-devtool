import { CheckCircle, Code2 } from "lucide-react";

interface Suggestion {
  approach: string;
  language: string;
  reasoning: string;
  recommended_libraries: string[];
  code_snippet: string;
  is_recommended: boolean;
}

export default function IntegrationSuggestions({ suggestions }: { suggestions: Suggestion[] }) {
  if (!suggestions?.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-200 flex items-center gap-2">
        <Code2 className="w-4 h-4 text-blue-400" />
        Integration Path Suggestions
      </h3>
      {suggestions.map((s, i) => (
        <div
          key={i}
          className={`border rounded-xl p-4 ${
            s.is_recommended
              ? "border-blue-500/50 bg-blue-500/10"
              : "border-white/10 bg-white/5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{s.approach}</span>
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-slate-400">
                {s.language}
              </span>
            </div>
            {s.is_recommended && (
              <span className="flex items-center gap-1 text-xs text-blue-400 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                Recommended
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mb-3">{s.reasoning}</p>
          {s.recommended_libraries?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {s.recommended_libraries.map(lib => (
                <span key={lib} className="text-xs bg-white/10 px-2 py-0.5 rounded font-mono text-slate-300">
                  {lib}
                </span>
              ))}
            </div>
          )}
          {s.code_snippet && (
            <pre className="text-xs bg-black/40 text-green-400 p-3 rounded-lg font-mono overflow-auto">
              {s.code_snippet}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}