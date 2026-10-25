-- Admin tools: an admin flag, account suspension, chip adjustments, and an
-- audit log of everything an admin does. All admin functions are called by
-- server code with the secret key, and each one re-checks that the caller is
-- an admin.

alter table public.profiles add column is_admin boolean not null default false;
alter table public.profiles add column suspended_at timestamptz;

-- The site owner's account.
update public.profiles set is_admin = true where id = '524327fa-2b6b-4424-91c0-d129bd6d42b1';

-- ---------- Ledger ----------

alter table public.chip_ledger drop constraint chip_ledger_reason;
alter table public.chip_ledger add constraint chip_ledger_reason check (
  reason in (
    'opening_balance', 'signup', 'refill', 'bet', 'double', 'split', 'insurance', 'payout', 'buy_in', 'cash_out',
    'admin_adjust'
  )
);

-- ---------- Audit log ----------

create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  target_id uuid references public.profiles (id) on delete set null,
  table_id uuid references public.game_tables (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint admin_actions_action check (
    action in ('adjust_chips', 'grant_admin', 'revoke_admin', 'suspend', 'unsuspend', 'rename', 'close_table')
  )
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);
create index admin_actions_target_idx on public.admin_actions (target_id, created_at desc);

-- Only server code (secret key) reads or writes the log.
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;
grant all on public.admin_actions to service_role;

-- ---------- Helpers ----------

create function public.assert_admin(p_admin uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = p_admin and is_admin and suspended_at is null
  ) then
    raise exception 'NOT_ADMIN';
  end if;
end;
$$;

-- Records an admin action done outside these functions (e.g. closing a table).
create function public.admin_log(p_admin uuid, p_action text, p_target uuid, p_table uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  insert into public.admin_actions (admin_id, target_id, table_id, action, details)
  values (p_admin, p_target, p_table, p_action, coalesce(p_details, '{}'::jsonb));
end;
$$;

-- ---------- Chips ----------

-- Adds (positive) or removes (negative) chips. Raises INSUFFICIENT_CHIPS if the
-- balance would go below zero. Returns the new balance.
create function public.admin_adjust_chips(p_admin uuid, p_target uuid, p_amount bigint, p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  perform public.assert_admin(p_admin);
  if p_amount = 0 or abs(p_amount) > 100000000 then
    raise exception 'BAD_AMOUNT';
  end if;

  select chips into v_balance from public.profiles where id = p_target for update;
  if not found then
    raise exception 'NO_PROFILE';
  end if;
  if v_balance + p_amount < 0 then
    raise exception 'INSUFFICIENT_CHIPS';
  end if;

  update public.profiles set chips = chips + p_amount where id = p_target
  returning chips into v_balance;

  insert into public.chip_ledger (player_id, amount, balance_after, reason)
  values (p_target, p_amount, v_balance, 'admin_adjust');

  insert into public.admin_actions (admin_id, target_id, action, details)
  values (p_admin, p_target, 'adjust_chips',
    jsonb_build_object('amount', p_amount, 'balance_after', v_balance, 'note', nullif(trim(coalesce(p_note, '')), '')));

  return v_balance;
end;
$$;

-- ---------- Roles and suspension ----------

-- Admins can't change their own admin status or suspend themselves, so the
-- site can't be left without an admin by accident.
create function public.admin_set_admin(p_admin uuid, p_target uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  if p_admin = p_target then
    raise exception 'NOT_YOURSELF';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_target and is_admin is distinct from p_is_admin;
  if found then
    insert into public.admin_actions (admin_id, target_id, action)
    values (p_admin, p_target, case when p_is_admin then 'grant_admin' else 'revoke_admin' end);
  end if;
end;
$$;

create function public.admin_set_suspended(p_admin uuid, p_target uuid, p_suspended boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  if p_admin = p_target then
    raise exception 'NOT_YOURSELF';
  end if;
  update public.profiles
  set suspended_at = case when p_suspended then now() else null end
  where id = p_target and (suspended_at is not null) is distinct from p_suspended;
  if found then
    insert into public.admin_actions (admin_id, target_id, action, details)
    values (p_admin, p_target, case when p_suspended then 'suspend' else 'unsuspend' end,
      jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), '')));
  end if;
end;
$$;

-- Changes a username (e.g. an offensive one). Raises 23505 if it's taken.
create function public.admin_rename(p_admin uuid, p_target uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform public.assert_admin(p_admin);
  select username into v_old from public.profiles where id = p_target for update;
  if not found then
    raise exception 'NO_PROFILE';
  end if;
  if v_old = p_username then
    return;
  end if;
  update public.profiles set username = p_username where id = p_target;
  insert into public.admin_actions (admin_id, target_id, action, details)
  values (p_admin, p_target, 'rename', jsonb_build_object('from', v_old, 'to', p_username));
end;
$$;

-- ---------- Overview ----------

create function public.admin_overview(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  return jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'new_this_week', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'suspended', (select count(*) from public.profiles where suspended_at is not null),
    'admins', (select count(*) from public.profiles where is_admin),
    'chips_in_wallets', (select coalesce(sum(chips), 0) from public.profiles),
    'chips_on_tables', (select coalesce(sum(stack), 0) from public.table_seats where player_id is not null),
    'open_tables', (select count(*) from public.game_tables where status = 'open'),
    'blackjack_rounds_today', (select count(*) from public.blackjack_rounds where created_at > now() - interval '24 hours'),
    'poker_hands_today', (select count(*) from public.poker_hands where created_at > now() - interval '24 hours')
  );
end;
$$;

-- ---------- Privileges ----------

revoke execute on function public.assert_admin(uuid) from public, anon, authenticated;
revoke execute on function public.admin_log(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_adjust_chips(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.admin_set_admin(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_set_suspended(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.admin_rename(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_overview(uuid) from public, anon, authenticated;

grant execute on function public.assert_admin(uuid) to service_role;
grant execute on function public.admin_log(uuid, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_adjust_chips(uuid, uuid, bigint, text) to service_role;
grant execute on function public.admin_set_admin(uuid, uuid, boolean) to service_role;
grant execute on function public.admin_set_suspended(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_rename(uuid, uuid, text) to service_role;
grant execute on function public.admin_overview(uuid) to service_role;
