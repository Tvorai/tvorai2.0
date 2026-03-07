-- Useful indexes
create index if not exists idx_generation_jobs_status_created_at
  on public.generation_jobs (status, created_at desc);

create index if not exists idx_generation_jobs_user_created_at
  on public.generation_jobs (user_id, created_at desc);

create unique index if not exists uq_generation_jobs_provider_job_id
  on public.generation_jobs (provider, provider_job_id)
  where provider_job_id is not null;

create index if not exists idx_generation_assets_job_id
  on public.generation_assets (job_id);

create index if not exists idx_credit_ledger_user_created_at
  on public.credit_ledger (user_id, created_at desc);

create index if not exists idx_subscriptions_user
  on public.subscriptions (user_id);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);

