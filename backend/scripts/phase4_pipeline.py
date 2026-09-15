"""
Phase 4: End-to-end pipeline.

Runs Phase 1 (classify), Phase 2 (restatements), Phase 3 (links),
generates a title and summary, computes derived graph properties,
caches by input hash, and emits a single JSON document.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from google.genai import types

from phase1_classify import (  # type: ignore[import-not-found]
    ARTIFACTS_DIR,
    DEFAULT_MODEL,
    LLMConfigError,
    Unit,
    UnitType,
    classify_units,
    extract_speakers_and_clean,
    get_client,
    segment_text,
)
from phase2_restatements import find_restatements  # type: ignore[import-not-found]
from phase3_links import (  # type: ignore[import-not-found]
    DEFAULT_SIM_FLOOR,
    DEFAULT_TOP_K,
    EMBED_MODEL,
    Relation,
    get_link_verdicts,
    shortlist_pairs,
)

load_dotenv()

DEFAULT_THRESHOLD = 0.80

CACHE_DIR = ARTIFACTS_DIR / "cache"
CACHE_SCHEMA_VERSION = "v=5"


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
def cache_key(text: str, threshold: float, top_k: int, sim_floor: float) -> str:
    payload = "|".join(
        [
            CACHE_SCHEMA_VERSION,
            text,
            f"thr={threshold}",
            f"topk={top_k}",
            f"floor={sim_floor}",
            f"model={DEFAULT_MODEL}",
            f"embed={EMBED_MODEL}",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_cached(key: str) -> dict | None:
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def store_cached(key: str, graph: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(graph, indent=2), encoding="utf-8")


def clear_cache() -> int:
    if not CACHE_DIR.exists():
        return 0
    count = 0
    for p in CACHE_DIR.glob("*.json"):
        p.unlink()
        count += 1
    return count


# ---------------------------------------------------------------------------
# Title + Summary generation
# ---------------------------------------------------------------------------
TITLE_SYSTEM_INSTRUCTION = (
    "Generate a short, specific title for an argument analysis. "
    "The title should name the central disagreement in <= 12 words. "
    "Return ONLY the title, no quotes, no period."
)

SUMMARY_SYSTEM_INSTRUCTION = """You are a neutral analyst.

You will receive a piece of argumentative text. Write a short, objective
summary of what the disagreement is about.

Rules:
1. Two to three sentences. No more.
2. Describe the topic, the main positions being argued, and what is at
   stake. Do NOT take a side.
3. Do NOT evaluate which side is correct.
4. Do NOT use first person ("I", "we").
5. Do NOT repeat the speakers' names unless they are central.
6. Plain prose, no bullet points, no markdown, no quotes.
"""


def generate_title(
    client,
    units: list[Unit],
    model: str = DEFAULT_MODEL,
) -> str:
    preview = " ".join(u.text for u in units[:4])[:600]

    config = types.GenerateContentConfig(
        temperature=0.4,
        max_output_tokens=40,
        system_instruction=TITLE_SYSTEM_INSTRUCTION,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            disable=True
        ),
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=f"Argument text:\n\n{preview}\n\nTitle:",
            config=config,
        )
        title = (response.text or "").strip().strip('"').rstrip(".")
        return title or "Argument Analysis"
    except Exception:
        return "Argument Analysis"


def generate_summary(
    client,
    units: list[Unit],
    model: str = DEFAULT_MODEL,
) -> str:
    """One LLM call to produce a neutral summary of the argument."""
    preview = " ".join(u.text for u in units)[:2000]

    config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=160,
        system_instruction=SUMMARY_SYSTEM_INSTRUCTION,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            disable=True
        ),
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=f"Argument text:\n\n{preview}\n\nSummary:",
            config=config,
        )
        summary = (response.text or "").strip().strip('"')
        return summary or ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------
def build_graph(
    client,
    units: list[Unit],
    threshold: float = DEFAULT_THRESHOLD,
    top_k: int = DEFAULT_TOP_K,
    sim_floor: float = DEFAULT_SIM_FLOOR,
) -> dict:
    units = extract_speakers_and_clean(units)

    classification = classify_units(client, units)
    clf_by_index = {c.index: c for c in classification.units}

    claim_indices = [
        c.index for c in classification.units if c.type == UnitType.CLAIM
    ]
    evidence_indices = [
        c.index for c in classification.units if c.type == UnitType.EVIDENCE
    ]

    title = generate_title(client, units)
    summary = generate_summary(client, units)

    restatements = (
        find_restatements(client, units, claim_indices, threshold=threshold)
        if len(claim_indices) >= 2
        else []
    )

    pairs = (
        shortlist_pairs(
            client,
            units,
            claim_indices,
            evidence_indices,
            top_k=top_k,
            sim_floor=sim_floor,
        )
        if claim_indices and evidence_indices
        else []
    )
    verdicts = get_link_verdicts(client, pairs) if pairs else []

    nodes: list[dict] = []
    for u in units:
        c = clf_by_index.get(u.index)
        if c is None:
            continue
        nodes.append(
            {
                "id": u.index,
                "type": c.type.value,
                "text": u.text,
                "source_type": c.source_type.value,
                "source_name": c.source_name,
                "speaker": u.speaker,
                "summary": c.summary,
                "orphan": False,
            }
        )

    edges: list[dict] = []

    for r in restatements:
        edges.append(
            {
                "source": r.index_a,
                "target": r.index_b,
                "kind": "restates",
                "reason": f"Same claim, paraphrased (sim {r.similarity:.2f})",
            }
        )

    for v in verdicts:
        if v.relation == Relation.IRRELEVANT:
            continue
        edges.append(
            {
                "source": v.evidence_index,
                "target": v.claim_index,
                "kind": v.relation.value,
                "reason": v.reason,
            }
        )

    support_targets = {e["target"] for e in edges if e["kind"] == "supports"}
    orphan_claims = [idx for idx in claim_indices if idx not in support_targets]

    degree: dict[int, int] = defaultdict(int)
    for e in edges:
        degree[e["source"]] += 1
        degree[e["target"]] += 1
    claim_degrees = {idx: degree[idx] for idx in claim_indices}
    load_bearing = (
        max(claim_degrees, key=claim_degrees.get) if claim_degrees else None
    )

    coverage = (
        len(support_targets) / len(claim_indices) if claim_indices else 0.0
    )

    for n in nodes:
        if n["id"] in orphan_claims:
            n["orphan"] = True

    return {
        "title": title,
        "summary": summary,
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "claim_indices": claim_indices,
            "evidence_indices": evidence_indices,
            "orphan_claim_indices": orphan_claims,
            "load_bearing_claim": load_bearing,
            "evidence_coverage": round(coverage, 3),
        },
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def print_summary(graph: dict) -> None:
    nodes = graph["nodes"]
    edges = graph["edges"]
    stats = graph["stats"]

    print("\n--- Graph summary ---")
    print(f"  Title:   {graph.get('title', '(untitled)')}")
    if graph.get("summary"):
        print(f"  Summary: {graph['summary']}")
    print(f"  Nodes:   {stats['node_count']}")
    print(f"  Edges:   {stats['edge_count']}")
    print(f"  Claims:   {stats['claim_indices']}")
    print(f"  Evidence: {stats['evidence_indices']}")

    lb = stats["load_bearing_claim"]
    if lb is not None:
        lb_text = next((n["text"] for n in nodes if n["id"] == lb), "")
        print(f"  Load-bearing claim: [{lb}] {lb_text}")

    orphans = stats["orphan_claim_indices"]
    if orphans:
        print(f"  Orphan claims: {orphans}")
    else:
        print("  Orphan claims: (none)")

    print(f"  Evidence coverage: {stats['evidence_coverage']:.2f}")

    by_kind: dict[str, int] = defaultdict(int)
    for e in edges:
        by_kind[e["kind"]] += 1
    if by_kind:
        print("  Edge breakdown:")
        for kind, count in sorted(by_kind.items()):
            print(f"    {kind:<10} {count}")


def save_graph(graph: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    print(f"\nSaved graph: {path}")


SAMPLE_TEXT = """1/ @User123: Government spending is the real cause of inflation.
2/ Cites 2021-2024 federal spending data (US Treasury).
3/ @AnotherUser: Actually, it's corporate greed, not government spending.
4/ Cites record corporate profits and price markups (from company reports).
5/ Appeal to emotion ("greedy corporations are to blame").
6/ @SomeoneElse: Btw, have you considered that both could be true?
7/ @User123: So basically, government spending is the main driver.
"""


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase 4 pipeline.")
    parser.add_argument("path", nargs="?")
    parser.add_argument("--text")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--sim-floor", type=float, default=DEFAULT_SIM_FLOOR)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--clear-cache", action="store_true")
    return parser.parse_args()


def _read_input(args: argparse.Namespace) -> str:
    if args.text:
        return args.text
    if args.path:
        return Path(args.path).read_text(encoding="utf-8")
    return SAMPLE_TEXT


def main() -> None:
    args = _parse_args()

    if args.clear_cache:
        n = clear_cache()
        print(f"Cleared {n} cache entry(ies).")
        return

    text = _read_input(args)
    units = segment_text(text)
    units = extract_speakers_and_clean(units)
    if not units:
        print("No units detected in the input.", file=sys.stderr)
        sys.exit(1)

    key = cache_key(text, args.threshold, args.top_k, args.sim_floor)

    graph: dict | None = None
    if not args.no_cache:
        graph = load_cached(key)
        if graph is not None:
            print(f"Cache hit ({key[:12]}…)")

    if graph is None:
        print(f"Classifying {len(units)} unit(s)…")
        try:
            client = get_client()
        except LLMConfigError as exc:
            print(f"Configuration error: {exc}", file=sys.stderr)
            sys.exit(1)

        try:
            graph = build_graph(
                client,
                units,
                threshold=args.threshold,
                top_k=args.top_k,
                sim_floor=args.sim_floor,
            )
        except RuntimeError as exc:
            print(f"Pipeline error: {exc}", file=sys.stderr)
            client.close()
            sys.exit(1)

        client.close()
        store_cached(key, graph)

    print_summary(graph)

    if args.json:
        print("\n--- Graph JSON ---")
        print(json.dumps(graph, indent=2))

    if args.save:
        save_graph(graph, ARTIFACTS_DIR / "graph_last.json")


if __name__ == "__main__":
    main()