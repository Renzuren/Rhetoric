"""
Phase 2: Restatement detection.

Takes a piece of argumentative text, classifies the units (reusing Phase 1),
then finds pairs of CLAIM units that say the same thing in different words.

Uses cosine similarity between embeddings. A threshold of ~0.80 catches
paraphrases while avoiding coincidental overlap.

Run:
    python scripts/phase2_restatements.py                    # built-in sample
    python scripts/phase2_restatements.py path/to/file.txt
    python scripts/phase2_restatements.py --text "..."
    python scripts/phase2_restatements.py --threshold 0.75
    python scripts/phase2_restatements.py --save
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

# Reuse Phase 1. When run as `python scripts/phase2_restatements.py`,
# Python puts the script's directory on sys.path, so this import works.
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
from google import genai
from google.genai import types

load_dotenv()

EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
DEFAULT_THRESHOLD = 0.80


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------
def embed_texts(
    client: genai.Client,
    texts: list[str],
    model: str = EMBED_MODEL,
) -> list[list[float]]:
    """Embed a batch of texts for semantic-similarity comparison."""
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
# Restatement detection
# ---------------------------------------------------------------------------
class Restatement:
    """A pair of claim units that appear to say the same thing."""

    def __init__(
        self,
        index_a: int,
        text_a: str,
        index_b: int,
        text_b: str,
        similarity: float,
    ) -> None:
        self.index_a = index_a
        self.text_a = text_a
        self.index_b = index_b
        self.text_b = text_b
        self.similarity = similarity

    def to_dict(self) -> dict:
        return {
            "index_a": self.index_a,
            "text_a": self.text_a,
            "index_b": self.index_b,
            "text_b": self.text_b,
            "similarity": round(self.similarity, 4),
        }


def find_restatements(
    client: genai.Client,
    units: list[Unit],
    claim_indices: list[int],
    threshold: float = DEFAULT_THRESHOLD,
) -> list[Restatement]:
    """
    Compare every pair of claim units. Return pairs whose cosine similarity
    exceeds the threshold.
    """
    if len(claim_indices) < 2:
        return []

    claim_units = [u for u in units if u.index in claim_indices]
    vectors = embed_texts(client, [u.text for u in claim_units])

    pairs: list[Restatement] = []
    for i, j in combinations(range(len(claim_units)), 2):
        sim = cosine_similarity(vectors[i], vectors[j])
        if sim >= threshold:
            a, b = claim_units[i], claim_units[j]
            pairs.append(
                Restatement(
                    index_a=a.index,
                    text_a=a.text,
                    index_b=b.index,
                    text_b=b.text,
                    similarity=sim,
                )
            )

    pairs.sort(key=lambda p: p.similarity, reverse=True)
    return pairs


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def print_restatements(pairs: list[Restatement], threshold: float) -> None:
    print(f"\nRestatements found (threshold >= {threshold:.2f}): {len(pairs)}\n")
    if not pairs:
        print("  (none)")
        return

    for pair in pairs:
        print(f"  similarity = {pair.similarity:.4f}")
        print(f"    [{pair.index_a}] {pair.text_a}")
        print(f"    [{pair.index_b}] {pair.text_b}")
        print()


def print_similarity_matrix(
    client: genai.Client,
    units: list[Unit],
    claim_indices: list[int],
) -> None:
    """Print the full pairwise similarity matrix for claim units."""
    if len(claim_indices) < 2:
        return

    claim_units = [u for u in units if u.index in claim_indices]
    vectors = embed_texts(client, [u.text for u in claim_units])

    n = len(claim_units)
    print("\nPairwise cosine similarity (claim units only):")
    header = "      " + "  ".join(f"[{u.index}]  " for u in claim_units)
    print(header)

    for i in range(n):
        row = f"[{claim_units[i].index}]  "
        for j in range(n):
            sim = cosine_similarity(vectors[i], vectors[j])
            row += f"{sim:.2f}   "
        print(row)


def save_artifact(
    units: list[Unit],
    claim_indices: list[int],
    pairs: list[Restatement],
    threshold: float,
    path: Path,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "threshold": threshold,
        "claim_indices": claim_indices,
        "claim_units": [
            {"index": u.index, "text": u.text}
            for u in units
            if u.index in claim_indices
        ],
        "restatements": [p.to_dict() for p in pairs],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved artifact: {path}")


# ---------------------------------------------------------------------------
# Sample input — deliberately contains 3 restatements of the same claim
# ---------------------------------------------------------------------------
SAMPLE_TEXT = """1/ We should ban cars from the city center.
2/ Studies from three European cities show traffic drops about 30% after such bans.
3/ The city center would be better off without private vehicles.
4/ Air quality also improves measurably within weeks.
5/ Anyone who disagrees clearly hates the planet.
6/ Removing cars from downtown is the right move.
7/ But what about people with disabilities who need vehicles?
8/ Retail sales in Oslo rose 4% after their ban, so the economic argument cuts the other way too.
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Phase 2: detect restated claims via embeddings."
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
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Cosine similarity threshold (default {DEFAULT_THRESHOLD}).",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save the result to backend/artifacts/phase2_last.json",
    )
    parser.add_argument(
        "--matrix",
        action="store_true",
        help="Print the full pairwise similarity matrix.",
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

    if not claim_indices:
        print("No claim units found — nothing to compare.", file=sys.stderr)
        client.close()
        sys.exit(0)

    print(f"Found {len(claim_indices)} claim unit(s): {claim_indices}")

    # 2. Find restatements (Phase 2)
    try:
        pairs = find_restatements(
            client, units, claim_indices, threshold=args.threshold
        )
    except RuntimeError as exc:
        print(f"Error during embedding: {exc}", file=sys.stderr)
        client.close()
        sys.exit(1)

    # 3. Report
    print_restatements(pairs, args.threshold)

    if args.matrix:
        try:
            print_similarity_matrix(client, units, claim_indices)
        except RuntimeError as exc:
            print(f"Error during matrix computation: {exc}", file=sys.stderr)

    if args.save:
        save_artifact(
            units, claim_indices, pairs, args.threshold,
            ARTIFACTS_DIR / "phase2_last.json",
        )

    client.close()


if __name__ == "__main__":
    main()