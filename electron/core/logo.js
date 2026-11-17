import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

export function readLogoDataUrl(logoPath) {
  if (!logoPath || !fs.existsSync(logoPath)) return '';
  const mime = MIME[path.extname(logoPath).toLowerCase()];
  if (!mime) return '';
  try {
    const stat = fs.statSync(logoPath);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) return '';
    return `data:${mime};base64,${fs.readFileSync(logoPath).toString('base64')}`;
  } catch {
    return '';
  }
}
