"use client";

import type { Graph, GraphNode } from "@/lib/types";

// ---------- Icons ----------
function IconBook() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" />
      <path d="M4 17a3 3 0 0 1 3-3h11" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
function IconDocs() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconWarn() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 9v5M12 17.5v.5" />
    </svg>
  );
}
function IconRepeat() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export type View = "analyze" | "history" | "examples" | "docs";

// ---------- Left sidebar ----------
export function LeftSidebar({
  activeView,
  onNavigate,
  onNewAnalysis,
  historyCount,
}: {
  activeView: View;
  onNavigate: (v: View) => void;
  onNewAnalysis: () => void;
  historyCount: number;
}) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-[#1e1e22] bg-[#0a0a0b] flex flex-col">
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-[#1e1e22]">
        <div className="w-6 h-6 rounded-md bg-[#ededf0] flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18M5 8l7-5 7 5M3 10h6a3 3 0 0 1 0 6H3M15 10h6a3 3 0 0 0 0 6h-6" />
          </svg>
        </div>
        <div className="text-[13px] font-medium tracking-tight text-[#ededf0]">
          Rhetoric
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={onNewAnalysis}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-[#141417] hover:bg-[#1a1a1e] border border-[#1e1e22] text-[#ededf0] text-[12px] font-medium transition-colors"
        >
          <IconPlus />
          New analysis
        </button>
      </div>

      <nav className="px-3 pb-3 space-y-px">
        <NavItem
          icon={<IconPen />}
          label="Analyze"
          active={activeView === "analyze"}
          onClick={() => onNavigate("analyze")}
        />
        <NavItem
          icon={<IconBook />}
          label="Examples"
          active={activeView === "examples"}
          onClick={() => onNavigate("examples")}
        />
        <NavItem
          icon={<IconClock />}
          label="History"
          active={activeView === "history"}
          onClick={() => onNavigate("history")}
          badge={historyCount > 0 ? historyCount : undefined}
        />
        <NavItem
          icon={<IconDocs />}
          label="Docs"
          active={activeView === "docs"}
          onClick={() => onNavigate("docs")}
        />
      </nav>

      <div className="mt-auto">
        <div className="border-t border-[#1e1e22]" />
        <div className="p-3">
          <div className="text-[10px] font-medium tracking-wider text-[#4d4d55] uppercase px-1 mb-2">
            Supported formats
          </div>
          <ul className="space-y-px">
            <SourceItem label="Twitter / X thread" />
            <SourceItem label="Reddit discussion" />
            <SourceItem label="Debate transcript" />
            <SourceItem label="News article / op-ed" />
            <SourceItem label="YouTube transcript" />
          </ul>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
        active
          ? "bg-[#141417] text-[#ededf0]"
          : "text-[#71717a] hover:text-[#ededf0] hover:bg-[#141417]"
      }`}
    >
      <span className={active ? "text-[#ededf0]" : "text-[#71717a]"}>
        {icon}
      </span>
      <span className="text-[12px]">{label}</span>
      {badge !== undefined && (
        <span className="ml-auto font-mono text-[10px] text-[#4d4d55]">
          {badge}
        </span>
      )}
    </button>
  );
}

function SourceItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#71717a]">
      <span className="w-1 h-1 rounded-full bg-[#26262b]" />
      <span className="text-[11px]">{label}</span>
    </li>
  );
}

// ---------- Right panel ----------
export function RightPanel({
  graph,
  onSelectNode,
}: {
  graph: Graph;
  onSelectNode: (n: GraphNode) => void;
}) {
  const orphans = graph.stats.orphan_claim_indices;
  const restates = graph.edges.filter((e) => e.kind === "restates");
  const counts = countByType(graph);
  const speakers = speakersOf(graph);
  const fallacies = graph.nodes.filter(
    (n) => n.type === "fallacy" || n.type === "rhetoric"
  );

  const hasInsights =
    restates.length > 0 || orphans.length > 0 || fallacies.length > 0;

  return (
    <aside className="w-[300px] shrink-0 border-l border-[#1e1e22] bg-[#0a0a0b] overflow-y-auto overflow-x-hidden">
      <div className="divide-y divide-[#1e1e22]">
        <Section title="Summary">
          <p className="text-[11px] text-[#a1a1aa] leading-relaxed px-1 break-words">
            {graph.summary || "No summary generated."}
          </p>
        </Section>

        <Section title="Insights">
          {!hasInsights && (
            <p className="text-[11px] text-[#4d4d55] italic px-1">
              No warnings detected.
            </p>
          )}
          {restates.length > 0 && (
            <InsightRow
              color="#a78bfa"
              icon={<IconRepeat />}
              title="Restated claim"
              body={`#${restates[0].source} and #${restates[0].target} make the same point in different words.`}
              onClick={() =>
                onSelectNode(
                  graph.nodes.find((n) => n.id === restates[0].source)!
                )
              }
            />
          )}
          {orphans.length > 0 && (
            <InsightRow
              color="#f87171"
              icon={<IconWarn />}
              title="Unattached claim"
              body={`#${orphans[0]} has no supporting evidence.`}
              onClick={() =>
                onSelectNode(graph.nodes.find((n) => n.id === orphans[0])!)
              }
            />
          )}
          {fallacies.length > 0 && (
            <InsightRow
              color="#fbbf24"
              icon={<IconWarn />}
              title="Fallacies"
              body={`${fallacies.length} unit${
                fallacies.length > 1 ? "s" : ""
              } flagged: ${fallacies[0].summary}`}
              onClick={() => onSelectNode(fallacies[0])}
            />
          )}
        </Section>

        {speakers.length > 0 && (
          <Section title="Speakers">
            <div className="text-[10px] font-mono text-[#4d4d55] px-1 mb-1.5">
              {speakers.length} distinct
            </div>
            <div className="space-y-px">
              {speakers.slice(0, 8).map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-2 px-1 py-1 text-[11px] text-[#a1a1aa] min-w-0"
                >
                  <span className="w-1 h-1 rounded-full bg-[#26262b] shrink-0" />
                  <span className="truncate font-mono">{s}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Breakdown">
          <div className="space-y-px">
            <CountRow color="#f472b6" label="Claims" value={counts.claim} />
            <CountRow color="#34d399" label="Evidence" value={counts.evidence} />
            <CountRow
              color="#a78bfa"
              label="Assumptions"
              value={counts.assumption}
            />
            <CountRow
              color="#fbbf24"
              label="Fallacies"
              value={counts.fallacy + counts.rhetoric}
            />
            <CountRow
              color="#94a3b8"
              label="Counterpoints"
              value={counts.counterpoint}
            />
          </div>
        </Section>

        <Section title="Coverage">
          <div className="px-1">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[22px] font-medium tracking-tight text-[#ededf0]">
                {(graph.stats.evidence_coverage * 100).toFixed(0)}
                <span className="text-[14px] text-[#71717a]">%</span>
              </span>
              <span className="text-[10px] font-mono text-[#4d4d55]">
                claims with evidence
              </span>
            </div>
            <div className="h-[3px] rounded-full bg-[#1e1e22] overflow-hidden">
              <div
                className="h-full bg-[#ededf0] rounded-full transition-all"
                style={{
                  width: `${graph.stats.evidence_coverage * 100}%`,
                  opacity: 0.85,
                }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-mono">
              <Stat label="nodes" value={graph.stats.node_count} />
              <Stat label="edges" value={graph.stats.edge_count} />
            </div>
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 min-w-0">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="text-[10px] font-medium tracking-wider text-[#4d4d55] uppercase">
          {title}
        </div>
      </div>
      <div className="space-y-2 min-w-0 break-words">{children}</div>
    </div>
  );
}

function InsightRow({
  color,
  icon,
  title,
  body,
  onClick,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left border border-[#1e1e22] hover:border-[#2a2a30] bg-[#0f0f11] hover:bg-[#141417] rounded-md p-2.5 transition-colors min-w-0"
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] font-medium text-[#ededf0]">
          {title}
        </span>
      </div>
      <p className="text-[11px] text-[#71717a] leading-relaxed break-words">
        {body}
      </p>
    </button>
  );
}

function CountRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between px-1 py-1">
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
        />
        <span className="text-[11px] text-[#a1a1aa]">{label}</span>
      </div>
      <span className="text-[11px] font-mono text-[#71717a]">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[#1e1e22] rounded px-2 py-1.5">
      <div className="text-[#4d4d55] text-[9px] uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-[#ededf0] text-[12px]">{value}</div>
    </div>
  );
}

function countByType(graph: Graph): Record<string, number> {
  const counts: Record<string, number> = {
    claim: 0,
    evidence: 0,
    assumption: 0,
    fallacy: 0,
    counterpoint: 0,
    question: 0,
    rhetoric: 0,
    aside: 0,
  };
  graph.nodes.forEach((n) => {
    counts[n.type] = (counts[n.type] ?? 0) + 1;
  });
  return counts;
}

function speakersOf(graph: Graph): string[] {
  const s = new Set<string>();
  graph.nodes.forEach((n) => {
    if (n.speaker) s.add(n.speaker);
  });
  return Array.from(s);
}