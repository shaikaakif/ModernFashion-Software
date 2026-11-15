export const CATEGORIES = [
  'T-shirts',
  'Hoodies',
  'Zippers',
  'Jackets',
  'Tracksuits',
  'Shackets',
  'Printed shirts',
  'Formal shirts',
  'Denim shirts',
  'Formal pants',
  'Jeans',
  'Kurta pyjama sets',
  'Shoes',
  'Leather slippers',
  'Cord sets',
];

export const CATEGORY_CODES = {
  'T-shirts': 'TS',
  Hoodies: 'HD',
  Zippers: 'ZP',
  Jackets: 'JK',
  Tracksuits: 'TR',
  Shackets: 'SK',
  'Printed shirts': 'PS',
  'Formal shirts': 'FS',
  'Denim shirts': 'DS',
  'Formal pants': 'FP',
  Jeans: 'JN',
  'Kurta pyjama sets': 'KP',
  Shoes: 'SH',
  'Leather slippers': 'LS',
  'Cord sets': 'CS',
};

export const CLOTHING_SIZES = ['M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
export const FOOTWEAR_SIZES = ['7', '8', '9', '10'];

export const COLOR_OPTIONS = [
  'Black',
  'White',
  'Navy',
  'Olive',
  'Rust',
  'Charcoal',
  'Sand',
  'Grey',
  'Brown',
  'Blue',
  'Graphite',
  'Cream',
  'Tan',
  'Green',
  'Sky',
  'Indigo',
  'Beige',
  'Ivory',
  'Maroon',
  'Sage',
  'Multi',
  'Mid Blue',
  'Light Blue',
  'Washed Blue',
  'Red Check',
  'Green Check',
  'White/Green',
  'White/Black',
];

const COLOR_CODES = {
  Black: 'BLK',
  White: 'WHT',
  Navy: 'NVY',
  Olive: 'OLV',
  Rust: 'RST',
  Charcoal: 'CHR',
  Sand: 'SND',
  Grey: 'GRY',
  Brown: 'BRN',
  Blue: 'BLU',
  Graphite: 'GRP',
  Cream: 'CRM',
  Tan: 'TAN',
  Green: 'GRN',
  Sky: 'SKY',
  Indigo: 'IND',
  Beige: 'BEI',
  Ivory: 'IVR',
  Maroon: 'MAR',
  Sage: 'SGE',
  Multi: 'MUL',
  'Mid Blue': 'MDB',
  'Light Blue': 'LTB',
  'Washed Blue': 'WSB',
  'Red Check': 'RED-CHK',
  'Green Check': 'GRN-CHK',
  'White/Green': 'WHT-GRN',
  'White/Black': 'WHT-BLK',
};

export function colorCode(color = '') {
  if (COLOR_CODES[color]) return COLOR_CODES[color];
  return color
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 8);
}

export function categoryCode(category = '') {
  return CATEGORY_CODES[category] || 'MF';
}

export function getDefaultSizes(category) {
  if (['Shoes', 'Leather slippers'].includes(category)) return [...FOOTWEAR_SIZES];
  if (['Formal shirts', 'Formal pants'].includes(category)) return [...CLOTHING_SIZES];
  if (['Jeans'].includes(category)) return ['M', 'L', 'XL', 'XXL', '3XL', '4XL'];
  if (['T-shirts', 'Printed shirts', 'Denim shirts', 'Kurta pyjama sets', 'Hoodies'].includes(category)) {
    return ['M', 'L', 'XL', 'XXL', '3XL'];
  }
  return ['M', 'L', 'XL', 'XXL'];
}

export function buildSku(category, sequence, color, size) {
  return [
    'MF',
    categoryCode(category),
    String(sequence).padStart(3, '0'),
    colorCode(color),
    String(size).replace(/\s+/g, ''),
  ].join('-');
}

export function isFootwearCategory(category) {
  return ['Shoes', 'Leather slippers'].includes(category);
}
