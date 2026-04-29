import sqlite3InitModule, {
  type BindableValue,
  type Database,
  type PreparedStatement,
  type Sqlite3Static,
  type SqlValue
} from "@sqlite.org/sqlite-wasm";
import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

export type SqliteBindValue = BindableValue;
export type SqliteRow = Record<string, SqlValue>;
export type SqliteParameters =
  | readonly SqliteBindValue[]
  | Record<string, SqliteBindValue>
  | SqliteBindValue;

export interface SqliteRunResult {
  changes: number;
}

export interface SqliteStatement<TParams = unknown, TResult = SqliteRow> {
  run(...params: StatementArguments<TParams>): SqliteRunResult;
  get(...params: StatementArguments<TParams>): TResult | undefined;
  all(...params: StatementArguments<TParams>): TResult[];
  finalize(): void;
}

export interface SqliteDatabase {
  readonly open: boolean;
  close(): void;
  exec(sql: string): void;
  pragma(sql: string): void;
  persist(): void;
  prepare<TParams = unknown, TResult = SqliteRow>(
    sql: string
  ): SqliteStatement<TParams, TResult>;
  transaction<T>(callback: () => T): () => T;
}

export interface OpenSqliteDatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
}

type StatementArguments<TParams> = TParams extends readonly unknown[]
  ? TParams
  : TParams extends Record<string, unknown>
    ? [TParams]
    : readonly SqliteBindValue[];

let sqlite3Promise: Promise<Sqlite3Static> | undefined;

export async function openSqliteDatabase(
  path: string,
  options: OpenSqliteDatabaseOptions = {}
): Promise<SqliteDatabase> {
  const sqlite3 = await getSqlite3();
  const existingBytes = await readExistingDatabase(path, options.fileMustExist === true);
  const db = new sqlite3.oo1.DB(":memory:", "c");

  if (existingBytes !== null) {
    deserializeDatabase(sqlite3, db, existingBytes, options.readonly === true);
  }

  return new WasmSqliteDatabase(sqlite3, db, path, options.readonly === true);
}

async function getSqlite3(): Promise<Sqlite3Static> {
  sqlite3Promise ??= sqlite3InitModule();

  return sqlite3Promise;
}

async function readExistingDatabase(
  path: string,
  fileMustExist: boolean
): Promise<Uint8Array | null> {
  try {
    const bytes = await readFile(path);

    return bytes.byteLength === 0 ? null : new Uint8Array(bytes);
  } catch (error) {
    if (errorCode(error) === "ENOENT" && !fileMustExist) {
      return null;
    }

    throw error;
  }
}

function deserializeDatabase(
  sqlite3: Sqlite3Static,
  db: Database,
  bytes: Uint8Array,
  readonly: boolean
): void {
  const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
  const flags =
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
    (readonly ? sqlite3.capi.SQLITE_DESERIALIZE_READONLY : sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE);
  const result = sqlite3.capi.sqlite3_deserialize(
    db,
    "main",
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    flags
  );

  if (result !== sqlite3.capi.SQLITE_OK) {
    throw new Error(`SQLite database could not be loaded: ${sqlite3.capi.sqlite3_js_rc_str(result)}`);
  }
}

class WasmSqliteDatabase implements SqliteDatabase {
  readonly #sqlite3: Sqlite3Static;
  readonly #db: Database;
  readonly #path: string;
  readonly #readonly: boolean;
  readonly #statements = new Set<WasmSqliteStatement>();
  #open = true;
  #transactionDepth = 0;

  constructor(sqlite3: Sqlite3Static, db: Database, path: string, readonly: boolean) {
    this.#sqlite3 = sqlite3;
    this.#db = db;
    this.#path = path;
    this.#readonly = readonly;
  }

  get open(): boolean {
    return this.#open;
  }

  close(): void {
    if (!this.#open) {
      return;
    }

    let bytes: Uint8Array | null = null;

    try {
      for (const statement of this.#statements) {
        statement.finalize();
      }
      this.#statements.clear();

      if (!this.#readonly) {
        bytes = this.#sqlite3.capi.sqlite3_js_db_export(this.#db);
      }
    } finally {
      this.#db.close();
      this.#open = false;
    }

    if (bytes !== null) {
      writeDatabaseAtomically(this.#path, bytes);
    }
  }

  exec(sql: string): void {
    this.#execRaw(sql);
    this.#markDirty();
  }

  pragma(sql: string): void {
    this.exec(`PRAGMA ${sql}`);
  }

  persist(): void {
    if (this.#readonly || !this.#open) {
      return;
    }

    writeDatabaseAtomically(this.#path, this.#sqlite3.capi.sqlite3_js_db_export(this.#db));
  }

  prepare<TParams = unknown, TResult = SqliteRow>(
    sql: string
  ): SqliteStatement<TParams, TResult> {
    const statement = new WasmSqliteStatement(this.#db.prepare(sql), () => this.#markDirty());

    this.#statements.add(statement);

    return statement as unknown as SqliteStatement<TParams, TResult>;
  }

  transaction<T>(callback: () => T): () => T {
    return () => {
      this.#execRaw("BEGIN IMMEDIATE");
      this.#transactionDepth += 1;

      try {
        const result = callback();

        this.#transactionDepth -= 1;
        this.#execRaw("COMMIT");
        this.persist();
        return result;
      } catch (error) {
        this.#transactionDepth = Math.max(0, this.#transactionDepth - 1);
        try {
          this.#execRaw("ROLLBACK");
        } catch {
          // Preserve the original transaction failure.
        }

        throw error;
      }
    };
  }

  #execRaw(sql: string): void {
    this.#db.exec(sql);
  }

  #markDirty(): void {
    if (this.#transactionDepth === 0) {
      this.persist();
    }
  }
}

class WasmSqliteStatement {
  readonly #statement: PreparedStatement;
  readonly #markDirty: () => void;
  #finalized = false;

  constructor(statement: PreparedStatement, markDirty: () => void) {
    this.#statement = statement;
    this.#markDirty = markDirty;
  }

  run(...params: readonly unknown[]): SqliteRunResult {
    this.#resetAndBind(params);

    while (this.#statement.step()) {
      // Drain any rows so statements with RETURNING clauses finish cleanly.
    }

    this.#statement.reset(true);
    this.#markDirty();

    return { changes: 0 };
  }

  get(...params: readonly unknown[]): SqliteRow | undefined {
    this.#resetAndBind(params);

    try {
      if (!this.#statement.step()) {
        return undefined;
      }

      return this.#statement.get({}) as SqliteRow;
    } finally {
      this.#statement.reset(true);
    }
  }

  all(...params: readonly unknown[]): SqliteRow[] {
    this.#resetAndBind(params);

    try {
      const rows: SqliteRow[] = [];

      while (this.#statement.step()) {
        rows.push(this.#statement.get({}) as SqliteRow);
      }

      return rows;
    } finally {
      this.#statement.reset(true);
    }
  }

  finalize(): void {
    if (this.#finalized) {
      return;
    }

    this.#statement.finalize();
    this.#finalized = true;
  }

  #resetAndBind(params: readonly unknown[]): void {
    this.#statement.reset(true);

    const binding = this.#normalizeBinding(params);

    if (binding !== undefined) {
      this.#statement.bind(binding);
    }
  }

  #normalizeBinding(params: readonly unknown[]): SqliteParameters | undefined {
    if (params.length === 0) {
      return undefined;
    }

    if (params.length === 1) {
      const [only] = params;

      if (isRecord(only)) {
        return this.#normalizeNamedBinding(only);
      }

      return only as SqliteBindValue;
    }

    return params as readonly SqliteBindValue[];
  }

  #normalizeNamedBinding(value: Record<string, unknown>): Record<string, SqliteBindValue> {
    const normalized: Record<string, SqliteBindValue> = {};

    for (const [key, bindValue] of Object.entries(value)) {
      normalized[this.#normalizedParameterName(key)] = bindValue as SqliteBindValue;
    }

    return normalized;
  }

  #normalizedParameterName(key: string): string {
    if (key.startsWith("@") || key.startsWith(":") || key.startsWith("$")) {
      return key;
    }

    for (const prefix of ["@", ":", "$"]) {
      const candidate = `${prefix}${key}`;
      const index = this.#statement.getParamIndex(candidate);

      if (typeof index === "number" && index > 0) {
        return candidate;
      }
    }

    return key;
  }
}

function writeDatabaseAtomically(path: string, bytes: Uint8Array): void {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;

  try {
    writeFileSync(temporaryPath, bytes);
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original write or rename error.
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}
