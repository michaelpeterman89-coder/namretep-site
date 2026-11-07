-- Two additions:
-- 1. Admins can clear "chips given/taken by admins" from the leaderboard. The
--    ledger rows stay (they're the record of what happened and they still add
--    up to each balance); cleared rows just stop counting in those stats.
-- 2. Poker players can show their cards after a hand is over.

alter table public.chip_ledger add column stats_cleared_at timestamptz;

alter table public.admin_actions drop constraint admin_actions_action;
alter table public.admin_actions add constraint admin_actions_action check (
  action in (
    'adjust_chips', 'grant_admin', 'revoke_admin', 'suspend', 'unsuspend', 'rename', 'close_table', 'clear_chip_stats'
  )
);

-- Clears the admin chip stats for one player, or everyone when p_target is null.
-- Returns how many ledger rows were cleared.
create function public.admin_clear_chip_stats(p_admin uuid, p_target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_given bigint;
  v_taken bigint;
begin
  perform public.assert_admin(p_admin);

  with cleared as (
    update public.chip_ledger
    set stats_cleared_at = now()
    where reason = 'admin_adjust'
      and stats_cleared_at is null
      and (p_target is null or player_id = p_target)
    returning amount
  )
  select count(*),
    coalesce(sum(amount) filter (where amount > 0), 0),
    coalesce(-sum(amount) filter (where amount < 0), 0)
  into v_count, v_given, v_taken
  from cleared;

  if v_count > 0 then
    insert into public.admin_actions (admin_id, target_id, action, details)
    values (p_admin, p_target, 'clear_chip_stats', jsonb_build_object('given', v_given, 'taken', v_taken));
  end if;
  return v_count;
end;
$$;

revoke execute on function public.admin_clear_chip_stats(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_clear_chip_stats(uuid, uuid) to service_role;

-- Saves a finished hand again after a player chose to show their cards. Raises
-- STALE_HAND if the hand changed since the server read it.
create function public.poker_show_hand(p_hand_id uuid, p_version integer, p_public jsonb, p_secret jsonb)
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
  set public_state = p_public, version = version + 1
  where id = p_hand_id and version = p_version and phase = 'complete'
  returning table_id, version into v_table_id, v_version;

  if not found then
    raise exception 'STALE_HAND';
  end if;

  update public.poker_hand_secrets set state = p_secret where hand_id = p_hand_id;
  update public.game_tables set last_activity_at = now() where id = v_table_id;
  return v_version;
end;
$$;

revoke execute on function public.poker_show_hand(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.poker_show_hand(uuid, integer, jsonb, jsonb) to service_role;

-- ---------- Leaderboard: leave out cleared admin chips ----------

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
          coalesce(sum(l.amount) filter (where l.reason = 'admin_adjust' and l.stats_cleared_at is null), 0) as from_admins
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
        'admin_given', coalesce(sum(l.amount) filter (where l.reason = 'admin_adjust' and l.stats_cleared_at is null and l.amount > 0), 0),
        'admin_taken', coalesce(-sum(l.amount) filter (where l.reason = 'admin_adjust' and l.stats_cleared_at is null and l.amount < 0), 0),
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
