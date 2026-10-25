-- Phase 4: per-player stats and "On Book" decision logging.
--
-- New round functions (blackjack_start_round / blackjack_apply_action) also
-- record stats and decisions. The old bj_* functions stay until the new code
-- is deployed, so the live site keeps working; a later migration drops them.

-- ---------- Per-player stats (any game) ----------

-- One row per player, game, and rule set. Game-specific counts (e.g.
-- blackjacks, busts) live in `counters` so new games don't need new columns.
create table public.player_game_stats (
  player_id uuid not null references public.profiles (id) on delete cascade,
  game text not null,
  -- Rule set label, e.g. "6D · S17 · 3:2 · DAS · LS"; used to filter stats.
  rules_key text not null,
  rounds bigint not null default 0,
  wins bigint not null default 0,
  losses bigint not null default 0,
  pushes bigint not null default 0,
  net_chips bigint not null default 0,
  biggest_win bigint not null default 0,
  -- Stored as a positive number.
  biggest_loss bigint not null default 0,
  counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  primary key (player_id, game, rules_key)
);

-- ---------- Blackjack decisions ----------

create table public.blackjack_decisions (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles (id) on delete cascade,
  table_id uuid references public.game_tables (id) on delete set null,
  round_id uuid references public.blackjack_rounds (id) on delete set null,
  rules_key text not null,
  phase text not null,
  -- e.g. "H16v10"; groups the same situation across hands.
  situation_key text not null,
  -- e.g. "Hard 16 vs 10".
  situation text not null,
  action text not null,
  book_action text not null,
  on_book boolean not null,
  -- The player had "show hints" on; these are reported separately.
  hints_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index blackjack_decisions_player_rules_idx on public.blackjack_decisions (player_id, rules_key);
create index blackjack_decisions_player_situation_idx on public.blackjack_decisions (player_id, situation_key);

-- ---------- Row Level Security ----------

alter table public.player_game_stats enable row level security;
alter table public.blackjack_decisions enable row level security;

create policy "Players can view their own stats"
  on public.player_game_stats for select
  to authenticated
  using ((select auth.uid()) = player_id);

create policy "Players can view their own decisions"
  on public.blackjack_decisions for select
  to authenticated
  using ((select auth.uid()) = player_id);

-- This project doesn't grant table access automatically (see CLAUDE.md).
revoke all on public.player_game_stats, public.blackjack_decisions from anon, authenticated;
grant select on public.player_game_stats, public.blackjack_decisions to authenticated;
grant all on public.player_game_stats, public.blackjack_decisions to service_role;

-- ---------- Recording helpers ----------

-- Adds two {"name": number} objects key by key.
create function public.jsonb_add_counters(a jsonb, b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(k, coalesce((a ->> k)::bigint, 0) + coalesce((b ->> k)::bigint, 0)),
    '{}'::jsonb
  )
  from (
    select jsonb_object_keys(coalesce(a, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(b, '{}'::jsonb))
  ) keys;
$$;

-- Adds finished rounds to players' stats. p_stats is a list of
-- { player_id, game, rules_key, net, counters } — one per seat per round.
create function public.record_game_stats(p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_game_stats as s (
    player_id, game, rules_key, rounds, wins, losses, pushes, net_chips, biggest_win, biggest_loss, counters
  )
  select
    x.player_id, x.game, x.rules_key, 1,
    (x.net > 0)::int, (x.net < 0)::int, (x.net = 0)::int,
    x.net, greatest(x.net, 0), greatest(-x.net, 0), coalesce(x.counters, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_stats, '[]'::jsonb))
    as x (player_id uuid, game text, rules_key text, net bigint, counters jsonb)
  on conflict (player_id, game, rules_key) do update set
    rounds = s.rounds + excluded.rounds,
    wins = s.wins + excluded.wins,
    losses = s.losses + excluded.losses,
    pushes = s.pushes + excluded.pushes,
    net_chips = s.net_chips + excluded.net_chips,
    biggest_win = greatest(s.biggest_win, excluded.biggest_win),
    biggest_loss = greatest(s.biggest_loss, excluded.biggest_loss),
    counters = public.jsonb_add_counters(s.counters, excluded.counters),
    updated_at = now();
end;
$$;

-- ---------- Round functions with stats and decisions ----------

create function public.blackjack_start_round(
  p_table_id uuid,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_chips jsonb,
  p_stats jsonb
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
  perform public.record_game_stats(p_stats);

  update public.game_tables set last_activity_at = now() where id = p_table_id;

  return query select v_round_id, v_number;
end;
$$;

-- Saves a player action, its book check, and (if the round ended) stats.
-- Raises STALE_ROUND if the round changed since the server read it.
create function public.blackjack_apply_action(
  p_round_id uuid,
  p_version integer,
  p_phase text,
  p_public jsonb,
  p_secret jsonb,
  p_chips jsonb,
  p_decisions jsonb,
  p_stats jsonb
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

  update public.game_tables set last_activity_at = now() where id = v_table_id;

  return v_version;
end;
$$;

revoke execute on function public.record_game_stats(jsonb) from public, anon, authenticated;
revoke execute on function public.blackjack_start_round(uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.blackjack_apply_action(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_game_stats(jsonb) to service_role;
grant execute on function public.blackjack_start_round(uuid, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.blackjack_apply_action(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

-- ---------- Reading On Book stats (for the profile page) ----------

-- Runs as the caller, so Row Level Security limits it to their own decisions.
-- Decisions made with hints on are counted separately, not in On Book %.
create function public.my_book_summary(p_rules_key text default null)
returns table (decisions bigint, on_book bigint, hinted_decisions bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where not d.hints_enabled),
    count(*) filter (where d.on_book and not d.hints_enabled),
    count(*) filter (where d.hints_enabled)
  from public.blackjack_decisions d
  where d.player_id = (select auth.uid())
    and (p_rules_key is null or d.rules_key = p_rules_key);
$$;

create function public.my_missed_situations(p_rules_key text default null, p_limit integer default 5)
returns table (situation_key text, situation text, misses bigint, total bigint, book_action text)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.situation_key,
    max(d.situation),
    count(*) filter (where not d.on_book),
    count(*),
    mode() within group (order by d.book_action)
  from public.blackjack_decisions d
  where d.player_id = (select auth.uid())
    and not d.hints_enabled
    and (p_rules_key is null or d.rules_key = p_rules_key)
  group by d.situation_key
  having count(*) filter (where not d.on_book) > 0
  order by 3 desc, 4 desc
  limit least(greatest(p_limit, 1), 20);
$$;

revoke execute on function public.my_book_summary(text) from public, anon;
revoke execute on function public.my_missed_situations(text, integer) from public, anon;
grant execute on function public.my_book_summary(text) to authenticated;
grant execute on function public.my_missed_situations(text, integer) to authenticated;
