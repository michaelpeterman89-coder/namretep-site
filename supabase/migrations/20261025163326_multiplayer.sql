-- Phase 5: multiplayer tables — seats, access for invited players, turn
-- deadlines, live updates, and idle-table cleanup.
--
-- New round functions bj_deal / bj_act add deadlines and seat bookkeeping.
-- The Phase 4 functions (blackjack_start_round / blackjack_apply_action) stay
-- until the new code is live; a later migration drops them.

-- ---------- Seats ----------

create table public.table_seats (
  table_id uuid not null references public.game_tables (id) on delete cascade,
  seat_number smallint not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  -- 'sitting_out' players aren't dealt in until they bet again.
  status text not null default 'active',
  -- Bet waiting for the next deal (null = no bet yet).
  pending_bet bigint,
  bet_placed_at timestamptz,
  -- Timeouts in a row; reset whenever the player acts.
  missed_turns smallint not null default 0,
  joined_at timestamptz not null default now(),

  primary key (table_id, seat_number),
  unique (table_id, player_id),
  constraint table_seats_seat_number check (seat_number between 0 and 6),
  constraint table_seats_status check (status in ('active', 'sitting_out')),
  constraint table_seats_bet check (pending_bet is null or pending_bet >= 1)
);

-- Players who opened a private table's invite link (and so may view it).
create table public.table_members (
  table_id uuid not null references public.game_tables (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (table_id, player_id)
);

create index table_seats_player_idx on public.table_seats (player_id);
create index table_members_player_idx on public.table_members (player_id);

-- Owners sit at their existing open tables, so solo play carries on as before.
insert into public.table_seats (table_id, seat_number, player_id)
select id, 0, owner_id from public.game_tables where status = 'open';

-- ---------- Deadlines ----------

-- When betting closes for the next deal (set by the first bet).
alter table public.game_tables add column betting_deadline_at timestamptz;
-- When the current decision times out (null = no timer, e.g. solo hands).
alter table public.blackjack_rounds add column deadline_at timestamptz;

-- ---------- Who can view a table ----------

-- Public tables, your own, ones you were invited to, and ones you sit at.
-- Security definer so policies can call it without recursing into RLS.
create function public.can_view_table(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_tables t
    where t.id = p_table_id and (t.visibility = 'public' or t.owner_id = (select auth.uid()))
  )
  or exists (
    select 1 from public.table_members m
    where m.table_id = p_table_id and m.player_id = (select auth.uid())
  )
  or exists (
    select 1 from public.table_seats s
    where s.table_id = p_table_id and s.player_id = (select auth.uid())
  );
$$;

revoke execute on function public.can_view_table(uuid) from public, anon;
grant execute on function public.can_view_table(uuid) to authenticated, service_role;

drop policy "Players can view public tables and their own" on public.game_tables;
create policy "Players can view tables they have access to"
  on public.game_tables for select
  to authenticated
  using (public.can_view_table(id));

drop policy "Table owners can view rounds" on public.blackjack_rounds;
create policy "Players can view rounds at tables they have access to"
  on public.blackjack_rounds for select
  to authenticated
  using (public.can_view_table(table_id));

alter table public.table_seats enable row level security;
alter table public.table_members enable row level security;

create policy "Players can view seats at tables they have access to"
  on public.table_seats for select
  to authenticated
  using (public.can_view_table(table_id));

create policy "Players can view their own memberships"
  on public.table_members for select
  to authenticated
  using ((select auth.uid()) = player_id);

-- This project doesn't grant table access automatically (see CLAUDE.md).
revoke all on public.table_seats, public.table_members from anon, authenticated;
grant select on public.table_seats, public.table_members to authenticated;
grant all on public.table_seats, public.table_members to service_role;

-- ---------- Live updates ----------

-- Every change at a table also updates game_tables.last_activity_at, so
-- watching that one row is enough to know when to refresh. Realtime applies
-- the policies above, so viewers only hear about tables they can see.
alter publication supabase_realtime add table public.game_tables;

-- ---------- Round functions with deadlines ----------

-- Deals a round: takes the bets, saves the round, clears the dealt players'
-- pending bets, and closes betting.
create function public.bj_deal(
  p_table_id uuid,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_chips jsonb,
  p_stats jsonb,
  p_players uuid[],
  p_deadline timestamptz
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

  insert into public.blackjack_rounds (table_id, round_number, phase, public_state, settled_at, deadline_at)
  values (
    p_table_id, v_number, p_phase, p_public,
    case when p_phase = 'settled' then now() end,
    case when p_phase = 'settled' then null else p_deadline end
  )
  returning id into v_round_id;

  insert into public.blackjack_round_secrets (round_id, state) values (v_round_id, p_secret);

  perform public.apply_chip_changes(p_chips, p_table_id, v_round_id);
  perform public.record_game_stats(p_stats);

  update public.table_seats
  set pending_bet = null, bet_placed_at = null
  where table_id = p_table_id and player_id = any (p_players);

  update public.game_tables
  set last_activity_at = now(), betting_deadline_at = null
  where id = p_table_id;

  return query select v_round_id, v_number;
end;
$$;

-- Saves an action (by a player, or automatic after a timeout). p_actor's
-- missed-turn count resets; each p_timed_out player's goes up, and two in a
-- row sits them out. Raises STALE_ROUND if the round changed meanwhile.
create function public.bj_act(
  p_round_id uuid,
  p_version integer,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_chips jsonb,
  p_decisions jsonb,
  p_stats jsonb,
  p_deadline timestamptz,
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
  update public.blackjack_rounds
  set phase = p_phase,
      public_state = p_public,
      version = version + 1,
      settled_at = case when p_phase = 'settled' then now() end,
      deadline_at = case when p_phase = 'settled' then null else p_deadline end
  where id = p_round_id and version = p_version and phase <> 'settled'
  returning table_id, version into v_table_id, v_version;

  if not found then
    raise exception 'STALE_ROUND';
  end if;

  update public.blackjack_round_secrets set state = p_secret where round_id = p_round_id;

  perform public.apply_chip_changes(p_chips, v_table_id, p_round_id);

  insert into public.blackjack_decisions (
    player_id, table_id, round_id, rules_key, phase, situation_key, situation, action, book_action, on_book, hints_enabled
  )
  select
    x.player_id, v_table_id, p_round_id, x.rules_key, x.phase, x.situation_key, x.situation,
    x.action, x.book_action, x.on_book, coalesce(x.hints_enabled, false)
  from jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb)) as x (
    player_id uuid, rules_key text, phase text, situation_key text, situation text,
    action text, book_action text, on_book boolean, hints_enabled boolean
  );

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

-- ---------- Idle tables ----------

-- Closes open tables nobody has sat at for 30 minutes. Returns how many.
create function public.close_idle_tables()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.game_tables t
  set status = 'closed', closed_at = now()
  where t.status = 'open'
    and t.last_activity_at < now() - interval '30 minutes'
    and not exists (select 1 from public.table_seats s where s.table_id = t.id)
    and not exists (select 1 from public.blackjack_rounds r where r.table_id = t.id and r.phase <> 'settled');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.bj_deal(uuid, text, jsonb, jsonb, jsonb, jsonb, uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.bj_act(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.close_idle_tables() from public, anon, authenticated;
grant execute on function public.bj_deal(uuid, text, jsonb, jsonb, jsonb, jsonb, uuid[], timestamptz) to service_role;
grant execute on function public.bj_act(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz, uuid, uuid[]) to service_role;
grant execute on function public.close_idle_tables() to service_role;
