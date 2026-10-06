import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt, Search, Package, X, Barcode, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { useLang } from '@/hooks/useLang';
import type { Athlete } from '@/lib/api/athletes';
import { Product, listProducts } from '@/lib/api/products';
import {
  ExtraFee, createExtraFee, updateExtraFee, debtByAthlete,
} from '@/lib/api/athleteExtras';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Preselected athlete; when null an athlete picker is shown. */
  athlete: Athlete | null;
  /** All athletes, for the picker. */
  athletes?: Athlete[];
  /** Fee being edited, or null to create one. */
  fee?: ExtraFee | null;
  onSaved: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

/**
 * Frais supplémentaire: a free-form charge or a product taken from the stock.
 * Picking a product fills name + price and, on save, takes the quantity out
 * of the stock (handled in the API).
 */
export const ExtraFeeDialog: React.FC<Props> = ({ isOpen, onClose, athlete, athletes = [], fee = null, onSaved }) => {
  const { tr } = useLang();
  const isEdit = fee !== null;

  const [athleteId, setAthleteId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [date, setDate] = useState(today());
  const [paid, setPaid] = useState('');
  const [paidTouched, setPaidTouched] = useState(false);
  const [debts, setDebts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAthleteId(fee?.athlete_id ?? athlete?.id ?? '');
    setProductQuery('');
    setName(fee?.name ?? '');
    setDescription(fee?.description ?? '');
    setQuantity(String(fee?.quantity ?? 1));
    setUnitPrice(fee ? String(fee.unit_price) : '');
    setDate(fee?.fee_date ?? today());
    setPaid(fee ? String(fee.amount_paid) : '');
    setPaidTouched(isEdit);
    setProduct(null);
    let active = true;
    Promise.all([listProducts().catch(() => [] as Product[]), debtByAthlete().catch(() => ({}))])
      .then(([p, d]) => {
        if (!active) return;
        setProducts(p);
        setDebts(d);
        if (fee?.product_id) setProduct(p.find((x) => x.id === fee.product_id) ?? null);
      });
    return () => { active = false; };
  }, [isOpen, fee, athlete, isEdit]);

  const total = useMemo(() => (Number(quantity) || 0) * (Number(unitPrice) || 0), [quantity, unitPrice]);

  // "The athlete pays everything" by default until the user types another amount.
  useEffect(() => {
    if (!paidTouched) setPaid(String(total));
  }, [total, paidTouched]);

  const paidValue = Math.min(Math.max(0, Number(paid) || 0), total);
  const rest = Math.max(0, total - paidValue);
  // When editing, the fee's old remaining is already inside the existing debt.
  const existingDebt = Math.max(0, (debts[athleteId] ?? 0) - (fee ? Number(fee.remaining) : 0));
  const newTotalDebt = existingDebt + rest;

  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, productQuery]);

  const pickProduct = (p: Product) => {
    setProduct(p);
    setName(p.name);
    setUnitPrice(String(p.sell_price));
    setProductQuery('');
  };

  // A scanner types the barcode then Enter: pick the exact match right away.
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = productQuery.trim().toLowerCase();
    const exact = products.find((p) => (p.barcode ?? '').toLowerCase() === q) ?? matches[0];
    if (exact) pickProduct(exact);
  };

  const qtyNumber = Number(quantity) || 0;
  const stockAfter = product
    ? Number(product.current_stock) - qtyNumber + (fee && fee.product_id === product.id ? Number(fee.quantity) : 0)
    : null;

  const submit = async () => {
    if (!athleteId) {
      toast({ title: tr('Choisissez un athlète', 'اختر رياضيًا'), variant: 'destructive' });
      return;
    }
    if (!name.trim() || qtyNumber <= 0 || (Number(unitPrice) || 0) < 0) {
      toast({
        title: tr('Vérifiez le formulaire', 'تحقق من النموذج'),
        description: tr('Le nom, la quantité et le prix sont obligatoires.', 'الاسم والكمية والسعر مطلوبة.'),
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const input = {
        athlete_id: athleteId,
        name,
        description,
        product_id: product?.id ?? null,
        quantity: qtyNumber,
        unit_price: Number(unitPrice) || 0,
        amount_paid: paidValue,
        fee_date: date,
      };
      if (fee) await updateExtraFee(fee, input);
      else await createExtraFee(input);
      toast({
        title: isEdit ? tr('Frais modifié', 'تم تعديل الرسوم') : tr('Frais ajouté', 'تمت إضافة الرسوم'),
        description: `${name} — ${formatDZD(total)} · ${tr('Reste', 'الباقي')} ${formatDZD(rest)}`,
      });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: tr('Enregistrement impossible', 'تعذر الحفظ'), description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const pickerAthletes = athletes.length > 0 ? athletes : athlete ? [athlete] : [];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text text-xl">
            <Receipt className="w-5 h-5 text-gym-gold" />
            {isEdit ? tr('Modifier le frais supplémentaire', 'تعديل الرسوم الإضافية') : tr('Frais supplémentaire', 'رسوم إضافية')}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {tr('Un service ou un produit du stock facturé à l’athlète.', 'خدمة أو منتج من المخزون يُحتسب على الرياضي.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Athlete */}
          {!athlete && !fee ? (
            <div className="space-y-1.5">
              <Label>{tr('Athlète', 'الرياضي')} *</Label>
              <Select value={athleteId} onValueChange={setAthleteId}>
                <SelectTrigger className="gym-input"><SelectValue placeholder={tr('Choisir un athlète', 'اختر رياضيًا')} /></SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light max-h-72">
                  {pickerAthletes.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="rounded-lg bg-gym-black/40 border border-gym-gold/15 px-3 py-2 text-sm">
              {tr('Athlète', 'الرياضي')} : <span className="font-semibold text-gym-gold">
                {athlete?.full_name ?? pickerAthletes.find((a) => a.id === athleteId)?.full_name}
              </span>
            </div>
          )}

          {/* Product from stock */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Package className="w-4 h-4" />{tr('Produit du stock (optionnel)', 'منتج من المخزون (اختياري)')}</Label>
            {product ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gym-gold/40 bg-gym-gold/5 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{product.name}</p>
                  <p className="text-[11px] text-gym-gold/50">
                    {product.barcode && <><Barcode className="inline w-3 h-3 me-1" />{product.barcode} · </>}
                    {tr('En stock', 'في المخزون')} : {product.current_stock} · {formatDZD(product.sell_price)}
                  </p>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setProduct(null)}
                        className="h-8 w-8 text-gym-gold/60 hover:text-red-400" aria-label={tr('Retirer', 'إزالة')}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-gold/50" />
                <Input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} onKeyDown={onSearchKey}
                       placeholder={tr('Code-barres ou nom du produit…', 'الباركود أو اسم المنتج…')} className="gym-input ps-10" />
                {matches.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gym-gold/30 bg-gym-gray shadow-xl max-h-64 overflow-y-auto">
                    {matches.map((p) => (
                      <button key={p.id} type="button" onClick={() => pickProduct(p)}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-start hover:bg-gym-gold/10">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{p.name}</p>
                          <p className="text-[11px] text-gym-gold/50">{p.barcode ?? '—'} · {tr('Stock', 'المخزون')} {p.current_stock}</p>
                        </div>
                        <span className="text-sm font-semibold text-gym-gold shrink-0">{formatDZD(p.sell_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{tr('Nom du frais', 'اسم الرسوم')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="gym-input"
                   placeholder={tr('Ex : Coaching privé, Boisson…', 'مثال: تدريب خاص، مشروب…')} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Description (optionnel)', 'الوصف (اختياري)')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="gym-input min-h-[56px]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{tr('Quantité', 'الكمية')} *</Label>
              <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Prix unitaire', 'سعر الوحدة')} *</Label>
              <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Date', 'التاريخ')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
            </div>
          </div>

          {stockAfter !== null && stockAfter < 0 && (
            <p className="flex items-center gap-2 text-xs text-orange-300">
              <AlertTriangle className="w-4 h-4" />{tr('La quantité dépasse le stock disponible.', 'الكمية تتجاوز المخزون المتوفر.')}
            </p>
          )}

          {/* Payment */}
          <div className="rounded-xl border border-gym-gold/25 bg-gym-black/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gym-gold/70">{tr('Total du frais', 'مجموع الرسوم')}</span>
              <span className="text-xl font-bold text-gym-gold">{formatDZD(total)}</span>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Montant payé par l’athlète', 'المبلغ الذي دفعه الرياضي')}</Label>
              <Input type="number" min="0" step="0.01" value={paid}
                     onChange={(e) => { setPaid(e.target.value); setPaidTouched(true); }} className="gym-input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={cn('rounded-lg p-3 border', rest > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-green-500/10 border-green-500/30')}>
                <p className="text-[11px] text-gym-gold/60">{tr('Reste à payer', 'المتبقي للدفع')}</p>
                <p className={cn('text-lg font-bold', rest > 0 ? 'text-orange-300' : 'text-green-400')}>{formatDZD(rest)}</p>
              </div>
              <div className={cn('rounded-lg p-3 border', newTotalDebt > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30')}>
                <p className="text-[11px] text-gym-gold/60">
                  {tr('Dette totale de l’athlète', 'إجمالي دين الرياضي')}
                  {existingDebt > 0 && <> ({tr('dont', 'منها')} {formatDZD(existingDebt)} {tr('existante', 'سابقة')})</>}
                </p>
                <p className={cn('text-lg font-bold', newTotalDebt > 0 ? 'text-red-300' : 'text-green-400')}>{formatDZD(newTotalDebt)}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}
                  className="text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</Button>
          <Button className="gym-button" onClick={submit} disabled={saving}>
            {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
