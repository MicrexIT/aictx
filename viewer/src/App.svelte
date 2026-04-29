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

  interface ViewerSuccessEnvelope {
    ok: true;
    data: ViewerBootstrapData;
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

  type ViewerEnvelope = ViewerSuccessEnvelope | ViewerErrorEnvelope;
  type ViewerState = "loading" | "ready" | "error";
  type DetailTab = "markdown" | "json";

  interface MarkdownBlock {
    kind: "heading" | "paragraph" | "list" | "quote" | "code";
    text?: string;
    level?: 1 | 2 | 3;
    items?: string[];
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

  const allOption = "all";
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
  const incomingRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : relations
          .filter((relation) => relation.to === selectedObject.id)
          .sort(compareRelations)
  );
  const outgoingRelations = $derived.by(() =>
    selectedObject === null
      ? []
      : relations
          .filter((relation) => relation.from === selectedObject.id)
          .sort(compareRelations)
  );
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metadata-panel,
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
