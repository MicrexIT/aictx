import { resolveProjectPaths } from "../../core/paths.js";

const writeQueues = new Map<string, Promise<void>>();

export async function resolveWriteQueueKey(cwd: string): Promise<string> {
  const paths = await resolveProjectPaths({
    cwd,
    mode: "require-initialized"
  });

  return paths.ok ? paths.data.projectRoot : cwd;
}

export async function serializeProjectWrite<T>(
  projectKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = writeQueues.get(projectKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);

  writeQueues.set(projectKey, queued);
  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseCurrent();

    if (writeQueues.get(projectKey) === queued) {
      writeQueues.delete(projectKey);
    }
  }
}
