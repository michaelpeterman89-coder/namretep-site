-- Tables can have no maximum bet: max_bet is null when there's no limit.
-- (Poker keeps its maximum buy-in in this column, so null means no maximum buy-in there.)
alter table public.game_tables alter column max_bet drop not null;

alter table public.game_tables drop constraint game_tables_bets;
alter table public.game_tables add constraint game_tables_bets check (
  min_bet >= 1 and (max_bet is null or (max_bet >= min_bet and max_bet <= 1000000))
);
