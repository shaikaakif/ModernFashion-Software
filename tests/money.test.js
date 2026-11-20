import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, computeCartTotals, pickBestOffer, roundToRupee } from '../shared/money.js';
import { cartLineDiscountPaise } from '../shared/cart.js';

test('allocate never loses or invents paise', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(
    allocate(999, [5, 3, 2]).reduce((sum, value) => sum + value, 0),
    999
  );
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
});

test('roundToRupee follows the Indian whole-rupee convention', () => {
  assert.deepEqual(roundToRupee(40049), { totalPaise: 40000, roundOffPaise: -49 });
  assert.deepEqual(roundToRupee(40050), { totalPaise: 40100, roundOffPaise: 50 });
});

test('tax-exclusive totals charge tax on the discounted taxable value', () => {
  const totals = computeCartTotals([{ quantity: 2, unitPricePaise: 20000, taxRateBp: 500 }]);
  assert.equal(totals.subtotalPaise, 40000);
  assert.equal(totals.taxablePaise, 40000);
  assert.equal(totals.taxPaise, 2000);
  assert.equal(totals.totalPaise, 42000);
});

test('tax-inclusive totals extract tax instead of adding it', () => {
  const totals = computeCartTotals([{ quantity: 2, unitPricePaise: 20000, taxRateBp: 500 }], {
    pricesIncludeTax: true,
  });
  assert.equal(totals.taxablePaise, 38095);
  assert.equal(totals.taxPaise, 1905);
  assert.equal(totals.totalPaise, 40000);
});

test('a bill discount is allocated pro-rata before tax', () => {
  const totals = computeCartTotals(
    [
      { quantity: 1, unitPricePaise: 20000, taxRateBp: 500 },
      { quantity: 1, unitPricePaise: 30000, taxRateBp: 500 },
    ],
    { billDiscountPaise: 1000 }
  );
  assert.equal(totals.discountTotalPaise, 1000);
  assert.deepEqual(
    totals.lines.map((line) => line.discountPaise),
    [400, 600]
  );
  assert.equal(totals.taxPaise, 2450);
  assert.equal(totals.preRoundPaise, 51450);
  assert.equal(totals.totalPaise, 51500);
  assert.equal(totals.roundOffPaise, 50);
});

test('an explicit line discount pins the amount and never goes below zero', () => {
  const totals = computeCartTotals([
    { quantity: 2, unitPricePaise: 20000, taxRateBp: 0, lineDiscountBp: 5000, lineDiscountPaise: 7000 },
  ]);
  assert.equal(totals.lines[0].discountPaise, 7000);
  assert.equal(totals.lines[0].totalPaise, 33000);

  const capped = computeCartTotals([{ quantity: 1, unitPricePaise: 20000, taxRateBp: 0, lineDiscountPaise: 999999 }]);
  assert.equal(capped.lines[0].discountPaise, 20000);
  assert.equal(capped.lines[0].totalPaise, 0);

  const taxed = computeCartTotals([{ quantity: 2, unitPricePaise: 20000, taxRateBp: 500, lineDiscountPaise: 4000 }]);
  assert.equal(taxed.taxablePaise, 36000);
  assert.equal(taxed.taxPaise, 1800);
  assert.equal(taxed.totalPaise, 37800);
});

test('cart line discounts follow quantity for percent and stay fixed for rupees', () => {
  const line = { quantity: 2, unitPricePaise: 20000, discountMode: 'percent', discountValue: 10 };
  assert.equal(cartLineDiscountPaise(line), 4000);
  assert.equal(cartLineDiscountPaise({ ...line, quantity: 3 }), 6000);
  assert.equal(cartLineDiscountPaise({ ...line, discountMode: 'amount', discountValue: 100 }), 10000);
  assert.equal(cartLineDiscountPaise({ ...line, discountMode: 'amount', discountValue: 99999 }), 40000);
});

test('best offer respects dates, minimum bill and maximum cap', () => {
  const offers = [
    {
      id: 1,
      name: 'Five percent',
      discountType: 'percent',
      value: 500,
      minBillPaise: 10000,
      maxDiscountPaise: 0,
      status: 'active',
      priority: 10,
    },
    {
      id: 2,
      name: 'Expired',
      discountType: 'fixed',
      value: 5000,
      minBillPaise: 0,
      maxDiscountPaise: 0,
      startsOn: '2020-01-01',
      endsOn: '2020-12-31',
      status: 'active',
      priority: 1,
    },
    {
      id: 3,
      name: 'Capped',
      discountType: 'fixed',
      value: 5000,
      minBillPaise: 10000,
      maxDiscountPaise: 3000,
      status: 'active',
      priority: 5,
    },
  ];
  const best = pickBestOffer(offers, 40000, '2026-11-16');
  assert.equal(best.offer.id, 3);
  assert.equal(best.discountPaise, 3000);
  assert.equal(pickBestOffer(offers, 5000, '2026-11-16'), null);
});
