-- Seed default generation costs (can be adjusted later in Admin)
-- Using 'image' as 1 unit and 'video' as 5 units by default
insert into public.generation_costs (type, cost_units, active)
values 
  ('image', 1, true),
  ('video', 5, true)
on conflict do nothing;

-- Seed plans (names in Czech; stripe_price_id to be filled during setup)
insert into public.plans (name, credits_per_cycle, limits_json, active)
values
  ('Trial', 48, '{"trial": true}'::jsonb, true),
  ('Starter', 80, '{}'::jsonb, true),
  ('Pro', 180, '{}'::jsonb, true),
  ('Studio', 400, '{}'::jsonb, true)
on conflict do nothing;

