import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { KeyRound, Eye, EyeOff, Trash2, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import { Worker, manageWorkerAccount } from '@/lib/api/workers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  onSaved: () => void;
}

/**
 * Worker login account management.
 *
 * Every action here goes through the manage_worker_account RPC —
 * creating or changing an auth user needs the service_role key, which must stay
 * server-side.
 */
export const AccountDialog: React.FC<Props> = ({ isOpen, onClose, worker, onSaved }) => {
  const hasAccount = Boolean(worker?.user_id);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen || !worker) return;
    setEmail(worker.email ?? '');
    setUsername(worker.username ?? '');
    setPassword('');
    setShow(false);
  }, [isOpen, worker]);

  const run = async (fn: () => Promise<void>, okTitle: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: okTitle });
      onSaved();
    } catch (e) {
      toast({ title: 'Action failed', description: describeError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worker) return;
    if (!email.trim()) {
      toast({ title: 'Email required', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    await run(async () => {
      await manageWorkerAccount({
        action: 'create', worker_id: worker.id,
        email: email.trim().toLowerCase(), password,
        username: username.trim() || undefined,
      });
      onClose();
    }, 'Login account created');
  };

  const changePassword = async () => {
    if (!worker) return;
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    await run(async () => {
      await manageWorkerAccount({ action: 'update_password', worker_id: worker.id, password });
      setPassword('');
    }, 'Password changed');
  };

  const toggleActive = async (active: boolean) => {
    if (!worker) return;
    await run(
      () => manageWorkerAccount({ action: 'set_active', worker_id: worker.id, active }),
      active ? 'Login enabled' : 'Login disabled',
    );
  };

  const removeAccount = async () => {
    if (!worker) return;
    await run(async () => {
      await manageWorkerAccount({ action: 'delete', worker_id: worker.id });
      onClose();
    }, 'Login account removed');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <KeyRound className="w-5 h-5" />
            {hasAccount ? 'Manage account' : 'Create login account'}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {worker?.full_name}
          </DialogDescription>
        </DialogHeader>

        {!hasAccount ? (
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     className="gym-input" placeholder="worker@gym.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Username <span className="text-gym-gold/40">(optional)</span></Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       className="gym-input pr-10" placeholder="At least 8 characters" />
                <button type="button" onClick={() => setShow(!show)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-gold/60 hover:text-gym-gold"
                        aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2 text-[11px] text-gym-gold/40">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>They will only see the interfaces granted under Permissions.</p>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" className="gym-button" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-gym-gold/20 p-3 space-y-1">
              <p className="text-xs text-gym-gold/50">Signs in with</p>
              <p className="text-sm font-medium">{worker?.email}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="cursor-pointer">Login enabled</Label>
                <p className="text-[11px] text-gym-gold/40 mt-0.5">
                  Turning this off blocks sign-in immediately.
                </p>
              </div>
              <Switch checked={worker?.account_active ?? false}
                      onCheckedChange={toggleActive} disabled={busy} />
            </div>

            <Separator className="bg-gym-gold/15" />

            <div className="space-y-1.5">
              <Label>New password</Label>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       className="gym-input pr-10" placeholder="At least 8 characters" />
                <button type="button" onClick={() => setShow(!show)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-gold/60 hover:text-gym-gold"
                        aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button variant="outline" onClick={changePassword} disabled={busy || !password}
                      className="w-full border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                Change password
              </Button>
            </div>

            <Separator className="bg-gym-gold/15" />

            <Button variant="outline" onClick={removeAccount} disabled={busy}
                    className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4 mr-2" />Remove login account
            </Button>
            <p className="text-[11px] text-gym-gold/40 leading-relaxed">
              The worker record stays; only their ability to sign in is removed.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
