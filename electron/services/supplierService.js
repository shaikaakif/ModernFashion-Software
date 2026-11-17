import { fail } from '../core/errors.js';
import { optionalPhone, optionalText, requireInt, requireText, nowIso } from '../core/validation.js';
import { writeAudit } from '../core/audit.js';

export function createSupplierService({ db, auth }) {
  function list({ query = '', includeInactive = false } = {}) {
    auth.requirePermission('purchases.view');
    const where = [];
    const params = [];
    if (!includeInactive) where.push("s.status = 'active'");
    if (query) {
      where.push('(s.name LIKE ? OR s.phone LIKE ? OR s.contact_person LIKE ?)');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'posted') AS purchase_count,
                (SELECT COALESCE(SUM(pu.total_paise), 0) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'posted') AS purchase_total,
                (SELECT COALESCE(SUM(pu.balance_paise), 0) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'posted') AS outstanding
         FROM suppliers s
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY s.name`
      )
      .all(...params);
    return rows.map(mapSupplier);
  }

  function mapSupplier(row) {
    return {
      id: row.id,
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      gstin: row.gstin,
      notes: row.notes,
      status: row.status,
      purchaseCount: Number(row.purchase_count || 0),
      purchaseTotalPaise: Number(row.purchase_total || 0),
      outstandingPaise: Number(row.outstanding || 0),
      createdAt: row.created_at,
    };
  }

  function get(id) {
    auth.requirePermission('purchases.view');
    const supplierId = requireInt(id, 'Supplier', { min: 1 });
    const row = db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'posted') AS purchase_count,
                (SELECT COALESCE(SUM(pu.total_paise), 0) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'posted') AS purchase_total,
                (SELECT COALESCE(SUM(pu.balance_paise), 0) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'posted') AS outstanding
         FROM suppliers s WHERE s.id = ?`
      )
      .get(supplierId);
    if (!row) fail('Supplier not found.');
    const purchases = db
      .prepare(
        `SELECT id, reference, purchase_date, total_paise, amount_paid_paise, balance_paise, payment_status, status
         FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 100`
      )
      .all(supplierId);
    return {
      ...mapSupplier(row),
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        reference: purchase.reference,
        purchaseDate: purchase.purchase_date,
        totalPaise: purchase.total_paise,
        amountPaidPaise: purchase.amount_paid_paise,
        balancePaise: purchase.balance_paise,
        paymentStatus: purchase.payment_status,
        status: purchase.status,
      })),
    };
  }

  function create(input) {
    const user = auth.requirePermission('purchases.manage');
    const name = requireText(input.name, 'Supplier name', { max: 160 });
    if (db.prepare('SELECT id FROM suppliers WHERE name = ?').get(name)) fail('A supplier with this name already exists.');
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO suppliers (name, contact_person, phone, email, address, gstin, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        name,
        optionalText(input.contactPerson, { max: 120 }),
        optionalPhone(input.phone, 'Supplier phone'),
        optionalText(input.email, { max: 160 }),
        optionalText(input.address, { max: 500 }),
        optionalText(input.gstin, { max: 20 }).toUpperCase(),
        optionalText(input.notes, { max: 1000 }),
        now,
        now
      );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: id,
      details: { name },
    });
    return { id };
  }

  function update(id, input) {
    const user = auth.requirePermission('purchases.manage');
    const supplierId = requireInt(id, 'Supplier', { min: 1 });
    const current = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    if (!current) fail('Supplier not found.');
    const name = requireText(input.name ?? current.name, 'Supplier name', { max: 160 });
    if (db.prepare('SELECT id FROM suppliers WHERE name = ? AND id <> ?').get(name, supplierId)) {
      fail('Another supplier already uses this name.');
    }
    const status = input.status ?? current.status;
    if (!['active', 'inactive'].includes(status)) fail('Choose a valid supplier status.');
    db.prepare(
      `UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, gstin = ?, notes = ?,
       status = ?, updated_at = ? WHERE id = ?`
    ).run(
      name,
      optionalText(input.contactPerson ?? current.contact_person, { max: 120 }),
      optionalPhone(input.phone ?? current.phone, 'Supplier phone'),
      optionalText(input.email ?? current.email, { max: 160 }),
      optionalText(input.address ?? current.address, { max: 500 }),
      optionalText(input.gstin ?? current.gstin, { max: 20 }).toUpperCase(),
      optionalText(input.notes ?? current.notes, { max: 1000 }),
      status,
      nowIso(),
      supplierId
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'supplier.updated',
      entityType: 'supplier',
      entityId: supplierId,
      details: { name, status },
    });
    return { updated: true };
  }

  return { list, get, create, update };
}
