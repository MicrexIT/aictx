<svelte:options runes={true} />

<script lang="ts">
  import { onMount, tick } from "svelte";

  type ObjectStatus = "active" | "draft" | "stale" | "superseded" | "rejected" | "open" | "closed";
  type ObjectType =
    | "project"
    | "architecture"
    | "decision"
    | "constraint"
    | "question"
    | "fact"
    | "gotcha"
    | "workflow"
    | "note"
    | "concept";
  type RelationStatus = "active" | "stale" | "rejected";
  type RelationConfidence = "low" | "medium" | "high";
  type Predicate =
    | "affects"
    | "requires"
    | "depends_on"
    | "supersedes"
    | "conflicts_with"
    | "mentions"
    | "implements"
    | "related_to";
  type EvidenceKind = "memory" | "relation" | "file" | "commit" | "task";
  type TaskFilter =
    | "all"
    | "before-coding"
    | "api-routes"
    | "schema"
    | "oauth-mcp"
    | "security-gdpr"
    | "review";

  interface Scope {
    kind: "project" | "branch" | "task";
    project: string;
    branch: string | null;
    task: string | null;
  }

  interface Source {
    kind: "agent" | "user" | "cli" | "mcp" | "system";
    task?: string;
    commit?: string;
  }

  interface ObjectFacets {
    category: string;
    applies_to?: string[];
    load_modes?: string[];
  }

  interface MemoryObjectSummary {
    id: string;
    type: ObjectType;
    status: ObjectStatus;
    title: string;
    body_path: string;
    json_path: string;
    scope: Scope;
    tags: string[];
    facets: ObjectFacets | null;
    evidence: Array<{ kind: EvidenceKind; id: string }>;
    source: Source | null;
    superseded_by: string | null;
    created_at: string;
    updated_at: string;
    body: string;
  }

  interface MemoryRelationSummary {
    id: string;
    from: string;
    predicate: Predicate;
    to: string;
    status: RelationStatus;
    confidence: RelationConfidence | null;
    evidence: Array<{ kind: EvidenceKind; id: string }>;
    content_hash: string | null;
    created_at: string;
    updated_at: string;
    json_path: string;
  }

  interface ViewerBootstrapData {
    project: {
      id: string;
      name: string;
    };
    objects: MemoryObjectSummary[];
    relations: MemoryRelationSummary[];
    counts: {
      objects: number;
      relations: number;
      stale_objects: number;
      superseded_objects: number;
      rejected_objects: number;
      active_relations: number;
    };
    storage_warnings: string[];
  }

  interface RegisteredProjectSummary {
    registry_id: string;
    project: {
      id: string;
      name: string;
    };
    project_root: string;
    aictx_root: string;
    source: "auto" | "manual";
    registered_at: string;
    last_seen_at: string;
  }

  interface ViewerProjectSummary extends RegisteredProjectSummary {
    current: boolean;
    available: boolean;
    counts: ViewerBootstrapData["counts"] | null;
    git: ViewerSuccessEnvelope["meta"]["git"] | null;
    warnings: string[];
  }

  interface ViewerProjectsData {
    registry_path: string;
    projects: ViewerProjectSummary[];
    counts: {
      projects: number;
      available: number;
      unavailable: number;
    };
    current_project_registry_id: string | null;
  }

  interface ExportObsidianProjectionData {
    format: "obsidian";
    output_dir: string;
    manifest_path: string;
    objects_exported: number;
    relations_linked: number;
    files_written: string[];
    files_removed: string[];
  }

  interface ViewerSuccessEnvelope<TData = ViewerBootstrapData> {
    ok: true;
    data: TData;
    warnings: string[];
    meta: {
      project_root: string;
      aictx_root: string;
      git: {
        available: boolean;
        branch: string | null;
        commit: string | null;
        dirty: boolean | null;
      };
    };
  }

  interface ViewerErrorEnvelope {
    ok: false;
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
    warnings: string[];
  }

  type ViewerEnvelope = ViewerSuccessEnvelope<ViewerBootstrapData> | ViewerErrorEnvelope;
  type ViewerProjectsEnvelope = ViewerSuccessEnvelope<ViewerProjectsData> | ViewerErrorEnvelope;
  type ExportEnvelope = ViewerSuccessEnvelope<ExportObsidianProjectionData> | ViewerErrorEnvelope;
  type ViewerState = "loading" | "ready" | "error";
  type ViewerScreen = "projects" | "memories" | "detail" | "export";
  type ExportState = "idle" | "running" | "success" | "error";
  type BriefState = "idle" | "copied" | "error";
  type GraphScope = "overview" | "local";
  type GraphDepth = 1 | 2;

  interface MarkdownBlock {
    kind: "heading" | "paragraph" | "list" | "quote" | "code";
    text?: string;
    level?: 1 | 2 | 3;
    items?: string[];
  }

  interface HandbookSection {
    id: string;
    title: string;
    objects: MemoryObjectSummary[];
  }

  interface TaskOption {
    id: TaskFilter;
    label: string;
  }

  interface GraphGroup {
    key: string;
    title: string;
    lane: string;
    objects: MemoryObjectSummary[];
  }

  interface GraphNode {
    id: string;
    objectIds: string[];
    title: string;
    type: ObjectType;
    status: ObjectStatus;
    lane: string;
    groupKey: string | null;
    grouped: boolean;
    x: number;
    y: number;
    labelX: number;
    labelY: number;
    labelWidth: number;
    textAnchor: "start" | "end";
    radius: number;
    color: string;
    selected: boolean;
    neighbor: boolean;
    dimmed: boolean;
  }

  interface GraphEdge {
    id: string;
    predicate: Predicate;
    from: GraphNode;
    to: GraphNode;
    highlighted: boolean;
    dimmed: boolean;
    implicit: boolean;
    count: number;
  }

  let loadState = $state<ViewerState>("loading");
  let projectLoadState = $state<ViewerState>("loading");
  let projectsData = $state<ViewerProjectsData | null>(null);
  let bootstrap = $state<ViewerBootstrapData | null>(null);
  let warnings = $state<string[]>([]);
  let errorMessage = $state("");
  let projectErrorMessage = $state("");
  let currentScreen = $state<ViewerScreen>("projects");
  let selectedProjectId = $state<string | null>(null);
  let searchQuery = $state("");
  let typeFilter = $state("all");
  let statusFilter = $state("all");
  let tagFilter = $state("all");
  let selectedObjectId = $state<string | null>(null);
  let graphFocusId = $state<string | null>(null);
  let taskFilter = $state<TaskFilter>("all");
  let showSelectedJson = $state(false);
  let exportOutDir = $state("");
  let exportState = $state<ExportState>("idle");
  let exportMessage = $state("");
  let exportErrorCode = $state("");
  let exportFilesWritten = $state(0);
  let exportManifestPath = $state("");
  let briefState = $state<BriefState>("idle");
  let expandedGraphGroups = $state<string[]>([]);
  let pendingOpenObjectId = $state<string | null>(null);
  let githubStars = $state<number | null>(null);

  const graphWidth = 480;
  const graphMinHeight = 420;
  const graphGroupThreshold = 5;
  const graphScope: GraphScope = "local";
  const graphDepth: GraphDepth = 2;
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const githubRepoUrl = "https://github.com/MicrexIT/aictx";
  const githubReadmeUrl = `${githubRepoUrl}#readme`;
  const githubRepoApiUrl = "https://api.github.com/repos/MicrexIT/aictx";
  const taskOptions: TaskOption[] = [
    { id: "all", label: "All memory" },
    { id: "before-coding", label: "Before coding" },
    { id: "api-routes", label: "API routes" },
    { id: "schema", label: "Changing schema" },
    { id: "oauth-mcp", label: "OAuth/MCP" },
    { id: "security-gdpr", label: "Security/GDPR" },
    { id: "review", label: "Review memory" }
  ];
  const objects = $derived(bootstrap?.objects ?? []);
  const relations = $derived(bootstrap?.relations ?? []);
  const objectById = $derived(new Map(objects.map((object) => [object.id, object])));
  const typeOptions = $derived(uniqueSorted(objects.map((object) => object.type)));
  const statusOptions = $derived(uniqueSorted(objects.map((object) => object.status)));
  const tagOptions = $derived(uniqueSorted(objects.flatMap((object) => object.tags)));
  const visibleWarnings = $derived(uniqueSorted([...(bootstrap?.storage_warnings ?? []), ...warnings]));
  const linkedObjectIds = $derived.by(() => linkedIds(relations));
  const selectedObject = $derived.by(() =>
    objectById.get(selectedObjectId ?? "") ?? objects[0] ?? null
  );
  const highImpactObjects = $derived.by(() =>
    objects
      .filter((object) => isHighImpact(object, linkedObjectIds))
      .sort(compareMemoryPriority)
      .slice(0, 7)
  );
  const hardRuleObjects = $derived.by(() =>
    objects
      .filter((object) => isHardRule(object))
      .sort(compareMemoryPriority)
      .slice(0, 6)
  );
  const securityObjects = $derived.by(() =>
    objects
      .filter((object) => isSecurityMemory(object))
      .sort(compareMemoryPriority)
      .slice(0, 6)
  );
  const repoLinkedObjects = $derived.by(() =>
    objects
      .filter((object) => relatedFiles(object).length > 0)
      .sort(compareMemoryPriority)
      .slice(0, 6)
  );
  const staleObjects = $derived.by(() =>
    objects
      .filter((object) => object.status === "stale" || object.status === "superseded")
      .sort(compareMemoryPriority)
      .slice(0, 6)
  );
  const filteredObjects = $derived.by(() =>
    objects
      .filter((object) => objectMatchesSearch(object, searchQuery))
      .filter((object) => typeFilter === "all" || object.type === typeFilter)
      .filter((object) => statusFilter === "all" || object.status === statusFilter)
      .filter((object) => tagFilter === "all" || object.tags.includes(tagFilter))
      .filter((object) => matchesTaskFilter(object, taskFilter, linkedObjectIds))
      .sort(compareMemoryPriority)
  );
  const graphObjects = $derived.by(() =>
    graphObjectsForView(
      filteredObjects,
      objectById,
      relations,
      selectedObject?.id ?? null,
      graphFocusId,
      linkedObjectIds,
      graphScope,
      graphDepth,
      true
    )
  );
  const hiddenUnlinkedConcepts = $derived.by(() =>
    filteredObjects.filter((object) => object.type === "concept" && !linkedObjectIds.has(object.id))
  );
  const graphHeight = $derived.by(() =>
    graphHeightForObjects(graphObjects, selectedObject?.id ?? null, graphFocusId)
  );
  const graphNodeList = $derived.by(() =>
    buildGraphNodes(
      graphObjects,
      relations,
      selectedObject?.id ?? null,
      graphFocusId,
      expandedGraphGroups,
      true
    )
  );
  const graphNodeById = $derived(new Map(graphNodeList.flatMap((node) => node.objectIds.map((id) => [id, node]))));
  const groupedGraphObjectCount = $derived(
    graphNodeList.reduce((total, node) => total + (node.grouped ? node.objectIds.length : 0), 0)
  );
  const graphEdgeList = $derived.by(() =>
    buildGraphEdges(relations, graphNodeById, graphNodeList, graphFocusId, true)
  );
  const directGraphEdgeCount = $derived(graphEdgeList.filter((edge) => !edge.implicit).length);
  const graphPreview = $derived.by(() =>
    objectById.get(graphFocusId ?? selectedObject?.id ?? "") ?? selectedObject
  );
  const selectedRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : relations
          .filter((relation) => relation.from === selectedObject.id || relation.to === selectedObject.id)
          .sort(compareRelations)
  );
  const outgoingRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : selectedRelations.filter((relation) => relation.from === selectedObject.id)
  );
  const incomingRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : selectedRelations.filter((relation) => relation.to === selectedObject.id)
  );
  const sections = $derived.by(() => buildSections(filteredObjects));
  const agentBrief = $derived.by(() =>
    buildAgentBrief(hardRuleObjects, securityObjects, highImpactObjects)
  );
  const hasStarterMemoryOnly = $derived.by(() => isStarterMemoryOnly(objects));

  onMount(() => {
    void loadBootstrap();
    if (!navigator.webdriver) {
      void loadGitHubStars();
    }
  });

  async function loadBootstrap(): Promise<void> {
    if (token === "") {
      loadState = "error";
      errorMessage = "Viewer API token is missing from the local URL.";
      return;
    }

    try {
      const response = await fetch(`/api/bootstrap?token=${encodeURIComponent(token)}`, {
        headers: {
          accept: "application/json"
        }
      });
      const envelope = (await response.json()) as ViewerEnvelope;

      warnings = envelope.warnings ?? [];

      if (!response.ok || !envelope.ok) {
        loadState = "error";
        errorMessage = envelope.ok
          ? `Viewer API request failed with HTTP ${response.status}.`
          : `${envelope.error.code}: ${envelope.error.message}`;
        return;
      }

      bootstrap = envelope.data;
      selectedObjectId = envelope.data.objects[0]?.id ?? null;
      graphFocusId = null;
      loadState = "ready";
    } catch (error) {
      loadState = "error";
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function loadGitHubStars(): Promise<void> {
    try {
      const response = await fetch(githubRepoApiUrl, {
        headers: {
          accept: "application/vnd.github+json"
        }
      });

      if (!response.ok) {
        return;
      }

      const repo = (await response.json()) as { stargazers_count?: unknown };

      if (typeof repo.stargazers_count === "number") {
        githubStars = repo.stargazers_count;
      }
    } catch {
      githubStars = null;
    }
  }

  async function exportObsidian(): Promise<void> {
    if (token === "") {
      exportState = "error";
      exportErrorCode = "AICtxValidationFailed";
      exportMessage = "Viewer API token is missing from the local URL.";
      return;
    }

    exportState = "running";
    exportMessage = "Exporting memory files for Obsidian.";
    exportErrorCode = "";
    exportFilesWritten = 0;
    exportManifestPath = "";

    const trimmedOutDir = exportOutDir.trim();
    const requestBody = trimmedOutDir === "" ? {} : { outDir: trimmedOutDir };

    try {
      const response = await fetch(`/api/export/obsidian?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      const envelope = (await response.json()) as ExportEnvelope;

      warnings = uniqueSorted([...warnings, ...(envelope.warnings ?? [])]);

      if (!response.ok || !envelope.ok) {
        exportState = "error";
        exportErrorCode = envelope.ok ? "" : envelope.error.code;
        exportMessage = envelope.ok
          ? `Viewer export request failed with HTTP ${response.status}.`
          : `${envelope.error.code}: ${envelope.error.message}`;
        return;
      }

      exportState = "success";
      exportMessage = "Export complete. Obsidian vault updated.";
      exportFilesWritten = envelope.data.files_written.length;
      exportManifestPath = envelope.data.manifest_path;
    } catch (error) {
      exportState = "error";
      exportErrorCode = "AICtxInternalError";
      exportMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function copyAgentBrief(): Promise<void> {
    try {
      await navigator.clipboard.writeText(agentBrief);
      briefState = "copied";
      window.setTimeout(() => {
        briefState = "idle";
      }, 1800);
    } catch {
      briefState = "error";
    }
  }

  function exportMarkdown(): void {
    downloadText(`${projectName()}-coding-handbook.md`, handbookMarkdown());
  }

  function exportStaticHtml(): void {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(projectName())} Coding Handbook</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.55;color:#222;margin:40px;max-width:900px}pre{background:#f6f4ef;padding:12px;border:1px solid #ddd;border-radius:6px;white-space:pre-wrap}details{border-top:1px solid #ddd;padding:10px 0}summary{cursor:pointer;font-weight:700}</style></head><body><pre>${escapeHtml(handbookMarkdown())}</pre></body></html>`;
    downloadText(`${projectName()}-coding-handbook.html`, html);
  }

  function printHandbook(): void {
    window.print();
  }

  function selectObject(id: string): void {
    selectedObjectId = id;
    graphFocusId = id;
    showSelectedJson = false;
  }

  async function openObjectToggle(id: string): Promise<void> {
    selectedObjectId = id;
    graphFocusId = id;
    pendingOpenObjectId = id;
    await tick();
    const details = document.querySelector<HTMLDetailsElement>(`details[data-memory-id="${cssEscape(id)}"]`);

    if (details !== null) {
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function chooseTaskFilter(filter: TaskFilter): void {
    taskFilter = filter;
    graphFocusId = null;
    typeFilter = "all";
    statusFilter = "all";
    tagFilter = "all";
    showSelectedJson = false;
    const nextObject = objects.find((object) =>
      objectMatchesSearch(object, searchQuery) && matchesTaskFilter(object, filter, linkedObjectIds)
    );
    selectedObjectId = nextObject?.id ?? objects[0]?.id ?? null;
  }

  function activateGraphNode(node: GraphNode): void {
    if (node.grouped && node.groupKey !== null) {
      toggleGraphGroup(node.groupKey);
      return;
    }

    selectObject(node.objectIds[0] ?? node.id);
  }

  function toggleGraphGroup(groupKey: string): void {
    expandedGraphGroups = expandedGraphGroups.includes(groupKey)
      ? expandedGraphGroups.filter((key) => key !== groupKey)
      : [...expandedGraphGroups, groupKey];
  }

  function handleTaskFilterChange(event: Event): void {
    chooseTaskFilter((event.currentTarget as HTMLSelectElement).value as TaskFilter);
  }

  function objectMatchesSearch(object: MemoryObjectSummary, rawQuery: string): boolean {
    const query = normalizeText(rawQuery);

    if (query === "") {
      return true;
    }

    return normalizeText([
      object.title,
      object.id,
      object.type,
      object.status,
      object.tags.join(" "),
      object.facets?.category ?? "",
      object.facets?.applies_to?.join(" ") ?? "",
      object.evidence.map((item) => item.id).join(" "),
      object.body
    ].join(" ")).includes(query);
  }

  function matchesTaskFilter(
    object: MemoryObjectSummary,
    filter: TaskFilter,
    linkedIdsForTask: Set<string>
  ): boolean {
    if (filter === "all") {
      return true;
    }

    const text = memorySearchText(object);

    if (filter === "before-coding") {
      return isHighImpact(object, linkedIdsForTask) || isHardRule(object) || object.type === "workflow";
    }

    if (filter === "api-routes") {
      return includesAny(text, ["api", "route", "endpoint", "request", "response", "handler"]);
    }

    if (filter === "schema") {
      return includesAny(text, ["schema", "migration", "database", "sqlite", "storage", "validation", "type"]);
    }

    if (filter === "oauth-mcp") {
      return includesAny(text, ["oauth", "mcp", "tool", "server", "authorization", "token"]);
    }

    if (filter === "security-gdpr") {
      return isSecurityMemory(object);
    }

    return isReviewMemory(object, linkedIdsForTask);
  }

  function buildSections(sourceObjects: MemoryObjectSummary[]): HandbookSection[] {
    const candidates = uniqueById(sourceObjects).sort(compareMemoryPriority);
    const usedIds = new Set<string>();
    const takeSection = (
      id: string,
      title: string,
      predicate: (object: MemoryObjectSummary) => boolean
    ): HandbookSection => {
      const sectionObjects = candidates.filter((object) => !usedIds.has(object.id) && predicate(object));

      for (const object of sectionObjects) {
        usedIds.add(object.id);
      }

      return {
        id,
        title,
        objects: sectionObjects
      };
    };

    return [
      takeSection("do-not-do", "Do Not Do", (object) => isHardRule(object) || object.type === "gotcha"),
      takeSection("coding-workflows", "Coding Workflows", (object) => object.type === "workflow"),
      takeSection("architecture", "Architecture", (object) =>
        object.type === "architecture" || hasFacetCategory(object, "architecture") || hasFacetCategory(object, "file-layout")
      ),
      takeSection("security-notes", "Security Notes", (object) => isSecurityMemory(object)),
      takeSection("commands", "Commands", (object) =>
        object.type === "workflow" || includesAny(memorySearchText(object), ["pnpm ", "npm ", "aictx ", "command", "script"])
      ),
      {
        id: "source-memory",
        title: "Source Memory",
        objects: candidates.filter((object) => !usedIds.has(object.id))
      }
    ];
  }

  function graphObjectsForView(
    baseObjects: MemoryObjectSummary[],
    lookup: Map<string, MemoryObjectSummary>,
    relationList: MemoryRelationSummary[],
    selectedId: string | null,
    focusId: string | null,
    linkedIdsForGraph: Set<string>,
    scope: GraphScope,
    depth: GraphDepth,
    includeConcepts: boolean
  ): MemoryObjectSummary[] {
    const ids = new Set<string>();

    const anchorId = focusId ?? selectedId;
    const focusObject = anchorId === null ? null : lookup.get(anchorId) ?? null;
    const shouldUseFocusedNeighborhood = scope === "local" && anchorId !== null && focusObject !== null && focusObject.type !== "project";

    if (shouldUseFocusedNeighborhood) {
      for (const neighborId of neighborIdsWithinDepth(anchorId, relationList, depth)) {
        ids.add(neighborId);
      }
    } else {
      for (const object of baseObjects) {
        ids.add(object.id);
      }

      if (selectedId !== null) {
        for (const neighborId of directNeighborIds(selectedId, relationList)) {
          ids.add(neighborId);
        }
      }
    }

    const candidates = [...ids]
      .map((id) => lookup.get(id))
      .filter((object): object is MemoryObjectSummary => object !== undefined)
      .filter((object) => includeConcepts || object.type !== "concept")
      .filter((object) => object.type !== "concept" || linkedIdsForGraph.has(object.id))
      .sort(compareMemoryPriority);

    return candidates;
  }

  function neighborIdsWithinDepth(
    id: string,
    relationList: MemoryRelationSummary[],
    depth: GraphDepth
  ): Set<string> {
    const ids = new Set<string>([id]);
    let frontier = new Set<string>([id]);

    for (let level = 0; level < depth; level += 1) {
      const next = new Set<string>();

      for (const frontierId of frontier) {
        for (const neighborId of directNeighborIds(frontierId, relationList)) {
          if (!ids.has(neighborId)) {
            ids.add(neighborId);
            next.add(neighborId);
          }
        }
      }

      frontier = next;
    }

    return ids;
  }

  function graphHeightForObjects(
    memoryObjects: MemoryObjectSummary[],
    selectedId: string | null,
    focusId: string | null
  ): number {
    const isDenseNeighborhood = (focusId ?? selectedId) !== null && memoryObjects.length > 10;
    const neededHeight = isDenseNeighborhood ? 470 : 420;

    return isDenseNeighborhood ? Math.max(graphMinHeight, neededHeight) : graphMinHeight;
  }

  function graphNodeConnectionCount(node: GraphNode, edges: GraphEdge[]): number {
    return edges.filter((edge) => edge.from.id === node.id || edge.to.id === node.id)
      .reduce((total, edge) => total + edge.count, 0);
  }

  function graphNodeRelationshipLabel(node: GraphNode, edges: GraphEdge[]): string {
    if (node.selected) {
      return "Current memory";
    }

    if (node.grouped) {
      return "Grouped lane";
    }

    const explicitPredicates = edges
      .filter((edge) => !edge.implicit && (edge.from.id === node.id || edge.to.id === node.id))
      .map((edge) => {
        const direction = edge.from.id === node.id ? "from" : "to";
        return `${direction} ${edge.predicate}${edge.count > 1 ? ` x${edge.count}` : ""}`;
      });

    if (explicitPredicates.length > 0) {
      return uniqueSorted(explicitPredicates).join(", ");
    }

    return "Inferred link";
  }

  function graphNodeActionLabel(node: GraphNode): string {
    if (node.grouped) {
      return expandedGraphGroups.includes(node.groupKey ?? "") ? "Collapse" : "Expand";
    }

    return node.selected ? "Focused" : "Focus";
  }

  function graphBucketItems(
    bucket: Array<MemoryObjectSummary | GraphGroup>,
    lane: string,
    anchorId: string | null,
    expandedGroups: string[]
  ): Array<MemoryObjectSummary | GraphGroup> {
    const memoryObjects = bucket.filter((item): item is MemoryObjectSummary => !isGraphGroup(item));
    const sorted = memoryObjects.sort(compareMemoryPriority);
    const pinned = anchorId === null ? [] : sorted.filter((object) => object.id === anchorId);
    const candidates = sorted.filter((object) => object.id !== anchorId);

    if (candidates.length < graphGroupThreshold) {
      return sorted;
    }

    const group = graphGroupForLane(lane, candidates);

    if (expandedGroups.includes(group.key)) {
      return sorted;
    }

    return [...pinned, group].sort(compareGraphItems);
  }

  function graphGroupForLane(lane: string, objectsForGroup: MemoryObjectSummary[]): GraphGroup {
    const sorted = objectsForGroup.sort(compareMemoryPriority);
    const allFeatures = sorted.every((object) => object.title.startsWith("Feature: "));
    const title = allFeatures
      ? `Features (${sorted.length})`
      : `${laneLabel(lane)} (${sorted.length})`;

    return {
      key: `${lane}:${allFeatures ? "features" : "group"}`,
      title,
      lane,
      objects: sorted
    };
  }

  function compareGraphItems(left: MemoryObjectSummary | GraphGroup, right: MemoryObjectSummary | GraphGroup): number {
    const leftObject = graphItemPrimaryObject(left);
    const rightObject = graphItemPrimaryObject(right);

    return compareMemoryPriority(leftObject, rightObject);
  }

  function isGraphGroup(item: MemoryObjectSummary | GraphGroup): item is GraphGroup {
    return "objects" in item;
  }

  function graphItemId(item: MemoryObjectSummary | GraphGroup): string {
    return isGraphGroup(item) ? `group-${item.key}` : item.id;
  }

  function graphItemObjectIds(item: MemoryObjectSummary | GraphGroup): string[] {
    return isGraphGroup(item) ? item.objects.map((object) => object.id) : [item.id];
  }

  function graphItemPrimaryObject(item: MemoryObjectSummary | GraphGroup): MemoryObjectSummary {
    return isGraphGroup(item) ? item.objects[0]! : item;
  }

  function graphItemTitle(item: MemoryObjectSummary | GraphGroup): string {
    return isGraphGroup(item) ? item.title : item.title;
  }

  function laneLabel(lane: string): string {
    if (lane === "architecture") {
      return "Architecture";
    }
    if (lane === "rules") {
      return "Rules";
    }
    if (lane === "workflows") {
      return "Workflows";
    }
    if (lane === "facts") {
      return "Facts";
    }
    if (lane === "project") {
      return "Project";
    }
    return "Concepts";
  }

  function buildGraphNodes(
    memoryObjects: MemoryObjectSummary[],
    relationList: MemoryRelationSummary[],
    selectedId: string | null,
    focusId: string | null,
    expandedGroups: string[],
    shouldGroup: boolean
  ): GraphNode[] {
    const idsInGraph = new Set(memoryObjects.map((object) => object.id));
    const anchorId = focusId ?? selectedId;
    const neighborIds = anchorId === null ? new Set<string>() : directNeighborIds(anchorId, relationList);
    const project = memoryObjects.find((object) => object.type === "project") ?? memoryObjects[0];
    const laneBuckets = new Map<string, Array<MemoryObjectSummary | GraphGroup>>();

    for (const object of memoryObjects) {
      const lane = laneForObject(object, project?.id ?? null);
      laneBuckets.set(lane, [...(laneBuckets.get(lane) ?? []), object]);
    }

    const nodes: GraphNode[] = [];
    const graphItems: Array<{ item: MemoryObjectSummary | GraphGroup; lane: string }> = [];

    for (const [lane, bucket] of laneBuckets.entries()) {
      const sorted = shouldGroup
        ? graphBucketItems(bucket, lane, anchorId, expandedGroups)
        : bucket.filter((item): item is MemoryObjectSummary => !isGraphGroup(item)).sort(compareMemoryPriority);

      for (const item of sorted) {
        graphItems.push({ item, lane });
      }
    }

    const degreeById = graphDegreeByObjectId(relationList, idsInGraph);
    const itemCountByLane = new Map<string, number>();
    const itemIndexByLane = new Map<string, number>();

    for (const { lane } of graphItems) {
      itemCountByLane.set(lane, (itemCountByLane.get(lane) ?? 0) + 1);
    }

    graphItems
      .sort((left, right) => compareGraphItems(left.item, right.item))
      .forEach(({ item, lane }) => {
        const index = itemIndexByLane.get(lane) ?? 0;
        const total = itemCountByLane.get(lane) ?? 1;
        itemIndexByLane.set(lane, index + 1);
        const position = graphClusterPosition(lane, index, total);
        const ids = graphItemObjectIds(item);
        const primaryObject = graphItemPrimaryObject(item);
        const degree = ids.reduce((totalDegree, id) => totalDegree + (degreeById.get(id) ?? 0), 0);
        const isFocus = anchorId !== null && ids.includes(anchorId);
        const isNeighbor = anchorId !== null && ids.some((id) => neighborIds.has(id));
        const isSelected = selectedId !== null && ids.includes(selectedId);
        nodes.push({
          id: graphItemId(item),
          objectIds: ids,
          title: graphItemTitle(item),
          type: primaryObject.type,
          status: primaryObject.status,
          lane,
          groupKey: isGraphGroup(item) ? item.key : null,
          grouped: isGraphGroup(item),
          x: position.x,
          y: position.y,
          labelX: position.x + position.labelOffset,
          labelY: position.y + 4,
          labelWidth: isGraphGroup(item) ? Math.max(position.labelWidth, 136) : position.labelWidth,
          textAnchor: position.anchor,
          radius: graphNodeRadius(lane, isGraphGroup(item), degree),
          color: graphColor(primaryObject, lane),
          selected: isSelected || isFocus,
          neighbor: isNeighbor,
          dimmed: anchorId !== null && !isFocus && !isNeighbor
        });
      });

    return nodes.filter((node) => node.objectIds.some((id) => idsInGraph.has(id)));
  }

  function graphDegreeByObjectId(
    relationList: MemoryRelationSummary[],
    idsInGraph: Set<string>
  ): Map<string, number> {
    const degree = new Map<string, number>();

    for (const relation of relationList) {
      if (idsInGraph.has(relation.from)) {
        degree.set(relation.from, (degree.get(relation.from) ?? 0) + 1);
      }
      if (idsInGraph.has(relation.to)) {
        degree.set(relation.to, (degree.get(relation.to) ?? 0) + 1);
      }
    }

    return degree;
  }

  function graphClusterPosition(
    lane: string,
    index: number,
    total: number
  ): { x: number; y: number; labelOffset: number; labelWidth: number; anchor: "start" | "end" } {
    const centerX = graphWidth / 2;
    const centerY = graphHeight / 2;

    if (lane === "project") {
      return { x: centerX, y: centerY, labelOffset: 24, labelWidth: 132, anchor: "start" };
    }

    const cluster = graphClusterForLane(lane);
    const angle = cluster.angle + graphSpreadAngle(index, total);
    const radius = cluster.radius + graphRadiusJitter(index, total);
    const x = clamp(centerX + Math.cos(angle) * radius, 46, graphWidth - 150);
    const y = clamp(centerY + Math.sin(angle) * radius, 46, graphHeight - 46);
    const isLeft = x < centerX;

    return {
      x,
      y,
      labelOffset: isLeft ? -cluster.labelWidth - 18 : 18,
      labelWidth: cluster.labelWidth,
      anchor: isLeft ? "end" : "start"
    };
  }

  function graphClusterForLane(lane: string): { angle: number; radius: number; labelWidth: number } {
    if (lane === "architecture") {
      return { angle: -0.22, radius: 122, labelWidth: 138 };
    }
    if (lane === "rules") {
      return { angle: 0.45, radius: 150, labelWidth: 142 };
    }
    if (lane === "workflows") {
      return { angle: 1.55, radius: 136, labelWidth: 136 };
    }
    if (lane === "facts") {
      return { angle: 2.48, radius: 140, labelWidth: 136 };
    }

    return { angle: -2.5, radius: 152, labelWidth: 150 };
  }

  function graphSpreadAngle(index: number, total: number): number {
    if (total <= 1) {
      return 0;
    }

    const centeredIndex = index - (total - 1) / 2;
    const spread = Math.min(0.9, 0.22 * (total - 1));

    return centeredIndex * (spread / Math.max(1, total - 1));
  }

  function graphRadiusJitter(index: number, total: number): number {
    if (total <= 2) {
      return 0;
    }

    return (index % 2 === 0 ? 1 : -1) * Math.min(30, 7 * total);
  }

  function graphNodeRadius(lane: string, grouped: boolean, degree: number): number {
    const centralityBoost = clamp(degree, 0, 8) * 0.85;

    if (grouped) {
      return 13 + Math.min(5, centralityBoost);
    }

    if (lane === "project") {
      return 17 + Math.min(5, centralityBoost);
    }

    if (lane === "architecture") {
      return 11 + Math.min(4, centralityBoost);
    }

    return 9 + Math.min(4, centralityBoost);
  }

  function buildGraphEdges(
    relationList: MemoryRelationSummary[],
    nodeLookup: Map<string, GraphNode>,
    nodes: GraphNode[],
    focusId: string | null,
    includeImplicitEdges: boolean
  ): GraphEdge[] {
    const selectedNode = nodes.find((node) => node.selected);
    const anchorId = focusId ?? selectedNode?.id ?? null;
    const explicitEdgesByKey = new Map<string, GraphEdge>();

    for (const relation of relationList) {
        const from = nodeLookup.get(relation.from);
        const to = nodeLookup.get(relation.to);

        if (from === undefined || to === undefined) {
          continue;
        }

        if (from.id === to.id) {
          continue;
        }

        const key = `${from.id}->${to.id}:${relation.predicate}`;
        const highlighted = anchorId !== null && (relation.from === anchorId || relation.to === anchorId);
        const existing = explicitEdgesByKey.get(key);

        if (existing !== undefined) {
          existing.count += 1;
          existing.highlighted = existing.highlighted || highlighted;
          existing.dimmed = anchorId !== null && !existing.highlighted;
          continue;
        }

        explicitEdgesByKey.set(key, {
          id: relation.id.startsWith("rel.") ? relation.id : key,
          predicate: relation.predicate,
          from,
          to,
          highlighted,
          dimmed: anchorId !== null && !highlighted,
          implicit: false,
          count: 1
        });
    }

    const explicitEdges = [...explicitEdgesByKey.values()].sort((left, right) => left.id.localeCompare(right.id));
    const project = nodes.find((node) => node.lane === "project");

    if (project === undefined || !includeImplicitEdges) {
      return explicitEdges;
    }

    const explicitPairs = new Set(
      explicitEdges.flatMap((edge) => [`${edge.from.id}->${edge.to.id}`, `${edge.to.id}->${edge.from.id}`])
    );
    const implicitEdges = nodes
      .filter((node) => node.id !== project.id)
      .filter((node) => !explicitPairs.has(`${project.id}->${node.id}`))
      .map((node) => {
        const highlighted = anchorId !== null && (project.id === anchorId || node.id === anchorId);
        return {
          id: `implicit-${project.id}-${node.id}`,
          predicate: "related_to" as Predicate,
          from: project,
          to: node,
          highlighted,
          dimmed: anchorId !== null && !highlighted,
          implicit: true,
          count: 1
        };
      });

    return [...explicitEdges, ...implicitEdges];
  }

  function laneY(index: number, total: number, top: number, bottom: number): number {
    if (total <= 1) {
      return clamp((top + bottom) / 2, 36, graphHeight - 36);
    }

    return clamp(top + ((bottom - top) / (total - 1)) * index, 36, graphHeight - 36);
  }

  function laneForObject(object: MemoryObjectSummary, projectId: string | null): string {
    if (object.type === "project" || object.id === projectId) {
      return "project";
    }

    if (object.type === "architecture" || hasFacetCategory(object, "architecture") || hasFacetCategory(object, "file-layout")) {
      return "architecture";
    }

    if (object.type === "constraint" || object.type === "gotcha" || object.type === "decision") {
      return "rules";
    }

    if (object.type === "workflow") {
      return "workflows";
    }

    if (object.type === "fact" || object.type === "question" || isSecurityMemory(object)) {
      return "facts";
    }

    return "other";
  }

  function graphColor(object: MemoryObjectSummary, lane: string): string {
    if (lane === "project" || object.type === "project") {
      return "#171717";
    }

    if (lane === "architecture") {
      return "#a97a18";
    }

    if (lane === "rules") {
      return "#ad4332";
    }

    if (lane === "workflows") {
      return "#2b7f98";
    }

    if (lane === "facts") {
      return "#397c4e";
    }

    return "#7a5fbd";
  }

  function objectIcon(object: MemoryObjectSummary): string {
    if (object.type === "project") {
      return "📘";
    }

    if (object.type === "architecture") {
      return "⌂";
    }

    if (object.type === "workflow") {
      return "↻";
    }

    if (isHardRule(object)) {
      return "!";
    }

    return "•";
  }

  function showProjects(): void {
    currentScreen = "projects";
    selectedObjectId = null;
  }

  function showMemories(): void {
    if (selectedProjectId === null) {
      currentScreen = "projects";
      return;
    }

    currentScreen = "memories";
  }

  function showExport(): void {
    if (selectedProjectId === null) {
      currentScreen = "projects";
      return;
    }

    currentScreen = "export";
  }

  function gitLabel(project: ViewerProjectSummary): string {
    if (!project.available) {
      return "Unavailable";
    }

    if (project.git === null || !project.git.available) {
      return "No Git";
    }

    if (project.git.dirty === true) {
      return "Memory dirty";
    }

    if (project.git.dirty === false) {
      return "Memory clean";
    }

    return "Git available";
  }

  function relationCounterpart(relation: MemoryRelationSummary, objectId: string): string {
    return relation.from === objectId ? relation.to : relation.from;
  }

  function relationObject(relation: MemoryRelationSummary, objectId: string): MemoryObjectSummary | null {
    return objectById.get(relationCounterpart(relation, objectId)) ?? null;
  }

  function relationDirectionLabel(relation: MemoryRelationSummary, objectId: string): string {
    if (relation.from === objectId && relation.to === objectId) {
      return "self";
    }

    return relation.from === objectId ? "outgoing" : "incoming";
  }

  function relationTargetLabel(relation: MemoryRelationSummary, objectId: string): string {
    const related = relationObject(relation, objectId);

    return related === null ? relationCounterpart(relation, objectId) : related.title;
  }

  function relationStatusLabel(relation: MemoryRelationSummary): string {
    return relation.confidence === null
      ? relation.status
      : `${relation.status} / ${relation.confidence} confidence`;
  }

  function countLabel(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function sidecarJsonForObject(object: MemoryObjectSummary): Record<string, unknown> {
    return {
      id: object.id,
      type: object.type,
      status: object.status,
      title: object.title,
      body_path: object.body_path,
      json_path: object.json_path,
      scope: object.scope,
      tags: object.tags,
      facets: object.facets,
      evidence: object.evidence,
      source: object.source,
      superseded_by: object.superseded_by,
      created_at: object.created_at,
      updated_at: object.updated_at
    };
  }

  function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let paragraph: string[] = [];
    let list: string[] = [];
    let quote: string[] = [];
    let code: string[] | null = null;

    const flushParagraph = (): void => {
      if (paragraph.length > 0) {
        blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
        paragraph = [];
      }
    };
    const flushList = (): void => {
      if (list.length > 0) {
        blocks.push({ kind: "list", items: list });
        list = [];
      }
    };
    const flushQuote = (): void => {
      if (quote.length > 0) {
        blocks.push({ kind: "quote", text: quote.join(" ") });
        quote = [];
      }
    };
    const flushLooseBlocks = (): void => {
      flushParagraph();
      flushList();
      flushQuote();
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (line.startsWith("```")) {
        if (code === null) {
          flushLooseBlocks();
          code = [];
        } else {
          blocks.push({ kind: "code", text: code.join("\n") });
          code = null;
        }
        continue;
      }

      if (code !== null) {
        code.push(rawLine);
        continue;
      }

      if (line.trim() === "") {
        flushLooseBlocks();
        continue;
      }

      const heading = /^(#{1,3})\s+(.+)$/.exec(line);

      if (heading !== null) {
        flushLooseBlocks();
        blocks.push({
          kind: "heading",
          level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
          text: heading[2]
        });
        continue;
      }

      const listItem = /^\s*[-*]\s+(.+)$/.exec(line);

      if (listItem !== null) {
        flushParagraph();
        flushQuote();
        list.push(listItem[1]);
        continue;
      }

      const quoteLine = /^\s*>\s?(.+)$/.exec(line);

      if (quoteLine !== null) {
        flushParagraph();
        flushList();
        quote.push(quoteLine[1]);
        continue;
      }

      flushList();
      flushQuote();
      paragraph.push(line.trim());
    }

    if (code !== null) {
      blocks.push({ kind: "code", text: code.join("\n") });
    }

    flushLooseBlocks();
    return blocks;
  }

  function objectPreview(object: MemoryObjectSummary): string {
    const titleText = normalizeText(object.title);
    const lines = object.body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, "")
          .replace(/^\s*[-*]\s+/, "")
          .replace(/^\s*>\s?/, "")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter((line) => line !== "" && line !== "```" && normalizeText(line) !== titleText);

    return lines.slice(0, 2).join(" ") || "No body text yet.";
  }

  function relatedFiles(object: MemoryObjectSummary): string[] {
    const evidenceFiles = object.evidence
      .filter((item) => item.kind === "file")
      .map((item) => item.id);
    return uniqueSorted([...(object.facets?.applies_to ?? []), ...evidenceFiles]).slice(0, 6);
  }

  function repoMatch(object: MemoryObjectSummary): string {
    const files = relatedFiles(object);
    if (files.length > 0) {
      return `${files.length} related file${files.length === 1 ? "" : "s"}`;
    }

    if (object.evidence.length > 0) {
      return `${object.evidence.length} evidence item${object.evidence.length === 1 ? "" : "s"}`;
    }

    return "No file evidence";
  }

  function confidenceForObject(object: MemoryObjectSummary): string {
    const linkedRelations = relations.filter((relation) => relation.from === object.id || relation.to === object.id);
    const confidence = linkedRelations.find((relation) => relation.confidence !== null)?.confidence;

    if (confidence !== undefined && confidence !== null) {
      return confidence;
    }

    if (object.evidence.length > 0 || relatedFiles(object).length > 0) {
      return "medium";
    }

    return "unknown";
  }

  function inspectCommand(object: MemoryObjectSummary): string {
    return `aictx inspect ${object.id}`;
  }

  function markdownForObject(object: MemoryObjectSummary): string {
    return [
      `## ${object.title}`,
      "",
      objectPreview(object),
      "",
      `- id: ${object.id}`,
      `- type: ${object.type}`,
      `- status: ${object.status}`,
      `- source: ${sourceLabel(object)}`,
      `- updated: ${object.updated_at}`,
      `- command: ${inspectCommand(object)}`,
      "",
      object.body
    ].join("\n");
  }

  function handbookMarkdown(): string {
    return [
      `# ${projectName()} Coding Handbook`,
      "",
      "Before an agent touches this repo, here are the things that will prevent costly mistakes.",
      "",
      "## Agent brief",
      "",
      agentBrief,
      "",
      ...sections.flatMap((section) => [
        `## ${section.title}`,
        "",
        ...(section.objects.length === 0
          ? ["No matching memory.", ""]
          : section.objects.flatMap((object) => [markdownForObject(object), ""]))
      ])
    ].join("\n");
  }

  function buildAgentBrief(
    ruleObjects: MemoryObjectSummary[],
    securityMemory: MemoryObjectSummary[],
    impactMemory: MemoryObjectSummary[]
  ): string {
    const rules = ruleObjects.slice(0, 2).map((object) => `- ${briefLine(object)}`);
    const workflows = objects
      .filter((object) => object.type === "workflow")
      .sort(compareMemoryPriority)
      .slice(0, 1)
      .map((object) => `- ${briefLine(object)}`);
    const security = securityMemory.slice(0, 1).map((object) => `- ${briefLine(object)}`);
    const gotchas = impactMemory
      .filter((object) => object.type === "gotcha" || object.type === "constraint")
      .slice(0, 1)
      .map((object) => `- ${briefLine(object)}`);

    return [
      "Before coding in this repo:",
      ...(rules.length > 0 ? rules : ["- Read the active constraints before editing."]),
      ...(workflows.length > 0 ? workflows : ["- Follow the package scripts for build, check, and test work."]),
      ...(security.length > 0 ? security : ["- Do not store secrets, credentials, or private tokens in memory."]),
      ...(gotchas.length > 0 ? gotchas : ["- Check schema, storage, and validation gotchas before changing types."]),
      "After meaningful work:",
      "- decide whether memory should change",
      "- save only durable project knowledge"
    ].join("\n");
  }

  function briefLine(object: MemoryObjectSummary): string {
    const preview = objectPreview(object);
    return `${object.title}: ${preview.length > 96 ? `${preview.slice(0, 93)}...` : preview}`;
  }

  function memorySearchText(object: MemoryObjectSummary): string {
    return normalizeText([
      object.id,
      object.title,
      object.type,
      object.status,
      object.tags.join(" "),
      object.facets?.category ?? "",
      object.facets?.applies_to?.join(" ") ?? "",
      object.evidence.map((item) => `${item.kind}:${item.id}`).join(" "),
      object.body
    ].join(" "));
  }

  function isHighImpact(object: MemoryObjectSummary, linkedIdsForImpact: Set<string>): boolean {
    return (
      isHardRule(object) ||
      isSecurityMemory(object) ||
      object.type === "workflow" ||
      object.status === "stale" ||
      object.status === "superseded" ||
      relatedFiles(object).length > 0 ||
      linkedIdsForImpact.has(object.id)
    );
  }

  function isHardRule(object: MemoryObjectSummary): boolean {
    const text = memorySearchText(object);
    return (
      object.type === "constraint" ||
      object.type === "gotcha" ||
      hasFacetCategory(object, "convention") ||
      includesAny(text, ["must", "never", "do not", "don't", "required", "constraint", "gotcha"])
    );
  }

  function isSecurityMemory(object: MemoryObjectSummary): boolean {
    return includesAny(memorySearchText(object), [
      "security",
      "secret",
      "token",
      "credential",
      "gdpr",
      "privacy",
      "auth",
      "oauth",
      "compliance"
    ]);
  }

  function isReviewMemory(object: MemoryObjectSummary, linkedIdsForReview: Set<string>): boolean {
    return (
      object.status === "stale" ||
      object.status === "superseded" ||
      object.status === "rejected" ||
      !linkedIdsForReview.has(object.id) ||
      object.evidence.length === 0 ||
      relatedFiles(object).length === 0 ||
      includesAny(memorySearchText(object), ["duplicate", "vague", "low-value", "review", "prune"])
    );
  }

  function hasFacetCategory(object: MemoryObjectSummary, category: string): boolean {
    return object.facets?.category === category;
  }

  function sourceLabel(object: MemoryObjectSummary): string {
    if (object.source === null) {
      return "unknown";
    }

    return object.source.task === undefined
      ? object.source.kind
      : `${object.source.kind}: ${object.source.task}`;
  }

  function linkedIds(relationList: MemoryRelationSummary[]): Set<string> {
    const ids = new Set<string>();

    for (const relation of relationList) {
      ids.add(relation.from);
      ids.add(relation.to);
    }

    return ids;
  }

  function directNeighborIds(id: string, relationList: MemoryRelationSummary[]): Set<string> {
    const ids = new Set<string>([id]);

    for (const relation of relationList) {
      if (relation.from === id) {
        ids.add(relation.to);
      }
      if (relation.to === id) {
        ids.add(relation.from);
      }
    }

    return ids;
  }

  function includesAny(text: string, needles: string[]): boolean {
    return needles.some((needle) => text.includes(needle));
  }

  function normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
  }

  function uniqueById(memoryObjects: MemoryObjectSummary[]): MemoryObjectSummary[] {
    return [...new Map(memoryObjects.map((object) => [object.id, object])).values()];
  }

  function compareMemoryPriority(left: MemoryObjectSummary, right: MemoryObjectSummary): number {
    return memoryPriority(right) - memoryPriority(left) || left.title.localeCompare(right.title);
  }

  function memoryPriority(object: MemoryObjectSummary): number {
    return (
      (object.type === "project" ? 60 : 0) +
      (object.type === "constraint" ? 50 : 0) +
      (object.type === "gotcha" ? 46 : 0) +
      (object.type === "workflow" ? 40 : 0) +
      (object.type === "architecture" ? 36 : 0) +
      (isSecurityMemory(object) ? 30 : 0) +
      (relatedFiles(object).length > 0 ? 18 : 0) +
      (object.status === "stale" || object.status === "superseded" ? 20 : 0)
    );
  }

  function compareRelations(left: MemoryRelationSummary, right: MemoryRelationSummary): number {
    return left.id.localeCompare(right.id);
  }

  function isStarterMemoryOnly(memoryObjects: readonly MemoryObjectSummary[]): boolean {
    if (memoryObjects.length !== 2) {
      return false;
    }

    const projectObject = memoryObjects.find(
      (object) => object.type === "project" && object.source?.kind === "system"
    );
    const architectureObject = memoryObjects.find(
      (object) => object.id === "architecture.current" && object.source?.kind === "system"
    );

    return (
      projectObject !== undefined &&
      architectureObject !== undefined &&
      /^# .+\n\nProject-level memory for .+\.$/.test(projectObject.body.replace(/\r\n?/g, "\n").trim()) &&
      architectureObject.body.replace(/\r\n?/g, "\n").trim() ===
        "# Current Architecture\n\nArchitecture memory starts here."
    );
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function cssEscape(value: string): string {
    return value.replace(/["\\]/g, "\\$&");
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function projectName(): string {
    return bootstrap?.project.name ?? "Aictx";
  }

  function formatCount(value: number | null): string {
    if (value === null) {
      return "Star";
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    }

    return String(value);
  }

  function downloadText(filename: string, contents: string): void {
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
</script>

<main class="handbook-shell" aria-labelledby="viewer-title">
  {#if loadState === "loading"}
    <section class="system-panel" aria-live="polite">
      <h1>Loading memory</h1>
      <p>Reading project memory from the local viewer API.</p>
    </section>
  {:else if loadState === "error"}
    <section class="system-panel error-panel" role="alert">
      <h1>Viewer failed to load</h1>
      <p>{errorMessage}</p>
    </section>
  {:else if bootstrap !== null}
    <aside class="left-sidebar" aria-label="Handbook navigation">
      <div class="sidebar-title">
        <span class="project-mark">📘</span>
        <div>
          <strong>Context Layer</strong>
          <span>{bootstrap.project.name} · {bootstrap.project.id}</span>
        </div>
      </div>

      <div class="legacy-test-controls" aria-hidden="true">
        <select bind:value={typeFilter} data-testid="viewer-type-filter" tabindex="-1">
          <option value="all">All types</option>
          {#each typeOptions as type (type)}
            <option value={type}>{type}</option>
          {/each}
        </select>
        <select bind:value={statusFilter} data-testid="viewer-status-filter" tabindex="-1">
          <option value="all">All statuses</option>
          {#each statusOptions as status (status)}
            <option value={status}>{status}</option>
          {/each}
        </select>
        <select bind:value={tagFilter} data-testid="viewer-tag-filter" tabindex="-1">
          <option value="all">All tags</option>
          {#each tagOptions as tag (tag)}
            <option value={tag}>{tag}</option>
          {/each}
        </select>
      </div>

      <label class="search-field">
        <span>SEARCH DOC</span>
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="oauth, schema, cron..."
          autocomplete="off"
          data-testid="viewer-search"
        />
      </label>

      <nav class="page-links" aria-label="Handbook sections">
        <span>PAGES</span>
        <a href="#start-here">Overview</a>
        <a href="#memory-graph">Context Table {bootstrap.counts.objects}</a>
        <a href="#do-not-do">Do Not Do</a>
        <a href="#coding-workflows">Coding Workflows</a>
        <a href="#architecture">Architecture</a>
        <a href="#security-notes">Security Notes</a>
        <a href="#commands">Commands</a>
        <a href="#source-memory">Source Memory</a>
      </nav>

      <section class="sidebar-export" aria-label="Export handbook">
        <span>EXPORT</span>
        <button type="button" onclick={() => exportMarkdown()}>Markdown</button>
        <button type="button" onclick={() => printHandbook()}>Print/PDF</button>
        <button type="button" onclick={() => exportStaticHtml()}>Static HTML</button>
        <form
          class="obsidian-export"
          aria-label="Obsidian export"
          onsubmit={(event) => {
            event.preventDefault();
            void exportObsidian();
          }}
        >
          <label>
            <span>Obsidian vault</span>
            <input
              type="text"
              bind:value={exportOutDir}
              placeholder=".aictx/exports/obsidian"
              autocomplete="off"
              disabled={exportState === "running"}
              data-testid="obsidian-export-out-dir"
            />
          </label>
          <button type="submit" disabled={exportState === "running"} data-testid="obsidian-export-submit">
            {exportState === "running" ? "Exporting" : "Export Obsidian"}
          </button>
          {#if exportState !== "idle"}
            <section
              class:export-status-error={exportState === "error"}
              class:export-status-success={exportState === "success"}
              class="export-status"
              role={exportState === "error" ? "alert" : "status"}
              aria-live="polite"
              data-testid="obsidian-export-status"
            >
              <p>{exportMessage}</p>
              {#if exportState === "error" && exportErrorCode !== ""}
                <p>{exportErrorCode}</p>
              {/if}
              {#if exportState === "success"}
                <dl>
                  <div>
                    <dt>Files written</dt>
                    <dd data-testid="obsidian-export-files-written">{exportFilesWritten}</dd>
                  </div>
                  <div>
                    <dt>Manifest</dt>
                    <dd data-testid="obsidian-export-manifest-path">{exportManifestPath}</dd>
                  </div>
                </dl>
              {/if}
            </section>
          {/if}
        </form>
      </section>

      {#if visibleWarnings.length > 0}
        <section class="warnings" aria-label="Storage warnings">
          {#each visibleWarnings as warning (warning)}
            <p>{warning}</p>
          {/each}
        </section>
      {/if}

      {#if hasStarterMemoryOnly}
        <section class="onboarding-callout" data-testid="starter-memory-notice">
          <strong>Starter memory only.</strong>
          <span>Seed useful repo memory, then refresh.</span>
          <code>aictx suggest --bootstrap --patch &gt; bootstrap-memory.json</code>
          <code>aictx save --file bootstrap-memory.json</code>
        </section>
      {/if}
    </aside>

    <section class="handbook-document">
      <header class="doc-header" id="start-here">
        <a class="github-star top-right" href={githubRepoUrl} target="_blank" rel="noreferrer" aria-label="Star Aictx on GitHub">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.78.4.08.55-.18.55-.4v-1.53c-2.23.5-2.7-.98-2.7-.98-.36-.95-.89-1.2-.89-1.2-.73-.51.06-.5.06-.5.81.06 1.24.85 1.24.85.72 1.26 1.88.9 2.34.69.07-.54.28-.9.51-1.11-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.83-2.2-.08-.2-.36-1.03.08-2.16 0 0 .68-.22 2.2.84A7.48 7.48 0 0 1 8 3.98c.68 0 1.36.09 1.99.27 1.52-1.06 2.2-.84 2.2-.84.44 1.13.16 1.96.08 2.16.52.58.83 1.31.83 2.2 0 3.14-1.87 3.82-3.65 4.03.29.26.54.76.54 1.54v2.24c0 .22.15.48.55.4A8.18 8.18 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
          </svg>
          <span>GitHub</span>
          <strong>★ {formatCount(githubStars)}</strong>
        </a>
        <span class="doc-icon">📘</span>
        <h1 id="viewer-title">Aictx Context Layer</h1>
        <p>
          Local memory that turns codebase context, history, and product decisions into usable
          guidance for AI coding agents.
        </p>
        <div class="header-actions" aria-label="Primary developer actions">
          <a class="primary-link" href={githubReadmeUrl} target="_blank" rel="noreferrer">Try CLI workflow</a>
          <button type="button" onclick={() => copyAgentBrief()}>
            {briefState === "copied" ? "Copied" : briefState === "error" ? "Copy failed" : "Copy agent prompt"}
          </button>
        </div>
        <section class="cli-workflow" aria-label="CLI workflow">
          <span>CLI workflow</span>
          <ol>
            <li>
              <code>aictx load "&lt;task&gt;"</code>
              <small>before edits</small>
            </li>
            <li>
              <code>aictx save --stdin</code>
              <small>after durable learning</small>
            </li>
            <li>
              <code>aictx diff</code>
              <small>review memory changes</small>
            </li>
          </ol>
        </section>
      </header>

      <section class="graph-panel" id="memory-graph" aria-label="Repo Context Table" data-testid="relation-graph">
        <div class="section-heading">
          <h2>Repo Context Table</h2>
          <p>Scan the decisions, rules, and gotchas that improve agent code quality before editing.</p>
        </div>

        <section class="context-filters" aria-label="Context filters">
          <div class="filter-row">
            <label class="filter-field filter-field-wide">
              <span>Task focus</span>
              <select value={taskFilter} onchange={handleTaskFilterChange} data-testid="context-task-filter">
                {#each taskOptions as option (option.id)}
                  <option value={option.id}>{option.label}</option>
                {/each}
              </select>
            </label>
          </div>
        </section>

        {#if directGraphEdgeCount === 0}
          <p class="empty-copy" data-testid="relation-graph-empty">No direct relations for this object.</p>
        {/if}

        {#if hiddenUnlinkedConcepts.length > 0}
          <p class="graph-note">
            {hiddenUnlinkedConcepts.length} unlinked concepts hidden from the table. They are still available in Source Memory.
          </p>
        {/if}

        {#if groupedGraphObjectCount > 0}
          <p class="graph-note">
            {groupedGraphObjectCount} related memories grouped in the table. Use Expand to inspect a grouped row.
          </p>
        {/if}

        {#if graphNodeList.length > 0}
          <div class="graph-table-wrap">
            <table class="graph-table" aria-label="Structured context items">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Type</th>
                  <th scope="col">Relationship</th>
                  <th scope="col">Links</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {#each graphNodeList as node (node.id)}
                  <tr class:selected-row={node.selected} data-testid={`graph-table-row-${node.id}`}>
                    <td>
                      <span class="graph-table-title">{node.title}</span>
                      {#if node.grouped}
                        <span class="graph-table-meta">{node.objectIds.length} memories</span>
                      {/if}
                    </td>
                    <td>{laneLabel(node.lane)}</td>
                    <td>{graphNodeRelationshipLabel(node, graphEdgeList)}</td>
                    <td>{graphNodeConnectionCount(node, graphEdgeList)}</td>
                    <td>
                      <button type="button" disabled={!node.grouped && node.selected} onclick={() => activateGraphNode(node)}>
                        {graphNodeActionLabel(node)}
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        {#if graphPreview !== null}
          <article class="node-preview">
            <span class="preview-icon">•</span>
            <div>
              <h3>{graphPreview.title}</h3>
              <p>{objectPreview(graphPreview)}</p>
            </div>
            <button type="button" onclick={() => openObjectToggle(graphPreview.id)}>Open memory</button>
          </article>
        {/if}

      </section>

      {#each sections as section (section.id)}
        <section class="memory-section" id={section.id} aria-labelledby={`${section.id}-title`}>
          <div class="section-heading">
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            <p>{section.objects.length} matching memories</p>
          </div>

          <div class="memory-toggles">
            {#each section.objects as object (object.id)}
              <details
                class="memory-toggle"
                data-memory-id={object.id}
                open={pendingOpenObjectId === object.id || selectedObjectId === object.id}
                data-testid={`object-row-${object.id}`}
              >
                <summary onclick={() => selectObject(object.id)}>
                  <span class="row-icon">{objectIcon(object)}</span>
                  <span class="summary-copy">
                    <strong>{object.title}</strong>
                    <small>{objectPreview(object)}</small>
                  </span>
                  <span class="summary-meta">
                    Open
                  </span>
                </summary>

                {#if object.tags.length > 0}
                  <ul class="tag-list" aria-label="Tags">
                    {#each object.tags as tag (tag)}
                      <li>{tag}</li>
                    {/each}
                  </ul>
                {/if}

                <section
                  class="markdown-view"
                  aria-label="Markdown body"
                >
                  {#each parseMarkdownBlocks(object.body) as block, index (`${object.id}-${block.kind}-${index}`)}
                    {#if block.kind === "heading"}
                      {#if block.level === 1}
                        <h3>{block.text}</h3>
                      {:else if block.level === 2}
                        <h4>{block.text}</h4>
                      {:else}
                        <h5>{block.text}</h5>
                      {/if}
                    {:else if block.kind === "list"}
                      <ul>
                        {#each block.items ?? [] as item, itemIndex (itemIndex)}
                          <li>{item}</li>
                        {/each}
                      </ul>
                    {:else if block.kind === "quote"}
                      <blockquote>{block.text}</blockquote>
                    {:else if block.kind === "code"}
                      <pre><code>{block.text}</code></pre>
                    {:else}
                      <p>{block.text}</p>
                    {/if}
                  {:else}
                    <p class="empty-copy">This memory object has an empty Markdown body.</p>
                  {/each}
                </section>

                <dl class="trust-grid">
                  <div>
                    <dt>source</dt>
                    <dd>{sourceLabel(object)}</dd>
                  </div>
                  <div>
                    <dt>last updated</dt>
                    <dd>{object.updated_at}</dd>
                  </div>
                  <div>
                    <dt>confidence</dt>
                    <dd>{confidenceForObject(object)}</dd>
                  </div>
                  <div>
                    <dt>repo match</dt>
                    <dd>{repoMatch(object)}</dd>
                  </div>
                  <div>
                    <dt>related files</dt>
                    <dd>{relatedFiles(object).join(", ") || "none"}</dd>
                  </div>
                  <div>
                    <dt>command</dt>
                    <dd><code>{inspectCommand(object)}</code></dd>
                  </div>
                </dl>

                <details class="json-disclosure">
                  <summary>Sidecar JSON</summary>
                  <section class="json-view" aria-label="Object sidecar JSON">
                    <pre>{JSON.stringify(sidecarJsonForObject(object), null, 2)}</pre>
                  </section>
                </details>
              </details>
            {:else}
              <p class="empty-copy">No matching memory in this section.</p>
            {/each}
          </div>
        </section>
      {/each}

      <section class="relations-panel" aria-label="Selected memory details" data-testid="selected-object">
        {#if selectedObject !== null}
          <div class="section-heading">
            <h2>Selected Memory</h2>
            <p>{selectedObject.title} · {selectedObject.id}</p>
          </div>

          <div class="tab-list" role="tablist" aria-label="Selected object views">
            <button
              type="button"
              role="tab"
              aria-selected={!showSelectedJson}
              onclick={() => {
                showSelectedJson = false;
              }}
              data-testid="markdown-tab"
            >
              Markdown
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showSelectedJson}
              onclick={() => {
                showSelectedJson = true;
              }}
              data-testid="json-tab"
            >
              JSON
            </button>
          </div>

          {#if showSelectedJson}
            <section class="json-view selected-json-view" aria-label="Object sidecar JSON" data-testid="json-view">
              <pre>{JSON.stringify(sidecarJsonForObject(selectedObject), null, 2)}</pre>
            </section>
          {:else}
            <section class="markdown-view selected-markdown-view" aria-label="Markdown body" data-testid="markdown-view">
              {#each parseMarkdownBlocks(selectedObject.body) as block, index (`selected-${block.kind}-${index}`)}
                {#if block.kind === "heading"}
                  {#if block.level === 1}
                    <h3>{block.text}</h3>
                  {:else if block.level === 2}
                    <h4>{block.text}</h4>
                  {:else}
                    <h5>{block.text}</h5>
                  {/if}
                {:else if block.kind === "list"}
                  <ul>
                    {#each block.items ?? [] as item, itemIndex (itemIndex)}
                      <li>{item}</li>
                    {/each}
                  </ul>
                {:else if block.kind === "quote"}
                  <blockquote>{block.text}</blockquote>
                {:else if block.kind === "code"}
                  <pre><code>{block.text}</code></pre>
                {:else}
                  <p>{block.text}</p>
                {/if}
              {:else}
                <p class="empty-copy">This memory object has an empty Markdown body.</p>
              {/each}
            </section>
          {/if}

          <div class="relation-columns">
            <section>
              <h3>Outgoing</h3>
              {#if outgoingRelations.length === 0}
                <p class="empty-copy">No outgoing relations.</p>
              {:else}
                <ul class="relation-list" data-testid="outgoing-relations">
                  {#each outgoingRelations as relation (relation.id)}
                    <li>
                      <span>{relation.predicate}</span>
                      <button type="button" onclick={() => openObjectToggle(relation.to)}>
                        to {relationTargetLabel(relation, selectedObject.id)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
            <section>
              <h3>Incoming</h3>
              {#if incomingRelations.length === 0}
                <p class="empty-copy">No incoming relations.</p>
              {:else}
                <ul class="relation-list" data-testid="incoming-relations">
                  {#each incomingRelations as relation (relation.id)}
                    <li>
                      <span>{relation.predicate}</span>
                      <button type="button" onclick={() => openObjectToggle(relation.from)}>
                        from {relationTargetLabel(relation, selectedObject.id)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
          </div>
        {/if}
      </section>
    </section>
  {/if}
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: #242424;
    background: #fbfaf8;
    font-size: 14px;
    font-family:
      Inter, "Avenir Next", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      sans-serif;
  }

  button,
  input {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
  }

  .handbook-shell {
    display: grid;
    grid-template-columns: 286px minmax(0, 1fr);
    min-height: 100vh;
  }

  .left-sidebar {
    position: sticky;
    top: 0;
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100vh;
    padding: 22px 18px;
    overflow: auto;
    color: #4b4b4b;
    background: #f7f5ef;
    border-right: 1px solid #dfddd6;
  }

  .sidebar-title {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding-bottom: 22px;
    border-bottom: 1px solid #e5e1d9;
  }

  .project-mark,
  .doc-icon {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    color: #222;
    background: transparent;
    border-radius: 7px;
    font-size: 18px;
    font-weight: 800;
  }

  .sidebar-title strong,
  .sidebar-title span {
    display: block;
  }

  .sidebar-title strong {
    color: #222;
    font-size: 19px;
    font-weight: 760;
    line-height: 1.15;
  }

  .sidebar-title span {
    margin-top: 20px;
    color: #6f6f73;
    font-size: 15px;
    line-height: 1.25;
  }

  .trust-grid dt,
  .export-status dt {
    color: #777;
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .trust-grid dd,
  .export-status dd {
    margin: 0 0 4px;
  }

  .search-field {
    display: grid;
    gap: 8px;
    color: #9a9a9f;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .search-field input {
    width: 100%;
    min-width: 0;
    padding: 9px 11px;
    color: #242424;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 7px;
    box-shadow: 0 1px 2px rgba(20, 20, 20, 0.03) inset;
    font-weight: 500;
    text-transform: none;
  }

  .page-links {
    display: grid;
    gap: 7px;
  }

  .page-links > span {
    margin-bottom: 4px;
    color: #9a9a9f;
    font-size: 11px;
    font-weight: 800;
  }

  .legacy-test-controls {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .page-links a {
    padding: 1px 8px;
    color: #6d6d72;
    font-size: 14px;
    line-height: 1.45;
    text-decoration: none;
    border-radius: 6px;
  }

  .page-links a:hover {
    color: #222;
    background: #ece8df;
  }

  .sidebar-export {
    display: grid;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid #e5e1d9;
  }

  .sidebar-export button,
  .obsidian-export button {
    min-height: 31px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    color: #4f4f54;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 7px;
    font-size: 13px;
    text-decoration: none;
  }

  .sidebar-export > button {
    justify-content: flex-start;
  }

  .warnings,
  .onboarding-callout {
    display: grid;
    gap: 8px;
    padding: 10px;
    background: #fff8e8;
    border: 1px solid #ead7a8;
    border-radius: 7px;
    font-size: 12px;
  }

  .warnings p {
    margin: 0;
  }

  code,
  pre {
    color: #2c2722;
    background: #f3efe6;
    border: 1px solid #ddd4c5;
    border-radius: 6px;
  }

  code {
    padding: 1px 4px;
  }

  pre {
    margin: 0;
    padding: 12px;
    overflow: auto;
    white-space: pre-wrap;
  }

  .handbook-document {
    display: flex;
    flex-direction: column;
    width: min(1080px, calc(100vw - 286px));
    margin: 0 auto;
    padding: 46px 42px 76px;
  }

  .doc-header {
    order: 0;
    position: relative;
    max-width: 920px;
    margin-bottom: 18px;
  }

  .doc-header h1 {
    max-width: 780px;
    margin: 14px 0 8px;
    color: #202124;
    font-size: clamp(32px, 3.9vw, 46px);
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: 0;
  }

  .doc-header .doc-icon {
    width: 36px;
    height: 36px;
    background: #fff;
    border: 1px solid #ece8df;
    box-shadow: none;
    font-size: 17px;
  }

  .doc-header p,
  .section-heading p,
  .node-preview p,
  .empty-copy {
    color: #74747a;
  }

  .doc-header p {
    max-width: 820px;
    margin: 0;
    font-size: 16px;
    line-height: 1.55;
  }

  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .primary-link,
  .header-actions button {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    padding: 7px 12px;
    color: #242424;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 7px;
    font-size: 14px;
    font-weight: 650;
    text-decoration: none;
  }

  .primary-link {
    color: #fff;
    background: #202124;
    border-color: #202124;
  }

  .cli-workflow {
    display: grid;
    gap: 8px;
    margin-top: 16px;
    padding: 10px 0;
    border-top: 1px solid #e6e2da;
    border-bottom: 1px solid #e6e2da;
  }

  .cli-workflow > span,
  .sidebar-export > span {
    color: #76767c;
    font-size: 12px;
    font-weight: 760;
  }

  .cli-workflow ol {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cli-workflow li {
    display: inline-grid;
    gap: 3px;
    padding: 7px 9px;
    background: #faf9f5;
    border: 1px solid #e5e0d7;
    border-radius: 7px;
  }

  .cli-workflow code {
    color: #2d2924;
    background: transparent;
    border: 0;
    font-size: 12px;
    white-space: nowrap;
  }

  .cli-workflow small {
    color: #76767c;
    font-size: 11px;
  }

  .eyebrow {
    margin: 0 0 4px;
    color: #756e64;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .graph-panel,
  .memory-section,
  .relations-panel,
  .system-panel {
    margin: 14px 0;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 8px;
  }

  .graph-panel {
    order: 2;
  }

  .memory-section,
  .relations-panel {
    order: 3;
  }

  .obsidian-export {
    display: grid;
    gap: 7px;
    margin: 2px 0 0;
    padding: 10px 0 0;
    background: transparent;
    border: 0;
    border-top: 1px solid #e5e1d9;
    border-radius: 0;
    box-shadow: none;
  }

  .obsidian-export label {
    display: grid;
    gap: 6px;
    color: #727276;
    font-size: 12px;
    font-weight: 650;
    text-transform: none;
  }

  .obsidian-export input {
    width: 100%;
    min-width: 0;
    min-height: 31px;
    padding: 6px 10px;
    color: #242424;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 7px;
    box-shadow: none;
    font: inherit;
    font-size: 13px;
  }

  .obsidian-export input::placeholder {
    color: #8d8d92;
  }

  .section-heading {
    margin-bottom: 12px;
  }

  .section-heading h2 {
    margin: 0 0 4px;
    color: #222;
    font-size: 25px;
    line-height: 1.2;
    letter-spacing: 0;
  }

  .section-heading p {
    margin: 0;
  }

  .relation-list button {
    padding: 0;
    color: #275f55;
    text-align: left;
    background: none;
    border: 0;
  }

  .context-filters {
    display: grid;
    gap: 10px;
    margin: 16px 0 14px;
    padding: 12px;
    background: #faf9f5;
    border: 1px solid #dedbd4;
    border-radius: 8px;
  }

  .filter-row {
    display: grid;
    grid-template-columns: minmax(240px, 420px);
    gap: 10px;
    align-items: end;
  }

  .filter-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .filter-field span {
    color: #6d6d73;
    font-size: 12px;
    font-weight: 760;
  }

  .filter-field select {
    width: 100%;
    min-height: 36px;
    min-width: 0;
    padding: 7px 32px 7px 10px;
    color: #262626;
    background: #fff;
    border: 1px solid #d8d4cc;
    border-radius: 7px;
    font: inherit;
    font-size: 14px;
  }

  .node-preview button {
    min-height: 31px;
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    color: #727276;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 7px;
    font-size: 14px;
    text-decoration: none;
  }

  .obsidian-export button {
    color: #4d4638;
    background: #fbfaf6;
    border-color: #d9d0c1;
    font-weight: 650;
  }

  .github-star.top-right {
    position: absolute;
    top: 2px;
    right: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 6px 10px;
    color: #202124;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 999px;
    box-shadow: 0 8px 18px rgba(31, 31, 31, 0.05);
    font-size: 13px;
    text-decoration: none;
  }

  .github-star.top-right svg {
    width: 15px;
    height: 15px;
    fill: currentColor;
  }

  .github-star.top-right strong {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding-left: 6px;
    border-left: 1px solid #e3dfd8;
    color: #202124;
    font-weight: 760;
  }

  .github-star.top-right:hover {
    color: #fff;
    background: #202124;
    border-color: #202124;
  }

  .github-star.top-right:hover strong {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.28);
  }

  .primary-link:hover,
  .header-actions button:hover,
  .sidebar-export button:hover,
  .node-preview button:hover,
  .obsidian-export button:hover {
    color: #222;
    background: #f3f2ee;
    border-color: #d4d1c9;
  }

  .obsidian-export button:hover {
    color: #242424;
    background: #f4f0e8;
    border-color: #cfc5b5;
  }

  .graph-note {
    margin: 10px 0 0;
    color: #6b645a;
    font-size: 13px;
  }

  .graph-table-wrap {
    overflow-x: auto;
    margin: 10px 0 0;
    border: 1px solid #dedbd4;
    border-radius: 8px;
  }

  .graph-table {
    width: 100%;
    min-width: 520px;
    border-collapse: collapse;
    background: #fff;
    font-size: 13px;
  }

  .graph-table th,
  .graph-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #ece8df;
    text-align: left;
    vertical-align: middle;
  }

  .graph-table th {
    color: #6f6f74;
    background: #faf9f5;
    font-size: 12px;
    font-weight: 760;
  }

  .graph-table tr:last-child td {
    border-bottom: 0;
  }

  .graph-table tr.selected-row td {
    background: #f4f8f9;
  }

  .graph-table-title {
    display: block;
    color: #242424;
    font-weight: 720;
  }

  .graph-table-meta {
    display: block;
    margin-top: 2px;
    color: #77777d;
    font-size: 12px;
  }

  .graph-table button {
    min-height: 28px;
    padding: 4px 9px;
    color: #242424;
    background: #fff;
    border: 1px solid #dedbd4;
    border-radius: 7px;
    font: inherit;
  }

  .graph-table button:disabled {
    color: #8b8b91;
    background: #f4f2ed;
  }

  .node-preview {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) max-content;
    align-items: start;
    gap: 12px;
    margin-top: 0;
    padding: 13px 14px;
    background: #fff;
    border: 1px solid #dedbd4;
    border-top: 0;
    border-radius: 0 0 8px 8px;
  }

  .preview-icon,
  .row-icon {
    display: inline-grid;
    place-items: center;
    width: 25px;
    height: 25px;
    color: #2a7890;
    background: #f3f2ef;
    border-radius: 7px;
    font-weight: 800;
  }

  .node-preview h3,
  .node-preview p {
    margin: 0;
  }

  .node-preview h3 {
    font-size: 15px;
    line-height: 1.25;
  }

  .node-preview p {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.45;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
  }

  .node-preview button {
    padding: 0;
    color: #8a8a8f;
    background: transparent;
    border: 0;
    border-radius: 0;
    text-decoration: underline;
    white-space: nowrap;
  }

  .memory-toggles {
    display: grid;
    gap: 10px;
  }

  .memory-toggle {
    background: #fff;
    border: 1px solid #e0ddd6;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(24, 24, 24, 0.03);
  }

  .memory-toggle summary {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) max-content;
    gap: 12px;
    align-items: start;
    padding: 12px 14px;
    cursor: pointer;
    list-style: none;
  }

  .memory-toggle summary::-webkit-details-marker {
    display: none;
  }

  .memory-toggle summary strong,
  .memory-toggle summary small {
    display: block;
  }

  .memory-toggle summary strong {
    color: #242424;
    font-size: 15px;
    line-height: 1.2;
  }

  .memory-toggle summary small {
    margin-top: 3px;
    color: #74747a;
    font-size: 13px;
    line-height: 1.45;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
  }

  .summary-meta {
    color: #8c8c91;
    font-size: 13px;
    line-height: 1.25;
    white-space: nowrap;
  }

  .tag-list li {
    padding: 2px 6px;
    color: #5a554d;
    background: #f2eee7;
    border: 1px solid #ded7ca;
    border-radius: 999px;
    font-size: 11px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0 56px 12px;
    list-style: none;
  }

  .markdown-view {
    padding: 0 56px 16px;
    color: #312d28;
    font-size: 14px;
    line-height: 1.58;
  }

  .markdown-view h3,
  .markdown-view h4,
  .markdown-view h5 {
    margin: 14px 0 6px;
  }

  .markdown-view p,
  .markdown-view ul,
  .markdown-view blockquote {
    margin: 8px 0;
  }

  .markdown-view blockquote {
    padding-left: 10px;
    color: #625b52;
    border-left: 3px solid #d9d1c4;
  }

  .trust-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;
    margin: 0;
    padding: 0 56px 16px;
    border-top: 1px solid #ebe5dc;
  }

  .export-status dl {
    display: grid;
    gap: 6px;
    margin: 6px 0 0;
    padding: 0;
    border-top: 1px solid #e6ded1;
  }

  .export-status dl div {
    display: grid;
    gap: 2px;
    padding-top: 6px;
  }

  .trust-grid div {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #ebe5dc;
  }

  .trust-grid dd {
    overflow-wrap: anywhere;
    color: #6f6f75;
    font-size: 13px;
  }

  .json-disclosure {
    margin: 0 56px 16px;
  }

  .json-disclosure summary {
    padding: 8px 0;
    color: #655e55;
    cursor: pointer;
  }

  .json-view pre {
    max-height: 360px;
  }

  .relation-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .tab-list {
    display: flex;
    gap: 8px;
    margin: 0 0 14px;
  }

  .tab-list button {
    padding: 6px 10px;
    color: #3d3933;
    background: #f5f1e8;
    border: 1px solid #d8d0c3;
    border-radius: 7px;
  }

  .tab-list button[aria-selected="true"] {
    background: #e7f0ed;
    border-color: #9ab9b0;
  }

  .selected-json-view {
    margin-bottom: 14px;
  }

  .selected-markdown-view {
    margin-bottom: 14px;
    padding: 12px;
    background: #fbfaf6;
    border: 1px solid #e2dcd1;
    border-radius: 7px;
  }

  .relation-columns h3 {
    margin: 0 0 8px;
    font-size: 15px;
  }

  .relation-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .relation-list li {
    display: grid;
    gap: 4px;
    padding: 9px;
    background: #fbfaf6;
    border: 1px solid #e2dcd1;
    border-radius: 7px;
  }

  .relation-list span {
    color: #746d63;
    font-size: 12px;
  }

  .export-status {
    flex-basis: 100%;
    padding: 8px 10px;
    background: #f7f4ed;
    border: 1px solid #ded7ca;
    border-radius: 7px;
    font-size: 12px;
  }

  .export-status p {
    margin: 0 0 6px;
  }

  .export-status-success {
    background: #eef7f2;
    border-color: #b7d4c4;
  }

  .export-status-error,
  .error-panel {
    background: #fff1ee;
    border-color: #e5b5aa;
  }

  .system-panel {
    width: min(680px, calc(100vw - 32px));
    margin: 48px auto;
  }

  .empty-copy {
    margin: 8px 0;
  }

  @media (max-width: 860px) {
    .handbook-shell {
      grid-template-columns: 1fr;
    }

    .left-sidebar {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid #ded9cf;
    }

    .handbook-document {
      width: 100%;
      padding: 28px 18px 56px;
    }

    .brief-grid,
    .filter-row,
    .relation-columns,
    .trust-grid {
      grid-template-columns: 1fr;
    }

    .node-preview,
    .memory-toggle summary {
      grid-template-columns: 1fr;
      display: grid;
    }

    .tag-list {
      grid-column: auto;
    }

    .object-list {
      grid-template-columns: 1fr;
    }

  }
</style>
