import { requireDateKey, requireInt } from '../core/validation.js';

function parseDetails(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

export function createAuditService({ db, auth }) {
  function list({ from = null, to = null, action = '', entityType = '', userId = null, limit = 500 } = {}) {
    auth.requirePermission('audit.view');
    const where = [];
    const params = [];
    if (from) {
      where.push('substr(a.created_at, 1, 10) >= ?');
      params.push(requireDateKey(from, 'From date'));
    }
    if (to) {
      where.push('substr(a.created_at, 1, 10) <= ?');
      params.push(requireDateKey(to, 'To date'));
    }
    if (action) {
      where.push('a.action LIKE ?');
      params.push(`%${String(action).trim()}%`);
    }
    if (entityType) {
      where.push('a.entity_type = ?');
      params.push(String(entityType));
    }
    if (userId) {
      where.push('a.user_id = ?');
      params.push(requireInt(userId, 'Staff ID', { min: 1 }));
    }
    const rows = db
      .prepare(
        `SELECT a.*, u.name AS current_user_name FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY a.id DESC LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 2000));
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name || row.current_user_name || 'system',
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: parseDetails(row.details),
      createdAt: row.created_at,
    }));
  }

  function actions() {
    auth.requirePermission('audit.view');
    return db
      .prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action')
      .all()
      .map((row) => row.action);
  }

  return { list, actions };
}
