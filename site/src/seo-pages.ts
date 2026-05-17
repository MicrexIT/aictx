export interface KeywordLandingPage {
  slug: string;
  title: string;
  description: string;
  kicker: string;
  h1: string;
  lead: string;
  primaryCta: {
    href: string;
    label: string;
  };
  secondaryCta?: {
    href: string;
    label: string;
  };
  keywords: string[];
  sections: {
    eyebrow: string;
    title: string;
    body: string;
  }[];
  related: {
    href: string;
    label: string;
  }[];
}

export const keywordLandingPages: KeywordLandingPage[] = [
  {
    slug: "persistent-memory-ai-coding-agents",
    title: "Persistent Memory for AI Coding Agents - Memory by Aictx",
    description:
      "Memory by Aictx gives Claude Code, Codex, Cursor, Cline, and MCP-capable AI coding assistants persistent, local, reviewable, auto-maintained project memory across sessions.",
    kicker: "Persistent Memory",
    h1: "Persistent memory for AI coding agents that stays in your repo.",
    lead:
      "Memory gives coding agents a local project memory layer for product intent, architecture decisions, repo conventions, workflows, and gotchas. Agents load a task-focused context pack before work and save durable knowledge after meaningful changes.",
    primaryCta: {
      href: "https://docs.aictx.dev/getting-started/",
      label: "Install Memory"
    },
    secondaryCta: {
      href: "https://github.com/aictx/memory",
      label: "View on GitHub"
    },
    keywords: [
      "persistent memory for AI coding agents",
      "long-term memory for coding assistants",
      "project memory",
      "agent memory",
      "durable context",
      "local-first memory"
    ],
    sections: [
      {
        eyebrow: "Cross-session context",
        title: "Stop losing project decisions between agent sessions.",
        body:
          "Instead of rebuilding context from chat history, Memory stores reusable project knowledge as local, reviewable files that future coding agents can load on demand."
      },
      {
        eyebrow: "Repo-native storage",
        title: "Persistent does not have to mean hosted.",
        body:
          "Memory keeps canonical knowledge under `.memory/`, so teams can inspect changes, review them in Git, and repair stale facts instead of trusting an opaque memory service."
      },
      {
        eyebrow: "Focused retrieval",
        title: "Load the right memory, not every note.",
        body:
          "`memory load` compiles a small context pack for coding, debugging, review, architecture, or onboarding work, reducing token noise while keeping important constraints active."
      }
    ],
    related: [
      { href: "/mcp-memory-server/", label: "MCP memory server" },
      { href: "/claude-code-memory/", label: "Claude Code memory" },
      { href: "/codex-memory/", label: "Codex memory" }
    ]
  },
  {
    slug: "mcp-memory-server",
    title: "MCP Memory Server for AI Coding Agents - Memory by Aictx",
    description:
      "Use the Memory MCP server with MCP-capable coding agents to load, search, inspect, remember, save, and diff local project memory.",
    kicker: "MCP Memory Server",
    h1: "A local MCP memory server for coding agents.",
    lead:
      "`memory-mcp` exposes Memory's routine project-memory tools to MCP-capable clients while keeping setup, viewer, recovery, and maintenance workflows in the CLI.",
    primaryCta: {
      href: "https://docs.aictx.dev/mcp/",
      label: "Read MCP guide"
    },
    secondaryCta: {
      href: "https://docs.aictx.dev/agent-integration/",
      label: "Agent integration"
    },
    keywords: [
      "MCP memory server",
      "Model Context Protocol memory",
      "AI agent memory MCP",
      "memory-mcp",
      "local MCP server",
      "project context MCP"
    ],
    sections: [
      {
        eyebrow: "Routine tools",
        title: "Expose memory loading and saving where the agent works.",
        body:
          "MCP clients can call `load_memory`, `search_memory`, `inspect_memory`, `remember_memory`, `save_memory_patch`, and `diff_memory` after they launch `memory-mcp`."
      },
      {
        eyebrow: "CLI boundary",
        title: "Keep setup and maintenance explicit.",
        body:
          "Memory stays CLI-first for setup, checks, viewer launch, wiki ingest, recovery, export, and graph inspection, which keeps operational work auditable."
      },
      {
        eyebrow: "Local-first",
        title: "Use MCP without handing project memory to a hosted service.",
        body:
          "The MCP server reads and writes the same local project memory files as the CLI, preserving Git review and project isolation."
      }
    ],
    related: [
      { href: "/persistent-memory-ai-coding-agents/", label: "Persistent AI agent memory" },
      { href: "/claude-code-memory/", label: "Claude Code memory" },
      { href: "https://docs.aictx.dev/reference/", label: "CLI and MCP reference" }
    ]
  },
  {
    slug: "claude-code-memory",
    title: "Claude Code Project Memory - Memory by Aictx",
    description:
      "Use Memory with Claude Code to keep CLAUDE.md small while durable project context, decisions, workflows, and gotchas live in local project memory.",
    kicker: "Claude Code Memory",
    h1: "Claude Code project memory without turning CLAUDE.md into a wiki.",
    lead:
      "Memory works with Claude Code by keeping behavioral guidance in `CLAUDE.md` and moving evolving project knowledge into local, typed, reviewable memory.",
    primaryCta: {
      href: "https://docs.aictx.dev/agent-recipes/#claude-code",
      label: "Claude Code recipe"
    },
    secondaryCta: {
      href: "/persistent-memory-ai-coding-agents/",
      label: "Persistent memory"
    },
    keywords: [
      "Claude Code memory",
      "CLAUDE.md project memory",
      "Claude Code persistent memory",
      "Claude Code MCP memory",
      "agent instruction files"
    ],
    sections: [
      {
        eyebrow: "Small CLAUDE.md",
        title: "Keep instructions stable and project knowledge retrievable.",
        body:
          "`memory setup` writes compact Claude Code guidance, while Memory stores product intent, decisions, conventions, and traps where agents can retrieve them by task."
      },
      {
        eyebrow: "Session continuity",
        title: "Carry durable context across Claude Code sessions.",
        body:
          "Claude Code can start from `memory load` instead of asking you to repeat repository context after every new session or context reset."
      },
      {
        eyebrow: "Optional MCP",
        title: "Use the CLI first, then add MCP when Claude exposes it.",
        body:
          "The default workflow stays simple: `memory load`, work, `memory remember --stdin`, and inspect with `memory diff` or `memory view`."
      }
    ],
    related: [
      { href: "/mcp-memory-server/", label: "MCP memory server" },
      { href: "/codex-memory/", label: "Codex memory" },
      { href: "https://docs.aictx.dev/agent-recipes/", label: "Agent recipes" }
    ]
  },
  {
    slug: "codex-memory",
    title: "Codex Project Memory - Memory by Aictx",
    description:
      "Use Memory with Codex and AGENTS.md to give coding agents local project memory for decisions, conventions, workflows, gotchas, and source-backed context.",
    kicker: "Codex Memory",
    h1: "Codex project memory for AGENTS.md-based workflows.",
    lead:
      "Memory keeps Codex guidance short and operational while giving the agent task-focused access to durable project context stored in the repo.",
    primaryCta: {
      href: "https://docs.aictx.dev/agent-recipes/#codex",
      label: "Codex recipe"
    },
    secondaryCta: {
      href: "https://github.com/aictx/memory",
      label: "Install from GitHub"
    },
    keywords: [
      "Codex memory",
      "Codex project memory",
      "AGENTS.md memory",
      "Codex persistent memory",
      "OpenAI Codex agent memory"
    ],
    sections: [
      {
        eyebrow: "AGENTS.md stays focused",
        title: "Use AGENTS.md for behavior, not every project fact.",
        body:
          "`memory setup` updates the marked Memory section in `AGENTS.md`, then durable project knowledge lives in Memory where it can be loaded, inspected, and repaired."
      },
      {
        eyebrow: "Task-shaped context",
        title: "Give Codex the context needed for the current edit.",
        body:
          "`memory load \"<task>\"` ranks relevant decisions, constraints, workflows, gotchas, and source-backed syntheses before Codex touches the code."
      },
      {
        eyebrow: "Reviewable saves",
        title: "Make useful discoveries survive the chat.",
        body:
          "After meaningful work, `memory remember --stdin` saves durable context as local files so the next Codex session can start from current project memory."
      }
    ],
    related: [
      { href: "/persistent-memory-ai-coding-agents/", label: "Persistent AI agent memory" },
      { href: "/mcp-memory-server/", label: "MCP memory server" },
      { href: "/claude-code-memory/", label: "Claude Code memory" }
    ]
  },
  {
    slug: "cursor-memory",
    title: "Cursor Project Memory - Memory by Aictx",
    description:
      "Use Memory with Cursor rules to keep project context local, reviewable, and task-focused for AI coding assistants across sessions.",
    kicker: "Cursor Memory",
    h1: "Cursor project memory that stays local and reviewable.",
    lead:
      "Memory complements Cursor rules by keeping instructions compact and storing evolving project facts in local project memory that agents can load before work.",
    primaryCta: {
      href: "https://docs.aictx.dev/agent-recipes/#cursor",
      label: "Cursor recipe"
    },
    secondaryCta: {
      href: "https://docs.aictx.dev/getting-started/",
      label: "Get started"
    },
    keywords: [
      "Cursor memory",
      "Cursor project memory",
      "Cursor rules memory",
      "AI coding assistant memory",
      "local project context"
    ],
    sections: [
      {
        eyebrow: "Rules stay small",
        title: "Keep Cursor rules focused on how to use memory.",
        body:
          "Generated guidance tells the agent when to load and save Memory, while project-specific facts live in `.memory/` instead of growing stale inside a rules file."
      },
      {
        eyebrow: "Local project context",
        title: "Retrieve decisions and conventions only when relevant.",
        body:
          "Memory helps Cursor sessions load the product intent, architecture, setup steps, and known traps that match the task at hand."
      },
      {
        eyebrow: "Cross-tool continuity",
        title: "Share durable context with other coding agents.",
        body:
          "The same project memory can support Cursor, Codex, Claude Code, Cline, OpenCode, and MCP-capable clients without duplicating facts across tools."
      }
    ],
    related: [
      { href: "/persistent-memory-ai-coding-agents/", label: "Persistent AI agent memory" },
      { href: "/codex-memory/", label: "Codex memory" },
      { href: "/claude-code-memory/", label: "Claude Code memory" }
    ]
  }
];

export function keywordPagePath(page: KeywordLandingPage): string {
  return `/${page.slug}/`;
}
