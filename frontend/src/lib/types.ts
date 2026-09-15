export type NodeType =
  | "claim"
  | "evidence"
  | "assumption"
  | "fallacy"
  | "question"
  | "counterpoint"
  | "aside"
  | "rhetoric";

export type SourceType = "none" | "vague" | "specific";

export type EdgeKind =
  | "supports"
  | "attacks"
  | "restates"
  | "challenges"
  | "based_on"
  | "contains"
  | "contradicts"
  | "uses";

export interface GraphNode {
  id: number;
  type: NodeType;
  text: string;
  source_type: SourceType;
  source_name?: string | null;
  speaker: string | null;
  summary: string;
  orphan: boolean;
}

export interface GraphEdge {
  source: number;
  target: number;
  kind: EdgeKind;
  reason?: string;
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  claim_indices: number[];
  evidence_indices: number[];
  orphan_claim_indices: number[];
  load_bearing_claim: number | null;
  evidence_coverage: number;
}

export interface Graph {
  title?: string;
  summary?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}