"use client";

import { useEffect, useState } from "react";

const STAGES = [
  { key: "segment", label: "Segmenting input" },
  { key: "classify", label: "Classifying units" },
  { key: "embed", label: "Embedding claims" },
  { key: "link", label: "Linking evidence" },
  { key: "summarize", label: "Summarizing" },
] as const;

const STAGE_MS = 2400;

export function AnalyzingOverlay() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, STAGE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const progress = ((stageIndex + 1) / STAGES.length) * 100;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/90 backdrop-blur-[2px] z-10 animate-[fadeIn_180ms_ease-out]">
      <div className="w-[320px] border border-[#1e1e22] bg-[#0f0f11] rounded-lg overflow-hidden">
        <div className="h-[2px] w-full bg-[#1e1e22] overflow-hidden">
          <div
            className="h-full bg-[#ededf0] transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, opacity: 0.7 }}
          />
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717a]">
              analyzing
            </span>
          </div>

          <div className="space-y-2.5">
            {STAGES.map((stage, i) => {
              const state =
                i < stageIndex
                  ? "done"
                  : i === stageIndex
                  ? "active"
                  : "pending";
              return (
                <StageRow key={stage.key} label={stage.label} state={state} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageRow({
  label,
  state,
}: {
  label: string;
  state: "pending" | "active" | "done";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-3 h-3 flex items-center justify-center shrink-0">
        {state === "done" && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#34d399"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
        {state === "active" && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#ededf0] animate-pulse" />
        )}
        {state === "pending" && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#26262b]" />
        )}
      </span>

      <span
        className={`text-[11px] transition-colors ${
          state === "done"
            ? "text-[#71717a]"
            : state === "active"
            ? "text-[#ededf0]"
            : "text-[#4d4d55]"
        }`}
      >
        {label}
      </span>

      {state === "active" && (
        <span className="ml-auto flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-0.5 h-3 bg-[#ededf0] rounded-full"
              style={{
                animation: `pulseBar 1s ease-in-out infinite`,
                animationDelay: `${i * 120}ms`,
              }}
            />
          ))}
        </span>
      )}
    </div>
  );
}