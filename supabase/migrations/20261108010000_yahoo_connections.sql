-- Fantasy: each site account's link to a Yahoo account. Tokens are encrypted by
-- the server before they get here, and players can't read this table at all:
-- only server code with the secret key can.

create table public.yahoo_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz not null,
  -- What the player has allowed. Only 'read' exists until manage features are built.
  access_level text not null default 'read',
  -- Yahoo refused to renew the connection, so the player has to connect again.
  needs_reconnect boolean not null default false,
  -- Yahoo can cancel the old refresh token when it issues a new one, so only one
  -- request may renew a connection at a time. Expires by itself if a request dies.
  refresh_locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint yahoo_connections_access_level check (access_level in ('read'))
);

alter table public.yahoo_connections enable row level security;
revoke all on public.yahoo_connections from anon, authenticated;
grant all on public.yahoo_connections to service_role;
