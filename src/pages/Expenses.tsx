import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Trash2, Pencil, Plus, TrendingDown, Filter, Tag, CalendarRange, Receipt, X, Check,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { useLang } from '@/hooks/useLang';
import {
  Expense, ExpenseCategory, listExpenses, createExpense, updateExpense, deleteExpense,
  listExpenseCategories, createExpenseCategory,
} from '@/lib/api/misc';

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
const ALL = '__all__';
const NONE = '__none__';

export const Expenses: React.FC = () => {
  const { can } = usePermissions();
  const { tr, fmtDate } = useLang();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [catFilter, setCatFilter] = useState(ALL);
  const [usePeriod, setUsePeriod] = useState(false);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  // Form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState(NONE);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ex, cats] = await Promise.all([
        listExpenses(),
        listExpenseCategories().catch(() => [] as ExpenseCategory[]),
      ]);
      setExpenses(ex);
      setCategories(cats);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => expenses.filter((e) => {
    const matchesCat = catFilter === ALL
      || (catFilter === NONE ? !e.category_id : e.category_id === catFilter);
    const matchesPeriod = !usePeriod || (e.expense_date >= from && e.expense_date <= to);
    return matchesCat && matchesPeriod;
  }), [expenses, catFilter, usePeriod, from, to]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const e of filtered) {
      const key = e.category_id ?? NONE;
      const cur = map.get(key) ?? { name: e.expense_categories?.name ?? tr('Sans catégorie', 'بدون فئة'), total: 0, count: 0 };
      cur.total += Number(e.amount);
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [filtered, tr]);

  const filtersActive = catFilter !== ALL || usePeriod;

  const openNew = () => {
    setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes('');
    setCategoryId(NONE); setNewCategory(''); setAddingCategory(false);
    setDialogOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e); setName(e.name); setAmount(String(e.amount));
    setDate(e.expense_date); setNotes(e.notes ?? '');
    setCategoryId(e.category_id ?? NONE); setNewCategory(''); setAddingCategory(false);
    setDialogOpen(true);
  };

  const addCategory = async () => {
    const n = newCategory.trim();
    if (!n) return;
    try {
      const c = await createExpenseCategory(n);
      setCategories((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(c.id);
      setNewCategory('');
      setAddingCategory(false);
      toast({ title: tr('Catégorie créée', 'تم إنشاء الفئة'), description: c.name });
    } catch (e) {
      toast({ title: tr('Impossible de créer la catégorie', 'تعذر إنشاء الفئة'), description: describeError(e), variant: 'destructive' });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!name.trim() || !value || value < 0) {
      toast({
        title: tr('Vérifiez le formulaire', 'تحقق من النموذج'),
        description: tr('Un nom et un montant valide sont obligatoires.', 'الاسم ومبلغ صحيح مطلوبان.'),
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name, amount: value, expense_date: date, notes: notes || null,
        category_id: categoryId === NONE ? null : categoryId,
      };
      if (editing) await updateExpense(editing.id, payload);
      else await createExpense(payload);
      toast({ title: editing ? tr('Dépense modifiée', 'تم تعديل المصروف') : tr('Dépense ajoutée', 'تمت إضافة المصروف'), description: formatDZD(value) });
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: tr('Enregistrement impossible', 'تعذر الحفظ'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteExpense(toDelete.id);
      toast({ title: tr('Dépense supprimée', 'تم حذف المصروف') });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: tr('Suppression impossible', 'تعذر الحذف'), description: describeError(e), variant: 'destructive' });
    }
  };

  const resetFilters = () => { setCatFilter(ALL); setUsePeriod(false); setFrom(monthStart()); setTo(today()); };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-0 md:p-2">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold gradient-text">{tr('Dépenses', 'المصاريف')}</h1>
            <p className="text-gym-gold/60 mt-1">{tr('Suivez tout ce que dépense la salle.', 'تتبع كل ما تنفقه القاعة.')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowFilters((v) => !v)}
                    className={cn('border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10', filtersActive && 'border-gym-gold bg-gym-gold/10')}>
              <Filter className="w-4 h-4 me-2" />{tr('Filtrer', 'تصفية')}
              {filtersActive && <span className="ms-2 w-2 h-2 rounded-full bg-gym-gold" />}
            </Button>
            {can('expenses', 'create') && (
              <Button onClick={openNew} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                <Plus className="w-4 h-4 me-2" />{tr('Nouvelle dépense', 'مصروف جديد')}
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <Card className="bg-gym-gray border-gym-gold/20 animate-fade-in">
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-gym-gold/60 flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{tr('Catégorie', 'الفئة')}</Label>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="gym-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                    <SelectItem value={ALL}>{tr('Toutes les catégories', 'كل الفئات')}</SelectItem>
                    <SelectItem value={NONE}>{tr('Sans catégorie', 'بدون فئة')}</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gym-gold/60 flex items-center gap-1"><CalendarRange className="w-3.5 h-3.5" />{tr('Du', 'من')}</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setUsePeriod(true); }} className="gym-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gym-gold/60">{tr('Au', 'إلى')}</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setUsePeriod(true); }} className="gym-input" />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setUsePeriod(true)} className="flex-1 bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                  {tr('Appliquer la période', 'تطبيق الفترة')}
                </Button>
                <Button variant="ghost" onClick={resetFilters} className="text-gym-gold/70 hover:bg-gym-gold/10" title={tr('Réinitialiser', 'إعادة تعيين')}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-red-500/15 to-gym-gray border-red-500/30">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                <TrendingDown className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gym-gold/60">
                  {usePeriod ? `${tr('Total de la période', 'مجموع الفترة')} (${fmtDate(from)} → ${fmtDate(to)})` : tr('Total dépensé', 'إجمالي المصاريف')}
                </p>
                <p className="text-2xl font-bold text-red-300">{formatDZD(total)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gym-gold/15 flex items-center justify-center text-gym-gold shrink-0">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gym-gold/60">{tr('Nombre de dépenses', 'عدد المصاريف')}</p>
                <p className="text-2xl font-bold text-gym-gold">{filtered.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-300 shrink-0">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gym-gold/60">{tr('Catégories', 'الفئات')}</p>
                <p className="text-2xl font-bold text-gym-gold">{categories.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* By category */}
        {byCategory.length > 0 && (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gym-gold/80 mb-3">{tr('Répartition par catégorie', 'التوزيع حسب الفئة')}</p>
              <div className="space-y-2">
                {byCategory.map(([key, c]) => (
                  <button key={key} type="button" onClick={() => { setCatFilter(key); setShowFilters(true); }}
                          className="w-full text-start group">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gym-gold/80 group-hover:text-gym-gold">{c.name} <span className="text-gym-gold/40 text-xs">({c.count})</span></span>
                      <span className="font-semibold text-red-300">{formatDZD(c.total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gym-black overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full"
                           style={{ width: `${total ? Math.max(3, (c.total / total) * 100) : 0}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {loading ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center text-gym-gold/40">{tr('Chargement…', 'جارٍ التحميل…')}</CardContent></Card>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">{tr('Impossible de charger les dépenses', 'تعذر تحميل المصاريف')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Réessayer', 'إعادة المحاولة')}</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center text-gym-gold/60">
              {expenses.length === 0 ? tr('Aucune dépense enregistrée.', 'لا توجد مصاريف مسجلة.') : tr('Aucune dépense ne correspond aux filtres.', 'لا توجد مصاريف مطابقة للتصفية.')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((exp) => (
              <Card key={exp.id} className="bg-gym-gray border-gym-gold/20 hover:border-red-500/40 transition-colors">
                <CardContent className="p-4 flex justify-between items-start gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold text-gym-gold truncate">{exp.name}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gym-gold/50">{fmtDate(exp.expense_date)}</span>
                      <Badge variant="outline" className="border-blue-400/30 text-blue-300 text-[10px] h-5">
                        {exp.expense_categories?.name ?? tr('Sans catégorie', 'بدون فئة')}
                      </Badge>
                    </div>
                    {exp.notes && <p className="text-xs text-gym-gold/60 break-words">{exp.notes}</p>}
                  </div>
                  <div className="text-end shrink-0">
                    <div className="font-semibold text-red-400">{formatDZD(exp.amount)}</div>
                    <div className="flex gap-1 mt-2 justify-end">
                      {can('expenses', 'edit') && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(exp)}
                                className="h-7 w-7 text-gym-gold/70 hover:bg-gym-gold/10" aria-label={tr('Modifier', 'تعديل')}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {can('expenses', 'delete') && (
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(exp)}
                                className="h-7 w-7 text-red-400 hover:bg-red-500/10" aria-label={tr('Supprimer', 'حذف')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
          <DialogHeader>
            <DialogTitle className="gradient-text">{editing ? tr('Modifier la dépense', 'تعديل المصروف') : tr('Nouvelle dépense', 'مصروف جديد')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr('Nom', 'الاسم')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="gym-input" />
            </div>

            {/* Category + inline creation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{tr('Catégorie', 'الفئة')}</Label>
                {!addingCategory && (
                  <button type="button" onClick={() => setAddingCategory(true)}
                          className="text-xs text-gym-gold/70 hover:text-gym-gold inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />{tr('Nouvelle catégorie', 'فئة جديدة')}
                  </button>
                )}
              </div>
              {addingCategory ? (
                <div className="flex gap-2">
                  <Input autoFocus value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                         placeholder={tr('Nom de la catégorie', 'اسم الفئة')} className="gym-input"
                         onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} />
                  <Button type="button" size="icon" onClick={addCategory} disabled={!newCategory.trim()}
                          className="bg-gym-gold text-gym-black hover:bg-gym-gold/90 shrink-0"><Check className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setAddingCategory(false)}
                          className="text-gym-gold/70 shrink-0"><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="gym-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                    <SelectItem value={NONE}>{tr('Sans catégorie', 'بدون فئة')}</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Montant (DA)', 'المبلغ (دج)')} *</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="gym-input" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Date', 'التاريخ')} *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Notes', 'ملاحظات')}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="gym-input min-h-[60px]" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>{tr('Annuler', 'إلغاء')}</Button>
              <Button type="submit" className="gym-button" disabled={saving}>{saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('Supprimer cette dépense ?', 'حذف هذا المصروف؟')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">{toDelete?.name} — {formatDZD(toDelete?.amount ?? 0)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">{tr('Supprimer', 'حذف')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
