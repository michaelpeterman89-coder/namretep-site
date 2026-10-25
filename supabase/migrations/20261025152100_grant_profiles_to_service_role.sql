-- This project doesn't grant table access to service_role automatically, and
-- the accounts migration only granted access to players. Let the server
-- (secret key) read and manage profiles too. Player access is unchanged.
grant select, insert, update, delete on public.profiles to service_role;
