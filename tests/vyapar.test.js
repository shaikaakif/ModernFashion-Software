import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createTestApp, setupOwner } from './helpers.js';

function createVyaparFile(directory, name = 'shop.vyp') {
  const file = path.join(directory, name);
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE kb_items (
      item_id INTEGER PRIMARY KEY, item_name TEXT, item_sale_unit_price REAL, item_purchase_unit_price REAL,
      item_stock_quantity REAL, item_min_stock_quantity REAL, item_code TEXT, item_hsn_sac_code TEXT,
      item_tax_id INTEGER, item_tax_type INTEGER, item_type INTEGER, item_is_active INTEGER,
      item_description TEXT, item_mrp REAL, category_id INTEGER, base_unit_id INTEGER
    );
    CREATE TABLE kb_item_categories (item_category_id INTEGER PRIMARY KEY, item_category_name TEXT);
    CREATE TABLE kb_item_categories_mapping (id INTEGER PRIMARY KEY, item_id INTEGER, category_id INTEGER);
    CREATE TABLE kb_names (
      name_id INTEGER PRIMARY KEY, full_name TEXT, phone_number TEXT, email TEXT, address TEXT,
      party_billing_name TEXT, name_type INTEGER, name_gstin_number TEXT, name_state TEXT
    );
    CREATE TABLE kb_transactions (
      txn_id INTEGER PRIMARY KEY, txn_date TEXT, txn_time INTEGER, txn_name_id INTEGER,
      txn_cash_amount REAL, txn_balance_amount REAL, txn_type INTEGER, txn_discount_amount REAL,
      txn_tax_amount REAL, txn_round_off_amount REAL, txn_ref_number_char TEXT,
      txn_payment_status INTEGER, txn_category_id INTEGER, created_by INTEGER
    );
    CREATE TABLE kb_lineitems (
      lineitem_id INTEGER PRIMARY KEY, lineitem_txn_id INTEGER, item_id INTEGER, quantity REAL,
      priceperunit REAL, total_amount REAL, lineitem_tax_amount REAL, lineitem_discount_amount REAL,
      lineitem_unit_id INTEGER, lineitem_tax_id INTEGER, lineitem_mrp REAL, lineitem_size TEXT,
      lineitem_description TEXT
    );
    CREATE TABLE kb_tax_code (
      tax_code_id INTEGER PRIMARY KEY, tax_code_name TEXT, tax_rate REAL, tax_code_type INTEGER, tax_rate_type INTEGER
    );
    CREATE TABLE kb_paymentTypes (paymentType_id INTEGER PRIMARY KEY, paymentType_name TEXT);
    CREATE TABLE txn_payment_mapping (id INTEGER PRIMARY KEY, txn_id INTEGER, payment_id INTEGER, amount REAL);
    CREATE TABLE kb_item_adjustments (item_adj_id INTEGER PRIMARY KEY, item_adj_item_id INTEGER, item_adj_quantity REAL);
    CREATE TABLE urp_users (user_id INTEGER PRIMARY KEY, user_name TEXT);
  `);

  const item = db.prepare(
    `INSERT INTO kb_items (item_id, item_name, item_sale_unit_price, item_purchase_unit_price, item_stock_quantity,
       item_min_stock_quantity, item_code, item_hsn_sac_code, item_tax_id, item_tax_type, item_type, item_is_active,
       item_description, item_mrp, category_id, base_unit_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, '', NULL, 2, ?, 1, ?, ?, ?, 15)`
  );
  item.run(1, 'Alpha Shirt', 100, 80, -5, 'ABC123', 1, 'A negative stock product', 120, 1);
  item.run(2, 'Zero Price Item', 0, 0, 0, '2', 1, '', 0, null);
  item.run(3, 'Gamma Jeans', 200, 100, 5, null, 1, '', 0, 1);
  item.run(4, 'Alteration Service', 0, 0, 0, '999999', 2, '', 0, null);

  db.prepare('INSERT INTO kb_item_categories VALUES (1, ?)').run('Shirts');
  db.prepare('INSERT INTO kb_item_categories_mapping VALUES (1, 1, 1)').run();
  db.prepare('INSERT INTO kb_item_categories_mapping VALUES (2, 3, 1)').run();

  const insertName = db.prepare(
    'INSERT INTO kb_names (name_id, full_name, phone_number, email, address, party_billing_name, name_type, name_gstin_number, name_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertName.run(10, 'Customer One', '9876543210', 'one@example.com', 'Attapur', 'Customer One', 1, '', '');
  insertName.run(11, 'No Phone Customer', '', '', '', null, 1, '', '');
  insertName.run(12, 'CASH', '', '', '', null, 1, '', '');
  insertName.run(13, 'Customer One Duplicate', '9876543210', '', '', null, 1, '', '');
  insertName.run(14, 'Supplier One', '9000000001', '', 'Delhi', null, 1, '', '');
  insertName.run(20, 'Rent', '', '', '', null, 2, '', '');
  db.prepare('INSERT INTO kb_paymentTypes VALUES (1, ?)').run('Cash');
  db.prepare('INSERT INTO urp_users VALUES (1, ?)').run('Admin');

  const txn = db.prepare(
    `INSERT INTO kb_transactions (txn_id, txn_date, txn_time, txn_name_id, txn_cash_amount, txn_balance_amount,
       txn_type, txn_discount_amount, txn_tax_amount, txn_round_off_amount, txn_ref_number_char, txn_payment_status,
       txn_category_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 1)`
  );
  txn.run(100, '2026-01-02 00:00:00', 36000, 10, 270, 0, 1, 10, '1001', 3, null);
  txn.run(101, '2026-01-03 00:00:00', 40000, 13, 0, 100, 1, 0, '1002', 1, null);
  txn.run(102, '2026-01-04 00:00:00', 41000, 11, 50, 0, 1, 0, '1003', 3, null);
  txn.run(103, '2026-01-05 00:00:00', 42000, 10, 150, 0, 65, 0, '1004', 3, null);
  txn.run(104, '2026-01-08 00:00:00', 45600, 11, 100, 0, 1, 0, '1005', 3, null);
  txn.run(110, '2026-01-06 00:00:00', 43000, 14, 160, 0, 2, 0, '', 3, null);
  txn.run(120, '2026-01-07 00:00:00', 44000, null, 500, 0, 7, 0, '', 3, 20);

  const line = db.prepare(
    `INSERT INTO kb_lineitems (lineitem_id, lineitem_txn_id, item_id, quantity, priceperunit, total_amount,
       lineitem_tax_amount, lineitem_discount_amount, lineitem_unit_id, lineitem_tax_id, lineitem_mrp, lineitem_size,
       lineitem_description)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 15, NULL, 0, '', '')`
  );
  line.run(1, 100, 1, 1, 100, 100, 0);
  line.run(2, 100, 3, 1, 200, 180, 20);
  line.run(3, 101, 1, 1, 100, 100, 0);
  line.run(4, 103, 1, 1, 150, 150, 0);
  line.run(5, 110, 1, 2, 80, 160, 0);
  line.run(6, 104, 1, 1, 100, 100, 0);

  db.prepare('INSERT INTO txn_payment_mapping VALUES (1, 100, 1, 270)').run();
  db.prepare('INSERT INTO txn_payment_mapping VALUES (2, 110, 1, 160)').run();
  db.close();
  return file;
}

function storeZip(entryName, buffer) {
  const name = Buffer.from(entryName, 'utf8');
  const crc = zlib.crc32 ? zlib.crc32(buffer) : (() => {
    let crcValue = 0 ^ -1;
    for (const byte of buffer) {
      crcValue ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crcValue = (crcValue >>> 1) ^ (0xedb88320 & -(crcValue & 1));
    }
    return (crcValue ^ -1) >>> 0;
  })();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(buffer.length, 18);
  local.writeUInt32LE(buffer.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(buffer.length, 20);
  central.writeUInt32LE(buffer.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const directory = Buffer.concat([central, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(local.length + name.length + buffer.length, 16);
  return Buffer.concat([local, name, buffer, directory, end]);
}

test('Vyapar import preserves negative stock, zero prices, totals and relationships', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = createVyaparFile(app.directory);
  const inspected = app.services.vyapar.inspect(file, {});

  assert.equal(inspected.counts.plan.products, 3);
  assert.equal(inspected.counts.source.services, 1);
  assert.equal(inspected.counts.plan.sales, 3);
  assert.equal(inspected.counts.plan.saleItems, 4);
  assert.equal(inspected.counts.plan.purchases, 1);
  assert.equal(inspected.counts.plan.expenses, 1);
  const codes = inspected.warnings.map((warning) => warning.code);
  for (const code of ['negative-stock', 'zero-price', 'missing-phones', 'duplicate-phones']) {
    assert.ok(codes.includes(code), `missing warning ${code}`);
  }

  const result = app.services.vyapar.commit(inspected.token, {});
  assert.ok(result.backupPath);
  assert.equal(result.summary.plan.products, 3);
  assert.equal(result.summary.plan.sales, 3);

  const alpha = app.db
    .prepare(
      `SELECT ib.quantity, v.price_paise, v.barcode FROM product_variants v
       JOIN inventory_balances ib ON ib.variant_id = v.id WHERE v.sku = 'ABC123'`
    )
    .get();
  assert.equal(alpha.quantity, -5);
  assert.equal(alpha.price_paise, 10000);
  assert.equal(alpha.barcode, 'ABC123');

  const zero = app.db
    .prepare(
      `SELECT v.price_paise, ib.quantity FROM product_variants v
       JOIN inventory_balances ib ON ib.variant_id = v.id WHERE v.sku = '2'`
    )
    .get();
  assert.equal(zero.price_paise, 0);
  assert.equal(zero.quantity, 0);

  const customers = app.db.prepare('SELECT name, phone FROM customers ORDER BY id').all();
  assert.equal(customers.length, 1);
  assert.equal(customers[0].phone, '9876543210');

  const sale = app.db
    .prepare('SELECT * FROM sales WHERE invoice_no = ?')
    .get('1001');
  assert.equal(sale.total_paise, 27000);
  assert.equal(sale.subtotal_paise, 30000);
  assert.equal(sale.line_discount_paise, 2000);
  assert.equal(sale.bill_discount_paise, 1000);
  assert.equal(sale.payment_status, 'paid');
  assert.equal(sale.customer_phone, '9876543210');
  assert.match(sale.notes, /original cashier: Admin/);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM sale_items WHERE sale_id = ?').get(sale.id).c, 2);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM payments WHERE sale_id = ?').get(sale.id).c, 1);

  const creditSale = app.db.prepare('SELECT * FROM sales WHERE invoice_no = ?').get('1002');
  assert.equal(creditSale.payment_status, 'unpaid');
  assert.equal(creditSale.customer_phone, '9876543210');

  const noPhoneSale = app.db.prepare('SELECT * FROM sales WHERE invoice_no = ?').get('1005');
  assert.equal(noPhoneSale.customer_name, 'No Phone Customer');
  assert.equal(noPhoneSale.customer_phone, '');

  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM sales').get().c, 3);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM purchases').get().c, 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c, 1);

  const legacy = app.db.prepare("SELECT name, status FROM users WHERE mobile = 'VYP-LEGACY-1'").get();
  assert.ok(legacy);
  assert.equal(legacy.status, 'disabled');
  assert.equal(app.db.prepare('SELECT name FROM users WHERE id = ?').get(sale.cashier_id).name, 'Admin');

  const again = app.services.vyapar.inspect(file, {});
  assert.throws(() => app.services.vyapar.commit(again.token, {}), /already imported/i);
});

test('Vyapar reader accepts a .vyb.zip archive without changing the source', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = createVyaparFile(app.directory);
  const original = fs.readFileSync(file);
  const zip = path.join(app.directory, 'shop.vyb.zip');
  fs.writeFileSync(zip, storeZip('shop.vyp', original));

  const inspected = app.services.vyapar.inspect(zip, {});
  assert.equal(inspected.sourceKind, 'vyb.zip');
  assert.equal(inspected.counts.plan.products, 3);
  assert.deepEqual(fs.readFileSync(file), original);

  const result = app.services.vyapar.commit(inspected.token, {});
  assert.equal(result.summary.plan.products, 3);
});

test('a failed pre-import backup leaves no partial records', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = createVyaparFile(app.directory);
  const inspected = app.services.vyapar.inspect(file, {});
  const original = app.services.backup.createManual;
  app.services.backup.createManual = () => {
    throw new Error('backup storage unavailable');
  };
  try {
    assert.throws(() => app.services.vyapar.commit(inspected.token, {}), /backup storage unavailable/);
  } finally {
    app.services.backup.createManual = original;
  }
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM products').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM sales').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM customers').get().c, 0);
});

test('a failure in the middle of the import rolls the whole transaction back', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = createVyaparFile(app.directory, 'rollback.vyp');
  const source = new DatabaseSync(file);
  source.prepare('UPDATE kb_transactions SET txn_name_id = 999 WHERE txn_id = 110').run();
  source.close();
  const inspected = app.services.vyapar.inspect(file, {});
  assert.throws(() => app.services.vyapar.commit(inspected.token, {}), /supplier/i);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM products').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM customers').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM sales').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM purchases').get().c, 0);
});
