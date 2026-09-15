"use client";

export function DocsView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-[18px] font-medium tracking-tight text-[#ededf0] mb-1">
            How Rhetoric works
          </h2>
          <p className="text-[12px] text-[#71717a] leading-relaxed">
            Rhetoric is an argument autopsist. It reads a piece of
            argumentative text, breaks it into units, and shows you the
            structure — what's being claimed, what's offered as evidence,
            where the weaknesses are.
          </p>
        </div>

        <Section title="The pipeline">
          <p className="mb-3">
            Every analysis runs through eight stages. Five are deterministic
            code; three use the model only where judgment is required.
          </p>

          <div className="space-y-2">
            <Step n={1} title="Segment" tag="code">
              Format-aware split into units. Detects numbered threads
              (1/, 2/), dialogue (<Mono>Name: text</Mono>), paragraphs,
              or prose sentences.
            </Step>
            <Step n={2} title="Extract speakers" tag="code">
              Regex pulls <Mono>@handle:</Mono> and{" "}
              <Mono>Name:</Mono> prefixes. Speakers inherit across
              units — a reply chain stays attributed.
            </Step>
            <Step n={3} title="Classify units" tag="LLM">
              Each unit is classified as claim, evidence, assumption,
              fallacy, question, counterpoint, aside, or rhetoric. Source
              strength is graded <Mono>none</Mono> / <Mono>vague</Mono> /
              {" "}<Mono>specific</Mono>.
            </Step>
            <Step n={4} title="Embed claims" tag="code">
              Each claim is turned into a vector so we can find claims
              that say the same thing.
            </Step>
            <Step n={5} title="Detect restatements" tag="math">
              Two claims with cosine similarity ≥ 0.80 are flagged as
              the same argument said twice.
            </Step>
            <Step n={6} title="Shortlist evidence" tag="math">
              For each claim, the top matching evidence units are
              shortlisted by embedding similarity.
            </Step>
            <Step n={7} title="Classify relations" tag="LLM">
              The model judges each shortlisted pair as{" "}
              <Mono>supports</Mono>, <Mono>attacks</Mono>, or{" "}
              <Mono>irrelevant</Mono>.
            </Step>
            <Step n={8} title="Derive stats" tag="code">
              Orphan claims, coverage, and load-bearing claims are
              computed from the graph.
            </Step>
          </div>
        </Section>

        <Section title="Reading the graph">
          <p className="mb-3">
            Nodes are units of argument. Edges connect them.
          </p>

          <SubTitle>Node types</SubTitle>
          <div className="space-y-1.5 mb-5">
            <NodeRow color="#f472b6" label="Claim">
              A statement the author presents as true.
            </NodeRow>
            <NodeRow color="#34d399" label="Evidence">
              A fact, statistic, quote, or example offered in support.
            </NodeRow>
            <NodeRow color="#a78bfa" label="Assumption">
              A premise taken for granted without defense.
            </NodeRow>
            <NodeRow color="#fbbf24" label="Fallacy">
              Manipulative or logically faulty reasoning.
            </NodeRow>
            <NodeRow color="#94a3b8" label="Counterpoint">
              An alternative view or challenge.
            </NodeRow>
          </div>

          <SubTitle>Edge types</SubTitle>
          <div className="space-y-1.5">
            <EdgeRow color="#34d399" label="supports" dashed={false}>
              Evidence increases the plausibility of a claim.
            </EdgeRow>
            <EdgeRow color="#f87171" label="attacks" dashed={false}>
              Evidence undermines a claim.
            </EdgeRow>
            <EdgeRow color="#a78bfa" label="restates" dashed={true}>
              Two claims say the same thing in different words.
            </EdgeRow>
          </div>
        </Section>

        <Section title="Signals to look for">
          <Signal
            color="#f87171"
            title="Unattached claims"
            body="A claim with no supporting evidence attached. Shown with a red UNATTACHED label. The single strongest signal of a hollow argument."
          />
          <Signal
            color="#a78bfa"
            title="Restated claims"
            body="Two or more claims that say the same thing in different words. A common rhetorical move — repetition dressed up as multiple points."
          />
          <Signal
            color="#fbbf24"
            title="Fallacy clusters"
            body="Multiple fallacies on the same side. When an argument leans on ad hominem and appeals to emotion, the graph makes it visible."
          />
        </Section>

        <Section title="What to paste">
          <p className="mb-3">
            Rhetoric auto-detects the input format. Any of these work:
          </p>
          <div className="space-y-3">
            <FormatCard
              name="Numbered thread"
              example={`1/ @alice: We should ban cars.
2/ A study of Madrid found traffic dropped 30%.
3/ @bob: That study was flawed.`}
            />
            <FormatCard
              name="Dialogue / transcript"
              example={`Moderator: Should cities ban cars?

Alice: Yes. Studies show traffic drops 30%.

Bob: That's short-sighted. Madrid data shows otherwise.`}
            />
            <FormatCard
              name="Reddit-style"
              example={`u/skeptic42: Remote work is obviously better.

u/datadriven: A 2023 Stanford study found a 13% gain.

u/observer: Productivity varies by role.`}
            />
            <FormatCard
              name="Plain prose"
              example={`The argument that spending caused inflation is incomplete. Corporate margins also expanded. A serious analysis weighs both.`}
            />
          </div>
        </Section>

        <Section title="What it can't do">
          <ul className="space-y-2 text-[12px] text-[#a1a1aa] leading-relaxed">
            <Bullet>
              It doesn't judge truth. It shows structure.
            </Bullet>
            <Bullet>
              It doesn't fetch URLs. Paste the text itself.
            </Bullet>
            <Bullet>
              It doesn't handle PDFs yet. Copy text out first.
            </Bullet>
            <Bullet>
              Segmentation is heuristic. Mixed formats may split awkwardly.
            </Bullet>
            <Bullet>
              Borderline units can flip classification between runs. The
              cache locks the first result.
            </Bullet>
          </ul>
        </Section>
      </div>
    </div>
  );
}

// ---------- helpers ----------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h3 className="text-[10px] font-medium tracking-wider text-[#4d4d55] uppercase mb-3">
        {title}
      </h3>
      <div className="text-[12px] text-[#a1a1aa] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium text-[#ededf0] mb-2 mt-1">
      {children}
    </div>
  );
}

function Step({
  n,
  title,
  tag,
  children,
}: {
  n: number;
  title: string;
  tag: "code" | "LLM" | "math";
  children: React.ReactNode;
}) {
  const tagColors = {
    code: "text-[#71717a] border-[#1e1e22]",
    LLM: "text-[#a78bfa] border-[#3a2a5a]",
    math: "text-[#34d399] border-[#1a3a2a]",
  };
  return (
    <div className="flex gap-3 border border-[#1e1e22] rounded-md p-3 bg-[#0f0f11]">
      <div className="text-[10px] font-mono text-[#4d4d55] shrink-0 w-5">
        {n.toString().padStart(2, "0")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] font-medium text-[#ededf0]">
            {title}
          </span>
          <span
            className={`text-[9px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${tagColors[tag]}`}
          >
            {tag}
          </span>
        </div>
        <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
          {children}
        </p>
      </div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[11px] font-mono text-[#ededf0] bg-[#141417] px-1 py-0.5 rounded">
      {children}
    </code>
  );
}

function NodeRow({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
        style={{ background: color }}
      />
      <div className="text-[11px] leading-relaxed">
        <span className="text-[#ededf0] font-medium">{label}</span>
        <span className="text-[#71717a]"> — {children}</span>
      </div>
    </div>
  );
}

function EdgeRow({
  color,
  label,
  dashed,
  children,
}: {
  color: string;
  label: string;
  dashed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="w-4 h-px mt-2 shrink-0"
        style={{
          background: color,
          opacity: dashed ? 0.5 : 1,
        }}
      />
      <div className="text-[11px] leading-relaxed">
        <span className="text-[#ededf0] font-medium font-mono">
          {label}
        </span>
        <span className="text-[#71717a]"> — {children}</span>
      </div>
    </div>
  );
}

function Signal({
  color,
  title,
  body,
}: {
  color: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-[#1e1e22] rounded-md p-3 bg-[#0f0f11] mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
        />
        <span className="text-[12px] font-medium text-[#ededf0]">
          {title}
        </span>
      </div>
      <p className="text-[11px] text-[#a1a1aa] leading-relaxed pl-3.5">
        {body}
      </p>
    </div>
  );
}

function FormatCard({
  name,
  example,
}: {
  name: string;
  example: string;
}) {
  return (
    <div className="border border-[#1e1e22] rounded-md overflow-hidden bg-[#0f0f11]">
      <div className="px-3 py-2 border-b border-[#1e1e22] text-[10px] font-medium tracking-wider uppercase text-[#71717a]">
        {name}
      </div>
      <pre className="px-3 py-2.5 text-[10px] font-mono text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">
        {example}
      </pre>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-[#4d4d55] shrink-0 mt-0.5">·</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}