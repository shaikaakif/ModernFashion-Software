import { DatabaseSync } from 'node:sqlite';
import { nowIso } from './validation.js';
import { PERMISSIONS, ROLE_DEFAULTS } from '../../shared/permissions.js';

export const DEFAULT_SETTINGS = {
  business: {
    name: 'MODERN FASHION',
    addressLines: ['13-431/C/48', 'MOGHAL KA NALA', 'PILLAR NO 101 ATTAPUR RING ROAD', 'HYD 48'],
    city: 'Hyderabad',
    stateName: 'Telangana',
    stateCode: '36',
    phone: '7093230999',
    altPhone: '',
    email: '',
    gstin: '',
    legalName: '',
    returnPolicy: '',
    mapUrl: '',
    logoPath: '',
  },
  invoice: {
    prefix: 'MF',
    purchasePrefix: 'PUR',
    paperWidthMm: 80,
    duplicateLabel: 'DUPLICATE COPY',
    showLogo: true,
    logoHeightMm: 16,
    showAddress: true,
    showPhone: true,
    showState: true,
    showGstin: true,
    showTitle: true,
    terms: '',
    thankYou: 'Thank you for shopping with us!',
  },
  tax: {
    enabled: false,
    defaultRateBp: 0,
    gstin: '',
    legalName: '',
    placeOfSupply: '36 - Telangana',
    invoiceTitle: 'Invoice',
    pricesIncludeTax: false,
  },
  pos: {
    manualDiscountMaxPercent: 0,
    cashierManualDiscountMaxPercent: 0,
    defaultPaymentMethod: 'cash',
    lowStockThreshold: 5,
    allowWalkIn: true,
    scannerMinLength: 4,
    scannerSuffix: 'enter',
    confirmClearCart: true,
    sessionIdleMinutes: 60,
    maxLoginAttempts: 5,
    lockMinutes: 15,
  },
  backup: {
    enabled: true,
    directory: '',
    intervalHours: 24,
    retention: 30,
    lastAutoAt: '',
  },
  hardware: {
    receiptPrinter: '',
    labelPrinter: '',
    autoPrintReceipt: true,
    receiptWidthMm: 77,
    labelWidthMm: 50,
    labelHeightMm: 25,
    labelCopies: 1,
    labelShowPrice: true,
    labelShowSku: true,
    labelShowName: true,
    labelShowSize: true,
  },
  receipt: {
    showCustomer: true,
    showCashier: true,
    showSavings: true,
    showTax: true,
    showSku: true,
    showItemDiscounts: true,
    showPayment: true,
    showAmountReceived: true,
    showPoweredBy: true,
    headerNote: '',
    fontScale: 100,
    footerNote: 'We appreciate your business. Visit us again.',
    whatsappCaption:
      'Hello {customer}, thank you for shopping at {shop}. Invoice {invoice} for {amount} is attached.',
  },
  barcode: {
    symbology: 'ean13',
    prefix: 'MF',
    digits: 10,
    eanPrefix: '20',
  },
  alerts: {
    lowStockEnabled: true,
  },
  vyaparImport: {
    lastImport: null,
  },
};

const CATEGORY_SEED = [
  ['Jeans', 'JEA'],
  ['Shirts', 'SHR'],
  ['T-shirts', 'TSH'],
  ['Hoodies', 'HOO'],
  ['Jackets', 'JAC'],
  ['Trousers', 'TRO'],
  ['Shorts', 'SHT'],
  ['Tracksuits', 'TRK'],
  ['Kurta sets', 'KUR'],
  ['Shoes', 'SHO'],
  ['Socks', 'SOC'],
  ['Accessories', 'ACC'],
  ['Other', 'OTH'],
];

const EXPENSE_CATEGORY_SEED = [
  'Salaries',
  'Rent',
  'Electricity',
  'Internet & Telephone',
  'Transport',
  'Repairs & Maintenance',
  'Packaging & Stationery',
  'Office Expenses',
  'Miscellaneous',
];

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up(db) {
      db.exec(`
        CREATE TABLE roles (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE permissions (
          code TEXT PRIMARY KEY,
          description TEXT NOT NULL
        );

        CREATE TABLE role_permissions (
          role_code TEXT NOT NULL REFERENCES roles(code),
          permission_code TEXT NOT NULL REFERENCES permissions(code),
          PRIMARY KEY (role_code, permission_code)
        );

        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          mobile TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role_code TEXT NOT NULL REFERENCES roles(code),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id)
        );

        CREATE TABLE app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by INTEGER REFERENCES users(id)
        );

        CREATE TABLE suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          contact_person TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          gstin TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          code TEXT NOT NULL UNIQUE COLLATE NOCASE,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL
        );

        CREATE TABLE brands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL
        );

        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category_id INTEGER NOT NULL REFERENCES categories(id),
          brand_id INTEGER REFERENCES brands(id),
          supplier_id INTEGER REFERENCES suppliers(id),
          hsn_code TEXT NOT NULL DEFAULT '',
          tax_rate_bp INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bp BETWEEN 0 AND 2800),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id),
          updated_by INTEGER REFERENCES users(id)
        );

        CREATE TABLE product_variants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id),
          sku TEXT NOT NULL UNIQUE,
          barcode TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL DEFAULT '',
          size TEXT NOT NULL DEFAULT '',
          cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (cost_paise >= 0),
          price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
          mrp_paise INTEGER NOT NULL DEFAULT 0 CHECK (mrp_paise >= 0),
          low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_products_name ON products(name);
        CREATE INDEX idx_products_category ON products(category_id);
        CREATE INDEX idx_variants_product ON product_variants(product_id);
        CREATE INDEX idx_variants_barcode ON product_variants(barcode);
        CREATE INDEX idx_variants_sku ON product_variants(sku);

        CREATE TABLE inventory_balances (
          variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id),
          quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
          updated_at TEXT NOT NULL
        );

        CREATE TABLE stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          variant_id INTEGER NOT NULL REFERENCES product_variants(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          movement_type TEXT NOT NULL CHECK (movement_type IN (
            'opening', 'purchase', 'sale', 'sale_return', 'purchase_return',
            'adjustment_in', 'adjustment_out', 'damage'
          )),
          quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
          balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
          unit_cost_paise INTEGER NOT NULL DEFAULT 0,
          reference_type TEXT NOT NULL DEFAULT '',
          reference_id INTEGER,
          reference_no TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          created_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL
        );

        CREATE INDEX idx_movements_variant ON stock_movements(variant_id, created_at);
        CREATE INDEX idx_movements_reference ON stock_movements(reference_type, reference_id);

        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_customers_name ON customers(name);

        CREATE TABLE cash_shifts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          opening_cash_paise INTEGER NOT NULL DEFAULT 0,
          counted_cash_paise INTEGER,
          expected_cash_paise INTEGER,
          variance_paise INTEGER,
          status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
          notes TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX idx_shifts_user ON cash_shifts(user_id, opened_at);

        CREATE TABLE purchases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reference TEXT NOT NULL UNIQUE,
          supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
          supplier_invoice_ref TEXT NOT NULL DEFAULT '',
          purchase_date TEXT NOT NULL,
          business_date TEXT NOT NULL,
          subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
          discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
          additional_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (additional_cost_paise >= 0),
          tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
          total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
          amount_paid_paise INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_paise >= 0),
          balance_paise INTEGER NOT NULL DEFAULT 0,
          payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_purchases_date ON purchases(business_date);
        CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);

        CREATE TABLE purchase_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          purchase_id INTEGER NOT NULL REFERENCES purchases(id),
          variant_id INTEGER NOT NULL REFERENCES product_variants(id),
          product_name TEXT NOT NULL,
          variant_label TEXT NOT NULL,
          sku TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          unit_cost_paise INTEGER NOT NULL CHECK (unit_cost_paise >= 0),
          discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
          additional_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (additional_cost_paise >= 0),
          tax_rate_bp INTEGER NOT NULL DEFAULT 0,
          tax_paise INTEGER NOT NULL DEFAULT 0,
          hsn_code TEXT NOT NULL DEFAULT '',
          line_total_paise INTEGER NOT NULL
        );

        CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

        CREATE TABLE purchase_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          purchase_id INTEGER NOT NULL REFERENCES purchases(id),
          amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
          method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'bank_transfer', 'cheque')),
          reference TEXT NOT NULL DEFAULT '',
          paid_at TEXT NOT NULL,
          created_by INTEGER NOT NULL REFERENCES users(id)
        );

        CREATE INDEX idx_purchase_payments_purchase ON purchase_payments(purchase_id);

        CREATE TABLE sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_no TEXT NOT NULL UNIQUE,
          idempotency_key TEXT NOT NULL UNIQUE,
          customer_id INTEGER REFERENCES customers(id),
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          sale_date TEXT NOT NULL,
          business_date TEXT NOT NULL,
          subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
          line_discount_paise INTEGER NOT NULL DEFAULT 0,
          bill_discount_paise INTEGER NOT NULL DEFAULT 0,
          discount_total_paise INTEGER NOT NULL DEFAULT 0,
          tax_paise INTEGER NOT NULL DEFAULT 0,
          round_off_paise INTEGER NOT NULL DEFAULT 0,
          total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
          amount_paid_paise INTEGER NOT NULL DEFAULT 0,
          change_paise INTEGER NOT NULL DEFAULT 0,
          payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
          payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'credit')),
          cashier_id INTEGER NOT NULL REFERENCES users(id),
          shift_id INTEGER REFERENCES cash_shifts(id),
          status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'void')),
          notes TEXT NOT NULL DEFAULT '',
          offer_id INTEGER,
          offer_name TEXT NOT NULL DEFAULT '',
          tax_enabled INTEGER NOT NULL DEFAULT 0,
          tax_rate_bp INTEGER NOT NULL DEFAULT 0,
          prices_include_tax INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          completed_at TEXT NOT NULL,
          voided_at TEXT,
          voided_by INTEGER REFERENCES users(id),
          void_reason TEXT NOT NULL DEFAULT '',
          print_count INTEGER NOT NULL DEFAULT 0,
          last_printed_at TEXT,
          pdf_path TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX idx_sales_date ON sales(business_date);
        CREATE INDEX idx_sales_cashier ON sales(cashier_id, business_date);
        CREATE INDEX idx_sales_customer ON sales(customer_id);
        CREATE INDEX idx_sales_status ON sales(status);

        CREATE TABLE sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL REFERENCES sales(id),
          variant_id INTEGER NOT NULL REFERENCES product_variants(id),
          product_name TEXT NOT NULL,
          variant_label TEXT NOT NULL,
          sku TEXT NOT NULL,
          barcode TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
          mrp_paise INTEGER NOT NULL DEFAULT 0,
          unit_cost_paise INTEGER NOT NULL DEFAULT 0,
          line_discount_paise INTEGER NOT NULL DEFAULT 0,
          tax_rate_bp INTEGER NOT NULL DEFAULT 0,
          tax_paise INTEGER NOT NULL DEFAULT 0,
          hsn_code TEXT NOT NULL DEFAULT '',
          line_total_paise INTEGER NOT NULL
        );

        CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
        CREATE INDEX idx_sale_items_variant ON sale_items(variant_id);

        CREATE TABLE payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL REFERENCES sales(id),
          method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'bank_transfer', 'credit')),
          amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
          reference TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        CREATE INDEX idx_payments_sale ON payments(sale_id);

        CREATE TABLE expense_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL
        );

        CREATE TABLE expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          expense_date TEXT NOT NULL,
          business_date TEXT NOT NULL,
          category_id INTEGER NOT NULL REFERENCES expense_categories(id),
          amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
          payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'cheque')),
          description TEXT NOT NULL,
          reference TEXT NOT NULL DEFAULT '',
          vendor TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_expenses_date ON expenses(business_date);

        CREATE TABLE offers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
          value INTEGER NOT NULL CHECK (value > 0),
          min_bill_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_bill_paise >= 0),
          max_discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (max_discount_paise >= 0),
          starts_on TEXT,
          ends_on TEXT,
          priority INTEGER NOT NULL DEFAULT 100,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE sequences (
          scope TEXT NOT NULL,
          period TEXT NOT NULL,
          next_value INTEGER NOT NULL,
          PRIMARY KEY (scope, period)
        );

        CREATE TABLE audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          user_name TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          details TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );

        CREATE INDEX idx_audit_created ON audit_logs(created_at);

        CREATE TABLE backup_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('manual', 'auto', 'pre_restore')),
          status TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_by INTEGER,
          created_at TEXT NOT NULL
        );

        CREATE TRIGGER trg_sales_no_delete
        BEFORE DELETE ON sales
        BEGIN
          SELECT RAISE(ABORT, 'Completed sales cannot be deleted. Use the void workflow.');
        END;

        CREATE TRIGGER trg_purchases_no_delete
        BEFORE DELETE ON purchases
        BEGIN
          SELECT RAISE(ABORT, 'Posted purchases cannot be deleted.');
        END;

        CREATE TRIGGER trg_sale_items_no_delete
        BEFORE DELETE ON sale_items
        BEGIN
          SELECT RAISE(ABORT, 'Sale items are historical records and cannot be deleted.');
        END;

        CREATE TRIGGER trg_stock_movements_no_update
        BEFORE UPDATE ON stock_movements
        BEGIN
          SELECT RAISE(ABORT, 'Stock movements are immutable.');
        END;

        CREATE TRIGGER trg_stock_movements_no_delete
        BEFORE DELETE ON stock_movements
        BEGIN
          SELECT RAISE(ABORT, 'Stock movements are immutable.');
        END;

        CREATE TRIGGER trg_audit_no_update
        BEFORE UPDATE ON audit_logs
        BEGIN
          SELECT RAISE(ABORT, 'Audit logs are immutable.');
        END;

        CREATE TRIGGER trg_audit_no_delete
        BEFORE DELETE ON audit_logs
        BEGIN
          SELECT RAISE(ABORT, 'Audit logs are immutable.');
        END;
      `);

      seedPermissionsAndRoles(db);
      seedCategories(db);
      seedExpenseCategories(db);
      seedSettings(db);
    },
  },
  {
    version: 2,
    name: 'sales_prices_include_tax',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(sales)').all().map((row) => row.name);
      if (!columns.includes('prices_include_tax')) {
        db.exec('ALTER TABLE sales ADD COLUMN prices_include_tax INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    version: 3,
    name: 'sales_customer_gstin',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(sales)').all().map((row) => row.name);
      if (!columns.includes('customer_gstin')) {
        db.exec("ALTER TABLE sales ADD COLUMN customer_gstin TEXT NOT NULL DEFAULT ''");
      }
    },
  },
  {
    version: 4,
    name: 'negative_stock_support',
    up(db) {
      // Rebuild both stock tables without the non-negative checks so imported
      // Vyapar balances and legitimate overselling can be represented exactly.
      db.exec(`
        CREATE TABLE inventory_balances_new (
          variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id),
          quantity INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        INSERT INTO inventory_balances_new (variant_id, quantity, updated_at)
          SELECT variant_id, quantity, updated_at FROM inventory_balances;
        DROP TABLE inventory_balances;
        ALTER TABLE inventory_balances_new RENAME TO inventory_balances;

        CREATE TABLE stock_movements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          variant_id INTEGER NOT NULL REFERENCES product_variants(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          movement_type TEXT NOT NULL CHECK (movement_type IN (
            'opening', 'purchase', 'sale', 'sale_return', 'purchase_return',
            'adjustment_in', 'adjustment_out', 'damage'
          )),
          quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
          balance_after INTEGER NOT NULL,
          unit_cost_paise INTEGER NOT NULL DEFAULT 0,
          reference_type TEXT NOT NULL DEFAULT '',
          reference_id INTEGER,
          reference_no TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          created_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL
        );
        INSERT INTO stock_movements_new (
          id, variant_id, product_id, movement_type, quantity_change, balance_after,
          unit_cost_paise, reference_type, reference_id, reference_no, reason, note,
          created_by, created_at
        )
          SELECT id, variant_id, product_id, movement_type, quantity_change, balance_after,
                 unit_cost_paise, reference_type, reference_id, reference_no, reason, note,
                 created_by, created_at
          FROM stock_movements;
        DROP TABLE stock_movements;
        ALTER TABLE stock_movements_new RENAME TO stock_movements;
        CREATE INDEX idx_movements_variant ON stock_movements(variant_id, created_at);
        CREATE INDEX idx_movements_reference ON stock_movements(reference_type, reference_id);
      `);
    },
  },
  {
    version: 5,
    name: 'user_removal_metadata',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
      if (!columns.includes('removed_at')) {
        db.exec('ALTER TABLE users ADD COLUMN removed_at TEXT');
      }
      if (!columns.includes('removed_by')) {
        db.exec('ALTER TABLE users ADD COLUMN removed_by INTEGER REFERENCES users(id)');
      }
      if (!columns.includes('removal_reason')) {
        db.exec("ALTER TABLE users ADD COLUMN removal_reason TEXT NOT NULL DEFAULT ''");
      }
    },
  },
];

function seedPermissionsAndRoles(db) {
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (code, name, description) VALUES (?, ?, ?)');
  const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (code, description) VALUES (?, ?)');
  const grant = db.prepare('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)');

  for (const [code, description] of PERMISSIONS) insertPermission.run(code, description);
  for (const [roleCode, role] of Object.entries(ROLE_DEFAULTS)) {
    insertRole.run(roleCode, role.name, role.description);
    for (const permission of role.permissions) grant.run(roleCode, permission);
  }
}

function seedCategories(db) {
  const now = nowIso();
  const insert = db.prepare('INSERT OR IGNORE INTO categories (name, code, status, created_at) VALUES (?, ?, ?, ?)');
  for (const [name, code] of CATEGORY_SEED) insert.run(name, code, 'active', now);
}

function seedExpenseCategories(db) {
  const now = nowIso();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO expense_categories (name, status, created_at) VALUES (?, ?, ?)'
  );
  for (const name of EXPENSE_CATEGORY_SEED) insert.run(name, 'active', now);
}

function seedSettings(db) {
  const now = nowIso();
  const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, JSON.stringify(value), now);
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export function runMigrations(db) {
  ensureMigrationsTable(db);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        nowIso()
      );
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure; the original error is more useful.
      }
      throw error;
    }
  }
}

export function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  if (filename !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA busy_timeout = 5000');
  runMigrations(db);
  return db;
}

let transactionDepth = 0;

export function transaction(db, work) {
  if (transactionDepth > 0) return work();
  db.exec('BEGIN IMMEDIATE');
  transactionDepth += 1;
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failure; the original error is more useful.
    }
    throw error;
  } finally {
    transactionDepth -= 1;
  }
}

export function integrityCheck(db) {
  const quick = db.prepare('PRAGMA quick_check').all();
  const messages = quick.map((row) => Object.values(row)[0]);
  return { ok: messages.length === 1 && messages[0] === 'ok', messages };
}
