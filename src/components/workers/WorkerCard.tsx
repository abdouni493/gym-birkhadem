import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  User, Eye, Pencil, Trash2, MoreVertical, Shield, HandCoins, CalendarX,
  Wallet, KeyRound, Phone, CalendarDays,
} from 'lucide-react';
import { formatDZD, cn } from '@/lib/utils';
import type { Worker } from '@/lib/api/workers';

interface Props {
  worker: Worker;
  onView: (w: Worker) => void;
  onEdit: (w: Worker) => void;
  onDelete: (w: Worker) => void;
  onPermissions: (w: Worker) => void;
  onAcompte: (w: Worker) => void;
  onAbsence: (w: Worker) => void;
  onPayment: (w: Worker) => void;
  onAccount: (w: Worker) => void;
  can: (action: string) => boolean;
}

/**
 * A worker card.
 *
 * View / Edit / Delete are the primary actions and stay on the card face; the
 * rest live in the overflow menu so the card doesn't become a wall of buttons.
 * Every action is permission-gated — the UI hides what the DB would refuse.
 */
export const WorkerCard: React.FC<Props> = ({
  worker, onView, onEdit, onDelete, onPermissions, onAcompte, onAbsence,
  onPayment, onAccount, can,
}) => {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const isAdmin = worker.roles?.is_admin === true;

  const menuActions = [
    { key: 'permissions', label: 'Permissions', icon: Shield, fn: onPermissions },
    { key: 'acompte', label: 'Acompte', icon: HandCoins, fn: onAcompte },
    { key: 'absence', label: 'Absence', icon: CalendarX, fn: onAbsence },
    { key: 'payment', label: 'Payment', icon: Wallet, fn: onPayment },
    { key: 'account', label: worker.user_id ? 'Manage account' : 'Create account', icon: KeyRound, fn: onAccount },
  ].filter((a) => can(a.key));

  return (
    <>
      <Card className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/40 transition-colors">
        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
              {worker.photo_url
                ? <img src={worker.photo_url} alt="" className="w-full h-full object-cover" />
                : <User className="w-5 h-5 text-gym-gold/60" />}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gym-gold truncate">{worker.full_name}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <Badge className={cn('border-0 text-[10px] h-4',
                  isAdmin ? 'bg-purple-500/20 text-purple-300' : 'bg-gym-gold/20 text-gym-gold')}>
                  {worker.roles?.name ?? 'No role'}
                </Badge>
                {worker.status === 'inactive' && (
                  <Badge variant="outline" className="border-gym-gold/30 text-gym-gold/50 text-[10px] h-4">
                    inactive
                  </Badge>
                )}
                {worker.user_id && (
                  <Badge variant="outline"
                         className={cn('text-[10px] h-4',
                           worker.account_active ? 'border-blue-500/40 text-blue-300' : 'border-gym-gold/25 text-gym-gold/40')}>
                    <KeyRound className="w-2.5 h-2.5 mr-0.5" />
                    {worker.account_active ? 'login' : 'disabled'}
                  </Badge>
                )}
              </div>
            </div>

            {menuActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost"
                          className="h-8 w-8 text-gym-gold/50 hover:text-gym-gold shrink-0"
                          aria-label="More actions">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                  {menuActions.map((a) => (
                    <DropdownMenuItem key={a.key} onClick={() => a.fn(worker)}
                                      className="cursor-pointer focus:bg-gym-gold/15 focus:text-gym-gold">
                      <a.icon className="w-4 h-4 mr-2" />{a.label}
                    </DropdownMenuItem>
                  ))}
                  {can('delete') && (
                    <>
                      <DropdownMenuSeparator className="bg-gym-gold/20" />
                      <DropdownMenuItem onClick={() => setConfirmOpen(true)}
                                        className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-400">
                        <Trash2 className="w-4 h-4 mr-2" />Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Facts */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-gym-gold/60">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{worker.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-gym-gold/60">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span>Since {worker.start_date}</span>
            </div>
            <div className="flex items-center gap-2 text-gym-gold/60">
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>
                {worker.pay_enabled
                  ? `${formatDZD(worker.pay_amount)} / ${worker.pay_type === 'daily' ? 'day' : 'month'}`
                  : 'Not paid via app'}
              </span>
            </div>
          </div>

          {/* Primary actions */}
          <div className="flex gap-2 pt-1">
            {can('view') && (
              <Button size="sm" variant="outline" onClick={() => onView(worker)}
                      className="flex-1 border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                <Eye className="w-3.5 h-3.5 mr-1.5" />View
              </Button>
            )}
            {can('edit') && (
              <Button size="sm" variant="outline" onClick={() => onEdit(worker)}
                      className="flex-1 border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
              </Button>
            )}
            {can('delete') && (
              <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}
                      className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {worker.full_name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              This permanently removes the worker along with their permissions, advances,
              absences and payment history. Their login account is removed too.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(worker)}
                               className="bg-red-600 text-white hover:bg-red-700">
              Delete worker
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
