import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fail } from '../core/errors.js';
import { nowIso } from '../core/validation.js';
import { getSetting, saveSetting } from '../core/settings.js';
import { writeAudit } from '../core/audit.js';

function timestamp() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filename));
  return hash.digest('hex');
}

function verifyDatabaseFile(filename) {
  if (!fs.existsSync(filename)) fail('Backup file does not exist.');
  const stat = fs.statSync(filename);
  if (stat.size < 4096) fail('Backup file is too small to be a valid database.');
  const probe = new DatabaseSync(filename, { readOnly: true });
  try {
    const result = probe.prepare('PRAGMA integrity_check').all();
    const messages = result.map((row) => Object.values(row)[0]);
    if (messages.length !== 1 || messages[0] !== 'ok') {
      fail(`Backup integrity check failed: ${messages.join('; ').slice(0, 300)}`);
    }
    const tables = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sales', 'products', 'users', 'schema_migrations')")
      .all()
      .map((row) => row.name);
    if (tables.length < 4) fail('Backup does not contain the expected Modern Fashion tables.');
    return { ok: true, sizeBytes: stat.size, messages };
  } finally {
    probe.close();
  }
}

export function createBackupService({ db, dbPath, defaultBackupDir, auth, logger, onRestore }) {
  let busy = false;

  function destinationDirectory() {
    const settings = getSetting(db, 'backup');
    return settings.directory?.trim() || defaultBackupDir;
  }

  function makeBackup({ kind = 'manual', destination = null, user = null, note = '' } = {}) {
    if (busy) fail('Another backup operation is already running.');
    busy = true;
    try {
      const dir = destination || destinationDirectory();
      fs.mkdirSync(dir, { recursive: true });
      const filename = path.join(dir, `modern-fashion-${timestamp()}-${kind}.db`);
      if (fs.existsSync(filename)) fail('A backup with the same timestamp already exists. Try again.');
      const escaped = filename.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escaped}'`);
      const verification = verifyDatabaseFile(filename);
      const sha256 = sha256File(filename);
      db.prepare(
        `INSERT INTO backup_logs (path, size_bytes, sha256, kind, status, note, created_by, created_at)
         VALUES (?, ?, ?, ?, 'verified', ?, ?, ?)`
      ).run(filename, verification.sizeBytes, sha256, kind, note, user?.user?.id || user?.id || null, nowIso());
      if (kind === 'auto') {
        const backupSettings = getSetting(db, 'backup');
        saveSetting(db, 'backup', { ...backupSettings, lastAutoAt: nowIso() }, user?.user?.id || user?.id || null);
        pruneAutomaticBackups(dir, Number(backupSettings.retention || 30));
      }
      writeAudit(db, {
        userId: user?.user?.id || user?.id || null,
        userName: user?.user?.name || 'system',
        action: 'backup.created',
        entityType: 'backup',
        entityId: filename,
        details: { kind, sizeBytes: verification.sizeBytes, sha256, note },
      });
      logger?.info('Backup created', { kind, filename, sizeBytes: verification.sizeBytes });
      return { path: filename, sizeBytes: verification.sizeBytes, sha256, integrity: 'ok', kind };
    } finally {
      busy = false;
    }
  }

  function pruneAutomaticBackups(dir, retention) {
    if (!fs.existsSync(dir)) return;
    const files = fs
      .readdirSync(dir)
      .filter((name) => /^modern-fashion-\d{8}-\d{6}-auto\.db$/.test(name))
      .map((name) => path.join(dir, name))
      .sort()
      .reverse();
    const keep = Math.max(2, Number(retention) || 30);
    for (const filename of files.slice(keep)) {
      try {
        fs.unlinkSync(filename);
        logger?.info('Pruned automatic backup', { filename });
      } catch (error) {
        logger?.warn('Could not prune automatic backup', { filename, error: error.message });
      }
    }
  }

  function list({ limit = 100 } = {}) {
    auth.requirePermission('backup.manage');
    return db
      .prepare(
        `SELECT b.*, u.name AS user_name FROM backup_logs b LEFT JOIN users u ON u.id = b.created_by
         ORDER BY b.id DESC LIMIT ?`
      )
      .all(Math.min(Number(limit) || 100, 500))
      .map((row) => ({
        id: row.id,
        path: row.path,
        filename: path.basename(row.path),
        sizeBytes: row.size_bytes,
        sha256: row.sha256,
        kind: row.kind,
        status: row.status,
        note: row.note,
        createdByName: row.user_name || 'system',
        createdAt: row.created_at,
        exists: fs.existsSync(row.path),
      }));
  }

  function verify(pathToFile) {
    auth.requirePermission('backup.manage');
    const target = String(pathToFile || '').trim();
    if (!target) fail('Choose a backup file.');
    const verification = verifyDatabaseFile(target);
    const sha256 = sha256File(target);
    return { ...verification, sha256, path: target };
  }

  function createManual(user) {
    auth.requirePermission('backup.manage');
    return makeBackup({ kind: 'manual', user });
  }

  function restore(pathToFile, { confirm, user }) {
    auth.requirePermission('backup.manage');
    if (String(confirm || '') !== 'RESTORE') {
      fail('Type RESTORE to confirm replacing the live database.', 'CONFIRMATION_REQUIRED');
    }
    const target = String(pathToFile || '').trim();
    if (!target) fail('Choose a backup file to restore.');
    if (path.resolve(target) === path.resolve(dbPath)) fail('The live database cannot be restored over itself.');
    verifyDatabaseFile(target);
    const safety = makeBackup({
      kind: 'pre_restore',
      user,
      note: `Automatically created before restoring ${path.basename(target)}`,
    });
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'backup.restore_started',
      entityType: 'backup',
      entityId: target,
      details: { safetyBackup: safety.path, source: target },
    });
    onRestore({ source: target, safetyBackup: safety.path });
    return { restoring: true, safetyBackup: safety.path, source: target };
  }

  async function autoBackupIfDue() {
    if (busy) return null;
    const settings = getSetting(db, 'backup');
    if (!settings.enabled) return null;
    const last = settings.lastAutoAt ? new Date(settings.lastAutoAt).getTime() : 0;
    const dueMs = Number(settings.intervalHours || 24) * 3600000;
    if (last && Date.now() - last < dueMs) return null;
    try {
      return makeBackup({ kind: 'auto', note: 'Scheduled automatic backup' });
    } catch (error) {
      logger?.error('Automatic backup failed', { error: error.message });
      return { error: error.message };
    }
  }

  return {
    makeBackup,
    list,
    verify,
    createManual,
    restore,
    autoBackupIfDue,
    destinationDirectory,
  };
}
