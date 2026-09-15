"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@/lib/types";

const NODE_WIDTH = 260;

type Accent = {
  color: string;
  label: string;
};

const ACCENTS: Record<string, Accent> = {
  claim: { color: "#f472b6", label: "CLAIM" },
  evidence: { color: "#34d399", label: "EVIDENCE" },
  assumption: { color: "#a78bfa", label: "ASSUMPTION" },
  fallacy: { color: "#fbbf24", label: "FALLACY" },
  counterpoint: { color: "#94a3b8", label: "COUNTERPOINT" },
  question: { color: "#a78bfa", label: "QUESTION" },
  rhetoric: { color: "#fbbf24", label: "RHETORIC" },
  aside: { color: "#71717a", label: "ASIDE" },
};

export function RichNode({ data, selected }: NodeProps) {
  const node = data.node as GraphNode;
  const dimmed = (data.dimmed as boolean) ?? false;
  const a = ACCENTS[node.type] ?? ACCENTS.aside;

  return (
    <div
      className="relative transition-opacity duration-150"
      style={{
        width: NODE_WIDTH,
        opacity: dimmed ? 0.15 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "transparent",
          border: "none",
          width: 1,
          height: 1,
        }}
      />

      <div
        className="bg-[#0f0f11] border rounded-lg overflow-hidden"
        style={{
          borderColor: selected ? "#3a3a42" : "#1e1e22",
        }}
      >
        {/* accent stripe */}
        <div
          className="h-[2px] w-full"
          style={{ background: a.color, opacity: dimmed ? 0.3 : 1 }}
        />

        <div className="px-3 py-2.5">
          {/* header row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: a.color }}
              />
              <span className="text-[10px] font-medium tracking-wide text-[#71717a] truncate">
                {a.label}
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#4d4d55] shrink-0">
              {node.id.toString().padStart(2, "0")}
            </span>
          </div>

          {/* body */}
          <div className="text-[12px] leading-[1.5] text-[#ededf0] mb-2">
            {node.summary || node.text}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {node.speaker && (
                <span className="text-[10px] font-mono text-[#a1a1aa] truncate">
                  {node.speaker}
                </span>
              )}
              {!node.speaker && node.source_name && (
                <span className="text-[10px] font-mono text-[#a1a1aa] truncate">
                  {node.source_name}
                </span>
              )}
            </div>
            {node.orphan && (
              <span className="text-[9px] font-medium tracking-wide text-[#f87171] shrink-0">
                UNATTACHED
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "transparent",
          border: "none",
          width: 1,
          height: 1,
        }}
      />
    </div>
  );
}