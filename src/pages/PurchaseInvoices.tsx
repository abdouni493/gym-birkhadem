import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Eye, Search, DollarSign, Package, Calendar, Printer, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { Product, listProducts } from '@/lib/api/products';
import { Supplier, listSuppliers, createSupplier, getStoreSettings } from '@/lib/api/misc';
import {
  PurchaseInvoice, NewPurchaseLine, listPurchaseInvoices, createPurchase, updatePurchaseHeader,
  payPurchase, deletePurchase,
} from '@/lib/api/purchases';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { ViewToggle, ViewMode } from '@/components/common/ViewToggle';
import { printPurchaseInvoice } from '@/lib/print';

interface LineItem {
  product_id: string;
  product_name: string;
  barcode: string | null;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number | null;
  expiry_date: string | null;
}

export const PurchaseInvoices: React.FC = () => {
  const { can } = usePermissions();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'pending'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [expiryEnabled, setExpiryEnabled] = useState<Record<string, boolean>>({});
  const [supplierId, setSupplierId] = useState('');
  const [amountToPay, setAmountToPay] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);

  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', address: '' });

  const [detailsInvoice, setDetailsInvoice] = useState<PurchaseInvoice | null>(null);
  const [payTarget, setPayTarget] = useState<PurchaseInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [toDelete, setToDelete] = useState<PurchaseInvoice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, prod, sup] = await Promise.all([listPurchaseInvoices(), listProducts(), listSuppliers()]);
      setInvoices(inv); setProducts(prod); setSuppliers(sup);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => items.reduce((s, it) => s + it.quantity * it.purchase_price, 0), [items]);

  const resetForm = () => {
    setEditingId(null); setItems([]); setExpiryEnabled({}); setSupplierId('');
    setAmountToPay(''); setNotes(''); setProductSearch(''); setShowProductDropdown(false);
    setAddingSupplier(false); setNewSupplier({ name: '', phone: '', address: '' });
  };

  const openCreate = () => { resetForm(); setFormOpen(true); };

  const openEdit = (inv: PurchaseInvoice) => {
    resetForm();
    setEditingId(inv.id);
    const lines = (inv.purchase_invoice_items ?? []).map((it) => ({
      product_id: it.product_id ?? '', product_name: it.product_name, barcode: it.barcode,
      quantity: it.quantity, purchase_price: it.purchase_price, selling_price: it.selling_price,
      min_stock_level: it.min_stock_level, expiry_date: it.expiry_date,
    }));
    setItems(lines);
    setExpiryEnabled(Object.fromEntries(lines.map((it) => [it.product_id, !!it.expiry_date])));
    setSupplierId(inv.supplier_id ?? '');
    setAmountToPay(String(inv.amount_paid ?? inv.total_amount));
    setNotes(inv.notes ?? '');
    setFormOpen(true);
  };

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)).slice(0, 8);
  }, [productSearch, products]);

  const addProductLine = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === product.id);
      if (existing) return prev.map((it) => it.product_id === product.id ? { ...it, quantity: it.quantity + 1 } : it);
      return [...prev, {
        product_id: product.id, product_name: product.name, barcode: product.barcode,
        quantity: 1, min_stock_level: product.min_stock_level, purchase_price: product.real_price,
        selling_price: product.sell_price, expiry_date: product.expiry_date,
      }];
    });
    setExpiryEnabled((prev) => ({ ...prev, [product.id]: prev[product.id] ?? !!product.expiry_date }));
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateLine = (productId: string, field: keyof LineItem, value: string) => {
    setItems((prev) => prev.map((it) => it.product_id === productId
      ? { ...it, [field]: field === 'expiry_date' ? value : Number(value) } : it));
  };

  const toggleExpiry = (productId: string, enabled: boolean) => {
    setExpiryEnabled((prev) => ({ ...prev, [productId]: enabled }));
    if (!enabled) setItems((prev) => prev.map((it) => it.product_id === productId ? { ...it, expiry_date: null } : it));
  };

  const removeLine = (productId: string) => setItems((prev) => prev.filter((it) => it.product_id !== productId));

  const handleProductCreated = async () => {
    // Refresh the product list; the newly created one can then be searched/added.
    try { setProducts(await listProducts()); } catch { /* ignore */ }
  };

  const handleCreateSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    try {
      const s = await createSupplier(newSupplier);
      setSuppliers((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(s.id);
      setAddingSupplier(false);
      setNewSupplier({ name: '', phone: '', address: '' });
      toast({ title: 'Supplier created' });
    } catch (e) {
      toast({ title: 'Could not create supplier', description: describeError(e), variant: 'destructive' });
    }
  };

  const save = async () => {
    if (items.length === 0) { toast({ title: 'Add at least one product', variant: 'destructive' }); return; }
    if (!supplierId) { toast({ title: 'Select a supplier', variant: 'destructive' }); return; }
    const paid = amountToPay === '' ? total : Number(amountToPay);
    setSaving(true);
    try {
      if (editingId) {
        await updatePurchaseHeader(editingId, { supplier_id: supplierId, total, amount_paid: paid, notes });
        toast({ title: 'Purchase updated' });
      } else {
        await createPurchase({
          supplier_id: supplierId, total, amount_paid: paid, notes,
          items: items.map<NewPurchaseLine>((it) => ({
            product_id: it.product_id, product_name: it.product_name, barcode: it.barcode,
            quantity: it.quantity, purchase_price: it.purchase_price, selling_price: it.selling_price,
            min_stock_level: it.min_stock_level, expiry_date: expiryEnabled[it.product_id] ? it.expiry_date : null,
          })),
        });
        toast({ title: 'Purchase recorded' });
      }
      setFormOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast({ title: 'Could not save purchase', description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deletePurchase(toDelete.id);
      toast({ title: 'Purchase deleted' });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const doPay = async () => {
    if (!payTarget) return;
    const amount = Number(payAmount) || 0;
    if (amount <= 0) { toast({ title: 'Invalid amount', variant: 'destructive' }); return; }
    try {
      await payPurchase(payTarget, amount);
      toast({ title: 'Payment recorded' });
      setPayTarget(null); setPayAmount('');
      await load();
    } catch (e) {
      toast({ title: 'Could not record payment', description: describeError(e), variant: 'destructive' });
    }
  };

  const handlePrint = async (inv: PurchaseInvoice) => {
    try {
      const store = await getStoreSettings();
      const supplier = inv.suppliers;
      // Adapt Supabase rows to the shape the (legacy) print helper expects.
      const legacyInvoice = {
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        supplierName: supplier?.name ?? '',
        totalAmount: inv.total_amount,
        amountPaid: inv.amount_paid,
        notes: inv.notes ?? '',
        items: (inv.purchase_invoice_items ?? []).map((it) => ({
          productName: it.product_name, quantity: it.quantity, purchasePrice: it.purchase_price,
        })),
      };
      const legacyStore = store ? { ...store, logo: store.logo_url } : undefined;
      printPurchaseInvoice(legacyInvoice as never, (supplier as never) ?? undefined, legacyStore as never, {
        purchaseInvoice: 'Purchase invoice', invoiceNo: 'Invoice', date: 'Date', supplier: 'Supplier',
        phone: 'Phone', address: 'Address', product: 'Product', quantity: 'Qty', unitPrice: 'Unit price',
        total: 'Total', subtotal: 'Subtotal', paid: 'Paid', remaining: 'Remaining', grandTotal: 'Grand total',
        supplierSignature: 'Supplier signature', receiverSignature: 'Receiver signature', notes: 'Notes',
      });
    } catch (e) {
      toast({ title: 'Could not print', description: describeError(e), variant: 'destructive' });
    }
  };

  const filtered = useMemo(() => invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || inv.invoice_number.toLowerCase().includes(q) || (inv.suppliers?.name ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [invoices, search, statusFilter]);

  const totalAmount = useMemo(() => invoices.reduce((s, i) => s + i.total_amount, 0), [invoices]);
  const pendingAmount = useMemo(() => invoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0), [invoices]);

  const statusBadge = (status: PurchaseInvoice['status']) => {
    if (status === 'paid') return <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">paid</Badge>;
    if (status === 'partial') return <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30">partial</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">pending</Badge>;
  };

  const actions = (inv: PurchaseInvoice) => {
    const remaining = inv.total_amount - inv.amount_paid;
    return (
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" variant="ghost" onClick={() => setDetailsInvoice(inv)} className="text-blue-400 hover:bg-blue-500/10"><Eye className="w-4 h-4" /></Button>
        {can('purchase_invoices', 'edit') && <Button size="sm" variant="ghost" onClick={() => openEdit(inv)} className="text-gym-gold hover:bg-gym-gold/10"><Pencil className="w-4 h-4" /></Button>}
        {remaining > 0 && can('purchase_invoices', 'pay') && <Button size="sm" variant="ghost" onClick={() => { setPayTarget(inv); setPayAmount(String(remaining)); }} className="text-green-400 hover:bg-green-500/10"><DollarSign className="w-4 h-4" /></Button>}
        <Button size="sm" variant="ghost" onClick={() => handlePrint(inv)} className="text-gym-gold hover:bg-gym-gold/10"><Printer className="w-4 h-4" /></Button>
        {can('purchase_invoices', 'delete') && <Button size="sm" variant="ghost" onClick={() => setToDelete(inv)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Purchases</h1>
            <p className="text-gym-gold/60 mt-1">Supplier invoices and stock intake.</p>
          </div>
          {can('purchase_invoices', 'create') && (
            <Button onClick={openCreate} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New purchase
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Invoices</p><p className="text-2xl font-bold text-gym-gold">{invoices.length}</p></div>
            <Package className="w-8 h-8 text-blue-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Total</p><p className="text-2xl font-bold text-gym-gold">{formatDZD(totalAmount)}</p></div>
            <DollarSign className="w-8 h-8 text-green-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Pending</p><p className="text-2xl font-bold text-orange-400">{formatDZD(pendingAmount)}</p></div>
            <Calendar className="w-8 h-8 text-orange-400" />
          </CardContent></Card>
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input placeholder="Search invoice or supplier…" value={search} onChange={(e) => setSearch(e.target.value)}
                     className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-full lg:w-40 bg-gym-black border-gym-gold/30 text-gym-gold"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <ViewToggle mode={viewMode} onChange={setViewMode} cardsLabel="Cards" tableLabel="Table" />
          </CardContent>
        </Card>

        {loading ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center text-gym-gold/40">Loading…</CardContent></Card>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load purchases</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-gym-gold/20" />
            <p className="text-gym-gold/60">No purchases found.</p>
          </CardContent></Card>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((inv) => {
              const remaining = inv.total_amount - inv.amount_paid;
              return (
                <Card key={inv.id} className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/40 transition-colors">
                  <CardHeader className="pb-3"><div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-gym-gold text-base font-mono">{inv.invoice_number}</CardTitle>
                      <CardDescription className="text-gym-gold/60 text-xs">{inv.suppliers?.name || '—'} • {inv.invoice_date}</CardDescription>
                    </div>
                    {statusBadge(inv.status)}
                  </div></CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-gym-gold/60 text-xs">{(inv.purchase_invoice_items ?? []).length} products</p>
                    <div className="flex justify-between text-sm"><span className="text-gym-gold/60">Total</span><span className="text-gym-gold font-semibold">{formatDZD(inv.total_amount)}</span></div>
                    {remaining > 0 && <div className="flex justify-between text-sm"><span className="text-gym-gold/60">Remaining</span><span className="text-red-400">{formatDZD(remaining)}</span></div>}
                    <div className="pt-2 border-t border-gym-gold/10">{actions(inv)}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-gym-gold/20 hover:bg-gym-gold/5">
                <TableHead className="text-gym-gold">Invoice</TableHead>
                <TableHead className="text-gym-gold">Supplier</TableHead>
                <TableHead className="text-gym-gold">Date</TableHead>
                <TableHead className="text-gym-gold text-right">Total</TableHead>
                <TableHead className="text-gym-gold text-right">Remaining</TableHead>
                <TableHead className="text-gym-gold">Status</TableHead>
                <TableHead className="text-gym-gold">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                    <TableCell className="text-gym-gold font-mono">{inv.invoice_number}</TableCell>
                    <TableCell className="text-gym-gold">{inv.suppliers?.name || '—'}</TableCell>
                    <TableCell className="text-gym-gold">{inv.invoice_date}</TableCell>
                    <TableCell className="text-gym-gold text-right">{formatDZD(inv.total_amount)}</TableCell>
                    <TableCell className="text-right text-red-400">{formatDZD(inv.total_amount - inv.amount_paid)}</TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell>{actions(inv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">{editingId ? 'Edit purchase' : 'New purchase'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Supplier */}
            <div>
              <Label>Supplier *</Label>
              <div className="flex gap-2 mt-1">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="bg-gym-black border-gym-gold/30 text-gym-gold"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setAddingSupplier((v) => !v)} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10 shrink-0"><Plus className="w-4 h-4" /></Button>
              </div>
              {addingSupplier && (
                <div className="mt-2 p-3 rounded-lg border border-gym-gold/15 space-y-2">
                  <Input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="Name" className="bg-gym-black border-gym-gold/30 text-gym-gold" />
                  <Input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} placeholder="Phone" className="bg-gym-black border-gym-gold/30 text-gym-gold" />
                  <Button onClick={handleCreateSupplier} className="gym-button w-full">Create supplier</Button>
                </div>
              )}
            </div>

            {/* Product search */}
            <div className="relative">
              <Label>Add products</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
                  <Input value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                         className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" placeholder="Search product…" />
                  {showProductDropdown && filteredProducts.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-gym-gray border border-gym-gold/30 rounded-lg shadow-2xl overflow-hidden">
                      {filteredProducts.map((p) => (
                        <button key={p.id} onClick={() => addProductLine(p)} className="w-full text-left px-4 py-2 hover:bg-gym-gold/15 text-gym-gold border-b border-gym-gold/10 last:border-0">
                          {p.name}{p.barcode && <span className="text-gym-gold/50 text-xs"> • {p.barcode}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" onClick={() => setProductFormOpen(true)} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10 shrink-0"><Plus className="w-4 h-4 mr-1" />New</Button>
              </div>
            </div>

            {/* Lines */}
            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.product_id} className="rounded-lg border border-gym-gold/15 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gym-gold">{it.product_name}</span>
                      <Button size="icon" variant="ghost" onClick={() => removeLine(it.product_id)} className="h-7 w-7 text-red-400 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div><Label className="text-xs">Qty</Label><Input type="number" min="1" value={it.quantity} onChange={(e) => updateLine(it.product_id, 'quantity', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8" /></div>
                      <div><Label className="text-xs">Cost</Label><Input type="number" min="0" step="0.01" value={it.purchase_price} onChange={(e) => updateLine(it.product_id, 'purchase_price', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8" /></div>
                      <div><Label className="text-xs">Sell</Label><Input type="number" min="0" step="0.01" value={it.selling_price} onChange={(e) => updateLine(it.product_id, 'selling_price', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8" /></div>
                      <div><Label className="text-xs">Min stock</Label><Input type="number" min="0" value={it.min_stock_level ?? 0} onChange={(e) => updateLine(it.product_id, 'min_stock_level', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8" /></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={!!expiryEnabled[it.product_id]} onCheckedChange={(v) => toggleExpiry(it.product_id, v)} />
                        <Label className="text-xs">Has expiry</Label>
                      </div>
                      {expiryEnabled[it.product_id] && (
                        <Input type="date" value={it.expiry_date ?? ''} onChange={(e) => updateLine(it.product_id, 'expiry_date', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8 w-44" />
                      )}
                      <span className="ml-auto text-sm text-gym-gold/70">{formatDZD(it.quantity * it.purchase_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator className="bg-gym-gold/15" />

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount paid</Label><Input type="number" min="0" step="0.01" value={amountToPay} onChange={(e) => setAmountToPay(e.target.value)} placeholder={String(total)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" /></div>
              <div className="flex flex-col justify-end">
                <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatDZD(total)}</span></div>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" rows={2} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setFormOpen(false); resetForm(); }} disabled={saving}>Cancel</Button>
            <Button onClick={save} className="gym-button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductFormDialog open={productFormOpen} onOpenChange={setProductFormOpen} product={null} onSaved={handleProductCreated} />

      {/* Details */}
      <Dialog open={!!detailsInvoice} onOpenChange={(o) => !o && setDetailsInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Purchase details</DialogTitle></DialogHeader>
          {detailsInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gym-gold/60 text-xs">Invoice</p><p className="font-mono font-semibold">{detailsInvoice.invoice_number}</p></div>
                <div><p className="text-gym-gold/60 text-xs">Date</p><p>{detailsInvoice.invoice_date}</p></div>
                <div><p className="text-gym-gold/60 text-xs">Supplier</p><p>{detailsInvoice.suppliers?.name || '—'}</p></div>
                <div><p className="text-gym-gold/60 text-xs">Status</p><div className="mt-1">{statusBadge(detailsInvoice.status)}</div></div>
              </div>
              <div className="overflow-x-auto border border-gym-gold/15 rounded-lg">
                <Table>
                  <TableHeader><TableRow className="border-gym-gold/20">
                    <TableHead className="text-gym-gold">Product</TableHead>
                    <TableHead className="text-gym-gold text-right">Qty</TableHead>
                    <TableHead className="text-gym-gold text-right">Cost</TableHead>
                    <TableHead className="text-gym-gold text-right">Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(detailsInvoice.purchase_invoice_items ?? []).map((it) => (
                      <TableRow key={it.id} className="border-gym-gold/10">
                        <TableCell className="text-gym-gold">{it.product_name}</TableCell>
                        <TableCell className="text-gym-gold text-right">{it.quantity}</TableCell>
                        <TableCell className="text-gym-gold text-right">{formatDZD(it.purchase_price)}</TableCell>
                        <TableCell className="text-gym-gold text-right font-semibold">{formatDZD(it.line_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 bg-gym-gold/10 rounded-lg border border-gym-gold/20 space-y-1">
                <div className="flex justify-between text-gym-gold font-bold"><span>Total</span><span>{formatDZD(detailsInvoice.total_amount)}</span></div>
                <div className="flex justify-between text-green-400"><span>Paid</span><span>{formatDZD(detailsInvoice.amount_paid)}</span></div>
                <div className="flex justify-between text-red-400"><span>Remaining</span><span>{formatDZD(detailsInvoice.total_amount - detailsInvoice.amount_paid)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pay */}
      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) { setPayTarget(null); setPayAmount(''); } }}>
        <DialogContent className="max-w-md bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Pay purchase</DialogTitle></DialogHeader>
          {payTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Total</p><p className="font-semibold">{formatDZD(payTarget.total_amount)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Paid</p><p className="text-green-400 font-semibold">{formatDZD(payTarget.amount_paid)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Remaining</p><p className="text-red-400 font-semibold">{formatDZD(payTarget.total_amount - payTarget.amount_paid)}</p></div>
              </div>
              <div><Label>This payment</Label><Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" /></div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => { setPayTarget(null); setPayAmount(''); }}>Cancel</Button>
                <Button onClick={doPay} className="gym-button"><DollarSign className="w-4 h-4 mr-2" />Save payment</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              Stock already added by this purchase is not reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
