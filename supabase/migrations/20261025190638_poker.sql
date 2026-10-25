-- Phase 7: Texas Hold'em (and the groundwork for other poker variants).
--
-- Poker is player vs player: chips move from your balance to a stack at the
-- table when you sit down (buy-in) and back when you leave (cash-out). Hands
-- are stored like blackjack rounds: a public part anyone at the table may see,
-- and a server-only secret part holding the deck and every hole card.

-- ---------- Tables and seats ----------

alter table public.game_tables drop constraint game_tables_game;
alter table public.game_tables add constraint game_tables_game check (game in ('blackjack', 'holdem'));

-- Poker tables seat up to 9 (blackjack keeps its own limit of 7 in the app).
alter table public.game_tables drop constraint game_tables_seats;
alter table public.game_tables add constraint game_tables_seats check (seats between 1 and 9);

alter table public.table_seats drop constraint table_seats_seat_number;
alter table public.table_seats add constraint table_seats_seat_number check (seat_number between 0 and 8);

-- A seat belongs to a player or to a computer opponent (bot), never both.
alter table public.table_seats alter column player_id drop not null;
alter table public.table_seats add column bot_name text;
alter table public.table_seats add constraint table_seats_player_or_bot
  check ((player_id is null) <> (bot_name is null));

-- Poker: chips in front of this seat, and "leave after this hand".
alter table public.table_seats add column stack bigint;
alter table public.table_seats add column leaving boolean not null default false;
alter table public.table_seats add constraint table_seats_stack check (stack is null or stack >= 0);

-- ---------- Ledger ----------

alter table public.chip_ledger drop constraint chip_ledger_reason;
alter table public.chip_ledger add constraint chip_ledger_reason check (
  reason in (
    'opening_balance', 'signup', 'refill', 'bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out'
  )
);

-- ---------- Poker hands ----------

create table public.poker_hands (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.game_tables (id) on delete cascade,
  hand_number integer not null,
  phase text not null,
  -- What everyone at the table may see: no deck, no unshown hole cards.
  public_state jsonb not null,
  version integer not null default 1,
  deadline_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint poker_hands_phase check (phase in ('betting', 'complete')),
  unique (table_id, hand_number)
);

-- Only one unfinished hand per table.
create unique index poker_hands_one_active_idx on public.poker_hands (table_id) where phase <> 'complete';

-- The full hand, including the deck and every hole card. Server only.
create table public.poker_hand_secrets (
  hand_id uuid primary key references public.poker_hands (id) on delete cascade,
  state jsonb not null
);

alter table public.poker_hands enable row level security;
alter table public.poker_hand_secrets enable row level security;

create policy "Players can view hands at tables they have access to"
  on public.poker_hands for select
  to authenticated
  using (public.can_view_table(table_id));

-- No policies on poker_hand_secrets: no browser can read it.

-- This project doesn't grant table access automatically (see CLAUDE.md).
revoke all on public.poker_hands, public.poker_hand_secrets from anon, authenticated;
grant select on public.poker_hands to authenticated;
grant all on public.poker_hands, public.poker_hand_secrets to service_role;

-- ---------- Buying in and cashing out ----------

-- Takes a seat with `p_amount` chips from the player's balance.
create function public.poker_buy_in(p_table_id uuid, p_seat_number integer, p_player_id uuid, p_amount bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_chip_changes(
    jsonb_build_array(jsonb_build_object('player_id', p_player_id, 'amount', -p_amount, 'reason', 'buy_in')),
    p_table_id,
    null
  );
  insert into public.table_seats (table_id, seat_number, player_id, stack)
  values (p_table_id, p_seat_number, p_player_id, p_amount);
  update public.game_tables set last_activity_at = now() where id = p_table_id;
end;
$$;

-- Leaves the table and returns the stack to the player's balance. Returns the amount.
create function public.poker_cash_out(p_table_id uuid, p_player_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stack bigint;
begin
  delete from public.table_seats
  where table_id = p_table_id and player_id = p_player_id
  returning coalesce(stack, 0) into v_stack;

  if not found then
    return 0;
  end if;

  if v_stack > 0 then
    perform public.apply_chip_changes(
      jsonb_build_array(jsonb_build_object('player_id', p_player_id, 'amount', v_stack, 'reason', 'cash_out')),
      p_table_id,
      null
    );
  end if;
  update public.game_tables set last_activity_at = now() where id = p_table_id;
  return v_stack;
end;
$$;

-- ---------- Hand functions (called by the server) ----------

create function public.poker_start_hand(
  p_table_id uuid,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_deadline timestamptz
)
returns table (hand_id uuid, hand_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hand_id uuid;
  v_number integer;
begin
  select coalesce(max(h.hand_number), 0) + 1 into v_number
  from public.poker_hands h
  where h.table_id = p_table_id;

  insert into public.poker_hands (table_id, hand_number, phase, public_state, deadline_at, completed_at)
  values (
    p_table_id, v_number, p_phase, p_public,
    case when p_phase = 'complete' then null else p_deadline end,
    case when p_phase = 'complete' then now() end
  )
  returning id into v_hand_id;

  insert into public.poker_hand_secrets (hand_id, state) values (v_hand_id, p_secret);

  update public.game_tables set last_activity_at = now() where id = p_table_id;

  return query select v_hand_id, v_number;
end;
$$;

-- Saves an action. When the hand ends, p_stacks ([{ seat_number, stack }])
-- writes the new stacks back to the seats and p_stats records each player's
-- result. Raises STALE_HAND if the hand changed since the server read it.
create function public.poker_apply(
  p_hand_id uuid,
  p_version integer,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_deadline timestamptz,
  p_stacks jsonb,
  p_stats jsonb,
  p_actor uuid,
  p_timed_out uuid[]
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
  update public.poker_hands
  set phase = p_phase,
      public_state = p_public,
      version = version + 1,
      deadline_at = case when p_phase = 'complete' then null else p_deadline end,
      completed_at = case when p_phase = 'complete' then now() end
  where id = p_hand_id and version = p_version and phase <> 'complete'
  returning table_id, version into v_table_id, v_version;

  if not found then
    raise exception 'STALE_HAND';
  end if;

  update public.poker_hand_secrets set state = p_secret where hand_id = p_hand_id;

  update public.table_seats s
  set stack = x.stack
  from jsonb_to_recordset(coalesce(p_stacks, '[]'::jsonb)) as x (seat_number integer, stack bigint)
  where s.table_id = v_table_id and s.seat_number = x.seat_number;

  perform public.record_game_stats(p_stats);

  if p_actor is not null then
    update public.table_seats set missed_turns = 0
    where table_id = v_table_id and player_id = p_actor;
  end if;

  update public.table_seats
  set missed_turns = missed_turns + 1,
      status = case when missed_turns + 1 >= 2 then 'sitting_out' else status end
  where table_id = v_table_id and player_id = any (coalesce(p_timed_out, '{}'));

  update public.game_tables set last_activity_at = now() where id = v_table_id;

  return v_version;
end;
$$;

revoke execute on function public.poker_buy_in(uuid, integer, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.poker_cash_out(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.poker_start_hand(uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.poker_apply(uuid, integer, text, jsonb, jsonb, timestamptz, jsonb, jsonb, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.poker_buy_in(uuid, integer, uuid, bigint) to service_role;
grant execute on function public.poker_cash_out(uuid, uuid) to service_role;
grant execute on function public.poker_start_hand(uuid, text, jsonb, jsonb, timestamptz) to service_role;
grant execute on function public.poker_apply(uuid, integer, text, jsonb, jsonb, timestamptz, jsonb, jsonb, uuid, uuid[]) to service_role;
