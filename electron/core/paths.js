import fs from 'node:fs';
import path from 'node:path';

let cached = null;

/**
 * Resolve every writable location once. In tests or portable runs the caller
 * may set MF_DATA_DIR to isolate the database and documents from a real shop
 * installation.
 */
export function initPaths(app) {
  if (cached) return cached;
  const base = process.env.MF_DATA_DIR
    ? path.resolve(process.env.MF_DATA_DIR)
    : app.getPath('userData');
  const databasePath = process.env.MF_DB_PATH ? path.resolve(process.env.MF_DB_PATH) : path.join(base, 'modern-fashion.db');
  const directories = {
    base,
    backups: path.join(base, 'backups'),
    documents: path.join(base, 'documents'),
    exports: path.join(base, 'exports'),
    logs: path.join(base, 'logs'),
    assets: path.join(base, 'assets'),
  };
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  cached = { ...directories, databasePath };
  return cached;
}

export function getPaths() {
  if (!cached) throw new Error('Application paths have not been initialised.');
  return cached;
}

export function resetPathsForTests() {
  cached = null;
}
