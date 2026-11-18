import assert from 'node:assert/strict';
import test from 'node:test';
import { addStaff, createProduct, createTestApp, login, logout, setupOwner } from './helpers.js';

test('removing a cashier disables login but preserves invoices and shifts', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const cashier = addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 3 });

  logout(app);
  login(app, '9000000002');
  app.services.sales.complete({
    idempotencyKey: 'user-lifecycle-sale-1',
    items: [{ variantId: product.variants[0].id, quantity: 1 }],
    paymentMethod: 'cash',
    customerName: 'Test Customer',
    customerPhone: '9000000000',
  });
  logout(app);
  login(app, '9000000001');

  const removed = app.services.users.remove(cashier.id, { reason: 'Left the shop' });
  assert.equal(removed.removed, true);

  const cashierRow = app.db.prepare('SELECT * FROM users WHERE id = ?').get(cashier.id);
  assert.equal(cashierRow.status, 'disabled');
  assert.ok(cashierRow.removed_at);
  assert.ok(cashierRow.removed_by);

  const removedList = app.services.users.listRemoved();
  const entry = removedList.find((row) => row.id === cashier.id);
  assert.ok(entry);
  assert.equal(entry.removalReason, 'Left the shop');
  assert.equal(entry.saleCount, 1);
  assert.ok(entry.shiftCount >= 1);
  assert.ok(entry.removedByName);

  const invoice = app.services.sales.list({})[0];
  assert.equal(invoice.cashierId, cashier.id);
  assert.equal(invoice.cashierName, 'Cashier One');

  assert.throws(() => login(app, '9000000002'), { code: 'INVALID_CREDENTIALS' });

  const restored = app.services.users.restore(cashier.id);
  assert.equal(restored.restored, true);
  assert.equal(app.db.prepare('SELECT status FROM users WHERE id = ?').get(cashier.id).status, 'active');
  const session = login(app, '9000000002');
  assert.equal(session.user.id, cashier.id);

  const actions = app.db
    .prepare("SELECT action FROM audit_logs WHERE entity_type = 'user' AND entity_id = ? ORDER BY id")
    .all(String(cashier.id))
    .map((row) => row.action);
  assert.ok(actions.includes('user.created'));
  assert.ok(actions.includes('user.removed'));
  assert.ok(actions.includes('user.restored'));
});

test('the owner cannot remove their own account or the last owner', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const owner = app.db.prepare("SELECT id FROM users WHERE role_code = 'owner'").get();
  assert.throws(() => app.services.users.remove(owner.id, {}), /your own account/i);
});
