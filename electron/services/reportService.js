import { fail } from '../core/errors.js';
import { businessDate, monthRange, requireDateKey } from '../core/validation.js';
import { getSetting, publicBusiness } from '../core/settings.js';

function resolveRange({ from, to, month } = {}) {
  if (month) {
    const range = monthRange(month);
    return range;
  }
  const start = from ? requireDateKey(from, 'From date') : businessDate(new Date(Date.now() - 29 * 86400000));
  const end = to ? requireDateKey(to, 'To date') : businessDate();
  if (start > end) fail('From date cannot be after the to date.');
  return { from: start, to: end };
}

function salesWhere({ ownUserId = null, alias = 's' } = {}) {
  const where = [`${alias}.status = 'completed'`];
  const params = [];
  if (ownUserId) {
    where.push(`${alias}.cashier_id = ?`);
    params.push(ownUserId);
  }
  return { where, params };
}

export function createReportService({ db, auth, catalog }) {
  function totalsForRange({ from, to, ownUserId = null }) {
    const { where, params } = salesWhere({ ownUserId });
    const row = db
      .prepare(
        `SELECT COUNT(${where[0] ? 's.id' : 's.id'}) AS invoice_count,
                COALESCE(SUM(s.subtotal_paise), 0) AS gross_sales,
                COALESCE(SUM(s.discount_total_paise), 0) AS discount_total,
                COALESCE(SUM(s.subtotal_paise - s.discount_total_paise -
                  (CASE WHEN s.prices_include_tax = 1 THEN s.tax_paise ELSE 0 END)), 0) AS net_sales,
                COALESCE(SUM(s.tax_paise), 0) AS tax_total,
                COALESCE(SUM(s.round_off_paise), 0) AS round_off,
                COALESCE(SUM(s.total_paise), 0) AS invoice_total,
                COALESCE(SUM(s.amount_paid_paise), 0) AS amount_paid,
                COALESCE(SUM(CASE WHEN s.amount_paid_paise < s.total_paise THEN s.total_paise - s.amount_paid_paise ELSE 0 END), 0) AS outstanding,
                COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id
                          WHERE s2.status = 'completed' AND s2.business_date BETWEEN ? AND ?
                          ${ownUserId ? 'AND s2.cashier_id = ?' : ''}), 0) AS units,
                COALESCE((SELECT SUM(si.unit_cost_paise * si.quantity) FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id
                          WHERE s2.status = 'completed' AND s2.business_date BETWEEN ? AND ?
                          ${ownUserId ? 'AND s2.cashier_id = ?' : ''}), 0) AS cogs
         FROM sales s
         WHERE ${where.join(' AND ')} AND s.business_date BETWEEN ? AND ?`
      )
      .get(
        from,
        to,
        ...(ownUserId ? [ownUserId] : []),
        from,
        to,
        ...(ownUserId ? [ownUserId] : []),
        ...params,
        from,
        to
      );
    return {
      invoiceCount: Number(row.invoice_count || 0),
      grossSalesPaise: Number(row.gross_sales || 0),
      discountTotalPaise: Number(row.discount_total || 0),
      netSalesPaise: Number(row.net_sales || 0),
      taxTotalPaise: Number(row.tax_total || 0),
      roundOffPaise: Number(row.round_off || 0),
      invoiceTotalPaise: Number(row.invoice_total || 0),
      amountPaidPaise: Number(row.amount_paid || 0),
      outstandingPaise: Number(row.outstanding || 0),
      units: Number(row.units || 0),
      cogsPaise: Number(row.cogs || 0),
      grossProfitPaise: Number(row.net_sales || 0) - Number(row.cogs || 0),
      averageBillPaise: Number(row.invoice_count || 0) > 0 ? Math.round(Number(row.invoice_total || 0) / Number(row.invoice_count)) : 0,
    };
  }

  function expenseTotal({ from, to }) {
    const row = db
      .prepare("SELECT COALESCE(SUM(amount_paise), 0) AS total, COUNT(*) AS count FROM expenses WHERE status = 'active' AND business_date BETWEEN ? AND ?")
      .get(from, to);
    return { totalPaise: Number(row.total || 0), count: Number(row.count || 0) };
  }

  function purchaseTotal({ from, to }) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(total_paise), 0) AS total, COUNT(*) AS count, COALESCE(SUM(balance_paise), 0) AS outstanding
         FROM purchases WHERE status = 'posted' AND business_date BETWEEN ? AND ?`
      )
      .get(from, to);
    return { totalPaise: Number(row.total || 0), count: Number(row.count || 0), outstandingPaise: Number(row.outstanding || 0) };
  }

  function paymentBreakdown({ from, to, ownUserId = null }) {
    const { where, params } = salesWhere({ ownUserId });
    return db
      .prepare(
        `SELECT s.payment_method, COUNT(*) AS count, COALESCE(SUM(s.total_paise), 0) AS total
         FROM sales s WHERE ${where.join(' AND ')} AND s.business_date BETWEEN ? AND ?
         GROUP BY s.payment_method ORDER BY total DESC`
      )
      .all(...params, from, to)
      .map((row) => ({ method: row.payment_method, count: Number(row.count || 0), totalPaise: Number(row.total || 0) }));
  }

  function dailySeries({ from, to, ownUserId = null }) {
    const { where, params } = salesWhere({ ownUserId });
    const rows = db
      .prepare(
        `SELECT s.business_date, COUNT(*) AS count,
                COALESCE(SUM(s.subtotal_paise - s.discount_total_paise -
                  (CASE WHEN s.prices_include_tax = 1 THEN s.tax_paise ELSE 0 END)), 0) AS net_sales,
                COALESCE(SUM(s.total_paise), 0) AS total
         FROM sales s WHERE ${where.join(' AND ')} AND s.business_date BETWEEN ? AND ?
         GROUP BY s.business_date ORDER BY s.business_date`
      )
      .all(...params, from, to);
    const byDate = new Map(rows.map((row) => [row.business_date, row]));
    const series = [];
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    for (let cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = cursor.toISOString().slice(0, 10);
      const row = byDate.get(key);
      series.push({
        date: key,
        invoiceCount: Number(row?.count || 0),
        netSalesPaise: Number(row?.net_sales || 0),
        totalPaise: Number(row?.total || 0),
      });
    }
    return series;
  }

  function cashierSeries({ from, to }) {
    return db
      .prepare(
        `SELECT u.id, u.name, COUNT(s.id) AS invoice_count,
                COALESCE(SUM(s.total_paise), 0) AS total,
                COALESCE(SUM(s.discount_total_paise), 0) AS discount
         FROM sales s JOIN users u ON u.id = s.cashier_id
         WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         GROUP BY u.id ORDER BY total DESC`
      )
      .all(from, to)
      .map((row) => ({
        userId: row.id,
        userName: row.name,
        invoiceCount: Number(row.invoice_count || 0),
        totalPaise: Number(row.total || 0),
        discountPaise: Number(row.discount || 0),
      }));
  }

  function topProducts({ from, to, limit = 10, ownUserId = null }) {
    const { where, params } = salesWhere({ ownUserId });
    return db
      .prepare(
        `SELECT si.product_name, si.sku, si.variant_label,
                SUM(si.quantity) AS units,
                COALESCE(SUM(si.unit_price_paise * si.quantity), 0) AS gross,
                COALESCE(SUM(si.line_discount_paise), 0) AS discount,
                COALESCE(SUM(si.line_total_paise - si.tax_paise), 0) AS net,
                COALESCE(SUM(si.unit_cost_paise * si.quantity), 0) AS cogs
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE ${where.join(' AND ')} AND s.business_date BETWEEN ? AND ?
         GROUP BY si.variant_id ORDER BY units DESC, net DESC LIMIT ?`
      )
      .all(...params, from, to, Math.min(Number(limit) || 10, 100))
      .map((row) => ({
        productName: row.product_name,
        sku: row.sku,
        variantLabel: row.variant_label,
        units: Number(row.units || 0),
        grossPaise: Number(row.gross || 0),
        discountPaise: Number(row.discount || 0),
        netSalesPaise: Number(row.net || 0),
        cogsPaise: Number(row.cogs || 0),
        grossProfitPaise: Number(row.net || 0) - Number(row.cogs || 0),
      }));
  }

  function dashboard({ date = null } = {}) {
    const user = auth.requirePermission('dashboard.view');
    const dateKey = requireDateKey(date || businessDate(), 'Dashboard date');
    const canSeeAll = user.permissions.includes('dashboard.viewAll');
    const ownUserId = canSeeAll ? null : user.user.id;
    const sales = totalsForRange({ from: dateKey, to: dateKey, ownUserId });
    const month = monthRange(dateKey.slice(0, 7));
    const monthSales = totalsForRange({ ...month, ownUserId });
    const payments = paymentBreakdown({ from: dateKey, to: dateKey, ownUserId });
    const purchases = canSeeAll ? purchaseTotal({ from: dateKey, to: dateKey }) : null;
    const expenses = canSeeAll ? expenseTotal({ from: dateKey, to: dateKey }) : null;
    const series = dailySeries({ from: businessDate(new Date(Date.now() - 6 * 86400000)), to: dateKey, ownUserId });
    const products = topProducts({ from: dateKey, to: dateKey, limit: 6, ownUserId });
    const recent = db
      .prepare(
        `SELECT s.id, s.invoice_no, s.customer_name, s.total_paise, s.payment_method, s.status, s.completed_at,
                u.name AS cashier_name
         FROM sales s JOIN users u ON u.id = s.cashier_id
         WHERE ${canSeeAll ? '1 = 1' : 's.cashier_id = ?'} AND s.business_date = ?
         ORDER BY s.id DESC LIMIT 8`
      )
      .all(...(canSeeAll ? [] : [user.user.id]), dateKey)
      .map((row) => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        customerName: row.customer_name,
        totalPaise: row.total_paise,
        paymentMethod: row.payment_method,
        status: row.status,
        completedAt: row.completed_at,
        cashierName: row.cashier_name,
      }));
    const offers = db.prepare("SELECT COUNT(*) AS count FROM offers WHERE status = 'active'").get();
    const lowStock = canSeeAll ? catalog.lowStock({ limit: 8 }) : [];
    const stockCounts = canSeeAll
      ? db
          .prepare(
            `SELECT SUM(CASE WHEN COALESCE(ib.quantity, 0) = 0 THEN 1 ELSE 0 END) AS out_of_stock,
                    SUM(CASE WHEN COALESCE(ib.quantity, 0) > 0 AND COALESCE(ib.quantity, 0) <= v.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
             WHERE p.status = 'active' AND v.status = 'active'`
          )
          .get()
      : null;
    const canSeeProfit = user.permissions.includes('reports.profit');
    const salesForUser = { ...sales };
    const monthForUser = { ...monthSales };
    if (!canSeeProfit) {
      delete salesForUser.cogsPaise;
      delete salesForUser.grossProfitPaise;
      delete monthForUser.cogsPaise;
      delete monthForUser.grossProfitPaise;
    }
    return {
      scope: canSeeAll ? 'shop' : 'own',
      date: dateKey,
      sales: salesForUser,
      monthToDate: { ...month, ...monthForUser },
      purchases,
      expenses,
      paymentMethods: payments,
      cashierSales: canSeeAll ? cashierSeries({ from: dateKey, to: dateKey }) : [],
      lowStock,
      stockCounts: {
        low: Number(stockCounts?.low_stock || 0),
        out: Number(stockCounts?.out_of_stock || 0),
      },
      topProducts: products.map((product) => {
        if (canSeeProfit) return product;
        return {
          productName: product.productName,
          sku: product.sku,
          variantLabel: product.variantLabel,
          units: product.units,
          grossPaise: product.grossPaise,
          discountPaise: product.discountPaise,
          netSalesPaise: product.netSalesPaise,
        };
      }),
      recentSales: recent,
      sevenDaySeries: series,
      activeOfferCount: Number(offers.count || 0),
      user: { id: user.user.id, name: user.user.name, roleCode: user.user.roleCode },
      canSeeProfit,
      business: publicBusiness(db),
    };
  }

  function salesSummary(input = {}) {
    auth.requirePermission('reports.sales');
    const range = resolveRange(input);
    const user = auth.requireSession();
    const canSeeAll = user.permissions.includes('sales.view.all');
    const ownUserId = canSeeAll ? null : user.user.id;
    const sales = totalsForRange({ ...range, ownUserId });
    const purchases = purchaseTotal(range);
    const expenses = expenseTotal(range);
    const canSeeProfit = user.permissions.includes('reports.profit');
    return {
      ...range,
      scope: canSeeAll ? 'shop' : 'own',
      sales,
      purchases,
      expenses,
      paymentMethods: paymentBreakdown({ ...range, ownUserId }),
      daily: dailySeries({ ...range, ownUserId }),
      cashiers: canSeeAll ? cashierSeries(range) : [],
      topProducts: topProducts({ ...range, limit: 20, ownUserId }).map((product) => {
        if (canSeeProfit) return product;
        // Cost and profit fields are removed at the service boundary, not
        // merely hidden in the renderer.
        return {
          productName: product.productName,
          sku: product.sku,
          variantLabel: product.variantLabel,
          units: product.units,
          grossPaise: product.grossPaise,
          discountPaise: product.discountPaise,
          netSalesPaise: product.netSalesPaise,
        };
      }),
      canSeeProfit,
      definition: {
        grossSales: 'Sum of selling price x quantity before any discount',
        netSales: 'Gross sales minus discounts, excluding tax',
        cogs: 'Quantity x weighted-average cost captured on each sold line',
        grossProfit: 'Net sales minus cost of goods sold',
        netOperatingResult: 'Gross profit minus recorded operating expenses',
        purchases: 'Inventory purchases are reported separately and are not an operating expense',
      },
    };
  }

  function profitLoss(input = {}) {
    const user = auth.requirePermission('reports.profit');
    const range = resolveRange(input);
    const sales = totalsForRange(range);
    const expenses = expenseTotal(range);
    const purchases = purchaseTotal(range);
    const byCategory = db
      .prepare(
        `SELECT c.name, COALESCE(SUM(e.amount_paise), 0) AS total
         FROM expense_categories c LEFT JOIN expenses e ON e.category_id = c.id AND e.status = 'active'
           AND e.business_date BETWEEN ? AND ?
         GROUP BY c.id HAVING total > 0 ORDER BY total DESC`
      )
      .all(range.from, range.to);
    return {
      ...range,
      netSalesPaise: sales.netSalesPaise,
      taxCollectedPaise: sales.taxTotalPaise,
      cogsPaise: sales.cogsPaise,
      grossProfitPaise: sales.grossProfitPaise,
      operatingExpensesPaise: expenses.totalPaise,
      netOperatingResultPaise: sales.grossProfitPaise - expenses.totalPaise,
      discountsPaise: sales.discountTotalPaise,
      roundOffPaise: sales.roundOffPaise,
      invoiceCount: sales.invoiceCount,
      purchasesMemoPaise: purchases.totalPaise,
      expenseBreakdown: byCategory.map((row) => ({ categoryName: row.name, totalPaise: Number(row.total || 0) })),
      canSeeProfit: true,
      user: { id: user.user.id, name: user.user.name },
    };
  }

  function productSales(input = {}) {
    const user = auth.requirePermission('reports.sales');
    const range = resolveRange(input);
    const canSeeAll = user.permissions.includes('sales.view.all');
    const { where, params } = salesWhere({ ownUserId: canSeeAll ? null : user.user.id });
    const rows = db
      .prepare(
        `SELECT si.product_name, v.product_id, si.variant_id, si.sku, si.variant_label,
                SUM(si.quantity) AS units,
                COALESCE(SUM(si.unit_price_paise * si.quantity), 0) AS gross,
                COALESCE(SUM(si.line_discount_paise), 0) AS discount,
                COALESCE(SUM(si.line_total_paise - si.tax_paise), 0) AS net,
                COALESCE(SUM(si.tax_paise), 0) AS tax,
                COALESCE(SUM(si.unit_cost_paise * si.quantity), 0) AS cogs
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE ${where.join(' AND ')} AND s.business_date BETWEEN ? AND ?
         GROUP BY si.variant_id ORDER BY net DESC`
      )
      .all(...params, range.from, range.to);
    const canSeeProfit = user.permissions.includes('reports.profit');
    return {
      ...range,
      canSeeProfit,
      rows: rows.map((row) => ({
        productId: row.product_id,
        variantId: row.variant_id,
        productName: row.product_name,
        sku: row.sku,
        variantLabel: row.variant_label,
        units: Number(row.units || 0),
        grossPaise: Number(row.gross || 0),
        discountPaise: Number(row.discount || 0),
        netSalesPaise: Number(row.net || 0),
        taxPaise: Number(row.tax || 0),
        cogsPaise: canSeeProfit ? Number(row.cogs || 0) : null,
        grossProfitPaise: canSeeProfit ? Number(row.net || 0) - Number(row.cogs || 0) : null,
      })),
    };
  }

  function inventoryReport() {
    auth.requirePermission('inventory.view');
    return {
      summary: db
        .prepare(
          `SELECT COUNT(*) AS variants, COALESCE(SUM(ib.quantity), 0) AS units,
                  COALESCE(SUM(ib.quantity * v.cost_paise), 0) AS cost_value,
                  COALESCE(SUM(ib.quantity * v.price_paise), 0) AS retail_value
           FROM product_variants v JOIN products p ON p.id = v.product_id
           LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
           WHERE p.status = 'active' AND v.status = 'active'`
        )
        .get(),
      valuation: db
        .prepare(
          `SELECT c.name, COALESCE(SUM(ib.quantity), 0) AS units,
                  COALESCE(SUM(ib.quantity * v.cost_paise), 0) AS cost_value,
                  COALESCE(SUM(ib.quantity * v.price_paise), 0) AS retail_value
           FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
           LEFT JOIN product_variants v ON v.product_id = p.id AND v.status = 'active'
           LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
           GROUP BY c.id ORDER BY cost_value DESC`
        )
        .all(),
      lowStock: catalog.lowStock({ limit: 100 }),
      costingMethod: 'weighted_average',
    };
  }

  function gstMonthly(input = {}) {
    auth.requirePermission('reports.profit');
    const month = /^\d{4}-\d{2}$/.test(String(input.month || ''))
      ? String(input.month)
      : businessDate().slice(0, 7);
    const range = monthRange(month);
    const taxEnabled = Boolean(getSetting(db, 'tax').enabled);
    const salesByRate = db
      .prepare(
        `SELECT si.tax_rate_bp, COUNT(DISTINCT si.sale_id) AS invoice_count,
                COALESCE(SUM(si.quantity), 0) AS units,
                COALESCE(SUM(si.line_total_paise - si.tax_paise), 0) AS taxable,
                COALESCE(SUM(si.tax_paise), 0) AS tax,
                COALESCE(SUM(si.line_total_paise), 0) AS gross
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         GROUP BY si.tax_rate_bp ORDER BY si.tax_rate_bp`
      )
      .all(range.from, range.to);
    const hsn = db
      .prepare(
        `SELECT si.hsn_code, si.tax_rate_bp, COALESCE(SUM(si.quantity), 0) AS units,
                COALESCE(SUM(si.line_total_paise - si.tax_paise), 0) AS taxable,
                COALESCE(SUM(si.tax_paise), 0) AS tax
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         GROUP BY si.hsn_code, si.tax_rate_bp ORDER BY si.hsn_code, si.tax_rate_bp`
      )
      .all(range.from, range.to);
    const register = db
      .prepare(
        `SELECT s.invoice_no, s.business_date, s.customer_name, s.customer_phone, s.customer_gstin,
                s.subtotal_paise, s.discount_total_paise, s.tax_paise, s.total_paise,
                s.payment_status, s.payment_method, s.tax_enabled
         FROM sales s
         WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         ORDER BY s.business_date, s.id`
      )
      .all(range.from, range.to);
    const purchases = db
      .prepare(
        `SELECT pi.tax_rate_bp, COALESCE(SUM(pi.tax_paise), 0) AS tax,
                COALESCE(SUM(pi.line_total_paise - pi.tax_paise), 0) AS taxable
         FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
         WHERE pu.status = 'posted' AND pu.business_date BETWEEN ? AND ?
         GROUP BY pi.tax_rate_bp ORDER BY pi.tax_rate_bp`
      )
      .all(range.from, range.to);
    const totals = register.reduce(
      (acc, row) => {
        const taxable = Number(row.subtotal_paise) - Number(row.discount_total_paise);
        acc.invoiceCount += 1;
        acc.taxablePaise += taxable;
        acc.taxPaise += Number(row.tax_paise);
        acc.totalPaise += Number(row.total_paise);
        if (row.customer_gstin) {
          acc.b2bCount += 1;
          acc.b2bTaxablePaise += taxable;
        } else {
          acc.b2cCount += 1;
          acc.b2cTaxablePaise += taxable;
        }
        return acc;
      },
      {
        invoiceCount: 0,
        taxablePaise: 0,
        taxPaise: 0,
        totalPaise: 0,
        b2bCount: 0,
        b2bTaxablePaise: 0,
        b2cCount: 0,
        b2cTaxablePaise: 0,
      }
    );
    totals.cgstPaise = Math.round(totals.taxPaise / 2);
    totals.sgstPaise = totals.taxPaise - totals.cgstPaise;
    totals.igstPaise = 0;
    const warnings = [];
    if (!taxEnabled) warnings.push('Tax is disabled in Settings. This report contains no GST amounts.');
    warnings.push(
      'CGST and SGST are split equally on the assumption that all sales are intra-state. IGST and place of supply are not captured in this version.'
    );
    warnings.push('Customer GSTIN is optional; invoices without it are treated as B2C.');
    warnings.push('This is a local report for CA review. It is not a filed GST return.');
    return {
      month,
      ...range,
      taxEnabled,
      businessStateCode: getSetting(db, 'business').stateCode || '',
      totals,
      byRate: salesByRate.map((row) => ({
        rateBp: row.tax_rate_bp,
        ratePercent: row.tax_rate_bp / 100,
        invoiceCount: Number(row.invoice_count || 0),
        units: Number(row.units || 0),
        taxablePaise: Number(row.taxable || 0),
        taxPaise: Number(row.tax || 0),
        grossPaise: Number(row.gross || 0),
      })),
      hsn: hsn.map((row) => ({
        hsnCode: row.hsn_code || '',
        rateBp: row.tax_rate_bp,
        ratePercent: row.tax_rate_bp / 100,
        units: Number(row.units || 0),
        taxablePaise: Number(row.taxable || 0),
        taxPaise: Number(row.tax || 0),
      })),
      register: register.map((row) => ({
        invoiceNo: row.invoice_no,
        businessDate: row.business_date,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerGstin: row.customer_gstin || '',
        taxablePaise: Number(row.subtotal_paise) - Number(row.discount_total_paise),
        taxPaise: Number(row.tax_paise),
        totalPaise: Number(row.total_paise),
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method,
        taxEnabled: Boolean(row.tax_enabled),
      })),
      purchases: purchases.map((row) => ({
        rateBp: row.tax_rate_bp,
        ratePercent: row.tax_rate_bp / 100,
        taxablePaise: Number(row.taxable || 0),
        taxPaise: Number(row.tax || 0),
      })),
      warnings,
    };
  }

  function taxSummary(input = {}) {
    auth.requirePermission('reports.profit');
    const range = resolveRange(input);
    const sales = db
      .prepare(
        `SELECT si.tax_rate_bp, COUNT(DISTINCT si.sale_id) AS invoice_count,
                COALESCE(SUM(si.quantity), 0) AS units,
                COALESCE(SUM(si.line_total_paise - si.tax_paise), 0) AS taxable,
                COALESCE(SUM(si.tax_paise), 0) AS tax,
                COALESCE(SUM(si.line_total_paise), 0) AS gross
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         GROUP BY si.tax_rate_bp ORDER BY si.tax_rate_bp`
      )
      .all(range.from, range.to);
    const purchases = db
      .prepare(
        `SELECT pi.tax_rate_bp, COALESCE(SUM(pi.tax_paise), 0) AS tax,
                COALESCE(SUM(pi.line_total_paise - pi.tax_paise), 0) AS taxable
         FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
         WHERE pu.status = 'posted' AND pu.business_date BETWEEN ? AND ?
         GROUP BY pi.tax_rate_bp ORDER BY pi.tax_rate_bp`
      )
      .all(range.from, range.to);
    return {
      ...range,
      taxEnabled: Boolean(getSetting(db, 'tax').enabled),
      sales: sales.map((row) => ({
        rateBp: row.tax_rate_bp,
        ratePercent: row.tax_rate_bp / 100,
        invoiceCount: Number(row.invoice_count || 0),
        units: Number(row.units || 0),
        taxablePaise: Number(row.taxable || 0),
        taxPaise: Number(row.tax || 0),
        grossPaise: Number(row.gross || 0),
      })),
      purchases: purchases.map((row) => ({
        rateBp: row.tax_rate_bp,
        ratePercent: row.tax_rate_bp / 100,
        taxablePaise: Number(row.taxable || 0),
        taxPaise: Number(row.tax || 0),
      })),
      warning: getSetting(db, 'tax').enabled
        ? 'Tax data is based on the rates configured on each product. Have the client CA validate the export format and treatment before statutory use.'
        : 'Tax is disabled in settings. Amounts are shown as zero. Do not treat these records as GST returns.',
    };
  }

  function purchaseReport(input = {}) {
    auth.requirePermission('purchases.view');
    const range = resolveRange(input);
    const rows = db
      .prepare(
        `SELECT pu.*, s.name AS supplier_name, u.name AS created_by_name
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id JOIN users u ON u.id = pu.created_by
         WHERE pu.business_date BETWEEN ? AND ? ORDER BY pu.id DESC`
      )
      .all(range.from, range.to)
      .map((row) => ({
        id: row.id,
        reference: row.reference,
        supplierName: row.supplier_name,
        supplierInvoiceRef: row.supplier_invoice_ref,
        purchaseDate: row.purchase_date,
        subtotalPaise: row.subtotal_paise,
        discountPaise: row.discount_paise,
        additionalCostPaise: row.additional_cost_paise,
        taxPaise: row.tax_paise,
        totalPaise: row.total_paise,
        amountPaidPaise: row.amount_paid_paise,
        balancePaise: row.balance_paise,
        paymentStatus: row.payment_status,
        status: row.status,
        createdByName: row.created_by_name,
      }));
    const total = rows.filter((row) => row.status === 'posted').reduce((sum, row) => sum + row.totalPaise, 0);
    return { ...range, rows, totalPaise: total };
  }

  function expenseReport(input = {}) {
    auth.requirePermission('expenses.view');
    const range = resolveRange(input);
    const rows = db
      .prepare(
        `SELECT e.*, c.name AS category_name, u.name AS created_by_name
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id JOIN users u ON u.id = e.created_by
         WHERE e.status = 'active' AND e.business_date BETWEEN ? AND ? ORDER BY e.id DESC`
      )
      .all(range.from, range.to)
      .map((row) => ({
        id: row.id,
        expenseDate: row.expense_date,
        categoryName: row.category_name,
        amountPaise: row.amount_paise,
        paymentMethod: row.payment_method,
        description: row.description,
        reference: row.reference,
        vendor: row.vendor,
        createdByName: row.created_by_name,
      }));
    return { ...range, rows, totalPaise: rows.reduce((sum, row) => sum + row.amountPaise, 0) };
  }

  function salesRegister(input = {}) {
    auth.requirePermission('reports.export');
    const range = resolveRange(input);
    const rows = db
      .prepare(
        `SELECT s.*, u.name AS cashier_name,
                (SELECT COALESCE(SUM(si.tax_paise), 0) FROM sale_items si WHERE si.sale_id = s.id) AS sale_tax
         FROM sales s JOIN users u ON u.id = s.cashier_id
         WHERE s.business_date BETWEEN ? AND ? ORDER BY s.id`
      )
      .all(range.from, range.to);
    return {
      ...range,
      rows: rows.map((row) => ({
        invoiceNo: row.invoice_no,
        businessDate: row.business_date,
        completedAt: row.completed_at,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        cashierName: row.cashier_name,
        status: row.status,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        grossSalesPaise: row.subtotal_paise,
        discountPaise: row.discount_total_paise,
        taxableValuePaise:
          row.subtotal_paise -
          row.discount_total_paise -
          (row.prices_include_tax ? row.tax_paise : 0),
        taxPaise: row.tax_paise,
        roundOffPaise: row.round_off_paise,
        invoiceTotalPaise: row.total_paise,
        amountPaidPaise: row.amount_paid_paise,
        balancePaise: Math.max(0, row.total_paise - row.amount_paid_paise),
      })),
    };
  }

  function accountingPack(month) {
    auth.requirePermission('reports.export');
    const range = monthRange(month);
    return {
      month,
      ...range,
      business: publicBusiness(db),
      salesRegister: salesRegister(range),
      purchaseRegister: purchaseReport(range),
      expenses: expenseReport(range),
      taxSummary: taxSummary(range),
      generatedAt: new Date().toISOString(),
      notes: [
        'This pack is prepared from local Modern Fashion POS records for the client CA.',
        'It is not a filed GST return and does not claim statutory compliance.',
        'Tax figures are valid only if tax rates and registrations have been verified in Settings.',
        'Purchases of inventory are not operating expenses; both are reported separately.',
      ],
    };
  }

  return {
    dashboard,
    salesSummary,
    profitLoss,
    productSales,
    inventoryReport,
    taxSummary,
    gstMonthly,
    purchaseReport,
    expenseReport,
    salesRegister,
    accountingPack,
  };
}
