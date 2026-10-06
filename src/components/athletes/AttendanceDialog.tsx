import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserCheck, UserX } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { useLang } from '@/hooks/useLang';
import type { Athlete } from '@/lib/api/athletes';
import { AttendanceStatus, addAttendance } from '@/lib/api/athleteExtras';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  /** Which status the dialog opens on. */
  initialStatus?: AttendanceStatus;
  onSaved: () => void;
}

const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toTimeString().slice(0, 5);

/** Mark an athlete present or absent by hand. */
export const AttendanceDialog: React.FC<Props> = ({ isOpen, onClose, athlete, initialStatus = 'present', onSaved }) => {
  const { tr } = useLang();
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(initialStatus); setDate(today()); setTime(nowTime()); setNotes('');
  }, [isOpen, initialStatus]);

  const submit = async () => {
    if (!athlete) return;
    setSaving(true);
    try {
      await addAttendance({ athleteId: athlete.id, status, date, time, notes, source: 'manual' });
      toast({
        title: status === 'present' ? tr('Présence enregistrée', 'تم تسجيل الحضور') : tr('Absence enregistrée', 'تم تسجيل الغياب'),
        description: athlete.full_name,
      });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: tr('Enregistrement impossible', 'تعذر الحفظ'), description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const Option: React.FC<{ value: AttendanceStatus }> = ({ value }) => {
    const active = status === value;
    const present = value === 'present';
    const Icon = present ? UserCheck : UserX;
    return (
      <button type="button" onClick={() => setStatus(value)}
              className={cn('flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                active
                  ? present ? 'border-green-500 bg-green-500/15 text-green-300' : 'border-red-500 bg-red-500/15 text-red-300'
                  : 'border-gym-gold/15 text-gym-gold/50 hover:border-gym-gold/40')}>
        <Icon className="w-7 h-7" />
        <span className="font-semibold">{present ? tr('Présent', 'حاضر') : tr('Absent', 'غائب')}</span>
      </button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-md">
        <DialogHeader>
          <DialogTitle className="gradient-text text-xl">{tr('Présence / absence', 'الحضور / الغياب')}</DialogTitle>
          <DialogDescription className="text-gym-gold/60">{athlete?.full_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3"><Option value="present" /><Option value="absent" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tr('Date', 'التاريخ')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Heure', 'الوقت')}</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="gym-input" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Note (optionnel)', 'ملاحظة (اختياري)')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="gym-input" />
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
