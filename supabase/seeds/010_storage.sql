-- Create private storage bucket for generations
-- Note: In Supabase, use the storage schema
insert into storage.buckets (id, name, public)
values ('generations', 'generations', false)
on conflict (id) do nothing;

