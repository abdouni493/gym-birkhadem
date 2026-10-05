import React from 'react';
import { code128SVG, BarcodeOptions } from '@/lib/barcode';

interface BarcodeProps extends BarcodeOptions {
  value: string;
  className?: string;
}

/** Renders a Code128 barcode as inline SVG. */
export const Barcode: React.FC<BarcodeProps> = ({ value, className, ...options }) => {
  if (!value) return null;
  const svg = code128SVG(value, options);
  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
