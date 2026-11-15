import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeSvg({
  value,
  height = 46,
  width = 1.5,
  fontSize = 12,
  displayValue = true,
  className = '',
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize,
        margin: 4,
        lineColor: '#1d1d1f',
        background: 'transparent',
        font: 'Inter, Segoe UI, sans-serif',
      });
    } catch (error) {
      console.warn('Barcode could not be rendered', error);
    }
  }, [value, height, width, fontSize, displayValue]);

  if (!value) return <span className="barcode-missing">Not assigned</span>;
  return <svg ref={ref} className={`barcode-svg ${className}`} role="img" aria-label={`Code 128 barcode ${value}`} />;
}
