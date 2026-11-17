import { nowIso } from './validation.js';

export function writeAudit(db, { userId = null, userName = 'system', action, entityType, entityId = null, details = {} }) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, userName, action, entityType, entityId === null ? null : String(entityId), JSON.stringify(details), nowIso());
}
