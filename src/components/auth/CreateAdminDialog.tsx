import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase, describeError } from '@/lib/supabase';
import { ShieldPlus, Eye, EyeOff } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Fired after an admin is successfully created, so Login can hide the button. */
  onCreated: (email: string) => void;
}

/**
 * First-run admin creation.
 *
 * Calls the bootstrap_admin() RPC, which is only callable while no admin
 * exists — the database enforces that, not this dialog. Once it succeeds the
 * login page hides the entry point for good.
 */
export const CreateAdminDialog: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFirstName(''); setLastName(''); setUsername(''); setEmail('');
    setPassword(''); setConfirm(''); setShow(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !email.trim() || !password) {
      toast({ title: 'Missing information', description: 'Username, email and password are required.', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', description: 'Re-type the same password in both fields.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc('bootstrap_admin', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_first_name: firstName.trim() || 'Admin',
        p_last_name: lastName.trim() || 'User',
        p_username: username.trim(),
      });

      if (error) throw error;

      toast({
        title: 'Admin account created',
        description: `Sign in with ${email.trim().toLowerCase()}.`,
      });
      onCreated(email.trim().toLowerCase());
      reset();
      onClose();
    } catch (err) {
      toast({ title: 'Could not create admin', description: describeError(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <ShieldPlus className="w-5 h-5" />
            Create admin account
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            This sets up the first administrator. It is only available until an admin
            exists — afterwards this option disappears.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="admin-first">First name</Label>
              <Input id="admin-first" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                     placeholder="Admin" className="gym-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-last">Last name</Label>
              <Input id="admin-last" value={lastName} onChange={(e) => setLastName(e.target.value)}
                     placeholder="User" className="gym-input" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-username">Username *</Label>
            <Input id="admin-username" required value={username}
                   onChange={(e) => setUsername(e.target.value)}
                   autoComplete="username"
                   placeholder="admin" className="gym-input" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-email">Email *</Label>
            <Input id="admin-email" type="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   placeholder="admin@gym.com" className="gym-input" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-pass">Password *</Label>
            <div className="relative">
              <Input id="admin-pass" type={show ? 'text' : 'password'} required value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     placeholder="At least 8 characters" className="gym-input pr-10" />
              <button type="button" onClick={() => setShow(!show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-gold/60 hover:text-gym-gold"
                      aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-confirm">Confirm password *</Label>
            <Input id="admin-confirm" type={show ? 'text' : 'password'} required value={confirm}
                   onChange={(e) => setConfirm(e.target.value)}
                   placeholder="Re-type the password" className="gym-input" />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="gym-button" disabled={busy}>
              {busy ? 'Creating…' : 'Create admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
