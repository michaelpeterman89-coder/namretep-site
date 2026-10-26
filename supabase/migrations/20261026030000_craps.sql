-- Craps: one live game per table (the bets on the felt, the point, and the
-- shooter), a history of every roll, and one function that saves a change and
-- moves the chips together.

alter table public.game_tables drop constraint game_tables_game;
alter table public.game_tables add constraint game_tables_game check (game in ('blackjack', 'holdem', 'craps'));

-- ---------- Ledger ----------

alter table public.chip_ledger drop constraint chip_ledger_reason;
alter table public.chip_ledger add constraint chip_ledger_reason check (
  reason in (
    'opening_balance', 'signup', 'refill', 'bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out',
    'admin_adjust', 'craps_bet', 'craps_win', 'craps_refund'
  )
);

-- ---------- The game ----------

-- Everything here is public to the table: craps has no hidden cards.
create table public.craps_games (
  table_id uuid primary key references public.game_tables (id) on delete cascade,
  -- The engine's state: bets, point, Fire Bet and All Small/Tall progress.
  state jsonb not null,
  -- Bumped on every change so two changes at once can't overwrite each other.
  version integer not null default 1,
  shooter_id uuid references public.profiles (id) on delete set null,
  -- The dice can't be rolled before this (time for everyone to bet).
  roll_at timestamptz,
  -- The last roll and what it did, for the dice animation and payouts.
  last_roll jsonb,
  updated_at timestamptz not null default now()
);

create table public.craps_rolls (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.game_tables (id) on delete cascade,
  shooter_id uuid references public.profiles (id) on delete set null,
  die1 smallint not null check (die1 between 1 and 6),
  die2 smallint not null check (die2 between 1 and 6),
  event text not null,
  -- How many rolls this shooter has made, counting this one.
  shooter_roll integer not null,
  created_at timestamptz not null default now()
);

create index craps_rolls_table_idx on public.craps_rolls (table_id, id desc);
create index craps_rolls_created_idx on public.craps_rolls (created_at);

alter table public.craps_games enable row level security;
alter table public.craps_rolls enable row level security;

create policy "Players can view craps games at tables they have access to"
  on public.craps_games for select
  to authenticated
  using (public.can_view_table(table_id));

create policy "Players can view craps rolls at tables they have access to"
  on public.craps_rolls for select
  to authenticated
  using (public.can_view_table(table_id));

-- This project doesn't grant table access automatically (see CLAUDE.md).
revoke all on public.craps_games, public.craps_rolls from anon, authenticated;
grant select on public.craps_games, public.craps_rolls to authenticated;
grant all on public.craps_games, public.craps_rolls to service_role;

-- ---------- Saving a change ----------

-- Saves the new game state and applies the chip changes
-- ([{ player_id, amount, reason }]) in one go. p_roll ({ shooter_id, die1,
-- die2, event, shooter_roll }) records a roll; p_stats records results.
-- Raises STALE_ROUND if the game changed since the server read it.
create function public.craps_save(
  p_table_id uuid,
  p_version integer,
  p_state jsonb,
  p_shooter uuid,
  p_roll_at timestamptz,
  p_last_roll jsonb,
  p_chips jsonb,
  p_roll jsonb,
  p_stats jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.craps_games
  set state = p_state,
      version = version + 1,
      shooter_id = p_shooter,
      roll_at = p_roll_at,
      last_roll = coalesce(p_last_roll, last_roll),
      updated_at = now()
  where table_id = p_table_id and version = p_version
  returning version into v_version;

  if not found then
    raise exception 'STALE_ROUND';
  end if;

  perform public.apply_chip_changes(p_chips, p_table_id, null);

  if p_roll is not null then
    insert into public.craps_rolls (table_id, shooter_id, die1, die2, event, shooter_roll)
    values (
      p_table_id,
      (p_roll ->> 'shooter_id')::uuid,
      (p_roll ->> 'die1')::smallint,
      (p_roll ->> 'die2')::smallint,
      p_roll ->> 'event',
      (p_roll ->> 'shooter_roll')::integer
    );
  end if;

  perform public.record_game_stats(p_stats);

  update public.game_tables set last_activity_at = now() where id = p_table_id;
  return v_version;
end;
$$;

revoke execute on function public.craps_save(uuid, integer, jsonb, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.craps_save(uuid, integer, jsonb, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- ---------- Leaderboard: count craps ----------

create or replace function public.leaderboard(p_period text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  game_reasons constant text[] := array[
    'bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out', 'craps_bet', 'craps_win', 'craps_refund'
  ];
  site_reasons constant text[] := array['opening_balance', 'signup', 'refill'];
begin
  if p_period not in ('day', 'week', 'month', 'year', 'all') then
    raise exception 'BAD_PERIOD';
  end if;
  v_since := public.leaderboard_since(p_period);

  return jsonb_build_object(
    'since', v_since,

    'players', coalesce((
      select jsonb_agg(row_to_json(r) order by r.profit desc)
      from (
        select p.id, p.username, p.avatar,
          sum(l.amount) filter (where l.reason = any (game_reasons)) as profit,
          coalesce(sum(l.amount) filter (where l.reason = any (site_reasons)), 0) as from_site,
          coalesce(sum(l.amount) filter (where l.reason = 'admin_adjust'), 0) as from_admins
        from public.chip_ledger l
        join public.profiles p on p.id = l.player_id
        where p.suspended_at is null and (v_since is null or l.created_at >= v_since)
        group by p.id
        having count(*) filter (where l.reason = any (game_reasons)) > 0
      ) r
    ), '[]'::jsonb),

    -- Total chips right now: balance plus chips on poker tables and on the craps felt.
    'richest', coalesce((
      select jsonb_agg(row_to_json(r) order by r.chips desc)
      from (
        select p.id, p.username, p.avatar,
          p.chips
            + coalesce((select sum(s.stack) from public.table_seats s where s.player_id = p.id), 0)
            + coalesce((
                select sum((b ->> 'amount')::bigint)
                from public.craps_games g, jsonb_array_elements(g.state -> 'bets') b
                where b ->> 'playerId' = p.id::text
              ), 0) as chips
        from public.profiles p
        where p.suspended_at is null
        order by 4 desc
        limit 25
      ) r
    ), '[]'::jsonb),

    'totals', (
      select jsonb_build_object(
        'site_given', coalesce(sum(l.amount) filter (where l.reason = any (site_reasons)), 0),
        'signups', count(*) filter (where l.reason = 'signup'),
        'refills', count(*) filter (where l.reason = 'refill'),
        'admin_given', coalesce(sum(l.amount) filter (where l.reason = 'admin_adjust' and l.amount > 0), 0),
        'admin_taken', coalesce(-sum(l.amount) filter (where l.reason = 'admin_adjust' and l.amount < 0), 0),
        'blackjack_wagered', coalesce(-sum(l.amount) filter (where l.reason in ('bet', 'double', 'split', 'insurance')), 0),
        'craps_wagered', coalesce(-sum(l.amount) filter (where l.reason = 'craps_bet'), 0),
        'players_net', coalesce(sum(l.amount) filter (where l.reason = any (game_reasons)), 0),
        'active_players', count(distinct l.player_id) filter (where l.reason = any (game_reasons)),
        'blackjack_rounds', (
          select count(*) from public.blackjack_rounds b where v_since is null or b.created_at >= v_since
        ),
        'poker_hands', (
          select count(*) from public.poker_hands h where v_since is null or h.created_at >= v_since
        ),
        'craps_rolls', (
          select count(*) from public.craps_rolls c where v_since is null or c.created_at >= v_since
        ),
        'chips_in_play', (
          select coalesce(sum(chips), 0) from public.profiles
        ) + (
          select coalesce(sum(stack), 0) from public.table_seats where player_id is not null
        ) + (
          select coalesce(sum((b ->> 'amount')::bigint), 0)
          from public.craps_games g, jsonb_array_elements(g.state -> 'bets') b
        )
      )
      from public.chip_ledger l
      where v_since is null or l.created_at >= v_since
    ),

    'records', jsonb_build_object(
      'biggest_win', (
        select row_to_json(r) from (
          select p.username, s.game, s.biggest_win as amount
          from public.player_game_stats s join public.profiles p on p.id = s.player_id
          where p.suspended_at is null and s.biggest_win > 0
          order by s.biggest_win desc limit 1
        ) r
      ),
      'biggest_loss', (
        select row_to_json(r) from (
          select p.username, s.game, s.biggest_loss as amount
          from public.player_game_stats s join public.profiles p on p.id = s.player_id
          where p.suspended_at is null and s.biggest_loss > 0
          order by s.biggest_loss desc limit 1
        ) r
      ),
      'most_hands', (
        select row_to_json(r) from (
          select p.username, sum(s.rounds) as amount
          from public.player_game_stats s join public.profiles p on p.id = s.player_id
          where p.suspended_at is null
          group by p.id order by 2 desc limit 1
        ) r
      ),
      'best_on_book', (
        select row_to_json(r) from (
          select p.username, count(*) as decisions,
            round(100.0 * count(*) filter (where d.on_book) / count(*), 1) as percent
          from public.blackjack_decisions d join public.profiles p on p.id = d.player_id
          where p.suspended_at is null and not d.hints_enabled
          group by p.id
          having count(*) >= 100
          order by 3 desc, 2 desc limit 1
        ) r
      ),
      -- The most rolls one shooter has made before sevening out.
      'longest_roll', (
        select row_to_json(r) from (
          select p.username, c.shooter_roll as amount
          from public.craps_rolls c join public.profiles p on p.id = c.shooter_id
          where p.suspended_at is null
          order by c.shooter_roll desc, c.id limit 1
        ) r
      )
    )
  );
end;
$$;
