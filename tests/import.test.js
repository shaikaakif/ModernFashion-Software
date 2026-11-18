import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';
import { createTestApp, setupOwner } from './helpers.js';

function writeFile(directory, name, content) {
  const target = path.join(directory, name);
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

test('CSV import maps common headers, creates products, variants and stock', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = writeFile(
    app.directory,
    'vyapar-items.csv',
    [
      'Item Name,Category,Brand,Colour,Size,Item Code,Barcode,Sale Price,MRP,Purchase Price,Current Stock,GST Rate,HSN',
      'Everyday Tee,T-shirts,MF,Black,M,TSH-IMP-1,8900000000011,₹599.00,799,320,12,5%,6109',
      'Everyday Tee,T-shirts,MF,White,L,TSH-IMP-2,,649,799,320,5,5,6109',
      'Denim Jeans,Jeans,MF,Blue,32,JEAN-IMP-1,,"₹1,299/-",1599,700,8,12,6203',
    ].join('\r\n')
  );

  const preview = app.services.importer.preview({ filePath: file });
  assert.equal(preview.summary.totalRows, 3);
  assert.equal(preview.summary.createProducts, 2);
  assert.equal(preview.summary.createVariants, 3);
  assert.equal(preview.summary.errors, 0);
  assert.equal(preview.mapping.productName, 'Item Name');
  assert.equal(preview.mapping.sellingPrice, 'Sale Price');
  assert.equal(preview.mapping.stock, 'Current Stock');
  assert.equal(preview.mapping.taxRate, 'GST Rate');
  assert.equal(preview.mapping.sku, 'Item Code');
  assert.equal(preview.mapping.barcode, 'Barcode');

  const result = app.services.importer.commit({ filePath: file, mapping: preview.mapping });
  assert.equal(result.createdProducts, 2);
  assert.equal(result.createdVariants, 3);
  assert.equal(result.errors, 0);
  assert.match(result.reference, /^IMP\//);

  const tee = app.db.prepare("SELECT id FROM products WHERE name = 'Everyday Tee'").get();
  assert.ok(tee);
  const variants = app.db
    .prepare(
      `SELECT v.sku, v.barcode, v.price_paise, v.mrp_paise, v.cost_paise, p.tax_rate_bp, ib.quantity
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN inventory_balances ib ON ib.variant_id = v.id
       WHERE v.product_id = ? ORDER BY v.sku`
    )
    .all(tee.id);
  assert.equal(variants.length, 2);
  assert.equal(variants[0].price_paise, 59900);
  assert.equal(variants[0].mrp_paise, 79900);
  assert.equal(variants[0].cost_paise, 32000);
  assert.equal(variants[0].tax_rate_bp, 500);
  assert.equal(variants[0].quantity, 12);
  assert.match(variants[1].barcode, /^20\d{11}$/);
  assert.equal(
    Number(app.db.prepare("SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = 'opening'").get().count),
    3
  );
  const jeans = app.db
    .prepare(
      `SELECT v.price_paise FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = 'Denim Jeans'`
    )
    .get();
  assert.equal(jeans.price_paise, 129900);
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS count FROM brands WHERE name = 'MF'").get().count,
    1
  );
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'products.imported'").get().count,
    1
  );
});

test('re-import updates an existing variant without duplicating it and is idempotent', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const first = writeFile(
    app.directory,
    'first.csv',
    ['Product,Category,Sale Price,Stock,SKU', 'Everyday Tee,T-shirts,499,4,TSH-REPEAT'].join('\n')
  );
  app.services.importer.commit({ filePath: first });

  const second = writeFile(
    app.directory,
    'second.csv',
    ['Product,Category,Sale Price,Stock,SKU', 'Everyday Tee,T-shirts,699,10,TSH-REPEAT'].join('\n')
  );
  const preview = app.services.importer.preview({ filePath: second });
  assert.equal(preview.summary.updateVariants, 1);
  assert.equal(preview.summary.createVariants, 0);
  assert.equal(preview.summary.createProducts, 0);
  const result = app.services.importer.commit({ filePath: second, mapping: preview.mapping });
  assert.equal(result.createdVariants, 0);
  assert.equal(result.updatedVariants, 1);

  const variant = app.db.prepare("SELECT * FROM product_variants WHERE sku = 'TSH-REPEAT'").get();
  assert.equal(variant.price_paise, 69900);
  const balance = app.db.prepare('SELECT quantity FROM inventory_balances WHERE variant_id = ?').get(variant.id);
  assert.equal(balance.quantity, 10);
  assert.equal(
    Number(
      app.db
        .prepare("SELECT COUNT(*) AS count FROM stock_movements WHERE variant_id = ? AND movement_type = 'adjustment_in'")
        .get(variant.id).count
    ),
    1
  );

  const repeat = app.services.importer.commit({ filePath: second, mapping: preview.mapping });
  assert.equal(repeat.updatedVariants, 1);
  assert.equal(repeat.stockChanges, 0);
  assert.equal(
    Number(app.db.prepare('SELECT COUNT(*) AS count FROM product_variants WHERE sku = ?').get('TSH-REPEAT').count),
    1
  );
});

test('invalid rows block the import unless skipping is allowed', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = writeFile(
    app.directory,
    'mixed.csv',
    [
      'Product,Category,Sale Price,Stock,SKU',
      'Valid Tee,T-shirts,499,3,TSH-VALID',
      'No Price Tee,T-shirts,,2,TSH-NOPRICE',
    ].join('\n')
  );
  const preview = app.services.importer.preview({ filePath: file });
  assert.equal(preview.summary.errors, 1);
  assert.equal(preview.rows.find((row) => row.sku === 'TSH-NOPRICE').errors.length, 1);

  assert.throws(
    () => app.services.importer.commit({ filePath: file, mapping: preview.mapping }),
    /needs? attention/i
  );
  assert.equal(
    Number(app.db.prepare("SELECT COUNT(*) AS count FROM product_variants WHERE sku = 'TSH-VALID'").get().count),
    0
  );

  const result = app.services.importer.commit({
    filePath: file,
    mapping: preview.mapping,
    options: { skipInvalid: true },
  });
  assert.equal(result.createdVariants, 1);
  assert.equal(result.errors, 1);
});

test('Excel workbooks import with the same mapping and money rules', (t) => {  const app = createTestApp(t);
  setupOwner(app);
  const rows = [
    ['Product Name', 'Category', 'Sale Price', 'MRP', 'Current Stock', 'Barcode'],
    ['Excel Kurta', 'Kurta sets', '1,299.50', '1,599', '7', '8900000000999'],
    ['Excel Scarf', 'Accessories', 349, 499, 2, ''],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Items');
  const target = path.join(app.directory, 'items.xlsx');
  XLSX.writeFile(workbook, target);

  const preview = app.services.importer.preview({ filePath: target });
  assert.equal(preview.sheetName, 'Items');
  assert.equal(preview.summary.createProducts, 2);
  assert.equal(preview.summary.createVariants, 2);
  assert.equal(preview.summary.errors, 0);

  const result = app.services.importer.commit({ filePath: target, mapping: preview.mapping });
  assert.equal(result.createdVariants, 2);
  const variant = app.db.prepare("SELECT * FROM product_variants WHERE barcode = '8900000000999'").get();
  assert.equal(variant.price_paise, 129950);
  assert.equal(variant.mrp_paise, 159900);
});

test('current stock is preferred over an opening-stock column', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = writeFile(
    app.directory,
    'stock-columns.csv',
    ['Product,Category,Sale Price,Opening Stock,Current Stock', 'Column Tee,T-shirts,499,10,4'].join('\n')
  );
  const preview = app.services.importer.preview({ filePath: file });
  assert.equal(preview.mapping.stock, 'Current Stock');
  app.services.importer.commit({ filePath: file, mapping: preview.mapping });
  const variant = app.db.prepare("SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE name = 'Column Tee')").get();
  assert.equal(app.db.prepare('SELECT quantity FROM inventory_balances WHERE variant_id = ?').get(variant.id).quantity, 4);
});

test('a barcode match under a changed file name still reuses the existing product', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const first = writeFile(
    app.directory,
    'original.csv',
    ['Product,Category,Colour,Size,Sale Price,Stock,SKU', 'Everyday Tee,T-shirts,Black,M,499,4,TEE-ORIGINAL'].join('\n')
  );
  app.services.importer.commit({ filePath: first });
  const original = app.db.prepare("SELECT barcode FROM product_variants WHERE sku = 'TEE-ORIGINAL'").get();

  const second = writeFile(
    app.directory,
    'renamed.csv',
    [
      'Product,Category,Colour,Size,Sale Price,Stock,Barcode',
      `Tee,T-shirts,Black,M,599,3,${original.barcode}`,
      'Tee,T-shirts,Black,L,599,2,',
    ].join('\n')
  );
  const preview = app.services.importer.preview({ filePath: second });
  assert.equal(preview.summary.createProducts, 0);
  assert.equal(preview.summary.updateVariants, 1);
  assert.equal(preview.summary.createVariants, 1);
  const result = app.services.importer.commit({ filePath: second, mapping: preview.mapping });
  assert.equal(result.createdProducts, 0);
  assert.equal(result.createdVariants, 1);
  assert.equal(Number(app.db.prepare("SELECT COUNT(*) AS count FROM products WHERE name IN ('Everyday Tee', 'Tee')").get().count), 1);
  assert.equal(
    Number(app.db.prepare("SELECT COUNT(*) AS count FROM product_variants WHERE product_id = (SELECT id FROM products WHERE name = 'Everyday Tee')").get().count),
    2
  );
});

test('Vyapar .VYB backups are rejected instead of pretending to restore them', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = writeFile(app.directory, 'shop.vyb', 'not-a-real-vyapar-backup');
  assert.throws(
    () => app.services.importer.preview({ filePath: file }),
    /proprietary backup container/i
  );
});

test('CSV import preserves a negative stock value', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const file = writeFile(
    app.directory,
    'negative.csv',
    ['Product,Category,Sale Price,Stock,SKU', 'Negative Tee,T-shirts,499,-3,TSH-NEG'].join('\n')
  );
  const preview = app.services.importer.preview({ filePath: file });
  assert.equal(preview.summary.errors, 0);
  app.services.importer.commit({ filePath: file, mapping: preview.mapping });
  const variant = app.db.prepare("SELECT id FROM product_variants WHERE sku = 'TSH-NEG'").get();
  assert.equal(app.db.prepare('SELECT quantity FROM inventory_balances WHERE variant_id = ?').get(variant.id).quantity, -3);
  assert.equal(
    app.db.prepare("SELECT quantity_change FROM stock_movements WHERE variant_id = ? AND movement_type = 'opening'").get(variant.id).quantity_change,
    -3
  );
});
