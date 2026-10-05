-- =============================================================================
-- GYM MANAGEMENT — full Supabase schema
-- =============================================================================
-- Run this whole file once in Supabase -> SQL Editor (as the default `postgres`
-- role). It is idempotent: re-running it keeps existing data, replaces
-- functions/views and re-creates every policy.
--
-- Contents
--   1. Extensions
--   2. Tables + relations (every interface of the app)
--   3. Permission helpers (is_admin / can_view / can_do …)
--   4. Auth RPCs: bootstrap_admin, admin_exists, manage_worker_account
--      -> admin AND worker accounts are created in auth.users / auth.identities
--   5. Guards (triggers)
--   6. Views (caisse / reports / outstanding)
--   7. Row Level Security — one block per interface, matching src/lib/permissions.ts
--   8. Storage buckets + policies (images)
--   9. Seed data
--
-- Permission model
--   worker_permissions rows:  (worker_id, interface_key, action_key)
--     action_key IS NULL  -> the worker can SEE that interface (sidebar entry)
--     action_key = 'edit' -> the worker can use that button action
--   Admins (role.is_admin = true) bypass every check.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
create extension if not exists pgcrypto with schema extensions;


-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ---- Workers / roles / permissions -----------------------------------------

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.workers (
  id              uuid primary key default gen_random_uuid(),
  first_name      text not null,
  last_name       text not null,
  full_name       text generated always as (trim(first_name || ' ' || last_name)) stored,
  birthday        date,
  id_card_number  text,
  phone           text,
  email           text,
  address         text,
  photo_url       text,
  role_id         uuid references public.roles(id) on delete set null,
  pay_enabled     boolean not null default false,
  pay_type        text check (pay_type in ('daily', 'monthly')),
  pay_amount      numeric(12,2) not null default 0 check (pay_amount >= 0),
  start_date      date not null default current_date,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  user_id         uuid unique references auth.users(id) on delete set null,
  username        text unique,
  account_active  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint workers_pay_chk check (not pay_enabled or pay_type is not null)
);
create index if not exists workers_role_idx on public.workers(role_id);

create table if not exists public.worker_permissions (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references public.workers(id) on delete cascade,
  interface_key  text not null,
  action_key     text,               -- null = can view the interface
  created_at     timestamptz not null default now(),
  constraint worker_permissions_uniq unique nulls not distinct (worker_id, interface_key, action_key)
);
create index if not exists worker_permissions_worker_idx on public.worker_permissions(worker_id);

create table if not exists public.worker_payments (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references public.workers(id) on delete cascade,
  period_start        date not null,
  period_end          date not null,
  gross_amount        numeric(12,2) not null default 0,
  acomptes_total      numeric(12,2) not null default 0,
  absences_total      numeric(12,2) not null default 0,
  computed_amount     numeric(12,2) not null default 0,
  final_amount        numeric(12,2) not null default 0,
  is_manual_override  boolean not null default false,
  payment_date        date not null default current_date,
  description         text,
  created_at          timestamptz not null default now()
);
create index if not exists worker_payments_worker_idx on public.worker_payments(worker_id);

create table if not exists public.worker_acomptes (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references public.workers(id) on delete cascade,
  acompte_date        date not null default current_date,
  description         text,
  amount              numeric(12,2) not null check (amount >= 0),
  settled_payment_id  uuid references public.worker_payments(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists worker_acomptes_worker_idx on public.worker_acomptes(worker_id);

create table if not exists public.worker_absences (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references public.workers(id) on delete cascade,
  absence_date        date not null default current_date,
  description         text,
  cost                numeric(12,2) not null default 0 check (cost >= 0),
  settled_payment_id  uuid references public.worker_payments(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists worker_absences_worker_idx on public.worker_absences(worker_id);

-- ---- Athletes / subscriptions ----------------------------------------------

create table if not exists public.sports (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  duration    integer not null default 30 check (duration >= 0),   -- days, 0 = open
  sessions    integer check (sessions is null or sessions >= 0),   -- null = unlimited
  price       numeric(12,2) not null default 0 check (price >= 0),
  is_open     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.athletes (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  full_name            text generated always as (trim(first_name || ' ' || last_name)) stored,
  email                text,
  phone                text,
  date_of_birth        date,
  gender               text,
  address              text,
  sport_id             uuid references public.sports(id) on delete set null,
  subscription_status  text default 'inactive',
  subscription_expiry  date,
  last_payment         date,
  total_paid           numeric(12,2) not null default 0,
  account_balance      numeric(12,2) not null default 0,
  rfid_uid             text unique,
  photo_url            text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists athletes_sport_idx  on public.athletes(sport_id);
create index if not exists athletes_expiry_idx on public.athletes(subscription_expiry);

create table if not exists public.athlete_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references public.athletes(id) on delete cascade,
  subscription_id  uuid references public.subscriptions(id) on delete set null,
  name             text not null,
  price            numeric(12,2) not null default 0,
  payment_date     date not null default current_date,
  expiry_date      date,
  amount_paid      numeric(12,2) not null default 0,
  remaining        numeric(12,2) generated always as (greatest(price - amount_paid, 0)) stored,
  created_at       timestamptz not null default now()
);
create index if not exists athlete_subscriptions_athlete_idx on public.athlete_subscriptions(athlete_id);
create index if not exists athlete_subscriptions_sub_idx     on public.athlete_subscriptions(subscription_id);

create table if not exists public.athlete_credits (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  amount       numeric(12,2) not null check (amount >= 0),
  credit_date  date not null default current_date,
  description  text,
  type         text not null default 'deposit' check (type in ('deposit', 'used')),
  created_at   timestamptz not null default now()
);
create index if not exists athlete_credits_athlete_idx on public.athlete_credits(athlete_id);

create table if not exists public.seances_history (
  id                        uuid primary key default gen_random_uuid(),
  athlete_id                uuid not null references public.athletes(id) on delete cascade,
  athlete_subscription_id   uuid references public.athlete_subscriptions(id) on delete cascade,
  seances_used              integer not null default 1,
  seances_remaining         integer not null default 0,
  used_at                   timestamptz not null default now(),
  notes                     text
);
create index if not exists seances_history_athlete_idx on public.seances_history(athlete_id);
create index if not exists seances_history_sub_idx     on public.seances_history(athlete_subscription_id);

create table if not exists public.free_sessions (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid references public.athletes(id) on delete set null,
  passenger_name  text,
  price           numeric(12,2) not null default 0 check (price >= 0),
  session_date    date not null default current_date,
  session_time    time not null default localtime,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint free_sessions_who_chk check (athlete_id is not null or passenger_name is not null)
);
create index if not exists free_sessions_date_idx on public.free_sessions(session_date);

-- ---- Stock / suppliers / purchases -----------------------------------------

create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text,
  address             text,
  total_purchases     numeric(14,2) not null default 0,
  last_purchase_date  date,
  created_at          timestamptz not null default now()
);

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  barcode           text unique,
  name              text not null,
  category_id       uuid references public.categories(id) on delete set null,
  brand_id          uuid references public.brands(id) on delete set null,
  supplier_id       uuid references public.suppliers(id) on delete set null,
  real_price        numeric(12,2) not null default 0,
  sell_price        numeric(12,2) not null default 0,
  initial_quantity  numeric(12,2) not null default 0,
  current_stock     numeric(12,2) not null default 0,
  sold              numeric(12,2) not null default 0,
  expiry_date       date,
  description       text,
  min_stock_level   numeric(12,2) not null default 5,
  location          text,
  image_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_brand_idx    on public.products(brand_id);
create index if not exists products_supplier_idx on public.products(supplier_id);

create table if not exists public.purchase_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  total_amount    numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  invoice_date    date not null default current_date,
  status          text not null default 'pending' check (status in ('paid', 'partial', 'pending')),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists purchase_invoices_supplier_idx on public.purchase_invoices(supplier_id);

create table if not exists public.purchase_invoice_items (
  id                   uuid primary key default gen_random_uuid(),
  purchase_invoice_id  uuid not null references public.purchase_invoices(id) on delete cascade,
  product_id           uuid references public.products(id) on delete set null,
  product_name         text not null,
  barcode              text,
  quantity             numeric(12,2) not null default 1,
  purchase_price       numeric(12,2) not null default 0,
  selling_price        numeric(12,2) not null default 0,
  min_stock_level      numeric(12,2),
  expiry_date          date,
  line_total           numeric(14,2) generated always as (quantity * purchase_price) stored
);
create index if not exists purchase_items_invoice_idx on public.purchase_invoice_items(purchase_invoice_id);

-- ---- Clients / POS / sales -------------------------------------------------

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.sales_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,
  client_id       uuid references public.clients(id) on delete set null,
  customer_name   text not null default 'Client',
  client_phone    text,
  creation_date   date not null default current_date,
  status          text not null default 'paid' check (status in ('paid', 'debt')),
  subtotal        numeric(14,2) not null default 0,
  discount        numeric(14,2) not null default 0,
  total_amount    numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  payment_method  text,
  created_at      timestamptz not null default now()
);
create index if not exists sales_invoices_client_idx on public.sales_invoices(client_id);
create index if not exists sales_invoices_date_idx   on public.sales_invoices(creation_date);

create table if not exists public.sales_invoice_items (
  id                uuid primary key default gen_random_uuid(),
  sales_invoice_id  uuid not null references public.sales_invoices(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  name              text not null,
  type              text not null default 'produit',
  quantity          numeric(12,2) not null default 1,
  unit_price        numeric(12,2) not null default 0,
  total             numeric(14,2) generated always as (quantity * unit_price) stored
);
create index if not exists sales_items_invoice_idx on public.sales_invoice_items(sales_invoice_id);

-- ---- Money -----------------------------------------------------------------

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  expense_date  date not null default current_date,
  notes         text,
  receipt_url   text,
  created_at    timestamptz not null default now()
);

create table if not exists public.cash_transactions (
  id                uuid primary key default gen_random_uuid(),
  direction         text not null check (direction in ('deposit', 'withdraw')),
  amount            numeric(12,2) not null check (amount > 0),
  transaction_date  date not null default current_date,
  description       text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

-- ---- Settings --------------------------------------------------------------

create table if not exists public.store_settings (
  id           text primary key default 'store' check (id = 'store'),
  name         text,
  description  text,
  email        text,
  phone        text,
  address      text,
  nif          text,
  nis          text,
  article      text,
  rc           text,
  logo_url     text,
  currency     text default 'DZD',
  updated_at   timestamptz not null default now()
);


-- =============================================================================
-- 3. PERMISSION HELPERS
-- =============================================================================
-- SECURITY DEFINER so they can read workers/roles/worker_permissions without
-- recursing into those tables' own RLS policies.

create or replace function public.current_worker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select w.id from public.workers w
  where w.user_id = auth.uid() and w.status = 'active'
  limit 1;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers w
    where w.user_id = auth.uid() and w.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers w
    join public.roles r on r.id = w.role_id
    where w.user_id = auth.uid() and w.status = 'active' and r.is_admin
  );
$$;

-- Can the current user SEE this interface?
create or replace function public.can_view(p_interface text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.worker_permissions p
    where p.worker_id = public.current_worker_id()
      and p.interface_key = p_interface
      and p.action_key is null
  );
$$;

-- Can the current user use this button action?
create or replace function public.can_do(p_interface text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.worker_permissions p
    where p.worker_id = public.current_worker_id()
      and p.interface_key = p_interface
      and p.action_key = p_action
  );
$$;

-- Any of several interfaces visible?  can_view_any(array['athletes','scanner'])
create or replace function public.can_view_any(p_interfaces text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.worker_permissions p
    where p.worker_id = public.current_worker_id()
      and p.action_key is null
      and p.interface_key = any(p_interfaces)
  );
$$;

-- Any of several 'interface:action' pairs allowed?  can_do_any(array['pos:sell','invoices:edit'])
create or replace function public.can_do_any(p_pairs text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.worker_permissions p
    where p.worker_id = public.current_worker_id()
      and p.action_key is not null
      and (p.interface_key || ':' || p.action_key) = any(p_pairs)
  );
$$;


-- =============================================================================
-- 4. AUTH RPCs  (accounts live in auth.users + auth.identities)
-- =============================================================================

-- Internal: create a confirmed email/password user that can sign in at once.
create or replace function public._create_auth_user(p_email text, p_password text, p_meta jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address' using errcode = '22023';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'A login account with this email already exists' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- GoTrue scans these as strings: NULL breaks sign-in, so use ''.
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, coalesce(p_meta, '{}'::jsonb),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_id;
end;
$$;
revoke all on function public._create_auth_user(text, text, jsonb) from public, anon, authenticated;

-- Has the first administrator been created? (login page uses it to hide the button)
create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers w
    join public.roles r on r.id = w.role_id
    where r.is_admin and w.user_id is not null
  );
$$;
grant execute on function public.admin_exists() to anon, authenticated;

-- First-run: create the administrator. Refuses once any admin exists.
create or replace function public.bootstrap_admin(
  p_email text, p_password text,
  p_first_name text default 'Admin', p_last_name text default 'User',
  p_username text default null
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user   uuid;
  v_role   uuid;
  v_worker uuid;
begin
  -- serialise concurrent first-run attempts
  perform pg_advisory_xact_lock(hashtext('bootstrap_admin'));

  if public.admin_exists() then
    raise exception 'An administrator already exists. Sign in instead.' using errcode = '42501';
  end if;

  select id into v_role from public.roles where is_admin order by created_at limit 1;
  if v_role is null then
    insert into public.roles (name, is_admin) values ('Administrator', true) returning id into v_role;
  end if;

  v_user := public._create_auth_user(
    p_email, p_password,
    jsonb_build_object('full_name', trim(coalesce(p_first_name,'') || ' ' || coalesce(p_last_name,'')), 'role', 'admin')
  );

  insert into public.workers (first_name, last_name, email, role_id, user_id, username, account_active, status)
  values (coalesce(nullif(trim(p_first_name), ''), 'Admin'),
          coalesce(nullif(trim(p_last_name), ''), 'User'),
          lower(trim(p_email)), v_role, v_user, nullif(trim(p_username), ''), true, 'active')
  returning id into v_worker;

  return v_worker;
end;
$$;
grant execute on function public.bootstrap_admin(text, text, text, text, text) to anon, authenticated;

-- Create / change password / enable-disable / delete a worker's login.
-- Requires the 'workers:account' permission (admins always have it).
create or replace function public.manage_worker_account(
  p_action    text,
  p_worker_id uuid,
  p_email     text    default null,
  p_password  text    default null,
  p_username  text    default null,
  p_active    boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  w       public.workers%rowtype;
  v_admin boolean;
  v_user  uuid;
begin
  if not public.can_do('workers', 'account') then
    raise exception 'You do not have permission to manage worker accounts.' using errcode = '42501';
  end if;

  select * into w from public.workers where id = p_worker_id for update;
  if not found then
    raise exception 'Worker not found' using errcode = 'P0002';
  end if;

  select coalesce(r.is_admin, false) into v_admin from public.roles r where r.id = w.role_id;
  if coalesce(v_admin, false) and not public.is_admin() then
    raise exception 'Only an administrator can manage an administrator account.' using errcode = '42501';
  end if;

  -- lets guard_workers() accept the account-column changes made below
  perform set_config('app.account_op', 'on', true);

  case p_action
    when 'create' then
      if w.user_id is not null then
        raise exception 'This worker already has a login account.' using errcode = '23505';
      end if;
      v_user := public._create_auth_user(
        p_email, p_password,
        jsonb_build_object('full_name', w.first_name || ' ' || w.last_name, 'worker_id', w.id)
      );
      update public.workers
         set user_id = v_user, email = lower(trim(p_email)),
             username = nullif(trim(p_username), ''), account_active = true
       where id = w.id;
      return jsonb_build_object('success', true, 'user_id', v_user);

    when 'update_password' then
      if w.user_id is null then raise exception 'This worker has no login account.'; end if;
      if p_password is null or length(p_password) < 8 then
        raise exception 'Password must be at least 8 characters' using errcode = '22023';
      end if;
      update auth.users
         set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
             updated_at = now()
       where id = w.user_id;
      return jsonb_build_object('success', true);

    when 'set_active' then
      if w.user_id is null then raise exception 'This worker has no login account.'; end if;
      update auth.users
         set banned_until = case when p_active then null else now() + interval '100 years' end,
             updated_at = now()
       where id = w.user_id;
      if not p_active then
        delete from auth.sessions where user_id = w.user_id;   -- kick live sessions
      end if;
      update public.workers set account_active = p_active where id = w.id;
      return jsonb_build_object('success', true, 'active', p_active);

    when 'delete' then
      if w.user_id is null then raise exception 'This worker has no login account.'; end if;
      if w.user_id = auth.uid() then
        raise exception 'You cannot delete your own login account.' using errcode = '42501';
      end if;
      v_user := w.user_id;
      update public.workers set user_id = null, account_active = false, username = null where id = w.id;
      delete from auth.users where id = v_user;   -- cascades identities/sessions
      return jsonb_build_object('success', true);

    else
      raise exception 'Unknown action: %', p_action using errcode = '22023';
  end case;
end;
$$;
revoke all on function public.manage_worker_account(text, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.manage_worker_account(text, uuid, text, text, text, boolean) to authenticated;

grant execute on function public.current_worker_id(), public.is_staff(), public.is_admin(),
  public.can_view(text), public.can_do(text, text),
  public.can_view_any(text[]), public.can_do_any(text[]) to authenticated;


-- =============================================================================
-- 5. GUARDS
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_workers_touch  on public.workers;
drop trigger if exists trg_athletes_touch on public.athletes;
drop trigger if exists trg_products_touch on public.products;
drop trigger if exists trg_store_touch    on public.store_settings;
create trigger trg_workers_touch  before update on public.workers        for each row execute function public.touch_updated_at();
create trigger trg_athletes_touch before update on public.athletes       for each row execute function public.touch_updated_at();
create trigger trg_products_touch before update on public.products       for each row execute function public.touch_updated_at();
create trigger trg_store_touch    before update on public.store_settings for each row execute function public.touch_updated_at();

-- Workers cannot escalate: only admins assign the admin role or touch an admin,
-- and a worker editing their own profile (Settings) may only change their name.
create or replace function public.guard_workers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_is_admin boolean;
  old_is_admin boolean;
begin
  -- direct SQL / service role: no auth.uid(), allow
  if auth.uid() is null or public.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select coalesce(is_admin, false) into new_is_admin from public.roles where id = new.role_id;
    if coalesce(new_is_admin, false) then
      raise exception 'Only an administrator can assign the administrator role.' using errcode = '42501';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select coalesce(is_admin, false) into old_is_admin from public.roles where id = old.role_id;
    if coalesce(old_is_admin, false) then
      raise exception 'Only an administrator can change an administrator.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and coalesce(current_setting('app.account_op', true), '') <> 'on' then
    -- account columns are only changed through manage_worker_account()
    if new.user_id is distinct from old.user_id or new.account_active is distinct from old.account_active then
      raise exception 'Use the account dialog to change login accounts.' using errcode = '42501';
    end if;
    -- self-edit without workers:edit -> name only
    if old.user_id = auth.uid() and not public.can_do('workers', 'edit') then
      if (new.role_id, new.status, new.pay_enabled, new.pay_type, new.pay_amount, new.start_date, new.username)
         is distinct from
         (old.role_id, old.status, old.pay_enabled, old.pay_type, old.pay_amount, old.start_date, old.username) then
        raise exception 'You can only change your own name.' using errcode = '42501';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_guard_workers on public.workers;
create trigger trg_guard_workers before insert or update or delete on public.workers
  for each row execute function public.guard_workers();

-- When a worker row is deleted, remove its auth login too (no orphan accounts).
create or replace function public.cleanup_worker_auth()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if old.user_id is not null then
    delete from auth.users where id = old.user_id;
  end if;
  return old;
end;
$$;
drop trigger if exists trg_cleanup_worker_auth on public.workers;
create trigger trg_cleanup_worker_auth after delete on public.workers
  for each row execute function public.cleanup_worker_auth();


-- =============================================================================
-- 6. VIEWS  (Caisse, Reports, Dashboard)
-- =============================================================================
-- Owned by postgres (bypass RLS) but each one gates itself on the interfaces
-- that display it, so a worker without access just gets zero rows.

create or replace view public.v_revenue_stream as
select * from (
  select 'subscription'::text as source, 'athletes'::text as interface_key, s.id as ref_id,
         s.payment_date as entry_date, s.amount_paid as amount,
         a.full_name as label, s.name as detail
    from public.athlete_subscriptions s join public.athletes a on a.id = s.athlete_id
   where s.amount_paid > 0
  union all
  select 'free_session', 'athletes', f.id, f.session_date, f.price,
         coalesce(a.full_name, f.passenger_name, 'Passager'), 'Séance libre'
    from public.free_sessions f left join public.athletes a on a.id = f.athlete_id
   where f.price > 0
  union all
  select 'sale', 'invoices', i.id, i.creation_date, i.amount_paid,
         i.customer_name, i.invoice_number
    from public.sales_invoices i
   where i.amount_paid > 0
  union all
  select 'cash_deposit', 'caisse', c.id, c.transaction_date, c.amount,
         coalesce(c.description, 'Deposit'), 'Caisse'
    from public.cash_transactions c
   where c.direction = 'deposit'
) r
where public.can_view_any(array['caisse', 'reports', 'dashboard']);

create or replace view public.v_expense_stream as
select * from (
  select 'expense'::text as source, 'expenses'::text as interface_key, e.id as ref_id,
         e.expense_date as entry_date, e.amount as amount,
         e.name as label, coalesce(e.notes, '') as detail
    from public.expenses e
  union all
  select 'worker_payment', 'workers', p.id, p.payment_date, p.final_amount,
         w.full_name, coalesce(p.description, 'Salary')
    from public.worker_payments p join public.workers w on w.id = p.worker_id
  union all
  select 'worker_acompte', 'workers', a.id, a.acompte_date, a.amount,
         w.full_name, coalesce(a.description, 'Acompte')
    from public.worker_acomptes a join public.workers w on w.id = a.worker_id
  union all
  select 'purchase', 'purchase_invoices', pi.id, pi.invoice_date, pi.amount_paid,
         coalesce(su.name, 'Supplier'), pi.invoice_number
    from public.purchase_invoices pi left join public.suppliers su on su.id = pi.supplier_id
   where pi.amount_paid > 0
  union all
  select 'cash_withdraw', 'caisse', c.id, c.transaction_date, c.amount,
         coalesce(c.description, 'Withdrawal'), 'Caisse'
    from public.cash_transactions c
   where c.direction = 'withdraw'
) x
where public.can_view_any(array['caisse', 'reports', 'dashboard']);

create or replace view public.v_caisse_balance as
select coalesce((select sum(amount) from public.v_revenue_stream), 0) as total_in,
       coalesce((select sum(amount) from public.v_expense_stream), 0) as total_out,
       coalesce((select sum(amount) from public.v_revenue_stream), 0)
     - coalesce((select sum(amount) from public.v_expense_stream), 0) as balance
where public.can_view_any(array['caisse', 'reports', 'dashboard']);

create or replace view public.v_athlete_outstanding as
select a.id as athlete_id, a.full_name, a.phone, a.photo_url,
       s.id as subscription_id, s.name as subscription_name,
       s.price, s.amount_paid, s.remaining, s.payment_date, s.expiry_date
  from public.athlete_subscriptions s
  join public.athletes a on a.id = s.athlete_id
 where s.remaining > 0
   and public.can_view_any(array['caisse', 'athletes', 'reports']);

grant select on public.v_revenue_stream, public.v_expense_stream,
                public.v_caisse_balance, public.v_athlete_outstanding to authenticated;
revoke all on public.v_revenue_stream, public.v_expense_stream,
              public.v_caisse_balance, public.v_athlete_outstanding from anon;


-- =============================================================================
-- 7. ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS everywhere and drop old policies so this block can be re-run.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'roles','workers','worker_permissions','worker_payments','worker_acomptes','worker_absences',
    'sports','subscriptions','athletes','athlete_subscriptions','athlete_credits','seances_history',
    'free_sessions','brands','categories','suppliers','products','purchase_invoices',
    'purchase_invoice_items','clients','sales_invoices','sales_invoice_items','expenses',
    'cash_transactions','store_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- ---- roles (Workers interface) ---------------------------------------------
create policy roles_select on public.roles for select to authenticated using (public.is_staff());
create policy roles_insert on public.roles for insert to authenticated
  with check (public.can_do_any(array['workers:create','workers:edit']) and (not is_admin or public.is_admin()));
create policy roles_update on public.roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy roles_delete on public.roles for delete to authenticated using (public.is_admin());

-- ---- workers ---------------------------------------------------------------
create policy workers_select on public.workers for select to authenticated
  using (user_id = auth.uid() or public.can_view('workers'));
create policy workers_insert on public.workers for insert to authenticated
  with check (public.can_do('workers', 'create'));
create policy workers_update on public.workers for update to authenticated
  using (user_id = auth.uid() or public.can_do('workers', 'edit'))
  with check (user_id = auth.uid() or public.can_do('workers', 'edit'));
create policy workers_delete on public.workers for delete to authenticated
  using (public.can_do('workers', 'delete') and user_id is distinct from auth.uid());

-- ---- worker_permissions ----------------------------------------------------
create policy wperm_select on public.worker_permissions for select to authenticated
  using (worker_id = public.current_worker_id() or public.can_view('workers'));
create policy wperm_insert on public.worker_permissions for insert to authenticated
  with check (public.can_do('workers', 'permissions'));
create policy wperm_update on public.worker_permissions for update to authenticated
  using (public.can_do('workers', 'permissions')) with check (public.can_do('workers', 'permissions'));
create policy wperm_delete on public.worker_permissions for delete to authenticated
  using (public.can_do('workers', 'permissions'));

-- ---- worker_payments / acomptes / absences ---------------------------------
create policy wpay_select on public.worker_payments for select to authenticated
  using (public.can_view('workers'));
create policy wpay_insert on public.worker_payments for insert to authenticated
  with check (public.can_do('workers', 'payment'));
create policy wpay_update on public.worker_payments for update to authenticated
  using (public.can_do('workers', 'payment')) with check (public.can_do('workers', 'payment'));
create policy wpay_delete on public.worker_payments for delete to authenticated
  using (public.can_do('workers', 'payment'));

create policy wacompte_select on public.worker_acomptes for select to authenticated
  using (public.can_view('workers'));
create policy wacompte_insert on public.worker_acomptes for insert to authenticated
  with check (public.can_do('workers', 'acompte'));
create policy wacompte_update on public.worker_acomptes for update to authenticated
  using (public.can_do_any(array['workers:acompte','workers:payment']))
  with check (public.can_do_any(array['workers:acompte','workers:payment']));
create policy wacompte_delete on public.worker_acomptes for delete to authenticated
  using (public.can_do('workers', 'acompte'));

create policy wabsence_select on public.worker_absences for select to authenticated
  using (public.can_view('workers'));
create policy wabsence_insert on public.worker_absences for insert to authenticated
  with check (public.can_do('workers', 'absence'));
create policy wabsence_update on public.worker_absences for update to authenticated
  using (public.can_do_any(array['workers:absence','workers:payment']))
  with check (public.can_do_any(array['workers:absence','workers:payment']));
create policy wabsence_delete on public.worker_absences for delete to authenticated
  using (public.can_do('workers', 'absence'));

-- ---- sports (lookup) -------------------------------------------------------
create policy sports_select on public.sports for select to authenticated using (public.is_staff());
create policy sports_insert on public.sports for insert to authenticated
  with check (public.can_do_any(array['athletes:create','athletes:edit']));
create policy sports_delete on public.sports for delete to authenticated
  using (public.can_do_any(array['athletes:edit','athletes:delete']));

-- ---- subscriptions catalog (Subscriptions interface) -----------------------
create policy subs_select on public.subscriptions for select to authenticated using (public.is_staff());
create policy subs_insert on public.subscriptions for insert to authenticated
  with check (public.can_do('subscriptions', 'create'));
create policy subs_update on public.subscriptions for update to authenticated
  using (public.can_do('subscriptions', 'edit')) with check (public.can_do('subscriptions', 'edit'));
create policy subs_delete on public.subscriptions for delete to authenticated
  using (public.can_do('subscriptions', 'delete'));

-- ---- athletes (Athletes / Scanner / Cards) ---------------------------------
create policy athletes_select on public.athletes for select to authenticated
  using (public.can_view_any(array['athletes','scanner','cards','dashboard','caisse','reports']));
create policy athletes_insert on public.athletes for insert to authenticated
  with check (public.can_do('athletes', 'create'));
create policy athletes_update on public.athletes for update to authenticated
  using (public.can_do_any(array['athletes:edit','athletes:subscribe','athletes:credit',
                                 'scanner:scan','scanner:create_card','cards:generate']))
  with check (public.can_do_any(array['athletes:edit','athletes:subscribe','athletes:credit',
                                      'scanner:scan','scanner:create_card','cards:generate']));
create policy athletes_delete on public.athletes for delete to authenticated
  using (public.can_do('athletes', 'delete'));

-- ---- athlete_subscriptions -------------------------------------------------
create policy asub_select on public.athlete_subscriptions for select to authenticated
  using (public.can_view_any(array['athletes','scanner','subscriptions','caisse','reports','dashboard']));
create policy asub_insert on public.athlete_subscriptions for insert to authenticated
  with check (public.can_do('athletes', 'subscribe'));
create policy asub_update on public.athlete_subscriptions for update to authenticated
  using (public.can_do('athletes', 'subscribe')) with check (public.can_do('athletes', 'subscribe'));
create policy asub_delete on public.athlete_subscriptions for delete to authenticated
  using (public.can_do_any(array['athletes:subscribe','athletes:delete']));

-- ---- athlete_credits -------------------------------------------------------
create policy acredit_select on public.athlete_credits for select to authenticated
  using (public.can_view('athletes'));
create policy acredit_insert on public.athlete_credits for insert to authenticated
  with check (public.can_do_any(array['athletes:credit','athletes:subscribe']));
create policy acredit_delete on public.athlete_credits for delete to authenticated
  using (public.can_do('athletes', 'credit'));

-- ---- seances_history (RFID check-ins) --------------------------------------
create policy seance_select on public.seances_history for select to authenticated
  using (public.can_view_any(array['athletes','scanner']));
create policy seance_insert on public.seances_history for insert to authenticated
  with check (public.can_view_any(array['athletes','scanner']));
create policy seance_delete on public.seances_history for delete to authenticated
  using (public.can_do('athletes', 'edit'));

-- ---- free_sessions (Séance libre) ------------------------------------------
create policy free_select on public.free_sessions for select to authenticated
  using (public.can_do('athletes', 'free_session') or public.can_view_any(array['dashboard','caisse','reports']));
create policy free_insert on public.free_sessions for insert to authenticated
  with check (public.can_do('athletes', 'free_session'));
create policy free_update on public.free_sessions for update to authenticated
  using (public.can_do('athletes', 'free_session')) with check (public.can_do('athletes', 'free_session'));
create policy free_delete on public.free_sessions for delete to authenticated
  using (public.can_do('athletes', 'free_session'));

-- ---- brands / categories (Stock lookups) -----------------------------------
create policy brands_select on public.brands for select to authenticated using (public.is_staff());
create policy brands_insert on public.brands for insert to authenticated
  with check (public.can_do_any(array['products:create','products:edit']));
create policy brands_delete on public.brands for delete to authenticated
  using (public.can_do('products', 'delete'));

create policy cats_select on public.categories for select to authenticated using (public.is_staff());
create policy cats_insert on public.categories for insert to authenticated
  with check (public.can_do_any(array['products:create','products:edit']));
create policy cats_delete on public.categories for delete to authenticated
  using (public.can_do('products', 'delete'));

-- ---- suppliers -------------------------------------------------------------
create policy sup_select on public.suppliers for select to authenticated
  using (public.can_view_any(array['suppliers','purchase_invoices','products','dashboard','reports']));
create policy sup_insert on public.suppliers for insert to authenticated
  with check (public.can_do_any(array['suppliers:create','purchase_invoices:create','products:create']));
create policy sup_update on public.suppliers for update to authenticated
  using (public.can_do_any(array['suppliers:edit','purchase_invoices:create']))
  with check (public.can_do_any(array['suppliers:edit','purchase_invoices:create']));
create policy sup_delete on public.suppliers for delete to authenticated
  using (public.can_do('suppliers', 'delete'));

-- ---- products (Stock / POS / Purchases) ------------------------------------
create policy prod_select on public.products for select to authenticated
  using (public.can_view_any(array['products','pos','purchase_invoices','invoices','dashboard']));
create policy prod_insert on public.products for insert to authenticated
  with check (public.can_do_any(array['products:create','purchase_invoices:create']));
create policy prod_update on public.products for update to authenticated
  using (public.can_do_any(array['products:edit','products:adjust_stock','pos:sell',
                                 'purchase_invoices:create','invoices:edit']))
  with check (public.can_do_any(array['products:edit','products:adjust_stock','pos:sell',
                                      'purchase_invoices:create','invoices:edit']));
create policy prod_delete on public.products for delete to authenticated
  using (public.can_do('products', 'delete'));

-- ---- purchase_invoices + items ---------------------------------------------
create policy pinv_select on public.purchase_invoices for select to authenticated
  using (public.can_view_any(array['purchase_invoices','suppliers','reports']));
create policy pinv_insert on public.purchase_invoices for insert to authenticated
  with check (public.can_do('purchase_invoices', 'create'));
create policy pinv_update on public.purchase_invoices for update to authenticated
  using (public.can_do_any(array['purchase_invoices:edit','purchase_invoices:pay']))
  with check (public.can_do_any(array['purchase_invoices:edit','purchase_invoices:pay']));
create policy pinv_delete on public.purchase_invoices for delete to authenticated
  using (public.can_do_any(array['purchase_invoices:delete','purchase_invoices:create']));

create policy pitem_select on public.purchase_invoice_items for select to authenticated
  using (public.can_view_any(array['purchase_invoices','suppliers','reports']));
create policy pitem_insert on public.purchase_invoice_items for insert to authenticated
  with check (public.can_do_any(array['purchase_invoices:create','purchase_invoices:edit']));
create policy pitem_update on public.purchase_invoice_items for update to authenticated
  using (public.can_do('purchase_invoices', 'edit')) with check (public.can_do('purchase_invoices', 'edit'));
create policy pitem_delete on public.purchase_invoice_items for delete to authenticated
  using (public.can_do_any(array['purchase_invoices:edit','purchase_invoices:delete']));

-- ---- clients ---------------------------------------------------------------
create policy cli_select on public.clients for select to authenticated
  using (public.can_view_any(array['clients','pos','invoices']));
create policy cli_insert on public.clients for insert to authenticated
  with check (public.can_do_any(array['clients:create','pos:sell']));
create policy cli_update on public.clients for update to authenticated
  using (public.can_do('clients', 'edit')) with check (public.can_do('clients', 'edit'));
create policy cli_delete on public.clients for delete to authenticated
  using (public.can_do('clients', 'delete'));

-- ---- sales_invoices + items (POS / Sales) ----------------------------------
create policy sinv_select on public.sales_invoices for select to authenticated
  using (public.can_view_any(array['invoices','clients','pos','reports']));
create policy sinv_insert on public.sales_invoices for insert to authenticated
  with check (public.can_do_any(array['pos:sell','invoices:create']));
create policy sinv_update on public.sales_invoices for update to authenticated
  using (public.can_do_any(array['invoices:edit','pos:refund']))
  with check (public.can_do_any(array['invoices:edit','pos:refund']));
create policy sinv_delete on public.sales_invoices for delete to authenticated
  using (public.can_do_any(array['invoices:delete','pos:sell','pos:refund']));

create policy sitem_select on public.sales_invoice_items for select to authenticated
  using (public.can_view_any(array['invoices','clients','pos','reports']));
create policy sitem_insert on public.sales_invoice_items for insert to authenticated
  with check (public.can_do_any(array['pos:sell','invoices:create','invoices:edit']));
create policy sitem_update on public.sales_invoice_items for update to authenticated
  using (public.can_do('invoices', 'edit')) with check (public.can_do('invoices', 'edit'));
create policy sitem_delete on public.sales_invoice_items for delete to authenticated
  using (public.can_do_any(array['invoices:edit','invoices:delete']));

-- ---- expenses --------------------------------------------------------------
create policy exp_select on public.expenses for select to authenticated
  using (public.can_view_any(array['expenses','caisse','reports']));
create policy exp_insert on public.expenses for insert to authenticated
  with check (public.can_do('expenses', 'create'));
create policy exp_update on public.expenses for update to authenticated
  using (public.can_do('expenses', 'edit')) with check (public.can_do('expenses', 'edit'));
create policy exp_delete on public.expenses for delete to authenticated
  using (public.can_do('expenses', 'delete'));

-- ---- cash_transactions (Caisse) --------------------------------------------
create policy cash_select on public.cash_transactions for select to authenticated
  using (public.can_do('caisse', 'view_history') or public.can_view('reports'));
create policy cash_insert on public.cash_transactions for insert to authenticated
  with check (public.can_do('caisse', 'create'));
create policy cash_update on public.cash_transactions for update to authenticated
  using (public.can_do('caisse', 'edit')) with check (public.can_do('caisse', 'edit'));
create policy cash_delete on public.cash_transactions for delete to authenticated
  using (public.can_do('caisse', 'delete'));

-- ---- store_settings (Settings) — readable by anon for the login page -------
grant select on public.store_settings to anon;
create policy store_select on public.store_settings for select to anon, authenticated using (true);
create policy store_insert on public.store_settings for insert to authenticated
  with check (public.can_do('settings', 'edit'));
create policy store_update on public.store_settings for update to authenticated
  using (public.can_do('settings', 'edit')) with check (public.can_do('settings', 'edit'));


-- =============================================================================
-- 8. STORAGE BUCKETS (images) — names match src/lib/storage.ts
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('athlete-photos', 'athlete-photos', true,  5242880,  array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('worker-photos',  'worker-photos',  true,  5242880,  array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('store-logos',    'store-logos',    true,  5242880,  array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']),
  ('card-images',    'card-images',    true,  5242880,  array['image/png','image/jpeg','image/jpg','image/webp']),
  ('product-images', 'product-images', true,  5242880,  array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('documents',      'documents',      false, 10485760, array['image/png','image/jpeg','image/jpg','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gym public read"   on storage.objects;
drop policy if exists "gym staff read"    on storage.objects;
drop policy if exists "gym staff upload"  on storage.objects;
drop policy if exists "gym staff update"  on storage.objects;
drop policy if exists "gym staff delete"  on storage.objects;

-- Public image buckets: anyone can display (login logo, cards, <img src>).
create policy "gym public read" on storage.objects for select to anon, authenticated
  using (bucket_id in ('athlete-photos','worker-photos','store-logos','card-images','product-images'));

-- Private documents: staff only.
create policy "gym staff read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_staff());

create policy "gym staff upload" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('athlete-photos','worker-photos','store-logos','card-images','product-images','documents')
    and public.is_staff()
    and (bucket_id <> 'store-logos' or public.can_do('settings', 'edit'))
  );

create policy "gym staff update" on storage.objects for update to authenticated
  using (bucket_id in ('athlete-photos','worker-photos','store-logos','card-images','product-images','documents')
         and public.is_staff())
  with check (bucket_id in ('athlete-photos','worker-photos','store-logos','card-images','product-images','documents')
              and public.is_staff());

create policy "gym staff delete" on storage.objects for delete to authenticated
  using (bucket_id in ('athlete-photos','worker-photos','store-logos','card-images','product-images','documents')
         and public.is_staff());


-- =============================================================================
-- 9. SEED DATA  (no admin here — create it with the login page button)
-- =============================================================================

insert into public.store_settings (id, name, currency) values ('store', 'GYM', 'DZD')
on conflict (id) do nothing;

insert into public.roles (name, is_admin) values
  ('Administrator', true),
  ('Receptionist',  false),
  ('Coach',         false),
  ('Cashier',       false)
on conflict (name) do nothing;

insert into public.sports (name) values
  ('Musculation'), ('Fitness'), ('Cardio'), ('Boxe'), ('CrossFit')
on conflict (name) do nothing;

-- Make PostgREST pick up the new schema immediately.
notify pgrst, 'reload schema';
