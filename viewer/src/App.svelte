<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";

  type ObjectStatus = "active" | "stale" | "superseded" | "open" | "closed";
  type ObjectType =
    | "project"
    | "architecture"
    | "source"
    | "synthesis"
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
  type RoleCoverageStatus = "populated" | "thin" | "missing" | "stale" | "conflicted";
  type MemoryLensName =
    | "project-map"
    | "current-work"
    | "review-risk"
    | "provenance"
    | "maintenance";
  type Predicate =
    | "affects"
    | "requires"
    | "depends_on"
    | "supersedes"
    | "conflicts_with"
    | "derived_from"
    | "summarizes"
    | "documents"
    | "mentions"
    | "implements"
    | "related_to";

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

  interface Evidence {
    kind: "memory" | "relation" | "file" | "commit" | "task" | "source";
    id: string;
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
    evidence: Evidence[];
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
    evidence: Evidence[];
    content_hash: string | null;
    created_at: string;
    updated_at: string;
    json_path: string;
  }

  interface RoleCoverageItem {
    key: string;
    label: string;
    description: string;
    status: RoleCoverageStatus;
    optional: boolean;
    memory_ids: string[];
    relation_ids: string[];
    gap: string | null;
  }

  interface RoleCoverageData {
    roles: RoleCoverageItem[];
    counts: Record<RoleCoverageStatus, number>;
  }

  interface MemoryLensData {
    name: MemoryLensName;
    title: string;
    markdown: string;
    role_coverage: RoleCoverageData;
    included_memory_ids: string[];
    relation_ids: string[];
    relations: MemoryRelationSummary[];
    generated_gaps: string[];
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
      source_objects: number;
      synthesis_objects: number;
      active_relations: number;
    };
    role_coverage: RoleCoverageData;
    lenses: MemoryLensData[];
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
  type ViewerScreen = "projects" | "memories" | "detail" | "lenses" | "export";
  type ExportState = "idle" | "running" | "success" | "error";
  type LayerFilter = "all" | "memories" | "syntheses" | "sources" | "inactive";

  interface MarkdownBlock {
    kind: "heading" | "paragraph" | "list" | "quote" | "code";
    text?: string;
    level?: 1 | 2 | 3;
    items?: string[];
  }

  type GraphNodeRole = "selected" | "incoming" | "outgoing" | "both";

  interface GraphNode {
    id: string;
    title: string;
    subtitle: string;
    missing: boolean;
    role: GraphNodeRole;
    x: number;
    y: number;
  }

  interface GraphEdge {
    relation: MemoryRelationSummary;
    fromId: string;
    toId: string;
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
  let layerFilter = $state<LayerFilter>("all");
  let typeFilter = $state("all");
  let statusFilter = $state("all");
  let tagFilter = $state("all");
  let selectedObjectId = $state<string | null>(null);
  let selectedLensName = $state<MemoryLensName>("project-map");
  let exportOutDir = $state("");
  let exportState = $state<ExportState>("idle");
  let exportMessage = $state("");
  let exportErrorCode = $state("");
  let exportFilesWritten = $state(0);
  let exportManifestPath = $state("");

  const allOption = "all";
  const layerOptions: Array<{ value: LayerFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "memories", label: "Memories" },
    { value: "syntheses", label: "Syntheses" },
    { value: "sources", label: "Sources" },
    { value: "inactive", label: "Stale / Superseded" }
  ];
  const graphWidth = 960;
  const graphHeight = 420;
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const projects = $derived(projectsData?.projects ?? []);
  const selectedProject = $derived.by(() =>
    selectedProjectId === null
      ? null
      : projects.find((project) => project.registry_id === selectedProjectId) ?? null
  );
  const objects = $derived(bootstrap?.objects ?? []);
  const relations = $derived(bootstrap?.relations ?? []);
  const lenses = $derived(bootstrap?.lenses ?? []);
  const selectedLens = $derived.by(() =>
    lenses.find((lens) => lens.name === selectedLensName) ?? lenses[0] ?? null
  );
  const selectedLensBlocks = $derived(
    selectedLens === null ? [] : parseMarkdownBlocks(selectedLens.markdown)
  );
  const objectById = $derived(new Map(objects.map((object) => [object.id, object])));
  const typeOptions = $derived(uniqueSorted(objects.map((object) => object.type)));
  const statusOptions = $derived(uniqueSorted(objects.map((object) => object.status)));
  const tagOptions = $derived(uniqueSorted(objects.flatMap((object) => object.tags)));
  const filteredObjects = $derived.by(() =>
    objects.filter((object) => objectMatchesFilters(object))
  );
  const selectedObject = $derived.by(() =>
    selectedObjectId === null ? null : objectById.get(selectedObjectId) ?? null
  );
  const selectedJson = $derived(
    selectedObject === null ? "" : JSON.stringify(sidecarJsonForObject(selectedObject), null, 2)
  );
  const markdownBlocks = $derived(
    selectedObject === null ? [] : parseMarkdownBlocks(selectedObject.body)
  );
  const directRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : relations
          .filter((relation) => relation.from === selectedObject.id || relation.to === selectedObject.id)
          .sort(compareRelations)
  );
  const incomingRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : directRelations.filter((relation) => relation.to === selectedObject.id)
  );
  const outgoingRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : directRelations.filter((relation) => relation.from === selectedObject.id)
  );
  const provenanceEvidence = $derived.by(() =>
    selectedObject === null
      ? []
      : selectedObject.evidence.filter((evidence) =>
          ["source", "file", "commit", "memory"].includes(evidence.kind)
        )
  );
  const provenanceRelations = $derived.by(() =>
    directRelations.filter((relation) =>
      ["derived_from", "summarizes", "documents"].includes(relation.predicate)
    )
  );
  const graphNodes = $derived.by(() =>
    selectedObject === null ? [] : buildGraphNodes(selectedObject, directRelations, objectById)
  );
  const graphEdges = $derived.by(() =>
    directRelations.map((relation) => ({
      relation,
      fromId: relation.from,
      toId: relation.to
    }))
  );
  const graphNodeById = $derived(new Map(graphNodes.map((node) => [node.id, node])));
  const visibleWarnings = $derived(uniqueSorted([
    ...(bootstrap?.storage_warnings ?? []),
    ...(selectedProject?.warnings ?? []),
    ...warnings
  ]));
  const hasStarterMemoryOnly = $derived.by(() => isStarterMemoryOnly(objects));

  onMount(() => {
    void loadProjects();
  });

  async function loadProjects(): Promise<void> {
    if (token === "") {
      loadState = "error";
      errorMessage = "Viewer API token is missing from the local URL.";
      return;
    }

    try {
      const response = await fetch(`/api/projects?token=${encodeURIComponent(token)}`, {
        headers: {
          accept: "application/json"
        }
      });
      const envelope = (await response.json()) as ViewerProjectsEnvelope;

      warnings = envelope.warnings ?? [];

      if (!response.ok || !envelope.ok) {
        loadState = "error";
        errorMessage = envelope.ok
          ? `Viewer API request failed with HTTP ${response.status}.`
          : `${envelope.error.code}: ${envelope.error.message}`;
        return;
      }

      projectsData = envelope.data;
      loadState = "ready";
    } catch (error) {
      loadState = "error";
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function loadBootstrap(registryId: string): Promise<void> {
    if (token === "") {
      projectLoadState = "error";
      projectErrorMessage = "Viewer API token is missing from the local URL.";
      return;
    }

    projectLoadState = "loading";
    projectErrorMessage = "";
    bootstrap = null;

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(registryId)}/bootstrap?token=${encodeURIComponent(token)}`, {
        headers: {
          accept: "application/json"
        }
      });
      const envelope = (await response.json()) as ViewerEnvelope;

      warnings = envelope.warnings ?? [];

      if (!response.ok || !envelope.ok) {
        projectLoadState = "error";
        projectErrorMessage = envelope.ok
          ? `Viewer API request failed with HTTP ${response.status}.`
          : `${envelope.error.code}: ${envelope.error.message}`;
        return;
      }

      bootstrap = envelope.data;
      projectLoadState = "ready";
    } catch (error) {
      projectLoadState = "error";
      projectErrorMessage = error instanceof Error ? error.message : String(error);
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
    exportMessage = "Exporting Obsidian projection.";
    exportErrorCode = "";
    exportFilesWritten = 0;
    exportManifestPath = "";

    const trimmedOutDir = exportOutDir.trim();
    const requestBody = trimmedOutDir === "" ? {} : { outDir: trimmedOutDir };

    try {
      if (selectedProjectId === null) {
        exportState = "error";
        exportErrorCode = "AICtxValidationFailed";
        exportMessage = "Select a project before exporting.";
        return;
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/export/obsidian?token=${encodeURIComponent(token)}`, {
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
      exportMessage = "Export complete.";
      exportFilesWritten = envelope.data.files_written.length;
      exportManifestPath = envelope.data.manifest_path;
    } catch (error) {
      exportState = "error";
      exportErrorCode = "AICtxInternalError";
      exportMessage = error instanceof Error ? error.message : String(error);
    }
  }

  function objectMatchesFilters(object: MemoryObjectSummary): boolean {
    return (
      objectMatchesLayer(object, layerFilter) &&
      optionMatches(typeFilter, object.type) &&
      optionMatches(statusFilter, object.status) &&
      (tagFilter === allOption || object.tags.includes(tagFilter)) &&
      objectMatchesSearch(object, searchQuery)
    );
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
      object.evidence.map((evidence) => `${evidence.kind} ${evidence.id}`).join(" "),
      object.body
    ].join(" ")).includes(query);
  }

  function optionMatches(filter: string, value: string): boolean {
    return filter === allOption || filter === value;
  }

  function objectMatchesLayer(object: MemoryObjectSummary, filter: LayerFilter): boolean {
    switch (filter) {
      case "all":
        return true;
      case "memories":
        return object.type !== "source" && object.type !== "synthesis" && isCurrentStatus(object.status);
      case "syntheses":
        return object.type === "synthesis";
      case "sources":
        return object.type === "source";
      case "inactive":
        return object.status === "stale" || object.status === "superseded";
    }
  }

  function isCurrentStatus(status: ObjectStatus): boolean {
    return status === "active" || status === "open";
  }

  function normalizeText(value: string): string {
    return value.trim().toLowerCase();
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
      isInitialProjectBody(projectObject.body) &&
      normalizeBody(architectureObject.body) ===
        "# Current Architecture\n\nArchitecture memory starts here."
    );
  }

  function isInitialProjectBody(body: string): boolean {
    return /^# .+\n\nProject-level memory for .+\.$/.test(normalizeBody(body));
  }

  function normalizeBody(body: string): string {
    return body.replace(/\r\n?/g, "\n").trim();
  }

  function selectObject(id: string): void {
    selectedObjectId = id;
    currentScreen = "detail";
  }

  function selectProject(registryId: string): void {
    selectedProjectId = registryId;
    selectedObjectId = null;
    searchQuery = "";
    layerFilter = "all";
    typeFilter = allOption;
    statusFilter = allOption;
    tagFilter = allOption;
    selectedLensName = "project-map";
    exportState = "idle";
    exportMessage = "";
    currentScreen = "memories";
    void loadBootstrap(registryId);
  }

  function openRelatedObject(id: string): void {
    selectObject(id);
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

  function showLenses(): void {
    if (selectedProjectId === null) {
      currentScreen = "projects";
      return;
    }

    currentScreen = "lenses";
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

  function buildGraphNodes(
    selected: MemoryObjectSummary,
    relationList: MemoryRelationSummary[],
    objectLookup: Map<string, MemoryObjectSummary>
  ): GraphNode[] {
    const incomingIds: string[] = [];
    const outgoingIds: string[] = [];

    for (const relation of relationList) {
      if (
        relation.to === selected.id &&
        relation.from !== selected.id &&
        !incomingIds.includes(relation.from)
      ) {
        incomingIds.push(relation.from);
      }

      if (
        relation.from === selected.id &&
        relation.to !== selected.id &&
        !outgoingIds.includes(relation.to)
      ) {
        outgoingIds.push(relation.to);
      }
    }

    const bothIds = incomingIds
      .filter((id) => outgoingIds.includes(id))
      .sort((left, right) => left.localeCompare(right));
    const incomingOnlyIds = incomingIds
      .filter((id) => !outgoingIds.includes(id))
      .sort((left, right) => left.localeCompare(right));
    const outgoingOnlyIds = outgoingIds
      .filter((id) => !incomingIds.includes(id))
      .sort((left, right) => left.localeCompare(right));
    const nodes: GraphNode[] = [
      graphNodeForObject(selected, "selected", graphWidth / 2, graphHeight / 2)
    ];

    nodes.push(
      ...graphNeighborNodes(incomingOnlyIds, "incoming", 180, objectLookup),
      ...graphNeighborNodes(outgoingOnlyIds, "outgoing", 780, objectLookup),
      ...graphBidirectionalNodes(bothIds, objectLookup)
    );

    return nodes;
  }

  function graphNeighborNodes(
    ids: string[],
    role: Exclude<GraphNodeRole, "selected">,
    x: number,
    objectLookup: Map<string, MemoryObjectSummary>
  ): GraphNode[] {
    return graphYPositions(ids.length, role).map((y, index) =>
      graphNodeForId(ids[index], role, x, y, objectLookup)
    );
  }

  function graphBidirectionalNodes(
    ids: string[],
    objectLookup: Map<string, MemoryObjectSummary>
  ): GraphNode[] {
    return ids.map((id, index) => {
      const position = graphBidirectionalPosition(ids.length, index);

      return graphNodeForId(id, "both", position.x, position.y, objectLookup);
    });
  }

  function graphBidirectionalPosition(count: number, index: number): { x: number; y: number } {
    const columns = Math.min(count, 3);
    const row = Math.floor(index / 3);
    const column = index % 3;
    const xStart = graphWidth / 2 - 170;
    const xStep = columns === 1 ? 0 : 340 / (columns - 1);

    return {
      x: columns === 1 ? graphWidth / 2 : xStart + xStep * column,
      y: row % 2 === 0 ? 76 : 344
    };
  }

  function graphYPositions(count: number, role: Exclude<GraphNodeRole, "selected">): number[] {
    if (count <= 0) {
      return [];
    }

    if (role === "both") {
      return count === 1
        ? [76]
        : Array.from({ length: count }, (_, index) => 76 + (268 / (count - 1)) * index);
    }

    if (count === 1) {
      return [graphHeight / 2];
    }

    return Array.from({ length: count }, (_, index) => 88 + (244 / (count - 1)) * index);
  }

  function graphNodeForId(
    id: string,
    role: GraphNodeRole,
    x: number,
    y: number,
    objectLookup: Map<string, MemoryObjectSummary>
  ): GraphNode {
    const object = objectLookup.get(id);

    if (object === undefined) {
      return {
        id,
        title: id,
        subtitle: "Missing memory",
        missing: true,
        role,
        x,
        y
      };
    }

    return graphNodeForObject(object, role, x, y);
  }

  function graphNodeForObject(
    object: MemoryObjectSummary,
    role: GraphNodeRole,
    x: number,
    y: number
  ): GraphNode {
    return {
      id: object.id,
      title: object.title,
      subtitle: `${object.type} / ${object.status}`,
      missing: false,
      role,
      x,
      y
    };
  }

  function graphNodeRadius(node: GraphNode): number {
    return node.role === "selected" ? 56 : 46;
  }

  function graphConnectionPoint(node: GraphNode, toward: GraphNode, offset: number): { x: number; y: number } {
    const deltaX = toward.x - node.x;
    const deltaY = toward.y - node.y;
    const length = Math.hypot(deltaX, deltaY);

    if (length === 0) {
      return {
        x: node.x,
        y: node.y - offset
      };
    }

    return {
      x: node.x + (deltaX / length) * offset,
      y: node.y + (deltaY / length) * offset
    };
  }

  function graphText(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
  }

  function graphMidpoint(start: number, end: number): number {
    return start + (end - start) / 2;
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
        blocks.push({
          kind: "paragraph",
          text: paragraph.join(" ")
        });
        paragraph = [];
      }
    };
    const flushList = (): void => {
      if (list.length > 0) {
        blocks.push({
          kind: "list",
          items: list
        });
        list = [];
      }
    };
    const flushQuote = (): void => {
      if (quote.length > 0) {
        blocks.push({
          kind: "quote",
          text: quote.join(" ")
        });
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
          blocks.push({
            kind: "code",
            text: code.join("\n")
          });
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
      blocks.push({
        kind: "code",
        text: code.join("\n")
      });
    }

    flushLooseBlocks();
    return blocks;
  }

  function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
  }

  function compareRelations(left: MemoryRelationSummary, right: MemoryRelationSummary): number {
    return left.id.localeCompare(right.id);
  }
</script>

<main class:ready-shell={loadState === "ready" && projectsData !== null} class="viewer-shell" aria-labelledby="viewer-title">
  {#if loadState === "loading"}
    <section class="system-panel" aria-live="polite">
      <p class="eyebrow">Aictx local viewer</p>
      <h1 id="viewer-title">Memory Viewer</h1>
      <p>Loading memory from the local viewer API.</p>
    </section>
  {:else if loadState === "error"}
    <section class="system-panel error-panel" role="alert">
      <p class="eyebrow">Aictx local viewer</p>
      <h1 id="viewer-title">Memory Viewer</h1>
      <h2>Viewer failed to load</h2>
      <p>{errorMessage}</p>
    </section>
  {:else if projectsData !== null}
    <aside class="nav-rail" aria-label="Viewer navigation">
      <div class="brand-block">
        <p class="eyebrow">Aictx local viewer</p>
        <h1 id="viewer-title">Memory Viewer</h1>
        <p class="project-name">{selectedProject?.project.name ?? "Projects"}</p>
        <p class="project-id">{selectedProject?.project.id ?? projectsData.registry_path}</p>
      </div>

      <nav class="nav-list">
        <button
          type="button"
          class:active={currentScreen === "projects"}
          aria-current={currentScreen === "projects" ? "page" : undefined}
          onclick={showProjects}
          data-testid="nav-projects"
        >
          Projects
        </button>
        <button
          type="button"
          class:active={currentScreen === "memories" || currentScreen === "detail"}
          aria-current={currentScreen === "memories" || currentScreen === "detail" ? "page" : undefined}
          disabled={selectedProjectId === null}
          onclick={showMemories}
          data-testid="nav-memories"
        >
          Memories
        </button>
        <button
          type="button"
          class:active={currentScreen === "lenses"}
          aria-current={currentScreen === "lenses" ? "page" : undefined}
          disabled={selectedProjectId === null}
          onclick={showLenses}
          data-testid="nav-lenses"
        >
          Lenses
        </button>
        <button
          type="button"
          class:active={currentScreen === "export"}
          aria-current={currentScreen === "export" ? "page" : undefined}
          disabled={selectedProjectId === null}
          onclick={showExport}
          data-testid="nav-export"
        >
          Export
        </button>
      </nav>

      <dl class="project-stats" aria-label="Project memory counts">
        {#if currentScreen === "projects" || bootstrap === null}
          <div>
            <dt>Projects</dt>
            <dd>{projectsData.counts.projects}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{projectsData.counts.available}</dd>
          </div>
          <div>
            <dt>Missing</dt>
            <dd>{projectsData.counts.unavailable}</dd>
          </div>
        {:else}
          <div>
            <dt>Memories</dt>
            <dd>{bootstrap.counts.objects}</dd>
          </div>
          <div>
            <dt>Connections</dt>
            <dd>{bootstrap.counts.relations}</dd>
          </div>
	          <div>
	            <dt>Syntheses</dt>
	            <dd>{bootstrap.counts.synthesis_objects}</dd>
	          </div>
	          <div>
	            <dt>Sources</dt>
	            <dd>{bootstrap.counts.source_objects}</dd>
	          </div>
        {/if}
      </dl>
    </aside>

    <section class="main-stage" aria-label="Read-only memory browser">
      {#if currentScreen === "projects"}
        <section class="projects-page" aria-labelledby="projects-title" data-testid="projects-view">
          <header class="page-header">
            <p class="eyebrow">Registered memory roots</p>
            <h2 id="projects-title">Projects</h2>
            <p>{countLabel(projects.length, "registered project", "registered projects")}</p>
          </header>

          {#if projects.length === 0}
            <section class="empty-projects" data-testid="empty-projects">
              <h3>No projects registered</h3>
              <p>Run <code>aictx projects add</code> inside an initialized project, or run any successful Aictx project command to register it automatically.</p>
              <p class="object-id">{projectsData.registry_path}</p>
            </section>
          {:else}
            <div class="project-grid" data-testid="project-list">
              {#each projects as project (project.registry_id)}
                <article
                  class:unavailable-project={!project.available}
                  class:current-project={project.current}
                  class="project-card"
                  data-testid={`project-card-${project.registry_id}`}
                >
                  <div class="project-card-topline">
                    <span>{project.source}</span>
                    <strong>{gitLabel(project)}</strong>
                  </div>
                  <h3>{project.project.name}</h3>
                  <p class="project-id">{project.project.id}</p>
                  <p class="project-root">{project.project_root}</p>

                  <dl class="project-card-stats">
                    <div>
                      <dt>Memories</dt>
                      <dd>{project.counts?.objects ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Connections</dt>
                      <dd>{project.counts?.relations ?? 0}</dd>
                    </div>
	                    <div>
	                      <dt>Syntheses</dt>
	                      <dd>{project.counts?.synthesis_objects ?? 0}</dd>
	                    </div>
                  </dl>

                  {#if project.warnings.length > 0}
                    <p class="project-warning">{project.warnings[0]}</p>
                  {/if}

                  <button
                    type="button"
                    class="primary-action"
                    disabled={!project.available}
                    onclick={() => selectProject(project.registry_id)}
                    data-testid={`project-open-${project.registry_id}`}
                  >
                    Open project
                  </button>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {:else if projectLoadState === "error"}
        <section class="system-panel error-panel" role="alert" data-testid="project-load-error">
          <p class="eyebrow">Aictx local viewer</p>
          <h2>Project failed to load</h2>
          <p>{projectErrorMessage}</p>
          <button type="button" class="back-action" onclick={showProjects}>Back to projects</button>
        </section>
      {:else if projectLoadState === "loading" || bootstrap === null}
        <section class="system-panel" aria-live="polite" data-testid="project-loading">
          <p class="eyebrow">Aictx local viewer</p>
          <h2>Loading Project</h2>
          <p>{selectedProject?.project.name ?? "Selected project"}</p>
        </section>
      {:else if currentScreen === "lenses"}
        <section class="lens-page" aria-labelledby="lens-title" data-testid="lens-view">
          <header class="page-header">
            <div>
              <p class="eyebrow">Readable project views</p>
              <h2 id="lens-title">Lenses</h2>
            </div>
            <p>{bootstrap.role_coverage.counts.populated} populated / {bootstrap.role_coverage.roles.length} roles</p>
          </header>

          <div class="layer-tabs lens-tabs" role="group" aria-label="Memory lenses">
            {#each lenses as lens (lens.name)}
              <button
                type="button"
                class:active={selectedLens?.name === lens.name}
                onclick={() => {
                  selectedLensName = lens.name;
                }}
                data-testid={`lens-tab-${lens.name}`}
              >
                {lens.title}
              </button>
            {/each}
          </div>

          <section class="role-coverage-grid" aria-label="Role coverage" data-testid="role-coverage">
            {#each bootstrap.role_coverage.roles as role (role.key)}
              <article class:coverage-gap={role.status !== "populated"} class="coverage-card">
                <div>
                  <h3>{role.label}</h3>
                  <p>{role.description}</p>
                </div>
                <span class={`coverage-status status-${role.status}`}>{role.status}</span>
              </article>
            {/each}
          </section>

          {#if selectedLens !== null}
            <section class="lens-layout">
              <article class="lens-markdown markdown-view" aria-label={`${selectedLens.title} lens`} data-testid="lens-markdown">
                {#each selectedLensBlocks as block, index (`lens-${block.kind}-${index}`)}
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
                {/each}
              </article>

              <aside class="lens-side-panel" aria-label="Lens context">
                <section>
                  <h3>Included Memory</h3>
                  {#if selectedLens.included_memory_ids.length === 0}
                    <p class="empty-copy">No memories included in this lens yet.</p>
                  {:else}
                    <ul class="evidence-list">
                      {#each selectedLens.included_memory_ids as id (id)}
                        {@const object = objectById.get(id)}
                        <li>
                          <span class="pill">{object?.type ?? "missing"}</span>
                          <button
                            type="button"
                            disabled={object === undefined}
                            onclick={() => openRelatedObject(id)}
                          >
                            {object?.title ?? id}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </section>

                <section>
                  <h3>Gaps</h3>
                  {#if selectedLens.generated_gaps.length === 0}
                    <p class="empty-copy">No generated gaps for this lens.</p>
                  {:else}
                    <ul class="lens-gap-list">
                      {#each selectedLens.generated_gaps as gap (gap)}
                        <li>{gap}</li>
                      {/each}
                    </ul>
                  {/if}
                </section>

                <section>
                  <h3>Relations</h3>
                  {#if selectedLens.relations.length === 0}
                    <p class="empty-copy">No relation context for this lens yet.</p>
                  {:else}
                    <ul class="lens-relation-list">
                      {#each selectedLens.relations as relation (relation.id)}
                        {@const fromObject = objectById.get(relation.from)}
                        {@const toObject = objectById.get(relation.to)}
                        <li>
                          <span>{relation.predicate}</span>
                          <button
                            type="button"
                            disabled={fromObject === undefined}
                            onclick={() => openRelatedObject(relation.from)}
                          >
                            {fromObject?.title ?? relation.from}
                          </button>
                          <button
                            type="button"
                            disabled={toObject === undefined}
                            onclick={() => openRelatedObject(relation.to)}
                          >
                            {toObject?.title ?? relation.to}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </section>
              </aside>
            </section>
          {/if}
        </section>
      {:else if currentScreen === "export"}
        <section class="export-page" aria-labelledby="export-title" data-testid="export-view">
          <header class="page-header compact-header">
            <p class="eyebrow">Generated projection</p>
            <h2 id="export-title">Obsidian Export</h2>
          </header>

          <form
            class="export-form"
            aria-label="Obsidian export"
            onsubmit={(event) => {
              event.preventDefault();
              void exportObsidian();
            }}
          >
            <label class="field">
              <span>Output directory</span>
              <input
                type="text"
                bind:value={exportOutDir}
                placeholder=".aictx/exports/obsidian"
                autocomplete="off"
                disabled={exportState === "running"}
                data-testid="obsidian-export-out-dir"
              />
            </label>

            <button
              type="submit"
              class="primary-action"
              disabled={exportState === "running"}
              data-testid="obsidian-export-submit"
            >
              {exportState === "running" ? "Exporting" : "Export"}
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
                  <p class="export-code">{exportErrorCode}</p>
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
      {:else if currentScreen === "detail" && selectedObject !== null}
        <article class="detail-page" aria-labelledby="selected-object-title" data-testid="selected-object">
          <header class="detail-header">
            <button
              type="button"
              class="back-action"
              onclick={showMemories}
              data-testid="selected-object-back"
            >
              Back to list
            </button>

            <div class="title-stack">
              <p class="eyebrow">{selectedObject.type} / {selectedObject.status}</p>
              <h2 id="selected-object-title">{selectedObject.title}</h2>
              <p class="object-id">{selectedObject.id}</p>
            </div>

            {#if selectedObject.tags.length > 0}
              <ul class="tag-list" aria-label="Tags">
                {#each selectedObject.tags as tag (tag)}
                  <li>{tag}</li>
                {/each}
              </ul>
            {/if}
          </header>

	          <section class="markdown-view" aria-label="Markdown body" data-testid="markdown-view">
            {#each markdownBlocks as block, index (`${block.kind}-${index}`)}
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

	          <section class="provenance-section" aria-labelledby="provenance-title" data-testid="provenance-links">
	            <div class="section-heading">
	              <div>
	                <p class="eyebrow">Provenance</p>
	                <h3 id="provenance-title">Sources</h3>
	              </div>
	              <p>{countLabel(provenanceEvidence.length + provenanceRelations.length, "link", "links")}</p>
	            </div>

	            {#if provenanceEvidence.length === 0 && provenanceRelations.length === 0}
	              <p class="empty-copy">No provenance links on this object.</p>
	            {:else}
	              <div class="provenance-grid">
	                {#if provenanceEvidence.length > 0}
	                  <section aria-label="Evidence">
	                    <h4>Evidence</h4>
	                    <ul class="evidence-list">
	                      {#each provenanceEvidence as evidence (`${evidence.kind}-${evidence.id}`)}
	                        <li>
	                          <span class="pill">{evidence.kind}</span>
	                          {#if objectById.has(evidence.id)}
	                            <button type="button" onclick={() => openRelatedObject(evidence.id)}>
	                              {objectById.get(evidence.id)?.title ?? evidence.id}
	                            </button>
	                          {:else}
	                            <code>{evidence.id}</code>
	                          {/if}
	                        </li>
	                      {/each}
	                    </ul>
	                  </section>
	                {/if}

	                {#if provenanceRelations.length > 0}
	                  <section aria-label="Provenance relations">
	                    <h4>Relations</h4>
	                    <ul class="evidence-list">
	                      {#each provenanceRelations as relation (relation.id)}
	                        {@const related = relationObject(relation, selectedObject.id)}
	                        <li>
	                          <span class="pill">{relation.predicate}</span>
	                          <button
	                            type="button"
	                            disabled={related === null}
	                            onclick={() => openRelatedObject(relationCounterpart(relation, selectedObject.id))}
	                          >
	                            {relationTargetLabel(relation, selectedObject.id)}
	                          </button>
	                        </li>
	                      {/each}
	                    </ul>
	                  </section>
	                {/if}
	              </div>
	            {/if}
	          </section>

	          <section class="connections-section" aria-labelledby="connections-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Direct context</p>
                <h3 id="connections-title">Related Memories</h3>
              </div>
              <p>{countLabel(directRelations.length, "direct connection", "direct connections")}</p>
            </div>

            <div class="relation-columns" data-testid="relation-cards">
              <section aria-label="Outgoing related memories">
                <h4>Outgoing</h4>
                {#if outgoingRelations.length === 0}
                  <p class="empty-copy">No outgoing related memories.</p>
                {:else}
                  <ul class="relation-list" data-testid="outgoing-relations">
                    {#each outgoingRelations as relation (relation.id)}
                      {@const related = relationObject(relation, selectedObject.id)}
                      <li class="relation-card" data-testid={`relation-card-${relation.id}`}>
                        <div class="relation-topline">
                          <span>{relationDirectionLabel(relation, selectedObject.id)}</span>
                          <strong>{relation.predicate}</strong>
                        </div>
                        <button
                          type="button"
                          disabled={related === null}
                          onclick={() => openRelatedObject(relation.to)}
                          title={related === null ? "Memory is not present in bootstrap data" : "Open related memory"}
                        >
                          {relationTargetLabel(relation, selectedObject.id)}
                        </button>
                        <p>{relationStatusLabel(relation)}</p>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </section>

              <section aria-label="Incoming related memories">
                <h4>Incoming</h4>
                {#if incomingRelations.length === 0}
                  <p class="empty-copy">No incoming related memories.</p>
                {:else}
                  <ul class="relation-list" data-testid="incoming-relations">
                    {#each incomingRelations as relation (relation.id)}
                      {@const related = relationObject(relation, selectedObject.id)}
                      <li class="relation-card" data-testid={`relation-card-${relation.id}`}>
                        <div class="relation-topline">
                          <span>{relationDirectionLabel(relation, selectedObject.id)}</span>
                          <strong>{relation.predicate}</strong>
                        </div>
                        <button
                          type="button"
                          disabled={related === null}
                          onclick={() => openRelatedObject(relation.from)}
                          title={related === null ? "Memory is not present in bootstrap data" : "Open related memory"}
                        >
                          {relationTargetLabel(relation, selectedObject.id)}
                        </button>
                        <p>{relationStatusLabel(relation)}</p>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </section>
            </div>
          </section>

          <section class="graph-panel" aria-label="Direct memory connection map" data-testid="relation-graph">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Connection map</p>
                <h3>Direct Neighborhood</h3>
              </div>
              <p>
                {countLabel(graphNodes.length, "memory", "memories")} /
                {countLabel(graphEdges.length, "connection", "connections")}
              </p>
            </div>

            <div class="graph-surface">
              <svg
                class="relation-graph-svg"
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                role="img"
                aria-labelledby="relation-graph-title"
                data-testid="relation-graph-svg"
              >
                <title id="relation-graph-title">
                  Direct memory connections for {selectedObject.title}
                </title>
                <defs>
                  <marker
                    id="graph-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill="#667085" />
                  </marker>
                </defs>

                {#each graphEdges as edge (edge.relation.id)}
                  {@const fromNode = graphNodeById.get(edge.fromId)}
                  {@const toNode = graphNodeById.get(edge.toId)}
                  {#if fromNode !== undefined && toNode !== undefined}
                    {@const startPoint = graphConnectionPoint(fromNode, toNode, graphNodeRadius(fromNode) + 6)}
                    {@const endPoint = graphConnectionPoint(toNode, fromNode, graphNodeRadius(toNode) + 10)}
                    <g class="graph-edge" data-testid={`relation-graph-edge-${edge.relation.id}`}>
                      <line
                        x1={startPoint.x}
                        y1={startPoint.y}
                        x2={endPoint.x}
                        y2={endPoint.y}
                        marker-end="url(#graph-arrow)"
                      />
                      <text
                        x={graphMidpoint(fromNode.x, toNode.x)}
                        y={graphMidpoint(fromNode.y, toNode.y) - 12}
                      >
                        {edge.relation.predicate}
                      </text>
                    </g>
                  {/if}
                {/each}

                {#each graphNodes as node (node.id)}
                  <g
                    class:selected-node={node.role === "selected"}
                    class:incoming-node={node.role === "incoming"}
                    class:outgoing-node={node.role === "outgoing"}
                    class:bidirectional-node={node.role === "both"}
                    class:missing-node={node.missing}
                    class="graph-node"
                    data-testid={`relation-graph-node-${node.id}`}
                  >
                    <title>{node.title} ({node.id})</title>
                    <circle cx={node.x} cy={node.y} r={graphNodeRadius(node)} />
                    <text class="graph-node-title" x={node.x} y={node.y - 6}>
                      {graphText(node.title, node.role === "selected" ? 28 : 22)}
                    </text>
                    <text class="graph-node-subtitle" x={node.x} y={node.y + 16}>
                      {graphText(node.subtitle, node.role === "selected" ? 28 : 22)}
                    </text>
                  </g>
                {/each}
              </svg>
            </div>

            {#if directRelations.length === 0}
              <p class="empty-copy" data-testid="relation-graph-empty">
                No direct relations for this object.
              </p>
            {/if}
          </section>

          <details class="technical-details" data-testid="technical-details">
            <summary>Technical details</summary>
            <dl>
              <div>
                <dt>Body</dt>
                <dd>{selectedObject.body_path}</dd>
              </div>
              <div>
                <dt>Sidecar</dt>
                <dd>{selectedObject.json_path}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{selectedObject.scope.kind}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{selectedObject.created_at}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{selectedObject.updated_at}</dd>
              </div>
            </dl>
            <section class="json-view" aria-label="Object sidecar JSON" data-testid="json-view">
              <pre>{selectedJson}</pre>
            </section>
          </details>
        </article>
      {:else}
        <section class="memory-list-page" aria-labelledby="memory-list-title" data-testid="memory-list-view">
          <header class="page-header">
            <div>
              <p class="eyebrow">Project memory</p>
              <h2 id="memory-list-title">Memories</h2>
            </div>
            <p>{filteredObjects.length} shown / {objects.length} total</p>
          </header>

	          <section class="filters" aria-label="Search and filters">
	            <div class="layer-tabs" role="group" aria-label="Memory layers">
	              {#each layerOptions as option (option.value)}
	                <button
	                  type="button"
	                  class:active={layerFilter === option.value}
	                  onclick={() => {
	                    layerFilter = option.value;
	                  }}
	                  data-testid={`viewer-layer-${option.value}`}
	                >
	                  {option.label}
	                </button>
	              {/each}
	            </div>

	            <label class="field search-field">
              <span>Search</span>
              <input
                type="search"
                bind:value={searchQuery}
                placeholder="Title, id, tag, body"
                autocomplete="off"
                data-testid="viewer-search"
              />
            </label>

            <div class="filter-grid">
              <label class="field">
                <span>Type</span>
                <select bind:value={typeFilter} data-testid="viewer-type-filter">
                  <option value={allOption}>All types</option>
                  {#each typeOptions as type (type)}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </label>

              <label class="field">
                <span>Status</span>
                <select bind:value={statusFilter} data-testid="viewer-status-filter">
                  <option value={allOption}>All statuses</option>
                  {#each statusOptions as status (status)}
                    <option value={status}>{status}</option>
                  {/each}
                </select>
              </label>

              <label class="field">
                <span>Tag</span>
                <select bind:value={tagFilter} data-testid="viewer-tag-filter">
                  <option value={allOption}>All tags</option>
                  {#each tagOptions as tag (tag)}
                    <option value={tag}>{tag}</option>
                  {/each}
                </select>
              </label>
            </div>
          </section>

          {#if visibleWarnings.length > 0}
            <section class="warnings" aria-label="Storage warnings">
              {#each visibleWarnings as warning (warning)}
                <p>{warning}</p>
              {/each}
            </section>
          {/if}

          {#if hasStarterMemoryOnly}
            <section
              class="onboarding-callout"
              aria-label="Starter memory notice"
              data-testid="starter-memory-notice"
            >
              <p>
                <strong>Starter memory only.</strong>
                Seed useful repo memory with setup, then reopen or refresh the viewer.
              </p>
              <code>aictx setup</code>
              <code>aictx lens project-map</code>
            </section>
          {/if}

          <nav class="object-list" aria-label="Memory objects">
            {#each filteredObjects as object (object.id)}
              <button
                type="button"
                class:selected={selectedObject?.id === object.id}
                onclick={() => selectObject(object.id)}
                data-testid={`object-row-${object.id}`}
              >
                <span class="object-title">{object.title}</span>
                <span class="object-id">{object.id}</span>
                <span class="object-meta">
                  <span class="pill">{object.type}</span>
                  <span class:muted-status={object.status !== "active"} class="pill">{object.status}</span>
                </span>
              </button>
            {:else}
              <p class="empty-copy">No memory objects match the current filters.</p>
            {/each}
          </nav>
        </section>
      {/if}
    </section>
  {/if}
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: #172033;
    background:
      linear-gradient(90deg, rgb(23 32 51 / 4%) 1px, transparent 1px),
      linear-gradient(rgb(23 32 51 / 4%) 1px, transparent 1px),
      #f5f6f3;
    background-size: 30px 30px;
    font-family:
      "Avenir Next", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      sans-serif;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  p {
    margin-top: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5 {
    color: #101828;
    letter-spacing: 0;
  }

  h1 {
    margin-bottom: 0;
    font-size: 1.45rem;
    line-height: 1.08;
  }

  h2 {
    margin-bottom: 0;
    font-size: 2.1rem;
    line-height: 1.08;
  }

  h3 {
    margin-bottom: 0;
    font-size: 1.35rem;
    line-height: 1.2;
  }

  h4 {
    margin-bottom: 0;
    font-size: 1rem;
    line-height: 1.25;
  }

  .viewer-shell {
    min-height: 100vh;
    padding: 18px;
  }

  .viewer-shell.ready-shell {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    gap: 18px;
  }

  .nav-rail,
  .main-stage,
  .system-panel {
    min-width: 0;
    border: 1px solid #d6d9d2;
    border-radius: 8px;
    background: rgb(255 255 255 / 96%);
    box-shadow: 0 16px 42px rgb(16 24 40 / 8%);
  }

  .nav-rail {
    position: sticky;
    top: 18px;
    display: flex;
    align-self: start;
    min-height: calc(100vh - 36px);
    flex-direction: column;
    padding: 14px;
  }

  .brand-block {
    display: grid;
    gap: 6px;
    border-bottom: 1px solid #e2e5df;
    padding-bottom: 16px;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: #667085;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .project-name {
    margin: 8px 0 0;
    color: #101828;
    font-weight: 800;
    line-height: 1.25;
  }

  .project-id,
  .object-id {
    overflow-wrap: anywhere;
    color: #667085;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .project-id {
    margin: 0;
  }

  .nav-list {
    display: grid;
    gap: 8px;
    margin-top: 16px;
  }

  .nav-list button,
  .back-action,
  .primary-action,
  .relation-card button {
    min-height: 40px;
    border-radius: 6px;
    font-weight: 800;
  }

  .nav-list button {
    width: 100%;
    border: 1px solid transparent;
    padding: 9px 10px;
    color: #344054;
    background: transparent;
    text-align: left;
  }

  .nav-list button:hover,
  .nav-list button.active {
    border-color: #a7b6b2;
    color: #123532;
    background: #eef7f4;
  }

  .project-stats {
    display: grid;
    gap: 10px;
    margin: auto 0 0;
    border-top: 1px solid #e2e5df;
    padding-top: 16px;
  }

  .project-stats div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .project-stats dt {
    color: #667085;
    font-size: 0.73rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .project-stats dd {
    margin: 0;
    color: #101828;
    font-size: 1.1rem;
    font-weight: 900;
  }

  .main-stage {
    min-height: calc(100vh - 36px);
    padding: 24px;
  }

  .memory-list-page,
  .detail-page,
  .export-page,
  .lens-page,
  .projects-page {
    width: min(100%, 1080px);
    margin: 0 auto;
  }

  .detail-page {
    display: grid;
    gap: 18px;
  }

  .export-page {
    width: min(100%, 760px);
  }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .project-card,
  .empty-projects {
    display: grid;
    gap: 12px;
    min-width: 0;
    border: 1px solid #d9ded7;
    border-radius: 8px;
    padding: 16px;
    background: #ffffff;
    box-shadow: 0 8px 20px rgb(16 24 40 / 5%);
  }

  .project-card.current-project {
    border-color: #8fb5ad;
    background: #f5faf8;
  }

  .project-card.unavailable-project {
    border-color: #e3c1b6;
    background: #fff8f5;
  }

  .project-card h3,
  .empty-projects h3 {
    margin: 0;
  }

  .project-card-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #667085;
    font-size: 0.74rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .project-card-topline strong {
    color: #28514b;
  }

  .project-root {
    margin: 0;
    overflow-wrap: anywhere;
    color: #52615d;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .project-card-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }

  .project-card-stats div {
    border: 1px solid #e1e6df;
    border-radius: 6px;
    padding: 8px;
    background: #fbfcfa;
  }

  .project-card-stats dt {
    color: #667085;
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .project-card-stats dd {
    margin: 3px 0 0;
    color: #101828;
    font-size: 1.05rem;
    font-weight: 900;
  }

  .project-warning {
    margin: 0;
    color: #8a3d22;
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .page-header,
  .detail-header,
  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .page-header {
    margin-bottom: 20px;
    border-bottom: 1px solid #e2e5df;
    padding-bottom: 18px;
  }

  .page-header > p,
  .section-heading > p {
    margin: 0;
    color: #667085;
    font-size: 0.86rem;
    font-weight: 800;
  }

  .compact-header {
    margin-bottom: 18px;
  }

  .filters,
  .export-form,
  .provenance-section,
  .connections-section,
  .graph-panel,
  .technical-details,
  .warnings,
  .onboarding-callout {
    border: 1px solid #d9ded7;
    border-radius: 8px;
    background: #ffffff;
  }

  .filters {
    display: grid;
    gap: 14px;
    margin-bottom: 16px;
    padding: 16px;
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .layer-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .layer-tabs button {
    min-height: 34px;
    border: 1px solid #cfd4d3;
    border-radius: 6px;
    padding: 6px 10px;
    color: #344054;
    background: #ffffff;
    font-weight: 800;
  }

  .layer-tabs button:hover,
  .layer-tabs button.active {
    border-color: #8fb5ad;
    color: #123532;
    background: #eef7f4;
  }

  .lens-tabs {
    margin-bottom: 16px;
  }

  .role-coverage-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  .coverage-card {
    display: grid;
    gap: 10px;
    min-width: 0;
    border: 1px solid #d9ded7;
    border-radius: 8px;
    padding: 12px;
    background: #ffffff;
  }

  .coverage-card.coverage-gap {
    border-color: #e2d2a6;
    background: #fffaf0;
  }

  .coverage-card h3 {
    margin: 0 0 4px;
    font-size: 0.95rem;
  }

  .coverage-card p {
    margin: 0;
    color: #667085;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .coverage-status {
    width: fit-content;
    border: 1px solid #cfd4d3;
    border-radius: 999px;
    padding: 3px 8px;
    color: #344054;
    background: #f8fbfa;
    font-size: 0.72rem;
    font-weight: 900;
  }

  .status-populated {
    border-color: #a7c9bd;
    color: #1f5136;
    background: #eff8f2;
  }

  .status-thin,
  .status-missing,
  .status-stale,
  .status-conflicted {
    border-color: #d8be78;
    color: #6f4c00;
    background: #fff7df;
  }

  .lens-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
    gap: 16px;
    align-items: start;
  }

  .lens-markdown,
  .lens-side-panel {
    border: 1px solid #d9ded7;
    border-radius: 8px;
    background: #ffffff;
  }

  .lens-markdown {
    width: 100%;
    padding: 16px;
  }

  .lens-side-panel {
    display: grid;
    gap: 16px;
    padding: 16px;
  }

  .lens-side-panel section {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .lens-side-panel h3 {
    margin: 0;
    font-size: 1rem;
  }

  .lens-gap-list,
  .lens-relation-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding-left: 18px;
    color: #263141;
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .lens-relation-list li {
    display: grid;
    gap: 4px;
  }

  .lens-relation-list span {
    color: #28514b;
    font-weight: 900;
  }

  .lens-relation-list button {
    width: fit-content;
    max-width: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    overflow-wrap: anywhere;
    color: #52615d;
    font: inherit;
    font-weight: 800;
    text-align: left;
    cursor: pointer;
  }

  .lens-relation-list button:disabled {
    cursor: default;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    color: #52615d;
    font-size: 0.73rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  input,
  select {
    width: 100%;
    min-height: 40px;
    border: 1px solid #cfd4d3;
    border-radius: 6px;
    padding: 8px 10px;
    color: #172033;
    background: #ffffff;
  }

  input:focus,
  select:focus,
  button:focus-visible,
  summary:focus-visible {
    outline: 3px solid rgb(15 118 110 / 28%);
    outline-offset: 2px;
  }

  .warnings,
  .onboarding-callout {
    display: grid;
    gap: 8px;
    margin-bottom: 16px;
    padding: 14px;
  }

  .warnings {
    border-color: #e7d9a8;
    background: #fff9e7;
  }

  .warnings p {
    margin: 0;
    color: #694d00;
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .onboarding-callout {
    border-color: #b7d4c3;
    background: #eff8f2;
  }

  .onboarding-callout p {
    margin: 0;
    color: #1f5136;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .onboarding-callout code {
    display: block;
    overflow-wrap: anywhere;
    color: #123532;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .object-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .object-list button {
    display: grid;
    gap: 9px;
    min-height: 132px;
    border: 1px solid #d9ded7;
    border-radius: 8px;
    padding: 14px;
    color: inherit;
    background: #ffffff;
    text-align: left;
    box-shadow: 0 8px 20px rgb(16 24 40 / 5%);
  }

  .object-list button:hover,
  .object-list button.selected {
    border-color: #8fb5ad;
    background: #f1f8f6;
    transform: translateY(-1px);
  }

  .object-title {
    color: #101828;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.25;
  }

  .object-meta,
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pill,
  .tag-list li,
  .relation-topline span {
    border: 1px solid #d4d9d5;
    border-radius: 999px;
    padding: 2px 8px;
    color: #28514b;
    background: #f2f8f6;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .muted-status {
    color: #6f4c00;
    background: #fff7df;
  }

  .detail-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    border-bottom: 1px solid #e2e5df;
    padding-bottom: 18px;
  }

  .title-stack {
    display: grid;
    gap: 6px;
  }

  .back-action {
    border: 1px solid #c7cfc9;
    padding: 8px 11px;
    color: #344054;
    background: #ffffff;
  }

  .back-action:hover {
    border-color: #8fb5ad;
    color: #123532;
    background: #eef7f4;
  }

  .tag-list {
    grid-column: 2;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .markdown-view {
    width: min(100%, 850px);
    color: #263141;
    font-size: 1rem;
    line-height: 1.68;
  }

  .markdown-view h3 {
    margin: 0 0 12px;
    font-size: 1.55rem;
  }

  .markdown-view h4 {
    margin: 22px 0 10px;
    font-size: 1.16rem;
  }

  .markdown-view h5 {
    margin: 18px 0 8px;
    font-size: 1rem;
  }

  .markdown-view p,
  .markdown-view ul,
  .markdown-view blockquote,
  .markdown-view pre {
    margin: 0 0 14px;
  }

  .markdown-view blockquote {
    border-left: 3px solid #0f766e;
    padding-left: 12px;
    color: #465750;
  }

  .markdown-view pre,
  .json-view pre {
    overflow: auto;
    border: 1px solid #2a3447;
    border-radius: 7px;
    padding: 14px;
    background: #111827;
    color: #f7faf9;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.85rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .connections-section,
  .provenance-section,
  .graph-panel,
  .technical-details {
    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .section-heading {
    align-items: flex-end;
    border-bottom: 1px solid #e2e5df;
    padding-bottom: 14px;
  }

  .relation-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .provenance-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .evidence-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .evidence-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .evidence-list button {
    min-height: 34px;
    border: 1px solid #b9c8c4;
    border-radius: 6px;
    padding: 6px 9px;
    color: #17443e;
    background: #eef7f4;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .evidence-list code {
    overflow-wrap: anywhere;
    color: #52615d;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.78rem;
  }

  .relation-columns section {
    display: grid;
    align-content: start;
    gap: 10px;
    min-width: 0;
  }

  .relation-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .relation-card {
    display: grid;
    gap: 9px;
    border: 1px solid #e0e4e1;
    border-radius: 8px;
    padding: 12px;
    background: #fbfcfa;
  }

  .relation-topline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .relation-topline strong {
    color: #101828;
    font-size: 0.92rem;
  }

  .relation-card button {
    width: 100%;
    border: 1px solid #b9c8c4;
    padding: 8px 10px;
    color: #17443e;
    background: #eef7f4;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .relation-card button:hover:not(:disabled) {
    border-color: #0f766e;
    background: #e1f1ed;
  }

  .relation-card button:disabled {
    color: #7b8581;
    background: #f1f1ee;
  }

  .relation-card p {
    margin: 0;
    color: #667085;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .graph-surface {
    min-height: 360px;
    border: 1px solid #d4d9d5;
    border-radius: 8px;
    background:
      linear-gradient(90deg, rgb(16 24 40 / 5%) 1px, transparent 1px),
      linear-gradient(rgb(16 24 40 / 5%) 1px, transparent 1px),
      #f8fbfa;
    background-size: 24px 24px;
  }

  .relation-graph-svg {
    display: block;
    width: 100%;
    min-height: 360px;
  }

  .graph-edge line {
    stroke: #667085;
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .graph-edge text {
    fill: #344054;
    font-size: 18px;
    font-weight: 900;
    paint-order: stroke;
    pointer-events: none;
    stroke: #f8fbfa;
    stroke-linejoin: round;
    stroke-width: 6px;
    text-anchor: middle;
  }

  .graph-node circle {
    fill: #ffffff;
    stroke: #9fb6b1;
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .graph-node.incoming-node circle {
    fill: #f0f7ff;
    stroke: #5b8fc9;
  }

  .graph-node.outgoing-node circle {
    fill: #fff6e9;
    stroke: #d9902f;
  }

  .graph-node.bidirectional-node circle {
    fill: #f6f1ff;
    stroke: #8b6bb8;
  }

  .graph-node.selected-node circle {
    fill: #0f766e;
    stroke: #0b5f59;
  }

  .graph-node.missing-node circle {
    fill: #fff7df;
    stroke: #c9a84d;
    stroke-dasharray: 6 5;
  }

  .graph-node text {
    pointer-events: none;
    text-anchor: middle;
  }

  .graph-node-title {
    fill: #101828;
    font-size: 18px;
    font-weight: 900;
  }

  .graph-node-subtitle {
    fill: #52615d;
    font-size: 12px;
    font-weight: 800;
  }

  .graph-node.selected-node .graph-node-title,
  .graph-node.selected-node .graph-node-subtitle {
    fill: #ffffff;
  }

  .technical-details summary {
    color: #101828;
    cursor: pointer;
    font-weight: 900;
  }

  .technical-details dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  .technical-details div {
    display: grid;
    gap: 4px;
  }

  .technical-details dt {
    color: #667085;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .technical-details dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #172033;
    font-size: 0.86rem;
  }

  .export-form {
    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .primary-action {
    width: fit-content;
    min-width: 132px;
    border: 1px solid #0b5f59;
    padding: 9px 13px;
    color: #ffffff;
    background: #0f766e;
  }

  .primary-action:hover:not(:disabled) {
    background: #0b5f59;
  }

  .primary-action:disabled {
    border-color: #a7b6b2;
    color: #52615d;
    background: #eef2f1;
  }

  .export-status {
    display: grid;
    gap: 8px;
    border: 1px solid #cfd4d3;
    border-radius: 7px;
    padding: 12px;
    background: #f8fbfa;
    color: #263141;
  }

  .export-status p {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 0.86rem;
    line-height: 1.4;
  }

  .export-status-success {
    border-color: #85aaa4;
    background: #eef7f4;
  }

  .export-status-error {
    border-color: #dab0a3;
    background: #fff4ef;
  }

  .export-code {
    color: #8b2e19;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-weight: 800;
  }

  .export-status dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .export-status div {
    display: grid;
    gap: 3px;
  }

  .export-status dt {
    color: #52615d;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .export-status dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 0.82rem;
  }

  .empty-copy {
    margin: 0;
    color: #667085;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .system-panel {
    width: min(100%, 680px);
    margin: 12vh auto 0;
    padding: 28px;
  }

  .system-panel p:last-child {
    margin-bottom: 0;
    color: #52615d;
  }

  .error-panel {
    border-color: #dab0a3;
    background: #fff4ef;
  }

  @media (max-width: 980px) {
    .viewer-shell.ready-shell {
      grid-template-columns: 1fr;
    }

    .nav-rail {
      position: static;
      min-height: auto;
    }

    .brand-block {
      grid-template-columns: minmax(0, 1fr);
    }

    .nav-list {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .project-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 16px;
    }

    .project-stats div {
      display: grid;
      gap: 3px;
    }

    .main-stage {
      min-height: auto;
    }
  }

  @media (max-width: 760px) {
    .viewer-shell {
      padding: 10px;
    }

    .main-stage,
    .nav-rail,
    .system-panel {
      padding: 14px;
    }

    h2 {
      font-size: 1.65rem;
    }

    .page-header,
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .filter-grid,
    .lens-layout,
    .provenance-grid,
    .relation-columns,
    .project-card-stats,
    .technical-details dl {
      grid-template-columns: 1fr;
    }

    .detail-header {
      grid-template-columns: 1fr;
    }

    .tag-list {
      grid-column: auto;
    }

    .object-list {
      grid-template-columns: 1fr;
    }

    .graph-surface,
    .relation-graph-svg {
      min-height: 300px;
    }
  }
</style>
