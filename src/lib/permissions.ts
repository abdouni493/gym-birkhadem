/**
 * The single catalog of every interface (sidebar entry) and every button action
 * inside it.
 *
 * This drives three things at once, which is why it lives in one place:
 *   1. the Permissions dialog (Workers -> Permissions) renders straight from it
 *   2. the Sidebar decides which entries to show
 *   3. `can()` gates individual buttons
 *
 * The `key` values MUST match the interface_key / action_key strings used by the
 * RLS policies in supabase_schema.sql. The UI hiding a button is only a
 * convenience — the database is what actually enforces access. If you add an
 * interface here, add matching policies there too, or the UI will show controls
 * that fail on save.
 */

export type ActionKey = string;

export interface ActionDef {
  key: ActionKey;
  label: string;
  /** Explains a non-obvious action in the permissions dialog. */
  hint?: string;
}

export interface InterfaceDef {
  key: string;
  label: string;
  /** Route path; null for interfaces with no standalone page. */
  path: string | null;
  /** lucide-react icon name, resolved by the Sidebar and permissions dialog. */
  icon: string;
  actions: ActionDef[];
}

/** Actions shared by most CRUD screens. */
const CRUD: ActionDef[] = [
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
];

export const INTERFACES: InterfaceDef[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'Home',
    actions: [{ key: 'view_revenue', label: 'See revenue figures', hint: 'Hides money totals when off' }],
  },
  {
    key: 'athletes',
    label: 'Athletes',
    path: '/athletes',
    icon: 'Users',
    actions: [
      ...CRUD,
      { key: 'view', label: 'View details' },
      { key: 'subscribe', label: 'Add subscription' },
      { key: 'free_session', label: 'Séance libre', hint: 'Create and see free sessions' },
      { key: 'credit', label: 'Manage credit' },
    ],
  },
  {
    key: 'scanner',
    label: 'Scanner',
    path: '/scanner',
    icon: 'Barcode',
    actions: [
      { key: 'scan', label: 'Scan cards' },
      { key: 'create_card', label: 'Create membership card' },
    ],
  },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    path: '/subscriptions',
    icon: 'CalendarCheck',
    actions: CRUD,
  },
  {
    key: 'products',
    label: 'Stock',
    path: '/products',
    icon: 'List',
    actions: [...CRUD, { key: 'adjust_stock', label: 'Adjust stock' }],
  },
  {
    key: 'purchase_invoices',
    label: 'Purchases',
    path: '/purchase-invoices',
    icon: 'FileText',
    actions: [...CRUD, { key: 'pay', label: 'Record payment' }],
  },
  {
    key: 'pos',
    label: 'POS',
    path: '/pos',
    icon: 'DollarSign',
    actions: [
      { key: 'sell', label: 'Make a sale' },
      { key: 'discount', label: 'Apply discount' },
      { key: 'refund', label: 'Refund' },
    ],
  },
  {
    key: 'invoices',
    label: 'Sales',
    path: '/invoices',
    icon: 'Bell',
    actions: [...CRUD, { key: 'print', label: 'Print' }],
  },
  {
    key: 'clients',
    label: 'Clients',
    path: '/clients',
    icon: 'Contact',
    actions: CRUD,
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    path: '/suppliers',
    icon: 'Truck',
    actions: CRUD,
  },
  {
    key: 'workers',
    label: 'Workers',
    path: '/workers',
    icon: 'User',
    actions: [
      ...CRUD,
      { key: 'view', label: 'View worker details' },
      { key: 'permissions', label: 'Manage permissions', hint: 'Lets this worker grant access to others — give sparingly' },
      { key: 'acompte', label: 'Acompte (advances)' },
      { key: 'absence', label: 'Absences' },
      { key: 'payment', label: 'Pay salary' },
      { key: 'account', label: 'Create login account' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    path: '/expenses',
    icon: 'TrendingDown',
    actions: CRUD,
  },
  {
    key: 'caisse',
    label: 'Caisse',
    path: '/caisse',
    icon: 'Wallet',
    actions: [
      { key: 'create', label: 'New transaction' },
      { key: 'edit', label: 'Edit transaction' },
      { key: 'delete', label: 'Delete transaction' },
      { key: 'view_history', label: 'See transaction history' },
      { key: 'view_balance', label: 'See caisse balance' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: 'BarChart3',
    actions: [{ key: 'export', label: 'Export / print' }],
  },
  {
    key: 'cards',
    label: 'Cards',
    path: '/cards',
    icon: 'CreditCard',
    actions: [
      { key: 'generate', label: 'Generate card' },
      { key: 'print', label: 'Print card' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'Settings',
    actions: [{ key: 'edit', label: 'Change settings' }],
  },
];

export const INTERFACE_BY_KEY: Record<string, InterfaceDef> = Object.fromEntries(
  INTERFACES.map((i) => [i.key, i]),
);

/** A permission row as stored in worker_permissions. action_key null = the interface itself. */
export interface PermissionRow {
  interface_key: string;
  action_key: string | null;
}

/**
 * A resolved permission set for the signed-in user.
 * `admin` short-circuits every check, mirroring public.is_admin() in the DB.
 */
export class PermissionSet {
  private readonly interfaces: Set<string>;
  private readonly actions: Set<string>;

  constructor(rows: PermissionRow[], public readonly admin: boolean) {
    this.interfaces = new Set();
    this.actions = new Set();
    for (const r of rows) {
      if (r.action_key === null) this.interfaces.add(r.interface_key);
      else this.actions.add(`${r.interface_key}:${r.action_key}`);
    }
  }

  /** Is this interface visible in the sidebar? */
  canView(interfaceKey: string): boolean {
    return this.admin || this.interfaces.has(interfaceKey);
  }

  /** Is this button action allowed? */
  can(interfaceKey: string, action: ActionKey): boolean {
    return this.admin || this.actions.has(`${interfaceKey}:${action}`);
  }

  /** Interfaces this user may see, in catalog order. */
  visibleInterfaces(): InterfaceDef[] {
    return INTERFACES.filter((i) => this.canView(i.key));
  }

  static empty(): PermissionSet {
    return new PermissionSet([], false);
  }
}
