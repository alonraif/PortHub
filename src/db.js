import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { encryptString, decryptString } from "./crypto.js";

const dbPath = path.join(process.cwd(), "data", "ssh_library.sqlite");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);
const DEFAULT_FOLDER_NAME = "Unsorted";

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host_enc TEXT NOT NULL,
      username_enc TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      port INTEGER,
      port_is_dynamic INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL
    );
  `);

  const columns = db.prepare("PRAGMA table_info(connections)").all();
  const names = columns.map((col) => col.name);
  if (!names.includes("folder_id")) {
    db.exec("ALTER TABLE connections ADD COLUMN folder_id INTEGER");
  }
  if (!names.includes("sort_order")) {
    db.exec("ALTER TABLE connections ADD COLUMN sort_order INTEGER");
  }

  const defaultId = getDefaultFolderId();

  const orphaned = db
    .prepare("SELECT id FROM connections WHERE folder_id IS NULL")
    .all();
  if (orphaned.length) {
    const stmt = db.prepare(
      "UPDATE connections SET folder_id = ?, sort_order = ? WHERE id = ?"
    );
    orphaned.forEach((row, index) => {
      stmt.run(defaultId, index + 1, row.id);
    });
  }
}

function getDefaultFolderId() {
  const existing = db
    .prepare("SELECT id FROM folders WHERE name = ?")
    .get(DEFAULT_FOLDER_NAME);
  if (existing) return existing.id;

  const maxSort = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM folders")
    .get();
  const info = db
    .prepare("INSERT INTO folders (name, sort_order) VALUES (?, ?)")
    .run(DEFAULT_FOLDER_NAME, maxSort.maxSort + 1);
  return info.lastInsertRowid;
}

function nextSortOrder(folderId) {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM connections WHERE folder_id = ?"
    )
    .get(folderId);
  return row.maxSort + 1;
}

function normalizePayload(payload) {
  const name = String(payload.name || "").trim();
  const host = String(payload.host || "").trim();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");
  const portIsDynamic = Boolean(payload.portIsDynamic);
  const port = portIsDynamic ? null : Number(payload.port);
  const rawFolderId = payload.folderId ? Number(payload.folderId) : null;
  const rawSortOrder = payload.sortOrder ? Number(payload.sortOrder) : null;
  const folderId = Number.isNaN(rawFolderId) ? null : rawFolderId;
  const sortOrder = Number.isNaN(rawSortOrder) ? null : rawSortOrder;
  if (!name || !host || !username) {
    throw new Error("name, host, and username are required");
  }
  if (!portIsDynamic && (!port || Number.isNaN(port))) {
    throw new Error("static port is required");
  }
  return { name, host, username, password, portIsDynamic, port, folderId, sortOrder };
}

function toRow(payload) {
  return {
    name: payload.name,
    host_enc: encryptString(payload.host),
    username_enc: encryptString(payload.username),
    password_enc: encryptString(payload.password),
    port: payload.port,
    port_is_dynamic: payload.portIsDynamic ? 1 : 0,
    folder_id: payload.folderId,
    sort_order: payload.sortOrder,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    host: decryptString(row.host_enc),
    username: decryptString(row.username_enc),
    password: decryptString(row.password_enc),
    port: row.port,
    portIsDynamic: Boolean(row.port_is_dynamic),
    folderId: row.folder_id,
    sortOrder: row.sort_order,
  };
}

export function listConnections() {
  const stmt = db.prepare(
    "SELECT * FROM connections ORDER BY folder_id ASC, sort_order ASC, name ASC"
  );
  return stmt.all().map(fromRow);
}

export function getConnection(id) {
  const stmt = db.prepare("SELECT * FROM connections WHERE id = ?");
  const row = stmt.get(id);
  return fromRow(row);
}

export function createConnection(payload) {
  const normalized = normalizePayload(payload);
  const folderId = normalized.folderId || getDefaultFolderId();
  const sortOrder = normalized.sortOrder || nextSortOrder(folderId);
  const row = toRow(normalized);
  row.folder_id = folderId;
  row.sort_order = sortOrder;
  const stmt = db.prepare(
    `INSERT INTO connections (name, host_enc, username_enc, password_enc, port, port_is_dynamic, folder_id, sort_order)
     VALUES (@name, @host_enc, @username_enc, @password_enc, @port, @port_is_dynamic, @folder_id, @sort_order)`
  );
  const info = stmt.run(row);
  return getConnection(info.lastInsertRowid);
}

export function updateConnection(id, payload) {
  const existing = getConnection(id);
  if (!existing) return null;
  const normalized = normalizePayload(payload);
  const folderId = normalized.folderId || getDefaultFolderId();
  let sortOrder = normalized.sortOrder || existing.sortOrder || 0;
  if (existing.folderId !== folderId) {
    sortOrder = nextSortOrder(folderId);
  }
  const row = toRow(normalized);
  row.folder_id = folderId;
  row.sort_order = sortOrder;
  const stmt = db.prepare(
    `UPDATE connections
     SET name = @name,
         host_enc = @host_enc,
         username_enc = @username_enc,
         password_enc = @password_enc,
         port = @port,
         port_is_dynamic = @port_is_dynamic,
         folder_id = @folder_id,
         sort_order = @sort_order
     WHERE id = @id`
  );
  stmt.run({ ...row, id });
  return getConnection(id);
}

export function deleteConnection(id) {
  const stmt = db.prepare("DELETE FROM connections WHERE id = ?");
  const info = stmt.run(id);
  return info.changes > 0;
}

export function listFolders() {
  return db
    .prepare("SELECT * FROM folders ORDER BY sort_order ASC, name ASC")
    .all();
}

export function createFolder(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw new Error("folder name is required");
  }
  const maxSort = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM folders")
    .get();
  const info = db
    .prepare("INSERT INTO folders (name, sort_order) VALUES (?, ?)")
    .run(trimmed, maxSort.maxSort + 1);
  return db.prepare("SELECT * FROM folders WHERE id = ?").get(info.lastInsertRowid);
}

export function updateFolder(id, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw new Error("folder name is required");
  }
  if (trimmed === DEFAULT_FOLDER_NAME) {
    throw new Error("reserved folder name");
  }
  const stmt = db.prepare("UPDATE folders SET name = ? WHERE id = ?");
  const info = stmt.run(trimmed, id);
  if (!info.changes) return null;
  return db.prepare("SELECT * FROM folders WHERE id = ?").get(id);
}

export function deleteFolder(id) {
  const defaultId = getDefaultFolderId();
  if (id === defaultId) {
    throw new Error("cannot delete default folder");
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE connections SET folder_id = ? WHERE folder_id = ?").run(
      defaultId,
      id
    );
    const info = db.prepare("DELETE FROM folders WHERE id = ?").run(id);
    return info.changes > 0;
  });
  return tx();
}

export function reorderConnections(folderId, orderedIds) {
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      "UPDATE connections SET folder_id = ?, sort_order = ? WHERE id = ?"
    );
    orderedIds.forEach((id, index) => {
      stmt.run(folderId, index + 1, id);
    });
  });
  tx();
  return true;
}

export function defaultFolderId() {
  return getDefaultFolderId();
}
