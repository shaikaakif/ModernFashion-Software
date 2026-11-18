/**
 * Code 128-B/C encoder producing an inline SVG. Long numeric runs use Code C
 * so internal barcodes print with fewer bars and a wider module for the same
 * label width. Code 128-B remains for letters and punctuation.
 */

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const STOP = 106;

function encodeCode128B(value) {
  const text = String(value || '');
  if (!text) throw new Error('Barcode value is empty.');
  const symbols = [];
  let checksum = 0;
  let mode = 'B';
  let index = 0;

  const startB = 104;
  const startC = 105;
  const codeB = 100;
  const codeC = 99;

  const leadingDigits = text.match(/^\d+/)?.[0]?.length || 0;
  if (leadingDigits >= 4 && leadingDigits % 2 === 0) {
    symbols.push(startC);
    checksum = startC;
    mode = 'C';
  } else {
    symbols.push(startB);
    checksum = startB;
  }

  const add = (symbol) => {
    symbols.push(symbol);
    checksum += symbol * (symbols.length - 1);
  };

  while (index < text.length) {
    const character = text[index];
    const code = character.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error('Code 128-B supports printable ASCII only.');
    if (mode === 'C') {
      if (/\d/.test(character) && /\d/.test(text[index + 1] || '')) {
        add(Number(`${character}${text[index + 1]}`));
        index += 2;
        continue;
      }
      add(codeB);
      mode = 'B';
      continue;
    }

    const run = text.slice(index).match(/^\d+/)?.[0]?.length || 0;
    if (run >= 4) {
      if (run % 2 === 1) {
        add(code - 32);
        index += 1;
        continue;
      }
      add(codeC);
      mode = 'C';
      continue;
    }
    add(code - 32);
    index += 1;
  }

  symbols.push(checksum % 103);
  symbols.push(STOP);
  return symbols;
}

export function code128Svg(value, { moduleWidth = 2, height = 46, quietZone = 10, showText = true } = {}) {
  const codes = encodeCode128B(value);
  const widths = codes.map((code) => PATTERNS[code]);
  let x = quietZone;
  const bars = [];
  for (const pattern of widths) {
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]) * moduleWidth;
      if (i % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000" />`);
      }
      x += width;
    }
  }
  const totalWidth = x + quietZone;
  const textHeight = showText ? 14 : 0;
  const text = showText
    ? `<text x="${totalWidth / 2}" y="${height + 12}" font-family="Consolas, monospace" font-size="11" text-anchor="middle" fill="#000">${escapeHtml(
        value
      )}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height + textHeight}" viewBox="0 0 ${totalWidth} ${
    height + textHeight
  }" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeHtml(value)}">${bars.join('')}${text}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { escapeHtml };
