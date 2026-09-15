"""
Phase 3: Evidence-to-claim linking.

For each CLAIM unit, retrieve the top-k most similar EVIDENCE units
(via embeddings), then ask the model whether each pair is:
    supports    — the evidence supports the claim
    attacks     — the evidence undermines the claim
    irrelevant  — no meaningful relationship

Output: an edge list, ready to feed the graph renderer.

Run:
    python scripts/phase3_links.py                    # built-in sample
    python scripts/phase3_links.py path/to/file.txt
    python scripts/phase3_links.py --text "..."
    python scripts/phase3_links.py --top-k 2          # limit shortlist
    python scripts/phase3_links.py --save
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from enum import Enum
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

# Reuse Phase 1
from phase1_classify import (  # type: ignore[import-not-found]
    ARTIFACTS_DIR,
    DEFAULT_MODEL,
    LLMConfigError,
    Unit,
    UnitType,
    classify_units,
    get_client,
    segment_text,
)

load_dotenv()

EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
DEFAULT_TOP_K = 3
DEFAULT_SIM_FLOOR = 0.30  # below this, don't even ask the model


# ---------------------------------------------------------------------------
# Edge model
# ---------------------------------------------------------------------------
class Relation(str, Enum):
    SUPPORTS = "supports"
    ATTACKS = "attacks"
    IRRELEVANT = "irrelevant"


class LinkVerdict(BaseModel):
    """The model's verdict on a single (claim, evidence) pair."""

    claim_index: int = Field(description="Index of the claim unit.")
    evidence_index: int = Field(description="Index of the evidence unit.")
    relation: Relation = Field(description="supports / attacks / irrelevant.")
    reason: str = Field(
        description="One short sentence justifying the relation (<= 20 words)."
    )


class LinkBatch(BaseModel):
    """Batch response for all (claim, evidence) pairs sent in one request."""

    verdicts: list[LinkVerdict]


# ---------------------------------------------------------------------------
# Embeddings + similarity
# ---------------------------------------------------------------------------
def embed_texts(
    client: genai.Client,
    texts: list[str],
    model: str = EMBED_MODEL,
) -> list[list[float]]:
    if not texts:
        return []
    try:
        result = client.models.embed_content(
            model=model,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type="SEMANTIC_SIMILARITY"
            ),
        )
    except Exception as exc:
        raise RuntimeError(f"Embedding request failed: {exc}") from exc
    return [list(e.values) for e in result.embeddings]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)


# ---------------------------------------------------------------------------
# Retrieval — shortlist (claim, evidence) pairs by embedding similarity
# ---------------------------------------------------------------------------
class CandidatePair:
    def __init__(
        self,
        claim_index: int,
        claim_text: str,
        evidence_index: int,
        evidence_text: str,
        similarity: float,
    ) -> None:
        self.claim_index = claim_index
        self.claim_text = claim_text
        self.evidence_index = evidence_index
        self.evidence_text = evidence_text
        self.similarity = similarity


def shortlist_pairs(
    client: genai.Client,
    units: list[Unit],
    claim_indices: list[int],
    evidence_indices: list[int],
    top_k: int = DEFAULT_TOP_K,
    sim_floor: float = DEFAULT_SIM_FLOOR,
) -> list[CandidatePair]:
    """For each claim, take the top-k most similar evidence units."""
    if not claim_indices or not evidence_indices:
        return []

    claim_units = [u for u in units if u.index in claim_indices]
    evidence_units = [u for u in units if u.index in evidence_indices]

    claim_vecs = embed_texts(client, [u.text for u in claim_units])
    evidence_vecs = embed_texts(client, [u.text for u in evidence_units])

    pairs: list[CandidatePair] = []
    for i, claim in enumerate(claim_units):
        scored = [
            (j, cosine_similarity(claim_vecs[i], evidence_vecs[j]))
            for j in range(len(evidence_units))
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        for j, sim in scored[:top_k]:
            if sim < sim_floor:
                continue
            ev = evidence_units[j]
            pairs.append(
                CandidatePair(
                    claim_index=claim.index,
                    claim_text=claim.text,
                    evidence_index=ev.index,
                    evidence_text=ev.text,
                    similarity=sim,
                )
            )
    return pairs


# ---------------------------------------------------------------------------
# LLM verdict on the shortlist
# ---------------------------------------------------------------------------
LINK_SYSTEM_INSTRUCTION = """You are an argument analyst.

You will receive pairs of (claim, evidence) from a single piece of text.
For each pair, decide the relation of the evidence to the claim:

- supports:   the evidence, if true, increases the plausibility of the claim
- attacks:    the evidence, if true, decreases the plausibility of the claim
- irrelevant: the evidence neither supports nor attacks the claim
              (e.g. they are about different topics, or the evidence is
              used elsewhere in the argument)

Rules:
1. Return exactly one verdict per input pair.
2. Preserve the exact claim_index and evidence_index values you were given.
3. Reasons must be short (<= 20 words), neutral, and specific.
4. Do not invent content. Judge only what is written.
5. "Correlation in the same direction as the claim" is supports.
   "Correlation against the claim" is attacks.
   "No relation" is irrelevant, even if the topics overlap.
"""


def get_link_verdicts(
    client: genai.Client,
    pairs: list[CandidatePair],
    model: str = DEFAULT_MODEL,
) -> list[LinkVerdict]:
    if not pairs:
        return []

    lines = []
    for p in pairs:
        lines.append(
            f"claim_index: {p.claim_index}\n"
            f"  claim: {p.claim_text}\n"
            f"evidence_index: {p.evidence_index}\n"
            f"  evidence: {p.evidence_text}\n"
        )
    user_prompt = (
        f"Classify the relation of evidence to claim for each of the "
        f"{len(pairs)} pairs below.\n\n" + "\n".join(lines)
    )

    config = types.GenerateContentConfig(
        temperature=0.0,
        max_output_tokens=2000,
        system_instruction=LINK_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=LinkBatch,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            disable=True
        ),
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=user_prompt,
            config=config,
        )
    except Exception as exc:
        raise RuntimeError(f"Gemini API request failed: {exc}") from exc

    raw = response.text
    if not raw:
        raise RuntimeError("Gemini returned an empty response.")

    try:
        batch = LinkBatch.model_validate_json(raw)
    except ValidationError as exc:
        raise RuntimeError(
            f"Model returned JSON that failed schema validation: {exc}\n\n"
            f"Raw response:\n{raw}"
        ) from exc

    return batch.verdicts


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def print_links(
    units: list[Unit],
    pairs: list[CandidatePair],
    verdicts: list[LinkVerdict],
) -> None:
    by_index = {u.index: u for u in units}
    by_pair = {(v.claim_index, v.evidence_index): v for v in verdicts}

    # Group by claim
    claims_seen: list[int] = []
    for p in pairs:
        if p.claim_index not in claims_seen:
            claims_seen.append(p.claim_index)

    print(f"\nEdges produced: {len(verdicts)}\n")

    for claim_idx in claims_seen:
        claim = by_index.get(claim_idx)
        if claim is None:
            continue
        print(f"Claim [{claim_idx}]: {claim.text}")

        claim_pairs = [p for p in pairs if p.claim_index == claim_idx]
        claim_pairs.sort(key=lambda p: p.similarity, reverse=True)

        if not claim_pairs:
            print("  (no evidence shortlisted)")
            print()
            continue

        for p in claim_pairs:
            v = by_pair.get((p.claim_index, p.evidence_index))
            if v is None:
                continue
            tag = v.relation.value.upper().ljust(10)
            print(
                f"  {tag} [{p.evidence_index}] {p.evidence_text}"
            )
            print(
                f"             sim={p.similarity:.2f} — {v.reason}"
            )
        print()


def save_artifact(
    units: list[Unit],
    pairs: list[CandidatePair],
    verdicts: list[LinkVerdict],
    path: Path,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    by_index = {u.index: u for u in units}
    by_pair = {(v.claim_index, v.evidence_index): v for v in verdicts}

    payload = {
        "edges": [
            {
                "claim_index": p.claim_index,
                "claim_text": p.claim_text,
                "evidence_index": p.evidence_index,
                "evidence_text": p.evidence_text,
                "similarity": round(p.similarity, 4),
                "relation": (
                    by_pair[(p.claim_index, p.evidence_index)].relation.value
                    if (p.claim_index, p.evidence_index) in by_pair
                    else None
                ),
                "reason": (
                    by_pair[(p.claim_index, p.evidence_index)].reason
                    if (p.claim_index, p.evidence_index) in by_pair
                    else None
                ),
            }
            for p in pairs
        ]
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved artifact: {path}")


# ---------------------------------------------------------------------------
# Sample input — mix of supporting, attacking, and irrelevant evidence
# ---------------------------------------------------------------------------
SAMPLE_TEXT = """1/ We should ban cars from the city center.
2/ Studies from three European cities show traffic drops about 30% after such bans.
3/ Air quality also improves measurably within weeks.
4/ A 2024 study of Madrid found retail revenue fell 8% in the restricted zone.
5/ Anyone who disagrees clearly hates the planet.
6/ Removing cars from downtown is the right move.
7/ But what about people with disabilities who need vehicles?
8/ Retail sales in Oslo rose 4% after their ban.
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Phase 3: link evidence to claims."
    )
    parser.add_argument(
        "path",
        nargs="?",
        help="Optional path to a .txt file containing the input.",
    )
    parser.add_argument(
        "--text",
        help="Inline input text. Overrides the positional path.",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=DEFAULT_TOP_K,
        help=f"How many evidence units to shortlist per claim (default {DEFAULT_TOP_K}).",
    )
    parser.add_argument(
        "--sim-floor",
        type=float,
        default=DEFAULT_SIM_FLOOR,
        help=f"Minimum embedding similarity to consider a pair (default {DEFAULT_SIM_FLOOR}).",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save the result to backend/artifacts/phase3_last.json",
    )
    return parser.parse_args()


def _read_input(args: argparse.Namespace) -> str:
    if args.text:
        return args.text
    if args.path:
        return Path(args.path).read_text(encoding="utf-8")
    return SAMPLE_TEXT


def main() -> None:
    args = _parse_args()
    text = _read_input(args)

    units = segment_text(text)
    if not units:
        print("No units detected in the input.", file=sys.stderr)
        sys.exit(1)

    try:
        client = get_client()
    except LLMConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(1)

    # 1. Classify units (Phase 1)
    print(f"Classifying {len(units)} unit(s)...")
    try:
        classification = classify_units(client, units)
    except RuntimeError as exc:
        print(f"Error during classification: {exc}", file=sys.stderr)
        client.close()
        sys.exit(1)

    claim_indices = [
        c.index for c in classification.units if c.type == UnitType.CLAIM
    ]
    evidence_indices = [
        c.index for c in classification.units if c.type == UnitType.EVIDENCE
    ]

    print(f"Claims:   {claim_indices}")
    print(f"Evidence: {evidence_indices}")

    if not claim_indices:
        print("No claim units found — nothing to link.", file=sys.stderr)
        client.close()
        sys.exit(0)
    if not evidence_indices:
        print("No evidence units found — nothing to link.", file=sys.stderr)
        client.close()
        sys.exit(0)

    # 2. Shortlist pairs by embedding similarity
    print("\nShortlisting evidence for each claim...")
    try:
        pairs = shortlist_pairs(
            client,
            units,
            claim_indices,
            evidence_indices,
            top_k=args.top_k,
            sim_floor=args.sim_floor,
        )
    except RuntimeError as exc:
        print(f"Error during embedding: {exc}", file=sys.stderr)
        client.close()
        sys.exit(1)

    print(f"Shortlisted {len(pairs)} candidate pair(s).")

    if not pairs:
        print("No candidate pairs above similarity floor.", file=sys.stderr)
        client.close()
        sys.exit(0)

    # 3. Ask the model for verdicts
    print("Getting verdicts from the model...")
    try:
        verdicts = get_link_verdicts(client, pairs)
    except RuntimeError as exc:
        print(f"Error during link classification: {exc}", file=sys.stderr)
        client.close()
        sys.exit(1)

    # 4. Report
    print_links(units, pairs, verdicts)

    if args.save:
        save_artifact(units, pairs, verdicts, ARTIFACTS_DIR / "phase3_last.json")

    client.close()


if __name__ == "__main__":
    main()