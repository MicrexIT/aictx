import { memoryError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

const MAX_HINT_ITEMS = 50;

export interface RetrievalHints {
  files?: string[];
  changed_files?: string[];
  symbols?: string[];
  subsystems?: string[];
  history_window?: string;
}

export interface NormalizedRetrievalHints {
  files: string[];
  changed_files: string[];
  symbols: string[];
  subsystems: string[];
  history_window: string | null;
}

type HintArrayField = "files" | "changed_files" | "symbols" | "subsystems";

const EMPTY_HINTS: NormalizedRetrievalHints = {
  files: [],
  changed_files: [],
  symbols: [],
  subsystems: [],
  history_window: null
};

export function normalizeRetrievalHints(
  hints: RetrievalHints | undefined
): Result<NormalizedRetrievalHints> {
  if (hints === undefined) {
    return ok(EMPTY_HINTS);
  }

  if (!isRecord(hints)) {
    return invalidHints("Retrieval hints must be an object.", {
      field: "hints"
    });
  }

  const files = normalizeHintArray(hints.files, "files", normalizePathHint);
  if (!files.ok) {
    return files;
  }

  const changedFiles = normalizeHintArray(
    hints.changed_files,
    "changed_files",
    normalizePathHint
  );
  if (!changedFiles.ok) {
    return changedFiles;
  }

  const symbols = normalizeHintArray(hints.symbols, "symbols", normalizeTextHint);
  if (!symbols.ok) {
    return symbols;
  }

  const subsystems = normalizeHintArray(
    hints.subsystems,
    "subsystems",
    normalizeTextHint
  );
  if (!subsystems.ok) {
    return subsystems;
  }

  const historyWindow = normalizeHistoryWindow(hints.history_window);
  if (!historyWindow.ok) {
    return historyWindow;
  }

  return ok({
    files: files.data,
    changed_files: changedFiles.data,
    symbols: symbols.data,
    subsystems: subsystems.data,
    history_window: historyWindow.data
  });
}

export function retrievalHintsHaveSignal(hints: NormalizedRetrievalHints): boolean {
  return (
    hints.files.length > 0 ||
    hints.changed_files.length > 0 ||
    hints.symbols.length > 0 ||
    hints.subsystems.length > 0
  );
}

export function hintSearchText(hints: NormalizedRetrievalHints): string {
  return [
    ...hints.files,
    ...hints.changed_files,
    ...hints.symbols,
    ...hints.subsystems
  ].join(" ");
}

export function hintedFiles(hints: NormalizedRetrievalHints): string[] {
  return uniqueSorted([...hints.files, ...hints.changed_files]);
}

function normalizeHintArray(
  value: unknown,
  field: HintArrayField,
  normalizeItem: (value: string) => string | null
): Result<string[]> {
  if (value === undefined) {
    return ok([]);
  }

  if (!Array.isArray(value)) {
    return invalidHints("Retrieval hint field must be an array of strings.", {
      field: `hints.${field}`
    });
  }

  if (value.length > MAX_HINT_ITEMS) {
    return invalidHints("Retrieval hint field has too many items.", {
      field: `hints.${field}`,
      maximum: MAX_HINT_ITEMS,
      actual: value.length
    });
  }

  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return invalidHints("Retrieval hint items must be strings.", {
        field: `hints.${field}`
      });
    }

    const normalizedItem = normalizeItem(item);

    if (normalizedItem !== null) {
      normalized.push(normalizedItem);
    }
  }

  return ok(uniqueSorted(normalized));
}

function normalizePathHint(value: string): string | null {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");

  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("\0") ||
    normalized.includes("://") ||
    normalized.startsWith(".memory/")
  ) {
    return null;
  }

  return normalized;
}

function normalizeTextHint(value: string): string | null {
  const normalized = value.trim().replace(/\s+/gu, " ");

  if (normalized === "" || normalized.includes("\0")) {
    return null;
  }

  return normalized;
}

function normalizeHistoryWindow(value: unknown): Result<string | null> {
  if (value === undefined) {
    return ok(null);
  }

  if (typeof value !== "string") {
    return invalidHints("Retrieval hint history_window must be a string.", {
      field: "hints.history_window"
    });
  }

  const normalized = value.trim();

  if (normalized === "") {
    return ok(null);
  }

  if (!/^[1-9][0-9]{0,3}[dwmy]$/u.test(normalized)) {
    return invalidHints(
      "Retrieval hint history_window must use a compact duration like 30d, 12w, 6m, or 1y.",
      {
        field: "hints.history_window",
        actual: normalized
      }
    );
  }

  return ok(normalized);
}

function invalidHints<T>(message: string, details: JsonValue): Result<T> {
  return err(memoryError("MemoryValidationFailed", message, details));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
