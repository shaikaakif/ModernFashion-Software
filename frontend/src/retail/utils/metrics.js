import dayjs from 'dayjs';

export function productStock(product) {
  return (product?.variants || []).reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
}

export function variantCount(product) {
  return (product?.variants || []).length;
}

export function findVariant(db, variantId) {
  for (const product of db.products) {
    const variant = product.variants.find((item) => item.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

export function findProduct(db, productId) {
  return db.products.find((product) => product.id === productId) || null;
}

export function customerStats(db, customerId) {
  const invoices = db.invoices.filter((invoice) => invoice.customerId === customerId);
  const totalPurchases = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.amountPaid), 0);
  const lastInvoice = [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  return {
    invoices,
    invoiceCount: invoices.length,
    totalPurchases,
    outstanding,
    lastPurchase: lastInvoice?.date || null,
  };
}

export function getCustomer(db, customerId) {
  return db.customers.find((customer) => customer.id === customerId) || null;
}

export function getSupplier(db, supplierId) {
  return db.suppliers.find((supplier) => supplier.id === supplierId) || null;
}

export function lowStockVariants(db) {
  const rows = [];
  db.products.forEach((product) => {
    product.variants.forEach((variant) => {
      if (variant.stock <= (variant.lowStockThreshold ?? 5)) {
        rows.push({ product, variant });
      }
    });
  });
  return rows;
}

function startOfDay(value = new Date()) {
  return dayjs(value).startOf('day');
}

export function getDashboardMetrics(db, now = new Date()) {
  const today = dayjs(now).format('YYYY-MM-DD');
  const todayInvoices = db.invoices.filter((invoice) => dayjs(invoice.date).format('YYYY-MM-DD') === today);
  const todaySales = todayInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalStock = db.products.reduce((sum, product) => sum + productStock(product), 0);
  const lowVariants = lowStockVariants(db);
  const lowProducts = new Set(lowVariants.map((row) => row.product.id));

  const last7 = Array.from({ length: 7 }, (_, index) => {
    const day = startOfDay(now).subtract(6 - index, 'day');
    const key = day.format('YYYY-MM-DD');
    const invoices = db.invoices.filter((invoice) => dayjs(invoice.date).format('YYYY-MM-DD') === key);
    return {
      key,
      label: day.format('ddd'),
      date: day.toDate(),
      total: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
      count: invoices.length,
    };
  });
  const maxDaySale = Math.max(...last7.map((day) => day.total), 1);

  const productSales = new Map();
  db.invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const current = productSales.get(item.productId) || {
        productId: item.productId,
        name: item.productName,
        category: item.category,
        qty: 0,
        revenue: 0,
      };
      current.qty += item.qty;
      current.revenue += item.lineTotal;
      productSales.set(item.productId, current);
    });
  });

  const topProducts = [...productSales.values()]
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 5)
    .map((item) => {
      const liveProduct = findProduct(db, item.productId);
      return { ...item, liveProduct };
    });

  return {
    todaySales,
    todayInvoiceCount: todayInvoices.length,
    totalInvoices: db.invoices.length,
    totalProducts: db.products.length,
    totalCustomers: db.customers.length,
    totalStock,
    lowStockProductCount: lowProducts.size,
    lowStockVariantCount: lowVariants.length,
    lowStockRows: lowVariants.sort((a, b) => a.variant.stock - b.variant.stock).slice(0, 6),
    recentInvoices: [...db.invoices].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    recentPurchases: [...db.purchases].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    last7,
    maxDaySale,
    topProducts,
    totalSales: db.invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    outstanding: db.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.amountPaid), 0),
  };
}

export function nextInvoiceNumber(db) {
  const seq = Math.max(Number(db.meta?.invoiceSeq) || 1000, 1000) + 1;
  return `INV-${seq}`;
}

export function nextPurchaseReference(db) {
  const seq = Math.max(Number(db.meta?.purchaseSeq) || 2000, 2000) + 1;
  return `PUR-${seq}`;
}

export function nextBarcode(db) {
  const seq = Math.max(Number(db.meta?.barcodeSeq) || 0, 0) + 1;
  return { value: `MF${String(seq).padStart(7, '0')}`, seq };
}
