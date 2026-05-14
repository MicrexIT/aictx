<svelte:options runes={true} />

<script lang="ts">
  import { FACET_CATEGORIES, OBJECT_TYPES } from "../../src/core/types.js";
  import cytoscape from "cytoscape";
  import { onDestroy, onMount } from "svelte";

  type FacetCategory = (typeof FACET_CATEGORIES)[number];
  type ObjectStatus = "active" | "stale" | "superseded" | "open" | "closed";
  type ObjectType = (typeof OBJECT_TYPES)[number];
  type RelationStatus = "active" | "stale" | "rejected";
  type RelationConfidence = "low" | "medium" | "high";
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
    category: FacetCategory;
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
  type LoadPreviewEnvelope = ViewerSuccessEnvelope<LoadPreviewData> | ViewerErrorEnvelope;
  type ViewerState = "loading" | "ready" | "error";
  type ViewerScreen = "projects" | "memories" | "detail" | "graph" | "export";
  type ExportState = "idle" | "running" | "success" | "error";
  type PreviewState = "idle" | "running" | "success" | "error";
  type LayerFilter = "all" | "memories" | "syntheses" | "sources" | "inactive";
  type PagePreset = "all" | "atomic-memory" | "syntheses" | "sources" | "inactive";
  type LoadMemoryMode = "coding" | "debugging" | "review" | "architecture" | "onboarding";
  type MemoryLensName = "project-map" | "current-work" | "review-risk" | "provenance" | "maintenance";
  type RoleCoverageStatus = "populated" | "thin" | "missing" | "stale" | "conflicted";

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

  interface MarkdownBlock {
    kind: "heading" | "paragraph" | "list" | "quote" | "code";
    text?: string;
    level?: 1 | 2 | 3;
    items?: string[];
  }

  interface MemorySection {
    id: string;
    title: string;
    icon: string;
    objects: MemoryObjectSummary[];
  }

  interface MemorySnapshotItem {
    label: string;
    value: string;
    detail: string;
  }

  interface TokenTarget {
    value: number;
    source: "explicit" | "config_default" | "fallback_default";
    enforced: boolean;
    was_capped: boolean;
  }

  interface LoadMemorySource {
    project: string;
    git_available: boolean;
    branch: string | null;
    commit: string | null;
  }

  interface LoadPreviewData {
    task: string;
    token_budget: number;
    mode: LoadMemoryMode;
    context_pack: string;
    source: LoadMemorySource;
    token_target: TokenTarget;
    estimated_tokens: number;
    budget_status: "within_target" | "over_target";
    truncated: boolean;
    included_ids: string[];
    excluded_ids: string[];
    omitted_ids: string[];
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
  let selectedObjectId = $state<string | null>(null);
  let searchQuery = $state("");
  let layerFilter = $state<LayerFilter>("all");
  let typeFilter = $state("all");
  let facetCategoryFilter = $state("all");
  let statusFilter = $state("all");
  let tagFilter = $state("all");
  let pagePreset = $state<PagePreset>("all");
  let activeLensName = $state<MemoryLensName>("project-map");
  let mobileMenuOpen = $state(false);
  let exportOutDir = $state("");
  let exportState = $state<ExportState>("idle");
  let exportMessage = $state("");
  let exportErrorCode = $state("");
  let exportFilesWritten = $state(0);
  let exportManifestPath = $state("");
  let previewTask = $state("");
  let previewMode = $state<LoadMemoryMode>("coding");
  let previewTokenBudget = $state("");
  let previewState = $state<PreviewState>("idle");
  let previewMessage = $state("");
  let previewErrorCode = $state("");
  let previewData = $state<LoadPreviewData | null>(null);
  let copiedPreviewTarget = $state<"command" | "context" | null>(null);
  let graphContainer = $state<HTMLDivElement | null>(null);
  let graphInstance: cytoscape.Core | null = null;
  let graphShowInactive = $state(false);
  let selectedGraphObjectId = $state<string | null>(null);
  let selectedGraphRelationId = $state<string | null>(null);

  const allOption = "all";
  const token = viewerToken();
  const isDemoMode = token === "demo";
  const layerOptions: Array<{ value: LayerFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "memories", label: "Atomic" },
    { value: "syntheses", label: "Syntheses" },
    { value: "sources", label: "Sources" },
    { value: "inactive", label: "Inactive" }
  ];
  const loadModeOptions: Array<{ value: LoadMemoryMode; label: string }> = [
    { value: "coding", label: "Coding" },
    { value: "debugging", label: "Debugging" },
    { value: "review", label: "Review" },
    { value: "architecture", label: "Architecture" },
    { value: "onboarding", label: "Onboarding" }
  ];
  const graphStyles: cytoscape.StylesheetJson = [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        "border-color": "data(borderColor)",
        "border-width": 2,
        color: "#37352f",
        "font-size": 10,
        "font-weight": 700,
        height: "data(size)",
        label: "data(label)",
        "min-zoomed-font-size": 8,
        "overlay-opacity": 0,
        "text-background-color": "#fffefa",
        "text-background-opacity": 0.86,
        "text-background-padding": "3px",
        "text-margin-y": 8,
        "text-max-width": "126px",
        "text-wrap": "wrap",
        width: "data(size)"
      }
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        "font-size": 8,
        "line-color": "data(color)",
        opacity: 0.72,
        "overlay-opacity": 0,
        "target-arrow-color": "data(color)",
        "target-arrow-shape": "triangle",
        width: "data(width)"
      }
    },
    {
      selector: ".graph-selected",
      style: {
        "border-color": "#111214",
        "border-width": 4,
        "line-color": "#111214",
        opacity: 1,
        "target-arrow-color": "#111214",
        width: 3,
        "z-index": 20
      }
    },
    {
      selector: ".graph-neighbor",
      style: {
        opacity: 1,
        "z-index": 12
      }
    },
    {
      selector: ".graph-faded",
      style: {
        opacity: 0.16
      }
    }
  ];

  const projects = $derived(projectsData?.projects ?? []);
  const selectedProject = $derived.by(() =>
    selectedProjectId === null
      ? null
      : projects.find((project) => project.registry_id === selectedProjectId) ?? null
  );
  const objects = $derived(bootstrap?.objects ?? []);
  const relations = $derived(bootstrap?.relations ?? []);
  const objectById = $derived(new Map(objects.map((object) => [object.id, object])));
  const filteredObjects = $derived.by(() =>
    objects.filter((object) => objectMatchesFilters(object))
  );
  const selectedObject = $derived.by(() =>
    selectedObjectId === null ? null : objectById.get(selectedObjectId) ?? null
  );
  const graphObjects = $derived.by(() =>
    objects.filter((object) =>
      (graphShowInactive || isCurrentStatus(object.status)) &&
      objectMatchesSearch(object, searchQuery)
    )
  );
  const graphVisibleObjectIds = $derived(new Set(graphObjects.map((object) => object.id)));
  const graphRelations = $derived.by(() =>
    relations.filter((relation) =>
      (graphShowInactive || relation.status === "active") &&
      graphVisibleObjectIds.has(relation.from) &&
      graphVisibleObjectIds.has(relation.to)
    )
  );
  const graphElements = $derived.by(() => buildGraphElements(graphObjects, graphRelations));
  const selectedGraphObject = $derived.by(() =>
    selectedGraphObjectId === null || !graphVisibleObjectIds.has(selectedGraphObjectId)
      ? null
      : objectById.get(selectedGraphObjectId) ?? null
  );
  const selectedGraphRelation = $derived.by(() =>
    selectedGraphRelationId === null
      ? null
      : graphRelations.find((relation) => relation.id === selectedGraphRelationId) ?? null
  );
  const selectedGraphRelationSource = $derived(
    selectedGraphRelation === null ? null : objectById.get(selectedGraphRelation.from) ?? null
  );
  const selectedGraphRelationTarget = $derived(
    selectedGraphRelation === null ? null : objectById.get(selectedGraphRelation.to) ?? null
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
  const typeOptions = $derived(uniqueSorted(objects.map((object) => object.type)));
  const facetCategoryOptions = $derived.by(() =>
    FACET_CATEGORIES.filter((category) =>
      objects.some((object) => object.facets?.category === category)
    )
  );
  const statusOptions = $derived(uniqueSorted(objects.map((object) => object.status)));
  const tagOptions = $derived(uniqueSorted(objects.flatMap((object) => object.tags)));
  const markdownBlocks = $derived(
    selectedObject === null ? [] : parseMarkdownBlocks(selectedObject.body)
  );
  const previewMarkdownBlocks = $derived(
    previewData === null ? [] : parseMarkdownBlocks(previewData.context_pack)
  );
  const guidedLenses = $derived(bootstrap?.lenses ?? []);
  const activeGuidedLens = $derived.by(() =>
    guidedLenses.find((lens) => lens.name === activeLensName) ?? guidedLenses[0] ?? null
  );
  const activeLensMarkdownBlocks = $derived(
    activeGuidedLens === null ? [] : parseMarkdownBlocks(activeGuidedLens.markdown)
  );
  const roleCoverage = $derived(bootstrap?.role_coverage ?? emptyRoleCoverage());
  const selectedJson = $derived(
    selectedObject === null ? "" : JSON.stringify(sidecarJsonForObject(selectedObject), null, 2)
  );
  const visibleWarnings = $derived(uniqueSorted([
    ...(bootstrap?.storage_warnings ?? []),
    ...(selectedProject?.warnings ?? []),
    ...warnings
  ]));
  const hasStarterMemoryOnly = $derived.by(() => isStarterMemoryOnly(objects));
  const memorySnapshot = $derived.by(() => buildMemorySnapshot(objects, relations));
  const activeMemoryCount = $derived(objects.filter((object) => isCurrentStatus(object.status)).length);
  const facetCategoryCount = $derived(facetCategoryOptions.length);
  const staleMemoryCount = $derived(objects.filter((object) => object.status === "stale" || object.status === "superseded").length);
  const trustLabel = $derived.by(() => selectedProject === null ? "No project" : gitLabel(selectedProject));
  const trustDescription = $derived.by(() =>
    selectedProject === null ? "No project is selected." : gitDescription(selectedProject)
  );
  const memorySections = $derived.by(() => buildMemorySections(filteredObjects));
  const previewCommandTask = $derived.by(() => previewTask.trim() || (previewData?.task ?? ""));
  const showPreviewCommand = $derived(previewCommandTask.trim() !== "");
  const previewCommand = $derived.by(() => buildPreviewCommand(previewCommandTask, previewMode, previewTokenBudget));

  onMount(() => {
    void loadProjects();
  });

  onDestroy(() => {
    destroyGraph();
  });

  $effect(() => {
    if (currentScreen !== "graph" || graphContainer === null || bootstrap === null) {
      destroyGraph();
      return;
    }

    renderGraph(graphElements);
    queueMicrotask(() => {
      applyGraphSelection();
    });
  });

  $effect(() => {
    if (currentScreen === "graph") {
      applyGraphSelection();
    }
  });

  function viewerToken(): string {
    const explicitToken = new URLSearchParams(window.location.search).get("token");

    if (explicitToken !== null) {
      return explicitToken;
    }

    return window.location.hostname === "demo.aictx.dev" ? "demo" : "";
  }

  async function loadProjects(): Promise<void> {
    if (token === "") {
      loadState = "error";
      errorMessage = "Viewer API token is missing from the local URL.";
      return;
    }

    try {
      const response = await fetch(`/api/projects?token=${encodeURIComponent(token)}`, {
        headers: { accept: "application/json" }
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
        headers: { accept: "application/json" }
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
      selectedObjectId = null;
    } catch (error) {
      projectLoadState = "error";
      projectErrorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function exportObsidian(): Promise<void> {
    if (isDemoMode) {
      exportState = "error";
      exportErrorCode = "AICtxValidationFailed";
      exportMessage = "The public demo viewer is read-only.";
      return;
    }

    if (selectedProjectId === null) {
      exportState = "error";
      exportErrorCode = "AICtxValidationFailed";
      exportMessage = "Select a project before exporting.";
      return;
    }

    exportState = "running";
    exportMessage = "Exporting Obsidian projection.";
    exportErrorCode = "";
    exportFilesWritten = 0;
    exportManifestPath = "";

    try {
      const trimmedOutDir = exportOutDir.trim();
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/export/obsidian?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify(trimmedOutDir === "" ? {} : { outDir: trimmedOutDir })
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

  async function previewContext(): Promise<void> {
    if (selectedProjectId === null) {
      previewState = "error";
      previewErrorCode = "AICtxValidationFailed";
      previewMessage = "Select a project before previewing context.";
      return;
    }

    const task = previewTask.trim();

    if (task === "") {
      previewState = "error";
      previewErrorCode = "AICtxValidationFailed";
      previewMessage = "Enter a task to preview the context an agent would load.";
      return;
    }

    const parsedBudget = parsePreviewTokenBudget(previewTokenBudget);

    if (!parsedBudget.ok) {
      previewState = "error";
      previewErrorCode = "AICtxValidationFailed";
      previewMessage = parsedBudget.message;
      return;
    }

    previewState = "running";
    previewMessage = "Compiling the same context pack an agent would load.";
    previewErrorCode = "";
    copiedPreviewTarget = null;

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/load-preview?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          task,
          mode: previewMode,
          ...(parsedBudget.value === null ? {} : { token_budget: parsedBudget.value })
        })
      });
      const envelope = (await response.json()) as LoadPreviewEnvelope;

      warnings = uniqueSorted([...warnings, ...(envelope.warnings ?? [])]);

      if (!response.ok || !envelope.ok) {
        previewState = "error";
        previewData = null;
        previewErrorCode = envelope.ok ? "" : envelope.error.code;
        previewMessage = envelope.ok
          ? `Viewer load preview request failed with HTTP ${response.status}.`
          : previewErrorMessage(envelope.error.code, envelope.error.message);
        return;
      }

      previewState = "success";
      previewMessage = "Context preview ready.";
      previewData = envelope.data;
    } catch (error) {
      previewState = "error";
      previewData = null;
      previewErrorCode = "AICtxInternalError";
      previewMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function copyPreview(kind: "command" | "context"): Promise<void> {
    const text = kind === "command" ? previewCommand : previewData?.context_pack ?? "";

    if (text === "") {
      return;
    }

    await navigator.clipboard.writeText(text);
    copiedPreviewTarget = kind;
  }

  function selectProject(registryId: string): void {
    selectedProjectId = registryId;
    selectedObjectId = null;
    searchQuery = "";
    layerFilter = "all";
    typeFilter = allOption;
    facetCategoryFilter = allOption;
    statusFilter = allOption;
    tagFilter = allOption;
    pagePreset = "all";
    activeLensName = "project-map";
    exportState = "idle";
    previewState = "idle";
    previewData = null;
    previewMessage = "";
    previewErrorCode = "";
    graphShowInactive = false;
    selectedGraphObjectId = null;
    selectedGraphRelationId = null;
    currentScreen = "memories";
    void loadBootstrap(registryId);
  }

  function selectObject(id: string): void {
    if (selectedObjectId === id) {
      selectedObjectId = null;
      return;
    }

    selectedObjectId = id;
    currentScreen = "memories";
  }

  function showProjects(): void {
    currentScreen = "projects";
  }

  function showMemories(): void {
    currentScreen = selectedProjectId === null ? "projects" : "memories";
  }

  function showGraph(): void {
    if (selectedProjectId === null) {
      showProjects();
      return;
    }

    currentScreen = "graph";
    mobileMenuOpen = false;

    if (selectedGraphObjectId === null) {
      selectedGraphObjectId = preferredGraphObjectId();
    }
  }

  function showExport(): void {
    if (isDemoMode) {
      showMemories();
      return;
    }

    currentScreen = selectedProjectId === null ? "projects" : "export";
  }

  function rankedObjects(memoryObjects: MemoryObjectSummary[]): MemoryObjectSummary[] {
    return [...memoryObjects].sort((left, right) => {
      const leftStatus = isCurrentStatus(left.status) ? 0 : 1;
      const rightStatus = isCurrentStatus(right.status) ? 0 : 1;
      if (leftStatus !== rightStatus) {
        return leftStatus - rightStatus;
      }

      const leftType = OBJECT_TYPES.indexOf(left.type);
      const rightType = OBJECT_TYPES.indexOf(right.type);
      if (leftType !== rightType) {
        return leftType - rightType;
      }

      return left.title.localeCompare(right.title);
    });
  }

  function objectMatchesFilters(object: MemoryObjectSummary): boolean {
    return (
      objectMatchesPagePreset(object, pagePreset) &&
      objectMatchesLayer(object, layerFilter) &&
      optionMatches(typeFilter, object.type) &&
      optionMatches(facetCategoryFilter, object.facets?.category ?? "") &&
      optionMatches(statusFilter, object.status) &&
      (tagFilter === allOption || object.tags.includes(tagFilter)) &&
      objectMatchesSearch(object, searchQuery)
    );
  }

  function objectMatchesPagePreset(object: MemoryObjectSummary, preset: PagePreset): boolean {
    switch (preset) {
      case "all":
        return true;
      case "atomic-memory":
        return object.type !== "source" && object.type !== "synthesis" && isCurrentStatus(object.status);
      case "syntheses":
        return object.type === "synthesis";
      case "sources":
        return object.type === "source";
      case "inactive":
        return object.status === "stale" || object.status === "superseded";
    }
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

  function optionMatches(filter: string, value: string): boolean {
    return filter === allOption || filter === value;
  }

  function isCurrentStatus(status: ObjectStatus): boolean {
    return status === "active" || status === "open";
  }

  function normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  function selectRelated(id: string): void {
    if (objectById.has(id)) {
      searchQuery = "";
      layerFilter = "all";
      typeFilter = allOption;
      facetCategoryFilter = allOption;
      statusFilter = allOption;
      tagFilter = allOption;
      selectedObjectId = id;
      currentScreen = "memories";
    }
  }

  function selectGraphObject(id: string): void {
    if (!objectById.has(id)) {
      return;
    }

    selectedGraphObjectId = id;
    selectedGraphRelationId = null;
    selectedObjectId = id;
  }

  function selectGraphRelation(id: string): void {
    if (!relations.some((relation) => relation.id === id)) {
      return;
    }

    selectedGraphRelationId = id;
    selectedGraphObjectId = null;
  }

  function setGraphShowInactive(showInactive: boolean): void {
    if (graphShowInactive === showInactive) {
      return;
    }

    graphShowInactive = showInactive;
    selectedGraphObjectId = null;
    selectedGraphRelationId = null;
  }

  function preferredGraphObjectId(): string | null {
    if (selectedObjectId !== null && graphVisibleObjectIds.has(selectedObjectId)) {
      return selectedObjectId;
    }

    const degreeById = new Map<string, number>();

    for (const relation of graphRelations) {
      degreeById.set(relation.from, (degreeById.get(relation.from) ?? 0) + 1);
      degreeById.set(relation.to, (degreeById.get(relation.to) ?? 0) + 1);
    }

    return [...graphObjects]
      .sort((left, right) => {
        const degreeComparison = (degreeById.get(right.id) ?? 0) - (degreeById.get(left.id) ?? 0);
        return degreeComparison === 0 ? left.id.localeCompare(right.id) : degreeComparison;
      })[0]?.id ?? null;
  }

  function fitGraph(): void {
    graphInstance?.fit(undefined, 48);
  }

  function zoomGraph(factor: number): void {
    if (graphInstance === null) {
      return;
    }

    const nextZoom = clamp(graphInstance.zoom() * factor, 0.25, 3);

    graphInstance.zoom({
      level: nextZoom,
      renderedPosition: {
        x: graphInstance.width() / 2,
        y: graphInstance.height() / 2
      }
    });
  }

  function resetGraphLayout(): void {
    runGraphLayout(true);
  }

  function focusGraphSelection(): void {
    if (selectedGraphObjectId !== null) {
      focusGraphNode(selectedGraphObjectId, true);
      return;
    }

    if (selectedGraphRelationId !== null) {
      focusGraphEdge(selectedGraphRelationId, true);
    }
  }

  function clearPagePreset(): void {
    pagePreset = "all";
  }

  function relationsForObject(id: string): MemoryRelationSummary[] {
    return relations
      .filter((relation) => relation.from === id || relation.to === id)
      .sort(compareRelations);
  }

  function buildGraphElements(
    memoryObjects: MemoryObjectSummary[],
    relationList: MemoryRelationSummary[]
  ): cytoscape.ElementDefinition[] {
    const degreeById = new Map<string, number>();

    for (const relation of relationList) {
      degreeById.set(relation.from, (degreeById.get(relation.from) ?? 0) + 1);
      degreeById.set(relation.to, (degreeById.get(relation.to) ?? 0) + 1);
    }

    return [
      ...memoryObjects.map((object) => ({
        group: "nodes" as const,
        data: {
          id: object.id,
          label: object.title,
          type: object.type,
          status: object.status,
          color: graphObjectColor(object),
          borderColor: graphObjectBorderColor(object),
          size: 28 + Math.min(degreeById.get(object.id) ?? 0, 8) * 3
        }
      })),
      ...relationList.map((relation) => ({
        group: "edges" as const,
        data: {
          id: relation.id,
          source: relation.from,
          target: relation.to,
          predicate: relation.predicate,
          status: relation.status,
          color: graphRelationColor(relation),
          width: relation.status === "active" ? 1.8 : 1
        }
      }))
    ];
  }

  function renderGraph(elements: cytoscape.ElementDefinition[]): void {
    if (graphContainer === null) {
      return;
    }

    if (graphInstance === null) {
      graphInstance = cytoscape({
        container: graphContainer,
        elements,
        style: graphStyles,
        layout: graphLayoutOptions(true),
        minZoom: 0.25,
        maxZoom: 3,
        boxSelectionEnabled: false
      });
      graphInstance.on("tap", "node", (event: cytoscape.EventObject) => {
        selectGraphObject(event.target.id());
      });
      graphInstance.on("tap", "edge", (event: cytoscape.EventObject) => {
        selectGraphRelation(event.target.id());
      });
      graphInstance.on("tap", (event: cytoscape.EventObject) => {
        if (event.target === graphInstance) {
          selectedGraphObjectId = null;
          selectedGraphRelationId = null;
        }
      });
      return;
    }

    graphInstance.batch(() => {
      graphInstance?.elements().remove();
      graphInstance?.add(elements);
    });
    runGraphLayout(true);
  }

  function destroyGraph(): void {
    graphInstance?.destroy();
    graphInstance = null;
  }

  function graphLayoutOptions(fit: boolean): cytoscape.LayoutOptions {
    return {
      name: "cose",
      animate: false,
      componentSpacing: 92,
      edgeElasticity: 90,
      fit,
      gravity: 0.24,
      idealEdgeLength: 92,
      nodeOverlap: 18,
      nodeRepulsion: 6200,
      numIter: 900,
      padding: 48,
      randomize: true
    };
  }

  function runGraphLayout(fit: boolean): void {
    if (graphInstance === null) {
      return;
    }

    graphInstance.layout(graphLayoutOptions(fit)).run();
  }

  function applyGraphSelection(): void {
    if (graphInstance === null) {
      return;
    }

    graphInstance.elements().removeClass("graph-selected graph-neighbor graph-faded");

    if (selectedGraphObjectId !== null) {
      const node = graphInstance.getElementById(selectedGraphObjectId);

      if (node.nonempty()) {
        const neighborhood = node.closedNeighborhood();
        node.addClass("graph-selected");
        neighborhood.addClass("graph-neighbor");
        graphInstance.elements().difference(neighborhood).addClass("graph-faded");
      }
      return;
    }

    if (selectedGraphRelationId !== null) {
      const edge = graphInstance.getElementById(selectedGraphRelationId);

      if (edge.nonempty()) {
        const neighborhood = edge.connectedNodes().union(edge);
        edge.addClass("graph-selected");
        neighborhood.addClass("graph-neighbor");
        graphInstance.elements().difference(neighborhood).addClass("graph-faded");
      }
    }
  }

  function focusGraphNode(id: string, animate: boolean): void {
    if (graphInstance === null) {
      return;
    }

    const node = graphInstance.getElementById(id);

    if (node.nonempty()) {
      graphInstance.animate({
        center: { eles: node },
        duration: animate ? 260 : 0,
        zoom: Math.max(graphInstance.zoom(), 1.12)
      });
    }
  }

  function focusGraphEdge(id: string, animate: boolean): void {
    if (graphInstance === null) {
      return;
    }

    const edge = graphInstance.getElementById(id);

    if (edge.nonempty()) {
      graphInstance.animate({
        center: { eles: edge.connectedNodes() },
        duration: animate ? 260 : 0,
        zoom: Math.max(graphInstance.zoom(), 1.04)
      });
    }
  }

  function graphObjectColor(object: MemoryObjectSummary): string {
    if (!isCurrentStatus(object.status)) {
      return "#c7c1b8";
    }

    switch (object.type) {
      case "project":
        return "#2f5d62";
      case "architecture":
        return "#8b5e34";
      case "synthesis":
        return "#574b90";
      case "decision":
        return "#9a5b23";
      case "constraint":
        return "#8e3b46";
      case "question":
        return "#5f6c37";
      case "fact":
        return "#356b4f";
      case "workflow":
        return "#3f648c";
      case "gotcha":
        return "#b54708";
      case "source":
        return "#6b6f76";
      case "concept":
        return "#7a5c99";
      case "note":
        return "#6f6259";
      default:
        return "#5f6b65";
    }
  }

  function graphObjectBorderColor(object: MemoryObjectSummary): string {
    if (object.type === "source") {
      return "#9a968d";
    }

    return isCurrentStatus(object.status) ? "#fffefa" : "#8f8a81";
  }

  function graphRelationColor(relation: MemoryRelationSummary): string {
    if (relation.status !== "active") {
      return "#b9b2a8";
    }

    switch (relation.predicate) {
      case "requires":
      case "depends_on":
        return "#5b6f95";
      case "supersedes":
      case "conflicts_with":
        return "#a14a3d";
      case "derived_from":
      case "summarizes":
      case "documents":
        return "#6b637d";
      case "implements":
        return "#4d745b";
      default:
        return "#78736b";
    }
  }

  function pageFilter(section: string): void {
    currentScreen = "memories";
    mobileMenuOpen = false;
    searchQuery = "";
    typeFilter = allOption;
    facetCategoryFilter = allOption;
    statusFilter = allOption;
    tagFilter = allOption;
    pagePreset = section as PagePreset;

    switch (section) {
      case "overview":
        pagePreset = "all";
        layerFilter = "all";
        break;
      case "atomic-memory":
        layerFilter = "memories";
        break;
      case "syntheses":
        layerFilter = "syntheses";
        break;
      case "sources":
        layerFilter = "sources";
        break;
      case "inactive":
        layerFilter = "inactive";
        break;
      default:
        pagePreset = "all";
        layerFilter = "all";
    }
  }

  function buildMemorySections(memoryObjects: MemoryObjectSummary[]): MemorySection[] {
    return OBJECT_TYPES
      .map((type) => ({
        id: `type-${type}`,
        title: objectTypeLabel(type),
        icon: objectTypeGlyph(type),
        objects: rankedObjects(memoryObjects.filter((object) => object.type === type))
      }))
      .filter((section) => section.objects.length > 0);
  }

  function buildMemorySnapshot(
    memoryObjects: MemoryObjectSummary[],
    relationList: MemoryRelationSummary[]
  ): MemorySnapshotItem[] {
    const reusableCount = memoryObjects.filter((object) =>
      object.type !== "source" && object.type !== "synthesis" && isCurrentStatus(object.status)
    ).length;
    const memoryFacetCategoryCount = uniqueSorted(
      memoryObjects.flatMap((object) => object.facets?.category === undefined ? [] : [object.facets.category])
    ).length;
    const sourceCount = memoryObjects.filter((object) => object.type === "source").length;
    const activeRelationCount = relationList.filter((relation) => relation.status === "active").length;

    return [
      {
        label: "Active objects",
        value: String(reusableCount),
        detail: "canonical non-source records agents can load"
      },
      {
        label: "Facet categories",
        value: String(memoryFacetCategoryCount),
        detail: "typed durable categories represented in storage"
      },
      {
        label: "Provenance trail",
        value: `${sourceCount}/${activeRelationCount}`,
        detail: "source records / active memory links"
      }
    ];
  }

  function bodyPreview(object: MemoryObjectSummary): string {
    const text = object.body
      .replace(/^#+\s+/gm, "")
      .replace(/[`*_>#-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return text.length > 190 ? `${text.slice(0, 187)}...` : text;
  }

  function objectIcon(object: MemoryObjectSummary): string {
    return objectTypeGlyph(object.type);
  }

  function objectTypeGlyph(type: ObjectType): string {
    switch (type) {
      case "project":
        return "P";
      case "architecture":
        return "A";
      case "synthesis":
        return "S";
      case "decision":
        return "D";
      case "constraint":
        return "C";
      case "question":
        return "?";
      case "fact":
        return "F";
      case "workflow":
        return "W";
      case "gotcha":
        return "!";
      case "source":
        return "R";
      case "concept":
        return "K";
      case "note":
        return "N";
      default:
        return "•";
    }
  }

  function objectTypeLabel(type: ObjectType): string {
    return `${type} objects`;
  }

  function facetCategoryLabel(object: MemoryObjectSummary): string {
    return object.facets?.category ?? "no facet category";
  }

  function scopeLabel(scope: Scope): string {
    if (scope.kind === "branch") {
      return `branch:${scope.branch ?? "unknown"}`;
    }

    if (scope.kind === "task") {
      return `task:${scope.task ?? "unknown"}`;
    }

    return "project";
  }

  function emptyRoleCoverage(): RoleCoverageData {
    return {
      roles: [],
      counts: {
        populated: 0,
        thin: 0,
        missing: 0,
        stale: 0,
        conflicted: 0
      }
    };
  }

  function roleStatusClass(status: RoleCoverageStatus): string {
    return `status-${status}`;
  }

  function relationCounterpart(relation: MemoryRelationSummary, objectId: string): string {
    return relation.from === objectId ? relation.to : relation.from;
  }

  function relationObject(relation: MemoryRelationSummary, objectId: string): MemoryObjectSummary | null {
    return objectById.get(relationCounterpart(relation, objectId)) ?? null;
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

  function parsePreviewTokenBudget(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
    const trimmed = raw.trim();

    if (trimmed === "") {
      return { ok: true, value: null };
    }

    const value = Number(trimmed);

    if (!Number.isSafeInteger(value) || value <= 500) {
      return { ok: false, message: "Token budget must be an integer greater than 500." };
    }

    return { ok: true, value };
  }

  function previewErrorMessage(code: string, message: string): string {
    if (code === "AICtxIndexUnavailable") {
      return `${code}: ${message} Run aictx rebuild, then preview again.`;
    }

    return `${code}: ${message}`;
  }

  function buildPreviewCommand(task: string, mode: LoadMemoryMode, tokenBudget: string): string {
    const parts = ["aictx", "load", shellQuote(task.trim())];

    if (mode !== "coding") {
      parts.push("--mode", mode);
    }

    const parsedBudget = parsePreviewTokenBudget(tokenBudget);

    if (parsedBudget.ok && parsedBudget.value !== null) {
      parts.push("--token-budget", String(parsedBudget.value));
    }

    return parts.join(" ");
  }

  function shellQuote(value: string): string {
    return `"${value.replace(/["\\$`]/g, "\\$&")}"`;
  }

  function previewSourceLabel(source: LoadMemorySource): string {
    if (!source.git_available) {
      return `${source.project}, Git unavailable`;
    }

    return `${source.project}, ${source.branch ?? "detached HEAD"}@${source.commit ?? "unknown commit"}`;
  }

  function gitLabel(project: ViewerProjectSummary): string {
    if (!project.available) {
      return "Unavailable";
    }

    if (project.git === null || !project.git.available) {
      return "No Git";
    }

    if (project.git.dirty === true) {
      return "Uncommitted memory";
    }

    if (project.git.dirty === false) {
      return "Committed memory";
    }

    return "Git available";
  }

  function gitDescription(project: ViewerProjectSummary): string {
    if (!project.available) {
      return "This registered memory root is unavailable.";
    }

    if (project.git === null || !project.git.available) {
      return "Git status is unavailable for this memory root.";
    }

    if (project.git.dirty === true) {
      return "There are uncommitted changes under this memory root. Use aictx diff or Git before treating it as committed team state.";
    }

    if (project.git.dirty === false) {
      return "The memory root has no uncommitted Git changes.";
    }

    return "Git is available, but dirty state is unknown.";
  }

  function countLabel(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
      /^# .+\n\nProject-level memory for .+\.$/.test(normalizeBody(projectObject.body)) &&
      normalizeBody(architectureObject.body) ===
        "# Current Architecture\n\nArchitecture memory starts here."
    );
  }

  function normalizeBody(body: string): string {
    return body.replace(/\r\n?/g, "\n").trim();
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
</script>

<main class="viewer-shell" aria-labelledby="viewer-title">
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
    <aside class="sidebar" aria-label="Viewer navigation">
      <div class="brand">
        <div class="brand-row">
          <span class="book-icon" aria-hidden="true">A</span>
          <h1 id="viewer-title">Memory Schema</h1>
          <button
            type="button"
            class="mobile-menu-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="viewer-mobile-menu"
            onclick={() => {
              mobileMenuOpen = !mobileMenuOpen;
            }}
          >
            {mobileMenuOpen ? "Close menu" : "Menu"}
          </button>
        </div>
        <p>{selectedProject?.project.name ?? "No project selected"} · {selectedProject?.project.id ?? "local memory"}</p>
      </div>

      <div id="viewer-mobile-menu" class="sidebar-menu" class:open={mobileMenuOpen}>
        {#if bootstrap !== null}
          <dl class="sidebar-stats" aria-label="Memory schema stats">
            <div><dt>{activeMemoryCount}</dt><dd>active</dd></div>
            <div><dt>{relations.length}</dt><dd>links</dd></div>
            <div><dt>{facetCategoryCount}</dt><dd>facets</dd></div>
            <div><dt>{staleMemoryCount}</dt><dd>stale</dd></div>
          </dl>
        {/if}

        <label class="sidebar-search">
          <span>Search storage</span>
          <input
            type="search"
            bind:value={searchQuery}
            placeholder="oauth, schema, cron..."
            autocomplete="off"
            data-testid="viewer-search"
          />
        </label>

        <nav class="nav-list" aria-label="Memory schema views">
          <section class="nav-section" aria-labelledby="workspace-pages-heading">
            <p class="nav-heading" id="workspace-pages-heading">Workspace</p>
            <button
              type="button"
              class:active={currentScreen === "projects"}
              aria-current={currentScreen === "projects" ? "page" : undefined}
              data-testid="nav-projects"
              onclick={showProjects}
            >
              <span class="nav-row-icon" aria-hidden="true">⌂</span>
              <span>Projects</span>
            </button>
            <button
              type="button"
              class:active={currentScreen === "memories" || currentScreen === "detail"}
              aria-current={currentScreen === "memories" || currentScreen === "detail" ? "page" : undefined}
              data-testid="nav-memories"
              disabled={selectedProjectId === null}
              onclick={showMemories}
            >
              <span class="nav-row-icon" aria-hidden="true">#</span>
              <span>Schema Browser</span>
            </button>
            <button
              type="button"
              class:active={currentScreen === "graph"}
              aria-current={currentScreen === "graph" ? "page" : undefined}
              data-testid="nav-graph"
              disabled={selectedProjectId === null}
              onclick={showGraph}
            >
              <span class="nav-row-icon" aria-hidden="true">◎</span>
              <span>Graph</span>
            </button>
            {#if !isDemoMode}
              <button
                type="button"
                class:active={currentScreen === "export"}
                aria-current={currentScreen === "export" ? "page" : undefined}
                data-testid="nav-export"
                disabled={selectedProjectId === null}
                onclick={showExport}
              >
                <span class="nav-row-icon" aria-hidden="true">↗</span>
                <span>Export</span>
              </button>
            {/if}
          </section>

          <section class="nav-section" aria-labelledby="memory-views-heading">
            <p class="nav-heading" id="memory-views-heading">Schema views</p>
            <button type="button" class:active={pagePreset === "all"} onclick={() => pageFilter("overview")}>
              <span class="nav-row-icon" aria-hidden="true">≡</span>
              <span>All objects</span>
            </button>
            <button type="button" class:active={pagePreset === "atomic-memory"} onclick={() => pageFilter("atomic-memory")}>
              <span class="nav-row-icon" aria-hidden="true">#</span>
              <span>Atomic memory</span>
            </button>
            <button type="button" class:active={pagePreset === "syntheses"} onclick={() => pageFilter("syntheses")}>
              <span class="nav-row-icon" aria-hidden="true">S</span>
              <span>Syntheses</span>
            </button>
            <button type="button" class:active={pagePreset === "sources"} onclick={() => pageFilter("sources")}>
              <span class="nav-row-icon" aria-hidden="true">R</span>
              <span>Sources</span>
            </button>
            <button type="button" class:active={pagePreset === "inactive"} onclick={() => pageFilter("inactive")}>
              <span class="nav-row-icon" aria-hidden="true">!</span>
              <span>Inactive</span>
            </button>
          </section>
        </nav>

        {#if !isDemoMode}
          <details class="sidebar-export">
            <summary>Obsidian export</summary>
            <button
              type="button"
              onclick={() => window.print()}
            >
              Print/PDF
            </button>
            <label class="obsidian-field">
              <span>Obsidian vault</span>
              <input
                type="text"
                bind:value={exportOutDir}
                placeholder=".aictx/exports/obsidian"
                autocomplete="off"
              />
            </label>
            <button
              type="button"
              disabled={exportState === "running" || selectedProjectId === null}
              onclick={() => void exportObsidian()}
            >
              {exportState === "running" ? "Exporting" : "Export Obsidian"}
            </button>
          </details>
        {/if}
      </div>
    </aside>

    <section class="main-stage" aria-label="Read-only memory browser">
      {#if currentScreen === "projects"}
        <section class="projects-page" aria-labelledby="projects-title" data-testid="projects-view">
          <header class="page-header">
            <p class="eyebrow">Registered memory roots</p>
            <h2 id="projects-title">Projects</h2>
            <p>{countLabel(projects.length, "registered project", "registered projects")}</p>
          </header>

          <div class="project-grid" data-testid="project-list">
            {#each projects as project (project.registry_id)}
              <article
                class:unavailable={!project.available}
                class:current={project.current}
                class="project-card"
                data-testid={`project-card-${project.registry_id}`}
              >
                <div class="card-topline">
                  <span>{project.current ? "Current" : project.source}</span>
                  <strong>{gitLabel(project)}</strong>
                </div>
                <h3>{project.project.name}</h3>
                <p class="mono">{project.project.id}</p>
                <p class="path">{project.project_root}</p>
                <dl class="mini-stats">
                  <div><dt>Memories</dt><dd>{project.counts?.objects ?? 0}</dd></div>
                  <div><dt>Relations</dt><dd>{project.counts?.relations ?? 0}</dd></div>
                  <div><dt>Syntheses</dt><dd>{project.counts?.synthesis_objects ?? 0}</dd></div>
                </dl>
                {#if project.warnings.length > 0}
                  <p class="warning-copy">{project.warnings[0]}</p>
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
            {:else}
              <section class="empty-panel" data-testid="empty-projects">
                <h3>No projects registered</h3>
                <p>Run <code>aictx projects add</code> inside an initialized project.</p>
                <p class="mono">{projectsData.registry_path}</p>
              </section>
            {/each}
          </div>
        </section>
      {:else if projectLoadState === "error"}
        <section class="system-panel error-panel" role="alert" data-testid="project-load-error">
          <p class="eyebrow">Aictx local viewer</p>
          <h2>Project failed to load</h2>
          <p>{projectErrorMessage}</p>
          <button type="button" class="ghost-action" onclick={showProjects}>Back to projects</button>
        </section>
      {:else if projectLoadState === "loading" || bootstrap === null}
        <section class="system-panel" aria-live="polite" data-testid="project-loading">
          <p class="eyebrow">Aictx local viewer</p>
          <h2>Loading project</h2>
          <p>{selectedProject?.project.name ?? "Selected project"}</p>
        </section>
      {:else if currentScreen === "graph"}
        <article class="graph-page" aria-labelledby="graph-title" data-testid="graph-view">
          <header class="page-header compact">
            <div>
              <p class="eyebrow">Relation map</p>
              <h2 id="graph-title">Graph</h2>
            </div>
            <dl class="graph-counts" aria-label="Visible graph counts">
              <div><dt>Nodes</dt><dd data-testid="graph-node-count">{graphObjects.length}</dd></div>
              <div><dt>Links</dt><dd data-testid="graph-relation-count">{graphRelations.length}</dd></div>
            </dl>
          </header>

          <section class="graph-panel">
            <div class="graph-toolbar" aria-label="Graph controls">
              <div class="graph-filter-tabs" role="group" aria-label="Graph item scope">
                <button
                  type="button"
                  class:active={!graphShowInactive}
                  onclick={() => setGraphShowInactive(false)}
                  data-testid="graph-filter-current"
                >
                  Current
                </button>
                <button
                  type="button"
                  class:active={graphShowInactive}
                  onclick={() => setGraphShowInactive(true)}
                  data-testid="graph-filter-all"
                >
                  All
                </button>
              </div>
              <div class="graph-actions">
                <button type="button" onclick={() => zoomGraph(1.18)} data-testid="graph-zoom-in">Zoom in</button>
                <button type="button" onclick={() => zoomGraph(0.84)} data-testid="graph-zoom-out">Zoom out</button>
                <button type="button" onclick={fitGraph} data-testid="graph-fit">Fit</button>
                <button type="button" onclick={resetGraphLayout} data-testid="graph-reset-layout">Reset layout</button>
                <button
                  type="button"
                  disabled={selectedGraphObject === null && selectedGraphRelation === null}
                  onclick={focusGraphSelection}
                  data-testid="graph-focus-selected"
                >
                  Focus
                </button>
              </div>
            </div>

            <section class="graph-workspace">
              <div class="graph-canvas-wrap">
                <div
                  class="graph-canvas"
                  bind:this={graphContainer}
                  aria-label="Memory relation graph"
                  data-testid="relation-graph"
                ></div>
                {#if graphObjects.length === 0}
                  <div class="graph-empty" data-testid="graph-empty">
                    <h3>No visible graph nodes</h3>
                    <p>Clear search or show all memory.</p>
                  </div>
                {/if}
              </div>

              <aside class="graph-inspector" aria-label="Graph selection" data-testid="graph-inspector">
                {#if selectedGraphObject !== null}
                  <section>
                    <p class="eyebrow">Selected object</p>
                    <h3>{selectedGraphObject.title}</h3>
                    <p class="mono">{selectedGraphObject.id}</p>
                    <dl class="graph-meta">
                      <div><dt>Type</dt><dd>{selectedGraphObject.type}</dd></div>
                      <div><dt>Status</dt><dd>{selectedGraphObject.status}</dd></div>
                      <div><dt>Facet</dt><dd>{facetCategoryLabel(selectedGraphObject)}</dd></div>
                      <div><dt>Relations</dt><dd>{relationsForObject(selectedGraphObject.id).length}</dd></div>
                    </dl>
                    <p class="graph-body-preview">{bodyPreview(selectedGraphObject)}</p>
                    <div class="graph-inspector-actions">
                      <button type="button" onclick={() => selectRelated(selectedGraphObject.id)}>
                        Open in schema browser
                      </button>
                      <button type="button" onclick={focusGraphSelection}>Focus node</button>
                    </div>
                    <details class="graph-relations" open>
                      <summary>Direct relations</summary>
                      <ul class="relation-list">
                        {#each graphRelations.filter((relation) => relation.from === selectedGraphObject.id || relation.to === selectedGraphObject.id) as relation (relation.id)}
                          <li>
                            <span class="pill">{relation.predicate}</span>
                            <button type="button" onclick={() => selectGraphRelation(relation.id)}>
                              {relationTargetLabel(relation, selectedGraphObject.id)}
                            </button>
                            <small>{relationStatusLabel(relation)}</small>
                          </li>
                        {:else}
                          <li class="empty-copy">No visible related memories.</li>
                        {/each}
                      </ul>
                    </details>
                  </section>
                {:else if selectedGraphRelation !== null}
                  <section>
                    <p class="eyebrow">Selected relation</p>
                    <h3>{selectedGraphRelation.predicate}</h3>
                    <p class="mono">{selectedGraphRelation.id}</p>
                    <dl class="graph-meta">
                      <div><dt>Status</dt><dd>{selectedGraphRelation.status}</dd></div>
                      <div><dt>Confidence</dt><dd>{selectedGraphRelation.confidence ?? "not set"}</dd></div>
                      <div><dt>Source</dt><dd>{selectedGraphRelationSource?.title ?? selectedGraphRelation.from}</dd></div>
                      <div><dt>Target</dt><dd>{selectedGraphRelationTarget?.title ?? selectedGraphRelation.to}</dd></div>
                    </dl>
                    <div class="graph-inspector-actions">
                      <button type="button" onclick={() => selectGraphObject(selectedGraphRelation.from)}>
                        Source node
                      </button>
                      <button type="button" onclick={() => selectGraphObject(selectedGraphRelation.to)}>
                        Target node
                      </button>
                      <button type="button" onclick={focusGraphSelection}>Focus link</button>
                    </div>
                  </section>
                {:else}
                  <section class="graph-empty-selection">
                    <p class="eyebrow">Selection</p>
                    <h3>{graphObjects.length} visible objects</h3>
                    <p>{graphRelations.length} visible relation links.</p>
                  </section>
                {/if}
              </aside>
            </section>
          </section>
        </article>
      {:else if currentScreen === "export" && !isDemoMode}
        <section class="export-page" aria-labelledby="export-title" data-testid="export-view">
          <header class="page-header compact">
            <p class="eyebrow">Generated projection</p>
            <h2 id="export-title">Obsidian Export</h2>
            <p>Write the current project memory into a linked vault-shaped projection.</p>
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
              {exportState === "running" ? "Exporting" : "Export Obsidian"}
            </button>
            {#if exportState !== "idle"}
              <section
                class:error={exportState === "error"}
                class:success={exportState === "success"}
                class="export-status"
                role={exportState === "error" ? "alert" : "status"}
                aria-live="polite"
                data-testid="obsidian-export-status"
              >
                <p>{exportMessage}</p>
                {#if exportState === "error" && exportErrorCode !== ""}
                  <p class="mono">{exportErrorCode}</p>
                {/if}
                {#if exportState === "success"}
                  <dl class="mini-stats">
                    <div><dt>Files written</dt><dd data-testid="obsidian-export-files-written">{exportFilesWritten}</dd></div>
                    <div><dt>Manifest</dt><dd data-testid="obsidian-export-manifest-path">{exportManifestPath}</dd></div>
                  </dl>
                {/if}
              </section>
            {/if}
          </form>
        </section>
      {:else}
        <article class="memory-page" aria-labelledby="memory-list-title" data-testid="memory-list-view">
          <header class="doc-hero">
            <span class="doc-icon" aria-hidden="true">A</span>
            <p class="eyebrow">Canonical Aictx storage</p>
            <h2 id="memory-list-title">{bootstrap.project.name} Memory Schema</h2>
            <p>
              Browse the real object types, facet categories, statuses, scopes, evidence, and relations
              saved in this project's local memory database.
            </p>
          </header>

          <section class="memory-summary" aria-label="Project memory summary">
            <div class="summary-check" aria-hidden="true">✓</div>
            <div class="summary-copy">
              <strong>Schema projection loaded</strong>
              <p>
                {objects.length} objects are grouped by canonical type with {facetCategoryCount} facet categories
                and {relations.length} stored relation links.
              </p>
              <p class="trust-copy">
                <span>{trustLabel}</span> {trustDescription}
              </p>
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
            <section class="onboarding-callout" aria-label="Starter memory notice" data-testid="starter-memory-notice">
              <p><strong>Starter memory only.</strong> Seed useful repo memory with a bootstrap patch, then refresh the viewer.</p>
              <code>aictx suggest --bootstrap --patch &gt; bootstrap-memory.json</code>
              <code>aictx save --file bootstrap-memory.json</code>
            </section>
          {/if}

          <section class="list-controls" aria-label="Memory list controls">
            <div>
              <strong>Canonical objects</strong>
              <span>{filteredObjects.length} rows</span>
            </div>
            <div class="controls-row">
              <div class="layer-tabs" role="group" aria-label="Memory layers">
                {#each layerOptions as option (option.value)}
                  <button
                      type="button"
                      class:active={layerFilter === option.value}
                      onclick={() => {
                      clearPagePreset();
                      layerFilter = option.value;
                    }}
                    data-testid={`viewer-layer-${option.value}`}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
              <select bind:value={typeFilter} onchange={clearPagePreset} data-testid="viewer-type-filter" aria-label="Type">
                <option value={allOption}>All types</option>
                {#each typeOptions as type (type)}
                  <option value={type}>{type}</option>
                {/each}
              </select>
              <select bind:value={facetCategoryFilter} onchange={clearPagePreset} data-testid="viewer-facet-filter" aria-label="Facet category">
                <option value={allOption}>All facets</option>
                {#each facetCategoryOptions as category (category)}
                  <option value={category}>{category}</option>
                {/each}
              </select>
              <select bind:value={statusFilter} onchange={clearPagePreset} data-testid="viewer-status-filter" aria-label="Status">
                <option value={allOption}>All statuses</option>
                {#each statusOptions as status (status)}
                  <option value={status}>{status}</option>
                {/each}
              </select>
              <select bind:value={tagFilter} onchange={clearPagePreset} data-testid="viewer-tag-filter" aria-label="Tag">
                <option value={allOption}>All tags</option>
                {#each tagOptions as tag (tag)}
                  <option value={tag}>{tag}</option>
                {/each}
              </select>
            </div>
          </section>

          <section class="memory-workspace" class:has-preview={selectedObject !== null}>
            <section class="sectioned-memory" aria-label="Memory objects">
              {#each memorySections as section (section.id)}
                <section id={section.id}>
                  <h3><span class="section-icon" aria-hidden="true">{section.icon}</span>{section.title}</h3>
                  <p>{countLabel(section.objects.length, "matching memory", "matching memories")}</p>
                  <div class="object-list">
                    {#each section.objects as object (object.id)}
                      <button
                        type="button"
                        class:selected={selectedObject?.id === object.id}
                        onclick={() => selectObject(object.id)}
                        data-testid={`object-row-${object.id}`}
                      >
                        <span class="object-glyph">{objectIcon(object)}</span>
                        <span>
                          <strong>{object.title}</strong>
                          <span class="object-meta" data-testid={`object-meta-${object.id}`}>
                            <span>{object.type}</span>
                            <span>{object.status}</span>
                            <span>{facetCategoryLabel(object)}</span>
                            <span>{scopeLabel(object.scope)}</span>
                          </span>
                          <small>{bodyPreview(object)}</small>
                        </span>
                        <em aria-hidden="true">{selectedObject?.id === object.id ? "⌄" : "Open"}</em>
                      </button>
                      {#if selectedObject?.id === object.id}
                        <article class="memory-preview" aria-label={selectedObject.title} data-testid="selected-object">
                          <dl class="notion-properties">
                            <div><dt>Name</dt><dd>{selectedObject.title}</dd></div>
                            <div><dt>ID</dt><dd class="mono">{selectedObject.id}</dd></div>
                            <div><dt>Type</dt><dd>{selectedObject.type}</dd></div>
                            <div><dt>Facet</dt><dd>{facetCategoryLabel(selectedObject)}</dd></div>
                            <div><dt>Status</dt><dd>{selectedObject.status}</dd></div>
                            <div><dt>Scope</dt><dd>{scopeLabel(selectedObject.scope)}</dd></div>
                            <div><dt>Evidence</dt><dd>{selectedObject.evidence.length}</dd></div>
                            <div><dt>Relations</dt><dd>{directRelations.length}</dd></div>
                            <div><dt>Updated</dt><dd>{selectedObject.updated_at}</dd></div>
                          </dl>

                          <div class="notion-toggle-list">
                            <details class="notion-toggle" open>
                              <summary>Memory</summary>
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
                            </details>

                            {#if selectedObject.tags.length > 0}
                              <details class="notion-toggle" open>
                                <summary>Tags</summary>
                                <ul class="tag-list" aria-label="Tags">
                                  {#each selectedObject.tags as tag (tag)}
                                    <li>{tag}</li>
                                  {/each}
                                </ul>
                              </details>
                            {/if}

                            <details class="notion-toggle" open data-testid="facet-details">
                              <summary>Facet category</summary>
                              {#if selectedObject.facets === null}
                                <p class="empty-copy">No facets saved on this object.</p>
                              {:else}
                                <dl class="facet-grid">
                                  <div><dt>Category</dt><dd>{selectedObject.facets.category}</dd></div>
                                  <div><dt>Applies to</dt><dd>{selectedObject.facets.applies_to?.join(", ") || "global"}</dd></div>
                                  <div><dt>Load modes</dt><dd>{selectedObject.facets.load_modes?.join(", ") || "all modes"}</dd></div>
                                </dl>
                              {/if}
                            </details>

                            <details class="notion-toggle" open data-testid="provenance-links">
                              <summary>Provenance</summary>
                              <ul class="relation-list">
                                {#each selectedObject.evidence as evidence (`${evidence.kind}-${evidence.id}`)}
                                  <li>
                                    <span class="pill">{evidence.kind}</span>
                                    {#if objectById.has(evidence.id)}
                                      <button type="button" onclick={() => selectRelated(evidence.id)}>
                                        {objectById.get(evidence.id)?.title ?? evidence.id}
                                      </button>
                                    {:else}
                                      <code>{evidence.id}</code>
                                    {/if}
                                  </li>
                                {:else}
                                  <li class="empty-copy">No evidence links.</li>
                                {/each}
                                {#each directRelations.filter((relation) => ["derived_from", "summarizes", "documents"].includes(relation.predicate)) as relation (relation.id)}
                                  <li>
                                    <span class="pill">{relation.predicate}</span>
                                    <button type="button" onclick={() => selectRelated(relationCounterpart(relation, selectedObject.id))}>
                                      {relationTargetLabel(relation, selectedObject.id)}
                                    </button>
                                  </li>
                                {/each}
                              </ul>
                            </details>

                            <details class="notion-toggle" open>
                              <summary>Direct relations</summary>
                              <section class="relation-columns">
                                <div>
                                  <p class="eyebrow">Outgoing</p>
                                  <ul class="relation-list" data-testid="outgoing-relations">
                                    {#each outgoingRelations as relation (relation.id)}
                                      <li data-testid={`relation-card-${relation.id}`}>
                                        <span class="pill">{relation.predicate}</span>
                                        <button type="button" onclick={() => selectRelated(relation.to)}>
                                          {relationTargetLabel(relation, selectedObject.id)}
                                        </button>
                                        <small>{relationStatusLabel(relation)}</small>
                                      </li>
                                    {:else}
                                      <li class="empty-copy">No outgoing related memories.</li>
                                    {/each}
                                  </ul>
                                </div>

                                <div>
                                  <p class="eyebrow">Incoming</p>
                                  <ul class="relation-list" data-testid="incoming-relations">
                                    {#each incomingRelations as relation (relation.id)}
                                      <li data-testid={`relation-card-${relation.id}`}>
                                        <span class="pill">{relation.predicate}</span>
                                        <button type="button" onclick={() => selectRelated(relation.from)}>
                                          {relationTargetLabel(relation, selectedObject.id)}
                                        </button>
                                        <small>{relationStatusLabel(relation)}</small>
                                      </li>
                                    {:else}
                                      <li class="empty-copy">No incoming related memories.</li>
                                    {/each}
                                  </ul>
                                </div>
                              </section>
                            </details>

                            <details class="notion-toggle technical-details" data-testid="technical-details">
                              <summary>Technical details</summary>
                              <dl>
                                <div><dt>Body</dt><dd>{selectedObject.body_path}</dd></div>
                                <div><dt>Sidecar</dt><dd>{selectedObject.json_path}</dd></div>
                                <div><dt>Scope</dt><dd>{selectedObject.scope.kind}</dd></div>
                                <div><dt>Updated</dt><dd>{selectedObject.updated_at}</dd></div>
                              </dl>
                              <section class="json-view" aria-label="Object sidecar JSON" data-testid="json-view">
                                <pre>{selectedJson}</pre>
                              </section>
                            </details>
                          </div>
                        </article>
                      {/if}
                    {/each}
                  </div>
                </section>
              {/each}
            </section>
          </section>
        </article>
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
    color: #182230;
    background: #f6f7f4;
    font-family:
      Inter, "Avenir Next", "Segoe UI", ui-sans-serif, system-ui, -apple-system,
      BlinkMacSystemFont, sans-serif;
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
    opacity: 0.58;
  }

  h1,
  h2,
  h3,
  h4,
  p {
    margin-top: 0;
  }

  h1,
  h2,
  h3,
  h4 {
    color: #101828;
    letter-spacing: 0;
  }

  h1 {
    margin-bottom: 0;
    font-size: 1.35rem;
    line-height: 1.1;
  }

  h2 {
    margin-bottom: 0;
    font-size: 2rem;
    line-height: 1.08;
  }

  h3 {
    margin-bottom: 0;
    font-size: 1.2rem;
    line-height: 1.2;
  }

  code,
  pre,
  .mono,
  .path {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  .viewer-shell {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    min-height: 100vh;
  }

  .sidebar {
    position: sticky;
    top: 0;
    display: flex;
    height: 100vh;
    flex-direction: column;
    gap: 20px;
    border-right: 1px solid #d8ded8;
    padding: 22px 18px;
    background: #fbfcfa;
  }

  .brand {
    display: grid;
    gap: 8px;
  }

  .brand p:last-child {
    margin: 0;
    color: #52605b;
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .eyebrow {
    margin: 0;
    color: #667085;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .nav-list {
    display: grid;
    gap: 8px;
  }

  .nav-list button,
  .ghost-action,
  .primary-action {
    min-height: 40px;
    border-radius: 7px;
    font-weight: 800;
  }

  .nav-list button {
    border: 1px solid transparent;
    padding: 9px 10px;
    color: #344054;
    background: transparent;
    text-align: left;
  }

  .nav-list button:hover {
    border-color: #a5bbb4;
    color: #2f2f2b;
    background: #ece9e1;
  }

  .mini-stats div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .mini-stats dt {
    color: #667085;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .mini-stats dd {
    margin: 0;
    color: #101828;
    font-weight: 900;
  }

  .main-stage {
    min-width: 0;
    padding: 24px;
  }

  .system-panel {
    width: min(720px, calc(100vw - 32px));
    margin: 18vh auto 0;
    border: 1px solid #d7ded7;
    border-radius: 8px;
    padding: 24px;
    background: #ffffff;
    box-shadow: 0 18px 50px rgb(16 24 40 / 8%);
  }

  .error-panel {
    border-color: #efb5a8;
    background: #fff8f6;
  }

  .projects-page,
  .memory-page,
  .export-page {
    width: min(1180px, 100%);
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
  }

  .page-header p {
    margin-bottom: 0;
    color: #667085;
  }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .project-card,
  .empty-panel,
  .markdown-view,
  .object-list,
  .export-form,
  .warnings,
  .onboarding-callout {
    border: 1px solid #d9ded7;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 28px rgb(16 24 40 / 5%);
  }

  .project-card {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .project-card.current {
    border-color: #bdb7ab;
    background: #fbfaf7;
  }

  .project-card.unavailable {
    border-color: #edc3b8;
    background: #fff8f5;
  }

  .card-topline {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: #667085;
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .card-topline strong {
    color: #37352f;
  }

  .path,
  .mono {
    overflow-wrap: anywhere;
    color: #667085;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .mini-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }

  .mini-stats div {
    display: grid;
    justify-content: stretch;
    border-radius: 7px;
    padding: 9px;
    background: #f6f8f6;
  }

  .primary-action,
  .ghost-action {
    border: 1px solid #2b2925;
    padding: 9px 13px;
  }

  .primary-action {
    color: #ffffff;
    background: #2b2925;
  }

  .ghost-action {
    color: #2b2925;
    background: #ffffff;
  }

  .layer-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .layer-tabs button {
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    padding: 7px 11px;
    color: #344054;
    background: #ffffff;
    font-weight: 800;
  }

  .layer-tabs button.active {
    border-color: #2b2925;
    color: #ffffff;
    background: #2b2925;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    color: #667085;
    font-size: 0.76rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  input,
  select {
    width: 100%;
    min-height: 40px;
    border: 1px solid #cfd7cf;
    border-radius: 7px;
    padding: 8px 10px;
    color: #101828;
    background: #ffffff;
  }

  .warnings,
  .onboarding-callout {
    display: grid;
    gap: 8px;
    margin-bottom: 16px;
    padding: 14px;
  }

  .warnings {
    border-color: #e5d08b;
    background: #fffbea;
  }

  .onboarding-callout {
    border-color: #b8c9c4;
    background: #f7f5f0;
  }

  .object-list {
    overflow: hidden;
  }

  .object-list button {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
    gap: 12px;
    width: 100%;
    border: 0;
    border-bottom: 1px solid #edf0ed;
    padding: 13px 14px;
    background: #ffffff;
    text-align: left;
  }

  .object-list button:hover,
  .object-list button.selected {
    background: #f7f5f0;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0;
    list-style: none;
  }

  .pill,
  .tag-list li {
    display: inline-flex;
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    padding: 3px 8px;
    color: #344054;
    background: #f8fafc;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .markdown-view,
  .export-form {
    padding: 16px;
  }

  .markdown-view {
    color: #2f3a4a;
    line-height: 1.65;
  }

  .markdown-view h3,
  .markdown-view h4,
  .markdown-view h5 {
    margin-top: 1.1rem;
  }

  .markdown-view pre,
  .json-view pre {
    overflow: auto;
    border-radius: 7px;
    padding: 12px;
    background: #101828;
    color: #f8fafc;
  }

  .markdown-view blockquote {
    margin: 0;
    border-left: 3px solid #bdb7ab;
    padding-left: 12px;
    color: #475467;
  }

  .relation-list {
    display: grid;
    gap: 9px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }

  .relation-list li {
    display: grid;
    gap: 5px;
  }

  .relation-list button {
    justify-self: start;
    border: 0;
    padding: 0;
    color: #2b2925;
    background: transparent;
    font-weight: 900;
    text-align: left;
  }

  .relation-list small {
    color: #667085;
  }

  .technical-details {
    border-top: 1px solid #e4e8e4;
    padding-top: 12px;
  }

  .technical-details summary {
    cursor: pointer;
    font-weight: 900;
  }

  .technical-details dl {
    display: grid;
    gap: 8px;
  }

  .technical-details dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #667085;
  }

  .export-page {
    width: min(760px, 100%);
  }

  .export-form {
    display: grid;
    gap: 14px;
  }

  .export-status {
    border-radius: 7px;
    padding: 12px;
    background: #f8fafc;
  }

  .export-status.success {
    background: #f7f5f0;
  }

  .export-status.error {
    background: #fff1f0;
  }

  .empty-copy {
    margin: 0;
    color: #667085;
  }

  @media (max-width: 900px) {
    .viewer-shell {
      display: block;
    }

    .sidebar {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid #d8ded8;
    }

    .object-list button {
      grid-template-columns: 1fr;
    }

  }

  :global(body) {
    color: #2b2b2b;
    background: #ffffff;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .viewer-shell {
    grid-template-columns: 248px minmax(0, 1fr);
    background: #ffffff;
  }

  .sidebar {
    border-right: 1px solid #e6e3dc;
    background: #f7f6f2;
    padding: 14px 10px;
    gap: 14px;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    border-radius: 6px;
    padding: 4px 6px;
  }

  .mobile-menu-toggle {
    display: none;
  }

  .sidebar-menu {
    display: grid;
    gap: 14px;
  }

  .book-icon,
  .object-glyph {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    border-radius: 6px;
    background: #ebe9e3;
    color: #4e504b;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .brand h1 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0;
  }

  .brand p:last-child {
    overflow: hidden;
    padding: 0 6px 0 36px;
    color: #8b8a84;
    font-size: 0.76rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-search,
  .obsidian-field {
    display: grid;
    gap: 6px;
  }

  .sidebar-search span,
  .obsidian-field span,
  .nav-heading {
    margin: 0;
    color: #8a8880;
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .sidebar-search input,
  .obsidian-field input,
  .list-controls select {
    min-height: 32px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: #eeece6;
    color: #33332f;
    font-size: 0.83rem;
  }

  .sidebar-search input {
    width: 100%;
    padding: 0 10px;
  }

  .sidebar-search input:focus,
  .obsidian-field input:focus {
    border-color: #d1cdc4;
    background: #ffffff;
    outline: 0;
    box-shadow: 0 0 0 2px rgb(18 53 50 / 8%);
  }

  .nav-list {
    display: grid;
    gap: 16px;
    border-top: 1px solid #ebe8e0;
    padding-top: 12px;
  }

  .nav-section {
    display: grid;
    gap: 2px;
  }

  .nav-list button {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    padding: 4px 7px;
    color: #5f5e58;
    background: transparent;
    font-size: 0.88rem;
    font-weight: 560;
    text-align: left;
  }

  .nav-list button span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-row-icon {
    display: inline-grid;
    place-items: center;
    width: 20px;
    color: #96948c;
    font-size: 0.84rem;
  }

  .nav-list button:hover,
  .nav-list button.active {
    color: #262621;
    background: #e9e6df;
  }

  .nav-list button.active .nav-row-icon {
    color: #2b2925;
  }

  .nav-list button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .nav-list button:disabled:hover {
    color: #5f5e58;
    background: transparent;
  }

  .sidebar-export {
    display: grid;
    gap: 9px;
    border-top: 1px solid #ebe8e0;
    padding-top: 12px;
  }

  .sidebar-export summary {
    border-radius: 6px;
    padding: 5px 7px;
    color: #6a6861;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 760;
  }

  .sidebar-export summary:hover {
    background: #e9e6df;
    color: #262621;
  }

  .sidebar-export button {
    min-height: 28px;
    border: 1px solid #dedbd5;
    border-radius: 6px;
    color: #464646;
    background: #ffffff;
    font-weight: 700;
  }

  .main-stage {
    padding: 56px clamp(28px, 6vw, 88px) 72px;
  }

  .memory-page,
  .projects-page,
  .export-page {
    width: min(1180px, 100%);
  }

  .memory-page {
    display: grid;
    gap: 22px;
  }

  .doc-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid #e9e6e0;
  }

  .doc-hero h2 {
    font-size: clamp(1.9rem, 3vw, 2.45rem);
    line-height: 1.06;
    font-weight: 950;
  }

  .doc-hero p:not(.eyebrow) {
    margin: 8px 0 0;
    max-width: 720px;
    color: #777777;
    font-size: 0.98rem;
    line-height: 1.55;
  }

  .list-controls button {
    border: 1px solid #e1ded7;
    border-radius: 7px;
    padding: 7px 10px;
    color: #343434;
    background: #ffffff;
    text-decoration: none;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .memory-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid #e9e6e0;
    padding-bottom: 18px;
  }

  .memory-summary p {
    margin: 0;
    max-width: 640px;
    color: #666666;
    line-height: 1.5;
  }

  .sectioned-memory h3 {
    color: #2f2f2b;
    font-size: 1.16rem;
    font-weight: 760;
  }

  .sectioned-memory > section > p {
    margin: 4px 0 0;
    color: #9a988f;
    font-size: 0.86rem;
  }

  .list-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 0;
    border-bottom: 1px solid #e9e6e0;
    padding-bottom: 14px;
  }

  .list-controls strong,
  .list-controls span {
    display: block;
  }

  .list-controls span {
    color: #777777;
    font-size: 0.85rem;
  }

  .layer-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }

  .layer-tabs button {
    border-color: #e2dfd8;
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 0.84rem;
  }

  .layer-tabs button.active {
    border-color: #bdb7ab;
    color: #2f2f2b;
    background: #ece9e1;
  }

  .list-controls select {
    width: auto;
    min-width: 138px;
    padding: 0 32px 0 12px;
  }

  .list-controls [data-testid="viewer-tag-filter"] {
    min-width: 170px;
  }

  .memory-workspace {
    display: grid;
    gap: 18px;
  }

  .memory-workspace.has-preview {
    grid-template-columns: 1fr;
  }

  .memory-preview {
    display: grid;
    gap: 10px;
    margin: 2px 0 14px 34px;
    padding: 2px 0 8px;
    background: transparent;
  }

  .notion-properties {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 2px 0 10px;
    border-bottom: 1px solid #f0eee8;
  }

  .notion-properties div {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 12px;
    align-items: baseline;
  }

  .notion-properties dt {
    color: #9a988f;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .notion-properties dd {
    margin: 0;
    color: #44443f;
    font-size: 0.86rem;
    overflow-wrap: anywhere;
  }

  .notion-toggle-list {
    display: grid;
    gap: 4px;
  }

  .notion-toggle {
    border: 0;
    padding: 0;
  }

  .notion-toggle summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    border-radius: 5px;
    padding: 4px 6px;
    color: #3d3d38;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 760;
    list-style: none;
  }

  .notion-toggle summary::-webkit-details-marker {
    display: none;
  }

  .notion-toggle summary::before {
    content: "›";
    display: inline-grid;
    place-items: center;
    width: 14px;
    color: #8a8880;
    transition: transform 120ms ease;
  }

  .notion-toggle[open] > summary::before {
    transform: rotate(90deg);
  }

  .notion-toggle summary:hover {
    background: #f1efea;
  }

  .notion-toggle > :not(summary) {
    margin-left: 22px;
    padding: 4px 0 12px;
  }

  .memory-preview .markdown-view {
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .relation-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .sectioned-memory > section {
    margin-top: 24px;
    border-top: 1px solid #f0eee8;
    padding-top: 14px;
  }

  .sectioned-memory > section:first-child {
    margin-top: 0;
    border-top: 0;
    padding-top: 0;
  }

  .object-list {
    display: grid;
    gap: 1px;
    margin-top: 8px;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .object-list button {
    grid-template-columns: 24px minmax(0, 1fr) 18px;
    align-items: center;
    border: 0;
    border-radius: 4px;
    padding: 6px 8px;
    background: transparent;
  }

  .object-list button:hover,
  .object-list button.selected {
    background: #f1efea;
  }

  .object-list button.selected {
    box-shadow: none;
  }

  .object-list button:focus-visible {
    outline: 0;
    background: #ebe9e3;
  }

  .object-list strong {
    display: block;
    color: #37352f;
    font-size: 0.96rem;
    font-weight: 650;
  }

  .object-list small {
    display: block;
    margin-top: 1px;
    color: #8f8d86;
    font-size: 0.84rem;
    line-height: 1.35;
  }

  .object-list em {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    color: #8a8a8a;
    font-style: normal;
    font-weight: 900;
  }

  .object-list .object-glyph {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: transparent;
    color: #7d7b74;
    font-size: 0.82rem;
  }

  @media (max-width: 980px) {
    .doc-hero,
    .list-controls {
      grid-template-columns: 1fr;
    }

    .memory-summary {
      align-items: flex-start;
      flex-direction: column;
    }

    .memory-workspace.has-preview {
      grid-template-columns: 1fr;
    }

    .memory-preview {
      position: static;
      max-height: none;
    }

    .list-controls {
      align-items: stretch;
    }
  }

  @media (max-width: 900px) {
    .viewer-shell {
      display: block;
      min-height: 100vh;
    }

    .sidebar {
      position: sticky;
      top: 0;
      z-index: 20;
      height: auto;
      gap: 0;
      border-right: 0;
      border-bottom: 1px solid #dedbd5;
      padding: 12px 14px;
      box-shadow: 0 8px 22px rgb(16 24 40 / 7%);
    }

    .brand {
      gap: 4px;
    }

    .brand-row {
      gap: 8px;
    }

    .mobile-menu-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      margin-left: auto;
      border: 1px solid #d9d5cc;
      border-radius: 7px;
      padding: 0 12px;
      color: #343434;
      background: #ffffff;
      font-size: 0.84rem;
      font-weight: 850;
      box-shadow: 0 1px 2px rgb(16 24 40 / 5%);
    }

    .mobile-menu-toggle[aria-expanded="true"] {
      border-color: #bdb7ab;
      color: #2f2f2b;
      background: #ece9e1;
    }

    .book-icon {
      width: 22px;
      height: 22px;
      border-radius: 5px;
      font-size: 0.78rem;
    }

    .brand h1 {
      font-size: 1rem;
      line-height: 1.1;
    }

    .brand p:last-child {
      max-width: 100%;
      overflow: hidden;
      padding-left: 30px;
      font-size: 0.78rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sidebar-menu {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      right: 10px;
      left: 10px;
      gap: 14px;
      max-height: calc(100dvh - 96px);
      overflow: auto;
      border: 1px solid #e1ded7;
      border-radius: 10px;
      padding: 14px;
      background: #fffefa;
      box-shadow:
        0 24px 60px rgb(16 24 40 / 18%),
        0 2px 8px rgb(16 24 40 / 8%);
    }

    .sidebar-menu.open {
      display: grid;
    }

    .sidebar-search {
      gap: 5px;
    }

    .sidebar-search input {
      width: 100%;
      min-height: 40px;
      padding: 0 13px;
      font-size: 0.9rem;
    }

    .nav-list {
      display: grid;
      gap: 12px;
      border-top: 0;
      padding: 0;
    }

    .nav-section {
      gap: 3px;
    }

    .nav-list button {
      min-height: 36px;
      border: 0;
      border-radius: 6px;
      padding: 7px 9px;
      background: transparent;
      color: #3f4643;
      font-size: 0.9rem;
      font-weight: 700;
      text-align: left;
    }

    .nav-heading {
      margin-bottom: 1px;
    }

    .nav-list button:hover,
    .nav-list button.active {
      color: #2b2925;
      background: #e9e6df;
    }

    .sidebar-export {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      border-top: 1px solid #e7e2db;
      padding-top: 14px;
    }

    .sidebar-export .obsidian-field {
      grid-column: 1 / -1;
    }

    .sidebar-export button {
      min-height: 36px;
    }

    .main-stage {
      padding: 26px 14px 48px;
    }

    .memory-page {
      gap: 24px;
    }

    .doc-hero {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      padding-bottom: 14px;
    }

    .doc-hero h2 {
      font-size: 1.9rem;
      line-height: 1.08;
    }

    .doc-hero p:not(.eyebrow) {
      margin-top: 8px;
      font-size: 0.94rem;
    }

    .list-controls button {
      min-height: 36px;
      white-space: nowrap;
    }

    .list-controls {
      gap: 12px;
      margin-bottom: 12px;
      padding-top: 18px;
    }

    .layer-tabs {
      flex-wrap: nowrap;
      justify-content: flex-start;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .layer-tabs::-webkit-scrollbar {
      display: none;
    }

    .layer-tabs button {
      flex: 0 0 auto;
      min-height: 36px;
      white-space: nowrap;
    }

    .list-controls select {
      width: 100%;
      min-height: 38px;
    }

    .object-list button {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
    }

    .markdown-view pre {
      overflow-x: auto;
      font-size: 0.74rem;
    }
  }

  @media (max-width: 560px) {
    .main-stage {
      padding-inline: 10px;
    }

    .sidebar {
      padding-inline: 10px;
    }

    .doc-hero h2 {
      font-size: 1.65rem;
    }

    .sectioned-memory h3 {
      font-size: 1.35rem;
    }

    .list-controls button {
      padding: 7px 9px;
      font-size: 0.78rem;
    }

  }

  /* Document-style viewer pass. */
  :global(body) {
    color: #2f2f2b;
    background: #fbfaf7;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .viewer-shell {
    grid-template-columns: 340px minmax(0, 1fr);
    background: #fbfaf7;
  }

  .sidebar {
    border-right: 1px solid #dedbd2;
    background: #f4f1eb;
    padding: 30px 28px;
    gap: 28px;
  }

  .brand {
    gap: 22px;
  }

  .brand-row {
    gap: 10px;
    padding: 0;
  }

  .book-icon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: #111214;
    color: #faf9f5;
    font-size: 0.9rem;
    box-shadow:
      0 1px 2px rgb(16 24 40 / 8%),
      inset 0 0 0 1px rgb(255 255 255 / 8%);
  }

  .brand h1 {
    color: #242423;
    font-size: 1.46rem;
    line-height: 1.1;
    font-weight: 850;
  }

  .brand p:last-child {
    padding: 0;
    color: #6c6962;
    font-size: 1.02rem;
    line-height: 1.35;
    white-space: normal;
  }

  .sidebar-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
    border-top: 1px solid #dfdbd1;
    padding-top: 24px;
  }

  .sidebar-stats div {
    min-height: 84px;
    border: 1px solid #dfdbd1;
    border-radius: 8px;
    padding: 14px 16px;
    background: #fffefa;
    box-shadow: 0 1px 2px rgb(16 24 40 / 5%);
  }

  .sidebar-stats dt {
    color: #262522;
    font-size: 1.7rem;
    line-height: 1.05;
    font-weight: 850;
  }

  .sidebar-stats dd {
    margin: 7px 0 0;
    color: #74716a;
    font-size: 0.92rem;
    font-weight: 560;
  }

  .sidebar-menu {
    gap: 24px;
  }

  .sidebar-search {
    gap: 9px;
  }

  .sidebar-search span,
  .nav-heading,
  .obsidian-field span {
    color: #9a968d;
    font-size: 0.72rem;
    letter-spacing: 0;
  }

  .sidebar-search input,
  .obsidian-field input {
    min-height: 44px;
    border: 1px solid #dedbd3;
    border-radius: 8px;
    background: #fffefa;
    color: #37352f;
    font-size: 0.94rem;
    box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
  }

  .nav-list {
    gap: 22px;
    border-top: 1px solid #dfdbd1;
    padding-top: 22px;
  }

  .nav-section {
    gap: 6px;
  }

  .nav-list button {
    min-height: 32px;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 9px;
    border: 0;
    border-radius: 6px;
    padding: 5px 9px;
    color: #6e6b65;
    background: transparent;
    font-size: 0.98rem;
    font-weight: 520;
  }

  .nav-list button:hover,
  .nav-list button.active {
    color: #2f2f2b;
    background: #e9e6df;
  }

  .nav-row-icon {
    width: 18px;
    color: #9a968d;
  }

  .sidebar-export {
    border-top: 1px solid #dfdbd1;
    padding-top: 18px;
  }

  .main-stage {
    min-width: 0;
    padding: 46px clamp(36px, 6vw, 104px) 88px;
    background: #fffefa;
  }

  .memory-page,
  .projects-page,
  .graph-page,
  .export-page {
    width: min(1060px, 100%);
    margin: 0 auto;
  }

  .graph-page {
    width: min(1280px, 100%);
  }

  .memory-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-content: center;
    gap: 24px;
  }

  .doc-hero {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    max-width: none;
    margin: 0;
    border-bottom: 0;
    padding: 0;
  }

  .doc-icon {
    display: inline-grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 999px;
    background: #111214;
    color: #faf9f5;
    font-size: 1.38rem;
    font-weight: 850;
    line-height: 1;
    box-shadow:
      0 16px 42px rgb(16 24 40 / 10%),
      inset 0 0 0 1px rgb(255 255 255 / 8%);
  }

  .doc-hero .eyebrow {
    margin-top: 4px;
    color: #9a968d;
  }

  .doc-hero h2 {
    max-width: 860px;
    color: #202020;
    font-size: clamp(2.7rem, 4.1vw, 3.85rem);
    line-height: 1;
    font-weight: 880;
  }

  .doc-hero p:not(.eyebrow) {
    max-width: 680px;
    color: #6d6a65;
    font-size: 1rem;
    line-height: 1.48;
  }

  .memory-summary {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 16px;
    max-width: none;
    margin: 0;
    border: 1px solid #e2ded5;
    border-radius: 8px;
    padding: 18px 20px;
    background: #ffffff;
    box-shadow: 0 10px 28px rgb(16 24 40 / 5%);
  }

  .summary-check {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    color: #ffffff;
    background: #2b2925;
    font-weight: 900;
  }

  .summary-copy strong {
    display: block;
    color: #34332f;
    font-size: 1.04rem;
    font-weight: 820;
  }

  .summary-copy p {
    margin: 4px 0 0;
    color: #76736c;
    font-size: 1rem;
    line-height: 1.45;
  }

  .trust-copy {
    margin-top: 10px !important;
    color: #6f6b63 !important;
    font-size: 0.92rem !important;
  }

  .trust-copy span {
    display: inline-flex;
    margin-right: 6px;
    border: 1px solid #d6d2ca;
    border-radius: 999px;
    padding: 2px 8px;
    color: #37352f;
    background: #f7f6f2;
    font-size: 0.78rem;
    font-weight: 820;
  }

  .graph-counts {
    display: flex;
    gap: 10px;
    margin: 0;
  }

  .graph-counts div {
    min-width: 88px;
    border: 1px solid #e2ded5;
    border-radius: 8px;
    padding: 10px 12px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
  }

  .graph-counts dt {
    color: #9a968d;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .graph-counts dd {
    margin: 3px 0 0;
    color: #262522;
    font-size: 1.25rem;
    font-weight: 880;
  }

  .graph-panel {
    display: grid;
    gap: 14px;
  }

  .graph-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #e2ded5;
    border-radius: 8px;
    padding: 12px;
    background: #ffffff;
    box-shadow: 0 10px 28px rgb(16 24 40 / 5%);
  }

  .graph-filter-tabs,
  .graph-actions,
  .graph-inspector-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .graph-filter-tabs button,
  .graph-actions button,
  .graph-inspector-actions button {
    min-height: 34px;
    border: 1px solid #dedbd3;
    border-radius: 7px;
    padding: 7px 11px;
    color: #5e5a53;
    background: #ffffff;
    font-size: 0.84rem;
    font-weight: 760;
  }

  .graph-filter-tabs button.active {
    border-color: #2b2925;
    color: #ffffff;
    background: #2b2925;
  }

  .graph-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
    gap: 14px;
    align-items: stretch;
  }

  .graph-canvas-wrap,
  .graph-inspector {
    border: 1px solid #e2ded5;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 28px rgb(16 24 40 / 5%);
  }

  .graph-canvas-wrap {
    position: relative;
    min-height: 640px;
    overflow: hidden;
  }

  .graph-canvas {
    width: 100%;
    height: 100%;
    min-height: 640px;
    background:
      linear-gradient(rgb(242 239 232 / 68%) 1px, transparent 1px),
      linear-gradient(90deg, rgb(242 239 232 / 68%) 1px, transparent 1px),
      #fffefa;
    background-size: 28px 28px;
  }

  .graph-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 8px;
    padding: 24px;
    text-align: center;
    background: rgb(255 254 250 / 86%);
  }

  .graph-empty h3,
  .graph-empty p,
  .graph-empty-selection h3,
  .graph-empty-selection p {
    margin: 0;
  }

  .graph-empty p,
  .graph-empty-selection p,
  .graph-body-preview {
    color: #746f68;
    line-height: 1.45;
  }

  .graph-inspector {
    align-self: stretch;
    min-height: 640px;
    padding: 18px;
  }

  .graph-inspector section {
    display: grid;
    gap: 12px;
  }

  .graph-inspector h3 {
    color: #242423;
    font-size: 1.2rem;
    font-weight: 850;
  }

  .graph-meta {
    display: grid;
    gap: 7px;
    margin: 0;
    border-top: 1px solid #f0eee8;
    border-bottom: 1px solid #f0eee8;
    padding: 12px 0;
  }

  .graph-meta div {
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
  }

  .graph-meta dt {
    color: #9a968d;
    font-size: 0.76rem;
    font-weight: 780;
  }

  .graph-meta dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #3d3d38;
    font-size: 0.88rem;
  }

  .graph-body-preview {
    margin: 0;
    font-size: 0.92rem;
  }

  .graph-relations {
    border-top: 1px solid #f0eee8;
    padding-top: 10px;
  }

  .graph-relations summary {
    cursor: pointer;
    color: #37352f;
    font-weight: 780;
  }

  .warnings,
  .onboarding-callout,
  .list-controls,
  .sectioned-memory {
    max-width: none;
    margin-right: 0;
    margin-left: 0;
  }

  .list-controls {
    display: grid;
    grid-template-columns: 1fr;
    align-items: start;
    justify-content: stretch;
    gap: 14px;
    border-bottom: 1px solid #ebe7de;
    padding: 4px 0 24px;
  }

  .list-controls > div:first-child {
    text-align: left;
  }

  .list-controls strong {
    color: #2f2f2b;
    font-size: 0.98rem;
  }

  .list-controls span {
    color: #8b8880;
    font-size: 0.9rem;
  }

  .controls-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .layer-tabs {
    flex-wrap: wrap;
    justify-content: flex-start;
    margin: 0;
    gap: 8px;
  }

  .layer-tabs button,
  .list-controls button {
    min-height: 36px;
    border: 1px solid #dedbd3;
    border-radius: 999px;
    padding: 7px 12px;
    color: #6d6a65;
    background: #ffffff;
    font-size: 0.86rem;
    font-weight: 650;
    box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
  }

  .layer-tabs button.active {
    border-color: #202020;
    color: #ffffff;
    background: #202020;
  }

  .list-controls select {
    width: auto;
    min-width: 150px;
    min-height: 38px;
    border-color: #dedbd3;
    border-radius: 999px;
    background-color: #efede8;
    color: #504d48;
    font-size: 0.9rem;
  }

  .list-controls [data-testid="viewer-tag-filter"] {
    min-width: 180px;
  }

  .list-controls [data-testid="viewer-facet-filter"] {
    min-width: 210px;
  }

  .sectioned-memory {
    display: grid;
    gap: 36px;
  }

  .sectioned-memory > section {
    margin: 0;
    border-top: 0;
    padding-top: 0;
  }

  .sectioned-memory h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #202020;
    font-size: 2.05rem;
    line-height: 1.08;
    font-weight: 850;
  }

  .section-icon {
    display: inline-grid;
    place-items: center;
    width: 1.1em;
    color: #77736d;
    font-size: 0.86em;
    line-height: 1;
  }

  .sectioned-memory > section > p {
    margin: 6px 0 18px;
    color: #77736d;
    font-size: 1.04rem;
  }

  .object-list {
    display: grid;
    gap: 12px;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .object-list button {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    min-height: 72px;
    border: 1px solid #e3dfd7;
    border-radius: 8px;
    padding: 12px 18px;
    background: #ffffff;
    color: #37352f;
    box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
  }

  .object-list button:hover {
    border-color: #d7d2c8;
    background: #fbfaf7;
  }

  .object-list button.selected {
    border-color: #e3dfd7;
    border-bottom-color: transparent;
    border-radius: 8px 8px 0 0;
    background: #f1efea;
    box-shadow: none;
  }

  .object-list button:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
    background: #f7f5f0;
  }

  .object-list .object-glyph {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: #f1efea;
    color: #68818d;
    font-size: 0.92rem;
    font-weight: 850;
  }

  .object-list strong {
    color: #2c2c29;
    font-size: 1.1rem;
    line-height: 1.22;
    font-weight: 800;
  }

  .object-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 7px;
  }

  .object-meta span {
    border: 1px solid #dedbd3;
    border-radius: 999px;
    padding: 2px 7px;
    color: #605c55;
    background: #fbfaf7;
    font-size: 0.74rem;
    font-weight: 760;
  }

  .object-list small {
    display: block;
    margin-top: 7px;
    color: #77736d;
    font-size: 0.94rem;
    line-height: 1.35;
  }

  .object-list em {
    width: auto;
    min-width: 34px;
    color: #9a968d;
    font-size: 0.92rem;
    font-style: normal;
    font-weight: 620;
    text-align: right;
  }

  .memory-preview {
    display: grid;
    gap: 18px;
    margin: -12px 0 4px;
    border: 1px solid #e3dfd7;
    border-top: 0;
    border-radius: 0 0 8px 8px;
    padding: 24px 56px 28px;
    background: #ffffff;
    box-shadow: 0 16px 32px rgb(16 24 40 / 5%);
  }

  .notion-properties {
    gap: 0;
    padding: 0 0 14px;
    border-bottom: 1px solid #e7e3dc;
  }

  .notion-properties div {
    grid-template-columns: 92px minmax(0, 1fr);
    min-height: 26px;
    gap: 18px;
  }

  .notion-properties dt {
    color: #99958d;
    font-size: 0.9rem;
    font-weight: 780;
  }

  .notion-properties dd {
    color: #3e3d39;
    font-size: 0.98rem;
  }

  .notion-toggle-list {
    gap: 12px;
  }

  .facet-grid {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .facet-grid div {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 12px;
  }

  .facet-grid dt {
    color: #99958d;
    font-weight: 760;
  }

  .facet-grid dd {
    margin: 0;
    color: #3e3d39;
    overflow-wrap: anywhere;
  }

  .notion-toggle summary {
    min-height: 30px;
    padding: 2px 0;
    color: #37352f;
    font-size: 1.02rem;
    font-weight: 760;
  }

  .notion-toggle summary:hover {
    background: transparent;
  }

  .notion-toggle > :not(summary) {
    margin-left: 22px;
    padding: 8px 0 18px;
  }

  .memory-preview .markdown-view {
    color: #283247;
    font-size: 1.05rem;
    line-height: 1.55;
  }

  .memory-preview .markdown-view h3 {
    margin: 0 0 6px;
    color: #182230;
    font-size: 1.45rem;
    line-height: 1.18;
  }

  .tag-list li,
  .pill {
    border-color: #d6d2ca;
    background: #f7f6f2;
    color: #4e5a6b;
  }

  .relation-columns {
    gap: 28px;
  }

  .technical-details {
    border-top: 0;
    padding-top: 0;
  }

  @media (max-width: 1040px) {
    .viewer-shell {
      grid-template-columns: 286px minmax(0, 1fr);
    }

    .sidebar {
      padding: 24px 20px;
    }

    .main-stage {
      padding: 52px 28px 72px;
    }

    .doc-hero h2 {
      font-size: clamp(2.8rem, 7vw, 4.3rem);
    }
  }

  @media (max-width: 900px) {
    .viewer-shell {
      display: block;
    }

    .sidebar {
      position: sticky;
      padding: 12px 14px;
      background: #f4f1eb;
    }

    .brand {
      gap: 4px;
    }

    .brand-row {
      min-height: 36px;
    }

    .brand p:last-child {
      padding-left: 38px;
      font-size: 0.82rem;
      white-space: nowrap;
    }

    .sidebar-stats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding-top: 0;
      border-top: 0;
    }

    .sidebar-stats div {
      min-height: auto;
      padding: 9px;
    }

    .sidebar-stats dt {
      font-size: 1.08rem;
    }

    .sidebar-stats dd {
      margin-top: 2px;
      font-size: 0.72rem;
    }

    .main-stage {
      padding: 34px 16px 58px;
    }

    .doc-hero {
      margin: 0 0 18px;
    }

    .doc-hero h2 {
      font-size: 2.45rem;
    }

    .memory-summary {
      margin: 0;
    }

    .graph-workspace {
      grid-template-columns: 1fr;
    }

    .graph-canvas-wrap,
    .graph-canvas,
    .graph-inspector {
      min-height: 420px;
    }

    .graph-toolbar,
    .graph-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .graph-filter-tabs,
    .graph-actions {
      width: 100%;
    }

    .graph-filter-tabs button,
    .graph-actions button {
      flex: 1 1 auto;
    }

    .list-controls {
      justify-content: flex-start;
    }

    .list-controls > div:first-child {
      text-align: left;
    }

    .controls-row {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
    }

    .memory-preview {
      padding: 20px 18px 24px;
    }
  }
</style>
