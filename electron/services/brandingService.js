import { getSetting, publicBusiness } from '../core/settings.js';
import { readLogoDataUrl } from '../core/logo.js';

/**
 * One read-only source for the shop's public identity.
 * Login, sidebar, dashboard, reports and print previews all consume this
 * shape. The logo is stored in the local assets folder and is intentionally
 * separate from the Modern Fashion POS application icon.
 */
export function createBrandingService({ db }) {
  function get() {
    const business = getSetting(db, 'business');
    const logoDataUrl = readLogoDataUrl(business.logoPath);
    return {
      ...publicBusiness(db),
      logoDataUrl,
      hasLogo: Boolean(logoDataUrl),
    };
  }

  return { get };
}
