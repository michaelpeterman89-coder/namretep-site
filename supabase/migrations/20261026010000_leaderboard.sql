-- Leaderboard: profit and loss per period, richest players, site totals, and
-- all-time records. Read-only; built from the chip ledger and stats tables.

-- Period lookups scan the ledger by time.
create index chip_ledger_created_idx on public.chip_ledger (created_at);

-- When a period started, in the site's time zone (US Central). Weeks start Monday.
create function public.leaderboard_since(p_period text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case p_period
    when 'all' then null
    else date_trunc(p_period, now() at time zone 'America/Chicago') at time zone 'America/Chicago'
  end;
$$;

create function public.leaderboard(p_period text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  game_reasons constant text[] := array['bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out'];
  site_reasons constant text[] := array['opening_balance', 'signup', 'refill'];
begin
  if p_period not in ('day', 'week', 'month', 'year', 'all') then
    raise exception 'BAD_PERIOD';
  end if;
  v_since := public.leaderboard_since(p_period);

  return jsonb_build_object(
    'since', v_since,

    -- Everyone who played in the period, with their game profit and gifts.
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

    -- Total chips right now: balance plus chips on poker tables.
    'richest', coalesce((
      select jsonb_agg(row_to_json(r) order by r.chips desc)
      from (
        select p.id, p.username, p.avatar,
          p.chips + coalesce((select sum(s.stack) from public.table_seats s where s.player_id = p.id), 0) as chips
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
        'players_net', coalesce(sum(l.amount) filter (where l.reason = any (game_reasons)), 0),
        'active_players', count(distinct l.player_id) filter (where l.reason = any (game_reasons)),
        'blackjack_rounds', (
          select count(*) from public.blackjack_rounds b where v_since is null or b.created_at >= v_since
        ),
        'poker_hands', (
          select count(*) from public.poker_hands h where v_since is null or h.created_at >= v_since
        ),
        'chips_in_play', (
          select coalesce(sum(chips), 0) from public.profiles
        ) + (
          select coalesce(sum(stack), 0) from public.table_seats where player_id is not null
        )
      )
      from public.chip_ledger l
      where v_since is null or l.created_at >= v_since
    ),

    -- All-time records.
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
      )
    )
  );
end;
$$;

revoke execute on function public.leaderboard_since(text) from public, anon, authenticated;
revoke execute on function public.leaderboard(text) from public, anon, authenticated;
grant execute on function public.leaderboard_since(text) to service_role;
grant execute on function public.leaderboard(text) to service_role;
