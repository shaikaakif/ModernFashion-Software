import { fail } from '../core/errors.js';
import { normalizePhone, requireInt, requireText, nowIso, requireDateKey, businessDate } from '../core/validation.js';
import { writeAudit } from '../core/audit.js';
import { hashPassword } from './authService.js';
import { ROLE_DEFAULTS } from '../../shared/permissions.js';

export function createUserService({ db, auth }) {
  function requireManage() {
    return auth.requirePermission('users.manage');
  }

  function countOwners({ excludeId = null } = {}) {
    const row = excludeId
      ? db.prepare("SELECT COUNT(*) AS count FROM users WHERE role_code = 'owner' AND status = 'active' AND id <> ?").get(excludeId)
      : db.prepare("SELECT COUNT(*) AS count FROM users WHERE role_code = 'owner' AND status = 'active'").get();
    return Number(row.count);
  }

  function list() {
    requireManage();
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.mobile, u.role_code, u.status, u.last_login_at, u.created_at,
                (SELECT COUNT(*) FROM sales s WHERE s.cashier_id = u.id AND s.status = 'completed') AS sale_count,
                (SELECT COALESCE(SUM(s.total_paise), 0) FROM sales s WHERE s.cashier_id = u.id AND s.status = 'completed') AS sale_total_paise
         FROM users u ORDER BY CASE u.role_code WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name`
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      mobile: row.mobile,
      roleCode: row.role_code,
      roleName: ROLE_DEFAULTS[row.role_code]?.name || row.role_code,
      status: row.status,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      saleCount: Number(row.sale_count || 0),
      saleTotalPaise: Number(row.sale_total_paise || 0),
      openShift: Boolean(
        db.prepare("SELECT id FROM cash_shifts WHERE user_id = ? AND status = 'open' LIMIT 1").get(row.id)
      ),
    }));
  }

  function create(input) {
    const owner = requireManage();
    const name = requireText(input.name, 'Staff name', { max: 120 });
    const mobile = normalizePhone(input.mobile);
    const roleCode = String(input.roleCode || '');
    if (!ROLE_DEFAULTS[roleCode]) fail('Choose a valid role.');
    if (db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile)) fail('A staff account with this mobile number already exists.');
    const password = String(input.password || '');
    if (password.length < 6) fail('Set a password or PIN of at least 6 characters.');
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO users (name, mobile, password_hash, role_code, status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .run(name, mobile, hashPassword(password), roleCode, now, now, owner.user.id);
    const userId = Number(result.lastInsertRowid);
    writeAudit(db, {
      userId: owner.user.id,
      userName: owner.user.name,
      action: 'user.created',
      entityType: 'user',
      entityId: userId,
      details: { name, mobile, roleCode },
    });
    return { id: userId };
  }

  function update(userId, input) {
    const owner = requireManage();
    const id = requireInt(userId, 'Staff ID', { min: 1 });
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!current) fail('Staff account not found.');
    const name = requireText(input.name ?? current.name, 'Staff name', { max: 120 });
    const roleCode = String(input.roleCode ?? current.role_code);
    if (!ROLE_DEFAULTS[roleCode]) fail('Choose a valid role.');
    const status = String(input.status ?? current.status);
    if (!['active', 'disabled'].includes(status)) fail('Choose a valid staff status.');
    if (current.role_code === 'owner' && (roleCode !== 'owner' || status !== 'active') && countOwners({ excludeId: id }) === 0) {
      fail('At least one active owner account is required.');
    }
    if (current.id === owner.user.id && status !== 'active') fail('You cannot disable your own account.');
    if (current.id === owner.user.id && roleCode !== 'owner') fail('You cannot remove your own owner role.');
    db.prepare('UPDATE users SET name = ?, role_code = ?, status = ?, updated_at = ? WHERE id = ?').run(
      name,
      roleCode,
      status,
      nowIso(),
      id
    );
    writeAudit(db, {
      userId: owner.user.id,
      userName: owner.user.name,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      details: { previousRole: current.role_code, roleCode, status, name },
    });
    return { updated: true };
  }

  function resetPassword(userId, input) {
    const owner = requireManage();
    const id = requireInt(userId, 'Staff ID', { min: 1 });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) fail('Staff account not found.');
    const password = String(input.password || '');
    if (password.length < 6) fail('Set a password or PIN of at least 6 characters.');
    db.prepare(
      'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?'
    ).run(hashPassword(password), nowIso(), id);
    writeAudit(db, {
      userId: owner.user.id,
      userName: owner.user.name,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: id,
      details: { targetName: user.name },
    });
    return { reset: true };
  }

  function shifts({ from = null, to = null, userId = null } = {}) {
    requireManage();
    const start = from ? requireDateKey(from, 'From date') : businessDate(new Date(Date.now() - 30 * 86400000));
    const end = to ? requireDateKey(to, 'To date') : businessDate();
    const params = [start, end];
    let clause = 'WHERE date(cs.opened_at) IS NOT NULL AND substr(cs.opened_at, 1, 10) BETWEEN ? AND ?';
    if (userId) {
      clause += ' AND cs.user_id = ?';
      params.push(userId);
    }
    const rows = db
      .prepare(
        `SELECT cs.*, u.name AS user_name,
                (SELECT COALESCE(SUM(s.total_paise), 0) FROM sales s WHERE s.shift_id = cs.id AND s.status = 'completed') AS sales_total,
                (SELECT COUNT(*) FROM sales s WHERE s.shift_id = cs.id AND s.status = 'completed') AS sale_count
         FROM cash_shifts cs JOIN users u ON u.id = cs.user_id
         ${clause}
         ORDER BY cs.opened_at DESC`
      )
      .all(...params);
    return {
      from: start,
      to: end,
      shifts: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openingCashPaise: row.opening_cash_paise,
        expectedCashPaise: row.expected_cash_paise,
        countedCashPaise: row.counted_cash_paise,
        variancePaise: row.variance_paise,
        status: row.status,
        saleCount: Number(row.sale_count || 0),
        salesTotalPaise: Number(row.sales_total || 0),
      })),
    };
  }

  function cashierActivity({ from = null, to = null } = {}) {
    requireManage();
    const start = requireDateKey(from || businessDate(new Date(Date.now() - 30 * 86400000)), 'From date');
    const end = requireDateKey(to || businessDate(), 'To date');
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.role_code,
                COUNT(s.id) AS invoice_count,
                COALESCE(SUM(s.total_paise), 0) AS sales_total_paise,
                COALESCE(SUM(s.discount_total_paise), 0) AS discount_total_paise
         FROM users u LEFT JOIN sales s
           ON s.cashier_id = u.id AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         GROUP BY u.id ORDER BY sales_total_paise DESC`
      )
      .all(start, end);
    return {
      from: start,
      to: end,
      cashiers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        roleCode: row.role_code,
        invoiceCount: Number(row.invoice_count || 0),
        salesTotalPaise: Number(row.sales_total_paise || 0),
        discountTotalPaise: Number(row.discount_total_paise || 0),
      })),
    };
  }

  function activity(userId, { from = null, to = null } = {}) {
    requireManage();
    const id = requireInt(userId, 'Staff ID', { min: 1 });
    const start = requireDateKey(from || businessDate(new Date(Date.now() - 30 * 86400000)), 'From date');
    const end = requireDateKey(to || businessDate(), 'To date');
    const user = db.prepare('SELECT id, name, mobile, role_code, status FROM users WHERE id = ?').get(id);
    if (!user) fail('Staff account not found.');
    const sales = db
      .prepare(
        `SELECT id, invoice_no, business_date, total_paise, discount_total_paise, payment_method, status
         FROM sales WHERE cashier_id = ? AND business_date BETWEEN ? AND ?
         ORDER BY id DESC LIMIT 200`
      )
      .all(id, start, end);
    const audit = db
      .prepare(
        `SELECT action, entity_type, entity_id, details, created_at FROM audit_logs
         WHERE user_id = ? ORDER BY id DESC LIMIT 200`
      )
      .all(id);
    return {
      user: { id: user.id, name: user.name, mobile: user.mobile, roleCode: user.role_code, status: user.status },
      sales: sales.map((sale) => ({
        id: sale.id,
        invoiceNo: sale.invoice_no,
        businessDate: sale.business_date,
        totalPaise: sale.total_paise,
        discountTotalPaise: sale.discount_total_paise,
        paymentMethod: sale.payment_method,
        status: sale.status,
      })),
      audit: audit.map((entry) => ({
        action: entry.action,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        details: safeJson(entry.details),
        createdAt: entry.created_at,
      })),
    };
  }

  return { list, create, update, resetPassword, shifts, cashierActivity, activity };
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
