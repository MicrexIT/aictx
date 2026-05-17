import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
const currentTempRoot = realpathSync(resolve(tmpdir()));

if (isInsideOrEqual(repoRoot, currentTempRoot)) {
  const isolatedTempRoot = join(dirname(repoRoot), ".memory-test-tmp");
  mkdirSync(isolatedTempRoot, { recursive: true });
  const resolvedTempRoot = realpathSync(isolatedTempRoot);

  process.env.TMPDIR = resolvedTempRoot;
  process.env.TMP = resolvedTempRoot;
  process.env.TEMP = resolvedTempRoot;
}

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
