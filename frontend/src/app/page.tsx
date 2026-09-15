"use client";

import { useEffect, useState } from "react";
import { analyze } from "@/lib/api";
import type { Graph, GraphNode } from "@/lib/types";
import { GraphView, type TabKey } from "@/components/GraphView";
import {
  LeftSidebar,
  RightPanel,
  type View,
} from "@/components/SidePanels";
import { ExamplesView, HistoryView } from "@/components/Views";
import { DocsView } from "@/components/DocsView";
import { AnalyzingOverlay } from "@/components/AnalyzingOverlay";
import {
  addToHistory,
  clearHistory,
  loadHistory,
  type HistoryEntry,
} from "@/lib/history";
import type { Example } from "@/lib/examples";

const SAMPLE = `1/ @User123: Government spending is the real cause of inflation.
2/ Cites 2021-2024 federal spending data (US Treasury).
3/ @AnotherUser: Actually, it's corporate greed, not government spending.
4/ Cites record corporate profits and price markups (from company reports).
5/ Appeal to emotion ("greedy corporations are to blame").
6/ @SomeoneElse: Btw, have you considered that both could be true?
7/ @User123: So basically, government spending is the main driver.`;

const MIN_CHARS = 30;
const MAX_CHARS = 50_000;

type ValidationState =
  | { ok: true; message: null }
  | { ok: false; message: string };

function validateText(text: string): ValidationState {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Input is empty." };
  }
  if (trimmed.length < MIN_CHARS) {
    return {
      ok: false,
      message: `Need at least ${MIN_CHARS} characters. Currently ${trimmed.length}.`,
    };
  }
  if (trimmed.length > MAX_CHARS) {
    return {
      ok: false,
      message: `Too long. Max ${MAX_CHARS.toLocaleString()} characters.`,
    };
  }
  return { ok: true, message: null };
}

export default function Home() {
  const [view, setView] = useState<View>("analyze");
  const [text, setText] = useState(SAMPLE);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function onAnalyze() {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const g = await analyze(text);
      setGraph(g);
      setTab("all");
      setView("analyze");
      setHistory((prev) => addToHistory(prev, text, g));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function onNewAnalysis() {
    setGraph(null);
    setText("");
    setSelected(null);
    setError(null);
    setView("analyze");
  }

  function onPickExample(ex: Example) {
    setText(ex.text);
    setGraph(null);
    setSelected(null);
    setError(null);
    setView("analyze");
  }

  function onPickHistory(entry: HistoryEntry) {
    setText(entry.text);
    setGraph(entry.graph);
    setSelected(null);
    setError(null);
    setTab("all");
    setView("analyze");
  }

  function onClearHistory() {
    clearHistory();
    setHistory([]);
  }

  const counts = graph ? countTypes(graph) : null;
  const validation = validateText(text);
  const canAnalyze = validation.ok && !loading;

  return (
    <div className="h-screen flex bg-[#0a0a0b] text-[#ededf0]">
      <LeftSidebar
        activeView={view}
        onNavigate={setView}
        onNewAnalysis={onNewAnalysis}
        historyCount={history.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-[#1e1e22] h-14 px-5 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[#ededf0] truncate">
              {view === "analyze"
                ? graph?.title ?? "Untitled analysis"
                : view === "examples"
                ? "Examples"
                : view === "history"
                ? "History"
                : "Documentation"}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#71717a] font-mono shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
            gemini-3.5-flash-lite
          </div>
        </header>

        {view === "analyze" && (
          <div className="border-b border-[#1e1e22] px-5 py-4 shrink-0">
            <div className="flex gap-3 items-stretch">
              <div className="flex-1 relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste an argument. See its structure."
                  spellCheck={false}
                  className="w-full bg-[#0f0f11] border border-[#1e1e22] focus:border-[#2a2a30] rounded-md px-3 py-2.5 text-[12px] leading-relaxed text-[#ededf0] placeholder:text-[#4d4d55] resize-y min-h-[100px] max-h-[320px] outline-none transition-colors"
                  rows={4}
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      validation.ok
                        ? "text-[#4d4d55] bg-[#0f0f11]"
                        : "text-[#f87171] bg-[#1a0f0f]"
                    }`}
                  >
                    {text.length}/{MAX_CHARS}
                  </span>
                </div>
              </div>
              <button
                onClick={onAnalyze}
                disabled={!canAnalyze}
                className="shrink-0 bg-[#ededf0] hover:bg-white disabled:bg-[#26262b] disabled:text-[#4d4d55] disabled:cursor-not-allowed text-[#0a0a0b] px-5 rounded-md text-[12px] font-medium transition-colors flex items-center gap-2 min-w-[110px] justify-center"
              >
                {loading ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    Analyzing
                  </>
                ) : (
                  <>
                    Analyze
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            <div className="mt-2 flex items-start gap-2 text-[10px] font-mono text-[#4d4d55] leading-relaxed">
              <span className="shrink-0 text-[#26262b] select-none">example</span>
              <span className="min-w-0">
                1/ @alice: We should ban cars from the city center.
                <br />
                2/ A 2024 study of Madrid found traffic dropped 30%.
                <br />
                3/ @bob: That study was flawed. Retail revenue fell 8%.
              </span>
            </div>

            {!validation.ok && text.length > 0 && (
              <div className="mt-2 text-[11px] text-[#f87171] font-mono">
                {validation.message}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-5 py-2 bg-[#1a0f0f] border-b border-[#3a1a1a] text-[#f87171] text-[11px] font-mono">
            {error}
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            {view === "analyze" && graph && counts && (
              <div className="border-b border-[#1e1e22] px-5 h-11 flex items-center gap-1 text-[11px] shrink-0">
                <TabButton
                  label="Graph"
                  active={tab === "all"}
                  onClick={() => setTab("all")}
                />
                <TabButton
                  label="Claims"
                  count={counts.claim}
                  active={tab === "claims"}
                  onClick={() => setTab("claims")}
                />
                <TabButton
                  label="Evidence"
                  count={counts.evidence}
                  active={tab === "evidence"}
                  onClick={() => setTab("evidence")}
                />
                <TabButton
                  label="Fallacies"
                  count={counts.fallacy + counts.rhetoric}
                  active={tab === "fallacies"}
                  onClick={() => setTab("fallacies")}
                />

                <div className="ml-auto font-mono text-[10px] text-[#4d4d55]">
                  {tab === "all" ? "viewing: all units" : `filtering: ${tab}`}
                </div>
              </div>
            )}

            <div className="flex-1 relative min-h-0">
              {view === "analyze" && (
                <>
                  {graph ? (
                    <GraphView
                      graph={graph}
                      onNodeClick={setSelected}
                      tab={tab}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-sm">
                        <div className="text-[#4d4d55] text-[12px] mb-1">
                          No analysis yet
                        </div>
                        <div className="text-[#26262b] text-[11px]">
                          Paste argumentative text above and click Analyze.
                        </div>
                      </div>
                    </div>
                  )}

                  {loading && <AnalyzingOverlay />}
                </>
              )}

              {view === "examples" && (
                <ExamplesView onPick={onPickExample} />
              )}

              {view === "history" && (
                <HistoryView
                  entries={history}
                  onPick={onPickHistory}
                  onClear={onClearHistory}
                />
              )}

              {view === "docs" && <DocsView />}
            </div>
          </div>

          {view === "analyze" && graph && (
            <RightPanel graph={graph} onSelectNode={setSelected} />
          )}
        </div>
      </div>

      {selected && (
        <NodeDrawer node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 h-7 rounded-md flex items-center gap-1.5 transition-colors ${
        active
          ? "bg-[#141417] text-[#ededf0]"
          : "text-[#71717a] hover:text-[#a1a1aa] hover:bg-[#0f0f11]"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[10px] text-[#4d4d55]">
          {count}
        </span>
      )}
    </button>
  );
}

function NodeDrawer({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-[#0f0f11] border-l border-[#1e1e22] z-50 flex flex-col">
      <div className="h-14 border-b border-[#1e1e22] px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#71717a]">
          <span>node</span>
          <span className="text-[#ededf0]">
            {node.id.toString().padStart(2, "0")}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-[#71717a] hover:text-[#ededf0] hover:bg-[#141417] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <div className="text-[10px] font-medium tracking-wider text-[#4d4d55] uppercase mb-2">
            Metadata
          </div>
          <div className="space-y-1.5 text-[11px] font-mono">
            <Row label="type" value={node.type} />
            <Row label="source" value={node.source_type} />
            {node.source_name && (
              <Row label="ref" value={node.source_name} />
            )}
            {node.speaker && <Row label="speaker" value={node.speaker} />}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-medium tracking-wider text-[#4d4d55] uppercase mb-2">
            Text
          </div>
          <div className="text-[12px] leading-relaxed text-[#ededf0] border-l-2 border-[#1e1e22] pl-3">
            {node.text}
          </div>
        </div>

        {node.orphan && (
          <div className="border border-[#3a1a1a] bg-[#1a0f0f] rounded-md p-3">
            <div className="text-[10px] font-medium tracking-wider text-[#f87171] uppercase mb-1">
              Unattached
            </div>
            <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
              No supporting evidence was linked to this claim.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#4d4d55]">{label}</span>
      <span className="text-[#a1a1aa] truncate ml-4">{value}</span>
    </div>
  );
}

function countTypes(graph: Graph) {
  const c: Record<string, number> = {
    claim: 0,
    evidence: 0,
    assumption: 0,
    fallacy: 0,
    counterpoint: 0,
    question: 0,
    rhetoric: 0,
    aside: 0,
    speakers: 0,
  };
  const seen = new Set<string>();
  graph.nodes.forEach((n) => {
    if (n.type in c) c[n.type] += 1;
    if (n.speaker) seen.add(n.speaker);
  });
  c.speakers = seen.size;
  return c;
}