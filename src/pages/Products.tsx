import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Plus, Pencil, Trash2, Eye, Package, AlertTriangle, TrendingUp, Printer } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  Product, Brand, Category, ProductStatus, productStatus,
  listProducts, listBrands, listCategories, deleteProduct,
} from '@/lib/api/products';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { ViewToggle, ViewMode } from '@/components/common/ViewToggle';
import { Barcode } from '@/components/common/Barcode';
import { printBarcodes } from '@/lib/barcode';

const statusBadge = (s: ProductStatus) => {
  switch (s) {
    case 'out_of_stock': return <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">Out of stock</Badge>;
    case 'critical': return <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">Critical</Badge>;
    case 'low_stock': return <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30">Low stock</Badge>;
    default: return <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">In stock</Badge>;
  }
};

export const Products: React.FC = () => {
  const { can } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, b, c] = await Promise.all([listProducts(), listBrands(), listCategories()]);
      setProducts(p); setBrands(b); setCategories(c);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withStatus = useMemo(() => products.map((p) => ({
    ...p, status: productStatus(p.current_stock, p.min_stock_level),
  })), [products]);

  const filtered = useMemo(() => withStatus.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q);
    const matchesBrand = brandFilter === 'all' || p.brand_id === brandFilter;
    const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
    return matchesSearch && matchesBrand && matchesCategory;
  }), [withStatus, search, brandFilter, categoryFilter]);

  const totalValue = useMemo(() => products.reduce((s, p) => s + p.sell_price * p.current_stock, 0), [products]);
  const lowStock = useMemo(() => withStatus.filter((p) => p.status !== 'in_stock').length, [withStatus]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteProduct(toDelete.id);
      toast({ title: 'Product deleted' });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Stock</h1>
            <p className="text-gym-gold/60 mt-1">Products and inventory.</p>
          </div>
          {can('products', 'create') && (
            <Button onClick={() => { setEditProduct(null); setFormOpen(true); }} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New product
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Products</p><p className="text-2xl font-bold text-gym-gold">{products.length}</p></div>
            <Package className="w-8 h-8 text-blue-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Low stock</p><p className="text-2xl font-bold text-red-400">{lowStock}</p></div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Stock value</p><p className="text-2xl font-bold text-green-400">{formatDZD(totalValue)}</p></div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </CardContent></Card>
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input placeholder="Search by name or barcode…" value={search} onChange={(e) => setSearch(e.target.value)}
                     className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
            </div>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-full lg:w-48 bg-gym-black border-gym-gold/30 text-gym-gold"><SelectValue placeholder="All brands" /></SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full lg:w-48 bg-gym-black border-gym-gold/30 text-gym-gold"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
              <p className="text-red-400 font-medium">Could not load products</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-gym-gold/20" />
              <p className="text-gym-gold/60">No products found.</p>
            </CardContent>
          </Card>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <Card key={p.id} className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-gym-gold text-lg truncate">{p.name}</CardTitle>
                      <CardDescription className="text-gym-gold/60 text-xs">
                        {[p.brands?.name, p.categories?.name].filter(Boolean).join(' • ') || '—'}
                      </CardDescription>
                    </div>
                    {statusBadge(p.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gym-gold/5 rounded p-2"><p className="text-gym-gold/60 text-xs">Principal</p><p className="text-gym-gold font-semibold">{p.initial_quantity}</p></div>
                    <div className="bg-gym-gold/5 rounded p-2"><p className="text-gym-gold/60 text-xs">Rest</p>
                      <p className={p.current_stock <= p.min_stock_level ? 'text-red-400 font-semibold' : 'text-gym-gold font-semibold'}>{p.current_stock}</p></div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gym-gold/60">Sell price</span>
                    <span className="text-gym-gold font-semibold">{formatDZD(p.sell_price)}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setViewProduct(p)} className="flex-1 border-gym-gold/30 text-blue-400 hover:bg-blue-500/10"><Eye className="w-4 h-4" /></Button>
                    {can('products', 'edit') && (
                      <Button size="sm" variant="outline" onClick={() => { setEditProduct(p); setFormOpen(true); }} className="flex-1 border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><Pencil className="w-4 h-4" /></Button>
                    )}
                    {can('products', 'delete') && (
                      <Button size="sm" variant="outline" onClick={() => setToDelete(p)} className="flex-1 border-gym-gold/30 text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gym-gold/20 hover:bg-gym-gold/5">
                    <TableHead className="text-gym-gold">Name</TableHead>
                    <TableHead className="text-gym-gold">Brand</TableHead>
                    <TableHead className="text-gym-gold">Category</TableHead>
                    <TableHead className="text-gym-gold text-right">Principal</TableHead>
                    <TableHead className="text-gym-gold text-right">Rest</TableHead>
                    <TableHead className="text-gym-gold text-right">Sell</TableHead>
                    <TableHead className="text-gym-gold">Status</TableHead>
                    <TableHead className="text-gym-gold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                      <TableCell className="text-gym-gold font-medium">{p.name}</TableCell>
                      <TableCell className="text-gym-gold/80">{p.brands?.name || '—'}</TableCell>
                      <TableCell className="text-gym-gold/80">{p.categories?.name || '—'}</TableCell>
                      <TableCell className="text-gym-gold text-right">{p.initial_quantity}</TableCell>
                      <TableCell className="text-right"><span className={p.current_stock <= p.min_stock_level ? 'text-red-400 font-semibold' : 'text-gym-gold'}>{p.current_stock}</span></TableCell>
                      <TableCell className="text-gym-gold text-right">{formatDZD(p.sell_price)}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewProduct(p)} className="text-blue-400 hover:bg-blue-500/10"><Eye className="w-4 h-4" /></Button>
                          {can('products', 'edit') && (
                            <Button size="sm" variant="ghost" onClick={() => { setEditProduct(p); setFormOpen(true); }} className="text-gym-gold hover:bg-gym-gold/10"><Pencil className="w-4 h-4" /></Button>
                          )}
                          {can('products', 'delete') && (
                            <Button size="sm" variant="ghost" onClick={() => setToDelete(p)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editProduct} onSaved={load} />

      <Dialog open={!!viewProduct} onOpenChange={(o) => !o && setViewProduct(null)}>
        <DialogContent className="max-w-lg bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Product details</DialogTitle></DialogHeader>
          {viewProduct && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-gym-gold">{viewProduct.name}</h3>
                <p className="text-gym-gold/60 text-sm">{[viewProduct.brands?.name, viewProduct.categories?.name].filter(Boolean).join(' • ') || '—'}</p>
              </div>
              {viewProduct.description && <p className="text-gym-gold/80 text-sm">{viewProduct.description}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Principal</p><p className="font-semibold">{viewProduct.initial_quantity}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Rest</p><p className="font-semibold">{viewProduct.current_stock}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Cost</p><p className="font-semibold">{formatDZD(viewProduct.real_price)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Sell</p><p className="font-semibold">{formatDZD(viewProduct.sell_price)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Min stock</p><p className="font-semibold">{viewProduct.min_stock_level}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Sold</p><p className="font-semibold">{viewProduct.sold}</p></div>
                {viewProduct.expiry_date && <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Expiry</p><p className="font-semibold">{viewProduct.expiry_date}</p></div>}
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Status</p><div className="mt-1">{statusBadge(productStatus(viewProduct.current_stock, viewProduct.min_stock_level))}</div></div>
              </div>
              {viewProduct.barcode && (
                <div className="bg-white rounded p-3 flex flex-col items-center">
                  <Barcode value={viewProduct.barcode} />
                  <Button size="sm" variant="ghost" onClick={() => printBarcodes([{ name: viewProduct.name, barcode: viewProduct.barcode! }])} className="mt-2 text-gym-black hover:bg-gym-gold/10">
                    <Printer className="w-4 h-4 mr-2" />Print
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">This cannot be undone.</AlertDialogDescription>
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
