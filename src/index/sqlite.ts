import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { aictxError } from "../core/errors.js";
import { resolveInsideRoot } from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import { migrateIndexDatabase } from "./migrations.js";
import { openSqliteDatabase, type SqliteDatabase } from "./sqlite-driver.js";

export const INDEX_DATABASE_RELATIVE_PATH = "index/aictx.sqlite";

export interface OpenIndexDatabaseOptions {
  aictxRoot: string;
  migrate?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export interface IndexDatabaseConnection {
  readonly path: string;
  readonly db: SqliteDatabase;
  close(): Result<void>;
  transaction<T>(callback: (db: SqliteDatabase) => T): Result<T>;
}

export async function resolveIndexDatabasePath(aictxRoot: string): Promise<Result<string>> {
  const resolved = resolveInsideRoot(aictxRoot, INDEX_DATABASE_RELATIVE_PATH);

  if (!resolved.ok) {
    return resolved;
  }

  return ok(resolved.data);
}

export async function openIndexDatabase(
  options: OpenIndexDatabaseOptions
): Promise<Result<IndexDatabaseConnection>> {
  const databasePath = await prepareIndexDatabasePath(options.aictxRoot);

  if (!databasePath.ok) {
    return databasePath;
  }

  let db: SqliteDatabase;

  try {
    db = await openSqliteDatabase(databasePath.data, {
      ...(options.readonly === undefined ? {} : { readonly: options.readonly }),
      ...(options.fileMustExist === undefined ? {} : { fileMustExist: options.fileMustExist })
    });
  } catch (error) {
    return err(
      aictxError("AICtxIndexUnavailable", "SQLite index database could not be opened.", {
        path: databasePath.data,
        message: messageFromUnknown(error)
      })
    );
  }

  const connection = createConnection(databasePath.data, db);

  if (options.migrate !== false) {
    const migrated = migrateIndexDatabase(db);

    if (!migrated.ok) {
      connection.close();
      return migrated;
    }
  }

  return ok(connection);
}

async function prepareIndexDatabasePath(aictxRoot: string): Promise<Result<string>> {
  const resolved = await resolveIndexDatabasePath(aictxRoot);

  if (!resolved.ok) {
    return resolved;
  }

  const rootPath = resolve(aictxRoot);
  const databasePath = resolved.data;
  const indexDirectory = dirname(databasePath);

  try {
    await mkdir(indexDirectory, { recursive: true });

    const [realRoot, realIndexDirectory] = await Promise.all([
      realpath(rootPath),
      realpath(indexDirectory)
    ]);

    if (!isInsideOrEqual(realRoot, realIndexDirectory)) {
      return err(
        aictxError(
          "AICtxValidationFailed",
          "SQLite index directory resolves outside the Aictx root.",
          {
            aictxRoot: realRoot,
            indexDirectory: realIndexDirectory
          }
        )
      );
    }

    const existingDatabase = await lstat(databasePath).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (existingDatabase?.isSymbolicLink() === true) {
      return err(
        aictxError("AICtxValidationFailed", "Refusing to open SQLite index through a symbolic link.", {
          path: databasePath
        })
      );
    }

    return ok(databasePath);
  } catch (error) {
    return err(
      aictxError("AICtxIndexUnavailable", "SQLite index database path could not be prepared.", {
        path: databasePath,
        message: messageFromUnknown(error)
      })
    );
  }
}

function createConnection(path: string, db: SqliteDatabase): IndexDatabaseConnection {
  let closed = false;

  return {
    path,
    db,
    close(): Result<void> {
      if (closed) {
        return ok(undefined);
      }

      try {
        db.close();
        closed = true;
        return ok(undefined);
      } catch (error) {
        return err(
          aictxError("AICtxIndexUnavailable", "SQLite index database could not be closed.", {
            path,
            message: messageFromUnknown(error)
          })
        );
      }
    },
    transaction<T>(callback: (db: SqliteDatabase) => T): Result<T> {
      try {
        const run = db.transaction(() => callback(db));
        return ok(run());
      } catch (error) {
        return err(
          aictxError("AICtxIndexUnavailable", "SQLite index transaction failed.", {
            path,
            message: messageFromUnknown(error)
          })
        );
      }
    }
  };
}

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
