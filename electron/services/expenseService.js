import { fail } from '../core/errors.js';
import { businessDate, optionalText, requireDateKey, requireInt, requireMoneyPaise, requireText, nowIso } from '../core/validation.js';
import { writeAudit } from '../core/audit.js';

const METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

export function createExpenseService({ db, auth }) {
  function categories({ includeInactive = false } = {}) {
    auth.requirePermission('expenses.view');
    return db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id AND e.status = 'active') AS expense_count
         FROM expense_categories c ${includeInactive ? '' : "WHERE c.status = 'active'"} ORDER BY c.name`
      )
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        expenseCount: Number(row.expense_count || 0),
      }));
  }

  function createCategory(input) {
    const user = auth.requirePermission('expenses.manage');
    const name = requireText(input.name, 'Expense category', { max: 80 });
    if (db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name)) fail('This expense category already exists.');
    const result = db
      .prepare("INSERT INTO expense_categories (name, status, created_at) VALUES (?, 'active', ?)")
      .run(name, nowIso());
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'expense_category.created',
      entityType: 'expense_category',
      entityId: Number(result.lastInsertRowid),
      details: { name },
    });
    return { id: Number(result.lastInsertRowid) };
  }

  function list({ from = null, to = null, categoryId = null, query = '', status = 'active', limit = 500 } = {}) {
    auth.requirePermission('expenses.view');
    const where = [];
    const params = [];
    if (from) {
      where.push('e.business_date >= ?');
      params.push(requireDateKey(from, 'From date'));
    }
    if (to) {
      where.push('e.business_date <= ?');
      params.push(requireDateKey(to, 'To date'));
    }
    if (categoryId) {
      where.push('e.category_id = ?');
      params.push(Number(categoryId));
    }
    if (status) {
      where.push('e.status = ?');
      params.push(status);
    }
    if (query) {
      where.push('(e.description LIKE ? OR e.vendor LIKE ? OR e.reference LIKE ?)');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT e.*, c.name AS category_name, u.name AS created_by_name
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id JOIN users u ON u.id = e.created_by
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY e.id DESC LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 2000));
    return rows.map((row) => ({
      id: row.id,
      expenseDate: row.expense_date,
      businessDate: row.business_date,
      categoryId: row.category_id,
      categoryName: row.category_name,
      amountPaise: row.amount_paise,
      paymentMethod: row.payment_method,
      description: row.description,
      reference: row.reference,
      vendor: row.vendor,
      status: row.status,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
    }));
  }

  function create(input) {
    const user = auth.requirePermission('expenses.manage');
    const dateKey = requireDateKey(input.expenseDate || businessDate(), 'Expense date');
    const categoryId = requireInt(input.categoryId, 'Expense category', { min: 1 });
    const category = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(categoryId);
    if (!category || category.status !== 'active') fail('Choose an active expense category.');
    const amountPaise = requireMoneyPaise(input.amountPaise, 'Expense amount', { min: 1 });
    const method = input.paymentMethod || 'cash';
    if (!METHODS.includes(method)) fail('Choose a valid payment method.');
    const description = requireText(input.description, 'Expense description', { max: 300 });
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO expenses (expense_date, business_date, category_id, amount_paise, payment_method, description,
           reference, vendor, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .run(
        dateKey,
        dateKey,
        categoryId,
        amountPaise,
        method,
        description,
        optionalText(input.reference, { max: 120 }),
        optionalText(input.vendor, { max: 160 }),
        user.user.id,
        now,
        now
      );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'expense.created',
      entityType: 'expense',
      entityId: id,
      details: { dateKey, category: category.name, amountPaise, method, description },
    });
    return { id };
  }

  function update(id, input) {
    const user = auth.requirePermission('expenses.manage');
    const expenseId = requireInt(id, 'Expense', { min: 1 });
    const current = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
    if (!current) fail('Expense not found.');
    if (current.status !== 'active') fail('Voided expenses cannot be edited.');
    const dateKey = requireDateKey(input.expenseDate ?? current.business_date, 'Expense date');
    const categoryId = requireInt(input.categoryId ?? current.category_id, 'Expense category', { min: 1 });
    const category = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(categoryId);
    if (!category) fail('Expense category not found.');
    const amountPaise = requireMoneyPaise(input.amountPaise ?? current.amount_paise, 'Expense amount', { min: 1 });
    const method = input.paymentMethod ?? current.payment_method;
    if (!METHODS.includes(method)) fail('Choose a valid payment method.');
    const description = requireText(input.description ?? current.description, 'Expense description', { max: 300 });
    db.prepare(
      `UPDATE expenses SET expense_date = ?, business_date = ?, category_id = ?, amount_paise = ?, payment_method = ?,
       description = ?, reference = ?, vendor = ?, updated_at = ? WHERE id = ?`
    ).run(
      dateKey,
      dateKey,
      categoryId,
      amountPaise,
      method,
      description,
      optionalText(input.reference ?? current.reference, { max: 120 }),
      optionalText(input.vendor ?? current.vendor, { max: 160 }),
      nowIso(),
      expenseId
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'expense.updated',
      entityType: 'expense',
      entityId: expenseId,
      details: { dateKey, category: category.name, amountPaise, previousAmountPaise: current.amount_paise },
    });
    return { updated: true };
  }

  function voidExpense(id, input) {
    const user = auth.requirePermission('expenses.manage');
    const expenseId = requireInt(id, 'Expense', { min: 1 });
    const current = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
    if (!current) fail('Expense not found.');
    if (current.status !== 'active') fail('Expense is already void.');
    const reason = requireText(input.reason, 'Void reason', { max: 300 });
    db.prepare("UPDATE expenses SET status = 'void', updated_at = ? WHERE id = ?").run(nowIso(), expenseId);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'expense.voided',
      entityType: 'expense',
      entityId: expenseId,
      details: { amountPaise: current.amount_paise, reason },
    });
    return { voided: true };
  }

  function summary({ from, to }) {
    auth.requirePermission('expenses.view');
    const start = requireDateKey(from, 'From date');
    const end = requireDateKey(to, 'To date');
    const rows = db
      .prepare(
        `SELECT c.name, COALESCE(SUM(e.amount_paise), 0) AS total_paise, COUNT(e.id) AS count
         FROM expense_categories c
         LEFT JOIN expenses e ON e.category_id = c.id AND e.status = 'active' AND e.business_date BETWEEN ? AND ?
         GROUP BY c.id HAVING total_paise > 0 ORDER BY total_paise DESC`
      )
      .all(start, end);
    const total = db
      .prepare("SELECT COALESCE(SUM(amount_paise), 0) AS total FROM expenses WHERE status = 'active' AND business_date BETWEEN ? AND ?")
      .get(start, end);
    return {
      from: start,
      to: end,
      totalPaise: Number(total.total || 0),
      categories: rows.map((row) => ({
        categoryName: row.name,
        totalPaise: Number(row.total_paise || 0),
        count: Number(row.count || 0),
      })),
    };
  }

  return { categories, createCategory, list, create, update, voidExpense, summary };
}
