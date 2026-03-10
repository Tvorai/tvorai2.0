
-- 1. Create generations table if not exists (or alter it)
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  
  -- Core fields
  prompt text,
  image_url text, -- legacy field, can be used for Novita URL or signed URL
  
  -- Extended fields for full job tracking
  type text not null, -- 'image' | 'video' | 'faceswap'
  status text not null default 'queued', -- 'queued', 'running', 'succeeded', 'failed'
  provider text, -- 'seedream', 'wan-i2v', etc.
  provider_job_id text, -- for async tasks
  cost bigint default 0,
  
  -- Storage fields
  s3_key text,
  mime text,
  
  -- Error tracking
  error text,
  
  -- Metadata
  width int,
  height int,
  duration int,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add indexes
create index if not exists generations_user_id_idx on public.generations(user_id);
create index if not exists generations_provider_job_id_idx on public.generations(provider_job_id);
create index if not exists generations_created_at_idx on public.generations(created_at desc);

-- 3. Add updated_at trigger
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists generations_touch_updated_at on public.generations;
create trigger generations_touch_updated_at
before update on public.generations
for each row execute procedure public.touch_updated_at();

-- 4. Enable RLS
alter table public.generations enable row level security;

-- 5. RLS Policies
create policy "Users can view their own generations"
  on public.generations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own generations"
  on public.generations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own generations"
  on public.generations for update
  using (auth.uid() = user_id);

-- 6. Grant access to service role (implicit, but good for documentation)
-- service_role has bypass rls
