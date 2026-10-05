import { formatDZD } from './utils';

// Minimal structural types for printing — decoupled from any data layer.
// Callers pass compatible objects (camelCase legacy shape) built from Supabase rows.
interface PurchaseInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  totalAmount: number;
  amountPaid: number;
  notes?: string;
  items: { productName: string; quantity: number; purchasePrice: number }[];
}
interface Supplier {
  name: string;
  phone?: string | null;
  address?: string | null;
}
interface StoreSettings {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  nif?: string;
  nis?: string;
  article?: string;
  rc?: string;
  logo?: string;
}

interface PrintLabels {
  purchaseInvoice: string;
  invoiceNo: string;
  date: string;
  supplier: string;
  phone: string;
  address: string;
  product: string;
  quantity: string;
  unitPrice: string;
  total: string;
  subtotal: string;
  paid: string;
  remaining: string;
  grandTotal: string;
  supplierSignature: string;
  receiverSignature: string;
  notes: string;
}

const escapeHtml = (value: string | undefined | null): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });

/** Open a print window with a professional A4 purchase invoice. */
export function printPurchaseInvoice(
  invoice: PurchaseInvoice,
  supplier: Supplier | undefined,
  store: StoreSettings | undefined,
  labels: PrintLabels,
  dir: 'ltr' | 'rtl' = 'ltr',
): void {
  const storeName = escapeHtml(store?.name || 'GYM');
  const storeLines = [
    store?.address ? escapeHtml(store.address) : '',
    store?.phone ? `${escapeHtml(labels.phone)}: ${escapeHtml(store.phone)}` : '',
    store?.email ? escapeHtml(store.email) : '',
  ].filter(Boolean).join('<br/>');

  const fiscalLines = [
    store?.nif ? `NIF: ${escapeHtml(store.nif)}` : '',
    store?.nis ? `NIS: ${escapeHtml(store.nis)}` : '',
    store?.article ? `Art: ${escapeHtml(store.article)}` : '',
    store?.rc ? `RC: ${escapeHtml(store.rc)}` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  const rows = invoice.items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="left">${escapeHtml(item.productName)}</td>
      <td>${item.quantity}</td>
      <td class="right">${formatDZD(item.purchasePrice)}</td>
      <td class="right">${formatDZD(item.quantity * item.purchasePrice)}</td>
    </tr>`).join('');

  const remaining = invoice.totalAmount - (invoice.amountPaid || 0);
  const logo = store?.logo
    ? `<img src="${store.logo}" alt="logo" style="max-height:70px;max-width:140px;object-fit:contain;"/>`
    : '';

  const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"/>
  <title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 3px solid #c9a227; padding-bottom: 16px; }
    .store h1 { margin: 0 0 4px; font-size: 26px; color: #c9a227; }
    .store p { margin: 2px 0; font-size: 12px; color: #444; }
    .fiscal { font-size: 11px; color: #666; margin-top: 6px; }
    .doc { text-align: ${dir === 'rtl' ? 'left' : 'right'}; }
    .doc h2 { margin: 0 0 8px; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .doc p { margin: 2px 0; font-size: 13px; }
    .parties { margin: 24px 0; padding: 14px 18px; background: #faf6e9; border: 1px solid #ecdfb0; border-radius: 6px; }
    .parties h3 { margin: 0 0 6px; font-size: 13px; color: #c9a227; text-transform: uppercase; }
    .parties p { margin: 2px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #c9a227; color: #fff; padding: 10px 8px; font-size: 12px; text-align: center; }
    td { padding: 9px 8px; font-size: 13px; border-bottom: 1px solid #eee; text-align: center; }
    td.left { text-align: ${dir === 'rtl' ? 'right' : 'left'}; }
    td.right { text-align: ${dir === 'rtl' ? 'left' : 'right'}; }
    .totals { margin-top: 18px; width: 280px; margin-${dir === 'rtl' ? 'right' : 'left'}: auto; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 14px; }
    .totals .grand { border-top: 2px solid #c9a227; font-weight: 700; font-size: 16px; color: #c9a227; }
    .signatures { display: flex; justify-content: space-between; margin-top: 70px; }
    .sign { width: 40%; text-align: center; border-top: 1px solid #999; padding-top: 6px; font-size: 12px; }
    .notes { margin-top: 24px; font-size: 12px; color: #555; }
    @media print { body { padding: 0; } }
  </style></head><body>
    <div class="header">
      <div class="store">
        ${logo}
        <h1>${storeName}</h1>
        <p>${storeLines}</p>
        ${fiscalLines ? `<p class="fiscal">${fiscalLines}</p>` : ''}
      </div>
      <div class="doc">
        <h2>${escapeHtml(labels.purchaseInvoice)}</h2>
        <p><strong>${escapeHtml(labels.invoiceNo)}:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
        <p><strong>${escapeHtml(labels.date)}:</strong> ${escapeHtml(invoice.invoiceDate)}</p>
      </div>
    </div>

    <div class="parties">
      <h3>${escapeHtml(labels.supplier)}</h3>
      <p><strong>${escapeHtml(supplier?.name || invoice.supplierName)}</strong></p>
      ${supplier?.phone ? `<p>${escapeHtml(labels.phone)}: ${escapeHtml(supplier.phone)}</p>` : ''}
      ${supplier?.address ? `<p>${escapeHtml(labels.address)}: ${escapeHtml(supplier.address)}</p>` : ''}
    </div>

    <table>
      <thead><tr>
        <th>#</th><th>${escapeHtml(labels.product)}</th><th>${escapeHtml(labels.quantity)}</th>
        <th>${escapeHtml(labels.unitPrice)}</th><th>${escapeHtml(labels.total)}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>${escapeHtml(labels.subtotal)}</span><span>${formatDZD(invoice.totalAmount)}</span></div>
      <div class="row"><span>${escapeHtml(labels.paid)}</span><span>${formatDZD(invoice.amountPaid || 0)}</span></div>
      <div class="row"><span>${escapeHtml(labels.remaining)}</span><span>${formatDZD(remaining)}</span></div>
      <div class="row grand"><span>${escapeHtml(labels.grandTotal)}</span><span>${formatDZD(invoice.totalAmount)}</span></div>
    </div>

    ${invoice.notes ? `<div class="notes"><strong>${escapeHtml(labels.notes)}:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}

    <div class="signatures">
      <div class="sign">${escapeHtml(labels.supplierSignature)}</div>
      <div class="sign">${escapeHtml(labels.receiverSignature)}</div>
    </div>

    <script>window.onload = function(){ window.focus(); window.print(); };</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
