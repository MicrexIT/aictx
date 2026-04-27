import type { MemoryEvent } from "../core/types.js";

export interface StoredMemoryEvent extends MemoryEvent {
  path: string;
  line: number;
}

export function isMemoryEvent(value: unknown): value is MemoryEvent {
  return (
    isRecord(value) &&
    typeof value.event === "string" &&
    typeof value.actor === "string" &&
    typeof value.timestamp === "string"
  );
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
