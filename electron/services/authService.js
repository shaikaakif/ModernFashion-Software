import crypto from 'node:crypto';
import { fail, AppError } from '../core/errors.js';
import { nowIso, normalizePhone, requireText } from '../core/validation.js';
import { getSetting, publicBusiness, saveSetting } from '../core/settings.js';
import { writeAudit } from '../core/audit.js';
import { ROLE_DEFAULTS } from '../../shared/permissions.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const plain = String(password ?? '');
  if (plain.length < 6) fail('Password must be at least 6 characters.', 'WEAK_PASSWORD');
  if (plain.length > 200) fail('Password is too long.', 'WEAK_PASSWORD');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, expected] = parts;
  try {
    const actual = crypto.scryptSync(String(password ?? ''), salt, expected.length / 2, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

function publicUser(row, permissions) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    roleCode: row.role_code,
    roleName: ROLE_DEFAULTS[row.role_code]?.name || row.role_code,
    status: row.status,
    permissions,
  };
}

function permissionsFor(db, roleCode) {
  return db
    .prepare('SELECT permission_code FROM role_permissions WHERE role_code = ? ORDER BY permission_code')
    .all(roleCode)
    .map((row) => row.permission_code);
}

function shiftSummary(db, shiftId) {
  const shift = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shiftId);
  if (!shift) return null;
  const cash = db
    .prepare(
      `SELECT COALESCE(SUM(total_paise), 0) AS cash_total
       FROM sales WHERE shift_id = ? AND status = 'completed' AND payment_method = 'cash'`
    )
    .get(shiftId);
  return {
    id: shift.id,
    openedAt: shift.opened_at,
    status: shift.status,
    openingCashPaise: shift.opening_cash_paise,
    expectedCashPaise: shift.opening_cash_paise + Number(cash.cash_total || 0),
  };
}

function openShift(db, userId) {
  const existing = db
    .prepare("SELECT id FROM cash_shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(userId);
  if (existing) return existing.id;
  const result = db
    .prepare(
      `INSERT INTO cash_shifts (user_id, opened_at, opening_cash_paise, status, notes)
       VALUES (?, ?, 0, 'open', '')`
    )
    .run(userId, nowIso());
  return Number(result.lastInsertRowid);
}

function closeShift(db, shiftId, { countedCashPaise = null, notes = '', closedBy = null } = {}) {
  if (!shiftId) return null;
  const shift = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shiftId);
  if (!shift || shift.status === 'closed') return shift ? shiftSummary(db, shiftId) : null;
  const summary = shiftSummary(db, shiftId);
  const counted = countedCashPaise === null || countedCashPaise === undefined ? summary.expectedCashPaise : Number(countedCashPaise);
  if (!Number.isInteger(counted) || counted < 0) fail('Counted cash must be a valid amount.');
  const closedAt = nowIso();
  db.prepare(
    `UPDATE cash_shifts SET closed_at = ?, counted_cash_paise = ?, expected_cash_paise = ?,
     variance_paise = ?, status = 'closed', notes = ? WHERE id = ?`
  ).run(closedAt, counted, summary.expectedCashPaise, counted - summary.expectedCashPaise, String(notes || '').trim(), shiftId);
  writeAudit(db, {
    userId: closedBy?.id || null,
    userName: closedBy?.name || 'system',
    action: 'shift.closed',
    entityType: 'cash_shift',
    entityId: shiftId,
    details: { expectedCashPaise: summary.expectedCashPaise, countedCashPaise: counted, variancePaise: counted - summary.expectedCashPaise },
  });
  return {
    ...summary,
    status: 'closed',
    closedAt,
    countedCashPaise: counted,
    variancePaise: counted - summary.expectedCashPaise,
  };
}

export function createAuthService({ db, logger }) {
  let session = null;

  function requireSession() {
    if (!session) throw new AppError('Please sign in again.', 'UNAUTHENTICATED');
    const idleMinutes = Number(getSetting(db, 'pos').sessionIdleMinutes || 60);
    const ageMinutes = (Date.now() - session.lastActiveAt) / 60000;
    if (ageMinutes > idleMinutes) {
      session = null;
      throw new AppError('Session locked after inactivity. Please sign in again.', 'SESSION_EXPIRED');
    }
    session.lastActiveAt = Date.now();
    return session;
  }

  function requirePermission(permission) {
    const current = requireSession();
    if (!current.permissions.includes(permission)) {
      throw new AppError('You do not have permission to perform this action.', 'FORBIDDEN');
    }
    return current;
  }

  function startUserSession(user, shiftId = null) {
    session = {
      user,
      permissions: user.permissions,
      shiftId,
      lastActiveAt: Date.now(),
      loggedInAt: nowIso(),
    };
    return currentSession();
  }

  function currentSession() {
    if (!session) return null;
    return {
      user: session.user,
      permissions: session.permissions,
      shiftId: session.shiftId,
      shift: session.shiftId ? shiftSummary(db, session.shiftId) : null,
      idleMinutes: Number(getSetting(db, 'pos').sessionIdleMinutes || 60),
      loggedInAt: session.loggedInAt,
      business: publicBusiness(db),
    };
  }

  function setupStatus() {
    const count = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    return {
      needsSetup: Number(count.count) === 0,
      business: publicBusiness(db),
    };
  }

  function setupOwner(input) {
    const count = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    if (Number(count.count) > 0) fail('The owner account has already been created.', 'SETUP_COMPLETE');
    const name = requireText(input.name, 'Owner name', { max: 120 });
    const mobile = normalizePhone(input.mobile);
    const password = String(input.password || '');
    if (password.length < 6) fail('Choose a password or PIN of at least 6 characters.', 'WEAK_PASSWORD');
    const createdAt = nowIso();
    const hash = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (name, mobile, password_hash, role_code, status, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 'active', ?, ?)`
      )
      .run(name, mobile, hash, createdAt, createdAt);
    const userId = Number(result.lastInsertRowid);

    const businessPatch = {};
    if (input.businessName) businessPatch.name = requireText(input.businessName, 'Business name', { max: 160 });
    if (input.businessPhone) businessPatch.phone = requireText(input.businessPhone, 'Business phone', { max: 30 });
    if (Object.keys(businessPatch).length) saveSetting(db, 'business', businessPatch, userId);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    writeAudit(db, {
      userId,
      userName: name,
      action: 'owner.setup',
      entityType: 'user',
      entityId: userId,
      details: { mobile },
    });
    logger?.info('Owner account created', { userId });
    session = null;
    return startUserSession(publicUser(row, permissionsFor(db, 'owner')), null);
  }

  function login(input) {
    const mobile = normalizePhone(input.mobile);
    const password = String(input.password || '');
    const pos = getSetting(db, 'pos');
    const row = db.prepare('SELECT * FROM users WHERE mobile = ?').get(mobile);
    if (!row || row.status !== 'active') fail('Mobile number or password is incorrect.', 'INVALID_CREDENTIALS');

    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      fail('This account is temporarily locked after repeated failed sign-in attempts. Ask the owner to reset it.', 'ACCOUNT_LOCKED');
    }

    if (!verifyPassword(password, row.password_hash)) {
      const attempts = Number(row.failed_attempts || 0) + 1;
      const maxAttempts = Number(pos.maxLoginAttempts || 5);
      const lockMinutes = Number(pos.lockMinutes || 15);
      const lockedUntil =
        attempts >= maxAttempts ? new Date(Date.now() + lockMinutes * 60000).toISOString() : null;
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, row.id);
      writeAudit(db, {
        userId: row.id,
        userName: row.name,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: row.id,
        details: { attempts, locked: Boolean(lockedUntil) },
      });
      if (lockedUntil) fail('Too many failed attempts. The account is locked temporarily.', 'ACCOUNT_LOCKED');
      fail('Mobile number or password is incorrect.', 'INVALID_CREDENTIALS');
    }

    const now = nowIso();
    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, row.id);
    const permissions = permissionsFor(db, row.role_code);
    const shiftId = row.role_code === 'owner' ? null : openShift(db, row.id);
    writeAudit(db, {
      userId: row.id,
      userName: row.name,
      action: 'auth.login',
      entityType: 'user',
      entityId: row.id,
      details: { role: row.role_code, shiftId },
    });
    logger?.info('User signed in', { userId: row.id, role: row.role_code });
    return startUserSession(publicUser(row, permissions), shiftId);
  }

  function logout(input = {}) {
    if (!session) return { closedShift: null };
    let closedShift = null;
    if (session.shiftId) {
      closedShift = closeShift(db, session.shiftId, {
        countedCashPaise: input.countedCashPaise ?? null,
        notes: input.notes || '',
        closedBy: session.user,
      });
    }
    writeAudit(db, {
      userId: session.user.id,
      userName: session.user.name,
      action: 'auth.logout',
      entityType: 'user',
      entityId: session.user.id,
      details: { shiftId: session.shiftId },
    });
    session = null;
    return { closedShift };
  }

  function changePassword(input) {
    const current = requireSession();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(current.user.id);
    if (!verifyPassword(input.currentPassword, row.password_hash)) fail('Current password is incorrect.', 'INVALID_CREDENTIALS');
    if (input.newPassword !== input.confirmPassword) fail('New passwords do not match.');
    const hash = hashPassword(input.newPassword);
    const now = nowIso();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, current.user.id);
    writeAudit(db, {
      userId: current.user.id,
      userName: current.user.name,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: current.user.id,
    });
    return { changed: true };
  }

  function closeCurrentShift(input = {}) {
    const current = requireSession();
    if (!current.shiftId) fail('There is no open shift to close.', 'NO_SHIFT');
    const closed = closeShift(db, current.shiftId, {
      countedCashPaise: input.countedCashPaise,
      notes: input.notes,
      closedBy: current.user,
    });
    session.shiftId = null;
    return closed;
  }

  /**
   * Clear the authenticated session without closing the cash shift. Used for
   * idle screen locks so a cashier can resume the same shift after signing in.
   */
  function lockCurrentSession() {
    if (session) {
      writeAudit(db, {
        userId: session.user.id,
        userName: session.user.name,
        action: 'auth.locked',
        entityType: 'user',
        entityId: session.user.id,
        details: { shiftId: session.shiftId, reason: 'idle' },
      });
    }
    session = null;
    return { locked: true };
  }

  function openNewShift(input = {}) {
    const current = requireSession();
    if (current.user.roleCode === 'owner') fail('Owner accounts do not need a cash shift.', 'OWNER_SHIFT');
    if (current.shiftId) return currentSession();
    const shiftId = openShift(db, current.user.id);
    if (input.openingCashPaise) {
      db.prepare('UPDATE cash_shifts SET opening_cash_paise = ? WHERE id = ?').run(Number(input.openingCashPaise) || 0, shiftId);
    }
    session.shiftId = shiftId;
    writeAudit(db, {
      userId: current.user.id,
      userName: current.user.name,
      action: 'shift.opened',
      entityType: 'cash_shift',
      entityId: shiftId,
      details: { openingCashPaise: Number(input.openingCashPaise) || 0 },
    });
    return currentSession();
  }

  return {
    setupStatus,
    setupOwner,
    login,
    logout,
    currentSession,
    requireSession,
    requirePermission,
    changePassword,
    closeCurrentShift,
    openNewShift,
    lockCurrentSession,
    touch: requireSession,
  };
}
