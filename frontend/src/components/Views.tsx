"use client";

import { EXAMPLES, type Example } from "@/lib/examples";
import {
  formatRelativeTime,
  type HistoryEntry,
} from "@/lib/history";

// ---------- Examples ----------
export function ExamplesView({
  onPick,
}: {
  onPick: (example: Example) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-[18px] font-medium tracking-tight text-[#ededf0] mb-1">
            Examples
          </h2>
          <p className="text-[12px] text-[#71717a]">
            Prebuilt inputs that exercise different segmentation paths.
            Pick one to load into the editor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onPick(ex)}
              className="text-left border border-[#1e1e22] hover:border-[#2a2a30] bg-[#0f0f11] hover:bg-[#141417] rounded-lg p-4 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-medium text-[#ededf0]">
                  {ex.name}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-[#4d4d55] border border-[#1e1e22] rounded px-1.5 py-0.5">
                  {ex.tag}
                </div>
              </div>
              <p className="text-[11px] text-[#71717a] leading-relaxed mb-3">
                {ex.description}
              </p>
              <pre className="text-[10px] font-mono text-[#4d4d55] leading-relaxed whitespace-pre-wrap max-h-[60px] overflow-hidden">
                {ex.text}
              </pre>
              <div className="mt-3 text-[10px] font-mono text-[#71717a] group-hover:text-[#ededf0] transition-colors">
                load example →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- History ----------
export function HistoryView({
  entries,
  onPick,
  onClear,
}: {
  entries: HistoryEntry[];
  onPick: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-[13px] text-[#71717a] mb-1">
            No history yet
          </div>
          <div className="text-[11px] text-[#4d4d55]">
            Analyses are saved locally in your browser. They never leave
            this device.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-[18px] font-medium tracking-tight text-[#ededf0] mb-1">
              History
            </h2>
            <p className="text-[12px] text-[#71717a]">
              {entries.length} saved analys
              {entries.length === 1 ? "is" : "es"}, stored in this browser.
            </p>
          </div>
          <button
            onClick={onClear}
            className="text-[11px] text-[#71717a] hover:text-[#f87171] border border-[#1e1e22] hover:border-[#3a1a1a] rounded-md px-3 py-1.5 transition-colors"
          >
            Clear all
          </button>
        </div>

        <div className="space-y-2">
          {entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onPick(entry)}
              className="w-full text-left border border-[#1e1e22] hover:border-[#2a2a30] bg-[#0f0f11] hover:bg-[#141417] rounded-lg p-4 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="text-[13px] font-medium text-[#ededf0] min-w-0 truncate">
                  {entry.title}
                </div>
                <div className="text-[10px] font-mono text-[#4d4d55] shrink-0">
                  {formatRelativeTime(entry.timestamp)}
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono text-[#71717a] mb-2 flex-wrap">
                <span>{entry.graph.stats.node_count} nodes</span>
                <span>·</span>
                <span>{entry.graph.stats.edge_count} edges</span>
                <span>·</span>
                <span>
                  {Math.round(entry.graph.stats.evidence_coverage * 100)}%
                  coverage
                </span>
                {entry.graph.stats.orphan_claim_indices.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-[#f87171]">
                      {entry.graph.stats.orphan_claim_indices.length} unattached
                    </span>
                  </>
                )}
              </div>
              <pre className="text-[10px] font-mono text-[#4d4d55] leading-relaxed whitespace-pre-wrap max-h-[32px] overflow-hidden">
                {entry.text}
              </pre>
              <div className="mt-3 text-[10px] font-mono text-[#71717a] group-hover:text-[#ededf0] transition-colors">
                reload analysis →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}