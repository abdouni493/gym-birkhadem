import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as Icons from 'lucide-react';
import { Shield, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INTERFACES } from '@/lib/permissions';
import { getWorkerPermissions, setWorkerPermissions, PermRow, Worker } from '@/lib/api/workers';
import { describeError } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  onSaved?: () => void;
}

const iconFor = (name: string): React.ComponentType<{ className?: string }> =>
  (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle;

/**
 * Permissions editor.
 *
 * Left  = every interface in the app (what appears in their sidebar).
 * Right = the button actions of whichever interface is selected.
 *
 * Interface visibility and actions are stored independently, so an action can
 * only be granted while its interface is visible — granting an action on a
 * hidden interface would produce a permission the worker could never reach.
 */
export const PermissionsDialog: React.FC<Props> = ({ isOpen, onClose, worker, onSaved }) => {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [actions, setActions] = useState<Set<string>>(new Set()); // "iface:action"
  const [selected, setSelected] = useState<string>(INTERFACES[0].key);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdminRole = worker?.roles?.is_admin === true;

  useEffect(() => {
    if (!isOpen || !worker) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const rows = await getWorkerPermissions(worker.id);
        if (!active) return;
        const v = new Set<string>();
        const a = new Set<string>();
        for (const r of rows) {
          if (r.action_key === null) v.add(r.interface_key);
          else a.add(`${r.interface_key}:${r.action_key}`);
        }
        setVisible(v);
        setActions(a);
        setSelected(INTERFACES[0].key);
      } catch (e) {
        toast({ title: 'Could not load permissions', description: describeError(e), variant: 'destructive' });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isOpen, worker]);

  const current = useMemo(() => INTERFACES.find((i) => i.key === selected) ?? INTERFACES[0], [selected]);

  const toggleInterface = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Hiding an interface drops its actions too — an action the worker can
        // never navigate to is dead data, and would reappear if re-enabled.
        setActions((pa) => {
          const na = new Set(pa);
          for (const a of pa) if (a.startsWith(`${key}:`)) na.delete(a);
          return na;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAction = (ifaceKey: string, actionKey: string) => {
    const id = `${ifaceKey}:${actionKey}`;
    setActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        // Granting an action implies the screen must be reachable.
        setVisible((pv) => (pv.has(ifaceKey) ? pv : new Set(pv).add(ifaceKey)));
      }
      return next;
    });
  };

  const toggleAllActions = (ifaceKey: string, on: boolean) => {
    const iface = INTERFACES.find((i) => i.key === ifaceKey);
    if (!iface) return;
    setActions((prev) => {
      const next = new Set(prev);
      for (const a of iface.actions) {
        const id = `${ifaceKey}:${a.key}`;
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    if (on) setVisible((pv) => (pv.has(ifaceKey) ? pv : new Set(pv).add(ifaceKey)));
  };

  const countFor = (ifaceKey: string) => {
    const iface = INTERFACES.find((i) => i.key === ifaceKey);
    if (!iface) return 0;
    return iface.actions.filter((a) => actions.has(`${ifaceKey}:${a.key}`)).length;
  };

  const save = async () => {
    if (!worker) return;
    setSaving(true);
    try {
      const rows: PermRow[] = [
        ...Array.from(visible).map((k) => ({ interface_key: k, action_key: null })),
        ...Array.from(actions).map((id) => {
          const [i, a] = id.split(':');
          return { interface_key: i, action_key: a };
        }),
      ];
      await setWorkerPermissions(worker.id, rows);
      toast({
        title: 'Permissions saved',
        description: `${worker.full_name} can now see ${visible.size} interface${visible.size === 1 ? '' : 's'}.`,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      toast({ title: 'Could not save permissions', description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <Shield className="w-5 h-5" />
            Permissions — {worker?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            Tick an interface to put it in this worker's sidebar, then select it to choose
            which buttons they can use inside it.
          </DialogDescription>
        </DialogHeader>

        {isAdminRole && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/90 leading-relaxed">
              This worker has an <strong>admin</strong> role, which already grants full access to
              everything. Permissions set here are ignored until their role changes.
            </p>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gym-gold/50">Loading permissions…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Interfaces */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gym-gold/80">Interfaces (sidebar)</h3>
                <Badge variant="outline" className="border-gym-gold/30 text-gym-gold/70 text-xs">
                  {visible.size}/{INTERFACES.length}
                </Badge>
              </div>
              <ScrollArea className="h-[380px] rounded-lg border border-gym-gold/20 p-2">
                <div className="space-y-1">
                  {INTERFACES.map((iface) => {
                    const Icon = iconFor(iface.icon);
                    const isSel = selected === iface.key;
                    const on = visible.has(iface.key);
                    const n = countFor(iface.key);
                    return (
                      <div
                        key={iface.key}
                        onClick={() => setSelected(iface.key)}
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors',
                          isSel ? 'bg-gym-gold/20 border border-gym-gold/40' : 'hover:bg-gym-gold/10 border border-transparent',
                        )}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={() => toggleInterface(iface.key)}
                          onClick={(e) => e.stopPropagation()}
                          className="border-gym-gold/40 data-[state=checked]:bg-gym-gold data-[state=checked]:text-gym-black"
                        />
                        <Icon className={cn('w-4 h-4 shrink-0', on ? 'text-gym-gold' : 'text-gym-gold/40')} />
                        <span className={cn('text-sm flex-1', on ? 'text-gym-gold' : 'text-gym-gold/50')}>
                          {iface.label}
                        </span>
                        {n > 0 && (
                          <Badge className="bg-gym-gold/20 text-gym-gold text-[10px] px-1.5 py-0 h-4 border-0">
                            {n}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Actions of the selected interface */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gym-gold/80">
                  Button actions — {current.label}
                </h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-gym-gold/70"
                          onClick={() => toggleAllActions(current.key, true)}>
                    All
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-gym-gold/70"
                          onClick={() => toggleAllActions(current.key, false)}>
                    None
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[380px] rounded-lg border border-gym-gold/20 p-2">
                {current.actions.length === 0 ? (
                  <p className="text-xs text-gym-gold/40 p-3">
                    This interface has no button actions — visibility is all it needs.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {!visible.has(current.key) && (
                      <p className="text-[11px] text-amber-300/80 p-2 leading-relaxed">
                        {current.label} is hidden for this worker. Ticking any action below will
                        make it visible automatically.
                      </p>
                    )}
                    {current.actions.map((a) => {
                      const id = `${current.key}:${a.key}`;
                      const on = actions.has(id);
                      return (
                        <label
                          key={a.key}
                          className={cn(
                            'flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors',
                            on ? 'bg-gym-gold/10' : 'hover:bg-gym-gold/5',
                          )}
                        >
                          <Checkbox
                            checked={on}
                            onCheckedChange={() => toggleAction(current.key, a.key)}
                            className="mt-0.5 border-gym-gold/40 data-[state=checked]:bg-gym-gold data-[state=checked]:text-gym-black"
                          />
                          <div className="min-w-0">
                            <p className={cn('text-sm', on ? 'text-gym-gold' : 'text-gym-gold/60')}>{a.label}</p>
                            {a.hint && <p className="text-[11px] text-gym-gold/40 leading-snug">{a.hint}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="gym-button" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : <><Check className="w-4 h-4 mr-2" />Save permissions</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
