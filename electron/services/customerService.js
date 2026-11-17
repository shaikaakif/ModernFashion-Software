import { fail } from '../core/errors.js';
import { normalizePhone, optionalText, requireInt, requireText, nowIso } from '../core/validation.js';
import { writeAudit } from '../core/audit.js';

export function createCustomerService({ db, auth }) {
  function list({ query = '', limit = 500 } = {}) {
    auth.requirePermission('customers.view');
    const where = [];
    const params = [];
    if (query) {
      where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS purchase_count,
                (SELECT COALESCE(SUM(s.total_paise), 0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS total_spent,
                (SELECT COALESCE(SUM(CASE WHEN s.amount_paid_paise < s.total_paise THEN s.total_paise - s.amount_paid_paise ELSE 0 END), 0)
                   FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS outstanding,
                (SELECT MAX(s.business_date) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS last_purchase
         FROM customers c
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY c.name LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 2000));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      purchaseCount: Number(row.purchase_count || 0),
      totalSpentPaise: Number(row.total_spent || 0),
      outstandingPaise: Number(row.outstanding || 0),
      lastPurchaseDate: row.last_purchase,
      createdAt: row.created_at,
    }));
  }

  function get(id) {
    auth.requirePermission('customers.view');
    const customerId = requireInt(id, 'Customer', { min: 1 });
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!row) fail('Customer not found.');
    const sales = db
      .prepare(
        `SELECT s.id, s.invoice_no, s.business_date, s.total_paise, s.amount_paid_paise, s.payment_status,
                s.payment_method, s.status, s.discount_total_paise,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS line_count
         FROM sales s WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 200`
      )
      .all(customerId)
      .map((sale) => ({
        id: sale.id,
        invoiceNo: sale.invoice_no,
        businessDate: sale.business_date,
        totalPaise: sale.total_paise,
        amountPaidPaise: sale.amount_paid_paise,
        balancePaise: Math.max(0, sale.total_paise - sale.amount_paid_paise),
        paymentStatus: sale.payment_status,
        paymentMethod: sale.payment_method,
        status: sale.status,
        discountTotalPaise: sale.discount_total_paise,
        lineCount: Number(sale.line_count || 0),
      }));
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      createdAt: row.created_at,
      purchaseCount: sales.filter((sale) => sale.status === 'completed').length,
      totalSpentPaise: sales.filter((sale) => sale.status === 'completed').reduce((sum, sale) => sum + sale.totalPaise, 0),
      outstandingPaise: sales
        .filter((sale) => sale.status === 'completed')
        .reduce((sum, sale) => sum + sale.balancePaise, 0),
      lastPurchaseDate: sales[0]?.businessDate || null,
      sales,
    };
  }

  function searchForPos(query) {
    auth.requirePermission('pos.use');
    const text = String(query || '').trim();
    if (!text) return [];
    const like = `%${text}%`;
    return db
      .prepare(
        `SELECT id, name, phone, address FROM customers
         WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 20`
      )
      .all(like, like);
  }

  function create(input) {
    const user = auth.requirePermission('customers.manage');
    const name = requireText(input.name, 'Customer name', { max: 160 });
    const phone = normalizePhone(input.phone, 'Customer phone');
    if (db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone)) {
      fail('A customer with this phone number already exists.');
    }
    const now = nowIso();
    const result = db
      .prepare('INSERT INTO customers (name, phone, email, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        name,
        phone,
        optionalText(input.email, { max: 160 }),
        optionalText(input.address, { max: 500 }),
        optionalText(input.notes, { max: 1000 }),
        now,
        now
      );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'customer.created',
      entityType: 'customer',
      entityId: id,
      details: { name, phone },
    });
    return get(id);
  }

  function update(id, input) {
    const user = auth.requirePermission('customers.manage');
    const customerId = requireInt(id, 'Customer', { min: 1 });
    const current = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!current) fail('Customer not found.');
    const name = requireText(input.name ?? current.name, 'Customer name', { max: 160 });
    const phone = normalizePhone(input.phone ?? current.phone, 'Customer phone');
    if (db.prepare('SELECT id FROM customers WHERE phone = ? AND id <> ?').get(phone, customerId)) {
      fail('Another customer already uses this phone number.');
    }
    db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?').run(
      name,
      phone,
      optionalText(input.email ?? current.email, { max: 160 }),
      optionalText(input.address ?? current.address, { max: 500 }),
      optionalText(input.notes ?? current.notes, { max: 1000 }),
      nowIso(),
      customerId
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'customer.updated',
      entityType: 'customer',
      entityId: customerId,
      details: { name, phone },
    });
    return get(customerId);
  }

  return { list, get, searchForPos, create, update };
}
