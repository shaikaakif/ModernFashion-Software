/**
 * Permission catalogue and default role grants.
 * Permissions are enforced in Electron main-process services, not only by
 * hiding navigation items in the renderer.
 */

export const PERMISSIONS = [
  ['dashboard.view', 'View own sales summary'],
  ['dashboard.viewAll', 'View shop-wide dashboard'],
  ['pos.use', 'Open the billing screen and create sales'],
  ['sales.view.own', 'View own invoices'],
  ['sales.view.all', 'View all invoices'],
  ['sales.void', 'Void a completed sale and restock items'],
  ['sales.print', 'Print and reprint receipts'],
  ['sales.discount', 'Apply a manual bill discount within the limit'],
  ['sales.discount.override', 'Exceed the configured discount limit'],
  ['products.view', 'View product catalogue'],
  ['products.manage', 'Create and edit products, variants and barcodes'],
  ['inventory.view', 'View stock levels and movement history'],
  ['inventory.adjust', 'Record manual stock adjustments'],
  ['purchases.view', 'View purchases and suppliers'],
  ['purchases.manage', 'Create purchases and supplier records'],
  ['customers.view', 'View customers and purchase history'],
  ['customers.manage', 'Create and edit customers'],
  ['expenses.view', 'View operating expenses'],
  ['expenses.manage', 'Record and edit operating expenses'],
  ['reports.sales', 'View sales, purchase and expense reports'],
  ['reports.profit', 'View cost, profit and margin information'],
  ['reports.export', 'Export reports and accounting data'],
  ['users.manage', 'Manage staff accounts and shifts'],
  ['settings.manage', 'Change business, tax, receipt, printer and offer settings'],
  ['audit.view', 'View the audit log'],
  ['backup.manage', 'Create, verify and restore database backups'],
];

export const ALL_PERMISSION_CODES = PERMISSIONS.map(([code]) => code);

export const ROLE_DEFAULTS = {
  owner: {
    name: 'Owner / Administrator',
    description: 'Full access to every module, setting and financial report.',
    permissions: ALL_PERMISSION_CODES,
  },
  manager: {
    name: 'Manager',
    description: 'Runs day-to-day operations. No staff administration, backups or store settings.',
    permissions: [
      'dashboard.view',
      'dashboard.viewAll',
      'pos.use',
      'sales.view.own',
      'sales.view.all',
      'sales.print',
      'sales.discount',
      'sales.void',
      'products.view',
      'products.manage',
      'inventory.view',
      'inventory.adjust',
      'purchases.view',
      'purchases.manage',
      'customers.view',
      'customers.manage',
      'expenses.view',
      'expenses.manage',
      'reports.sales',
      'reports.profit',
      'reports.export',
    ],
  },
  cashier: {
    name: 'Cashier / Sales Assistant',
    description: 'Billing, product lookup, customers and own transaction history only.',
    permissions: [
      'dashboard.view',
      'pos.use',
      'sales.view.own',
      'sales.print',
      'customers.view',
      'customers.manage',
    ],
  },
};

export const ROLE_CODES = Object.keys(ROLE_DEFAULTS);

export function permissionsForRole(roleCode) {
  return [...(ROLE_DEFAULTS[roleCode]?.permissions || [])];
}

export function hasPermission(permissions, code) {
  return Array.isArray(permissions) && permissions.includes(code);
}
