import { buildSku, getDefaultSizes } from '../utils/catalog.js';

export const BUSINESS_SEED = {
  name: 'Modern Fashion (Brand Hub)',
  address:
    'First Floor, City Care Medical Hall, Pillar No. 101, Attapur Ring Road, Moghal Ka Nala, Hyderabad, Telangana, India.',
  phones: ['7093230999', '9700302101', '9700207830', '9346777715', '9966921905'],
  instagram: 'https://www.instagram.com/modern_fashion_brand_hub/',
  website: 'https://h-id.vyaparify.com/modern-fashion-brand-hub',
  taxPercent: 5,
  currency: 'INR',
};

const PRODUCT_DEFS = [
  ['Oversized Cotton Tee', 'T-shirts', ['Black', 'White'], 380, 799],
  ['Acid Wash Graphic Tee', 'T-shirts', ['Olive', 'Charcoal'], 420, 899],
  ['Classic Crew Neck Tee', 'T-shirts', ['White', 'Navy'], 260, 599],
  ['Drop-Shoulder Street Tee', 'T-shirts', ['Rust', 'Black'], 460, 999],
  ['Fleece Pullover Hoodie', 'Hoodies', ['Black', 'Sand'], 850, 1799],
  ['Heavyweight Zip Hoodie', 'Hoodies', ['Grey', 'Navy'], 1040, 2199],
  ['Desert Graphic Hoodie', 'Hoodies', ['Brown', 'Black'], 940, 1999],
  ['Utility Bomber Jacket', 'Jackets', ['Olive', 'Black'], 1450, 2999],
  ['Puffer Jacket', 'Jackets', ['Black', 'Grey'], 1820, 3799],
  ['Denim Trucker Jacket', 'Jackets', ['Blue', 'Washed Blue'], 1260, 2599],
  ['Tech Fleece Zipper', 'Zippers', ['Black', 'Graphite'], 760, 1599],
  ['Ribbed Zip-Up', 'Zippers', ['Cream', 'Black'], 710, 1499],
  ['Core Tracksuit Set', 'Tracksuits', ['Navy', 'Black'], 1240, 2599],
  ['Court Tracksuit Set', 'Tracksuits', ['Grey', 'Olive'], 1450, 2899],
  ['Corduroy Shacket', 'Shackets', ['Tan', 'Brown'], 1150, 2399],
  ['Flannel Overshirt', 'Shackets', ['Red Check', 'Green Check'], 960, 1999],
  ['Botanical Print Shirt', 'Printed shirts', ['White', 'Blue'], 570, 1299],
  ['Abstract Resort Shirt', 'Printed shirts', ['Multi', 'Black'], 620, 1399],
  ['Oxford Formal Shirt', 'Formal shirts', ['White', 'Sky'], 650, 1499],
  ['Slim-Fit Formal Shirt', 'Formal shirts', ['Black', 'Grey'], 700, 1599],
  ['Light Wash Denim Shirt', 'Denim shirts', ['Blue', 'Indigo'], 760, 1699],
  ['Black Wash Denim Shirt', 'Denim shirts', ['Black', 'Charcoal'], 800, 1799],
  ['Tailored Formal Trouser', 'Formal pants', ['Black', 'Navy'], 710, 1599],
  ['Pleated Formal Trouser', 'Formal pants', ['Grey', 'Beige'], 760, 1699],
  ['Straight-Fit Jeans', 'Jeans', ['Mid Blue', 'Black'], 850, 1899],
  ['Relaxed Baggy Jeans', 'Jeans', ['Light Blue', 'Grey'], 940, 2099],
  ['Festive Kurta Pyjama Set', 'Kurta pyjama sets', ['Ivory', 'Maroon'], 1150, 2499],
  ['Embroidered Kurta Set', 'Kurta pyjama sets', ['Sage', 'Navy'], 1320, 2799],
  ['Everyday Sneakers', 'Shoes', ['White', 'Black'], 480, 799],
  ['Retro Court Shoes', 'Shoes', ['White/Green', 'Tan'], 720, 1499],
  ['Leather Slide Slippers', 'Leather slippers', ['Tan', 'Black'], 320, 699],
  ['Cushioned Leather Slippers', 'Leather slippers', ['Brown', 'Olive'], 370, 799],
  ['Terry Cord Set', 'Cord sets', ['Sage', 'Beige'], 1120, 2399],
  ['Luxe Cord Set', 'Cord sets', ['Black', 'Sand'], 1420, 2999],
];

const CUSTOMER_DEFS = [
  ['Aarav Mehta', '9849022331', 'aarav.mehta@example.com', 'Mehdipatnam, Hyderabad'],
  ['Sana Parveen', '9700311882', 'sana.parveen@example.com', 'Attapur, Hyderabad'],
  ['Rohan Kulkarni', '9866145210', 'rohan.kulkarni@example.com', 'Tolichowki, Hyderabad'],
  ['Fatima Begum', '9966977452', 'fatima.begum@example.com', 'Rajendranagar, Hyderabad'],
  ['Karthik Reddy', '9000031876', 'karthik.reddy@example.com', 'Gachibowli, Hyderabad'],
  ['Neha Agarwal', '9849566321', 'neha.agarwal@example.com', 'Banjara Hills, Hyderabad'],
  ['Imran Qureshi', '9700278965', 'imran.qureshi@example.com', 'Moghalpura, Hyderabad'],
  ['Divya Nair', '9989723456', 'divya.nair@example.com', 'Kondapur, Hyderabad'],
  ['Sameer Rao', '9959011234', 'sameer.rao@example.com', 'Attapur, Hyderabad'],
  ['Ayesha Siddiqui', '9346755678', 'ayesha.siddiqui@example.com', 'Charminar, Hyderabad'],
  ['Vikram Singh', '9866190012', 'vikram.singh@example.com', 'Jubilee Hills, Hyderabad'],
  ['Meera Joshi', '9490034567', 'meera.joshi@example.com', 'Langar Houz, Hyderabad'],
];

const SUPPLIER_DEFS = [
  ['Weave & Co. Textiles', 'Imran Shaikh', '9849011221', 'Begum Bazaar, Hyderabad', 'Cotton tees and shirting'],
  ['Deccan Denim Works', 'Sana Reddy', '9000045321', 'Secunderabad, Telangana', 'Denim and casual wear'],
  ['Nook Fashion Wholesale', 'Vikram Jain', '9866178453', 'Koti, Hyderabad', 'Hoodies and winterwear'],
  ['Hyderabad Footwear Depot', 'Rakesh Kumar', '9959024680', 'Chikkadpally, Hyderabad', 'Footwear and slippers'],
  ['Attapur Garment House', 'Mehreen Fatima', '9100077231', 'Attapur, Hyderabad', 'Ethnic and cord sets'],
];

const LOW_STOCK_PRODUCTS = [2, 8, 12, 18, 23, 29, 32];
const LOW_STOCK_VALUES = [4, 2, 0, 5, 3];

function seedStock(index, colorIndex, sizeIndex) {
  const normal = 7 + ((index * 7 + colorIndex * 5 + sizeIndex * 3) % 24);
  if (LOW_STOCK_PRODUCTS.includes(index) && (colorIndex * 4 + sizeIndex) % 5 === 0) {
    return LOW_STOCK_VALUES[(index + colorIndex + sizeIndex) % LOW_STOCK_VALUES.length];
  }
  return normal;
}

function at(daysAgo, hour = 11, minute = 15) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function buildProducts() {
  const counters = {};
  const products = [];
  let barcodeSeq = 0;

  PRODUCT_DEFS.forEach((def, index) => {
    const [name, category, colors, purchasePrice, sellingPrice] = def;
    counters[category] = (counters[category] || 0) + 1;
    const sequence = counters[category];
    const sizes = getDefaultSizes(category);
    const productId = `prd_${String(index + 1).padStart(2, '0')}`;
    const variants = [];

    colors.forEach((color, colorIndex) => {
      sizes.forEach((size, sizeIndex) => {
        barcodeSeq += 1;
        const variantNumber = colorIndex * sizes.length + sizeIndex + 1;
        const stock = seedStock(index, colorIndex, sizeIndex);
        variants.push({
          id: `${productId}_v${String(variantNumber).padStart(2, '0')}`,
          sku: buildSku(category, sequence, color, size),
          barcode: `MF${String(barcodeSeq).padStart(7, '0')}`,
          color,
          size,
          purchasePrice,
          sellingPrice,
          stock,
          lowStockThreshold: 5,
        });
      });
    });

    products.push({
      id: productId,
      name,
      category,
      description: `${name} from the Modern Fashion Brand Hub collection. Retail-ready demo product.`,
      colors,
      sizes,
      purchasePrice,
      sellingPrice,
      status: 'Active',
      createdAt: at(120 - index * 2, 10, 0),
      variants,
    });
  });

  return { products, barcodeSeq };
}

function invoiceItem(product, variantIndex, qty) {
  const variant = product.variants[variantIndex % product.variants.length];
  const lineTotal = variant.sellingPrice * qty;
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    category: product.category,
    color: variant.color,
    size: variant.size,
    sku: variant.sku,
    barcode: variant.barcode,
    qty,
    unitPrice: variant.sellingPrice,
    lineTotal,
  };
}

const INVOICE_DEFS = [
  { customer: 0, daysAgo: 0, hour: 10, items: [[28, 0, 1], [0, 1, 1]], status: 'Paid', method: 'UPI', discount: 50 },
  { customer: 1, daysAgo: 0, hour: 12, items: [[4, 2, 1]], status: 'Paid', method: 'Card', discount: 0 },
  { customer: 2, daysAgo: 0, hour: 16, items: [[24, 3, 1], [16, 0, 1]], status: 'Partial', method: 'Cash', discount: 100, paidRatio: 0.6 },
  { customer: 3, daysAgo: 1, hour: 13, items: [[30, 1, 1]], status: 'Paid', method: 'UPI', discount: 0 },
  { customer: 4, daysAgo: 2, hour: 17, items: [[12, 2, 1], [10, 4, 1]], status: 'Partial', method: 'Card', discount: 150, paidRatio: 0.5 },
  { customer: 5, daysAgo: 3, hour: 11, items: [[18, 0, 1]], status: 'Unpaid', method: 'Cash', discount: 0 },
  { customer: 6, daysAgo: 5, hour: 15, items: [[7, 1, 1], [2, 2, 2]], status: 'Paid', method: 'UPI', discount: 200 },
  { customer: 7, daysAgo: 7, hour: 12, items: [[26, 0, 1]], status: 'Paid', method: 'Card', discount: 0 },
  { customer: 8, daysAgo: 9, hour: 18, items: [[14, 1, 1], [20, 2, 1]], status: 'Partial', method: 'UPI', discount: 50, paidRatio: 0.7 },
  { customer: 9, daysAgo: 12, hour: 10, items: [[32, 0, 1]], status: 'Paid', method: 'Cash', discount: 0 },
  { customer: 10, daysAgo: 15, hour: 14, items: [[5, 3, 1]], status: 'Unpaid', method: 'Card', discount: 0 },
  { customer: 11, daysAgo: 18, hour: 12, items: [[22, 0, 2], [18, 2, 1]], status: 'Paid', method: 'UPI', discount: 100 },
  { customer: 0, daysAgo: 22, hour: 16, items: [[27, 1, 1]], status: 'Paid', method: 'Card', discount: 0 },
  { customer: 3, daysAgo: 26, hour: 11, items: [[29, 0, 1], [31, 1, 1]], status: 'Partial', method: 'Cash', discount: 0, paidRatio: 0.4 },
  { customer: 6, daysAgo: 30, hour: 13, items: [[8, 0, 1]], status: 'Paid', method: 'UPI', discount: 250 },
];

function buildInvoices(products) {
  return INVOICE_DEFS.map((def, index) => {
    const items = def.items.map(([p, v, qty]) => invoiceItem(products[p], v, qty));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = Math.min(def.discount || 0, subtotal);
    const taxPercent = 5;
    const taxAmount = Math.round((subtotal - discount) * taxPercent) / 100;
    const total = subtotal - discount + taxAmount;
    const paid = def.status === 'Paid' ? total : def.status === 'Partial' ? Math.round(total * (def.paidRatio || 0.5)) : 0;
    const customer = CUSTOMER_DEFS[def.customer];
    return {
      id: `inv_seed_${String(index + 1).padStart(2, '0')}`,
      number: `INV-${1001 + index}`,
      customerId: `cus_${String(def.customer + 1).padStart(2, '0')}`,
      customerName: customer[0],
      customerPhone: customer[1],
      date: at(def.daysAgo, def.hour),
      items,
      subtotal,
      discount,
      taxPercent,
      taxAmount,
      total,
      amountPaid: paid,
      balance: total - paid,
      paymentStatus: def.status,
      paymentMethod: def.method,
      notes: 'Sample invoice generated for the Modern Fashion demo.',
      createdAt: at(def.daysAgo, def.hour),
    };
  });
}

const PURCHASE_DEFS = [
  { supplier: 0, daysAgo: 0, items: [[0, 0, 12], [1, 1, 8]] },
  { supplier: 1, daysAgo: 1, items: [[24, 0, 10], [25, 1, 6], [9, 1, 4]] },
  { supplier: 2, daysAgo: 4, items: [[4, 2, 8], [5, 1, 6]] },
  { supplier: 3, daysAgo: 6, items: [[28, 0, 10], [29, 1, 8], [30, 0, 12]] },
  { supplier: 4, daysAgo: 10, items: [[26, 0, 6], [27, 1, 5]] },
  { supplier: 0, daysAgo: 14, items: [[16, 0, 14], [17, 1, 10], [18, 0, 8]] },
  { supplier: 2, daysAgo: 19, items: [[10, 1, 10], [11, 0, 8]] },
  { supplier: 1, daysAgo: 24, items: [[20, 0, 9], [21, 1, 7], [22, 0, 6]] },
  { supplier: 3, daysAgo: 31, items: [[31, 1, 10], [29, 0, 6]] },
  { supplier: 4, daysAgo: 40, items: [[32, 0, 8], [33, 1, 6]] },
];

function buildPurchases(products) {
  return PURCHASE_DEFS.map((def, index) => {
    const supplier = SUPPLIER_DEFS[def.supplier];
    const items = def.items.map(([p, v, qty]) => {
      const product = products[p];
      const variant = product.variants[v % product.variants.length];
      return {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        category: product.category,
        color: variant.color,
        size: variant.size,
        sku: variant.sku,
        qty,
        unitCost: variant.purchasePrice,
        lineTotal: variant.purchasePrice * qty,
      };
    });
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    return {
      id: `pur_seed_${String(index + 1).padStart(2, '0')}`,
      reference: `PUR-${2001 + index}`,
      supplierId: `sup_${String(def.supplier + 1).padStart(2, '0')}`,
      supplierName: supplier[0],
      supplierPhone: supplier[2],
      date: at(def.daysAgo, 9, 30),
      items,
      total,
      status: 'Received',
      notes: 'Sample stock purchase for the demo.',
      createdAt: at(def.daysAgo, 9, 30),
    };
  });
}

function buildMovements(invoices, purchases, products) {
  const variantLookup = new Map();
  products.forEach((product) => product.variants.forEach((variant) => variantLookup.set(variant.id, { product, variant })));
  const movements = [];

  purchases.forEach((purchase) => {
    purchase.items.forEach((item, idx) => {
      movements.push({
        id: `mov_p_${purchase.id}_${idx}`,
        date: purchase.date,
        type: 'purchase',
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        variantLabel: `${item.color} / ${item.size}`,
        sku: item.sku,
        qtyChange: item.qty,
        balanceAfter: null,
        reference: purchase.reference,
        note: `Stock received from ${purchase.supplierName}`,
      });
    });
  });

  invoices.forEach((invoice) => {
    invoice.items.forEach((item, idx) => {
      const found = variantLookup.get(item.variantId);
      movements.push({
        id: `mov_s_${invoice.id}_${idx}`,
        date: invoice.date,
        type: 'sale',
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        variantLabel: `${item.color} / ${item.size}`,
        sku: item.sku,
        qtyChange: -item.qty,
        balanceAfter: found ? found.variant.stock : null,
        reference: invoice.number,
        note: `Sold to ${invoice.customerName}`,
      });
    });
  });

  return movements.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function createSeedData() {
  const { products, barcodeSeq } = buildProducts();
  const customers = CUSTOMER_DEFS.map(([name, phone, email, address], index) => ({
    id: `cus_${String(index + 1).padStart(2, '0')}`,
    name,
    phone,
    email,
    address,
    createdAt: at(160 - index * 4, 10, 0),
  }));
  const suppliers = SUPPLIER_DEFS.map(([name, contactPerson, phone, address, note], index) => ({
    id: `sup_${String(index + 1).padStart(2, '0')}`,
    name,
    contactPerson,
    phone,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`,
    address,
    note,
  }));
  const invoices = buildInvoices(products);
  const purchases = buildPurchases(products);
  const movements = buildMovements(invoices, purchases, products);

  return {
    version: 1,
    demo: true,
    business: { ...BUSINESS_SEED, phones: [...BUSINESS_SEED.phones] },
    products,
    customers,
    suppliers,
    invoices,
    purchases,
    movements,
    meta: {
      barcodeSeq,
      invoiceSeq: 1015,
      purchaseSeq: 2010,
      seededAt: new Date().toISOString(),
    },
  };
}
