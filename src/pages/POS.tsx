import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, Trash2, Plus, Minus, Search, Receipt, User, X, Check, DollarSign, CreditCard } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { Product, listProducts } from '@/lib/api/products';
import { Client, listClients, createClient as createClientRow } from '@/lib/api/misc';
import { createSale } from '@/lib/api/sales';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  maxStock: number;
}

export const POS: React.FC = () => {
  const { can } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '' });

  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [validating, setValidating] = useState(false);

  const canDiscount = can('pos', 'discount');
  const canSell = can('pos', 'sell');

  const refresh = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([listProducts(), listClients()]);
      setProducts(p);
      setClients(c);
    } catch (e) {
      toast({ title: 'Could not load POS data', description: describeError(e), variant: 'destructive' });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q));
  }, [products, search]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)).slice(0, 6);
  }, [clientSearch, clients]);

  const selectedClient = clients.find((c) => c.id === clientId) || null;

  const addToCart = (product: Product) => {
    if (product.current_stock <= 0) {
      toast({ title: 'Out of stock', description: product.name, variant: 'destructive' });
      return;
    }
    setCart((prev) => {
      const existing = prev.find((it) => it.id === product.id);
      if (existing) {
        if (existing.quantity >= product.current_stock) {
          toast({ title: 'Stock limit', description: `Only ${product.current_stock} available`, variant: 'destructive' });
          return prev;
        }
        return prev.map((it) => it.id === product.id ? { ...it, quantity: it.quantity + 1 } : it);
      }
      return [...prev, { id: product.id, name: product.name, price: product.sell_price, quantity: 1, maxStock: product.current_stock }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { setCart((prev) => prev.filter((it) => it.id !== id)); return; }
    setCart((prev) => prev.map((it) => it.id === id ? { ...it, quantity: Math.min(qty, it.maxStock) } : it));
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((it) => it.id !== id));

  const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  const discount = discountEnabled && canDiscount ? Math.min(Number(discountAmount) || 0, subtotal) : 0;
  const total = subtotal - discount;
  const paid = amountPaid === '' ? total : Number(amountPaid) || 0;
  const remaining = Math.max(0, total - paid);

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) return;
    try {
      await createClientRow({ name: newClient.name, phone: newClient.phone });
      const c = await listClients();
      setClients(c);
      const created = c.find((x) => x.name === newClient.name.trim());
      if (created) setClientId(created.id);
      setAddingClient(false);
      setNewClient({ name: '', phone: '' });
      toast({ title: 'Client created' });
    } catch (e) {
      toast({ title: 'Could not create client', description: describeError(e), variant: 'destructive' });
    }
  };

  const resetSale = () => {
    setCart([]); setClientId(null); setClientSearch('');
    setDiscountEnabled(false); setDiscountAmount(''); setAmountPaid(''); setPaymentMethod('cash');
  };

  const handleValidate = async () => {
    if (cart.length === 0) {
      toast({ title: 'Cart is empty', variant: 'destructive' });
      return;
    }
    if (remaining > 0 && !clientId) {
      toast({ title: 'Client required', description: 'A sale with remaining debt needs a client.', variant: 'destructive' });
      return;
    }
    setValidating(true);
    try {
      await createSale({
        client_id: clientId,
        customer_name: selectedClient ? selectedClient.name : 'Client de passage',
        client_phone: selectedClient?.phone ?? null,
        subtotal,
        discount,
        total_amount: total,
        amount_paid: Math.min(paid, total),
        payment_method: paymentMethod,
        items: cart.map((it) => ({ product_id: it.id, name: it.name, quantity: it.quantity, unit_price: it.price })),
      });
      await refresh();
      resetSale();
      toast({ title: 'Sale recorded', description: remaining > 0 ? 'Saved with debt' : 'Paid in full' });
      searchRef.current?.focus();
    } catch (e) {
      toast({ title: 'Could not record sale', description: describeError(e), variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">POS</h1>
            <p className="text-gym-gold/60 mt-1">Scan or tap products to sell.</p>
          </div>
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">Online</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/60 w-4 h-4" />
                  <Input ref={searchRef} autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                         className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" placeholder="Search product or barcode…" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                  {filteredProducts.map((p) => (
                    <Button key={p.id} onClick={() => addToCart(p)} disabled={p.current_stock <= 0} variant="outline"
                            className="h-20 flex flex-col justify-center border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                      <span className="font-medium text-sm line-clamp-1">{p.name}</span>
                      <span className="text-xs text-gym-gold/70">{formatDZD(p.sell_price)}</span>
                      <span className="text-xs text-gym-gold/40">Rest: {p.current_stock}</span>
                    </Button>
                  ))}
                  {filteredProducts.length === 0 && <p className="text-gym-gold/50 col-span-full text-center py-6">No products.</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader><CardTitle className="text-gym-gold flex items-center gap-2"><ShoppingCart className="w-5 h-5" />Cart ({cart.length})</CardTitle></CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gym-gold/60"><ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Cart is empty.</p></div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 p-2 rounded-lg bg-gym-gold/5">
                        <div className="flex-1 min-w-0">
                          <p className="text-gym-gold font-medium truncate">{it.name}</p>
                          <p className="text-gym-gold/60 text-xs">{formatDZD(it.price)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => updateQty(it.id, it.quantity - 1)} className="h-7 w-7 p-0 text-gym-gold hover:bg-gym-gold/10"><Minus className="w-3 h-3" /></Button>
                          <span className="text-gym-gold w-7 text-center">{it.quantity}</span>
                          <Button size="sm" variant="ghost" onClick={() => updateQty(it.id, it.quantity + 1)} className="h-7 w-7 p-0 text-gym-gold hover:bg-gym-gold/10"><Plus className="w-3 h-3" /></Button>
                        </div>
                        <span className="text-gym-gold font-semibold w-24 text-right">{formatDZD(it.price * it.quantity)}</span>
                        <Button size="sm" variant="ghost" onClick={() => removeItem(it.id)} className="text-red-400 hover:bg-red-500/10 h-7 w-7 p-0"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader className="pb-3"><CardTitle className="text-gym-gold flex items-center gap-2 text-lg"><User className="w-5 h-5" />Client</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {selectedClient ? (
                  <div className="flex items-center justify-between p-3 bg-gym-gold/10 rounded-lg border border-gym-gold/20">
                    <div>
                      <p className="text-gym-gold font-medium">{selectedClient.name}</p>
                      {selectedClient.phone && <p className="text-gym-gold/60 text-sm">{selectedClient.phone}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setClientId(null)} className="text-red-400 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/60 w-4 h-4" />
                      <Input value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                             onFocus={() => clientSearch && setShowClientDropdown(true)}
                             className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" placeholder="Search client…" />
                      {showClientDropdown && filteredClients.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-gym-gray border border-gym-gold/30 rounded-lg shadow-2xl overflow-hidden">
                          {filteredClients.map((c) => (
                            <button key={c.id} onClick={() => { setClientId(c.id); setClientSearch(''); setShowClientDropdown(false); }}
                                    className="w-full text-left px-4 py-2 hover:bg-gym-gold/15 text-gym-gold border-b border-gym-gold/10 last:border-0">
                              <span className="font-medium">{c.name}</span>{c.phone && <span className="text-gym-gold/60 text-sm"> • {c.phone}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {addingClient ? (
                      <div className="space-y-2 p-3 bg-gym-gold/5 rounded-lg border border-gym-gold/15">
                        <Input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className="bg-gym-black border-gym-gold/30 text-gym-gold" placeholder="Name" />
                        <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="bg-gym-black border-gym-gold/30 text-gym-gold" placeholder="Phone" />
                        <div className="flex gap-2">
                          <Button onClick={handleCreateClient} className="gym-button flex-1"><Check className="w-4 h-4 mr-1" />Create</Button>
                          <Button variant="ghost" onClick={() => setAddingClient(false)} className="text-gym-gold"><X className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => setAddingClient(true)} className="w-full border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><Plus className="w-4 h-4 mr-1" />New client</Button>
                    )}
                    <p className="text-gym-gold/50 text-xs text-center">Leave empty for a client de passage.</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader className="pb-3"><CardTitle className="text-gym-gold flex items-center gap-2 text-lg"><Receipt className="w-5 h-5" />Payment</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-gym-gold"><span>Subtotal</span><span>{formatDZD(subtotal)}</span></div>

                {canDiscount && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-gym-gold">Discount</Label>
                      <Switch checked={discountEnabled} onCheckedChange={setDiscountEnabled} />
                    </div>
                    {discountEnabled && (
                      <Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)}
                             className="bg-gym-black border-gym-gold/30 text-gym-gold" placeholder="0" />
                    )}
                  </>
                )}

                <Separator className="bg-gym-gold/20" />
                <div className="flex justify-between text-gym-gold font-bold text-lg"><span>Total</span><span>{formatDZD(total)}</span></div>

                <div>
                  <Label className="text-gym-gold text-sm">Payment method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                      <SelectItem value="cash"><div className="flex items-center gap-2"><DollarSign className="w-4 h-4" />Cash</div></SelectItem>
                      <SelectItem value="card"><div className="flex items-center gap-2"><CreditCard className="w-4 h-4" />Card</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gym-gold text-sm">Amount paid</Label>
                  <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
                         className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" placeholder={String(total)} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gym-gold/60">Remaining</span>
                  <span className={remaining > 0 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>{formatDZD(remaining)}</span>
                </div>
                {remaining > 0 && !clientId && <p className="text-red-400 text-xs">Select a client to record a debt.</p>}

                <Button onClick={handleValidate} disabled={cart.length === 0 || validating || !canSell} className="w-full gym-button mt-2">
                  <Receipt className="w-4 h-4 mr-2" />{validating ? 'Saving…' : remaining > 0 ? 'Record with debt' : 'Complete sale'}
                </Button>
                {!canSell && <p className="text-amber-300/80 text-xs text-center">You don't have permission to make sales.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
