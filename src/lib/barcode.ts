// Self-contained Code 128 (subset B) barcode generator — no external dependency.
// Produces an SVG string that any Code 128 scanner can read.

const PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011', // index 106 = STOP
];

const START_B = 104;
const STOP = 106;

/** Encode a string into its Code128-B module pattern (string of 1s and 0s). */
function encode128B(input: string): string {
  // Restrict to printable ASCII (32..126); replace anything else with '?'.
  const chars = Array.from(input).map((c) => {
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126 ? code : 63;
  });

  let checksum = START_B;
  let modules = PATTERNS[START_B];

  chars.forEach((code, index) => {
    const value = code - 32;
    checksum += value * (index + 1);
    modules += PATTERNS[value];
  });

  modules += PATTERNS[checksum % 103];
  modules += PATTERNS[STOP];
  return modules;
}

export interface BarcodeOptions {
  moduleWidth?: number; // px per narrowest module
  height?: number; // bar height in px
  showText?: boolean; // print the human-readable value below
  quietZone?: number; // modules of white margin on each side
}

/** Generate a 12-digit numeric barcode value. */
export function generateBarcodeValue(): string {
  let value = '';
  for (let i = 0; i < 12; i += 1) value += Math.floor(Math.random() * 10);
  return value;
}

/** Build an SVG string rendering `value` as a Code128 barcode. */
export function code128SVG(value: string, options: BarcodeOptions = {}): string {
  const moduleWidth = options.moduleWidth ?? 2;
  const height = options.height ?? 70;
  const showText = options.showText ?? true;
  const quietZone = options.quietZone ?? 10;

  const safeValue = value && value.trim() ? value.trim() : '0';
  const modules = encode128B(safeValue);
  const textHeight = showText ? 18 : 0;
  const totalModules = modules.length + quietZone * 2;
  const width = totalModules * moduleWidth;
  const fullHeight = height + textHeight;

  let rects = '';
  let x = quietZone * moduleWidth;
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let run = 1;
      while (i + run < modules.length && modules[i + run] === '1') run += 1;
      rects += `<rect x="${x}" y="0" width="${run * moduleWidth}" height="${height}" fill="#000"/>`;
      x += run * moduleWidth;
      i += run;
    } else {
      x += moduleWidth;
      i += 1;
    }
  }

  const text = showText
    ? `<text x="${width / 2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="14" fill="#000" letter-spacing="2">${safeValue}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${fullHeight}" viewBox="0 0 ${width} ${fullHeight}"><rect width="${width}" height="${fullHeight}" fill="#fff"/>${rects}${text}</svg>`;
}

/** Open a print window containing the barcode(s) for the given product(s). */
export function printBarcodes(
  items: Array<{ name?: string; barcode: string }>,
  copies = 1,
): void {
  const blocks = items
    .flatMap((item) =>
      Array.from({ length: Math.max(1, copies) }).map(
        () => `
        <div class="label">
          ${item.name ? `<div class="name">${item.name}</div>` : ''}
          ${code128SVG(item.barcode, { moduleWidth: 2, height: 60 })}
        </div>`,
      ),
    )
    .join('');

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Barcode</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
      .label { display: inline-flex; flex-direction: column; align-items: center;
        page-break-inside: avoid; margin: 8px; padding: 8px; border: 1px dashed #ccc; }
      .name { font-size: 12px; font-weight: 600; margin-bottom: 4px; text-align: center; }
      @media print { .label { border: none; } }
    </style></head><body>${blocks}
    <script>window.onload = function(){ window.focus(); window.print(); };</script>
    </body></html>`);
  win.document.close();
}
