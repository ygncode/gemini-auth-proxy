import { Database } from "bun:sqlite";
import { join } from "path";

const DATA_DIR = join(import.meta.dir, "../../data");
const DB_PATH = join(DATA_DIR, "auth.db");

export interface AuthRecord {
  id: number;
  refresh_token: string;
  access_token: string | null;
  expires_at: number | null;
  email: string | null;
  project_id: string | null;
  managed_project_id: string | null;
  updated_at: number;
}

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    // Ensure data directory exists
    const fs = require("fs");
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.run(`
      CREATE TABLE IF NOT EXISTS auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        expires_at INTEGER,
        email TEXT,
        project_id TEXT,
        managed_project_id TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  }
  return db;
}

export function getAuth(): AuthRecord | null {
  const database = getDb();
  const result = database
    .query<AuthRecord, []>("SELECT * FROM auth WHERE id = 1")
    .get();
  return result ?? null;
}

export function saveAuth(auth: {
  refresh_token: string;
  access_token?: string | null;
  expires_at?: number | null;
  email?: string | null;
  project_id?: string | null;
  managed_project_id?: string | null;
}): void {
  const database = getDb();
  const now = Date.now();

  database.run(
    `
    INSERT INTO auth (id, refresh_token, access_token, expires_at, email, project_id, managed_project_id, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      expires_at = excluded.expires_at,
      email = COALESCE(excluded.email, auth.email),
      project_id = COALESCE(excluded.project_id, auth.project_id),
      managed_project_id = COALESCE(excluded.managed_project_id, auth.managed_project_id),
      updated_at = excluded.updated_at
  `,
    [
      auth.refresh_token,
      auth.access_token ?? null,
      auth.expires_at ?? null,
      auth.email ?? null,
      auth.project_id ?? null,
      auth.managed_project_id ?? null,
      now,
    ]
  );
}

export function updateAccessToken(
  access_token: string,
  expires_at: number,
  new_refresh_token?: string
): void {
  const database = getDb();
  const now = Date.now();

  if (new_refresh_token) {
    database.run(
      `UPDATE auth SET access_token = ?, expires_at = ?, refresh_token = ?, updated_at = ? WHERE id = 1`,
      [access_token, expires_at, new_refresh_token, now]
    );
  } else {
    database.run(
      `UPDATE auth SET access_token = ?, expires_at = ?, updated_at = ? WHERE id = 1`,
      [access_token, expires_at, now]
    );
  }
}

export function updateManagedProject(managed_project_id: string): void {
  const database = getDb();
  const now = Date.now();

  database.run(
    `UPDATE auth SET managed_project_id = ?, updated_at = ? WHERE id = 1`,
    [managed_project_id, now]
  );
}

export function clearAuth(): void {
  const database = getDb();
  database.run(`DELETE FROM auth WHERE id = 1`);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
