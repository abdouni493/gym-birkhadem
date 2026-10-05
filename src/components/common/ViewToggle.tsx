import React from 'react';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'cards' | 'table';

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  cardsLabel?: string;
  tableLabel?: string;
}

/** Small segmented control to switch between card and table views. */
export const ViewToggle: React.FC<ViewToggleProps> = ({ mode, onChange, cardsLabel, tableLabel }) => (
  <div className="inline-flex rounded-lg border border-gym-gold/30 overflow-hidden">
    <button
      type="button"
      onClick={() => onChange('cards')}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
        mode === 'cards' ? 'bg-gym-gold text-gym-black' : 'text-gym-gold hover:bg-gym-gold/10',
      )}
    >
      <LayoutGrid className="w-4 h-4" />
      {cardsLabel && <span className="hidden sm:inline">{cardsLabel}</span>}
    </button>
    <button
      type="button"
      onClick={() => onChange('table')}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
        mode === 'table' ? 'bg-gym-gold text-gym-black' : 'text-gym-gold hover:bg-gym-gold/10',
      )}
    >
      <TableIcon className="w-4 h-4" />
      {tableLabel && <span className="hidden sm:inline">{tableLabel}</span>}
    </button>
  </div>
);
