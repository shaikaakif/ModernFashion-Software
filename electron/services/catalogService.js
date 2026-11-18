import { fail } from '../core/errors.js';
import {
  optionalText,
  requireInt,
  requireMoneyPaise,
  requireBasisPoints,
  requireText,
  nowIso,
} from '../core/validation.js';
import { writeAudit } from '../core/audit.js';
import { getSetting } from '../core/settings.js';
import { allocateSequence } from '../core/sequences.js';
import { transaction } from '../core/database.js';
import { AppError } from '../core/errors.js';
import { DEFAULT_BARCODE, generatedBarcode, normalizeBarcodeConfig } from '../../shared/barcode.js';

function slugCode(value, length = 3) {
  const code = String(value || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, length);
  return code || 'STD';
}

export function nextBarcode(db) {
  let config = DEFAULT_BARCODE;
  try {
    config = normalizeBarcodeConfig(getSetting(db, 'barcode'));
  } catch {
    // A damaged setting must never stop catalogue work. Existing barcodes keep
    // their values; new variants fall back to the internal EAN-13 format.
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sequence = allocateSequence(db, 'barcode', 'global');
    const candidate = generatedBarcode(config, sequence);
    if (!db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(candidate)) return candidate;
  }
  fail('Could not generate a unique barcode. Check the barcode sequence in Settings.');
}

export function buildSku(db, categoryCode, productId, color, size) {
  const base = `${categoryCode.toUpperCase().slice(0, 3)}-${String(productId).padStart(4, '0')}-${slugCode(
    color
  )}-${slugCode(size)}`;
  let candidate = base;
  let suffix = 0;
  while (db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(candidate)) {
    suffix += 1;
    if (suffix > 99) fail('Could not generate a unique SKU for this variant.');
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function validateVariantInput(input, defaults) {
  const color = optionalText(input.color ?? defaults.color ?? 'Default', { max: 60 }) || 'Default';
  const size = optionalText(input.size ?? defaults.size ?? 'Free', { max: 60 }) || 'Free';
  const costPaise = requireMoneyPaise(input.costPaise ?? defaults.costPaise ?? 0, 'Purchase cost');
  const pricePaise = requireMoneyPaise(input.pricePaise ?? defaults.pricePaise ?? 0, 'Selling price');
  const mrpPaise = requireMoneyPaise(input.mrpPaise ?? defaults.mrpPaise ?? 0, 'MRP');
  const lowStockThreshold = requireInt(input.lowStockThreshold ?? defaults.lowStockThreshold ?? 5, 'Low-stock threshold', {
    min: 0,
    max: 100000,
  });
  const openingStock = requireInt(input.openingStock ?? defaults.openingStock ?? 0, 'Opening stock', {
    min: 0,
    max: 1000000,
  });
  if (pricePaise <= 0) fail('Selling price must be greater than zero.');
  if (mrpPaise > 0 && mrpPaise < pricePaise) fail('MRP cannot be lower than the selling price.');
  return { color, size, costPaise, pricePaise, mrpPaise, lowStockThreshold, openingStock };
}

function productRow(db, id) {
  return db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.code AS category_code,
              b.name AS brand_name, s.name AS supplier_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = ?`
    )
    .get(id);
}

function variantRows(db, productId) {
  return db
    .prepare(
      `SELECT v.*, COALESCE(ib.quantity, 0) AS stock,
              (SELECT COUNT(*) FROM sale_items si WHERE si.variant_id = v.id) AS sold_count,
              (SELECT COUNT(*) FROM stock_movements sm WHERE sm.variant_id = v.id) AS movement_count
       FROM product_variants v
       LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
       WHERE v.product_id = ?
       ORDER BY v.color, v.size, v.id`
    )
    .all(productId)
    .map(mapVariant);
}

function mapVariant(row) {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    barcode: row.barcode,
    color: row.color,
    size: row.size,
    costPaise: row.cost_paise,
    pricePaise: row.price_paise,
    mrpPaise: row.mrp_paise,
    lowStockThreshold: row.low_stock_threshold,
    status: row.status,
    stock: Number(row.stock || 0),
    soldCount: Number(row.sold_count || 0),
    movementCount: Number(row.movement_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCatalogService({ db, auth }) {
  function requireCatalogue() {
    const user = auth.requireSession();
    if (!user.permissions.includes('products.view') && !user.permissions.includes('inventory.view')) {
      fail('You do not have permission to view the product catalogue.', 'FORBIDDEN');
    }
    return user;
  }

  function mapProduct(row, variants = null) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryCode: row.category_code,
      brandId: row.brand_id,
      brandName: row.brand_name,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      hsnCode: row.hsn_code,
      taxRateBp: row.tax_rate_bp,
      status: row.status,
      stock: Number(row.stock || 0),
      variantCount: Number(row.variant_count || 0),
      minPricePaise: Number(row.min_price_paise || 0),
      maxPricePaise: Number(row.max_price_paise || 0),
      lowStockCount: Number(row.low_stock_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      variants: variants || undefined,
    };
  }

  function categories({ includeInactive = false } = {}) {
    auth.requireSession();
    const rows = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
         FROM categories c ${includeInactive ? '' : "WHERE c.status = 'active'"} ORDER BY c.name`
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status,
      productCount: Number(row.product_count || 0),
    }));
  }

  function createCategory(input) {
    const user = auth.requirePermission('products.manage');
    const name = requireText(input.name, 'Category name', { max: 80 });
    const code = requireText(input.code || name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3), 'Category code', {
      max: 8,
    }).toUpperCase();
    if (db.prepare('SELECT id FROM categories WHERE name = ?').get(name)) fail('A category with this name already exists.');
    if (db.prepare('SELECT id FROM categories WHERE code = ?').get(code)) fail('A category with this code already exists.');
    const result = db
      .prepare("INSERT INTO categories (name, code, status, created_at) VALUES (?, ?, 'active', ?)")
      .run(name, code, nowIso());
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'category.created',
      entityType: 'category',
      entityId: Number(result.lastInsertRowid),
      details: { name, code },
    });
    return { id: Number(result.lastInsertRowid) };
  }

  function updateCategory(id, input) {
    const user = auth.requirePermission('products.manage');
    const categoryId = requireInt(id, 'Category', { min: 1 });
    const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
    if (!current) fail('Category not found.');
    const name = requireText(input.name ?? current.name, 'Category name', { max: 80 });
    const code = requireText(input.code ?? current.code, 'Category code', { max: 8 }).toUpperCase();
    const status = input.status ?? current.status;
    if (!['active', 'inactive'].includes(status)) fail('Choose a valid category status.');
    const duplicate = db
      .prepare('SELECT id FROM categories WHERE (name = ? OR code = ?) AND id <> ?')
      .get(name, code, categoryId);
    if (duplicate) fail('Another category already uses this name or code.');
    if (status === 'inactive' && current.status === 'active') {
      const products = db.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id = ? AND status = 'active'").get(categoryId);
      if (Number(products.count) > 0) fail('Deactivate the products in this category first.');
    }
    db.prepare('UPDATE categories SET name = ?, code = ?, status = ? WHERE id = ?').run(name, code, status, categoryId);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'category.updated',
      entityType: 'category',
      entityId: categoryId,
      details: { name, code, status },
    });
    return { updated: true };
  }

  function brands({ includeInactive = false } = {}) {
    auth.requireSession();
    return db
      .prepare(
        `SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS product_count
         FROM brands b ${includeInactive ? '' : "WHERE b.status = 'active'"} ORDER BY b.name`
      )
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        productCount: Number(row.product_count || 0),
      }));
  }

  function createBrand(input) {
    const user = auth.requirePermission('products.manage');
    const name = requireText(input.name, 'Brand name', { max: 80 });
    if (db.prepare('SELECT id FROM brands WHERE name = ?').get(name)) fail('A brand with this name already exists.');
    const result = db.prepare("INSERT INTO brands (name, status, created_at) VALUES (?, 'active', ?)").run(name, nowIso());
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'brand.created',
      entityType: 'brand',
      entityId: Number(result.lastInsertRowid),
      details: { name },
    });
    return { id: Number(result.lastInsertRowid) };
  }

  function listProducts({ query = '', categoryId = null, status = null, lowStock = false, limit = 500 } = {}) {
    requireCatalogue();
    const where = ['1 = 1'];
    const params = [];
    if (query) {
      where.push('(p.name LIKE ? OR c.name LIKE ? OR EXISTS (SELECT 1 FROM product_variants vq WHERE vq.product_id = p.id AND (vq.sku LIKE ? OR vq.barcode LIKE ?)))');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like, like);
    }
    if (categoryId) {
      where.push('p.category_id = ?');
      params.push(Number(categoryId));
    }
    if (status) {
      where.push('p.status = ?');
      params.push(status);
    }
    if (lowStock) {
      where.push(
        `EXISTS (SELECT 1 FROM product_variants vl JOIN inventory_balances ibl ON ibl.variant_id = vl.id
                 WHERE vl.product_id = p.id AND vl.status = 'active' AND ibl.quantity <= vl.low_stock_threshold)`
      );
    }
    const rows = db
      .prepare(
        `SELECT p.*, c.name AS category_name, c.code AS category_code, b.name AS brand_name, s.name AS supplier_name,
                COUNT(v.id) AS variant_count,
                COALESCE(SUM(CASE WHEN v.status = 'active' THEN ib.quantity ELSE 0 END), 0) AS stock,
                MIN(v.price_paise) AS min_price_paise,
                MAX(v.price_paise) AS max_price_paise,
                SUM(CASE WHEN v.status = 'active' AND COALESCE(ib.quantity, 0) <= v.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock_count
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN product_variants v ON v.product_id = p.id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE ${where.join(' AND ')}
         GROUP BY p.id
         ORDER BY p.updated_at DESC, p.id DESC
         LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 1000));
    return rows.map((row) => mapProduct(row));
  }

  function getProduct(id) {
    requireCatalogue();
    const productId = requireInt(id, 'Product', { min: 1 });
    const row = productRow(db, productId);
    if (!row) fail('Product not found.');
    return mapProduct(row, variantRows(db, productId));
  }

  function createProduct(input) {
    const user = auth.requirePermission('products.manage');
    return transaction(db, () => {
      const name = requireText(input.name, 'Product name', { max: 160 });
      const description = optionalText(input.description, { max: 2000 });
      const categoryId = requireInt(input.categoryId, 'Category', { min: 1 });
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
      if (!category || category.status !== 'active') fail('Choose an active category.');
      const brandId = input.brandId ? requireInt(input.brandId, 'Brand', { min: 1 }) : null;
      if (brandId && !db.prepare('SELECT id FROM brands WHERE id = ?').get(brandId)) fail('Brand not found.');
      const supplierId = input.supplierId ? requireInt(input.supplierId, 'Supplier', { min: 1 }) : null;
      if (supplierId && !db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId)) fail('Supplier not found.');
      const hsnCode = optionalText(input.hsnCode, { max: 20 });
      const taxDefault = getSetting(db, 'tax');
      const taxRateBp = requireBasisPoints(
        input.taxRateBp ?? (taxDefault.enabled ? taxDefault.defaultRateBp : 0),
        'Tax rate',
        { max: 2800 }
      );
      const status = input.status === 'inactive' ? 'inactive' : 'active';
      const now = nowIso();

      const result = db
        .prepare(
          `INSERT INTO products (name, description, category_id, brand_id, supplier_id, hsn_code, tax_rate_bp,
             status, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, description, categoryId, brandId, supplierId, hsnCode, taxRateBp, status, now, now, user.user.id, user.user.id);
      const productId = Number(result.lastInsertRowid);

      const defaults = {
        costPaise: input.costPaise,
        pricePaise: input.pricePaise,
        mrpPaise: input.mrpPaise,
        lowStockThreshold: input.lowStockThreshold,
        openingStock: input.openingStock,
      };
      let variants = Array.isArray(input.variants) ? input.variants : [];
      if (!variants.length) {
        const colors = Array.isArray(input.colors) && input.colors.length ? input.colors : ['Default'];
        const sizes = Array.isArray(input.sizes) && input.sizes.length ? input.sizes : ['Free'];
        variants = colors.flatMap((color) => sizes.map((size) => ({ color, size })));
      }
      if (!variants.length) fail('Add at least one product variant.');
      if (variants.length > 200) fail('A product cannot have more than 200 variants at once.');
      const seen = new Set();
      for (const raw of variants) {
        const variant = validateVariantInput(raw, defaults);
        const key = `${variant.color.toLowerCase()}|${variant.size.toLowerCase()}`;
        if (seen.has(key)) fail(`Duplicate variant ${variant.color} / ${variant.size}.`);
        seen.add(key);
        const barcode = raw.barcode ? requireText(raw.barcode, 'Barcode', { max: 64 }) : nextBarcode(db);
        if (db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(barcode)) fail(`Barcode ${barcode} is already in use.`);
        const sku = raw.sku
          ? requireText(raw.sku, 'SKU', { max: 64 })
          : buildSku(db, category.code, productId, variant.color, variant.size);
        if (db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(sku)) fail(`SKU ${sku} is already in use.`);
        const inserted = db
          .prepare(
            `INSERT INTO product_variants (product_id, sku, barcode, color, size, cost_paise, price_paise, mrp_paise,
               low_stock_threshold, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
          )
          .run(productId, sku, barcode, variant.color, variant.size, variant.costPaise, variant.pricePaise, variant.mrpPaise, variant.lowStockThreshold, now, now);
        const variantId = Number(inserted.lastInsertRowid);
        db.prepare('INSERT INTO inventory_balances (variant_id, quantity, updated_at) VALUES (?, 0, ?)').run(variantId, now);
        if (variant.openingStock > 0) {
          db.prepare('UPDATE inventory_balances SET quantity = ?, updated_at = ? WHERE variant_id = ?').run(
            variant.openingStock,
            now,
            variantId
          );
          db.prepare(
            `INSERT INTO stock_movements (variant_id, product_id, movement_type, quantity_change, balance_after,
               unit_cost_paise, reference_type, reference_no, reason, note, created_by, created_at)
             VALUES (?, ?, 'opening', ?, ?, ?, 'opening', 'OPENING', 'Opening stock', ?, ?, ?)`
          ).run(
            variantId,
            productId,
            variant.openingStock,
            variant.openingStock,
            variant.costPaise,
            `Opening stock recorded with ${name}`,
            user.user.id,
            now
          );
        }
      }

      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'product.created',
        entityType: 'product',
        entityId: productId,
        details: { name, category: category.name, variants: variants.length },
      });
      return getProduct(productId);
    });
  }

  function updateProduct(id, input) {
    const user = auth.requirePermission('products.manage');
    const productId = requireInt(id, 'Product', { min: 1 });
    return transaction(db, () => {
      const current = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      if (!current) fail('Product not found.');
      const name = requireText(input.name ?? current.name, 'Product name', { max: 160 });
      const description = optionalText(input.description ?? current.description, { max: 2000 });
      const categoryId = requireInt(input.categoryId ?? current.category_id, 'Category', { min: 1 });
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
      if (!category) fail('Category not found.');
      const brandId = input.brandId === undefined ? current.brand_id : input.brandId || null;
      const supplierId = input.supplierId === undefined ? current.supplier_id : input.supplierId || null;
      const hsnCode = optionalText(input.hsnCode ?? current.hsn_code, { max: 20 });
      const taxRateBp = requireBasisPoints(input.taxRateBp ?? current.tax_rate_bp, 'Tax rate');
      const status = input.status ?? current.status;
      if (!['active', 'inactive'].includes(status)) fail('Choose a valid product status.');
      db.prepare(
        `UPDATE products SET name = ?, description = ?, category_id = ?, brand_id = ?, supplier_id = ?, hsn_code = ?,
          tax_rate_bp = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?`
      ).run(
        name,
        description,
        categoryId,
        brandId,
        supplierId,
        hsnCode,
        taxRateBp,
        status,
        nowIso(),
        user.user.id,
        productId
      );
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'product.updated',
        entityType: 'product',
        entityId: productId,
        details: { name, status, category: category.name },
      });
      return getProduct(productId);
    });
  }

  function setProductStatus(id, status, action) {
    const user = auth.requirePermission('products.manage');
    const productId = requireInt(id, 'Product', { min: 1 });
    return transaction(db, () => {
      const product = db.prepare('SELECT id, name, status FROM products WHERE id = ?').get(productId);
      if (!product) fail('Product not found.');
      if (product.status === status) return getProduct(productId);
      db.prepare('UPDATE products SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(
        status,
        nowIso(),
        user.user.id,
        productId
      );
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action,
        entityType: 'product',
        entityId: productId,
        details: { name: product.name, from: product.status, to: status },
      });
      return getProduct(productId);
    });
  }

  function archiveProduct(id) {
    return setProductStatus(id, 'inactive', 'product.archived');
  }

  function restoreProduct(id) {
    return setProductStatus(id, 'active', 'product.restored');
  }

  function deleteProduct(id) {
    const user = auth.requirePermission('products.manage');
    const productId = requireInt(id, 'Product', { min: 1 });
    return transaction(db, () => {
      const product = db.prepare('SELECT id, name, status FROM products WHERE id = ?').get(productId);
      if (!product) fail('Product not found.');
      const variantIds = db
        .prepare('SELECT id FROM product_variants WHERE product_id = ?')
        .all(productId)
        .map((row) => row.id);
      const placeholders = variantIds.length ? variantIds.map(() => '?').join(',') : 'NULL';
      const history = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM sale_items WHERE variant_id IN (${placeholders})) AS sales,
                  (SELECT COUNT(*) FROM purchase_items WHERE variant_id IN (${placeholders})) AS purchases,
                  (SELECT COUNT(*) FROM stock_movements WHERE product_id = ?) AS movements`
        )
        .get(...variantIds, ...variantIds, productId);
      if (history.sales || history.purchases || history.movements) {
        // A product with history must never delete the transaction records.
        // Remove it from the active catalogue instead: old invoices and stock
        // movements stay intact, while the owner stops seeing it in new work.
        db.prepare('UPDATE products SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(
          'inactive',
          nowIso(),
          user.user.id,
          productId
        );
        writeAudit(db, {
          userId: user.user.id,
          userName: user.user.name,
          action: 'product.removed',
          entityType: 'product',
          entityId: productId,
          details: { name: product.name, mode: 'preserve_history' },
        });
        return { deleted: true, archived: true, id: productId, name: product.name };
      }
      db.prepare(`DELETE FROM inventory_balances WHERE variant_id IN (${placeholders})`).run(...variantIds);
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
      db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'product.deleted',
        entityType: 'product',
        entityId: productId,
        details: { name: product.name, variants: variantIds.length },
      });
      return { deleted: true, archived: false, id: productId, name: product.name };
    });
  }

  function addVariant(productId, input) {
    const user = auth.requirePermission('products.manage');
    const id = requireInt(productId, 'Product', { min: 1 });
    return transaction(db, () => {
      const product = db
        .prepare('SELECT p.*, c.code AS category_code FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?')
        .get(id);
      if (!product) fail('Product not found.');
      const variant = validateVariantInput(input, {});
      if (db.prepare('SELECT id FROM product_variants WHERE product_id = ? AND color = ? AND size = ?').get(id, variant.color, variant.size)) {
        fail('This colour and size already exists for the product.');
      }
      const barcode = input.barcode ? requireText(input.barcode, 'Barcode', { max: 64 }) : nextBarcode(db);
      if (db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(barcode)) fail('Barcode is already in use.');
      const sku = buildSku(db, product.category_code, id, variant.color, variant.size);
      const now = nowIso();
      const inserted = db
        .prepare(
          `INSERT INTO product_variants (product_id, sku, barcode, color, size, cost_paise, price_paise, mrp_paise,
             low_stock_threshold, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        )
        .run(id, sku, barcode, variant.color, variant.size, variant.costPaise, variant.pricePaise, variant.mrpPaise, variant.lowStockThreshold, now, now);
      const variantId = Number(inserted.lastInsertRowid);
      db.prepare('INSERT INTO inventory_balances (variant_id, quantity, updated_at) VALUES (?, 0, ?)').run(variantId, now);
      if (variant.openingStock > 0) {
        db.prepare('UPDATE inventory_balances SET quantity = ?, updated_at = ? WHERE variant_id = ?').run(variant.openingStock, now, variantId);
        db.prepare(
          `INSERT INTO stock_movements (variant_id, product_id, movement_type, quantity_change, balance_after,
             unit_cost_paise, reference_type, reference_no, reason, note, created_by, created_at)
           VALUES (?, ?, 'opening', ?, ?, ?, 'opening', 'OPENING', 'Opening stock', ?, ?, ?)`
        ).run(variantId, id, variant.openingStock, variant.openingStock, variant.costPaise, 'Opening stock for new variant', user.user.id, now);
      }
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'variant.created',
        entityType: 'product_variant',
        entityId: variantId,
        details: { productId: id, sku, barcode, color: variant.color, size: variant.size, openingStock: variant.openingStock },
      });
      return mapVariant(
        db
          .prepare(
            `SELECT v.*, COALESCE(ib.quantity, 0) AS stock FROM product_variants v
             LEFT JOIN inventory_balances ib ON ib.variant_id = v.id WHERE v.id = ?`
          )
          .get(variantId)
      );
    });
  }

  function updateVariant(variantId, input) {
    const user = auth.requirePermission('products.manage');
    const id = requireInt(variantId, 'Variant', { min: 1 });
    const current = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id);
    if (!current) fail('Product variant not found.');
    const costPaise = requireMoneyPaise(input.costPaise ?? current.cost_paise, 'Purchase cost');
    const pricePaise = requireMoneyPaise(input.pricePaise ?? current.price_paise, 'Selling price');
    const mrpPaise = requireMoneyPaise(input.mrpPaise ?? current.mrp_paise, 'MRP');
    if (pricePaise <= 0) fail('Selling price must be greater than zero.');
    if (mrpPaise > 0 && mrpPaise < pricePaise) fail('MRP cannot be lower than the selling price.');
    const lowStockThreshold = requireInt(input.lowStockThreshold ?? current.low_stock_threshold, 'Low-stock threshold', {
      min: 0,
      max: 100000,
    });
    const status = input.status ?? current.status;
    if (!['active', 'inactive'].includes(status)) fail('Choose a valid variant status.');
    const now = nowIso();
    db.prepare(
      `UPDATE product_variants SET cost_paise = ?, price_paise = ?, mrp_paise = ?, low_stock_threshold = ?,
       status = ?, updated_at = ? WHERE id = ?`
    ).run(costPaise, pricePaise, mrpPaise, lowStockThreshold, status, now, id);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'variant.updated',
      entityType: 'product_variant',
      entityId: id,
      details: {
        sku: current.sku,
        previousPricePaise: current.price_paise,
        pricePaise,
        previousCostPaise: current.cost_paise,
        costPaise,
        status,
      },
    });
    return mapVariant(
      db
        .prepare(
          `SELECT v.*, COALESCE(ib.quantity, 0) AS stock FROM product_variants v
           LEFT JOIN inventory_balances ib ON ib.variant_id = v.id WHERE v.id = ?`
        )
        .get(id)
    );
  }

  function assignBarcode(variantId) {
    const user = auth.requirePermission('products.manage');
    const id = requireInt(variantId, 'Variant', { min: 1 });
    const current = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id);
    if (!current) fail('Product variant not found.');
    if (current.barcode) return { barcode: current.barcode, assigned: false };
    return transaction(db, () => {
      const barcode = nextBarcode(db);
      db.prepare('UPDATE product_variants SET barcode = ?, updated_at = ? WHERE id = ?').run(barcode, nowIso(), id);
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'variant.barcode_assigned',
        entityType: 'product_variant',
        entityId: id,
        details: { barcode, sku: current.sku },
      });
      return { barcode, assigned: true };
    });
  }

  function regenerateBarcode(variantId, input = {}) {
    const user = auth.requirePermission('products.manage');
    const id = requireInt(variantId, 'Variant', { min: 1 });
    const current = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id);
    if (!current) fail('Product variant not found.');
    const symbology = String(input.symbology || 'upca').toLowerCase();
    if (!['upca', 'ean13'].includes(symbology)) fail('Choose UPC-A or EAN-13.');
    return transaction(db, () => {
      const config = normalizeBarcodeConfig({ ...getSetting(db, 'barcode'), symbology });
      let barcode = '';
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const sequence = allocateSequence(db, 'barcode', 'global');
        const candidate = generatedBarcode(config, sequence);
        if (!db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(candidate)) {
          barcode = candidate;
          break;
        }
      }
      if (!barcode) fail('Could not generate a unique UPC-A barcode.');
      db.prepare('UPDATE product_variants SET barcode = ?, updated_at = ? WHERE id = ?').run(barcode, nowIso(), id);
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'variant.barcode_regenerated',
        entityType: 'product_variant',
        entityId: id,
        details: { sku: current.sku, previousBarcode: current.barcode, barcode, symbology },
      });
      return { barcode, previousBarcode: current.barcode, symbology };
    });
  }

  function posLookup(code) {
    auth.requirePermission('pos.use');
    const value = requireText(code, 'Barcode or SKU', { max: 64 });
    const row = db
      .prepare(
        `SELECT v.*, p.name AS product_name, p.description AS product_description, p.tax_rate_bp,
                p.hsn_code, p.status AS product_status, c.name AS category_name,
                COALESCE(ib.quantity, 0) AS stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE v.barcode = ? COLLATE NOCASE OR v.sku = ? COLLATE NOCASE
         LIMIT 1`
      )
      .get(value, value);
    if (!row) throw new AppError(`No product found for "${value}". Check the barcode or search the catalogue.`, 'NOT_FOUND');
    if (row.product_status !== 'active' || row.status !== 'active') {
      throw new AppError(`${row.product_name} is inactive and cannot be sold.`, 'INACTIVE_PRODUCT');
    }
    return {
      variantId: row.id,
      productId: row.product_id,
      productName: row.product_name,
      description: row.product_description,
      categoryName: row.category_name,
      color: row.color,
      size: row.size,
      sku: row.sku,
      barcode: row.barcode,
      pricePaise: row.price_paise,
      mrpPaise: row.mrp_paise,
      taxRateBp: row.tax_rate_bp,
      hsnCode: row.hsn_code || '',
      stock: Number(row.stock || 0),
      lowStockThreshold: row.low_stock_threshold,
    };
  }

  function posSearch(query, { limit = 40 } = {}) {
    auth.requirePermission('pos.use');
    const text = String(query || '').trim();
    if (!text) return [];
    const like = `%${text}%`;
    return db
      .prepare(
        `SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, v.color, v.size, v.price_paise, v.mrp_paise,
                v.low_stock_threshold, p.name AS product_name, p.tax_rate_bp, c.name AS category_name,
                COALESCE(ib.quantity, 0) AS stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE p.status = 'active' AND v.status = 'active'
           AND (p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ? OR c.name LIKE ?)
         ORDER BY p.name, v.color, v.size
         LIMIT ?`
      )
      .all(like, like, like, like, Math.min(Number(limit) || 40, 100))
      .map((row) => ({
        variantId: row.variant_id,
        productId: row.product_id,
        productName: row.product_name,
        categoryName: row.category_name,
        color: row.color,
        size: row.size,
        sku: row.sku,
        barcode: row.barcode,
        pricePaise: row.price_paise,
        mrpPaise: row.mrp_paise,
        taxRateBp: row.tax_rate_bp,
        stock: Number(row.stock || 0),
        lowStockThreshold: row.low_stock_threshold,
      }));
  }

  function lowStock({ limit = 100 } = {}) {
    auth.requirePermission('inventory.view');
    return db
      .prepare(
        `SELECT v.id AS variant_id, v.sku, v.barcode, v.color, v.size, v.low_stock_threshold,
                p.id AS product_id, p.name AS product_name, c.name AS category_name,
                COALESCE(ib.quantity, 0) AS stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE p.status = 'active' AND v.status = 'active'
           AND COALESCE(ib.quantity, 0) <= v.low_stock_threshold
         ORDER BY stock ASC, p.name
         LIMIT ?`
      )
      .all(Math.min(Number(limit) || 100, 500))
      .map((row) => ({
        variantId: row.variant_id,
        productId: row.product_id,
        productName: row.product_name,
        categoryName: row.category_name,
        sku: row.sku,
        barcode: row.barcode,
        color: row.color,
        size: row.size,
        stock: Number(row.stock || 0),
        threshold: row.low_stock_threshold,
      }));
  }

  function labelData(variantIds) {
    auth.requirePermission('products.manage');
    const ids = (Array.isArray(variantIds) ? variantIds : [variantIds]).map((id) => requireInt(id, 'Variant', { min: 1 }));
    if (!ids.length) fail('Choose at least one variant to print.');
    if (ids.length > 500) fail('Print at most 500 labels at a time.');
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT v.id, v.sku, v.barcode, v.color, v.size, v.price_paise, v.mrp_paise, p.name AS product_name,
                b.name AS brand_name
         FROM product_variants v JOIN products p ON p.id = v.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         WHERE v.id IN (${placeholders})`
      )
      .all(...ids);
    const business = getSetting(db, 'business');
    const hardware = getSetting(db, 'hardware');
    return {
      businessName: business.name,
      labels: rows.map((row) => ({
        variantId: row.id,
        productName: row.product_name,
        brandName: row.brand_name || '',
        sku: row.sku,
        barcode: row.barcode,
        color: row.color,
        size: row.size,
        pricePaise: row.price_paise,
        mrpPaise: row.mrp_paise,
      })),
      options: hardware,
    };
  }

  return {
    categories,
    createCategory,
    updateCategory,
    brands,
    createBrand,
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    archiveProduct,
    restoreProduct,
    deleteProduct,
    addVariant,
    updateVariant,
    assignBarcode,
    regenerateBarcode,
    posLookup,
    posSearch,
    lowStock,
    labelData,
  };
}
