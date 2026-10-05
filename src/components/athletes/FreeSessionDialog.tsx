import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Zap, Plus, Trash2, User } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import {
  FreeSession, listFreeSessions, createFreeSession, deleteFreeSession, sessionName,
} from '@/lib/api/freeSessions';

interface AthleteOption {
  id: string;
  full_name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athletes: AthleteOption[];
  onSaved?: () => void;
  canDelete?: boolean;
}

const nowDate = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const nowTime = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Séance libre.
 *
 * Opens straight into creation (per spec) with the date and time pre-filled
 * from the system clock, and lists the history underneath in the same place.
 */
export const FreeSessionDialog: React.FC<Props> = ({
  isOpen, onClose, athletes, onSaved, canDelete = true,
}) => {
  const [who, setWho] = useState<'member' | 'passenger'>('member');
  const [athleteId, setAthleteId] = useState<string>('');
  const [passenger, setPassenger] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(nowDate());
  const [time, setTime] = useState(nowTime());

  const [history, setHistory] = useState<FreeSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setHistory(await listFreeSessions());
    } catch (e) {
      toast({ title: 'Could not load history', description: describeError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    // Re-stamp the clock each open so a dialog left mounted isn't stale.
    setDate(nowDate());
    setTime(nowTime());
    setWho('member');
    setAthleteId('');
    setPassenger('');
    setPrice('');
    load();
  }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(price);
    if (!value || value <= 0) {
      toast({ title: 'Set a price', description: 'The session price must be greater than zero.', variant: 'destructive' });
      return;
    }
    if (who === 'member' && !athleteId) {
      toast({ title: 'Select an athlete', variant: 'destructive' });
      return;
    }
    if (who === 'passenger' && !passenger.trim()) {
      toast({ title: 'Name the passager', description: 'Enter who trained.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await createFreeSession({
        athlete_id: who === 'member' ? athleteId : null,
        passenger_name: who === 'passenger' ? passenger : null,
        price: value,
        session_date: date,
        session_time: time,
        notes: null,
      });
      toast({ title: 'Séance libre saved', description: `${formatDZD(value)} recorded.` });
      setPrice(''); setPassenger(''); setAthleteId('');
      await load();
      onSaved?.();
    } catch (err) {
      toast({ title: 'Could not save session', description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteFreeSession(id);
      await load();
      onSaved?.();
      toast({ title: 'Session deleted' });
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const todayTotal = history
    .filter((s) => s.session_date === nowDate())
    .reduce((s, x) => s + Number(x.price), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <Zap className="w-5 h-5" />Séance libre
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            Record a single paid session. Date and time are taken from the system.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <RadioGroup value={who} onValueChange={(v) => setWho(v as 'member' | 'passenger')}
                      className="grid grid-cols-2 gap-3">
            <label className={cn('flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors',
              who === 'member' ? 'border-gym-gold/50 bg-gym-gold/10' : 'border-gym-gold/20')}>
              <RadioGroupItem value="member" className="border-gym-gold/50 text-gym-gold" />
              <span className="text-sm">Member</span>
            </label>
            <label className={cn('flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors',
              who === 'passenger' ? 'border-gym-gold/50 bg-gym-gold/10' : 'border-gym-gold/20')}>
              <RadioGroupItem value="passenger" className="border-gym-gold/50 text-gym-gold" />
              <span className="text-sm">Passager</span>
            </label>
          </RadioGroup>

          {who === 'member' ? (
            <div className="space-y-1.5">
              <Label>Athlete *</Label>
              <Select value={athleteId} onValueChange={setAthleteId}>
                <SelectTrigger className="gym-input"><SelectValue placeholder="Select an athlete" /></SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold max-h-60">
                  {athletes.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Passager name *</Label>
              <Input value={passenger} onChange={(e) => setPassenger(e.target.value)}
                     className="gym-input" placeholder="Walk-in name" />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Price *</Label>
              <Input type="number" min="0" step="0.01" value={price}
                     onChange={(e) => setPrice(e.target.value)} className="gym-input" placeholder="500" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Hour</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="gym-input" />
            </div>
          </div>

          <Button type="submit" className="w-full gym-button" disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />{saving ? 'Saving…' : 'Save séance libre'}
          </Button>
        </form>

        <Separator className="bg-gym-gold/15" />

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gym-gold/80">History</h3>
          {todayTotal > 0 && (
            <Badge className="bg-green-500/20 text-green-300 border-0">
              {formatDZD(todayTotal)} today
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[240px]">
          {loading ? (
            <p className="text-sm text-gym-gold/40 py-6 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gym-gold/40 py-6 text-center">No free sessions yet.</p>
          ) : (
            <div className="space-y-1.5 pr-2">
              {history.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gym-gold/15">
                  <div className="w-7 h-7 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
                    {s.athletes?.photo_url
                      ? <img src={s.athletes.photo_url} alt="" className="w-full h-full object-cover" />
                      : <User className="w-3.5 h-3.5 text-gym-gold/50" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{sessionName(s)}</p>
                    <p className="text-xs text-gym-gold/40">
                      {s.session_date} · {String(s.session_time).slice(0, 5)}
                      {!s.athlete_id && ' · passager'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-green-400 shrink-0">{formatDZD(s.price)}</span>
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => remove(s.id)}
                            className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0"
                            aria-label="Delete session">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
