-- Baccarat: one game per table (bets on the felt, the last hand, and the
-- scoreboard history), the shoe (server only), a history of every hand, and
-- one function that saves a change and moves the chips together.

alter table public.game_tables drop constraint game_tables_game;
alter table public.game_tables add constraint game_tables_game check (game in ('blackjack', 'holdem', 'craps', 'baccarat'));

-- ---------- Ledger ----------

alter table public.chip_ledger drop constraint chip_ledger_reason;
alter table public.chip_ledger add constraint chip_ledger_reason check (
  reason in (
    'opening_balance', 'signup', 'refill', 'bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out',
    'admin_adjust', 'craps_bet', 'craps_win', 'craps_refund', 'baccarat_bet', 'baccarat_win', 'baccarat_refund'
  )
);

-- ---------- The game ----------

-- What everyone at the table may see: bets, the last hand, and the roads.
create table public.baccarat_games (
  table_id uuid primary key references public.game_tables (id) on delete cascade,
  state jsonb not null,
  -- Bumped on every change so two changes at once can't overwrite each other.
  version integer not null default 1,
  -- When the next hand deals by itself (multiplayer), or null.
  deal_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The cards left in the shoe. Server only: no browser can read it.
create table public.baccarat_shoes (
  table_id uuid primary key references public.game_tables (id) on delete cascade,
  cards jsonb not null
);

create table public.baccarat_hands (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.game_tables (id) on delete cascade,
  player_cards jsonb not null,
  banker_cards jsonb not null,
  winner text not null check (winner in ('player', 'banker', 'tie')),
  created_at timestamptz not null default now()
);

create index baccarat_hands_table_idx on public.baccarat_hands (table_id, id desc);
create index baccarat_hands_created_idx on public.baccarat_hands (created_at);

alter table public.baccarat_games enable row level security;
alter table public.baccarat_shoes enable row level security;
alter table public.baccarat_hands enable row level security;

create policy "Players can view baccarat games at tables they have access to"
  on public.baccarat_games for select
  to authenticated
  using (public.can_view_table(table_id));

create policy "Players can view baccarat hands at tables they have access to"
  on public.baccarat_hands for select
  to authenticated
  using (public.can_view_table(table_id));

-- No policies on baccarat_shoes: no browser can read it.

-- This project doesn't grant table access automatically (see CLAUDE.md).
revoke all on public.baccarat_games, public.baccarat_shoes, public.baccarat_hands from anon, authenticated;
grant select on public.baccarat_games, public.baccarat_hands to authenticated;
grant all on public.baccarat_games, public.baccarat_shoes, public.baccarat_hands to service_role;

-- ---------- Saving a change ----------

-- Saves the new game state and applies the chip changes
-- ([{ player_id, amount, reason }]) in one go. p_shoe (when not null)
-- replaces the cards left; p_hand ({ player_cards, banker_cards, winner })
-- records a dealt hand; p_stats records results. Raises STALE_ROUND if the
-- game changed since the server read it.
create function public.baccarat_save(
  p_table_id uuid,
  p_version integer,
  p_state jsonb,
  p_deal_at timestamptz,
  p_shoe jsonb,
  p_chips jsonb,
  p_hand jsonb,
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
  update public.baccarat_games
  set state = p_state,
      version = version + 1,
      deal_at = p_deal_at,
      updated_at = now()
  where table_id = p_table_id and version = p_version
  returning version into v_version;

  if not found then
    raise exception 'STALE_ROUND';
  end if;

  if p_shoe is not null then
    insert into public.baccarat_shoes (table_id, cards) values (p_table_id, p_shoe)
    on conflict (table_id) do update set cards = excluded.cards;
  end if;

  perform public.apply_chip_changes(p_chips, p_table_id, null);

  if p_hand is not null then
    insert into public.baccarat_hands (table_id, player_cards, banker_cards, winner)
    values (p_table_id, p_hand -> 'player_cards', p_hand -> 'banker_cards', p_hand ->> 'winner');
  end if;

  perform public.record_game_stats(p_stats);

  update public.game_tables set last_activity_at = now() where id = p_table_id;
  return v_version;
end;
$$;

revoke execute on function public.baccarat_save(uuid, integer, jsonb, timestamptz, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.baccarat_save(uuid, integer, jsonb, timestamptz, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- ---------- Leaderboard: count baccarat ----------

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
    'bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out', 'craps_bet', 'craps_win', 'craps_refund',
    'baccarat_bet', 'baccarat_win', 'baccarat_refund'
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

    -- Total chips right now: balance plus chips on poker tables and bets on craps and baccarat felts.
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
              ), 0)
            + coalesce((
                select sum((b ->> 'amount')::bigint)
                from public.baccarat_games g, jsonb_array_elements(g.state -> 'bets') b
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
        'baccarat_wagered', coalesce(-sum(l.amount) filter (where l.reason = 'baccarat_bet'), 0),
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
        'baccarat_hands', (
          select count(*) from public.baccarat_hands h where v_since is null or h.created_at >= v_since
        ),
        'chips_in_play', (
          select coalesce(sum(chips), 0) from public.profiles
        ) + (
          select coalesce(sum(stack), 0) from public.table_seats where player_id is not null
        ) + (
          select coalesce(sum((b ->> 'amount')::bigint), 0)
          from public.craps_games g, jsonb_array_elements(g.state -> 'bets') b
        ) + (
          select coalesce(sum((b ->> 'amount')::bigint), 0)
          from public.baccarat_games g, jsonb_array_elements(g.state -> 'bets') b
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
