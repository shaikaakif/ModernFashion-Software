export function allocateSequence(db, scope, period) {
  const row = db
    .prepare(
      `INSERT INTO sequences (scope, period, next_value) VALUES (?, ?, 1)
       ON CONFLICT(scope, period) DO UPDATE SET next_value = next_value + 1
       RETURNING next_value`
    )
    .get(scope, period);
  return Number(row.next_value);
}

export function peekSequence(db, scope, period) {
  const row = db.prepare('SELECT next_value FROM sequences WHERE scope = ? AND period = ?').get(scope, period);
  return row ? Number(row.next_value) : 1;
}

export function formatInvoiceNumber(prefix, financialYear, sequence) {
  return `${prefix}/${financialYear}/${String(sequence).padStart(4, '0')}`;
}

export function formatPurchaseReference(prefix, financialYear, sequence) {
  return `${prefix}/${financialYear}/${String(sequence).padStart(4, '0')}`;
}
