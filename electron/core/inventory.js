import { fail } from './errors.js';
import { nowIso } from './validation.js';

export function getStock(db, variantId) {
  const row = db.prepare('SELECT quantity FROM inventory_balances WHERE variant_id = ?').get(variantId);
  return row ? Number(row.quantity) : 0;
}

export function assertStockAvailable(db, variantId, quantity, productName = 'Product') {
  const stock = getStock(db, variantId);
  if (stock < quantity) {
    fail(`Only ${stock} unit${stock === 1 ? '' : 's'} of ${productName} are in stock.`, 'INSUFFICIENT_STOCK');
  }
  return stock;
}

/**
 * Apply a stock change and append an immutable movement ledger row.
 * Must be called inside a database transaction for sale/purchase workflows.
 */
export function recordStockMovement(
  db,
  {
    variantId,
    productId,
    quantityChange,
    movementType,
    unitCostPaise = 0,
    referenceType = '',
    referenceId = null,
    referenceNo = '',
    reason = '',
    note = '',
    userId = null,
    createdAt = nowIso(),
  }
) {
  const change = Number(quantityChange);
  if (!Number.isInteger(change) || change === 0) fail('Stock movement quantity must be a non-zero whole number.');
  const current = getStock(db, variantId);
  const next = current + change;
  if (next < 0) {
    fail(`This operation would make stock negative (available ${current}).`, 'INSUFFICIENT_STOCK');
  }
  const now = nowIso();
  db.prepare('UPDATE inventory_balances SET quantity = ?, updated_at = ? WHERE variant_id = ?').run(next, now, variantId);
  db.prepare(
    `INSERT INTO stock_movements (variant_id, product_id, movement_type, quantity_change, balance_after,
       unit_cost_paise, reference_type, reference_id, reference_no, reason, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    variantId,
    productId,
    movementType,
    change,
    next,
    Math.max(0, Number(unitCostPaise) || 0),
    referenceType,
    referenceId,
    referenceNo,
    reason,
    note,
    userId,
    createdAt
  );
  return next;
}
