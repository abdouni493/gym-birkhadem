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
  labelAr: string;
  /** Explains a non-obvious action in the permissions dialog. */
  hint?: string;
  hintAr?: string;
}

export interface InterfaceDef {
  key: string;
  label: string;
  labelAr: string;
  /** Route path; null for interfaces with no standalone page. */
  path: string | null;
  /** lucide-react icon name, resolved by the Sidebar and permissions dialog. */
  icon: string;
  actions: ActionDef[];
}

/** Actions shared by most CRUD screens. */
const CRUD: ActionDef[] = [
  { key: 'create', label: 'Créer', labelAr: 'إنشاء' },
  { key: 'edit', label: 'Modifier', labelAr: 'تعديل' },
  { key: 'delete', label: 'Supprimer', labelAr: 'حذف' },
];

export const INTERFACES: InterfaceDef[] = [
  {
    key: 'dashboard',
    label: 'Tableau de bord', labelAr: 'لوحة التحكم',
    path: '/dashboard',
    icon: 'Home',
    actions: [{ key: 'view_revenue', label: 'Voir les chiffres de revenus', labelAr: 'عرض أرقام الإيرادات', hint: 'Masque les montants si désactivé', hintAr: 'يخفي المبالغ عند التعطيل' }],
  },
  {
    key: 'athletes',
    label: 'Athlètes', labelAr: 'الرياضيون',
    path: '/athletes',
    icon: 'Users',
    actions: [
      ...CRUD,
      { key: 'view', label: 'Voir les détails', labelAr: 'عرض التفاصيل' },
      { key: 'subscribe', label: 'Ajouter / payer un abonnement', labelAr: 'إضافة / دفع اشتراك' },
      { key: 'free_session', label: 'Séance libre', labelAr: 'حصة حرة', hint: 'Créer et voir les séances libres', hintAr: 'إنشاء وعرض الحصص الحرة' },
      { key: 'credit', label: 'Gérer le crédit', labelAr: 'إدارة الرصيد' },
    ],
  },
  {
    key: 'scanner',
    label: 'Scanner', labelAr: 'الماسح',
    path: '/scanner',
    icon: 'Barcode',
    actions: [
      { key: 'scan', label: 'Scanner les cartes', labelAr: 'مسح البطاقات' },
      { key: 'create_card', label: 'Lier une carte RFID', labelAr: 'ربط بطاقة RFID' },
    ],
  },
  {
    key: 'subscriptions',
    label: 'Abonnements', labelAr: 'الاشتراكات',
    path: '/subscriptions',
    icon: 'CalendarCheck',
    actions: CRUD,
  },
  {
    key: 'products',
    label: 'Stock', labelAr: 'المخزون',
    path: '/products',
    icon: 'List',
    actions: [...CRUD, { key: 'adjust_stock', label: 'Ajuster le stock', labelAr: 'تعديل المخزون' }],
  },
  {
    key: 'purchase_invoices',
    label: 'Achats', labelAr: 'المشتريات',
    path: '/purchase-invoices',
    icon: 'FileText',
    actions: [...CRUD, { key: 'pay', label: 'Enregistrer un paiement', labelAr: 'تسجيل دفعة' }],
  },
  {
    key: 'pos',
    label: 'Point de vente', labelAr: 'نقطة البيع',
    path: '/pos',
    icon: 'DollarSign',
    actions: [
      { key: 'sell', label: 'Effectuer une vente', labelAr: 'إجراء عملية بيع' },
      { key: 'discount', label: 'Appliquer une remise', labelAr: 'تطبيق خصم' },
      { key: 'refund', label: 'Rembourser', labelAr: 'استرجاع' },
    ],
  },
  {
    key: 'invoices',
    label: 'Ventes', labelAr: 'المبيعات',
    path: '/invoices',
    icon: 'Bell',
    actions: [...CRUD, { key: 'print', label: 'Imprimer', labelAr: 'طباعة' }],
  },
  {
    key: 'clients',
    label: 'Clients', labelAr: 'الزبائن',
    path: '/clients',
    icon: 'Contact',
    actions: CRUD,
  },
  {
    key: 'suppliers',
    label: 'Fournisseurs', labelAr: 'الموردون',
    path: '/suppliers',
    icon: 'Truck',
    actions: CRUD,
  },
  {
    key: 'workers',
    label: 'Employés', labelAr: 'العمال',
    path: '/workers',
    icon: 'User',
    actions: [
      ...CRUD,
      { key: 'view', label: 'Voir les détails de l’employé', labelAr: 'عرض تفاصيل العامل' },
      { key: 'permissions', label: 'Gérer les permissions', labelAr: 'إدارة الصلاحيات', hint: 'Permet d’accorder des accès aux autres — à donner avec prudence', hintAr: 'يسمح بمنح الصلاحيات للآخرين — امنحها بحذر' },
      { key: 'acompte', label: 'Acomptes (avances)', labelAr: 'التسبيقات' },
      { key: 'absence', label: 'Absences', labelAr: 'الغيابات' },
      { key: 'payment', label: 'Payer le salaire', labelAr: 'دفع الراتب' },
      { key: 'account', label: 'Créer un compte de connexion', labelAr: 'إنشاء حساب دخول' },
    ],
  },
  {
    key: 'expenses',
    label: 'Dépenses', labelAr: 'المصاريف',
    path: '/expenses',
    icon: 'TrendingDown',
    actions: CRUD,
  },
  {
    key: 'caisse',
    label: 'Caisse', labelAr: 'الصندوق',
    path: '/caisse',
    icon: 'Wallet',
    actions: [
      { key: 'create', label: 'Nouvelle opération', labelAr: 'عملية جديدة' },
      { key: 'edit', label: 'Modifier une opération', labelAr: 'تعديل عملية' },
      { key: 'delete', label: 'Supprimer une opération', labelAr: 'حذف عملية' },
      { key: 'view_history', label: 'Voir l’historique des opérations', labelAr: 'عرض سجل العمليات' },
      { key: 'view_balance', label: 'Voir le solde de la caisse', labelAr: 'عرض رصيد الصندوق' },
    ],
  },
  {
    key: 'reports',
    label: 'Rapports', labelAr: 'التقارير',
    path: '/reports',
    icon: 'BarChart3',
    actions: [{ key: 'export', label: 'Exporter / imprimer', labelAr: 'تصدير / طباعة' }],
  },
  {
    key: 'settings',
    label: 'Paramètres', labelAr: 'الإعدادات',
    path: '/settings',
    icon: 'Settings',
    actions: [{ key: 'edit', label: 'Modifier les paramètres', labelAr: 'تعديل الإعدادات' }],
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
