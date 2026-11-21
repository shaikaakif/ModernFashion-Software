import { AppError, fail } from '../core/errors.js';
import { transaction } from '../core/database.js';
import { writeAudit } from '../core/audit.js';
import { verifyPassword } from './authService.js';

// Child rows first: SQLite enforces the foreign keys in this schema.
// Products stay out of "all" only when asked for inventory-only.
const INVENTORY_TABLES = [
  'payments',
  'sale_items',
  'sales',
  'purchase_payments',
  'purchase_items',
  'purchases',
  'stock_movements',
  'inventory_balances',
  'product_variants',
  'products',
  'offers',
];

const ALL_TABLES = [
  ...INVENTORY_TABLES,
  'expenses',
  'expense_categories',
  'brands',
  'categories',
  'suppliers',
  'customers',
  'cash_shifts',
  'backup_logs',
];

// Audit rows stay: the wipe itself must remain traceable.
const GUARDED_TABLES = ['sales', 'sale_items', 'purchases', 'stock_movements'];

/**
 * Destructive maintenance. Owners only, and only after re-entering their own
 * password, because these calls cannot be undone from the app.
 */
export function createMaintenanceService({ db, auth }) {
  function wipe({ scope = 'inventory', password = '' } = {}) {
    const session = auth.requirePermission('settings.manage');
    if (session.user.roleCode !== 'owner') {
      throw new AppError('Only an owner can delete shop records.', 'FORBIDDEN');
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(session.user.id);
    if (!row || !verifyPassword(String(password), row.password_hash)) {
      fail('Password is incorrect.', 'INVALID_CREDENTIALS');
    }
    const tables = scope === 'all' ? ALL_TABLES : scope === 'inventory' ? INVENTORY_TABLES : null;
    if (!tables) fail('Choose what to delete.');

    // The ledger tables are protected by no-delete triggers. Lift them for this
    // one transaction and put back exactly what was there.
    const placeholders = GUARDED_TABLES.map(() => '?').join(',');
    const triggers = db
      .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN (${placeholders})`)
      .all(...GUARDED_TABLES);

    const counts = {};
    transaction(db, () => {
      for (const trigger of triggers) db.exec(`DROP TRIGGER IF EXISTS "${trigger.name}"`);
      for (const table of tables) {
        counts[table] = db.prepare(`DELETE FROM ${table}`).run().changes;
      }
      for (const trigger of triggers) db.exec(trigger.sql);
    });

    writeAudit(db, {
      userId: session.user.id,
      userName: session.user.name,
      action: 'data.wiped',
      entityType: 'database',
      details: { scope, counts },
    });
    return { scope, counts };
  }

  return { wipe };
}
