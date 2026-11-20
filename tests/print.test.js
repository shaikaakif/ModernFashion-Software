import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addStaff, completeSale, createProduct, createTestApp, login, setupOwner } from './helpers.js';
import { barcodeExample, formatBarcode, generatedBarcode, isValidEan13, isValidEan8, isValidUpcA, normalizeBarcodeConfig, symbologyForBarcode } from '../shared/barcode.js';
import { readLogoDataUrl } from '../electron/core/logo.js';
import { receiptHtml, invoiceHtml, labelHtml } from '../electron/hardware/documents.js';

function sampleSale() {
  return {
    invoiceNo: 'MF-TEST-0001',
    completedAt: '2026-11-17T10:30:00.000Z',
    cashierName: 'Owner One',
    customerName: 'Test Customer',
    customerPhone: '9000000000',
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    pricesIncludeTax: false,
    items: [
      {
        productName: 'Cotton Kurti',
        variantLabel: 'Blue / M',
        sku: 'KUR-0001-BLU-M',
        quantity: 1,
        unitPricePaise: 100000,
        discountPaise: 10000,
        lineTotalPaise: 90000,
        taxPaise: 0,
        taxRateBp: 0,
      },
    ],
    subtotalPaise: 100000,
    discountTotalPaise: 10000,
    taxPaise: 0,
    roundOffPaise: 0,
    totalPaise: 90000,
    amountPaidPaise: 100000,
    balancePaise: 0,
    changePaise: 10000,
  };
}

test('barcode format validates EAN-13, UPC-A and legacy Code 128 values', () => {
  assert.deepEqual(normalizeBarcodeConfig({ symbology: 'code128', prefix: ' mf ', digits: 10 }), {
    symbology: 'code128',
    prefix: 'MF',
    digits: 10,
    eanPrefix: '20',
  });
  assert.equal(formatBarcode('MF', 10, 42), 'MF0000000042');
  assert.equal(barcodeExample({ symbology: 'code128', prefix: 'SHOP', digits: 8 }), 'SHOP00123456');
  assert.throws(() => normalizeBarcodeConfig({ prefix: 'M', digits: 10 }), /2 to 6/);
  assert.throws(() => normalizeBarcodeConfig({ prefix: 'MF', digits: 5 }), /6 and 12/);
  assert.throws(() => normalizeBarcodeConfig({ prefix: 'M-F', digits: 10 }), /2 to 6/);
  assert.throws(() => normalizeBarcodeConfig({ eanPrefix: '12' }), /20 to 29/);

  assert.equal(isValidEan13('4006381333931'), true);
  assert.equal(isValidEan13('4006381333930'), false);
  assert.equal(isValidUpcA('036000291452'), true);
  assert.equal(symbologyForBarcode('4006381333931'), 'ean13');
  assert.equal(symbologyForBarcode('036000291452'), 'upca');
  assert.equal(symbologyForBarcode('MF0000000042'), 'code128');

  const ean = generatedBarcode({ symbology: 'ean13', eanPrefix: '21' }, 42);
  assert.match(ean, /^21\d{11}$/);
  assert.equal(isValidEan13(ean), true);
  const upc = generatedBarcode({ symbology: 'upca', eanPrefix: '20' }, 42);
  assert.match(upc, /^20\d{10}$/);
  assert.equal(isValidUpcA(upc), true);

  assert.equal(isValidEan8('20000011'), true);
  assert.equal(isValidEan8('20000012'), false);
  assert.equal(symbologyForBarcode('20000011'), 'ean8');
  const ean8 = generatedBarcode({ symbology: 'ean8', eanPrefix: '20' }, 42);
  assert.match(ean8, /^20\d{6}$/);
  assert.equal(isValidEan8(ean8), true);
});

test('logo reader returns a data URL only for supported, small local images', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-logo-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const png = path.join(directory, 'logo.png');
  fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.match(readLogoDataUrl(png), /^data:image\/png;base64,/);

  assert.equal(readLogoDataUrl(path.join(directory, 'missing.png')), '');
  assert.equal(readLogoDataUrl(''), '');

  const text = path.join(directory, 'logo.txt');
  fs.writeFileSync(text, 'not an image');
  assert.equal(readLogoDataUrl(text), '');

  const big = path.join(directory, 'big.png');
  fs.writeFileSync(big, Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.equal(readLogoDataUrl(big), '');
});

test('owner print settings persist, preview without saving and drive new barcodes', (t) => {
  const app = createTestApp(t);
  setupOwner(app);

  const saved = app.services.settings.updatePrint({
    receiptWidthMm: 58,
    logoHeightMm: 20,
    showLogo: true,
    showTitle: false,
    showAddress: true,
    showPhone: false,
    showState: true,
    showGstin: true,
    headerNote: 'Fresh stock arrives every Friday.',
    footerNote: 'Exchange within 7 days with this bill.',
    fontScale: 112,
    showPayment: false,
    showAmountReceived: false,
    showPoweredBy: false,
    showTax: true,
    barcodeSymbology: 'code128',
    barcodePrefix: 'ab',
    barcodeDigits: 8,
    terms: 'Goods once sold are exchanged only with a valid bill.',
  });

  assert.equal(saved.invoice.paperWidthMm, 58);
  assert.equal(saved.hardware.receiptWidthMm, 58);
  assert.equal(saved.invoice.logoHeightMm, 20);
  assert.equal(saved.invoice.showTitle, false);
  assert.equal(saved.receipt.fontScale, 112);
  assert.equal(saved.receipt.headerNote, 'Fresh stock arrives every Friday.');
  assert.equal(saved.receipt.showTax, true);
  assert.equal(saved.barcode.prefix, 'AB');
  assert.equal(saved.barcode.digits, 8);
  assert.equal(saved.barcode.symbology, 'code128');

  const preview = app.services.settings.previewPrint({
    barcodeSymbology: 'code128',
    barcodePrefix: 'ZZ',
    barcodeDigits: 9,
    fontScale: 95,
    headerNote: 'Unsaved preview header',
  });
  assert.equal(preview.barcode.prefix, 'ZZ');
  assert.equal(preview.barcode.digits, 9);
  assert.equal(preview.barcode.symbology, 'code128');
  assert.equal(preview.receipt.fontScale, 95);
  assert.equal(preview.receipt.headerNote, 'Unsaved preview header');
  assert.equal(app.services.settings.getPublic().barcode.prefix, 'AB');

  const product = createProduct(app, { variants: [{ color: 'Black', size: 'M', openingStock: 1 }] });
  const variant = app.services.catalog.getProduct(product.id).variants[0];
  assert.match(variant.barcode, /^AB\d{8}$/);

  app.services.settings.updatePrint({ barcodeSymbology: 'code128', barcodePrefix: 'CD', barcodeDigits: 10, receiptWidthMm: 80 });
  assert.equal(app.services.settings.getSnapshot().hardware.receiptWidthMm, 77, '80 mm is migrated to the 77 mm roll');
  const existing = app.services.catalog.getProduct(product.id).variants[0];
  assert.equal(existing.barcode, variant.barcode, 'Existing barcode values must never be rewritten.');

  const second = createProduct(app, {
    name: 'Second Product',
    variants: [{ color: 'White', size: 'L', openingStock: 1 }],
  });
  assert.match(app.services.catalog.getProduct(second.id).variants[0].barcode, /^CD\d{10}$/);

  app.services.settings.updatePrint({ barcodeSymbology: 'ean13', barcodeEanPrefix: '21', receiptWidthMm: 80 });
  const third = createProduct(app, {
    name: 'Third Product',
    variants: [{ color: 'Blue', size: 'S', openingStock: 1 }],
  });
  const thirdBarcode = app.services.catalog.getProduct(third.id).variants[0].barcode;
  assert.match(thirdBarcode, /^21\d{11}$/);
  assert.equal(isValidEan13(thirdBarcode), true);

  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  login(app, '9000000002');
  assert.throws(
    () => app.services.settings.updatePrint({ barcodePrefix: 'XX', barcodeDigits: 10 }),
    { code: 'FORBIDDEN' }
  );
  assert.throws(() => app.services.settings.previewPrint({}), { code: 'FORBIDDEN' });
});

test('receipt HTML honors logo, section, text and font settings', () => {
  const html = receiptHtml({
    sale: sampleSale(),
    business: {
      name: 'MODERN FASHION',
      addressLines: ['13-431/C/48', 'ATTAPUR'],
      stateCode: '36',
      stateName: 'Telangana',
      phone: '7093230999',
    },
    invoice: {
      showLogo: false,
      showTitle: false,
      showAddress: false,
      showPhone: false,
      showState: false,
      showGstin: false,
      logoHeightMm: 18,
      terms: 'Exchange within 7 days with a valid bill.',
      thankYou: 'Visit again',
      duplicateLabel: 'DUPLICATE COPY',
    },
    receipt: {
      headerNote: 'HEADER-NOTE',
      footerNote: 'FOOTER-NOTE',
      fontScale: 120,
      showCustomer: false,
      showCashier: false,
      showSku: false,
      showItemDiscounts: false,
      showTax: false,
      showSavings: false,
      showPayment: false,
      showAmountReceived: false,
      showPoweredBy: false,
    },
    tax: { enabled: true, gstin: '36ABCDE1234F1Z5' },
    logoDataUrl: 'data:image/png;base64,AAAA',
    widthMm: 58,
    sample: true,
  });

  assert.match(html, /SAMPLE PREVIEW · NOT A SALE/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /TAX INVOICE/);
  assert.doesNotMatch(html, /13-431\/C\/48/);
  assert.doesNotMatch(html, /7093230999/);
  assert.doesNotMatch(html, /GSTIN/);
  assert.doesNotMatch(html, /<td>Payment<\/td>/);
  assert.doesNotMatch(html, /Amount received/);
  assert.doesNotMatch(html, /KUR-0001-BLU-M/);
  assert.doesNotMatch(html, /Discount \(/);
  assert.doesNotMatch(html, /You saved/);
  assert.doesNotMatch(html, /Powered by|Engineered by Meninges Labs/);
  assert.match(html, /HEADER-NOTE/);
  assert.match(html, /FOOTER-NOTE/);
  assert.match(html, /Exchange within 7 days with a valid bill\./);
  assert.match(html, /font-size: 12\.60px/);
  assert.match(html, /text-align: center/);
  assert.match(html, /\.totals td:last-child[^}]*text-align: right/);
  assert.match(html, /Visit again/);
  assert.doesNotMatch(html, /We truly appreciate your business/);
  assert.match(html, /Grand Total/);

  const withLogo = receiptHtml({
    sale: sampleSale(),
    business: { name: 'MODERN FASHION', addressLines: ['ATTAPUR'] },
    invoice: { showLogo: true, logoHeightMm: 18, showTitle: true },
    receipt: { fontScale: 100 },
    tax: { enabled: false },
    logoDataUrl: 'data:image/png;base64,AAAA',
    widthMm: 80,
  });
  assert.match(withLogo, /<img/);
  assert.match(withLogo, /max-height:20mm/);
  assert.match(withLogo, /INVOICE/);

  const taxReceipt = receiptHtml({
    sale: { ...sampleSale(), taxPaise: 5000, pricesIncludeTax: true, totalPaise: 90000 },
    business: { name: 'MODERN FASHION', addressLines: ['ATTAPUR'] },
    invoice: {},
    receipt: {},
    tax: { enabled: true, gstin: '36ABCDE1234F1Z5' },
    widthMm: 80,
  });
  assert.match(taxReceipt, /TAX INVOICE/);
  assert.match(taxReceipt, /Tax included/);
  assert.match(taxReceipt, /GSTIN: 36ABCDE1234F1Z5/);
});

test('receipt redesign keeps the business policy, footer and hides empty rows', () => {
  const base = sampleSale();
  const noDiscount = {
    ...base,
    items: [{ ...base.items[0], discountPaise: 0, lineTotalPaise: 100000 }],
    subtotalPaise: 100000,
    discountTotalPaise: 0,
    totalPaise: 100000,
    amountPaidPaise: 100000,
    changePaise: 0,
    roundOffPaise: 0,
  };
  const html = receiptHtml({
    sale: noDiscount,
    business: {
      name: 'MODERN FASHION',
      addressLines: ['ATTAPUR'],
      stateCode: '36',
      stateName: 'Telangana',
      phone: '7093230999',
      returnPolicy: 'NO RETURN / EXCHANGE WITHIN 3 DAYS',
    },
    invoice: { terms: 'Keep the bill.', thankYou: 'Thanks for shopping with us!' },
    receipt: { footerNote: 'We appreciate your business.', showSavings: true },
    tax: { enabled: false },
    widthMm: 58,
  });
  assert.match(html, /NO RETURN \/ EXCHANGE WITHIN 3 DAYS/);
  assert.match(html, /class="thanks">Thanks for shopping with us!/);
  assert.doesNotMatch(html, /Powered by Modern Fashion POS/);
  assert.match(html, /We appreciate your business\./);
  assert.match(html, /Keep the bill\./);
  assert.match(html, /width: 48mm/);
  assert.match(html, /padding: 2mm 1mm 3mm/);
  assert.match(html, /body \{ width: 48mm; margin: 0;/);
  assert.doesNotMatch(html, /You saved/);
  assert.doesNotMatch(html, /<tr><td>Discount<\/td>/);
  assert.doesNotMatch(html, /Round off/);
});

test('barcode label shows MRP, selling price, barcode and adaptive page size', () => {
  const html = labelHtml({
    label: {
      productName: 'T-Shirt',
      sku: 'TSH-0001-BLU-M',
      barcode: 'MF0000000042',
      color: 'Blue',
      size: 'M',
      pricePaise: 69900,
      mrpPaise: 79900,
    },
    business: { name: 'MODERN FASHION' },
    options: { labelWidthMm: 50, labelHeightMm: 25 },
  });
  assert.match(html, /@page \{ size: 50mm 25mm/);
  assert.match(html, /SELLING PRICE : <span class="price">₹699<\/span>/);
  assert.match(html, /MRP : ₹799/);
  assert.match(html, /Blue · SIZE M/);
  assert.match(html, /page-break-after: auto/);
  assert.match(html, /<svg/);
  assert.match(html, /MF0000000042/);
});

test('EAN-8 labels print wider bars than EAN-13 on the same label width', () => {
  const label = {
    productName: 'EAN T-Shirt',
    sku: 'TSH-EAN-BLU-M',
    color: 'Blue',
    size: 'M',
    pricePaise: 69900,
    mrpPaise: 79900,
  };
  const ean8 = labelHtml({ label: { ...label, barcode: '20000011' }, options: { labelWidthMm: 50, labelHeightMm: 25 } });
  const ean13 = labelHtml({ label: { ...label, barcode: '4006381333931' }, options: { labelWidthMm: 50, labelHeightMm: 25 } });
  const width = (html) => Number(html.match(/width="([\d.]+)" height="[\d.]+"/)[1]);
  assert.match(ean8, /aria-label="Barcode 20000011"/);
  assert.match(ean8, /2000 0011/);
  assert.ok(width(ean8) < width(ean13), 'EAN-8 occupies fewer modules than EAN-13');
});

test('EAN-13 labels render the compact retail symbology with quiet zones', () => {
  const html = labelHtml({
    label: {
      productName: 'EAN T-Shirt',
      sku: 'TSH-EAN-BLU-M',
      barcode: '4006381333931',
      color: 'Blue',
      size: 'M',
      pricePaise: 69900,
      mrpPaise: 79900,
    },
    options: { labelWidthMm: 50, labelHeightMm: 25 },
  });
  assert.match(html, /aria-label="Barcode 4006381333931"/);
  assert.match(html, /4 006381 333931/);
  assert.match(html, /height: 7\.8mm/);
  assert.match(html, /MODERN FASHION/);
});

test('a completed sale renders real product and payment data on the receipt', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 2 });
  completeSale(app, product.variants[0].id, { quantity: 1 });
  const sale = app.services.sales.list({})[0];
  const receipt = app.services.sales.receiptData(sale.id);
  const html = receiptHtml({
    ...receipt,
    widthMm: 80,
    tax: { enabled: false },
    receipt: {},
    invoice: {},
  });
  assert.match(html, /Everyday Tee/);
  assert.match(html, /Total/);
});

test('label typography clamps long names and adapts to short stock', () => {
  const base = {
    sku: 'TSH-LONG-BLU-M',
    barcode: '4006381333931',
    color: 'Blue',
    size: 'M',
    pricePaise: 69900,
    mrpPaise: 79900,
  };
  const tall = labelHtml({
    label: { ...base, productName: 'Premium oversized cotton t-shirt with a very long printed product name' },
    options: { labelWidthMm: 50, labelHeightMm: 30 },
  });
  assert.match(tall, /-webkit-line-clamp: 2/);
  assert.doesNotMatch(tall, /class="label is-short"/);
  assert.match(tall, /height: 9\.3mm/);
  const short = labelHtml({
    label: { ...base, productName: 'Short Tee' },
    options: { labelWidthMm: 50, labelHeightMm: 18 },
  });
  assert.match(short, /class="label is-short"/);
  assert.match(short, /-webkit-line-clamp: 1/);
  assert.match(short, /\.label\.is-short \.meta \{ display: none; \}/);
});

test('regenerating a barcode as EAN-8 keeps a scannable 8-digit code', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { variants: [{ color: 'Black', size: 'M', openingStock: 1 }] });
  const variant = app.services.catalog.getProduct(product.id).variants[0];
  const result = app.services.catalog.regenerateBarcode(variant.id, { symbology: 'ean8' });
  assert.equal(result.symbology, 'ean8');
  assert.equal(isValidEan8(result.barcode), true);
  assert.equal(symbologyForBarcode(result.barcode), 'ean8');
  assert.equal(app.services.catalog.posLookup(result.barcode).variantId, variant.id);
});

test('regenerating a barcode as UPC-A replaces the label code and audits it', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { variants: [{ color: 'Black', size: 'M', openingStock: 1 }] });
  const variant = app.services.catalog.getProduct(product.id).variants[0];
  const result = app.services.catalog.regenerateBarcode(variant.id, { symbology: 'upca' });
  assert.equal(result.symbology, 'upca');
  assert.equal(result.previousBarcode, variant.barcode);
  assert.notEqual(result.barcode, variant.barcode);
  assert.equal(isValidUpcA(result.barcode), true);
  const saved = app.services.catalog.getProduct(product.id).variants[0];
  assert.equal(saved.barcode, result.barcode);
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'variant.barcode_regenerated'").get().c,
    1
  );
});

function receiptSale(count, overrides = {}) {
  const items = Array.from({ length: count }, (_, index) => ({
    productName: `Product ${index + 1}`,
    variantLabel: 'Blue / M',
    quantity: 1,
    unitPricePaise: 100000,
    discountPaise: 0,
    lineTotalPaise: 100000,
    taxPaise: 0,
  }));
  const subtotalPaise = 100000 * count;
  return {
    invoiceNo: 'MF-TEST-0001',
    completedAt: '2026-11-17T10:30:00.000Z',
    customerName: 'Test Customer',
    customerPhone: '9000000000',
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    pricesIncludeTax: false,
    items,
    subtotalPaise,
    discountTotalPaise: 0,
    taxPaise: 0,
    roundOffPaise: 0,
    totalPaise: subtotalPaise,
    amountPaidPaise: subtotalPaise,
    balancePaise: 0,
    changePaise: 0,
    ...overrides,
  };
}

function receiptFor(sale, overrides = {}) {
  return receiptHtml({
    sale,
    business: {
      name: 'MODERN FASHION',
      addressLines: ['13-431/C/48', 'Moghal Ka Nala', 'Pillar No. 101, Attapur Ring Road', 'Hyderabad, Telangana - 500048'],
      phone: '7093230999',
      returnPolicy: 'No return / exchange within 3 days',
    },
    invoice: { logoHeightMm: 16 },
    receipt: {},
    tax: { enabled: false },
    logoDataUrl: 'data:image/png;base64,AAAA',
    widthMm: 77,
    ...overrides,
  });
}

test('77 mm thermal receipt keeps a three-product sale complete and compact', () => {
  const html = receiptFor(receiptSale(3));
  assert.match(html, /width: 72mm/);
  assert.match(html, /class="w77"/);
  assert.match(html, /padding: 2mm 1mm 3mm/);
  assert.match(html, /max-height:20mm/);
  assert.equal((html.match(/class="item-name"/g) || []).length, 3);
  assert.match(html, /Invoice <b>MF-TEST-0001<\/b>/);
  assert.match(html, /class="title">INVOICE</);
  assert.match(html, /Customer: <b>Test Customer<\/b>/);
  assert.match(html, /Mobile: 9000000000/);
  assert.match(html, /Amount received/);
  assert.match(html, /No return \/ exchange within 3 days/i);
  assert.doesNotMatch(html, /Cashier/i);
  assert.doesNotMatch(html, /SKU/i);
  assert.doesNotMatch(html, /Powered by/);
  assert.doesNotMatch(html, /Amount in words|Rupees Only/i);
  assert.doesNotMatch(html, /Final amount/i);
});

test('a ten-product receipt prints one row per product without clipping', () => {
  const html = receiptFor(receiptSale(10));
  assert.equal((html.match(/class="item-name"/g) || []).length, 10);
  assert.match(html, /Product 10/);
  assert.doesNotMatch(html, /-webkit-line-clamp/);
});

test('long product names wrap inside the 77 mm receipt', () => {
  const name = 'Premium Handloom Cotton Straight Kurta with Embroidered Neckline and Three Quarter Sleeves';
  const [item] = receiptSale(1).items;
  const html = receiptFor(receiptSale(1, { items: [{ ...item, productName: name }] }));
  assert.ok(html.includes(name));
  assert.match(html, /\.items td \{[^}]*overflow-wrap: anywhere/);
});

test('an item discount prints once as a compact note under the item', () => {
  const html = receiptFor(
    receiptSale(1, {
      items: [
        { productName: 'Bootcut Jeans', variantLabel: 'Black / 30', quantity: 1, unitPricePaise: 79900, discountPaise: 5000, lineTotalPaise: 74900 },
      ],
      subtotalPaise: 79900,
      discountTotalPaise: 5000,
      totalPaise: 74900,
      amountPaidPaise: 74900,
    })
  );
  assert.match(html, /Qty 1 · Black \/ 30/);
  assert.match(html, /class="item-disc">Disc 6\.3% −₹50/);
  assert.match(html, /<td class="num amount">749<\/td>/);
  assert.match(html, /Total discount<\/td><td>- ₹50<\/td>/);
  assert.equal((html.match(/Disc 6\.3%/g) || []).length, 1);
});

test('a tax invoice shows GSTIN and tax only when real values exist', () => {
  const taxed = receiptFor(receiptSale(1, { taxPaise: 4750, totalPaise: 99750, amountPaidPaise: 99750 }), {
    tax: { enabled: true, gstin: '36ABCDE1234F1Z5' },
  });
  assert.match(taxed, /class="title">TAX INVOICE</);
  assert.match(taxed, /GSTIN: 36ABCDE1234F1Z5/);
  assert.match(taxed, /<td>Tax<\/td>/);
  assert.match(taxed, /Grand Total/);

  const placeholder = receiptFor(receiptSale(1), { tax: { enabled: true, gstin: 'GSTIN-123' } });
  assert.doesNotMatch(placeholder, /GSTIN:/);
});

test('cash change and partial balance print distinct footers', () => {
  const cash = receiptFor(receiptSale(1, { amountPaidPaise: 200000, changePaise: 100000 }));
  assert.match(cash, /<td>Change<\/td><td>₹1,000<\/td>/);
  assert.doesNotMatch(cash, /Balance due/);

  const partial = receiptFor(receiptSale(1, { amountPaidPaise: 50000, balancePaise: 50000 }));
  assert.match(partial, /<td>Balance due<\/td><td>₹500<\/td>/);
});

test('58 mm receipts keep the compact layout and inner padding', () => {
  const html = receiptFor(receiptSale(1), { widthMm: 58 });
  assert.match(html, /class="w58"/);
  assert.match(html, /width: 48mm/);
  assert.match(html, /padding: 2mm 1mm 3mm/);
});

test('the A4 invoice previews as a full sheet with its print margins', () => {
  const sale = receiptSale(1);
  const html = invoiceHtml({
    sale: {
      ...sale,
      items: [{ ...sale.items[0], hsnCode: '—', taxablePaise: 100000, taxPaise: 0 }],
      taxEnabled: true,
    },
    business: { name: 'MODERN FASHION', phone: '7093230999', addressLines: ['HYD 48'] },
    invoice: {},
    receipt: {},
    tax: { enabled: true, gstin: '36ABCDE1234F1Z5' },
    logoDataUrl: '',
  });
  assert.match(html, /@media screen \{\s*body \{ width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 12mm; \}\s*\}/);
  assert.match(html, /Total payable/);
});
