import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  extractFirstH1,
  hasYamlFrontmatter,
  normalizeMarkdownForStorage,
  readMarkdownBody,
  validateMarkdownBody
} from "../../../src/storage/markdown.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Markdown storage helpers", () => {
  describe("normalizeMarkdownForStorage", () => {
    it("normalizes CRLF and CR line endings to LF deterministically", () => {
      expect(normalizeMarkdownForStorage("# Example\r\n\r\nBody\rTail\n")).toBe(
        "# Example\n\nBody\nTail\n"
      );
    });

    it("removes a leading UTF-8 BOM without trimming Markdown body content", () => {
      expect(normalizeMarkdownForStorage("\uFEFF  # Example  \n\nBody  ")).toBe(
        "  # Example  \n\nBody  "
      );
    });

    it("does not invent a trailing LF", () => {
      expect(normalizeMarkdownForStorage("# Example\r\nBody")).toBe("# Example\nBody");
    });
  });

  describe("extractFirstH1", () => {
    it("extracts the first H1 heading", () => {
      expect(extractFirstH1("# Billing retries moved to queue worker\n\nBody")).toBe(
        "Billing retries moved to queue worker"
      );
    });

    it("finds the first H1 after prose and ignores H2 headings", () => {
      expect(extractFirstH1("Intro\n\n## Context\n\n# Decision\n\nBody")).toBe("Decision");
    });

    it("trims optional closing heading markers", () => {
      expect(extractFirstH1("# Decision title ###\n\nBody")).toBe("Decision title");
    });

    it("preserves a literal trailing hash in the heading text", () => {
      expect(extractFirstH1("# Use C#\n\nBody")).toBe("Use C#");
    });

    it("ignores H1-looking text inside fenced code blocks", () => {
      expect(
        extractFirstH1(["```md", "# Not a title", "```", "", "# Actual title"].join("\n"))
      ).toBe("Actual title");
    });

    it("returns null when no H1 is present", () => {
      expect(extractFirstH1("Intro\n\n## Context\n\nBody")).toBeNull();
    });
  });

  describe("hasYamlFrontmatter", () => {
    it("detects YAML frontmatter at the start of the document", () => {
      expect(hasYamlFrontmatter("---\ntitle: Example\n---\n# Example")).toBe(true);
    });

    it("detects YAML frontmatter after a UTF-8 BOM", () => {
      expect(hasYamlFrontmatter("\uFEFF---\ntitle: Example\n---\n# Example")).toBe(true);
    });

    it("does not flag thematic breaks later in the body", () => {
      expect(hasYamlFrontmatter("# Example\n\n---\n\nBody")).toBe(false);
    });
  });

  describe("validateMarkdownBody", () => {
    it("reports frontmatter as a validation error with the provided path", () => {
      const result = validateMarkdownBody(
        "---\ntitle: Example\n---\n# Example",
        ".memory/memory/notes/example.md"
      );

      expect(result).toEqual({
        valid: false,
        errors: [
          {
            code: "MemoryValidationFailed",
            message: "Markdown files must not contain YAML frontmatter.",
            path: ".memory/memory/notes/example.md",
            field: null
          }
        ],
        warnings: []
      });
    });

    it("accepts Markdown without frontmatter", () => {
      expect(validateMarkdownBody("# Example\n\nBody", ".memory/memory/notes/example.md")).toEqual({
        valid: true,
        errors: [],
        warnings: []
      });
    });
  });

  describe("readMarkdownBody", () => {
    it("reads UTF-8 Markdown and returns normalized content", async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), "memory-markdown-"));
      tempRoots.push(tempRoot);
      await mkdir(join(tempRoot, "memory"), { recursive: true });
      const path = join(tempRoot, "memory", "example.md");
      await writeFile(path, "\uFEFF# Example\r\n\r\nBody", "utf8");

      const result = await readMarkdownBody(path);

      expect(result).toEqual({
        ok: true,
        data: "# Example\n\nBody",
        warnings: []
      });
      expect(await readFile(path, "utf8")).toBe("\uFEFF# Example\r\n\r\nBody");
    });
  });
});
