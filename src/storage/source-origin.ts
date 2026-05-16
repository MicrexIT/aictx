import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type { IsoDateTime, SourceOrigin } from "../core/types.js";

export interface FileSourceOriginOptions {
  projectRoot: string;
  locator: string;
  capturedAt?: IsoDateTime;
}

export async function fileSourceOrigin(
  options: FileSourceOriginOptions
): Promise<SourceOrigin> {
  const origin: SourceOrigin = {
    kind: "file",
    locator: options.locator,
    ...(options.capturedAt === undefined ? {} : { captured_at: options.capturedAt })
  };
  const mediaType = mediaTypeForPath(options.locator);

  if (mediaType !== undefined) {
    origin.media_type = mediaType;
  }

  try {
    const bytes = await readFile(join(options.projectRoot, options.locator));
    origin.digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    // File origin identity remains useful even when the source file is not readable.
  }

  return origin;
}

export function mediaTypeForPath(path: string): string | undefined {
  switch (extname(path).toLowerCase()) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".html":
    case ".htm":
      return "text/html";
    default:
      return undefined;
  }
}
