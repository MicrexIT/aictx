import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const sourceDir = "src/schemas";
const targetDir = "dist/schemas";

await mkdir(targetDir, { recursive: true });

for (const file of await readdir(sourceDir)) {
  if (file.endsWith(".schema.json")) {
    await copyFile(join(sourceDir, file), join(targetDir, file));
  }
}
