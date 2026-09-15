"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "dagre";
import type { Graph, GraphNode } from "@/lib/types";
import { RichNode } from "./RichNode";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 140;

const nodeTypes = { custom: RichNode };

const EDGE_COLORS: Record<string, string> = {
  supports: "#34d399",
  attacks: "#f87171",
  restates: "#a78bfa",
  challenges: "#fbbf24",
  based_on: "#a78bfa",
  contains: "#fbbf24",
  contradicts: "#f87171",
  uses: "#fbbf24",
};

const EDGE_LABELS: Record<string, string> = {
  supports: "supports",
  attacks: "attacks",
  restates: "restates",
  challenges: "challenges",
  based_on: "based on",
  contains: "contains",
  contradicts: "contradicts",
  uses: "uses",
};

export type TabKey = "all" | "claims" | "evidence" | "fallacies";

function buildLayout(graph: Graph): { nodes: Node[]; edges: Edge[] } {
  const connectedIds = new Set<number>();
  graph.edges.forEach((e) => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  const connected = graph.nodes.filter((n) => connectedIds.has(n.id));
  const isolated = graph.nodes.filter((n) => !connectedIds.has(n.id));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 90,
    ranksep: 180,
    marginx: 60,
    marginy: 60,
    edgesep: 30,
  });

  connected.forEach((n) =>
    g.setNode(String(n.id), { width: NODE_WIDTH, height: NODE_HEIGHT })
  );
  graph.edges.forEach((e) => {
    if (connectedIds.has(e.source) && connectedIds.has(e.target)) {
      g.setEdge(String(e.source), String(e.target));
    }
  });
  dagre.layout(g);

  const nodes: Node[] = [];

  connected.forEach((n) => {
    const pos = g.node(String(n.id));
    nodes.push({
      id: String(n.id),
      type: "custom",
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { node: n, dimmed: false },
    });
  });

  // Isolated nodes get parked in a column below the main graph.
  const maxY =
    connected.length > 0
      ? Math.max(...connected.map((n) => g.node(String(n.id)).y)) + 240
      : 0;
  isolated.forEach((n, i) => {
    nodes.push({
      id: String(n.id),
      type: "custom",
      position: {
        x: i * (NODE_WIDTH + 40),
        y: maxY,
      },
      data: { node: n, dimmed: false },
    });
  });

  const edges: Edge[] = graph.edges.map((e, i) => {
    const color = EDGE_COLORS[e.kind] ?? "#4d4d55";
    const style: CSSProperties = {
      stroke: color,
      strokeWidth: 1.5,
      opacity: 0.7,
    };
    if (e.kind === "restates" || e.kind === "based_on") {
      style.strokeDasharray = "4 4";
    }

    return {
      id: `e-${i}`,
      source: String(e.source),
      target: String(e.target),
      style,
      data: { kind: e.kind },
      label: EDGE_LABELS[e.kind] ?? e.kind,
      labelStyle: {
        fill: color,
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
      },
      labelBgStyle: {
        fill: "#0a0a0b",
        fillOpacity: 1,
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 14,
        height: 14,
      },
    };
  });

  return { nodes, edges };
}

function filterForTab(tab: TabKey): (n: GraphNode) => boolean {
  switch (tab) {
    case "claims":
      return (n) => n.type === "claim";
    case "evidence":
      return (n) => n.type === "evidence";
    case "fallacies":
      return (n) => n.type === "fallacy" || n.type === "rhetoric";
    case "all":
    default:
      return () => true;
  }
}

export function GraphView({
  graph,
  onNodeClick,
  tab = "all",
}: {
  graph: Graph;
  onNodeClick?: (n: GraphNode) => void;
  tab?: TabKey;
}) {
  const layout = useMemo(() => buildLayout(graph), [graph]);
  const match = useMemo(() => filterForTab(tab), [tab]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const gNode = node.data.node as GraphNode;
        return {
          ...node,
          data: { ...node.data, dimmed: !match(gNode) },
        };
      })
    );
    setEdges((prev) =>
      prev.map((edge) => {
        const kind = (edge.data?.kind as string) ?? "supports";
        const srcNode = graph.nodes.find((n) => String(n.id) === edge.source);
        const tgtNode = graph.nodes.find((n) => String(n.id) === edge.target);
        const hidden =
          (srcNode && !match(srcNode)) || (tgtNode && !match(tgtNode));
        return {
          ...edge,
          style: { ...edge.style, opacity: hidden ? 0.05 : 0.7 },
          label: hidden ? "" : EDGE_LABELS[kind] ?? kind,
        };
      })
    );
  }, [match, graph.nodes, setNodes, setEdges]);

  const handleClick = useCallback(
    (_: unknown, node: Node) => onNodeClick?.(node.data.node as GraphNode),
    [onNodeClick]
  );

  const resetLayout = useCallback(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        style={{ background: "transparent" }}
      >
        <Background gap={32} size={1} color="#17171a" />
        <Controls
          showInteractive={false}
          position="bottom-right"
          style={{
            background: "transparent",
            border: "1px solid #1e1e22",
            borderRadius: 6,
            overflow: "hidden",
          }}
        />
      </ReactFlow>

      <button
        onClick={resetLayout}
        className="absolute top-3 right-3 border border-[#1e1e22] bg-[#0f0f11] hover:bg-[#141417] hover:border-[#2a2a30] text-[#a1a1aa] hover:text-[#ededf0] text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-colors"
        title="Reset node positions to auto-layout"
      >
        reset layout
      </button>

      <Legend />
    </div>
  );
}

function Legend() {
  const types = [
    { color: "#f472b6", label: "Claim" },
    { color: "#34d399", label: "Evidence" },
    { color: "#a78bfa", label: "Assumption" },
    { color: "#fbbf24", label: "Fallacy" },
    { color: "#94a3b8", label: "Counterpoint" },
  ];
  const edges = [
    { color: "#34d399", label: "Supports", dashed: false },
    { color: "#f87171", label: "Attacks", dashed: false },
    { color: "#a78bfa", label: "Restates", dashed: true },
  ];

  return (
    <div className="absolute bottom-4 left-4 border border-[#1e1e22] bg-[#0f0f11] rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-[#1e1e22]">
        <div className="text-[9px] font-medium tracking-wider text-[#4d4d55] uppercase mb-1.5">
          Nodes
        </div>
        <div className="space-y-1">
          {types.map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: t.color }}
              />
              <span className="text-[10px] text-[#a1a1aa]">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[9px] font-medium tracking-wider text-[#4d4d55] uppercase mb-1.5">
          Edges
        </div>
        <div className="space-y-1">
          {edges.map((e) => (
            <div key={e.label} className="flex items-center gap-2">
              <span
                className="w-4 h-px"
                style={{
                  background: e.color,
                  opacity: e.dashed ? 0.5 : 1,
                }}
              />
              <span className="text-[10px] text-[#a1a1aa]">{e.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}