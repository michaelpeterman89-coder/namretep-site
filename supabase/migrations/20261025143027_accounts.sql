-- Phase 2: player accounts.
-- One profile row per auth user, holding their username, avatar, and chip balance.
-- Chips can only be changed by security-definer functions, never directly by clients.

-- Keep these values in sync with src/lib/chips.ts and src/lib/avatars.ts.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar text not null default 'nova',
  chips bigint not null default 10000,
  last_refill_at timestamptz,
  created_at timestamptz not null default now(),

  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_avatar_choice check (
    avatar in ('nova', 'comet', 'ringed', 'moon', 'ember', 'verdant')
  ),
  constraint profiles_chips_non_negative check (chips >= 0)
);

-- Usernames are unique regardless of capitalization.
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;

create policy "Logged-in players can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Players can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level privileges: clients may read profiles and edit only their
-- username and avatar. Rows are created by the signup trigger, and chips are
-- changed only by the functions below.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, avatar) on public.profiles to authenticated;

-- ---------- Create a profile on signup ----------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fallback text := 'pilot_' || substr(replace(new.id::text, '-', ''), 1, 8);
  wanted text := coalesce(new.raw_user_meta_data ->> 'username', '');
begin
  if wanted !~ '^[A-Za-z0-9_]{3,20}$' then
    wanted := fallback;
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, wanted);
  exception when unique_violation then
    -- Someone grabbed the name first; the player can rename on their profile.
    insert into public.profiles (id, username) values (new.id, fallback);
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Username availability (used by the signup form) ----------

create function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(name)
  );
$$;

revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- Daily chip refill ----------

-- Tops a low balance back up to the starting amount, at most once per 24 hours.
create function public.claim_daily_refill()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  starting_chips constant bigint := 10000;
  low_threshold constant bigint := 2500;
  cooldown constant interval := interval '24 hours';
  player public.profiles;
begin
  select * into player
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found then
    raise exception 'NO_PROFILE';
  end if;

  if player.chips >= low_threshold then
    raise exception 'REFILL_NOT_LOW';
  end if;

  if player.last_refill_at is not null and player.last_refill_at > now() - cooldown then
    raise exception 'REFILL_TOO_SOON';
  end if;

  update public.profiles
  set chips = starting_chips, last_refill_at = now()
  where id = player.id;

  return starting_chips;
end;
$$;

revoke execute on function public.claim_daily_refill() from public, anon;
grant execute on function public.claim_daily_refill() to authenticated;
