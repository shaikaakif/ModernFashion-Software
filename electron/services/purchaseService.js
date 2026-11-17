import { fail } from '../core/errors.js';
import {
  businessDate,
  currentFinancialYear,
  optionalText,
  requireBasisPoints,
  requireDateKey,
  requireInt,
  requireMoneyPaise,
  requirePositiveInt,
  nowIso,
} from '../core/validation.js';
import { writeAudit } from '../core/audit.js';
import { recordStockMovement } from '../core/inventory.js';
import { transaction } from '../core/database.js';
import { allocateSequence, formatPurchaseReference } from '../core/sequences.js';
import { getSetting } from '../core/settings.js';
import { allocate, roundHalfUp } from '../../shared/money.js';

export function createPurchaseService({ db, auth }) {
  function list({ from = null, to = null, supplierId = null, query = '', status = null, limit = 500 } = {}) {
    auth.requirePermission('purchases.view');
    const where = [];
    const params = [];
    if (from) {
      where.push('pu.business_date >= ?');
      params.push(requireDateKey(from, 'From date'));
    }
    if (to) {
      where.push('pu.business_date <= ?');
      params.push(requireDateKey(to, 'To date'));
    }
    if (supplierId) {
      where.push('pu.supplier_id = ?');
      params.push(Number(supplierId));
    }
    if (status) {
      where.push('pu.status = ?');
      params.push(status);
    }
    if (query) {
      where.push('(pu.reference LIKE ? OR pu.supplier_invoice_ref LIKE ? OR s.name LIKE ?)');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT pu.*, s.name AS supplier_name, u.name AS created_by_name
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id JOIN users u ON u.id = pu.created_by
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY pu.id DESC LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 1000));
    return rows.map(mapPurchase);
  }

  function mapPurchase(row) {
    return {
      id: row.id,
      reference: row.reference,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      supplierInvoiceRef: row.supplier_invoice_ref,
      purchaseDate: row.purchase_date,
      businessDate: row.business_date,
      subtotalPaise: row.subtotal_paise,
      discountPaise: row.discount_paise,
      additionalCostPaise: row.additional_cost_paise,
      taxPaise: row.tax_paise,
      totalPaise: row.total_paise,
      amountPaidPaise: row.amount_paid_paise,
      balancePaise: row.balance_paise,
      paymentStatus: row.payment_status,
      notes: row.notes,
      status: row.status,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
    };
  }

  function get(id) {
    auth.requirePermission('purchases.view');
    const purchaseId = requireInt(id, 'Purchase', { min: 1 });
    const row = db
      .prepare(
        `SELECT pu.*, s.name AS supplier_name, s.phone AS supplier_phone, u.name AS created_by_name
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id JOIN users u ON u.id = pu.created_by
         WHERE pu.id = ?`
      )
      .get(purchaseId);
    if (!row) fail('Purchase not found.');
    const items = db
      .prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id')
      .all(purchaseId)
      .map((item) => ({
        id: item.id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantLabel: item.variant_label,
        sku: item.sku,
        quantity: item.quantity,
        unitCostPaise: item.unit_cost_paise,
        discountPaise: item.discount_paise,
        additionalCostPaise: item.additional_cost_paise,
        taxRateBp: item.tax_rate_bp,
        taxPaise: item.tax_paise,
        hsnCode: item.hsn_code || '',
        lineTotalPaise: item.line_total_paise,
      }));
    const payments = db
      .prepare(
        `SELECT pp.*, u.name AS created_by_name FROM purchase_payments pp
         JOIN users u ON u.id = pp.created_by WHERE pp.purchase_id = ? ORDER BY pp.id`
      )
      .all(purchaseId)
      .map((payment) => ({
        id: payment.id,
        amountPaise: payment.amount_paise,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paid_at,
        createdByName: payment.created_by_name,
      }));
    return {
      ...mapPurchase(row),
      supplierPhone: row.supplier_phone,
      items,
      payments,
    };
  }

  function create(input) {
    const user = auth.requirePermission('purchases.manage');
    const supplierId = requireInt(input.supplierId, 'Supplier', { min: 1 });
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    if (!supplier) fail('Supplier not found.');
    const dateKey = requireDateKey(input.purchaseDate || businessDate(), 'Purchase date');
    const supplierInvoiceRef = optionalText(input.supplierInvoiceRef, { max: 120 });
    const notes = optionalText(input.notes, { max: 1000 });
    const additionalCostPaise = requireMoneyPaise(input.additionalCostPaise ?? 0, 'Additional purchase cost');
    const billDiscountPaise = requireMoneyPaise(input.discountPaise ?? 0, 'Purchase discount');
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) fail('Add at least one product to the purchase.');
    if (items.length > 500) fail('A purchase cannot contain more than 500 lines.');

    return transaction(db, () => {
      const seen = new Set();
      const normalized = items.map((item, index) => {
        const variantId = requireInt(item.variantId, `Product line ${index + 1}`, { min: 1 });
        if (seen.has(variantId)) fail('The same product variant cannot appear twice in one purchase.');
        seen.add(variantId);
        const variant = db
          .prepare(
            `SELECT v.*, p.name AS product_name, p.tax_rate_bp AS product_tax_rate, p.hsn_code,
                    COALESCE(ib.quantity, 0) AS stock
             FROM product_variants v JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
             WHERE v.id = ?`
          )
          .get(variantId);
        if (!variant) fail(`Product line ${index + 1} could not be found.`);
        const quantity = requirePositiveInt(item.quantity, `Quantity for ${variant.product_name}`);
        const unitCostPaise = requireMoneyPaise(item.unitCostPaise, `Purchase cost for ${variant.product_name}`);
        if (unitCostPaise <= 0) fail(`Purchase cost for ${variant.product_name} must be greater than zero.`);
        const taxRateBp = requireBasisPoints(
          item.taxRateBp ?? (getSetting(db, 'tax').enabled ? variant.product_tax_rate : 0),
          'Purchase tax rate'
        );
        return {
          variant,
          quantity,
          unitCostPaise,
          taxRateBp,
          grossPaise: quantity * unitCostPaise,
        };
      });

      const subtotalPaise = normalized.reduce((sum, line) => sum + line.grossPaise, 0);
      if (billDiscountPaise > subtotalPaise) fail('Purchase discount cannot exceed the purchase subtotal.');
      const discountAllocations = allocate(
        billDiscountPaise,
        normalized.map((line) => line.grossPaise)
      );
      const additionalAllocations = allocate(
        additionalCostPaise,
        normalized.map((line) => Math.max(0, line.grossPaise - discountAllocations[normalized.indexOf(line)]))
      );
      const computed = normalized.map((line, index) => {
        const discountPaise = discountAllocations[index];
        const additional = additionalAllocations[index];
        const taxable = line.grossPaise - discountPaise;
        const taxPaise = roundHalfUp((taxable * line.taxRateBp) / 10000);
        return {
          ...line,
          discountPaise,
          additionalCostPaise: additional,
          taxablePaise: taxable,
          taxPaise,
          lineTotalPaise: taxable + taxPaise,
          landedUnitCostPaise: roundHalfUp((taxable + additional) / line.quantity),
        };
      });
      const taxPaise = computed.reduce((sum, line) => sum + line.taxPaise, 0);
      const supplierTotalPaise = subtotalPaise - billDiscountPaise + taxPaise;
      const totalPaise = supplierTotalPaise + additionalCostPaise;
      let amountPaidPaise = requireMoneyPaise(input.amountPaidPaise ?? 0, 'Amount paid');
      if (amountPaidPaise > totalPaise) fail('Amount paid cannot exceed the purchase total.');
      const paymentStatus = amountPaidPaise >= totalPaise && totalPaise > 0 ? 'paid' : amountPaidPaise > 0 ? 'partial' : 'unpaid';
      const balancePaise = Math.max(0, supplierTotalPaise - amountPaidPaise);

      const financialYear = currentFinancialYear(new Date(`${dateKey}T12:00:00+05:30`));
      const reference = formatPurchaseReference(
        getSetting(db, 'invoice').purchasePrefix || 'PUR',
        financialYear,
        allocateSequence(db, 'purchase', financialYear)
      );
      const now = nowIso();
      const inserted = db
        .prepare(
          `INSERT INTO purchases (reference, supplier_id, supplier_invoice_ref, purchase_date, business_date,
             subtotal_paise, discount_paise, additional_cost_paise, tax_paise, total_paise, amount_paid_paise,
             balance_paise, payment_status, notes, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)`
        )
        .run(
          reference,
          supplierId,
          supplierInvoiceRef,
          dateKey,
          dateKey,
          subtotalPaise,
          billDiscountPaise,
          additionalCostPaise,
          taxPaise,
          totalPaise,
          amountPaidPaise,
          balancePaise,
          paymentStatus,
          notes,
          user.user.id,
          now,
          now
        );
      const purchaseId = Number(inserted.lastInsertRowid);

      for (const line of computed) {
        db.prepare(
          `INSERT INTO purchase_items (purchase_id, variant_id, product_name, variant_label, sku, quantity,
             unit_cost_paise, discount_paise, additional_cost_paise, tax_rate_bp, tax_paise, hsn_code, line_total_paise)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          purchaseId,
          line.variant.id,
          line.variant.product_name,
          `${line.variant.color} / ${line.variant.size}`,
          line.variant.sku,
          line.quantity,
          line.unitCostPaise,
          line.discountPaise,
          line.additionalCostPaise,
          line.taxRateBp,
          line.taxPaise,
          line.variant.hsn_code || '',
          line.lineTotalPaise
        );

        const oldStock = Number(line.variant.stock || 0);
        const oldCost = Number(line.variant.cost_paise || 0);
        const newCost = roundHalfUp((oldStock * oldCost + line.quantity * line.landedUnitCostPaise) / (oldStock + line.quantity));
        db.prepare('UPDATE product_variants SET cost_paise = ?, updated_at = ? WHERE id = ?').run(newCost, now, line.variant.id);
        recordStockMovement(db, {
          variantId: line.variant.id,
          productId: line.variant.product_id,
          quantityChange: line.quantity,
          movementType: 'purchase',
          unitCostPaise: line.landedUnitCostPaise,
          referenceType: 'purchase',
          referenceId: purchaseId,
          referenceNo: reference,
          reason: 'Stock received',
          note: `Purchase from ${supplier.name}`,
          userId: user.user.id,
          createdAt: now,
        });
      }

      if (amountPaidPaise > 0) {
        db.prepare(
          `INSERT INTO purchase_payments (purchase_id, amount_paise, method, reference, paid_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          purchaseId,
          amountPaidPaise,
          ['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(input.paymentMethod) ? input.paymentMethod : 'cash',
          optionalText(input.paymentReference, { max: 120 }),
          now,
          user.user.id
        );
      }

      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'purchase.created',
        entityType: 'purchase',
        entityId: purchaseId,
        details: { reference, supplier: supplier.name, totalPaise, items: computed.length, additionalCostPaise },
      });
      return get(purchaseId);
    });
  }

  function recordPayment(purchaseId, input) {
    const user = auth.requirePermission('purchases.manage');
    const id = requireInt(purchaseId, 'Purchase', { min: 1 });
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
    if (!purchase) fail('Purchase not found.');
    if (purchase.status !== 'posted') fail('Payments can only be recorded against posted purchases.');
    const amountPaise = requireMoneyPaise(input.amountPaise, 'Payment amount', { min: 1 });
    if (amountPaise > purchase.balance_paise) fail('Payment cannot exceed the outstanding purchase balance.');
    const method = input.method || 'cash';
    if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(method)) fail('Choose a valid payment method.');
    return transaction(db, () => {
      const now = nowIso();
      db.prepare(
        `INSERT INTO purchase_payments (purchase_id, amount_paise, method, reference, paid_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, amountPaise, method, optionalText(input.reference, { max: 120 }), now, user.user.id);
      const paid = purchase.amount_paid_paise + amountPaise;
      const balance = Math.max(0, purchase.balance_paise - amountPaise);
      const status = balance === 0 ? 'paid' : 'partial';
      db.prepare(
        'UPDATE purchases SET amount_paid_paise = ?, balance_paise = ?, payment_status = ?, updated_at = ? WHERE id = ?'
      ).run(paid, balance, status, now, id);
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'purchase.payment_recorded',
        entityType: 'purchase',
        entityId: id,
        details: { amountPaise, method, reference: purchase.reference, balancePaise: balance },
      });
      return get(id);
    });
  }

  function outstandingBySupplier() {
    auth.requirePermission('purchases.view');
    return db
      .prepare(
        `SELECT s.id, s.name, s.phone, COUNT(pu.id) AS purchase_count,
                COALESCE(SUM(pu.total_paise), 0) AS total_paise,
                COALESCE(SUM(pu.balance_paise), 0) AS outstanding_paise
         FROM suppliers s LEFT JOIN purchases pu ON pu.supplier_id = s.id AND pu.status = 'posted'
         GROUP BY s.id HAVING outstanding_paise > 0 ORDER BY outstanding_paise DESC`
      )
      .all()
      .map((row) => ({
        supplierId: row.id,
        supplierName: row.name,
        phone: row.phone,
        purchaseCount: Number(row.purchase_count || 0),
        totalPaise: Number(row.total_paise || 0),
        outstandingPaise: Number(row.outstanding_paise || 0),
      }));
  }

  return { list, get, create, recordPayment, outstandingBySupplier };
}
