# Rhetoric

**Argument Autopsy.** Paste an argument, see its structure.

Rhetoric takes argumentative text — a Twitter thread, a debate transcript, an op-ed, a Reddit discussion — and turns it into an interactive graph of claims, evidence, fallacies, and counterpoints. It shows which claims restate each other, which evidence supports which claim, and which claims have no evidence attached at all.

Built as a portfolio project to demonstrate practical RAG-adjacent techniques: structured LLM output, embeddings, semantic search, and graph reasoning over natural language.

---

## What it does

**Input:** any piece of argumentative text.

**Output:** a graph where

- **Nodes** are units of argument (claim, evidence, assumption, fallacy, question, counterpoint, aside, rhetoric)
- **Edges** connect evidence to claims (`supports`, `attacks`) and claims to claims (`restates`)
- **Derived signals** flag restated claims, orphan claims, and coverage gaps

Plus a neutral, model-generated summary and title at the top.

---

## Pipeline

```
input text
   │
   ▼
┌─────────────────────────┐
│ 1. Segment              │  format-aware: numbered thread, dialogue,
│    deterministic        │  paragraphs, or prose
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. Extract speakers     │  regex + inheritance across units
│    deterministic        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 3. Classify units       │  Gemini structured output → Pydantic schema
│    LLM                  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. Embed claims         │  Gemini embeddings (SEMANTIC_SIMILARITY)
│    deterministic        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 5. Detect restatements  │  cosine similarity ≥ 0.80
│    math                 │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 6. Shortlist evidence   │  top-k embedding matches per claim
│    math                 │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 7. Classify relations   │  Gemini: supports / attacks / irrelevant
│    LLM                  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 8. Derive stats         │  orphans, coverage, degree centrality
│    graph                │
└───────────┬─────────────┘
            │
            ▼
      graph JSON
```

The LLM does only what it must: semantic judgment (steps 3, 7) and natural-language generation (summary, title). Everything else — segmentation, speaker attribution, similarity math, graph analysis — is deterministic code.

---

## Architecture

```
┌──────────────────────┐    HTTPS    ┌───────────────────────┐
│  Next.js (Netlify)   │────────────▶│  FastAPI (Render)     │
│                      │             │                       │
│  - graph render      │◀────────────│  - pipeline           │
│  - localStorage      │   JSON      │  - Gemini calls       │
│  - history           │             │  - file cache         │
└──────────────────────┘             └───────────┬───────────┘
                                                 │
                                                 ▼
                                         ┌───────────────┐
                                         │  Gemini API   │
                                         └───────────────┘
```

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind, React Flow, dagre |
| Backend | FastAPI, Pydantic, google-genai |
| LLM | Gemini 2.5 Flash |
| Embeddings | Gemini Embedding 001 |
| Deployment | Netlify (frontend) + Render (backend) |

---

## What's included

- Format-agnostic segmentation (numbered threads, dialogue, paragraphs, prose)
- Deterministic speaker extraction and inheritance across units
- Structured classification via Gemini `response_schema` + Pydantic validation
- Embedding-based restatement detection
- Hybrid evidence linking: embedding shortlist + LLM verdict
- Graph derivation: orphan claims, load-bearing claim, evidence coverage
- Per-input disk cache (deterministic on re-run)
- Input validation on both client and server
- Interactive React Flow graph with filters, node drawer, and legend
- Local history in browser localStorage
- Built-in example inputs
- Linear-inspired UI — no gradients, no emoji

---

## What's not included

- User accounts or authentication
- Server-side history persistence
- URL fetching (paste text, not links)
- PDF/DOCX ingestion
- Multi-document reasoning
- Fallacy taxonomy beyond generic detection
- Evaluation harness (planned)

---

## Setup

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```

If `python -m venv` hangs (known Python 3.13 bug on Windows), use `uv` instead:

```powershell
uv venv .venv
.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
uv pip install -r requirements.txt
```

Create `backend\.env`:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBED_MODEL=gemini-embedding-001
```

Get a key at https://aistudio.google.com/apikey

Run the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

### Try it

From the backend folder:

```powershell
python scripts\phase4_pipeline.py
```

Or in the UI, click **Examples → UBI debate (dense)** for a 25-node graph.

---

## Data storage

**Analyses live in your browser.** The full input text and resulting graph are stored in `localStorage` under `rhetoric.history.v1`. Nothing is persisted server-side.

| Event | History survives? |
|---|---|
| Page refresh | Yes |
| Browser restart | Yes |
| Backend redeploy | Yes |
| Frontend redeploy | Yes (same origin) |
| Change domain | No (origin-scoped) |
| Switch browser or device | No |
| Incognito mode | No |
| Clear browser site data | No |
| Click "Clear all" in History | No |

Server-side cache (`backend/artifacts/cache/`) is ephemeral and only avoids redundant Gemini calls on warm instances. It never stores user-identifiable data beyond the input text hash and the graph it produced.

---

## Design decisions

**Structured LLM output over free text.** The classifier returns a Pydantic-validated `ClassificationResult`. If the model returns off-schema JSON, we get a hard error, not a silent miscategorization.

**Deterministic speakers, not LLM speakers.** Speaker extraction is regex plus inheritance. Asking the LLM to attribute speakers was unreliable across runs; regex is exact and reproducible.

**Two-stage evidence linking.** Embeddings shortlist candidates; the LLM classifies relations. Skipping the shortlist would require O(claims × evidence) LLM calls. Skipping the LLM would force the graph to trust cosine similarity, which is wrong about half the time on this task.

**`IRRELEVANT` as a first-class verdict.** Not every shortlisted pair is meaningful. Without this label, the model would force every pair into supports/attacks, overstating the argument's structure.

**Cache by input hash.** LLMs are not deterministic even at `temperature=0`. The cache makes the first run canonical and every subsequent run identical, which is what makes the demo stable.

**Three-level source strength.** `none` / `vague` / `specific` — a boolean collapses "backed by named studies" and "backed by unnamed studies" into one, which misrepresents weak evidence as strong.

---

## Known limitations

- **Segmentation is heuristic.** Numbered threads, dialogue, and paragraphs are handled well. Mixed-format inputs may split awkwardly.
- **Sentence splitting uses regex.** Splits like "Dr. Smith" occasionally break. A real tokenizer would fix this; not worth it for the demo.
- **Nondeterminism at the edges.** The classifier flips borderline units between runs. The cache locks the first result.
- **No fallacy sub-taxonomy.** A unit is `fallacy` or not. We don't distinguish strawman from ad hominem.
- **No multi-document reasoning.** One input at a time.
- **Cache is per-instance.** On Render free tier, cold starts wipe it.

---

## Roadmap

- Evaluation harness: hand-labeled set, Precision/Recall/F1 for the classifier, MRR for restatements
- Fallacy sub-taxonomy (5 categories: strawman, ad hominem, false dilemma, appeal to authority, circular)
- Server-side history with accounts
- URL fetching for articles (not Twitter/X)
- PDF ingestion
- Multi-document analysis (compare two arguments side by side)

---

## License

MIT