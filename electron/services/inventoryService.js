import { fail } from '../core/errors.js';
import {
  optionalText,
  requireDateKey,
  requireInt,
  requirePositiveInt,
  requireText,
  currentFinancialYear,
} from '../core/validation.js';
import { writeAudit } from '../core/audit.js';
import { recordStockMovement } from '../core/inventory.js';
import { transaction } from '../core/database.js';
import { allocateSequence } from '../core/sequences.js';

export function createInventoryService({ db, auth }) {
  function list({ query = '', categoryId = null, lowStock = false, outOfStock = false, limit = 1000 } = {}) {
    auth.requirePermission('inventory.view');
    const where = ["p.status = 'active'"];
    const params = [];
    if (query) {
      where.push('(p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?)');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like);
    }
    if (categoryId) {
      where.push('p.category_id = ?');
      params.push(Number(categoryId));
    }
    if (lowStock) where.push('COALESCE(ib.quantity, 0) <= v.low_stock_threshold');
    if (outOfStock) where.push('COALESCE(ib.quantity, 0) = 0');
    const rows = db
      .prepare(
        `SELECT v.id AS variant_id, v.sku, v.barcode, v.color, v.size, v.price_paise, v.cost_paise,
                v.mrp_paise, v.low_stock_threshold, v.status AS variant_status,
                p.id AS product_id, p.name AS product_name, p.category_id, c.name AS category_name,
                COALESCE(ib.quantity, 0) AS stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE ${where.join(' AND ')}
         ORDER BY p.name, v.color, v.size
         LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 1000, 2000));
    return rows.map((row) => ({
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      categoryId: row.category_id,
      categoryName: row.category_name,
      sku: row.sku,
      barcode: row.barcode,
      color: row.color,
      size: row.size,
      pricePaise: row.price_paise,
      costPaise: row.cost_paise,
      mrpPaise: row.mrp_paise,
      stock: Number(row.stock || 0),
      threshold: row.low_stock_threshold,
      status: row.variant_status,
      stockValuePaise: Number(row.stock || 0) * row.cost_paise,
      retailValuePaise: Number(row.stock || 0) * row.price_paise,
    }));
  }

  function summary() {
    auth.requirePermission('inventory.view');
    const row = db
      .prepare(
        `SELECT COUNT(*) AS variants,
                COALESCE(SUM(ib.quantity), 0) AS units,
                COALESCE(SUM(ib.quantity * v.cost_paise), 0) AS cost_value,
                COALESCE(SUM(ib.quantity * v.price_paise), 0) AS retail_value,
                SUM(CASE WHEN COALESCE(ib.quantity, 0) = 0 THEN 1 ELSE 0 END) AS out_of_stock,
                SUM(CASE WHEN COALESCE(ib.quantity, 0) > 0 AND COALESCE(ib.quantity, 0) <= v.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE p.status = 'active' AND v.status = 'active'`
      )
      .get();
    return {
      variants: Number(row.variants || 0),
      units: Number(row.units || 0),
      costValuePaise: Number(row.cost_value || 0),
      retailValuePaise: Number(row.retail_value || 0),
      outOfStock: Number(row.out_of_stock || 0),
      lowStock: Number(row.low_stock || 0),
      costingMethod: 'weighted_average',
    };
  }

  function valuationByCategory() {
    auth.requirePermission('inventory.view');
    return db
      .prepare(
        `SELECT c.id, c.name, COALESCE(SUM(ib.quantity), 0) AS units,
                COALESCE(SUM(ib.quantity * v.cost_paise), 0) AS cost_value,
                COALESCE(SUM(ib.quantity * v.price_paise), 0) AS retail_value
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
         LEFT JOIN product_variants v ON v.product_id = p.id AND v.status = 'active'
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         GROUP BY c.id ORDER BY cost_value DESC`
      )
      .all()
      .map((row) => ({
        categoryId: row.id,
        categoryName: row.name,
        units: Number(row.units || 0),
        costValuePaise: Number(row.cost_value || 0),
        retailValuePaise: Number(row.retail_value || 0),
      }));
  }

  function movements({ variantId = null, type = null, from = null, to = null, limit = 500 } = {}) {
    auth.requirePermission('inventory.view');
    const where = [];
    const params = [];
    if (variantId) {
      where.push('sm.variant_id = ?');
      params.push(Number(variantId));
    }
    if (type) {
      where.push('sm.movement_type = ?');
      params.push(String(type));
    }
    if (from) {
      where.push('substr(sm.created_at, 1, 10) >= ?');
      params.push(requireDateKey(from, 'From date'));
    }
    if (to) {
      where.push('substr(sm.created_at, 1, 10) <= ?');
      params.push(requireDateKey(to, 'To date'));
    }
    const rows = db
      .prepare(
        `SELECT sm.*, p.name AS product_name, v.color, v.size, v.sku
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         JOIN product_variants v ON v.id = sm.variant_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY sm.id DESC LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 2000));
    return rows.map((row) => ({
      id: row.id,
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      variantLabel: `${row.color} / ${row.size}`,
      sku: row.sku,
      movementType: row.movement_type,
      quantityChange: row.quantity_change,
      balanceAfter: row.balance_after,
      unitCostPaise: row.unit_cost_paise,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      referenceNo: row.reference_no,
      reason: row.reason,
      note: row.note,
      createdAt: row.created_at,
    }));
  }

  function adjust(input) {
    const user = auth.requirePermission('inventory.adjust');
    const variantId = requireInt(input.variantId, 'Product variant', { min: 1 });
    const direction = String(input.direction || '');
    if (!['in', 'out'].includes(direction)) fail('Choose stock in or stock out.');
    const quantity = requirePositiveInt(input.quantity, 'Adjustment quantity');
    const reason = requireText(input.reason, 'Adjustment reason', { max: 200 });
    const note = optionalText(input.note, { max: 500 });
    const variant = db
      .prepare(
        `SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`
      )
      .get(variantId);
    if (!variant) fail('Product variant not found.');
    return transaction(db, () => {
      const movementType = input.movementType === 'damage' && direction === 'out' ? 'damage' : direction === 'in' ? 'adjustment_in' : 'adjustment_out';
      const reference = `ADJ/${currentFinancialYear()}/${String(allocateSequence(db, 'adjustment', currentFinancialYear())).padStart(4, '0')}`;
      const balanceAfter = recordStockMovement(db, {
        variantId,
        productId: variant.product_id,
        quantityChange: direction === 'in' ? quantity : -quantity,
        movementType,
        unitCostPaise: variant.cost_paise,
        referenceType: 'adjustment',
        referenceNo: reference,
        reason,
        note,
        userId: user.user.id,
      });
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'inventory.adjusted',
        entityType: 'product_variant',
        entityId: variantId,
        details: { direction, quantity, reason, reference, balanceAfter, productName: variant.product_name, sku: variant.sku },
      });
      return { reference, balanceAfter };
    });
  }

  function reconciliation({ query = '' } = {}) {
    auth.requirePermission('inventory.view');
    const like = `%${String(query).trim()}%`;
    return db
      .prepare(
        `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.color, v.size,
                COALESCE(ib.quantity, 0) AS stock,
                COALESCE((SELECT SUM(sm.quantity_change) FROM stock_movements sm WHERE sm.variant_id = v.id), 0) AS ledger
         FROM product_variants v JOIN products p ON p.id = v.product_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?
         ORDER BY p.name LIMIT 500`
      )
      .all(like, like, like)
      .map((row) => ({
        variantId: row.variant_id,
        productName: row.product_name,
        sku: row.sku,
        color: row.color,
        size: row.size,
        stock: Number(row.stock || 0),
        ledger: Number(row.ledger || 0),
        consistent: Number(row.stock || 0) === Number(row.ledger || 0),
      }));
  }

  return { list, summary, valuationByCategory, movements, adjust, reconciliation };
}
