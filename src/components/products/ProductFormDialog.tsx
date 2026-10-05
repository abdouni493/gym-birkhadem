import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Barcode as BarcodeIcon, Plus, Printer, Save, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import { generateBarcodeValue, printBarcodes } from '@/lib/barcode';
import { Barcode } from '@/components/common/Barcode';
import {
  Product, ProductInput, Brand, Category,
  createProduct, updateProduct, listBrands, listCategories, createBrand, createCategory,
} from '@/lib/api/products';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSaved?: () => void;
}

const emptyForm = {
  name: '', description: '', barcode: '', brand_id: '', category_id: '',
  realPrice: '', sellPrice: '', initialQuantity: '', currentStock: '0',
  minStockLevel: '', expiryDate: '',
};

export const ProductFormDialog: React.FC<Props> = ({ open, onOpenChange, product, onSaved }) => {
  const isEdit = !!product;
  const [form, setForm] = useState({ ...emptyForm });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const loadLists = async () => {
    const [b, c] = await Promise.all([listBrands(), listCategories()]);
    setBrands(b);
    setCategories(c);
  };

  useEffect(() => {
    if (!open) return;
    loadLists().catch((e) => toast({ title: 'Could not load lists', description: describeError(e), variant: 'destructive' }));
    if (product) {
      setForm({
        name: product.name || '',
        description: product.description || '',
        barcode: product.barcode || '',
        brand_id: product.brand_id || '',
        category_id: product.category_id || '',
        realPrice: String(product.real_price ?? ''),
        sellPrice: String(product.sell_price ?? ''),
        initialQuantity: String(product.initial_quantity ?? ''),
        currentStock: String(product.current_stock ?? '0'),
        minStockLevel: String(product.min_stock_level ?? ''),
        expiryDate: product.expiry_date || '',
      });
    } else {
      setForm({ ...emptyForm });
    }
    setAddingBrand(false); setAddingCategory(false); setNewBrand(''); setNewCategory('');
  }, [open, product]);

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleAddBrand = async () => {
    const name = newBrand.trim();
    if (!name) return;
    try {
      const b = await createBrand(name);
      await loadLists();
      update('brand_id', b.id);
      setNewBrand(''); setAddingBrand(false);
    } catch (e) {
      toast({ title: 'Could not add brand', description: describeError(e), variant: 'destructive' });
    }
  };

  const handleAddCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const c = await createCategory(name);
      await loadLists();
      update('category_id', c.id);
      setNewCategory(''); setAddingCategory(false);
    } catch (e) {
      toast({ title: 'Could not add category', description: describeError(e), variant: 'destructive' });
    }
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (product) {
        const currentStock = form.currentStock !== '' ? Number(form.currentStock) : 0;
        const payload: ProductInput = {
          name: form.name.trim(),
          description: form.description,
          barcode: form.barcode,
          brand_id: form.brand_id || null,
          category_id: form.category_id || null,
          real_price: Number(form.realPrice) || 0,
          sell_price: Number(form.sellPrice) || 0,
          initial_quantity: Number(form.initialQuantity) || 0,
          current_stock: currentStock,
          min_stock_level: Number(form.minStockLevel) || 5,
          expiry_date: form.expiryDate || null,
        };
        await updateProduct(product.id, payload);
        toast({ title: 'Product updated' });
      } else {
        const startStock = form.currentStock !== '' ? Number(form.currentStock) : 0;
        const payload: ProductInput = {
          name: form.name.trim(),
          description: form.description,
          barcode: form.barcode || generateBarcodeValue(),
          brand_id: form.brand_id || null,
          category_id: form.category_id || null,
          initial_quantity: startStock,
          current_stock: startStock,
          min_stock_level: 5,
        };
        await createProduct(payload);
        toast({ title: 'Product created' });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save product', description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
        <DialogHeader>
          <DialogTitle className="gradient-text text-xl">{isEdit ? 'Edit product' : 'New product'}</DialogTitle>
          <DialogDescription className="text-gym-gold/60">Product details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} className="gym-input mt-1" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} className="gym-input mt-1" rows={2} />
          </div>

          <div>
            <Label>Barcode</Label>
            <div className="flex gap-2 mt-1">
              <Input value={form.barcode} onChange={(e) => update('barcode', e.target.value)} className="gym-input" placeholder="—" />
              <Button type="button" variant="outline" onClick={() => update('barcode', generateBarcodeValue())}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10" title="Generate">
                <BarcodeIcon className="w-4 h-4" />
              </Button>
              <Button type="button" variant="outline"
                      onClick={() => printBarcodes([{ name: form.name, barcode: form.barcode || generateBarcodeValue() }])}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10" title="Print">
                <Printer className="w-4 h-4" />
              </Button>
            </div>
            {form.barcode && <div className="mt-2 bg-white rounded p-2 inline-block"><Barcode value={form.barcode} height={50} /></div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Brand</Label>
              <div className="flex gap-2 mt-1">
                <Select value={form.brand_id} onValueChange={(v) => update('brand_id', v)}>
                  <SelectTrigger className="gym-input"><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setAddingBrand((v) => !v)}
                        className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><Plus className="w-4 h-4" /></Button>
              </div>
              {addingBrand && (
                <div className="flex gap-2 mt-2">
                  <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className="gym-input" placeholder="New brand"
                         onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBrand(); } }} />
                  <Button type="button" onClick={handleAddBrand} className="gym-button px-3"><Check className="w-4 h-4" /></Button>
                  <Button type="button" variant="ghost" onClick={() => setAddingBrand(false)} className="text-gym-gold px-3"><X className="w-4 h-4" /></Button>
                </div>
              )}
            </div>

            <div>
              <Label>Category</Label>
              <div className="flex gap-2 mt-1">
                <Select value={form.category_id} onValueChange={(v) => update('category_id', v)}>
                  <SelectTrigger className="gym-input"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setAddingCategory((v) => !v)}
                        className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><Plus className="w-4 h-4" /></Button>
              </div>
              {addingCategory && (
                <div className="flex gap-2 mt-2">
                  <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="gym-input" placeholder="New category"
                         onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }} />
                  <Button type="button" onClick={handleAddCategory} className="gym-button px-3"><Check className="w-4 h-4" /></Button>
                  <Button type="button" variant="ghost" onClick={() => setAddingCategory(false)} className="text-gym-gold px-3"><X className="w-4 h-4" /></Button>
                </div>
              )}
            </div>
          </div>

          {!isEdit && (
            <div className="md:w-1/2">
              <Label>Starting stock</Label>
              <Input type="number" min="0" value={form.currentStock} onChange={(e) => update('currentStock', e.target.value)} className="gym-input mt-1" placeholder="0" />
            </div>
          )}

          {isEdit && (
            <div className="grid grid-cols-2 gap-3 border-t border-gym-gold/15 pt-4">
              <div><Label>Cost price</Label><Input type="number" step="0.01" min="0" value={form.realPrice} onChange={(e) => update('realPrice', e.target.value)} className="gym-input mt-1" /></div>
              <div><Label>Sell price</Label><Input type="number" step="0.01" min="0" value={form.sellPrice} onChange={(e) => update('sellPrice', e.target.value)} className="gym-input mt-1" /></div>
              <div><Label>Principal qty</Label><Input type="number" min="0" value={form.initialQuantity} onChange={(e) => update('initialQuantity', e.target.value)} className="gym-input mt-1" /></div>
              <div><Label>Current stock</Label><Input type="number" min="0" value={form.currentStock} onChange={(e) => update('currentStock', e.target.value)} className="gym-input mt-1" /></div>
              <div><Label>Min stock</Label><Input type="number" min="0" value={form.minStockLevel} onChange={(e) => update('minStockLevel', e.target.value)} className="gym-input mt-1" /></div>
              <div><Label>Expiry date</Label><Input type="date" value={form.expiryDate} onChange={(e) => update('expiryDate', e.target.value)} className="gym-input mt-1" /></div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} className="gym-button" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
