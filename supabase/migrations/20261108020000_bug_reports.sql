-- Public bug reports. Anyone can read them on the site; players with an account
-- can report and comment; admins can reply, set a status, and remove posts.
-- Clients have no direct access: server code reads with the secret key and
-- writes through the functions below, which check the caller again.

-- Keep these values in sync with src/lib/bugs.ts.

create table public.bug_reports (
  id bigint generated always as identity primary key,
  author_id uuid references public.profiles (id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bug_reports_title check (char_length(title) between 5 and 120),
  constraint bug_reports_body check (char_length(body) between 10 and 4000),
  constraint bug_reports_status check (status in ('new', 'expected', 'in_progress', 'planned', 'fixed', 'other'))
);

create index bug_reports_updated_idx on public.bug_reports (updated_at desc);
create index bug_reports_status_idx on public.bug_reports (status, updated_at desc);
create index bug_reports_author_idx on public.bug_reports (author_id, created_at desc);

-- A comment, a status change by an admin, or both at once.
create table public.bug_comments (
  id bigint generated always as identity primary key,
  report_id bigint not null references public.bug_reports (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text,
  status text,
  created_at timestamptz not null default now(),

  constraint bug_comments_body check (body is null or char_length(body) between 1 and 2000),
  constraint bug_comments_status check (
    status is null or status in ('new', 'expected', 'in_progress', 'planned', 'fixed', 'other')
  ),
  constraint bug_comments_has_content check (body is not null or status is not null)
);

create index bug_comments_report_idx on public.bug_comments (report_id, created_at);
create index bug_comments_author_idx on public.bug_comments (author_id, created_at desc);

alter table public.bug_reports enable row level security;
alter table public.bug_comments enable row level security;
revoke all on public.bug_reports, public.bug_comments from anon, authenticated;
grant all on public.bug_reports, public.bug_comments to service_role;

-- Status changes and removals go in the admin log.
alter table public.admin_actions drop constraint admin_actions_action;
alter table public.admin_actions add constraint admin_actions_action check (
  action in (
    'adjust_chips', 'grant_admin', 'revoke_admin', 'suspend', 'unsuspend', 'rename', 'close_table', 'clear_chip_stats',
    'bug_status', 'delete_bug_report', 'delete_bug_comment'
  )
);

-- ---------- Posting ----------

-- Checks the player can post and hasn't posted too much in the last hour.
-- Admins have no limit. The lock stops a burst of requests all passing at once.
create function public.bug_check_poster(p_player uuid, p_table text, p_limit int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
begin
  if not exists (select 1 from public.profiles where id = p_player and suspended_at is null) then
    raise exception 'CANNOT_POST';
  end if;
  if exists (select 1 from public.profiles where id = p_player and is_admin) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('bug_posts:' || p_player::text));
  if p_table = 'reports' then
    select count(*) into v_recent from public.bug_reports
    where author_id = p_player and created_at > now() - interval '1 hour';
  else
    select count(*) into v_recent from public.bug_comments
    where author_id = p_player and created_at > now() - interval '1 hour';
  end if;
  if v_recent >= p_limit then
    raise exception 'TOO_MANY_POSTS';
  end if;
end;
$$;

create function public.bug_report_create(p_player uuid, p_title text, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public.bug_check_poster(p_player, 'reports', 5);
  insert into public.bug_reports (author_id, title, body)
  values (p_player, p_title, p_body)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.bug_comment_add(p_player uuid, p_report bigint, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bug_check_poster(p_player, 'comments', 20);
  update public.bug_reports set updated_at = now() where id = p_report;
  if not found then
    raise exception 'NO_REPORT';
  end if;
  insert into public.bug_comments (report_id, author_id, body) values (p_report, p_player, p_body);
end;
$$;

-- ---------- Admins ----------

-- Sets the status, with an optional public reply posted alongside it.
create function public.bug_report_respond(p_admin uuid, p_report bigint, p_status text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform public.assert_admin(p_admin);
  select status into v_old from public.bug_reports where id = p_report for update;
  if not found then
    raise exception 'NO_REPORT';
  end if;

  if v_old = p_status and p_body is null then
    return;
  end if;

  insert into public.bug_comments (report_id, author_id, body, status)
  values (p_report, p_admin, p_body, case when v_old = p_status then null else p_status end);
  update public.bug_reports set status = p_status, updated_at = now() where id = p_report;

  if v_old <> p_status then
    insert into public.admin_actions (admin_id, action, details)
    values (p_admin, 'bug_status', jsonb_build_object('report', p_report, 'from', v_old, 'to', p_status));
  end if;
end;
$$;

create function public.bug_report_delete(p_admin uuid, p_report bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  perform public.assert_admin(p_admin);
  delete from public.bug_reports where id = p_report returning title into v_title;
  if not found then
    raise exception 'NO_REPORT';
  end if;
  insert into public.admin_actions (admin_id, action, details)
  values (p_admin, 'delete_bug_report', jsonb_build_object('report', p_report, 'title', v_title));
end;
$$;

-- Removes a comment's words. A status change posted with it stays in the history.
create function public.bug_comment_delete(p_admin uuid, p_comment bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report bigint;
  v_status text;
begin
  perform public.assert_admin(p_admin);
  select report_id, status into v_report, v_status from public.bug_comments where id = p_comment for update;
  if not found then
    raise exception 'NO_REPORT';
  end if;
  if v_status is null then
    delete from public.bug_comments where id = p_comment;
  else
    update public.bug_comments set body = null where id = p_comment;
  end if;
  insert into public.admin_actions (admin_id, action, details)
  values (p_admin, 'delete_bug_comment', jsonb_build_object('report', v_report));
end;
$$;

-- ---------- Counts for the filter links ----------

create function public.bug_report_counts()
returns table (status text, reports bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select status, count(*) from public.bug_reports group by status;
$$;

-- ---------- Privileges ----------

revoke execute on function public.bug_check_poster(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.bug_report_create(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.bug_comment_add(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.bug_report_respond(uuid, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.bug_report_delete(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.bug_comment_delete(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.bug_report_counts() from public, anon, authenticated;

grant execute on function public.bug_check_poster(uuid, text, int) to service_role;
grant execute on function public.bug_report_create(uuid, text, text) to service_role;
grant execute on function public.bug_comment_add(uuid, bigint, text) to service_role;
grant execute on function public.bug_report_respond(uuid, bigint, text, text) to service_role;
grant execute on function public.bug_report_delete(uuid, bigint) to service_role;
grant execute on function public.bug_comment_delete(uuid, bigint) to service_role;
grant execute on function public.bug_report_counts() to service_role;
