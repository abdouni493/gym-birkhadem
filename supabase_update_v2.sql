-- =============================================================================
-- GYM — mise à jour v2  (idempotent : peut être exécutée plusieurs fois)
-- =============================================================================
-- À exécuter dans Supabase -> SQL Editor sur une base déjà créée avec
-- supabase_schema.sql. Ajoute :
--   * frais supplémentaires des athlètes (avec lien optionnel vers le stock)
--   * paiements de dettes des athlètes
--   * présences / absences des athlètes (manuelles + scans)
--   * catégories de dépenses
-- et met à jour les vues financières et les politiques RLS concernées.
-- =============================================================================

-- ---- Catégories de dépenses -------------------------------------------------
create table if not exists public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.expenses
  add column if not exists category_id uuid references public.expense_categories(id) on delete set null;
create index if not exists expenses_category_idx on public.expenses(category_id);
create index if not exists expenses_date_idx     on public.expenses(expense_date);

-- ---- Frais supplémentaires --------------------------------------------------
create table if not exists public.athlete_extra_fees (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  name         text not null,
  description  text,
  product_id   uuid references public.products(id) on delete set null,
  quantity     numeric(12,2) not null default 1 check (quantity > 0),
  unit_price   numeric(12,2) not null default 0 check (unit_price >= 0),
  total        numeric(14,2) generated always as (quantity * unit_price) stored,
  amount_paid  numeric(14,2) not null default 0 check (amount_paid >= 0),
  remaining    numeric(14,2) generated always as (greatest(quantity * unit_price - amount_paid, 0)) stored,
  fee_date     date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists athlete_extra_fees_athlete_idx on public.athlete_extra_fees(athlete_id);
create index if not exists athlete_extra_fees_date_idx    on public.athlete_extra_fees(fee_date);

-- ---- Paiements de dettes ----------------------------------------------------
-- `allocations` garde le détail : [{kind:'subscription'|'fee', id, label, amount}]
create table if not exists public.athlete_payments (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  amount        numeric(14,2) not null check (amount > 0),
  payment_date  date not null default current_date,
  description   text,
  allocations   jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists athlete_payments_athlete_idx on public.athlete_payments(athlete_id);
create index if not exists athlete_payments_date_idx    on public.athlete_payments(payment_date);

-- ---- Présences / absences ---------------------------------------------------
create table if not exists public.athlete_attendance (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  att_date    date not null default current_date,
  att_time    time not null default localtime,
  status      text not null default 'present' check (status in ('present', 'absent')),
  source      text not null default 'manual' check (source in ('manual', 'scan')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists athlete_attendance_athlete_idx on public.athlete_attendance(athlete_id);
create index if not exists athlete_attendance_date_idx    on public.athlete_attendance(att_date);

-- ---- RLS --------------------------------------------------------------------
alter table public.expense_categories  enable row level security;
alter table public.athlete_extra_fees  enable row level security;
alter table public.athlete_payments    enable row level security;
alter table public.athlete_attendance  enable row level security;

grant select, insert, update, delete on public.expense_categories, public.athlete_extra_fees,
  public.athlete_payments, public.athlete_attendance to authenticated;
revoke all on public.expense_categories, public.athlete_extra_fees,
  public.athlete_payments, public.athlete_attendance from anon;

drop policy if exists expcat_select on public.expense_categories;
drop policy if exists expcat_insert on public.expense_categories;
drop policy if exists expcat_delete on public.expense_categories;
create policy expcat_select on public.expense_categories for select to authenticated using (public.is_staff());
create policy expcat_insert on public.expense_categories for insert to authenticated
  with check (public.can_do_any(array['expenses:create','expenses:edit']));
create policy expcat_delete on public.expense_categories for delete to authenticated
  using (public.can_do('expenses', 'delete'));

drop policy if exists fee_select on public.athlete_extra_fees;
drop policy if exists fee_insert on public.athlete_extra_fees;
drop policy if exists fee_update on public.athlete_extra_fees;
drop policy if exists fee_delete on public.athlete_extra_fees;
create policy fee_select on public.athlete_extra_fees for select to authenticated
  using (public.can_view_any(array['athletes','caisse','reports','dashboard']));
create policy fee_insert on public.athlete_extra_fees for insert to authenticated
  with check (public.can_do_any(array['athletes:edit','athletes:subscribe','athletes:create']));
create policy fee_update on public.athlete_extra_fees for update to authenticated
  using (public.can_do_any(array['athletes:edit','athletes:subscribe']))
  with check (public.can_do_any(array['athletes:edit','athletes:subscribe']));
create policy fee_delete on public.athlete_extra_fees for delete to authenticated
  using (public.can_do_any(array['athletes:edit','athletes:delete']));

drop policy if exists apay_select on public.athlete_payments;
drop policy if exists apay_insert on public.athlete_payments;
drop policy if exists apay_delete on public.athlete_payments;
create policy apay_select on public.athlete_payments for select to authenticated
  using (public.can_view_any(array['athletes','caisse','reports','dashboard']));
create policy apay_insert on public.athlete_payments for insert to authenticated
  with check (public.can_do_any(array['athletes:subscribe','athletes:edit']));
create policy apay_delete on public.athlete_payments for delete to authenticated
  using (public.can_do('athletes', 'delete'));

drop policy if exists att_select on public.athlete_attendance;
drop policy if exists att_insert on public.athlete_attendance;
drop policy if exists att_delete on public.athlete_attendance;
create policy att_select on public.athlete_attendance for select to authenticated
  using (public.can_view_any(array['athletes','scanner','dashboard','reports']));
create policy att_insert on public.athlete_attendance for insert to authenticated
  with check (public.can_view_any(array['athletes','scanner']));
create policy att_delete on public.athlete_attendance for delete to authenticated
  using (public.can_do('athletes', 'edit'));

-- Frais liés au stock : l'interface Athlètes doit pouvoir lire et décrémenter le stock.
drop policy if exists prod_select on public.products;
drop policy if exists prod_update on public.products;
create policy prod_select on public.products for select to authenticated
  using (public.can_view_any(array['products','pos','purchase_invoices','invoices','dashboard','athletes','reports']));
create policy prod_update on public.products for update to authenticated
  using (public.can_do_any(array['products:edit','products:adjust_stock','pos:sell',
                                 'purchase_invoices:create','invoices:edit','athletes:edit','athletes:subscribe']))
  with check (public.can_do_any(array['products:edit','products:adjust_stock','pos:sell',
                                      'purchase_invoices:create','invoices:edit','athletes:edit','athletes:subscribe']));

-- Les rapports affichent aussi les ventes / achats / employés.
drop policy if exists cats_select on public.categories;
create policy cats_select on public.categories for select to authenticated using (public.is_staff());

-- ---- Vues financières -------------------------------------------------------
-- Les frais supplémentaires payés deviennent une recette.
-- Paiements de dettes : chaque paiement est daté du jour où il a été encaissé.
-- La part d'un abonnement / frais réglée plus tard est donc retirée de sa ligne
-- d'origine et apparaît à la date du paiement (source 'debt_payment').
create or replace view public.v_payment_allocations as
select p.id as payment_id, al->>'kind' as kind, (al->>'id')::uuid as item_id,
       (al->>'amount')::numeric as amount
  from public.athlete_payments p, jsonb_array_elements(p.allocations) al;

create or replace view public.v_revenue_stream as
select * from (
  select 'subscription'::text as source, 'athletes'::text as interface_key, s.id as ref_id,
         s.payment_date as entry_date,
         s.amount_paid - coalesce((select sum(v.amount) from public.v_payment_allocations v
                                    where v.kind = 'subscription' and v.item_id = s.id), 0) as amount,
         a.full_name as label, s.name as detail
    from public.athlete_subscriptions s join public.athletes a on a.id = s.athlete_id
   where s.amount_paid > 0
  union all
  select 'debt_payment', 'athletes', p.id, p.payment_date, p.amount,
         a.full_name, coalesce(p.description, 'Paiement de dette')
    from public.athlete_payments p join public.athletes a on a.id = p.athlete_id
  union all
  select 'free_session', 'athletes', f.id, f.session_date, f.price,
         coalesce(a.full_name, f.passenger_name, 'Passager'), 'Séance libre'
    from public.free_sessions f left join public.athletes a on a.id = f.athlete_id
   where f.price > 0
  union all
  select 'extra_fee', 'athletes', x.id, x.fee_date,
         x.amount_paid - coalesce((select sum(v.amount) from public.v_payment_allocations v
                                    where v.kind = 'fee' and v.item_id = x.id), 0),
         a.full_name, x.name
    from public.athlete_extra_fees x join public.athletes a on a.id = x.athlete_id
   where x.amount_paid > 0
  union all
  select 'sale', 'invoices', i.id, i.creation_date, i.amount_paid,
         i.customer_name, i.invoice_number
    from public.sales_invoices i
   where i.amount_paid > 0
  union all
  select 'cash_deposit', 'caisse', c.id, c.transaction_date, c.amount,
         coalesce(c.description, 'Dépôt'), 'Caisse'
    from public.cash_transactions c
   where c.direction = 'deposit'
) r
where public.can_view_any(array['caisse', 'reports', 'dashboard']);

create or replace view public.v_expense_stream as
select * from (
  select 'expense'::text as source, 'expenses'::text as interface_key, e.id as ref_id,
         e.expense_date as entry_date, e.amount as amount,
         e.name as label, coalesce(ec.name, coalesce(e.notes, '')) as detail
    from public.expenses e left join public.expense_categories ec on ec.id = e.category_id
  union all
  select 'worker_payment', 'workers', p.id, p.payment_date, p.final_amount,
         w.full_name, coalesce(p.description, 'Salaire')
    from public.worker_payments p join public.workers w on w.id = p.worker_id
  union all
  select 'worker_acompte', 'workers', a.id, a.acompte_date, a.amount,
         w.full_name, coalesce(a.description, 'Acompte')
    from public.worker_acomptes a join public.workers w on w.id = a.worker_id
  union all
  select 'purchase', 'purchase_invoices', pi.id, pi.invoice_date, pi.amount_paid,
         coalesce(su.name, 'Fournisseur'), pi.invoice_number
    from public.purchase_invoices pi left join public.suppliers su on su.id = pi.supplier_id
   where pi.amount_paid > 0
  union all
  select 'cash_withdraw', 'caisse', c.id, c.transaction_date, c.amount,
         coalesce(c.description, 'Retrait'), 'Caisse'
    from public.cash_transactions c
   where c.direction = 'withdraw'
) x
where public.can_view_any(array['caisse', 'reports', 'dashboard']);

grant select on public.v_revenue_stream, public.v_expense_stream to authenticated;
revoke all on public.v_payment_allocations from anon, authenticated;

-- ---- L'interface « Cartes » a été retirée de l'application ------------------
delete from public.worker_permissions where interface_key = 'cards';

notify pgrst, 'reload schema';
