import { escapeHtml, code128Svg } from './code128.js';

const DATE_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const PAYMENT_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  credit: 'Credit',
  cheque: 'Cheque',
};

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return DATE_FORMAT.format(date);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}

export function money(paise, { symbol = 'Rs.', space = ' ' } = {}) {
  const amount = (Number(paise) || 0) / 100;
  const text = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${space}${text}`;
}

export function paymentLabel(method) {
  return PAYMENT_LABELS[method] || method || '';
}

export function amountInWords(paise) {
  const rupees = Math.floor(Math.abs(Number(paise) || 0) / 100);
  const paisePart = Math.abs(Number(paise) || 0) % 100;
  if (rupees === 0 && paisePart === 0) return 'Zero rupees only';
  const words = `${numberToIndianWords(rupees)} rupees${paisePart ? ` and ${numberToIndianWords(paisePart)} paise` : ''} only`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowHundred(number) {
  if (number < 20) return ONES[number];
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ''}`;
}

function belowThousand(number) {
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  return `${hundreds ? `${ONES[hundreds]} hundred` : ''}${hundreds && rest ? ' ' : ''}${rest ? belowHundred(rest) : ''}`.trim();
}

function numberToIndianWords(number) {
  let value = Math.floor(Number(number) || 0);
  if (value === 0) return 'zero';
  const parts = [];
  const crore = Math.floor(value / 10000000);
  value %= 10000000;
  const lakh = Math.floor(value / 100000);
  value %= 100000;
  const thousand = Math.floor(value / 1000);
  value %= 1000;
  if (crore) parts.push(`${numberToIndianWords(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (value) parts.push(belowThousand(value));
  return parts.join(' ');
}

function addressLines(business) {
  return (business?.addressLines || []).filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join('');
}

function logoMarkup(logoDataUrl, { maxHeight = '16mm', className = 'logo' } = {}) {
  if (!logoDataUrl) return '';
  return `<img class="${className}" src="${logoDataUrl}" alt="" style="max-height:${maxHeight};max-width:70%;object-fit:contain;" />`;
}

function invoiceTitle(tax) {
  return tax?.enabled ? 'TAX INVOICE' : 'INVOICE';
}

function termsMarkup(invoice, receipt) {
  const terms = String(invoice?.terms || '').trim();
  const footer = String(receipt?.footerNote || '').trim();
  const lines = [];
  if (terms) lines.push(`<div class="terms"><strong>Terms &amp; Conditions</strong><div>${escapeHtml(terms).replace(/\n/g, '<br/>')}</div></div>`);
  if (footer) lines.push(`<div class="footer-note">${escapeHtml(footer).replace(/\n/g, '<br/>')}</div>`);
  return lines.join('');
}

export function receiptHtml({
  sale,
  business,
  invoice,
  receipt,
  tax,
  logoDataUrl = '',
  widthMm = 80,
  duplicate = false,
  sample = false,
}) {
  const width = widthMm === 58 ? 58 : 80;
  const compact = width === 58;
  const sidePadding = compact ? 3 : 4;
  const scale = Math.min(1.3, Math.max(0.8, Number(receipt?.fontScale || 100) / 100));
  const fs = (size) => `${(size * scale).toFixed(2)}px`;
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(24, Math.max(8, Number(invoice?.logoHeightMm || 16)));
  const showTitle = invoice?.showTitle !== false;
  const showAddress = invoice?.showAddress !== false;
  const showPhone = invoice?.showPhone !== false;
  const showState = invoice?.showState !== false;
  const showGstin = invoice?.showGstin !== false;
  const showPayment = receipt?.showPayment !== false;
  const showAmountReceived = receipt?.showAmountReceived !== false;
  const showPoweredBy = receipt?.showPoweredBy !== false;
  const showItemDiscounts = receipt?.showItemDiscounts !== false;
  const showSku = receipt?.showSku !== false;
  const showTax = Boolean(tax?.enabled) && Number(sale.taxPaise) > 0 && receipt?.showTax !== false;
  const inclusiveTax = showTax && Boolean(sale.pricesIncludeTax);
  const balance = Math.max(0, Number(sale.balancePaise || 0));
  const change = Number(sale.changePaise || 0);
  const discountTotal = Number(sale.discountTotalPaise || 0);
  const headerNote = String(receipt?.headerNote || '').trim();
  const returnPolicy = String(business?.returnPolicy || '').trim();
  const thanks = String(invoice?.thankYou || 'Thank you for shopping with us!').trim();
  const stateLine = [
    showState
      ? business?.stateCode
        ? `${business.stateCode} - ${business.stateName || ''}`
        : business?.stateName
      : '',
    showPhone ? business?.phone : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const totalQuantity = Number(sale.items?.reduce((sum, item) => sum + item.quantity, 0) || 0);

  const itemRows = (sale.items || [])
    .map((item) => {
      const gross = item.unitPricePaise * item.quantity;
      const discount = item.discountPaise || 0;
      const discountPercent = gross > 0 ? (discount * 100) / gross : 0;
      return `<tr class="item-row">
        <td>
          <span class="item-name">${escapeHtml(item.productName)}</span>
          <span class="item-meta">${escapeHtml(item.variantLabel)}${
            showSku && item.sku ? ` · ${escapeHtml(item.sku)}` : ''
          }</span>
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPricePaise)}</td>
        <td class="num">${money(gross)}</td>
      </tr>
      ${
        showItemDiscounts && discount > 0
          ? `<tr class="sub-row"><td colspan="3">Discount${
              discountPercent > 0 ? ` (${discountPercent.toFixed(1)}%)` : ''
            }</td><td class="num">- ${money(discount)}</td></tr>`
          : ''
      }
      <tr class="sub-row final"><td colspan="3">Final amount</td><td class="num">${money(
        item.lineTotalPaise
      )}</td></tr>`;
    })
    .join('');

  const amountRows = showAmountReceived
    ? `<tr><td>Amount received</td><td>${money(sale.amountPaidPaise)}</td></tr>${
        balance > 0
          ? `<tr><td>Balance due</td><td>${money(balance)}</td></tr>`
          : change > 0
            ? `<tr><td>Change</td><td>${money(change)}</td></tr>`
            : ''
      }`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: ${width}mm; margin: 0 auto; padding: 8mm ${sidePadding}mm 7mm; font-family: "Segoe UI", "Trebuchet MS", Arial, Helvetica, sans-serif; font-size: ${fs(
    compact ? 10 : 11
  )}; line-height: 1.48; }
  .center { text-align: center; }
  .header { padding-bottom: 1.5mm; border-bottom: 1px solid #000; }
  .logo { display: block; margin: 0 auto 3mm; max-width: 70%; object-fit: contain; }
  .business-name { font-size: ${fs(compact ? 15 : 18)}; font-weight: 800; letter-spacing: 0.07em; line-height: 1.15; text-transform: uppercase; }
  .business-meta { margin-top: 1mm; font-size: ${fs(compact ? 9 : 10)}; line-height: 1.5; }
  .return-policy { margin-top: 1.5mm; font-size: ${fs(compact ? 9 : 10)}; font-weight: 700; line-height: 1.45; text-transform: uppercase; }
  .title { margin: 3mm 0 1.5mm; font-size: ${fs(compact ? 12 : 13)}; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .duplicate, .sample { margin: 2mm 0; padding: 1.2mm; border: 1px dashed #000; font-size: ${fs(9)}; font-weight: 700; letter-spacing: 0.06em; text-align: center; }
  .sample { border-style: solid; }
  .header-note { margin: 1.5mm 0; font-size: ${fs(9)}; text-align: center; }
  .meta { width: 100%; margin-top: 1.5mm; border-collapse: collapse; }
  .meta td { padding: 0.6mm 0; vertical-align: top; font-size: ${fs(compact ? 9 : 10)}; }
  .meta td:first-child { width: 24%; font-weight: 700; }
  .meta td:last-child { font-weight: 600; text-align: right; }
  .separator { margin: 2mm 0; border-top: 1px dashed #000; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items th { padding: 1.2mm 0; border-bottom: 1px solid #000; font-size: ${fs(compact ? 8 : 9.5)}; font-weight: 700; letter-spacing: 0.04em; text-align: left; text-transform: uppercase; }
  .items th.num, .items td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .items th:nth-child(1) { width: 46%; }
  .items th:nth-child(2) { width: 12%; }
  .items th:nth-child(3) { width: 20%; }
  .items th:nth-child(4) { width: 22%; }
  .items td { padding: 1.2mm 0 0; vertical-align: top; font-size: ${fs(compact ? 9.5 : 11)}; word-break: break-word; overflow-wrap: anywhere; }
  .item-row td { padding-top: 1.8mm; }
  .item-name { display: block; font-weight: 700; line-height: 1.35; }
  .item-meta { display: block; margin-top: 0.3mm; color: #333; font-size: ${fs(compact ? 8 : 9)}; line-height: 1.4; }
  .sub-row td { padding: 0.5mm 0; font-size: ${fs(compact ? 9 : 10)}; }
  .sub-row.final td { padding-top: 0.8mm; font-weight: 700; }
  .totals { width: 100%; margin-top: 2mm; border-collapse: collapse; }
  .totals td { padding: 0.7mm 0; font-size: ${fs(compact ? 9.5 : 10.5)}; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .totals .grand td { padding-top: 1.6mm; border-top: 1px solid #000; font-size: ${fs(compact ? 16 : 18)}; font-weight: 800; }
  .savings { display: flex; justify-content: space-between; gap: 2mm; margin-top: 2mm; padding: 1.4mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: ${fs(compact ? 11 : 12)}; font-weight: 800; text-transform: uppercase; }
  .words { margin-top: 2mm; padding-top: 1.2mm; border-top: 1px dotted #777; font-size: ${fs(compact ? 8.5 : 9.5)}; line-height: 1.5; }
  .words strong { display: block; margin-top: 0.4mm; font-weight: 700; }
  .terms { margin-top: 2.5mm; font-size: ${fs(compact ? 9 : 10)}; line-height: 1.5; }
  .terms strong { display: block; margin-bottom: 0.7mm; font-size: ${fs(9.5)}; letter-spacing: 0.04em; text-transform: uppercase; }
  .footer-note { margin-top: 1.5mm; font-size: ${fs(9)}; text-align: center; }
  .thanks { margin-top: 2.5mm; padding-top: 2mm; border-top: 1px dashed #000; text-align: center; }
  .thanks strong { display: block; font-size: ${fs(compact ? 11 : 12)}; font-weight: 800; line-height: 1.35; }
  .thanks div { margin-top: 0.8mm; font-size: ${fs(9)}; line-height: 1.45; }
  .powered { margin-top: 2mm; color: #555; font-size: ${fs(8)}; text-align: center; }
  .gst { font-size: ${fs(9)}; }
</style></head>
<body class="${compact ? 'w58' : 'w80'}">
  <div class="header">
    ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm` }) : ''}
    <div class="center">
      <div class="business-name">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
      ${showAddress ? `<div class="business-meta">${addressLines(business)}</div>` : ''}
      ${stateLine ? `<div class="business-meta">${escapeHtml(stateLine)}</div>` : ''}
      ${showGstin && tax?.enabled && tax?.gstin ? `<div class="business-meta gst">GSTIN: ${escapeHtml(tax.gstin)}</div>` : ''}
      ${returnPolicy ? `<div class="return-policy">${escapeHtml(returnPolicy)}</div>` : ''}
    </div>
  </div>
  ${showTitle ? `<div class="center title">${invoiceTitle(tax)}</div>` : ''}
  ${sample ? '<div class="sample">SAMPLE PREVIEW · NOT A SALE</div>' : ''}
  ${duplicate ? `<div class="duplicate">${escapeHtml(invoice?.duplicateLabel || 'DUPLICATE COPY')}</div>` : ''}
  ${headerNote ? `<div class="header-note">${escapeHtml(headerNote).replace(/\n/g, '<br/>')}</div>` : ''}
  <table class="meta">
    ${
      receipt?.showCustomer !== false && sale.customerName
        ? `<tr><td>Customer</td><td>${escapeHtml(sale.customerName)}</td></tr>`
        : ''
    }
    ${
      receipt?.showCustomer !== false && sale.customerPhone
        ? `<tr><td>Mobile</td><td>${escapeHtml(sale.customerPhone)}</td></tr>`
        : ''
    }
    ${
      receipt?.showCustomer !== false && sale.customerGstin
        ? `<tr><td>GSTIN</td><td>${escapeHtml(sale.customerGstin)}</td></tr>`
        : ''
    }
    <tr><td>Invoice</td><td>${escapeHtml(sale.invoiceNo)}</td></tr>
    <tr><td>Date</td><td>${escapeHtml(formatDateTime(sale.completedAt || sale.saleDate))}</td></tr>
    ${receipt?.showCashier !== false ? `<tr><td>Cashier</td><td>${escapeHtml(sale.cashierName || '')}</td></tr>` : ''}
    ${showPayment ? `<tr><td>Payment</td><td>${escapeHtml(paymentLabel(sale.paymentMethod))}</td></tr>` : ''}
  </table>
  <div class="separator"></div>
  <table class="items">
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="separator"></div>
  <table class="totals">
    <tr><td>Total quantity</td><td>${totalQuantity}</td></tr>
    <tr><td>Subtotal</td><td>${money(sale.subtotalPaise)}</td></tr>
    ${discountTotal > 0 ? `<tr><td>Discount</td><td>- ${money(discountTotal)}</td></tr>` : ''}
    ${showTax ? `<tr><td>${inclusiveTax ? 'Tax included' : 'Tax'}</td><td>${money(sale.taxPaise)}</td></tr>` : ''}
    ${Number(sale.roundOffPaise) !== 0 ? `<tr><td>Round off</td><td>${Number(sale.roundOffPaise) > 0 ? '+' : '-'} ${money(
      Math.abs(sale.roundOffPaise)
    )}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td>${money(sale.totalPaise)}</td></tr>
    ${amountRows}
  </table>
  <div class="words">Amount in words<strong>${escapeHtml(amountInWords(sale.totalPaise))}</strong></div>
  ${
    receipt?.showSavings !== false && discountTotal > 0
      ? `<div class="savings"><span>You saved</span><strong>${money(discountTotal)}</strong></div>`
      : ''
  }
  ${termsMarkup(invoice, { ...receipt, footerNote: '' })}
  <div class="thanks">
    <strong>${escapeHtml(thanks)}</strong>
    ${receipt?.footerNote ? `<div>${escapeHtml(receipt.footerNote).replace(/\n/g, '<br/>')}</div>` : ''}
  </div>
  ${showPoweredBy ? '<div class="powered">Modern Fashion POS · Engineered by Meninges Labs</div>' : ''}
</body></html>`;
}

export function invoiceHtml({ sale, business, invoice, receipt, tax, logoDataUrl = '' }) {
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(30, Math.max(8, Number(invoice?.logoHeightMm || 22)));
  const showAddress = invoice?.showAddress !== false;
  const showPhone = invoice?.showPhone !== false;
  const showState = invoice?.showState !== false;
  const showGstin = invoice?.showGstin !== false;
  const showTitle = invoice?.showTitle !== false;
  const showPoweredBy = receipt?.showPoweredBy !== false;
  const hasDiscount =
    Number(sale.discountTotalPaise || 0) > 0 ||
    (sale.items || []).some((item) => Number(item.discountPaise) > 0);
  const showTax = Boolean(tax?.enabled);
  const returnPolicy = String(business?.returnPolicy || '').trim();
  const stateLine = [
    showState
      ? business?.stateCode
        ? `${business.stateCode} - ${business.stateName || ''}`
        : business?.stateName
      : '',
    showPhone ? business?.phone : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const rows = (sale.items || [])
    .map((item, index) => {
      const gross = item.unitPricePaise * item.quantity;
      const taxable = item.lineTotalPaise - item.taxPaise;
      return `<tr>
        <td class="num">${index + 1}</td>
        <td><strong>${escapeHtml(item.productName)}</strong><div class="muted">${escapeHtml(
          item.variantLabel
        )} · ${escapeHtml(item.sku)}</div></td>
        ${showTax ? `<td>${escapeHtml(item.hsnCode || '—')}</td>` : ''}
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPricePaise, { symbol: '₹', space: '' })}</td>
        ${
          hasDiscount
            ? `<td class="num">${money(gross, { symbol: '₹', space: '' })}</td>
               <td class="num">${money(item.discountPaise, { symbol: '₹', space: '' })}</td>`
            : ''
        }
        ${
          showTax
            ? `<td class="num">${money(taxable, { symbol: '₹', space: '' })}</td>
               <td class="num">${escapeHtml((item.taxRateBp / 100).toFixed(2))}%</td>
               <td class="num">${money(item.taxPaise, { symbol: '₹', space: '' })}</td>`
            : ''
        }
        <td class="num strong">${money(item.lineTotalPaise, { symbol: '₹', space: '' })}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #1d1d1f; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.45; }
  .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #202124; padding-bottom: 14px; }
  .brand { display: flex; gap: 14px; align-items: flex-start; }
  .logo { max-height: 22mm; max-width: 52mm; object-fit: contain; }
  .brand h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 0.02em; }
  .brand p { margin: 0; color: #54555a; font-size: 9.5px; }
  .doc { text-align: right; min-width: 175px; }
  .doc h2 { margin: 0 0 6px; font-size: 16px; letter-spacing: 0.12em; text-transform: uppercase; }
  .doc table { margin-left: auto; border-collapse: collapse; }
  .doc td { padding: 1px 0 1px 14px; font-size: 9.5px; }
  .doc td:first-child { color: #6b6c72; }
  .parties { display: flex; gap: 28px; margin: 16px 0; }
  .party { flex: 1; }
  .label { margin-bottom: 4px; color: #77787d; font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .party strong { display: block; font-size: 12px; }
  .party div { color: #4f5055; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.items thead th { padding: 7px 5px; background: #f1f1ef; border-top: 1px solid #d9d9d5; border-bottom: 1px solid #d9d9d5; font-size: 8px; letter-spacing: 0.04em; text-align: left; text-transform: uppercase; }
  table.items tbody td { padding: 7px 5px; border-bottom: 1px solid #ecece8; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #77787d; font-size: 8.5px; }
  .strong { font-weight: 700; }
  .bottom { display: flex; justify-content: space-between; gap: 30px; margin-top: 16px; }
  .words { flex: 1; font-size: 9px; }
  .words strong { display: block; margin-bottom: 4px; }
  .totals { width: 300px; border-collapse: collapse; }
  .totals td { padding: 3px 0; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { padding-top: 8px; border-top: 2px solid #202124; font-size: 14px; font-weight: 700; }
  .terms { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e2de; color: #55565b; font-size: 8.5px; }
  .return-policy { margin: 4px 0 0; color: #55565b; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .foot { margin-top: 18px; display: flex; justify-content: space-between; color: #77787d; font-size: 8px; }
  .notice { margin-top: 8px; padding: 6px 8px; border: 1px solid #e4d7c8; background: #fbf7f1; color: #6b4e2e; font-size: 8px; }
</style></head>
<body>
  <div class="top">
    <div class="brand">
      ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm` }) : ''}
      <div>
        <h1>${escapeHtml(business?.name || 'MODERN FASHION')}</h1>
        ${showAddress ? `<p>${(business?.addressLines || []).map((line) => escapeHtml(line)).join('<br/>')}</p>` : ''}
        ${stateLine ? `<p>${escapeHtml(stateLine)}</p>` : ''}
        ${showGstin && tax?.enabled && tax?.gstin ? `<p>GSTIN: ${escapeHtml(tax.gstin)}</p>` : ''}
        ${returnPolicy ? `<p class="return-policy">${escapeHtml(returnPolicy)}</p>` : ''}
      </div>
    </div>
    <div class="doc">
      ${showTitle ? `<h2>${invoiceTitle(tax)}</h2>` : ''}
      <table>
        <tr><td>Invoice no.</td><td><strong>${escapeHtml(sale.invoiceNo)}</strong></td></tr>
        <tr><td>Invoice date</td><td>${escapeHtml(formatDate(sale.completedAt || sale.saleDate))}</td></tr>
        <tr><td>Cashier</td><td>${escapeHtml(sale.cashierName || '')}</td></tr>
        <tr><td>Payment</td><td>${escapeHtml(paymentLabel(sale.paymentMethod))}</td></tr>
        <tr><td>Status</td><td>${escapeHtml(sale.paymentStatus)}</td></tr>
      </table>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <div class="label">Billed to</div>
      <strong>${escapeHtml(sale.customerName || 'Walk-in customer')}</strong>
      <div>${escapeHtml(sale.customerPhone || '')}</div>
      ${sale.customerGstin ? `<div>GSTIN: ${escapeHtml(sale.customerGstin)}</div>` : ''}
    </div>
    <div class="party">
      <div class="label">Sold by</div>
      <strong>${escapeHtml(business?.name || 'MODERN FASHION')}</strong>
      <div>${escapeHtml(business?.phone || '')}</div>
    </div>
  </div>
  <table class="items">
    <thead><tr>
      <th>#</th><th>Description</th>
      ${showTax ? '<th>HSN</th>' : ''}
      <th class="num">Qty</th><th class="num">Rate</th>
      ${hasDiscount ? '<th class="num">Gross</th><th class="num">Discount</th>' : ''}
      ${showTax ? '<th class="num">Taxable</th><th class="num">Tax</th><th class="num">Tax amt</th>' : ''}
      <th class="num">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div class="words">
      <strong>Amount in words</strong>
      ${escapeHtml(amountInWords(sale.totalPaise))}
      ${tax?.enabled ? '' : '<div class="notice">Tax invoice is not enabled in Settings. This document is a sales invoice, not a GST tax invoice.</div>'}
    </div>
    <table class="totals">
      <tr><td>Subtotal</td><td>${money(sale.subtotalPaise, { symbol: '₹', space: '' })}</td></tr>
      ${Number(sale.discountTotalPaise) > 0 ? `<tr><td>Discount</td><td>- ${money(sale.discountTotalPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      ${showTax && Number(sale.taxPaise) > 0 ? `<tr><td>${sale.pricesIncludeTax ? 'Tax included (not added)' : 'Tax'}</td><td>${money(sale.taxPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      ${Number(sale.roundOffPaise) !== 0 ? `<tr><td>Round off</td><td>${money(sale.roundOffPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      <tr class="grand"><td>Total payable</td><td>${money(sale.totalPaise, { symbol: '₹', space: '' })}</td></tr>
      <tr><td>Amount received</td><td>${money(sale.amountPaidPaise, { symbol: '₹', space: '' })}</td></tr>
      ${sale.balancePaise > 0 ? `<tr><td>Balance due</td><td>${money(sale.balancePaise, { symbol: '₹', space: '' })}</td></tr>` : Number(sale.changePaise) > 0 ? `<tr><td>Change</td><td>${money(sale.changePaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
    </table>
  </div>
  <div class="terms">
    ${invoice?.terms ? `<strong>Terms &amp; Conditions</strong><div>${escapeHtml(invoice.terms).replace(/\n/g, '<br/>')}</div>` : ''}
    ${receipt?.footerNote ? `<div>${escapeHtml(receipt.footerNote)}</div>` : ''}
  </div>
  <div class="foot"><span>${escapeHtml(invoice?.thankYou || 'Thank you for shopping with us!')}</span>${
    showPoweredBy ? '<span>Computer-generated invoice · Modern Fashion POS</span>' : ''
  }</div>
</body></html>`;
}

export function labelHtml({ label, business, options = {} }) {
  const width = Number(options.labelWidthMm || 50);
  const height = Number(options.labelHeightMm || 25);
  const showName = options.labelShowName !== false;
  const showSku = options.labelShowSku !== false;
  const showPrice = options.labelShowPrice !== false;
  const showSize = options.labelShowSize !== false;
  const scale = Math.max(0.72, Math.min(1.35, height / 25));
  const fs = (size) => `${(size * scale).toFixed(1)}px`;
  const topPadding = Math.max(2, height * 0.08);
  const mrpPaise = Number(label.mrpPaise || 0);
  const pricePaise = Number(label.pricePaise || 0);
  const showMrp = showPrice && mrpPaise > 0;
  const showSelling = showPrice && pricePaise > 0 && pricePaise !== mrpPaise;
  const barcode = code128Svg(label.barcode, { moduleWidth: 2, height: 34, showText: true });
  return `<div class="label">
    <div class="brand">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    ${showName ? `<div class="name">${escapeHtml(label.productName)}</div>` : ''}
    ${
      showMrp || showSelling
        ? `<div class="price-row">
            ${showMrp ? `<span>MRP: ${money(mrpPaise, { symbol: '₹', space: '' })}</span>` : ''}
            ${showSelling ? `<span>Price: ${money(pricePaise, { symbol: '₹', space: '' })}</span>` : ''}
          </div>`
        : ''
    }
    <div class="barcode">${barcode}</div>
    ${
      showSize
        ? `<div class="meta"><span>COLOR: ${escapeHtml(label.color)}</span><span>SIZE: ${escapeHtml(
            label.size
          )}</span></div>`
        : ''
    }
    ${showSku ? `<div class="sku">${escapeHtml(label.sku)}</div>` : ''}
  </div>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Segoe UI", Arial, Helvetica, sans-serif; }
    .label { width: ${width}mm; height: ${height}mm; padding: ${topPadding.toFixed(1)}mm 2mm 1.4mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    .brand { width: 100%; overflow: hidden; color: #222; font-size: ${fs(6)}; font-weight: 700; letter-spacing: 0.08em; text-align: center; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
    .name { display: -webkit-box; max-width: 100%; overflow: hidden; font-size: ${fs(10)}; font-weight: 800; line-height: 1.1; text-align: center; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .price-row { display: flex; width: 100%; flex-wrap: wrap; justify-content: center; gap: 2.5mm; font-size: ${fs(8)}; font-weight: 700; line-height: 1.2; }
    .barcode { display: flex; width: 100%; flex: 1; align-items: center; justify-content: center; padding: 0.6mm 0; }
    .barcode svg { width: 100%; height: auto; max-height: ${Math.max(7, height * 0.38).toFixed(1)}mm; }
    .meta { display: flex; width: 100%; justify-content: space-between; gap: 2mm; font-size: ${fs(7)}; font-weight: 600; line-height: 1.2; }
    .sku { width: 100%; overflow: hidden; color: #333; font-family: Consolas, monospace; font-size: ${fs(5.6)}; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  </style>`;
}

export function labelsHtml({ labels, business, options = {}, preview = false }) {
  const pages = labels.map((label) => labelHtml({ label, business, options })).join('');
  const previewCss = preview
    ? `<style>
        html, body { margin: 0; padding: 10px; background: #e9e6df; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .label { flex: 0 0 auto; background: #fff; box-shadow: 0 1px 6px rgb(0 0 0 / 18%); }
      </style>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Barcode labels</title>${previewCss}</head><body>${pages}</body></html>`;
}

export function testReceiptHtml({ business, invoice, receipt, tax, logoDataUrl = '', widthMm = 80 }) {
  const width = widthMm === 58 ? 58 : 80;
  const sidePadding = width === 58 ? 3 : 4;
  const scale = Math.min(1.3, Math.max(0.8, Number(receipt?.fontScale || 100) / 100));
  const fs = (size) => `${(size * scale).toFixed(2)}px`;
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(30, Math.max(8, Number(invoice?.logoHeightMm || 16)));
  const stateLine = [
    business?.stateCode ? `${business.stateCode} - ${business.stateName || ''}` : business?.stateName,
    invoice?.showPhone !== false ? business?.phone : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Printer test</title>
  <style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; color: #000; background: #fff; }
    body { width: ${width}mm; margin: 0 auto; padding: 8mm ${sidePadding}mm 5mm; font-family: Arial, sans-serif; font-size: ${fs(10)}; line-height: 1.4; }
    .center { text-align: center; } .logo { display:block; margin:0 auto 2mm; max-width:70%; object-fit:contain; }
    .title { margin: 2mm 0; font-size: ${fs(14)}; font-weight: 800; letter-spacing: 0.1em; }
    .banner { margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000; font-size: ${fs(8)}; font-weight: 700; text-align: center; }
    .row { display:flex; justify-content:space-between; gap:2mm; border-top:1px dotted #777; padding:0.8mm 0; }
    .big { font-size: ${fs(13)}; font-weight: 800; }
    .small { font-size: ${fs(8)}; }
  </style></head><body>
    ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm` }) : ''}
    <div class="center"><strong>${escapeHtml(business?.name || 'MODERN FASHION')}</strong><br/>${
      invoice?.showAddress !== false ? addressLines(business) : ''
    }${stateLine ? `<br/>${escapeHtml(stateLine)}` : ''}</div>
    <div class="center title">PRINTER TEST</div>
    <div class="banner">NOT A SALE · NO STOCK OR ACCOUNTING RECORD CREATED</div>
    <div class="row"><span>Printer test</span><span>PASS if readable</span></div>
    <div class="row"><span>Invoice title</span><span>${invoiceTitle(tax)}</span></div>
    <div class="row"><span>Paper width</span><span>${width} mm</span></div>
    <div class="row"><span>Date</span><span>${escapeHtml(formatDateTime(new Date().toISOString()))}</span></div>
    <div class="row"><span>Amount</span><span>Rs. 0.00</span></div>
    <div class="row big"><span>Total</span><span>Rs. 0.00</span></div>
    <div class="center small" style="margin-top:4mm">If this line is cut cleanly and the text is sharp,<br/>the Windows driver submitted the job successfully.</div>
    <div class="center small" style="margin-top:3mm">Physical output and auto-cut must be checked at the printer.</div>
  </body></html>`;
}

export function testLabelHtml({ business, options = {} }) {
  const width = Number(options.labelWidthMm || 50);
  const height = Number(options.labelHeightMm || 25);
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Label test</title>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    html, body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,sans-serif; }
    .label { width:${width}mm; height:${height}mm; padding:1.5mm 2mm; display:flex; flex-direction:column; align-items:center; justify-content:space-between; }
    .brand { font-size:7px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
    .title { font-size:9px; font-weight:800; }
    .barcode { width:100%; display:flex; justify-content:center; }
    .barcode svg { width:100%; height:auto; max-height:10mm; }
    .small { font-size:6px; text-align:center; }
  </style></head><body><div class="label">
    <div class="brand">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    <div class="title">LABEL PRINTER TEST</div>
    <div class="barcode">${code128Svg('MFTESTLABEL', { moduleWidth: 2, height: 30 })}</div>
    <div class="small">NOT A PRODUCT · CHECK ALIGNMENT &amp; SCAN<br/>${width} x ${height} mm</div>
  </div></body></html>`;
}
