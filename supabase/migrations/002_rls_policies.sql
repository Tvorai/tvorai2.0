-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_assets enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.stripe_events enable row level security;
alter table public.generation_costs enable row level security;

-- Profiles
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin());

-- Plans
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read"
on public.plans
for select
to anon, authenticated
using (active = true or public.is_admin());

drop policy if exists "plans_admin_write" on public.plans;
create policy "plans_admin_write"
on public.plans
for insert
to authenticated
with check (public.is_admin());
create policy "plans_admin_update"
on public.plans
for update
to authenticated
using (public.is_admin());

-- Subscriptions: read own; writes only by service role
drop policy if exists "subscriptions_read_own_or_admin" on public.subscriptions;
create policy "subscriptions_read_own_or_admin"
on public.subscriptions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "subscriptions_service_write" on public.subscriptions;
create policy "subscriptions_service_write"
on public.subscriptions
for insert
to authenticated
with check (public.jwt_role() = 'service_role');
create policy "subscriptions_service_update"
on public.subscriptions
for update
to authenticated
using (public.jwt_role() = 'service_role');

-- Credit balances: read own; writes by service role
drop policy if exists "credit_balances_read_own_or_admin" on public.credit_balances;
create policy "credit_balances_read_own_or_admin"
on public.credit_balances
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "credit_balances_service_write" on public.credit_balances;
create policy "credit_balances_service_write"
on public.credit_balances
for insert
to authenticated
with check (public.jwt_role() = 'service_role');
create policy "credit_balances_service_update"
on public.credit_balances
for update
to authenticated
using (public.jwt_role() = 'service_role');

-- Credit ledger: read own; insert by service role only; no updates
drop policy if exists "credit_ledger_read_own_or_admin" on public.credit_ledger;
create policy "credit_ledger_read_own_or_admin"
on public.credit_ledger
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "credit_ledger_service_insert" on public.credit_ledger;
create policy "credit_ledger_service_insert"
on public.credit_ledger
for insert
to authenticated
with check (public.jwt_role() = 'service_role');

-- Generation jobs: read own; writes by service role
drop policy if exists "generation_jobs_read_own_or_admin" on public.generation_jobs;
create policy "generation_jobs_read_own_or_admin"
on public.generation_jobs
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "generation_jobs_service_insert" on public.generation_jobs;
create policy "generation_jobs_service_insert"
on public.generation_jobs
for insert
to authenticated
with check (public.jwt_role() = 'service_role');
create policy "generation_jobs_service_update"
on public.generation_jobs
for update
to authenticated
using (public.jwt_role() = 'service_role');

-- Generation assets: read own (via join on job); insert by service role
drop policy if exists "generation_assets_read_own_or_admin" on public.generation_assets;
create policy "generation_assets_read_own_or_admin"
on public.generation_assets
for select
to authenticated
using (
  exists (
    select 1 from public.generation_jobs j
    where j.id = generation_assets.job_id
      and (j.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "generation_assets_service_insert" on public.generation_assets;
create policy "generation_assets_service_insert"
on public.generation_assets
for insert
to authenticated
with check (public.jwt_role() = 'service_role');

-- Admin audit log: admins read; inserts by service role
drop policy if exists "admin_audit_log_admin_read" on public.admin_audit_log;
create policy "admin_audit_log_admin_read"
on public.admin_audit_log
for select
to authenticated
using (public.is_admin());

drop policy if exists "admin_audit_log_service_insert" on public.admin_audit_log;
create policy "admin_audit_log_service_insert"
on public.admin_audit_log
for insert
to authenticated
with check (public.jwt_role() = 'service_role');

-- Stripe events: admin read; service writes
drop policy if exists "stripe_events_admin_read" on public.stripe_events;
create policy "stripe_events_admin_read"
on public.stripe_events
for select
to authenticated
using (public.is_admin());

drop policy if exists "stripe_events_service_insert" on public.stripe_events;
create policy "stripe_events_service_insert"
on public.stripe_events
for insert
to authenticated
with check (public.jwt_role() = 'service_role');
create policy "stripe_events_service_update"
on public.stripe_events
for update
to authenticated
using (public.jwt_role() = 'service_role');

-- Generation costs: public read; admin write
drop policy if exists "generation_costs_read" on public.generation_costs;
create policy "generation_costs_read"
on public.generation_costs
for select
to anon, authenticated
using (true);

drop policy if exists "generation_costs_admin_write" on public.generation_costs;
create policy "generation_costs_admin_write"
on public.generation_costs
for insert
to authenticated
with check (public.is_admin());
create policy "generation_costs_admin_update"
on public.generation_costs
for update
to authenticated
using (public.is_admin());

