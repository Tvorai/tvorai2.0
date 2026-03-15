alter table public.profiles
add column if not exists phone_number text;

alter table public.profiles
alter column email drop not null;

create unique index if not exists profiles_phone_number_unique
on public.profiles (phone_number)
where phone_number is not null;

