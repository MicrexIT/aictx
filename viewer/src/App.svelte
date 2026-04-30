<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";

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

  interface MemoryObjectSummary {
    id: string;
    type: ObjectType;
    status: ObjectStatus;
    title: string;
    body_path: string;
    json_path: string;
    scope: Scope;
    tags: string[];
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
    evidence: Array<{ kind: "memory" | "relation" | "file" | "commit"; id: string }>;
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
  type ExportEnvelope = ViewerSuccessEnvelope<ExportObsidianProjectionData> | ViewerErrorEnvelope;
  type ViewerState = "loading" | "ready" | "error";
  type ExportState = "idle" | "running" | "success" | "error";
  type DetailTab = "markdown" | "json";

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
  let bootstrap = $state<ViewerBootstrapData | null>(null);
  let warnings = $state<string[]>([]);
  let errorMessage = $state("");
  let searchQuery = $state("");
  let typeFilter = $state("all");
  let statusFilter = $state("all");
  let tagFilter = $state("all");
  let selectedObjectId = $state<string | null>(null);
  let activeTab = $state<DetailTab>("markdown");
  let exportOutDir = $state("");
  let exportState = $state<ExportState>("idle");
  let exportMessage = $state("");
  let exportErrorCode = $state("");
  let exportFilesWritten = $state(0);
  let exportManifestPath = $state("");

  const allOption = "all";
  const graphWidth = 640;
  const graphHeight = 300;
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const objects = $derived(bootstrap?.objects ?? []);
  const relations = $derived(bootstrap?.relations ?? []);
  const objectById = $derived(new Map(objects.map((object) => [object.id, object])));
  const typeOptions = $derived(uniqueSorted(objects.map((object) => object.type)));
  const statusOptions = $derived(uniqueSorted(objects.map((object) => object.status)));
  const tagOptions = $derived(uniqueSorted(objects.flatMap((object) => object.tags)));
  const filteredObjects = $derived.by(() =>
    objects.filter((object) => objectMatchesFilters(object))
  );
  const selectedObject = $derived.by(() =>
    filteredObjects.find((object) => object.id === selectedObjectId) ?? filteredObjects[0] ?? null
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
  const visibleWarnings = $derived(uniqueSorted([...(bootstrap?.storage_warnings ?? []), ...warnings]));

  onMount(() => {
    void loadBootstrap();
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
      loadState = "ready";
    } catch (error) {
      loadState = "error";
      errorMessage = error instanceof Error ? error.message : String(error);
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
      object.body
    ].join(" ")).includes(query);
  }

  function optionMatches(filter: string, value: string): boolean {
    return filter === allOption || filter === value;
  }

  function normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  function selectObject(id: string): void {
    selectedObjectId = id;
    activeTab = "markdown";
  }

  function openRelatedObject(id: string): void {
    searchQuery = "";
    typeFilter = allOption;
    statusFilter = allOption;
    tagFilter = allOption;
    selectObject(id);
  }

  function relationCounterpart(relation: MemoryRelationSummary, objectId: string): string {
    return relation.from === objectId ? relation.to : relation.from;
  }

  function relationLabel(relation: MemoryRelationSummary, objectId: string): string {
    const counterpart = objectById.get(relationCounterpart(relation, objectId));
    return counterpart === undefined
      ? relationCounterpart(relation, objectId)
      : `${counterpart.title} (${counterpart.id})`;
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
      ...graphNeighborNodes(incomingOnlyIds, "incoming", 132, objectLookup),
      ...graphNeighborNodes(outgoingOnlyIds, "outgoing", 508, objectLookup),
      ...graphNeighborNodes(bothIds, "both", graphWidth / 2, objectLookup)
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

  function graphYPositions(count: number, role: Exclude<GraphNodeRole, "selected">): number[] {
    if (count <= 0) {
      return [];
    }

    if (role === "both") {
      return count === 1
        ? [64]
        : Array.from({ length: count }, (_, index) => 54 + (192 / (count - 1)) * index);
    }

    if (count === 1) {
      return [graphHeight / 2];
    }

    return Array.from({ length: count }, (_, index) => 58 + (184 / (count - 1)) * index);
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
        subtitle: "Missing endpoint",
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
    return node.role === "selected" ? 42 : 34;
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

<main class="viewer-shell" aria-labelledby="viewer-title">
  <header class="top-bar">
    <div>
      <p class="eyebrow">Aictx local viewer</p>
      <h1 id="viewer-title">Memory Inspector</h1>
    </div>

    {#if bootstrap !== null}
      <dl class="project-stats" aria-label="Project memory counts">
        <div>
          <dt>Objects</dt>
          <dd>{bootstrap.counts.objects}</dd>
        </div>
        <div>
          <dt>Relations</dt>
          <dd>{bootstrap.counts.relations}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{bootstrap.counts.active_relations}</dd>
        </div>
      </dl>
    {/if}
  </header>

  {#if loadState === "loading"}
    <section class="system-panel" aria-live="polite">
      <h2>Loading memory</h2>
      <p>Reading project memory from the local viewer API.</p>
    </section>
  {:else if loadState === "error"}
    <section class="system-panel error-panel" role="alert">
      <h2>Viewer failed to load</h2>
      <p>{errorMessage}</p>
    </section>
  {:else if bootstrap !== null}
    <section class="workspace" aria-label="Read-only memory browser">
      <aside class="sidebar" aria-label="Memory object search and list">
        <section class="project-panel" aria-label="Project metadata">
          <p class="project-name">{bootstrap.project.name}</p>
          <p class="project-id">{bootstrap.project.id}</p>

          <form
            class="export-panel"
            aria-label="Obsidian export"
            onsubmit={(event) => {
              event.preventDefault();
              void exportObsidian();
            }}
          >
            <label class="field">
              <span>Obsidian output</span>
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

        <section class="filters" aria-label="Search and filters">
          <label class="field">
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
          </div>

          <label class="field">
            <span>Tag</span>
            <select bind:value={tagFilter} data-testid="viewer-tag-filter">
              <option value={allOption}>All tags</option>
              {#each tagOptions as tag (tag)}
                <option value={tag}>{tag}</option>
              {/each}
            </select>
          </label>
        </section>

        {#if visibleWarnings.length > 0}
          <section class="warnings" aria-label="Storage warnings">
            {#each visibleWarnings as warning (warning)}
              <p>{warning}</p>
            {/each}
          </section>
        {/if}

        <section class="list-header" aria-live="polite">
          <span>{filteredObjects.length} shown</span>
          <span>{objects.length} total</span>
        </section>

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
      </aside>

      <section class="document-pane" aria-label="Selected memory object">
        {#if selectedObject === null}
          <section class="system-panel">
            <h2>No object selected</h2>
            <p>Adjust the search and filters to inspect project memory.</p>
          </section>
        {:else}
          <article class="document" data-testid="selected-object">
            <header class="document-header">
              <div>
                <p class="eyebrow">{selectedObject.type} / {selectedObject.status}</p>
                <h2>{selectedObject.title}</h2>
                <p class="object-id">{selectedObject.id}</p>
              </div>

              <div class="tab-list" role="tablist" aria-label="Selected object views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "markdown"}
                  class:active={activeTab === "markdown"}
                  onclick={() => {
                    activeTab = "markdown";
                  }}
                  data-testid="markdown-tab"
                >
                  Markdown
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "json"}
                  class:active={activeTab === "json"}
                  onclick={() => {
                    activeTab = "json";
                  }}
                  data-testid="json-tab"
                >
                  JSON
                </button>
              </div>
            </header>

            {#if selectedObject.tags.length > 0}
              <ul class="tag-list" aria-label="Tags">
                {#each selectedObject.tags as tag (tag)}
                  <li>{tag}</li>
                {/each}
              </ul>
            {/if}

            {#if activeTab === "markdown"}
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
            {:else}
              <section class="json-view" aria-label="Object sidecar JSON" data-testid="json-view">
                <pre>{selectedJson}</pre>
              </section>
            {/if}
          </article>
        {/if}
      </section>

      <aside class="inspector" aria-label="Selected object metadata and relations">
        {#if selectedObject !== null}
          <section class="metadata-panel">
            <h2>Metadata</h2>
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
                <dt>Updated</dt>
                <dd>{selectedObject.updated_at}</dd>
              </div>
            </dl>
          </section>

          <section class="graph-panel" aria-label="Selected-node relation graph" data-testid="relation-graph">
            <h2>Graph</h2>
            <div class="graph-surface">
              <svg
                class="relation-graph-svg"
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                role="img"
                aria-labelledby="relation-graph-title"
                data-testid="relation-graph-svg"
              >
                <title id="relation-graph-title">
                  Direct relation graph for {selectedObject.title}
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
                    <path d="M0,0 L8,4 L0,8 Z" fill="#7d9994" />
                  </marker>
                </defs>

                {#each graphEdges as edge (edge.relation.id)}
                  {@const fromNode = graphNodeById.get(edge.fromId)}
                  {@const toNode = graphNodeById.get(edge.toId)}
                  {#if fromNode !== undefined && toNode !== undefined}
                    {@const startPoint = graphConnectionPoint(fromNode, toNode, graphNodeRadius(fromNode) + 4)}
                    {@const endPoint = graphConnectionPoint(toNode, fromNode, graphNodeRadius(toNode) + 9)}
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
                        y={graphMidpoint(fromNode.y, toNode.y) - 8}
                      >
                        {edge.relation.predicate}
                      </text>
                    </g>
                  {/if}
                {/each}

                {#each graphNodes as node (node.id)}
                  <g
                    class:selected-node={node.role === "selected"}
                    class:missing-node={node.missing}
                    class="graph-node"
                    data-testid={`relation-graph-node-${node.id}`}
                  >
                    <title>{node.title} ({node.id})</title>
                    <circle cx={node.x} cy={node.y} r={graphNodeRadius(node)} />
                    <text class="graph-node-title" x={node.x} y={node.y - 3}>
                      {graphText(node.title, node.role === "selected" ? 22 : 18)}
                    </text>
                    <text class="graph-node-subtitle" x={node.x} y={node.y + 16}>
                      {graphText(node.subtitle, node.role === "selected" ? 24 : 18)}
                    </text>
                  </g>
                {/each}
              </svg>
            </div>

            {#if directRelations.length === 0}
              <p class="empty-copy" data-testid="relation-graph-empty">
                No direct relations for this object.
              </p>
            {:else}
              <p class="graph-count">
                {graphNodes.length} nodes / {graphEdges.length} relations
              </p>
            {/if}
          </section>

          <section class="relations-panel" aria-label="Outgoing relations">
            <h2>Outgoing</h2>
            {#if outgoingRelations.length === 0}
              <p class="empty-copy">No outgoing relations.</p>
            {:else}
              <ul class="relation-list" data-testid="outgoing-relations">
                {#each outgoingRelations as relation (relation.id)}
                  <li>
                    <div>
                      <span class="relation-predicate">{relation.predicate}</span>
                      <span class="relation-id">{relation.id}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!objectById.has(relation.to)}
                      onclick={() => openRelatedObject(relation.to)}
                      title={!objectById.has(relation.to) ? "Object is not present in bootstrap data" : "Inspect related object"}
                    >
                      to {relationLabel(relation, selectedObject.id)}
                    </button>
                    <p>
                      <span>{relation.status}</span>
                      {#if relation.confidence !== null}
                        <span>{relation.confidence} confidence</span>
                      {/if}
                    </p>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <section class="relations-panel" aria-label="Incoming relations">
            <h2>Incoming</h2>
            {#if incomingRelations.length === 0}
              <p class="empty-copy">No incoming relations.</p>
            {:else}
              <ul class="relation-list" data-testid="incoming-relations">
                {#each incomingRelations as relation (relation.id)}
                  <li>
                    <div>
                      <span class="relation-predicate">{relation.predicate}</span>
                      <span class="relation-id">{relation.id}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!objectById.has(relation.from)}
                      onclick={() => openRelatedObject(relation.from)}
                      title={!objectById.has(relation.from) ? "Object is not present in bootstrap data" : "Inspect related object"}
                    >
                      from {relationLabel(relation, selectedObject.id)}
                    </button>
                    <p>
                      <span>{relation.status}</span>
                      {#if relation.confidence !== null}
                        <span>{relation.confidence} confidence</span>
                      {/if}
                    </p>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}
      </aside>
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
      #f4f7f6;
    background-size: 28px 28px;
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

  .viewer-shell {
    display: grid;
    min-height: 100vh;
    grid-template-rows: auto 1fr;
    padding: 18px;
    gap: 14px;
  }

  .top-bar {
    display: flex;
    min-height: 78px;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border: 1px solid #cfd4d3;
    border-radius: 8px;
    padding: 18px 20px;
    background: rgb(255 255 255 / 94%);
    box-shadow: 0 12px 30px rgb(23 32 51 / 8%);
  }

  .eyebrow {
    margin: 0 0 6px;
    color: #60706b;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0;
    color: #121826;
    font-size: 1.75rem;
    line-height: 1.05;
    letter-spacing: 0;
  }

  h2 {
    margin-bottom: 0;
    color: #121826;
    font-size: 1.35rem;
    line-height: 1.2;
    letter-spacing: 0;
  }

  h3,
  h4,
  h5 {
    color: #121826;
    letter-spacing: 0;
  }

  .project-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    gap: 8px;
    margin: 0;
  }

  .project-stats div {
    min-width: 74px;
    border-left: 3px solid #0f766e;
    padding-left: 10px;
  }

  .project-stats dt {
    color: #60706b;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .project-stats dd {
    margin: 2px 0 0;
    color: #121826;
    font-size: 1.1rem;
    font-weight: 800;
  }

  .workspace {
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr) minmax(260px, 320px);
    gap: 14px;
  }

  .sidebar,
  .document-pane,
  .inspector,
  .system-panel {
    min-width: 0;
    border: 1px solid #cfd4d3;
    border-radius: 8px;
    background: rgb(255 255 255 / 96%);
    box-shadow: 0 12px 30px rgb(23 32 51 / 7%);
  }

  .sidebar,
  .inspector {
    display: flex;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
  }

  .project-panel,
  .filters,
  .metadata-panel,
  .graph-panel,
  .relations-panel,
  .warnings,
  .list-header {
    border-bottom: 1px solid #e1e4e2;
    padding: 14px;
  }

  .project-name {
    margin-bottom: 4px;
    color: #121826;
    font-weight: 800;
  }

  .project-id,
  .object-id,
  .relation-id {
    overflow-wrap: anywhere;
    color: #60706b;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.78rem;
  }

  .export-panel {
    display: grid;
    gap: 10px;
    margin-top: 14px;
    border-top: 1px solid #e1e4e2;
    padding-top: 14px;
  }

  .primary-action {
    width: 100%;
    min-height: 38px;
    border: 1px solid #0b5f59;
    border-radius: 6px;
    padding: 8px 10px;
    color: #ffffff;
    background: #0f766e;
    font-weight: 800;
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
    padding: 10px;
    background: #f8fbfa;
    color: #263141;
  }

  .export-status p {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 0.84rem;
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

  .filters {
    display: grid;
    gap: 12px;
  }

  .filter-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    color: #52615d;
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  input,
  select {
    width: 100%;
    min-height: 38px;
    border: 1px solid #cfd4d3;
    border-radius: 6px;
    padding: 8px 10px;
    color: #172033;
    background: #ffffff;
  }

  input:focus,
  select:focus,
  button:focus-visible {
    outline: 3px solid rgb(15 118 110 / 28%);
    outline-offset: 2px;
  }

  .warnings {
    display: grid;
    gap: 8px;
    background: #fff7df;
  }

  .warnings p {
    margin: 0;
    color: #6f4c00;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    color: #60706b;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .object-list {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 0;
    overflow: auto;
    padding: 10px;
  }

  .object-list button {
    display: grid;
    gap: 5px;
    width: 100%;
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 11px;
    color: inherit;
    background: transparent;
    text-align: left;
  }

  .object-list button:hover,
  .object-list button.selected {
    border-color: #85aaa4;
    background: #eef7f4;
  }

  .object-title {
    color: #121826;
    font-weight: 800;
    line-height: 1.25;
  }

  .object-meta,
  .tag-list,
  .relation-list p {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pill,
  .tag-list li,
  .relation-list p span {
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

  .document-pane {
    min-height: 0;
    overflow: auto;
  }

  .document {
    display: grid;
    gap: 16px;
    padding: 18px;
  }

  .document-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid #e1e4e2;
    padding-bottom: 16px;
  }

  .tab-list {
    display: inline-flex;
    flex: 0 0 auto;
    border: 1px solid #cfd4d3;
    border-radius: 7px;
    padding: 3px;
    background: #eef2f1;
  }

  .tab-list button {
    border: 0;
    border-radius: 5px;
    padding: 8px 10px;
    color: #52615d;
    background: transparent;
    font-weight: 800;
  }

  .tab-list button.active {
    color: #ffffff;
    background: #0f766e;
  }

  .tag-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .markdown-view {
    max-width: 860px;
    color: #263141;
    font-size: 1rem;
    line-height: 1.66;
  }

  .markdown-view h3 {
    margin: 0 0 10px;
    font-size: 1.5rem;
  }

  .markdown-view h4 {
    margin: 18px 0 8px;
    font-size: 1.15rem;
  }

  .markdown-view h5 {
    margin: 16px 0 8px;
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
    border: 1px solid #d4d9d5;
    border-radius: 7px;
    padding: 14px;
    background: #172033;
    color: #f7faf9;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.85rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .metadata-panel dl {
    display: grid;
    gap: 12px;
    margin: 0;
  }

  .metadata-panel div {
    display: grid;
    gap: 4px;
  }

  .metadata-panel dt {
    color: #60706b;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .metadata-panel dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #172033;
    font-size: 0.86rem;
  }

  .graph-panel {
    display: grid;
    gap: 10px;
    overflow: hidden;
  }

  .graph-panel h2 {
    margin-bottom: 2px;
    font-size: 1rem;
  }

  .graph-surface {
    min-height: 150px;
    border: 1px solid #d4d9d5;
    border-radius: 7px;
    background:
      linear-gradient(90deg, rgb(15 118 110 / 6%) 1px, transparent 1px),
      linear-gradient(rgb(15 118 110 / 6%) 1px, transparent 1px),
      #f8fbfa;
    background-size: 20px 20px;
  }

  .relation-graph-svg {
    display: block;
    width: 100%;
    min-height: 150px;
  }

  .graph-edge line {
    stroke: #7d9994;
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .graph-edge text {
    fill: #28514b;
    font-size: 17px;
    font-weight: 800;
    paint-order: stroke;
    pointer-events: none;
    stroke: #f8fbfa;
    stroke-linejoin: round;
    stroke-width: 5px;
    text-anchor: middle;
  }

  .graph-node circle {
    fill: #ffffff;
    stroke: #9fb6b1;
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
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
    fill: #121826;
    font-size: 18px;
    font-weight: 800;
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

  .graph-count {
    margin: 0;
    color: #60706b;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .relations-panel {
    overflow: auto;
  }

  .relations-panel h2,
  .metadata-panel h2 {
    margin-bottom: 12px;
    font-size: 1rem;
  }

  .relation-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .relation-list li {
    display: grid;
    gap: 8px;
    border: 1px solid #e0e4e1;
    border-radius: 7px;
    padding: 10px;
    background: #f8fbfa;
  }

  .relation-predicate {
    display: block;
    margin-bottom: 2px;
    color: #121826;
    font-weight: 800;
  }

  .relation-list button {
    border: 1px solid #b9c8c4;
    border-radius: 6px;
    padding: 8px 9px;
    color: #17443e;
    background: #eef7f4;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .relation-list button:disabled {
    color: #7b8581;
    background: #f1f1ee;
  }

  .relation-list p {
    margin: 0;
  }

  .empty-copy {
    margin: 0;
    color: #60706b;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .system-panel {
    align-self: start;
    padding: 24px;
  }

  .system-panel p {
    margin-bottom: 0;
    color: #52615d;
  }

  .error-panel {
    border-color: #dab0a3;
    background: #fff4ef;
  }

  @media (max-width: 1120px) {
    .workspace {
      grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
    }

    .inspector {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(260px, 1.15fr) repeat(3, minmax(0, 1fr));
    }

    .metadata-panel,
    .graph-panel,
    .relations-panel {
      border-bottom: 0;
      border-right: 1px solid #e1e4e2;
    }

    .relations-panel:last-child {
      border-right: 0;
    }
  }

  @media (max-width: 760px) {
    .viewer-shell {
      padding: 10px;
    }

    .top-bar,
    .document-header {
      align-items: stretch;
      flex-direction: column;
    }

    .project-stats {
      grid-template-columns: repeat(3, 1fr);
    }

    .workspace,
    .inspector {
      grid-template-columns: 1fr;
    }

    .metadata-panel,
    .graph-panel,
    .relations-panel {
      border-right: 0;
      border-bottom: 1px solid #e1e4e2;
    }

    .sidebar,
    .document-pane,
    .inspector {
      max-height: none;
    }

    .filter-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
