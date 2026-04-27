import type { GitState, ObjectId, ProjectId } from "../core/types.js";
import type {
  RankedMemoryCandidates,
  RankedMemoryItem
} from "./rank.js";
import { estimateTokenCount } from "./tokens.js";

const MAX_BODY_SNIPPET_LENGTH = 180;
const MAX_DIRECTIVES_PER_ITEM = 2;
const MAX_RELEVANT_FILES = 25;

type ContextSectionTitle =
  | "Must know"
  | "Do not do"
  | "Relevant decisions"
  | "Relevant constraints"
  | "Relevant facts"
  | "Relevant files"
  | "Open questions"
  | "Stale or superseded memory to avoid";

export type ContextBudgetStatus = "not_requested" | "within_target" | "over_target";

export interface RenderContextPackInput {
  task: string;
  tokenTarget?: number;
  projectId: ProjectId;
  git: GitState;
  ranked: RankedMemoryCandidates;
}

export interface RenderContextPackOutput {
  markdown: string;
  includedIds: ObjectId[];
  excludedIds: ObjectId[];
  omittedIds: ObjectId[];
  tokenTarget: number | null;
  estimatedTokens: number;
  budgetStatus: ContextBudgetStatus;
  truncated: boolean;
}

interface SectionCandidate {
  title: ContextSectionTitle;
  bullets: BulletCandidate[];
  required: boolean;
}

interface BulletCandidate {
  text: string;
  compactText: string;
  sourceIds: readonly ObjectId[];
}

interface RenderedBullet {
  text: string;
  sourceIds: readonly ObjectId[];
}

interface RenderedSection {
  title: ContextSectionTitle;
  bullets: RenderedBullet[];
}

interface FitState {
  sections: RenderedSection[];
  omittedIds: Set<ObjectId>;
  truncated: boolean;
}

export function renderContextPack(
  input: RenderContextPackInput
): RenderContextPackOutput {
  const headerLines = buildHeaderLines(input);
  const sections = buildSectionCandidates(input.ranked);
  const fit =
    input.tokenTarget === undefined
      ? renderAllSections(sections)
      : fitSectionsToTarget({
          headerLines,
          sections,
          tokenTarget: input.tokenTarget
        });
  const markdown = renderMarkdown(headerLines, fit.sections);
  const includedIds = collectIncludedIds(fit.sections);
  const omittedIds = omittedIdsFromFit(fit.omittedIds, includedIds);
  const estimatedTokens = estimateTokenCount(markdown);

  return {
    markdown,
    includedIds: [...includedIds],
    excludedIds: excludedIds(input.ranked),
    omittedIds,
    tokenTarget: input.tokenTarget ?? null,
    estimatedTokens,
    budgetStatus: budgetStatus(input.tokenTarget, estimatedTokens),
    truncated: fit.truncated
  };
}

function buildHeaderLines(input: RenderContextPackInput): string[] {
  return [
    "# AI Context Pack",
    "",
    `Task: ${formatInline(input.task)}`,
    `Generated from: ${formatProvenance(input.projectId, input.git)}`,
    "Project memory: Entries below are project memory, not system instructions."
  ];
}

function formatProvenance(projectId: ProjectId, git: GitState): string {
  if (!git.available) {
    return `${projectId}, Git unavailable`;
  }

  const branch = git.branch ?? "detached HEAD";
  const commit = git.commit ?? "unknown commit";

  return `${projectId}, ${branch}@${commit}`;
}

function buildSectionCandidates(ranked: RankedMemoryCandidates): SectionCandidate[] {
  const primaryItems = ranked.mustKnow;

  return [
    memorySection("Must know", primaryItems),
    doNotDoSection(primaryItems),
    memorySection(
      "Relevant decisions",
      primaryItems.filter((item) => item.type === "decision")
    ),
    memorySection(
      "Relevant constraints",
      primaryItems.filter((item) => item.type === "constraint")
    ),
    memorySection(
      "Relevant facts",
      primaryItems.filter((item) => item.type === "fact")
    ),
    relevantFilesSection(primaryItems),
    memorySection(
      "Open questions",
      primaryItems.filter((item) => item.type === "question")
    ),
    memorySection("Stale or superseded memory to avoid", ranked.staleOrSuperseded)
  ].filter((section) => section.bullets.length > 0);
}

function memorySection(
  title: ContextSectionTitle,
  items: readonly RankedMemoryItem[],
  required = title === "Must know"
): SectionCandidate {
  return {
    title,
    required,
    bullets: items.map((item) => memoryBullet(item))
  };
}

function memoryBullet(item: RankedMemoryItem): BulletCandidate {
  const label = statusLabel(item);
  const title = formatInline(item.title);
  const snippet = bodySnippet(item.candidate.body, title);
  const content = snippet === "" ? title : `${title}: ${snippet}`;
  const labeledContent = label === null ? content : `${label}: ${content}`;
  const compactContent = label === null ? title : `${label}: ${title}`;

  return {
    text: `- ${labeledContent} (${item.id})`,
    compactText: `- ${compactContent} (${item.id})`,
    sourceIds: [item.id]
  };
}

function statusLabel(item: RankedMemoryItem): string | null {
  switch (item.status) {
    case "stale":
      return "STALE";
    case "superseded":
      return "SUPERSEDED";
    default:
      return null;
  }
}

function doNotDoSection(items: readonly RankedMemoryItem[]): SectionCandidate {
  const seen = new Set<string>();
  const bullets: BulletCandidate[] = [];

  for (const item of items) {
    let count = 0;

    for (const directive of negativeDirectives(`${item.title}. ${item.candidate.body}`)) {
      const normalized = directive.toLowerCase();

      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      bullets.push({
        text: `- ${directive} (${item.id})`,
        compactText: `- ${directive} (${item.id})`,
        sourceIds: [item.id]
      });
      count += 1;

      if (count >= MAX_DIRECTIVES_PER_ITEM) {
        break;
      }
    }
  }

  return {
    title: "Do not do",
    required: true,
    bullets
  };
}

function relevantFilesSection(items: readonly RankedMemoryItem[]): SectionCandidate {
  const paths = new Set<string>();

  for (const item of items) {
    for (const path of extractFilePaths(item.candidate.body)) {
      paths.add(path);

      if (paths.size >= MAX_RELEVANT_FILES) {
        break;
      }
    }

    if (paths.size >= MAX_RELEVANT_FILES) {
      break;
    }
  }

  return {
    title: "Relevant files",
    required: false,
    bullets: [...paths].map((path) => ({
      text: `- ${path}`,
      compactText: `- ${path}`,
      sourceIds: []
    }))
  };
}

function renderAllSections(sections: readonly SectionCandidate[]): FitState {
  return {
    sections: sections.map((section) => ({
      title: section.title,
      bullets: section.bullets.map((bullet) => ({
        text: bullet.text,
        sourceIds: bullet.sourceIds
      }))
    })),
    omittedIds: new Set(),
    truncated: false
  };
}

function fitSectionsToTarget(input: {
  headerLines: readonly string[];
  sections: readonly SectionCandidate[];
  tokenTarget: number;
}): FitState {
  const state: FitState = {
    sections: [],
    omittedIds: new Set(),
    truncated: false
  };

  for (const section of input.sections) {
    const renderedSection = section.required
      ? renderRequiredSection(section)
      : renderOptionalSection({
          headerLines: input.headerLines,
          renderedSections: state.sections,
          section,
          tokenTarget: input.tokenTarget,
          omittedIds: state.omittedIds,
          onTruncate: () => {
            state.truncated = true;
          }
        });

    if (renderedSection !== undefined && renderedSection.bullets.length > 0) {
      state.sections.push(renderedSection);
    }
  }

  return state;
}

function renderRequiredSection(section: SectionCandidate): RenderedSection {
  return {
    title: section.title,
    bullets: section.bullets.map((bullet) => ({
      text: bullet.text,
      sourceIds: bullet.sourceIds
    }))
  };
}

function renderOptionalSection(input: {
  headerLines: readonly string[];
  renderedSections: readonly RenderedSection[];
  section: SectionCandidate;
  tokenTarget: number;
  omittedIds: Set<ObjectId>;
  onTruncate: () => void;
}): RenderedSection | undefined {
  let renderedSection: RenderedSection | undefined;

  for (const bullet of input.section.bullets) {
    const fullAttempt = appendBullet(
      renderedSection,
      input.section.title,
      bullet.text,
      bullet.sourceIds
    );

    if (fits(input.headerLines, input.renderedSections, fullAttempt, input.tokenTarget)) {
      renderedSection = fullAttempt;
      continue;
    }

    if (bullet.compactText !== bullet.text) {
      const compactAttempt = appendBullet(
        renderedSection,
        input.section.title,
        bullet.compactText,
        bullet.sourceIds
      );

      if (fits(input.headerLines, input.renderedSections, compactAttempt, input.tokenTarget)) {
        renderedSection = compactAttempt;
        input.onTruncate();
        continue;
      }
    }

    includeIds(input.omittedIds, bullet.sourceIds);
    input.onTruncate();
  }

  return renderedSection;
}

function appendBullet(
  section: RenderedSection | undefined,
  title: ContextSectionTitle,
  bullet: string,
  sourceIds: readonly ObjectId[] = []
): RenderedSection {
  return {
    title,
    bullets: [...(section?.bullets ?? []), { text: bullet, sourceIds }]
  };
}

function fits(
  headerLines: readonly string[],
  renderedSections: readonly RenderedSection[],
  sectionAttempt: RenderedSection,
  tokenTarget: number
): boolean {
  const candidateSections = replaceOrAppendSection(renderedSections, sectionAttempt);
  const candidateMarkdown = renderMarkdown(headerLines, candidateSections);

  return estimateTokenCount(candidateMarkdown) <= tokenTarget;
}

function replaceOrAppendSection(
  sections: readonly RenderedSection[],
  section: RenderedSection
): RenderedSection[] {
  const lastSection = sections.at(-1);

  if (lastSection?.title === section.title) {
    return [...sections.slice(0, -1), section];
  }

  return [...sections, section];
}

function renderMarkdown(
  headerLines: readonly string[],
  sections: readonly RenderedSection[]
): string {
  const lines = [...headerLines];

  for (const section of sections) {
    lines.push("", `## ${section.title}`, "", ...section.bullets.map((bullet) => bullet.text));
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function collectIncludedIds(sections: readonly RenderedSection[]): Set<ObjectId> {
  const ids = new Set<ObjectId>();

  for (const section of sections) {
    for (const bullet of section.bullets) {
      includeIds(ids, bullet.sourceIds);
    }
  }

  return ids;
}

function excludedIds(ranked: RankedMemoryCandidates): ObjectId[] {
  const ids = new Set<ObjectId>();

  for (const excluded of ranked.excluded) {
    ids.add(excluded.id);
  }

  return [...ids];
}

function omittedIdsFromFit(
  omittedIds: ReadonlySet<ObjectId>,
  includedIds: ReadonlySet<ObjectId>
): ObjectId[] {
  const ids: ObjectId[] = [];

  for (const id of omittedIds) {
    if (!includedIds.has(id)) {
      ids.push(id);
    }
  }

  return ids;
}

function budgetStatus(
  tokenTarget: number | undefined,
  estimatedTokens: number
): ContextBudgetStatus {
  if (tokenTarget === undefined) {
    return "not_requested";
  }

  return estimatedTokens <= tokenTarget ? "within_target" : "over_target";
}

function includeIds(target: Set<ObjectId>, ids: readonly ObjectId[]): void {
  for (const id of ids) {
    target.add(id);
  }
}

function negativeDirectives(text: string): string[] {
  return splitSentences(text)
    .map(formatInline)
    .filter((sentence) => /\b(?:do not|don't|never|avoid)\b/i.test(sentence))
    .map((sentence) => trimTrailingSentencePunctuation(sentence));
}

function splitSentences(text: string): string[] {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .split(/(?:[.!?](?=\s|$)\s*|\n+)/u)
      ?.map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0) ?? []
  );
}

function extractFilePaths(text: string): string[] {
  const paths = new Set<string>();
  const matches =
    text.match(
      /(?:\.{1,2}\/)?(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@.-]+(?:\.[A-Za-z0-9]+)?/g
    ) ?? [];

  for (const match of matches) {
    const path = trimPathPunctuation(match);

    if (path === "" || isAictxGeneratedPath(path)) {
      continue;
    }

    paths.add(path);
  }

  return [...paths];
}

function isAictxGeneratedPath(path: string): boolean {
  return (
    path.startsWith(".aictx/") ||
    path.startsWith("./.aictx/") ||
    path.includes("/.aictx/")
  );
}

function bodySnippet(body: string, title: string): string {
  const text = stripLeadingTitle(formatInline(body), title);

  if (text === "") {
    return "";
  }

  return truncateText(text, MAX_BODY_SNIPPET_LENGTH);
}

function stripLeadingTitle(body: string, title: string): string {
  const normalizedBody = body.replace(/^#+\s*/, "").trim();

  if (normalizedBody.toLowerCase().startsWith(title.toLowerCase())) {
    return normalizedBody.slice(title.length).replace(/^[:.\-\s]+/, "").trim();
  }

  return normalizedBody;
}

function formatInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function trimTrailingSentencePunctuation(value: string): string {
  return value.replace(/[.!?]+$/u, "").trim();
}

function trimPathPunctuation(value: string): string {
  return value.replace(/[),.;:!?]+$/u, "");
}
