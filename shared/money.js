/**
 * Money utilities shared by the Electron main process, renderer and tests.
 * All amounts are integer paise. Never use binary floating point for money.
 */

export function toPaise(rupees) {
  const value = Number(rupees);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromPaise(paise) {
  return (Number(paise) || 0) / 100;
}

export function formatPaise(paise, { withSymbol = true } = {}) {
  const amount = (Number(paise) || 0) / 100;
  const text = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `₹${text}` : text;
}

export function formatPaisePlain(paise) {
  return ((Number(paise) || 0) / 100).toFixed(2);
}

/** Round half up for positive amounts. */
export function roundHalfUp(value) {
  return Math.floor(Number(value) + 0.5);
}

/**
 * Allocate an integer amount across weights without losing or inventing paise.
 * Uses largest remainder so the sum of allocations always equals `amount`.
 */
export function allocate(amount, weights) {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
  const result = weights.map(() => 0);
  const target = Math.trunc(Number(amount) || 0);
  if (target <= 0 || totalWeight <= 0) return result;

  const exact = weights.map((weight) => (target * Math.max(0, Number(weight) || 0)) / totalWeight);
  let assigned = 0;
  exact.forEach((value, index) => {
    result[index] = Math.floor(value);
    assigned += result[index];
  });
  let remainder = target - assigned;
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (remainder > 0) {
    result[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return result;
}

/**
 * Round a total to the nearest whole rupee (Indian retail convention).
 * Returns { totalPaise, roundOffPaise }.
 */
export function roundToRupee(paise) {
  const rupee = 100;
  const rounded = Math.round((Number(paise) || 0) / rupee) * rupee;
  return { totalPaise: rounded, roundOffPaise: rounded - (Number(paise) || 0) };
}

/**
 * Compute the authoritative cart totals.
 *
 * lines: [{ quantity, unitPricePaise, taxRateBp, lineDiscountBp?, lineDiscountPaise? }]
 * options: { billDiscountPaise?, roundToRupee?: boolean }
 *
 * lineDiscountBp is in basis points (500 = 5%). lineDiscountPaise is an
 * absolute per-line discount and wins when both are supplied. Bill discount is
 * a flat paise amount applied across lines pro-rata after line discounts. Tax
 * is computed on the discounted taxable value of each line.
 */
export function computeCartTotals(lines, options = {}) {
  const safeLines = (lines || []).map((line) => {
    const quantity = Math.max(0, Math.trunc(Number(line.quantity) || 0));
    const unitPricePaise = Math.max(0, Math.trunc(Number(line.unitPricePaise) || 0));
    const taxRateBp = Math.min(2800, Math.max(0, Math.trunc(Number(line.taxRateBp) || 0)));
    const lineDiscountBp = Math.min(10000, Math.max(0, Math.trunc(Number(line.lineDiscountBp) || 0)));
    const gross = quantity * unitPricePaise;
    const explicitPaise = Number(line.lineDiscountPaise);
    const lineDiscount = Number.isFinite(explicitPaise) && explicitPaise > 0
      ? Math.trunc(explicitPaise)
      : roundHalfUp((gross * lineDiscountBp) / 10000);
    return {
      quantity,
      unitPricePaise,
      taxRateBp,
      lineDiscountBp,
      grossPaise: gross,
      lineDiscountPaise: Math.min(gross, lineDiscount),
      taxablePaise: Math.max(0, gross - Math.min(gross, lineDiscount)),
    };
  });

  const subtotalPaise = safeLines.reduce((sum, line) => sum + line.grossPaise, 0);
  const lineDiscountTotal = safeLines.reduce((sum, line) => sum + line.lineDiscountPaise, 0);
  const taxableBeforeBill = safeLines.reduce((sum, line) => sum + line.taxablePaise, 0);
  const requestedBillDiscount = Math.max(0, Math.trunc(Number(options.billDiscountPaise) || 0));
  const billDiscountPaise = Math.min(requestedBillDiscount, taxableBeforeBill);
  const allocations = allocate(
    billDiscountPaise,
    safeLines.map((line) => line.taxablePaise)
  );

  const computedLines = safeLines.map((line, index) => {
    const discountPaise = Math.min(line.grossPaise, line.lineDiscountPaise + allocations[index]);
    const taxablePaise = Math.max(0, line.grossPaise - discountPaise);
    const inclusive = Boolean(options.pricesIncludeTax);
    const taxPaise = inclusive
      ? roundHalfUp((taxablePaise * line.taxRateBp) / (10000 + line.taxRateBp))
      : roundHalfUp((taxablePaise * line.taxRateBp) / 10000);
    const netTaxablePaise = inclusive ? taxablePaise - taxPaise : taxablePaise;
    return {
      ...line,
      discountPaise,
      taxablePaise: netTaxablePaise,
      taxPaise,
      totalPaise: inclusive ? taxablePaise : taxablePaise + taxPaise,
      discountBp: line.grossPaise > 0 ? roundHalfUp((discountPaise * 10000) / line.grossPaise) : 0,
    };
  });

  const discountTotalPaise = computedLines.reduce((sum, line) => sum + line.discountPaise, 0);
  const taxPaise = computedLines.reduce((sum, line) => sum + line.taxPaise, 0);
  const netPaise = computedLines.reduce((sum, line) => sum + line.taxablePaise, 0);
  const preRoundPaise = netPaise + taxPaise;
  const rounding = options.roundToRupee === false ? { totalPaise: preRoundPaise, roundOffPaise: 0 } : roundToRupee(preRoundPaise);

  return {
    lines: computedLines,
    subtotalPaise,
    lineDiscountPaise: lineDiscountTotal,
    billDiscountPaise,
    discountTotalPaise,
    taxablePaise: netPaise,
    taxPaise,
    preRoundPaise,
    roundOffPaise: rounding.roundOffPaise,
    totalPaise: rounding.totalPaise,
    totalQuantity: computedLines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * Pick the best active automatic offer for a bill.
 * Returns null or { offer, discountPaise, reason }.
 */
export function pickBestOffer(offers, subtotalPaise, businessDate) {
  const dateKey = String(businessDate || '');
  const eligible = (offers || []).filter((offer) => {
    if (offer.status !== 'active') return false;
    if (Number(subtotalPaise) < Number(offer.minBillPaise || 0)) return false;
    if (offer.startsOn && dateKey < offer.startsOn) return false;
    if (offer.endsOn && dateKey > offer.endsOn) return false;
    return true;
  });

  const scored = eligible
    .map((offer) => {
      let discount =
        offer.discountType === 'percent'
          ? roundHalfUp((Number(subtotalPaise) * Number(offer.value)) / 10000)
          : Number(offer.value) || 0;
      if (offer.maxDiscountPaise > 0) discount = Math.min(discount, offer.maxDiscountPaise);
      discount = Math.min(discount, Number(subtotalPaise) || 0);
      return { offer, discountPaise: discount };
    })
    .filter((entry) => entry.discountPaise > 0);

  if (!scored.length) return null;
  scored.sort((a, b) => b.discountPaise - a.discountPaise || a.offer.priority - b.offer.priority || a.offer.id - b.offer.id);
  const best = scored[0];
  const label =
    best.offer.discountType === 'percent'
      ? `${best.offer.name} (${(best.offer.value / 100).toFixed(best.offer.value % 100 === 0 ? 0 : 2)}% off)`
      : `${best.offer.name} (₹${(best.offer.value / 100).toFixed(2)} off)`;
  return { offer: best.offer, discountPaise: best.discountPaise, reason: label };
}
