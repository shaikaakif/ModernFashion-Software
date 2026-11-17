import { useSession } from './SessionContext';

/**
 * Central business-logo mark. Reads the same branding payload everywhere and
 * falls back to the MF initials when no logo is configured.
 */
export default function BrandMark({ size = 38, className = '' }) {
  const { branding } = useSession();
  if (branding?.logoDataUrl) {
    return (
      <span
        className={`brand-logo-frame ${className}`}
        style={{ height: size, minWidth: size, padding: Math.max(2, Math.round(size * 0.06)) }}
        title={branding.name || 'Business logo'}
      >
        <img
          src={branding.logoDataUrl}
          alt={branding.name ? `${branding.name} logo` : 'Business logo'}
          style={{ maxHeight: '100%', maxWidth: Math.round(size * 3) }}
        />
      </span>
    );
  }
  return (
    <span
      className={`brand-mark ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }}
      aria-label="Modern Fashion"
    >
      MF
    </span>
  );
}
