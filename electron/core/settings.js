import { DEFAULT_SETTINGS } from './database.js';
import { nowIso } from './validation.js';
import { fail } from './errors.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  const fallback = DEFAULT_SETTINGS[key] ? clone(DEFAULT_SETTINGS[key]) : {};
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !Array.isArray(fallback)) {
      return { ...fallback, ...parsed };
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function getAllSettings(db) {
  const result = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) result[key] = getSetting(db, key);
  return result;
}

export function saveSetting(db, key, value, userId = null) {
  if (!DEFAULT_SETTINGS[key]) fail(`Unknown settings section: ${key}.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Settings must be an object.');
  const merged = { ...getSetting(db, key), ...value };
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(key, JSON.stringify(merged), nowIso(), userId);
  return merged;
}

export function publicBusiness(db) {
  const business = getSetting(db, 'business');
  const tax = getSetting(db, 'tax');
  return {
    ...business,
    gstin: tax.gstin || business.gstin || '',
    legalName: tax.legalName || business.legalName || '',
    taxEnabled: Boolean(tax.enabled),
    invoiceTitle: tax.enabled ? tax.invoiceTitle || 'Tax Invoice' : 'Invoice',
  };
}

export function businessDisplayName(db) {
  return getSetting(db, 'business').name || 'MODERN FASHION';
}
