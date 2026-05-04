import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const options = parseOptions(process.argv.slice(2));
const aictxRoot = join(options.root, ".aictx");
const backupRoot = join(aictxRoot, ".backup");

if (options.destroy) {
  await rm(aictxRoot, { recursive: true, force: true });
  console.log(`Deleted ${aictxRoot}.`);
} else {
  await ensureDirectory(aictxRoot, ".aictx");
  await mkdir(backupRoot, { recursive: true });
  await ensureDirectory(backupRoot, ".aictx/.backup");

  const archivePath = join(backupRoot, `aictx-${timestampForFilename()}-${randomUUID()}.tar.gz`);

  try {
    await createBackupArchive(aictxRoot, archivePath);
  } catch (error) {
    await rm(archivePath, { force: true });
    throw error;
  }

  await clearAictxRootExceptBackup(aictxRoot);
  console.log(`Backed up .aictx to ${archivePath}.`);
  console.log("Cleared .aictx contents except .backup.");
}

function parseOptions(args) {
  const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
  const options = {
    root: defaultRoot,
    destroy: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--root") {
      const value = args[index + 1];

      if (value === undefined) {
        throw new Error("--root requires a path.");
      }

      options.root = value;
      index += 1;
      continue;
    }

    if (arg === "--destroy") {
      options.destroy = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    ...options,
    root: resolve(options.root)
  };
}

async function ensureDirectory(path, label) {
  let stats;

  try {
    stats = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} directory does not exist.`);
    }

    throw error;
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
}

function createBackupArchive(sourceRoot, archivePath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "tar",
      ["-czf", archivePath, "--exclude", "./.backup", "--exclude", ".backup", "-C", sourceRoot, "."],
      {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"]
      }
    );
    const stderrChunks = [];

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      const status = signal === null ? `exit code ${exitCode}` : `signal ${signal}`;
      reject(new Error(`tar failed with ${status}${stderr.length === 0 ? "" : `: ${stderr}`}`));
    });
  });
}

async function clearAictxRootExceptBackup(root) {
  const entries = await readdir(root);

  await Promise.all(
    entries
      .filter((entry) => entry !== ".backup")
      .map((entry) => rm(join(root, entry), { recursive: true, force: true }))
  );
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
