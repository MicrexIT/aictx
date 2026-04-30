import { readFile, writeFile } from "node:fs/promises";

const repoRootUrl = new URL("../", import.meta.url);
const packageJsonUrl = new URL("package.json", repoRootUrl);
const versionUrl = new URL("src/generated/version.ts", repoRootUrl);

const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  throw new Error("package.json must declare a non-empty version.");
}

await writeFile(versionUrl, `export const version = ${JSON.stringify(packageJson.version)};\n`);
