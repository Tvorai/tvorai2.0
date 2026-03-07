-- Extensions
create extension if not exists "pgcrypto";

-- Helper types
do $$ begin
  create type credit_reason as enum ('cycle_grant','spend','refund','admin_adjust','promo');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type job_status as enum ('queued','running','succeeded','failed');
exception when duplicate_object then null;
end $$;

-- Helper functions
create or replace function public.jwt_role() returns text
language sql
stable
as $$
  select coalesce( (current_setting('request.jwt.claims', true)::json ->> 'role'), 'anonymous');
$$;

create or replace function public.is_admin() returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user','admin')),
  locale text not null default 'cs',
  created_at timestamptz not null default now()
);

-- Insert profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  stripe_price_id text unique,
  name text not null,
  credits_per_cycle bigint not null check (credits_per_cycle >= 0),
  limits_json jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  plan_id uuid references public.plans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create trigger subscriptions_touch_updated_at
before update on public.subscriptions
for each row execute procedure public.touch_updated_at();

create table if not exists public.credit_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  credits_total bigint not null default 0,
  updated_at timestamptz not null default now()
);
create trigger credit_balances_touch_updated_at
before update on public.credit_balances
for each row execute procedure public.touch_updated_at();

create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta bigint not null,
  reason credit_reason not null,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, -- e.g., 'image' | 'video'
  status job_status not null default 'queued',
  provider text, -- kling | seedream | mergeface
  provider_job_id text,
  input_json jsonb not null,
  cost bigint not null default 0,
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger generation_jobs_touch_updated_at
before update on public.generation_jobs
for each row execute procedure public.touch_updated_at();

create table if not exists public.generation_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  kind text not null check (kind in ('input','output')),
  storage_path text not null,
  mime text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid not null references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  event_id text primary key,
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Optional: configurable generation costs in DB
create table if not exists public.generation_costs (
  id serial primary key,
  type text not null,          -- 'image' | 'video' | future types
  provider text,               -- optional
  model text,                  -- optional
  cost_units bigint not null check (cost_units > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (type, coalesce(provider, ''), coalesce(model, ''), active)
);

-- Storage bucket note: create via separate seed (supabase/seeds/storage.sql)

