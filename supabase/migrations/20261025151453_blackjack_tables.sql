-- Phase 3: game tables, blackjack rounds, and a chip ledger.
--
-- Browsers can only read. All writes happen on the server (using the secret
-- key) through the functions at the bottom, which change chips and round
-- state together in one transaction.

-- ---------- Chip ledger ----------

create table public.chip_ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles (id) on delete cascade,
  amount bigint not null,
  balance_after bigint not null,
  reason text not null,
  table_id uuid,
  round_id uuid,
  created_at timestamptz not null default now(),

  constraint chip_ledger_reason check (
    reason in ('opening_balance', 'signup', 'refill', 'bet', 'double', 'split', 'insurance', 'payout')
  )
);

create index chip_ledger_player_created_idx on public.chip_ledger (player_id, created_at desc);

-- Existing players: record their current balance so the ledger adds up.
insert into public.chip_ledger (player_id, amount, balance_after, reason)
select id, chips, chips, 'opening_balance' from public.profiles;

-- ---------- Game tables ----------

create table public.game_tables (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  visibility text not null,
  invite_code text unique,
  seats smallint not null,
  min_bet bigint not null,
  max_bet bigint not null,
  rules jsonb not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint game_tables_game check (game in ('blackjack')),
  constraint game_tables_name_length check (char_length(name) between 1 and 40),
  constraint game_tables_visibility check (visibility in ('public', 'private')),
  constraint game_tables_seats check (seats between 1 and 7),
  constraint game_tables_bets check (min_bet >= 1 and max_bet >= min_bet and max_bet <= 1000000),
  constraint game_tables_status check (status in ('open', 'closed'))
);

create index game_tables_lobby_idx on public.game_tables (visibility, status, last_activity_at desc);
create index game_tables_owner_idx on public.game_tables (owner_id, created_at desc);

alter table public.chip_ledger
  add constraint chip_ledger_table_fk foreign key (table_id) references public.game_tables (id) on delete set null;

-- ---------- Blackjack rounds ----------

-- What players may see: no shoe, no hole card (see publicView() in the engine).
create table public.blackjack_rounds (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.game_tables (id) on delete cascade,
  round_number integer not null,
  phase text not null,
  public_state jsonb not null,
  -- Bumped on every update so a repeated or out-of-date action is rejected.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  settled_at timestamptz,

  constraint blackjack_rounds_phase check (phase in ('early', 'playing', 'settled')),
  unique (table_id, round_number)
);

-- Only one unfinished round per table.
create unique index blackjack_rounds_one_active_idx
  on public.blackjack_rounds (table_id) where phase <> 'settled';

alter table public.chip_ledger
  add constraint chip_ledger_round_fk foreign key (round_id) references public.blackjack_rounds (id) on delete set null;

-- The full round, including the shoe and the dealer's hidden cards. Server only.
create table public.blackjack_round_secrets (
  round_id uuid primary key references public.blackjack_rounds (id) on delete cascade,
  state jsonb not null
);

-- ---------- Row Level Security ----------

alter table public.chip_ledger enable row level security;
alter table public.game_tables enable row level security;
alter table public.blackjack_rounds enable row level security;
alter table public.blackjack_round_secrets enable row level security;

create policy "Players can view their own ledger"
  on public.chip_ledger for select
  to authenticated
  using ((select auth.uid()) = player_id);

-- Phase 5 will extend these two policies to players seated at a table.
create policy "Players can view public tables and their own"
  on public.game_tables for select
  to authenticated
  using (visibility = 'public' or (select auth.uid()) = owner_id);

create policy "Table owners can view rounds"
  on public.blackjack_rounds for select
  to authenticated
  using (
    exists (
      select 1 from public.game_tables t
      where t.id = table_id and t.owner_id = (select auth.uid())
    )
  );

-- No policies on blackjack_round_secrets: no browser can read it.

revoke all on public.chip_ledger, public.game_tables, public.blackjack_rounds, public.blackjack_round_secrets
  from anon, authenticated;
grant select on public.chip_ledger, public.game_tables, public.blackjack_rounds to authenticated;
grant all on public.chip_ledger, public.game_tables, public.blackjack_rounds, public.blackjack_round_secrets
  to service_role;

-- ---------- Chip changes ----------

-- Applies a list of [{ "player_id", "amount", "reason" }] chip changes, writing
-- a ledger line for each. Raises INSUFFICIENT_CHIPS (rolling back everything)
-- if any balance would go below zero.
create function public.apply_chip_changes(p_changes jsonb, p_table_id uuid, p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  change jsonb;
  v_player uuid;
  v_amount bigint;
  v_balance bigint;
begin
  for change in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    v_player := (change ->> 'player_id')::uuid;
    v_amount := (change ->> 'amount')::bigint;

    update public.profiles
    set chips = chips + v_amount
    where id = v_player and chips + v_amount >= 0
    returning chips into v_balance;

    if not found then
      raise exception 'INSUFFICIENT_CHIPS';
    end if;

    insert into public.chip_ledger (player_id, amount, balance_after, reason, table_id, round_id)
    values (v_player, v_amount, v_balance, change ->> 'reason', p_table_id, p_round_id);
  end loop;
end;
$$;

-- ---------- Round functions (called by the server) ----------

-- Saves a newly dealt round and takes the bets, all at once.
create function public.bj_start_round(
  p_table_id uuid,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_chips jsonb
)
returns table (round_id uuid, round_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_id uuid;
  v_number integer;
begin
  select coalesce(max(r.round_number), 0) + 1 into v_number
  from public.blackjack_rounds r
  where r.table_id = p_table_id;

  insert into public.blackjack_rounds (table_id, round_number, phase, public_state, settled_at)
  values (p_table_id, v_number, p_phase, p_public, case when p_phase = 'settled' then now() end)
  returning id into v_round_id;

  insert into public.blackjack_round_secrets (round_id, state) values (v_round_id, p_secret);

  perform public.apply_chip_changes(p_chips, p_table_id, v_round_id);

  update public.game_tables set last_activity_at = now() where id = p_table_id;

  return query select v_round_id, v_number;
end;
$$;

-- Saves a player action. Raises STALE_ROUND if the round changed since the
-- server read it (e.g. a double-click), so the action is never applied twice.
create function public.bj_update_round(
  p_round_id uuid,
  p_version integer,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_chips jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table_id uuid;
  v_version integer;
begin
  update public.blackjack_rounds
  set phase = p_phase,
      public_state = p_public,
      version = version + 1,
      settled_at = case when p_phase = 'settled' then now() end
  where id = p_round_id and version = p_version and phase <> 'settled'
  returning table_id, version into v_table_id, v_version;

  if not found then
    raise exception 'STALE_ROUND';
  end if;

  update public.blackjack_round_secrets set state = p_secret where round_id = p_round_id;

  perform public.apply_chip_changes(p_chips, v_table_id, p_round_id);

  update public.game_tables set last_activity_at = now() where id = v_table_id;

  return v_version;
end;
$$;

revoke execute on function public.apply_chip_changes(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.bj_start_round(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.bj_update_round(uuid, integer, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_chip_changes(jsonb, uuid, uuid) to service_role;
grant execute on function public.bj_start_round(uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.bj_update_round(uuid, integer, text, jsonb, jsonb, jsonb) to service_role;

-- ---------- Ledger lines for signup and refills ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fallback text := 'pilot_' || substr(replace(new.id::text, '-', ''), 1, 8);
  wanted text := coalesce(new.raw_user_meta_data ->> 'username', '');
  v_chips bigint;
begin
  if wanted !~ '^[A-Za-z0-9_]{3,20}$' then
    wanted := fallback;
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, wanted)
    returning chips into v_chips;
  exception when unique_violation then
    -- Someone grabbed the name first; the player can rename on their profile.
    insert into public.profiles (id, username) values (new.id, fallback)
    returning chips into v_chips;
  end;

  insert into public.chip_ledger (player_id, amount, balance_after, reason)
  values (new.id, v_chips, v_chips, 'signup');

  return new;
end;
$$;

create or replace function public.claim_daily_refill()
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

  insert into public.chip_ledger (player_id, amount, balance_after, reason)
  values (player.id, starting_chips - player.chips, starting_chips, 'refill');

  return starting_chips;
end;
$$;
