import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, setupOwner } from './helpers.js';

test('manual backup is verified, listed and can be scheduled for restore', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const user = app.services.auth.requireSession();

  const created = app.services.backup.createManual(user);
  assert.equal(created.integrity, 'ok');
  assert.equal(created.kind, 'manual');
  assert.ok(fs.existsSync(created.path));
  assert.match(created.sha256, /^[a-f0-9]{64}$/);

  const verified = app.services.backup.verify(created.path);
  assert.equal(verified.ok, true);
  assert.equal(verified.sha256, created.sha256);

  const listed = app.services.backup.list({});
  assert.equal(listed.length, 1);
  assert.equal(listed[0].exists, true);

  assert.throws(
    () => app.services.backup.restore(created.path, { confirm: 'restore', user }),
    { code: 'CONFIRMATION_REQUIRED' }
  );
  assert.equal(app.restoreCalls.length, 0);

  const result = app.services.backup.restore(created.path, { confirm: 'RESTORE', user });
  assert.equal(result.restoring, true);
  assert.equal(app.restoreCalls.length, 1);
  assert.equal(app.restoreCalls[0].source, created.path);
  assert.ok(fs.existsSync(result.safetyBackup));

  assert.equal(app.services.backup.list({}).length, 2);
});

test('restore rejects the live database and corrupt files', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const user = app.services.auth.requireSession();

  assert.throws(
    () => app.services.backup.restore(app.dbPath, { confirm: 'RESTORE', user }),
    /live database cannot be restored/
  );

  const corrupt = path.join(app.directory, 'corrupt-backup.db');
  fs.writeFileSync(corrupt, 'not a sqlite database'.repeat(500));
  assert.throws(() => app.services.backup.verify(corrupt));
  assert.throws(
    () => app.services.backup.restore(corrupt, { confirm: 'RESTORE', user }),
    /database|malformed|invalid|too small/i
  );
  assert.equal(app.restoreCalls.length, 0);
});
