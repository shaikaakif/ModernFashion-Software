import { fail, AppError } from '../core/errors.js';
import {
  businessDate,
  currentFinancialYear,
  optionalPhone,
  optionalText,
  requireDateKey,
  requireInt,
  requireMoneyPaise,
  requirePositiveInt,
  requireText,
  nowIso,
} from '../core/validation.js';
import { writeAudit } from '../core/audit.js';
import { recordStockMovement } from '../core/inventory.js';
import { transaction } from '../core/database.js';
import { allocateSequence, formatInvoiceNumber, peekSequence } from '../core/sequences.js';
import { getSetting, publicBusiness } from '../core/settings.js';
import { computeCartTotals, pickBestOffer, roundHalfUp } from '../../shared/money.js';

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'credit'];

function normalizeGstin(value) {
  const text = optionalText(value, { max: 15 }).toUpperCase();
  if (text && !/^[0-9A-Z]{15}$/.test(text)) fail('GSTIN must be exactly 15 letters and digits.');
  return text;
}

export function createSaleService({ db, auth }) {
  function activeOffers(businessDateKey) {
    return db
      .prepare(
        `SELECT * FROM offers
         WHERE status = 'active'
           AND (starts_on IS NULL OR starts_on <= ?)
           AND (ends_on IS NULL OR ends_on >= ?)
         ORDER BY priority, id`
      )
      .all(businessDateKey, businessDateKey)
      .map((row) => ({
        id: row.id,
        name: row.name,
        discountType: row.discount_type,
        value: row.value,
        minBillPaise: row.min_bill_paise,
        maxDiscountPaise: row.max_discount_paise,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        priority: row.priority,
        status: row.status,
      }));
  }

  function previewInvoiceNumber() {
    auth.requirePermission('pos.use');
    const invoice = getSetting(db, 'invoice');
    const fy = currentFinancialYear();
    return formatInvoiceNumber(invoice.prefix || 'MF', fy, peekSequence(db, 'sale', fy));
  }

  function bootstrap() {
    const user = auth.requirePermission('pos.use');
    const pos = getSetting(db, 'pos');
    const dateKey = businessDate();
    return {
      business: publicBusiness(db),
      settings: {
        pos,
        tax: getSetting(db, 'tax'),
        receipt: getSetting(db, 'receipt'),
        invoice: getSetting(db, 'invoice'),
        hardware: getSetting(db, 'hardware'),
      },
      offers: activeOffers(dateKey),
      nextInvoiceNumber: previewInvoiceNumber(),
      cashier: { id: user.user.id, name: user.user.name, roleCode: user.user.roleCode },
      businessDate: dateKey,
      canDiscount: user.permissions.includes('sales.discount'),
      canOverrideDiscount: user.permissions.includes('sales.discount.override'),
    };
  }

  function validateAndPriceItems(items) {
    if (!Array.isArray(items) || !items.length) fail('Add at least one product to the bill.');
    if (items.length > 200) fail('A bill cannot contain more than 200 lines.');
    const seen = new Set();
    return items.map((item, index) => {
      const variantId = requireInt(item.variantId, `Item ${index + 1}`, { min: 1 });
      if (seen.has(variantId)) fail('The same product variant cannot appear twice. Increase its quantity instead.');
      seen.add(variantId);
      const quantity = requirePositiveInt(item.quantity, `Quantity for item ${index + 1}`);
      const variant = db
        .prepare(
          `SELECT v.*, p.name AS product_name, p.status AS product_status, p.tax_rate_bp, p.hsn_code,
                  c.name AS category_name, COALESCE(ib.quantity, 0) AS stock
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           JOIN categories c ON c.id = p.category_id
           LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
           WHERE v.id = ?`
        )
        .get(variantId);
      if (!variant) fail(`Item ${index + 1} could not be found.`);
      if (variant.product_status !== 'active' || variant.status !== 'active') {
        fail(`${variant.product_name} is inactive and cannot be sold.`);
      }
      const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
      const discountPaise = Math.max(0, Math.trunc(Number(item.discountPaise) || 0));
      return { variant, quantity, discountPercent, discountPaise };
    });
  }

  function computeSale({ items, offer, manualDiscountPaise, user, dateKey }) {
    const tax = getSetting(db, 'tax');
    const taxEnabled = Boolean(tax.enabled);
    const pricedLines = items.map(({ variant, quantity, discountPercent, discountPaise }) => {
      const unitPricePaise = variant.price_paise;
      const gross = quantity * unitPricePaise;
      // One resolved absolute discount per line: a fixed amount wins over a
      // percentage, and neither can take the line below zero.
      const requested = discountPaise > 0 ? discountPaise : roundHalfUp((gross * discountPercent) / 100);
      return {
        variant,
        quantity,
        unitPricePaise,
        taxRateBp: taxEnabled ? variant.tax_rate_bp : 0,
        lineDiscountPaise: Math.min(gross, Math.max(0, requested)),
      };
    });
    const subtotalPaise = pricedLines.reduce((sum, line) => sum + line.quantity * line.unitPricePaise, 0);
    const offerResult = pickBestOffer(offer, subtotalPaise, dateKey);
    const autoDiscountPaise = offerResult ? offerResult.discountPaise : 0;
    const manualAllowed = user.permissions.includes('sales.discount');
    const settings = getSetting(db, 'pos');
    const limitPercent = Number(settings.manualDiscountMaxPercent || 0);
    const override = user.permissions.includes('sales.discount.override');
    const manual = Math.max(0, Number(manualDiscountPaise) || 0);
    const lineDiscountTotal = pricedLines.reduce((sum, line) => sum + line.lineDiscountPaise, 0);
    if ((manual > 0 || lineDiscountTotal > 0) && !manualAllowed) {
      throw new AppError('Your account is not allowed to apply manual discounts.', 'FORBIDDEN');
    }
    if ((manual > 0 || lineDiscountTotal > 0) && !override) {
      const maxPaise = Math.floor((subtotalPaise * limitPercent) / 100);
      if (lineDiscountTotal + manual > maxPaise) {
        fail(`Discount exceeds the permitted ${limitPercent}% limit (maximum ₹${(maxPaise / 100).toFixed(2)}).`, 'DISCOUNT_LIMIT');
      }
    }
    if (manual + lineDiscountTotal > subtotalPaise) fail('Discount cannot exceed the bill subtotal.');
    const useManual = manual > autoDiscountPaise;
    const appliedDiscount = useManual ? manual : autoDiscountPaise;
    const totals = computeCartTotals(
      pricedLines.map((line) => ({
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        taxRateBp: line.taxRateBp,
        lineDiscountPaise: line.lineDiscountPaise,
      })),
      { billDiscountPaise: appliedDiscount, roundToRupee: true, pricesIncludeTax: taxEnabled && Boolean(tax.pricesIncludeTax) }
    );
    return {
      taxEnabled,
      totals,
      pricedLines,
      appliedOffer: useManual ? null : offerResult,
      manualDiscountApplied: useManual ? manual : 0,
      offerDiscountApplied: useManual ? 0 : autoDiscountPaise,
      subtotalPaise,
    };
  }

  function complete(input) {
    const user = auth.requirePermission('pos.use');
    const idempotencyKey = requireText(input.idempotencyKey, 'Checkout key', { max: 100, min: 8 });
    const existing = db.prepare('SELECT * FROM sales WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing) {
      if (existing.cashier_id !== user.user.id) fail('This checkout key belongs to a different session.', 'DUPLICATE_SALE');
      return { sale: getSale(existing.id), duplicate: true };
    }

    const dateKey = businessDate();
    const items = validateAndPriceItems(input.items);
    const offer = activeOffers(dateKey);
    const manualDiscountPaise = requireMoneyPaise(input.billDiscountPaise ?? 0, 'Discount');
    const computed = computeSale({ items, offer, manualDiscountPaise, user, dateKey });
    const totals = computed.totals;
    const method = String(input.paymentMethod || getSetting(db, 'pos').defaultPaymentMethod || 'cash');
    if (!PAYMENT_METHODS.includes(method)) fail('Choose a valid payment method.');
    let amountPaidPaise;
    if (input.amountPaidPaise === undefined || input.amountPaidPaise === null || input.amountPaidPaise === '') {
      amountPaidPaise = method === 'credit' ? 0 : totals.totalPaise;
    } else {
      amountPaidPaise = requireMoneyPaise(input.amountPaidPaise, 'Amount received');
    }
    if (method === 'cash' && amountPaidPaise > 0 && amountPaidPaise < totals.totalPaise) {
      // Partial cash payments are allowed only when explicitly marked as a
      // credit/partial sale. Keep the behaviour predictable for the cashier.
      if (method !== 'credit' && !input.allowPartial) {
        fail('Amount received is less than the payable total. Choose Credit/Partial sale or collect the full amount.');
      }
    }
    const changePaise = Math.max(0, amountPaidPaise - totals.totalPaise);
    const paymentStatus =
      amountPaidPaise >= totals.totalPaise && totals.totalPaise > 0
        ? 'paid'
        : amountPaidPaise > 0
          ? 'partial'
          : 'unpaid';

    let customer = null;
    if (input.customerId) {
      customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(requireInt(input.customerId, 'Customer', { min: 1 }));
      if (!customer) fail('Selected customer could not be found.');
    } else {
      const walkInName = optionalText(input.customerName, { max: 120 }) || 'Walk-in customer';
      const walkInPhone = optionalPhone(input.customerPhone);
      if (walkInPhone && db.prepare('SELECT id FROM customers WHERE phone = ?').get(walkInPhone)) {
        fail('A customer with this phone already exists. Select the saved customer instead.');
      }
      customer = { id: null, name: walkInName, phone: walkInPhone };
    }
    if (!customer.phone) fail('Customer mobile number is required for every invoice.', 'CUSTOMER_PHONE_REQUIRED');
    const customerGstin = normalizeGstin(input.customerGstin);
    const notes = optionalText(input.notes, { max: 1000 });

    return transaction(db, () => {
      const now = nowIso();
      const invoice = getSetting(db, 'invoice');
      const fy = currentFinancialYear();
      const invoiceNo = formatInvoiceNumber(invoice.prefix || 'MF', fy, allocateSequence(db, 'sale', fy));
      const inserted = db
        .prepare(
          `INSERT INTO sales (invoice_no, idempotency_key, customer_id, customer_name, customer_phone, customer_gstin, sale_date,
             business_date, subtotal_paise, line_discount_paise, bill_discount_paise, discount_total_paise, tax_paise,
             round_off_paise, total_paise, amount_paid_paise, change_paise, payment_status, payment_method,
             cashier_id, shift_id, status, notes, offer_id, offer_name, tax_enabled, tax_rate_bp, prices_include_tax,
             created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          invoiceNo,
          idempotencyKey,
          customer.id,
          customer.name,
          customer.phone || '',
          customerGstin,
          now,
          dateKey,
          totals.subtotalPaise,
          totals.lineDiscountPaise,
          totals.billDiscountPaise,
          totals.discountTotalPaise,
          totals.taxPaise,
          totals.roundOffPaise,
          totals.totalPaise,
          amountPaidPaise,
          changePaise,
          paymentStatus,
          method,
          user.user.id,
          user.shiftId || null,
          notes,
          computed.appliedOffer ? computed.appliedOffer.offer.id : null,
          computed.appliedOffer ? computed.appliedOffer.reason : computed.manualDiscountApplied > 0 ? 'Manual discount' : '',
          computed.taxEnabled ? 1 : 0,
          getSetting(db, 'tax').defaultRateBp || 0,
          computed.taxEnabled && Boolean(getSetting(db, 'tax').pricesIncludeTax) ? 1 : 0,
          now,
          now
        );
      const saleId = Number(inserted.lastInsertRowid);

      computed.totals.lines.forEach((line, index) => {
        const source = computed.pricedLines[index];
        const variant = source.variant;
        const discount = line.discountPaise;
        db.prepare(
          `INSERT INTO sale_items (sale_id, variant_id, product_name, variant_label, sku, barcode, quantity,
             unit_price_paise, mrp_paise, unit_cost_paise, line_discount_paise, tax_rate_bp, tax_paise, hsn_code, line_total_paise)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          saleId,
          variant.id,
          variant.product_name,
          `${variant.color} / ${variant.size}`,
          variant.sku,
          variant.barcode,
          source.quantity,
          source.unitPricePaise,
          variant.mrp_paise,
          variant.cost_paise,
          discount,
          source.taxRateBp,
          line.taxPaise,
          variant.hsn_code || '',
          line.totalPaise
        );
        recordStockMovement(db, {
          variantId: variant.id,
          productId: variant.product_id,
          quantityChange: -source.quantity,
          movementType: 'sale',
          unitCostPaise: variant.cost_paise,
          referenceType: 'sale',
          referenceId: saleId,
          referenceNo: invoiceNo,
          reason: 'Sold',
          note: customer.name,
          userId: user.user.id,
          createdAt: now,
        });
      });

      if (amountPaidPaise > 0) {
        db.prepare(
          'INSERT INTO payments (sale_id, method, amount_paise, reference, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(saleId, method, amountPaidPaise, optionalText(input.paymentReference, { max: 120 }), now);
      }

      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'sale.completed',
        entityType: 'sale',
        entityId: saleId,
        details: {
          invoiceNo,
          totalPaise: totals.totalPaise,
          discountPaise: totals.discountTotalPaise,
          offer: computed.appliedOffer ? computed.appliedOffer.offer.name : null,
          manualDiscountPaise: computed.manualDiscountApplied,
          paymentMethod: method,
          paymentStatus,
          units: totals.totalQuantity,
        },
      });
      return { sale: getSale(saleId), duplicate: false };
    });
  }

  function canView(row, user) {
    if (user.permissions.includes('sales.view.all')) return true;
    return user.permissions.includes('sales.view.own') && row.cashier_id === user.user.id;
  }

  function mapSale(row, { includeCosts = false } = {}) {
    const sale = {
      id: row.id,
      invoiceNo: row.invoice_no,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerGstin: row.customer_gstin || '',
      saleDate: row.sale_date,
      businessDate: row.business_date,
      subtotalPaise: row.subtotal_paise,
      lineDiscountPaise: row.line_discount_paise,
      billDiscountPaise: row.bill_discount_paise,
      discountTotalPaise: row.discount_total_paise,
      taxPaise: row.tax_paise,
      roundOffPaise: row.round_off_paise,
      totalPaise: row.total_paise,
      amountPaidPaise: row.amount_paid_paise,
      changePaise: row.change_paise,
      balancePaise: Math.max(0, row.total_paise - row.amount_paid_paise),
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      cashierId: row.cashier_id,
      cashierName: row.cashier_name,
      shiftId: row.shift_id,
      status: row.status,
      notes: row.notes,
      offerName: row.offer_name,
      taxEnabled: Boolean(row.tax_enabled),
      taxRateBp: row.tax_rate_bp,
      pricesIncludeTax: Boolean(row.prices_include_tax),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
      printCount: row.print_count,
      lastPrintedAt: row.last_printed_at,
      pdfPath: row.pdf_path,
    };
    if (includeCosts) {
      sale.grossProfitPaise =
        row.status === 'completed'
          ? Number(row.subtotal_paise) - Number(row.discount_total_paise) - Number(row.cogs_paise || 0)
          : 0;
      sale.cogsPaise = Number(row.cogs_paise || 0);
    }
    return sale;
  }

  function getSale(id, { internal = false } = {}) {
    const user = internal ? null : auth.requireSession();
    const saleId = requireInt(id, 'Invoice', { min: 1 });
    const row = db
      .prepare(
        `SELECT s.*, u.name AS cashier_name,
                (SELECT COALESCE(SUM(si.unit_cost_paise * si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS cogs_paise
         FROM sales s JOIN users u ON u.id = s.cashier_id WHERE s.id = ?`
      )
      .get(saleId);
    if (!row) fail('Invoice not found.');
    if (!internal && !canView(row, user)) throw new AppError('You do not have permission to view this invoice.', 'FORBIDDEN');
    const includeCosts = Boolean(user?.permissions.includes('reports.profit'));
    const items = db
      .prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id')
      .all(saleId)
      .map((item) => {
        const mapped = {
          id: item.id,
          variantId: item.variant_id,
          productName: item.product_name,
          variantLabel: item.variant_label,
          sku: item.sku,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPricePaise: item.unit_price_paise,
          mrpPaise: item.mrp_paise,
          discountPaise: item.line_discount_paise,
          hsnCode: item.hsn_code || '',
          taxRateBp: item.tax_rate_bp,
          taxPaise: item.tax_paise,
          lineTotalPaise: item.line_total_paise,
        };
        if (includeCosts) {
          mapped.unitCostPaise = item.unit_cost_paise;
          mapped.grossProfitPaise = item.unit_price_paise * item.quantity - item.line_discount_paise - item.unit_cost_paise * item.quantity;
        }
        return mapped;
      });
    const payments = db
      .prepare('SELECT * FROM payments WHERE sale_id = ? ORDER BY id')
      .all(saleId)
      .map((payment) => ({
        id: payment.id,
        method: payment.method,
        amountPaise: payment.amount_paise,
        reference: payment.reference,
        createdAt: payment.created_at,
      }));
    const sale = mapSale(row, { includeCosts });
    if (!internal) {
      sale.items = items;
      sale.payments = payments;
      sale.business = publicBusiness(db);
      sale.settings = {
        invoice: getSetting(db, 'invoice'),
        receipt: getSetting(db, 'receipt'),
        tax: getSetting(db, 'tax'),
      };
    } else {
      sale.items = items;
      sale.payments = payments;
    }
    return sale;
  }

  function list({ from = null, to = null, cashierId = null, status = null, query = '', paymentMethod = null, limit = 500 } = {}) {
    const user = auth.requireSession();
    if (!user.permissions.includes('sales.view.all') && !user.permissions.includes('sales.view.own')) {
      throw new AppError('You do not have permission to view invoices.', 'FORBIDDEN');
    }
    const where = [];
    const params = [];
    if (!user.permissions.includes('sales.view.all')) {
      where.push('s.cashier_id = ?');
      params.push(user.user.id);
    } else if (cashierId) {
      where.push('s.cashier_id = ?');
      params.push(Number(cashierId));
    }
    if (from) {
      where.push('s.business_date >= ?');
      params.push(requireDateKey(from, 'From date'));
    }
    if (to) {
      where.push('s.business_date <= ?');
      params.push(requireDateKey(to, 'To date'));
    }
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (paymentMethod) {
      where.push('s.payment_method = ?');
      params.push(paymentMethod);
    }
    if (query) {
      where.push('(s.invoice_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ?)');
      const like = `%${String(query).trim()}%`;
      params.push(like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT s.*, u.name AS cashier_name,
                (SELECT COALESCE(SUM(si.unit_cost_paise * si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS cogs_paise
         FROM sales s JOIN users u ON u.id = s.cashier_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY s.id DESC LIMIT ?`
      )
      .all(...params, Math.min(Number(limit) || 500, 2000));
    const includeCosts = user.permissions.includes('reports.profit');
    return rows.map((row) => mapSale(row, { includeCosts }));
  }

  function voidSale(id, input) {
    const user = auth.requirePermission('sales.void');
    const saleId = requireInt(id, 'Invoice', { min: 1 });
    const reason = requireText(input.reason, 'Void reason', { max: 300 });
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!sale) fail('Invoice not found.');
    if (sale.status !== 'completed') fail('Only a completed invoice can be voided.');
    return transaction(db, () => {
      const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
      const now = nowIso();
      items.forEach((item) => {
        recordStockMovement(db, {
          variantId: item.variant_id,
          productId: db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(item.variant_id).product_id,
          quantityChange: item.quantity,
          movementType: 'sale_return',
          unitCostPaise: item.unit_cost_paise,
          referenceType: 'sale_void',
          referenceId: saleId,
          referenceNo: sale.invoice_no,
          reason: 'Invoice voided',
          note: reason,
          userId: user.user.id,
          createdAt: now,
        });
      });
      db.prepare(
        `UPDATE sales SET status = 'void', voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?`
      ).run(now, user.user.id, reason, saleId);
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'sale.voided',
        entityType: 'sale',
        entityId: saleId,
        details: { invoiceNo: sale.invoice_no, totalPaise: sale.total_paise, reason },
      });
      return getSale(saleId);
    });
  }

  function markPrinted(id, { duplicate = false } = {}) {
    const user = auth.requirePermission('sales.print');
    const saleId = requireInt(id, 'Invoice', { min: 1 });
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!sale) fail('Invoice not found.');
    if (!canView(sale, user)) throw new AppError('You do not have permission to print this invoice.', 'FORBIDDEN');
    const now = nowIso();
    db.prepare('UPDATE sales SET print_count = print_count + 1, last_printed_at = ? WHERE id = ?').run(now, saleId);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: duplicate ? 'sale.reprinted' : 'sale.printed',
      entityType: 'sale',
      entityId: saleId,
      details: { invoiceNo: sale.invoice_no, printCount: sale.print_count + 1 },
    });
    return { printCount: sale.print_count + 1, printedAt: now };
  }

  function setPdfPath(id, pdfPath) {
    db.prepare('UPDATE sales SET pdf_path = ? WHERE id = ?').run(String(pdfPath || ''), Number(id));
  }

  function receiptData(id) {
    const sale = getSale(id);
    const business = publicBusiness(db);
    const invoice = getSetting(db, 'invoice');
    const receipt = getSetting(db, 'receipt');
    const tax = getSetting(db, 'tax');
    return { sale, business, invoice, receipt, tax, generatedAt: nowIso() };
  }

  return {
    bootstrap,
    previewInvoiceNumber,
    complete,
    getSale,
    list,
    voidSale,
    markPrinted,
    setPdfPath,
    receiptData,
    activeOffers,
  };
}
