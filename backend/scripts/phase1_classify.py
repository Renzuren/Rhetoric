"""
Phase 1: Segmentation + classification.

Format-agnostic input. Supports:
  - numbered threads        (1/ foo, 2/ bar)
  - dialogue / transcripts  (Name: text, Speaker 1 [00:15]: text)
  - paragraphs              (blank-line separated)
  - prose                   (sentence-split, merged for minimum length)

Also strips common platform chrome (timestamps, "Read more", standalone
URLs) before classification.

Speaker extraction is deterministic (regex + inheritance), not LLM-driven.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

load_dotenv()

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"


# ===========================================================================
# Data model
# ===========================================================================
class UnitType(str, Enum):
    CLAIM = "claim"
    EVIDENCE = "evidence"
    ASSUMPTION = "assumption"
    FALLACY = "fallacy"
    QUESTION = "question"
    COUNTERPOINT = "counterpoint"
    ASIDE = "aside"
    RHETORIC = "rhetoric"


class SourceType(str, Enum):
    NONE = "none"
    VAGUE = "vague"
    SPECIFIC = "specific"


class ClassifiedUnit(BaseModel):
    index: int = Field(description="0-based index of the unit.")
    type: UnitType = Field(description="Rhetorical role of this unit.")
    source_type: SourceType = Field(
        description=(
            "Strength of the source: none (bare assertion), "
            "vague ('studies show'), specific (named study/org/place)."
        )
    )
    source_name: str | None = Field(
        default=None,
        description=(
            "Named source if source_type is 'specific' or a clear reference. "
            "Short, e.g. 'US Treasury', 'Oslo data'. Else null."
        ),
    )
    summary: str = Field(description="Neutral summary, <= 15 words.")


class ClassificationResult(BaseModel):
    units: list[ClassifiedUnit]


@dataclass
class Unit:
    index: int
    text: str
    speaker: str | None = None


# ===========================================================================
# Format detection & segmentation
# ===========================================================================
class TextFormat(str, Enum):
    NUMBERED = "numbered"
    DIALOGUE = "dialogue"
    PARAGRAPHS = "paragraphs"
    PROSE = "prose"


MIN_UNIT_CHARS = 40
MAX_UNIT_CHARS = 500

# Chrome strip: lines that are only a URL, only a timestamp, or
# boilerplate platform noise.
_URL_ONLY = re.compile(r"^\s*https?://\S+\s*$", re.IGNORECASE)
_TIMESTAMP_LINE = re.compile(
    r"^\s*[\[\(]?\d{1,2}:\d{2}(?::\d{2})?[\]\)]?\s*(?:[AP]M)?\s*"
    r"(?:[·•\-]\s*[\w\s,]+\d{4})?\s*$",
    re.IGNORECASE,
)
_SOCIAL_CHROME = re.compile(
    r"^\s*(?:Read more|Show more|See more|"
    r"\d+\s+(?:likes?|reposts?|replies|views?|comments?))\s*\.?\s*$",
    re.IGNORECASE,
)
_BULLET_PREFIX = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")

# Numbered thread markers
NUMBERED_PATTERN = re.compile(r"(?:^|\s)(\d{1,2})\s*[/.)]\s+")

# Dialogue speaker prefix, on its own line or at start of a paragraph:
#   Name: text
#   @handle: text
#   u/handle: text
#   Name [00:15]: text
#   Speaker 1 (0:00): text
DIALOGUE_SPEAKER = re.compile(
    r"^\s*(?:>\s*)?"
    r"(?P<speaker>"
    r"@[A-Za-z0-9_.\-]+"
    r"|/?u/[A-Za-z0-9_.\-]+"
    r"|[A-Z][\w'.\-]*(?:\s+[A-Z][\w'.\-]*){0,3}"
    r"|Speaker\s+\d+"
    r")"
    r"(?:\s*[\[\(]\d{1,2}:\d{2}(?::\d{2})?[\]\)])?"
    r"\s*[:—–]\s+"
)

# Sentence split for prose: after . ! ? followed by whitespace + capital
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'\(\[])")


def _strip_chrome(text: str) -> str:
    """Remove platform noise line by line."""
    lines = []
    for line in text.split("\n"):
        s = line.strip()
        if not s:
            lines.append("")
            continue
        if _URL_ONLY.match(s):
            continue
        if _TIMESTAMP_LINE.match(s):
            continue
        if _SOCIAL_CHROME.match(s):
            continue
        lines.append(line)
    return "\n".join(lines)


def _detect_format(text: str) -> TextFormat:
    """Pick a segmentation strategy based on shape of input."""
    # Numbered threads: 2+ markers like "1/" or "2." at word boundaries
    if len(NUMBERED_PATTERN.findall(text)) >= 2:
        return TextFormat.NUMBERED

    # Dialogue: 2+ lines that look like "Speaker: text"
    dialogue_matches = 0
    for line in text.split("\n"):
        if DIALOGUE_SPEAKER.match(line):
            dialogue_matches += 1
            if dialogue_matches >= 2:
                return TextFormat.DIALOGUE

    # Paragraphs: 2+ blank-line separations
    if len(re.findall(r"\n\s*\n", text)) >= 2:
        return TextFormat.PARAGRAPHS

    return TextFormat.PROSE


def _split_sentences(text: str) -> list[str]:
    """Sentence split, merging fragments shorter than MIN_UNIT_CHARS."""
    raw = SENTENCE_SPLIT.split(text.strip())
    merged: list[str] = []
    buf = ""
    for s in raw:
        s = s.strip()
        if not s:
            continue
        if not buf:
            buf = s
        elif len(buf) < MIN_UNIT_CHARS:
            buf = f"{buf} {s}".strip()
        else:
            merged.append(buf)
            buf = s
    if buf:
        if merged and len(buf) < MIN_UNIT_CHARS:
            merged[-1] = f"{merged[-1]} {buf}".strip()
        else:
            merged.append(buf)
    return merged


def _chunk_long_unit(text: str) -> list[str]:
    """If a unit exceeds MAX_UNIT_CHARS, sentence-split it."""
    if len(text) <= MAX_UNIT_CHARS:
        return [text]
    parts = _split_sentences(text)
    return parts if parts else [text]


def _segment_numbered(text: str) -> list[Unit]:
    matches = list(NUMBERED_PATTERN.finditer(text))
    units: list[Unit] = []
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        for piece in _chunk_long_unit(content):
            if piece:
                units.append(Unit(index=len(units), text=piece))
    return units


def _segment_dialogue(text: str) -> list[Unit]:
    """Split at speaker prefixes. Multi-line turns become one unit."""
    lines = text.split("\n")
    units: list[Unit] = []
    current_speaker: str | None = None
    buffer: list[str] = []

    def flush():
        nonlocal buffer
        content = " ".join(l.strip() for l in buffer if l.strip()).strip()
        if content:
            for piece in _chunk_long_unit(content):
                units.append(
                    Unit(index=len(units), text=piece, speaker=current_speaker)
                )
        buffer = []

    for line in lines:
        m = DIALOGUE_SPEAKER.match(line)
        if m:
            flush()
            current_speaker = m.group("speaker").strip()
            rest = line[m.end():].strip()
            if rest:
                buffer.append(rest)
        else:
            if line.strip():
                buffer.append(line)
            else:
                flush()

    flush()
    return units


def _segment_paragraphs(text: str) -> list[Unit]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    units: list[Unit] = []
    for b in blocks:
        cleaned = _BULLET_PREFIX.sub("", b).strip()
        if not cleaned:
            continue
        for piece in _chunk_long_unit(cleaned):
            if piece:
                units.append(Unit(index=len(units), text=piece))
    return units


def _segment_prose(text: str) -> list[Unit]:
    sentences = _split_sentences(text)
    return [Unit(index=i, text=s) for i, s in enumerate(sentences) if s.strip()]


def segment_text(text: str) -> list[Unit]:
    """Format-agnostic segmentation. Returns indexed Unit objects."""
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return []
    text = _strip_chrome(text)
    fmt = _detect_format(text)

    if fmt == TextFormat.NUMBERED:
        return _segment_numbered(text)
    if fmt == TextFormat.DIALOGUE:
        return _segment_dialogue(text)
    if fmt == TextFormat.PARAGRAPHS:
        return _segment_paragraphs(text)
    return _segment_prose(text)


# ===========================================================================
# Speaker extraction (for formats that don't already tag speakers)
# ===========================================================================
def extract_speakers_and_clean(units: list[Unit]) -> list[Unit]:
    """
    Pull speaker prefixes off unit text where present and inherit the
    most recent speaker across units that don't have one.

    Dialogue segmentation already sets speakers; this function fills the
    gaps for numbered threads and paragraphs.
    """
    last: str | None = None
    for u in units:
        if u.speaker:
            last = u.speaker
            continue

        m = DIALOGUE_SPEAKER.match(u.text)
        if m:
            speaker = m.group("speaker").strip()
            u.text = u.text[m.end():].strip()
            u.speaker = speaker
            last = speaker
        else:
            u.speaker = last
    return units


# ===========================================================================
# Client
# ===========================================================================
class LLMConfigError(RuntimeError):
    pass


def get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise LLMConfigError(
            "GEMINI_API_KEY is not set. "
            "Copy backend/.env.example to backend/.env and add your key."
        )
    return genai.Client(api_key=api_key)


# ===========================================================================
# Classification
# ===========================================================================
SYSTEM_INSTRUCTION = """You are an argument analyst.

You receive numbered units from a single piece of text (a thread,
debate, op-ed, article). Classify each unit.

Allowed types:
- claim:       an assertion the author presents as true
- evidence:    a fact, statistic, quote, or example offered in support
- assumption:  an unstated premise the argument depends on, or an inference
               the author treats as obvious without defending it
- fallacy:     a named logical fallacy or manipulative rhetoric
               (ad hominem, strawman, false dilemma, appeal to emotion,
               circular reasoning, etc.)
- question:    a question posed to the reader or another party
- counterpoint: an alternative view or challenge to the main argument
                (even if not fully developed)
- aside:       off-topic remark, joke, meta-comment
- rhetoric:    persuasive language with no factual content that is NOT
               a recognizable named fallacy

Source strength:
- none:      no origin mentioned
- vague:     unnamed origin ("studies show", "experts say")
- specific:  named study, org, place with data, or document

source_name: short label of the specific source (e.g. "US Treasury",
"Oslo retail data"). Only when source_type is 'specific' or clearly
named. Else null.

Rules:
1. Exactly one classification per input unit.
2. Preserve the index values you were given.
3. Summaries must be neutral and <= 15 words.
4. Do not invent sources or content.
5. Prefer 'fallacy' over 'rhetoric' when a named fallacy applies.
6. A claim with no evidence offered is still a claim, not an assumption.
"""


def classify_units(
    client: genai.Client,
    units: list[Unit],
    model: str = DEFAULT_MODEL,
) -> ClassificationResult:
    if not units:
        return ClassificationResult(units=[])

    numbered = "\n".join(f"{u.index}. {u.text}" for u in units)
    user_prompt = (
        f"Classify each of the {len(units)} units below. "
        "Preserve index values.\n\n" + numbered
    )

    config = types.GenerateContentConfig(
        temperature=0.0,
        max_output_tokens=4000,
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=ClassificationResult,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            disable=True
        ),
    )

    try:
        response = client.models.generate_content(
            model=model, contents=user_prompt, config=config
        )
    except Exception as exc:
        raise RuntimeError(f"Gemini API request failed: {exc}") from exc

    raw = response.text
    if not raw:
        raise RuntimeError("Gemini returned an empty response.")

    try:
        return ClassificationResult.model_validate_json(raw)
    except ValidationError as exc:
        raise RuntimeError(
            f"Schema validation failed: {exc}\n\nRaw:\n{raw}"
        ) from exc


# ===========================================================================
# Output
# ===========================================================================
def print_table(units: list[Unit], result: ClassificationResult) -> None:
    by_index = {c.index: c for c in result.units}
    print(f"\nInput: {len(units)} unit(s)\n")
    header = (
        f"{'#':<3} {'TYPE':<12} {'SPEAKER':<16} {'SOURCE':<10} SUMMARY"
    )
    print(header)
    print("-" * len(header))
    for u in units:
        c = by_index.get(u.index)
        if not c:
            print(f"{u.index:<3} MISSING")
            continue
        sp = (u.speaker or "—")[:15]
        print(
            f"{u.index:<3} {c.type.value:<12} {sp:<16} "
            f"{c.source_type.value:<10} {c.summary[:40]}"
        )


# ===========================================================================
# Sample inputs (one per format)
# ===========================================================================
SAMPLES = {
    "numbered": """1/ @User123: Government spending is the real cause of inflation.
2/ Cites 2021-2024 federal spending data (US Treasury).
3/ @AnotherUser: Actually, it's corporate greed, not government spending.
4/ Cites record corporate profits and price markups (from company reports).
5/ Appeal to emotion ("greedy corporations are to blame").
6/ @SomeoneElse: Btw, have you considered that both could be true?
7/ @User123: So basically, government spending is the main driver.
""",
    "dialogue": """Moderator: Should cities ban private cars from their centers?

Alice: Yes. Studies from three European cities show traffic drops of 30%.
Air quality also improves measurably within weeks.

Bob: That's shortsighted. A 2024 study of Madrid found retail revenue fell 8% after their ban.

Alice: But retail sales in Oslo actually rose 4% after their restriction. The economic argument cuts both ways.
""",
    "prose": """The argument that government spending caused the recent inflation is incomplete. While federal spending did rise sharply in 2021 and 2022, corporate profit margins expanded during the same period at rates not seen in decades. A serious analysis has to weigh both factors rather than pinning the blame on one. Unfortunately, most public debate ignores this complexity entirely.
""",
}


# ===========================================================================
# CLI
# ===========================================================================
def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Phase 1 classifier.")
    p.add_argument("path", nargs="?", help="Path to .txt input.")
    p.add_argument("--text", help="Inline text.")
    p.add_argument("--sample", choices=list(SAMPLES.keys()), help="Use a built-in sample.")
    p.add_argument("--save", action="store_true")
    return p.parse_args()


def _read_input(args: argparse.Namespace) -> str:
    if args.text:
        return args.text
    if args.path:
        return Path(args.path).read_text(encoding="utf-8")
    if args.sample:
        return SAMPLES[args.sample]
    return SAMPLES["numbered"]


def main() -> None:
    args = _parse_args()
    text = _read_input(args)

    units = segment_text(text)
    units = extract_speakers_and_clean(units)
    if not units:
        print("No units detected.", file=sys.stderr)
        sys.exit(1)

    try:
        client = get_client()
    except LLMConfigError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        result = classify_units(client, units)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        client.close()
        sys.exit(1)

    print_table(units, result)

    if args.save:
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "units": [
                {
                    "index": u.index,
                    "text": u.text,
                    "speaker": u.speaker,
                    "classification": next(
                        (c.model_dump(mode="json") for c in result.units if c.index == u.index),
                        None,
                    ),
                }
                for u in units
            ]
        }
        path = ARTIFACTS_DIR / "phase1_last.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nSaved: {path}")

    client.close()


if __name__ == "__main__":
    main()