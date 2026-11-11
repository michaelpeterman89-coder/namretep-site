-- Fantasy: the Yahoo Fantasy API was dropped (its terms allow personal use only,
-- with no showing data to others and no caching), so the saved Yahoo connections
-- and their encrypted tokens go with it. Nothing else uses this table.
-- 20261108010000_yahoo_connections.sql stays, because the live database has run it.

drop table public.yahoo_connections;
