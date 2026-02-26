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
      <h3 className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
        <Code2 className="h-4 w-4 text-[var(--primary)]" />
        Integration Path Suggestions
      </h3>
      {suggestions.map((s, i) => (
        <div
          key={i}
          className={`border rounded-xl p-4 ${
            s.is_recommended
              ? "border-[var(--primary)]/40 bg-[var(--primary)]/10"
              : "border-[var(--border)] bg-[var(--card)]"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{s.approach}</span>
              <span className="rounded bg-[var(--card-2)] px-2 py-0.5 text-xs text-[var(--muted)]">
                {s.language}
              </span>
            </div>
            {s.is_recommended && (
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
                <CheckCircle className="w-3.5 h-3.5" />
                Recommended
              </span>
            )}
          </div>
          <p className="mb-3 text-sm text-[var(--muted)]">{s.reasoning}</p>
          {s.recommended_libraries?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {s.recommended_libraries.map(lib => (
                <span key={lib} className="rounded bg-[var(--card-2)] px-2 py-0.5 font-mono text-xs text-[var(--foreground)]">
                  {lib}
                </span>
              ))}
            </div>
          )}
          {s.code_snippet && (
            <pre className="overflow-auto rounded-lg bg-[var(--coffee-bean)] p-3 font-mono text-xs text-[var(--lavender-blush)]">
              {s.code_snippet}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
