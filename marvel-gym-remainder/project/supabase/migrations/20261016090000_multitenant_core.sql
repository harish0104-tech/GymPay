-- GymPay multi-tenant production foundation.
-- Every gym-owned row is protected by Postgres RLS; the browser never receives a service key.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.gym_role as enum ('owner', 'staff', 'member', 'platform_admin');

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  phone text,
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','cancelled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.gym_role not null default 'owner',
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'platform_admin' and gym_id is null) or (role <> 'platform_admin' and gym_id is not null)),
  check (permissions <@ array['payments','view_members','add_members','edit_members','attendance','renewals','reminders','bulk_reminders']::text[])
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null,
  birthday date,
  code text,
  email text,
  emergency_contact text not null default '',
  consent boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gym_id, id),
  unique (gym_id, phone)
);
alter table public.profiles add column member_id uuid;
alter table public.profiles add constraint profiles_member_fk foreign key (gym_id, member_id) references public.members(gym_id, id) on delete set null (member_id);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  fee numeric(12,2) not null check (fee >= 0),
  duration_months integer not null check (duration_months > 0),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gym_id, id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  plan_id uuid,
  start_date date not null,
  expiry_date date not null,
  fee numeric(12,2) not null check (fee >= 0),
  renewal boolean not null default false,
  discount numeric(12,2) not null default 0,
  source text not null default '',
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, member_id) references public.members(gym_id, id) on delete cascade,
  foreign key (gym_id, plan_id) references public.membership_plans(gym_id, id) on delete set null (plan_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  membership_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'Cash',
  status text not null default 'successful' check (status in ('pending','successful','failed','refunded','voided','cancelled')),
  reference text not null default '',
  receipt text not null default '',
  recorded_by uuid references auth.users(id) on delete set null,
  source text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now(),
  foreign key (gym_id, member_id) references public.members(gym_id, id) on delete cascade,
  foreign key (gym_id, membership_id) references public.memberships(gym_id, id) on delete cascade
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  attended_on date not null default current_date,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  method text not null default 'Manual',
  unique (gym_id, member_id, attended_on),
  foreign key (gym_id, member_id) references public.members(gym_id, id) on delete cascade
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  spent_on date not null default current_date,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null,
  kind text not null,
  scheduled_on date not null default current_date,
  membership_id uuid,
  window integer,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  recipient text not null default '',
  attempts integer not null default 0,
  error text not null default '',
  provider_id text not null default '',
  created_at timestamptz not null default now(),
  foreign key (gym_id, member_id) references public.members(gym_id, id) on delete cascade,
  foreign key (gym_id, membership_id) references public.memberships(gym_id, id) on delete set null (membership_id)
);

create table public.gym_settings (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  address text not null default '',
  email text not null default '',
  phone text not null default '',
  receipt_prefix text not null default 'GP',
  working_hours text not null default '06:00–22:00',
  expiry_window integer not null default 7 check (expiry_window between 0 and 60),
  attendance_target integer not null default 50 check (attendance_target > 0),
  reminder_windows integer[] not null default array[7,3,1,0,-3],
  discount_limit numeric(5,2) not null default 10 check (discount_limit between 0 and 100),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index members_gym_name_idx on public.members(gym_id, name);
create index memberships_gym_expiry_idx on public.memberships(gym_id, expiry_date);
create index payments_gym_paid_on_idx on public.payments(gym_id, paid_on desc);
create index attendance_gym_date_idx on public.attendance(gym_id, attended_on desc);

create or replace function public.current_gym_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select gym_id from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function public.current_gym_role()
returns public.gym_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function public.has_gym_role(target_gym uuid, allowed public.gym_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
      and p.gym_id = target_gym and p.role = any(allowed)
  )
$$;

create or replace function public.has_gym_permission(required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
      and (p.role = 'owner' or (p.role = 'staff' and p.permissions @> array[required_permission]))
  )
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  assigned_role public.gym_role;
  assigned_gym uuid;
  created_gym uuid;
  gym_name text;
begin
  -- app_metadata is admin-controlled; user_metadata must never grant a staff/platform role.
  if new.raw_app_meta_data ->> 'role' = 'staff' then
    assigned_gym := nullif(new.raw_app_meta_data ->> 'gym_id', '')::uuid;
    if assigned_gym is null or not exists (select 1 from public.gyms where id = assigned_gym) then
      raise exception 'A valid gym invitation is required';
    end if;
    assigned_role := 'staff';
  else
    gym_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'gym_name'), ''), 'My Gym');
    insert into public.gyms (name, owner_id, phone)
    values (gym_name, new.id, new.phone)
    returning id into created_gym;
    assigned_gym := created_gym;
    assigned_role := 'owner';
    insert into public.gym_settings (gym_id) values (created_gym);
  end if;

  insert into public.profiles (id, gym_id, full_name, phone, role, permissions)
  values (new.id, assigned_gym,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.phone, new.email, 'Gym owner'), '@', 1)),
    new.phone, assigned_role,
    case when assigned_role = 'staff' then array(select jsonb_array_elements_text(coalesce(new.raw_app_meta_data -> 'permissions', '[]'::jsonb))) else '{}'::text[] end);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.gyms enable row level security;
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.membership_plans enable row level security;
alter table public.memberships enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;
alter table public.expenses enable row level security;
alter table public.reminders enable row level security;
alter table public.gym_settings enable row level security;
alter table public.audit_events enable row level security;

create policy gyms_owner_read on public.gyms for select to authenticated
  using (id = (select public.current_gym_id()));
create policy gyms_owner_update on public.gyms for update to authenticated
  using (id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner')
  with check (id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');

create policy profiles_same_gym_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner'));
create policy members_gym_read on public.members for select to authenticated
  using (gym_id = (select public.current_gym_id()) and ((select public.has_gym_permission('view_members')) or (select public.has_gym_permission('payments')) or (select public.has_gym_permission('attendance'))));
create policy members_insert on public.members for insert to authenticated
  with check (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('add_members')));
create policy members_update on public.members for update to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('edit_members')))
  with check (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('edit_members')));
create policy members_delete on public.members for delete to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');

create policy plans_gym_read on public.membership_plans for select to authenticated
  using (gym_id = (select public.current_gym_id()));
create policy plans_owner_write on public.membership_plans for all to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner')
  with check (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');

create policy memberships_gym_read on public.memberships for select to authenticated
  using (gym_id = (select public.current_gym_id()) and ((select public.has_gym_permission('view_members')) or (select public.has_gym_permission('payments')) or (select public.has_gym_permission('attendance'))));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (gym_id = (select public.current_gym_id()) and ((select public.has_gym_permission('renewals')) or (select public.has_gym_permission('add_members'))));
create policy memberships_update on public.memberships for update to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('renewals')))
  with check (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('renewals')));
create policy memberships_owner_delete on public.memberships for delete to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');

create policy payments_gym_read on public.payments for select to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('payments')));
create policy payments_insert on public.payments for insert to authenticated
  with check (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('payments')) and (recorded_by is null or recorded_by = (select auth.uid())));
create policy payments_owner_update on public.payments for update to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner')
  with check (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');
create policy payments_owner_delete on public.payments for delete to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');

create policy attendance_gym_read on public.attendance for select to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('attendance')));
create policy attendance_insert on public.attendance for insert to authenticated
  with check (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('attendance')));
create policy attendance_update on public.attendance for update to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('attendance')))
  with check (gym_id = (select public.current_gym_id()) and (select public.has_gym_permission('attendance')));
create policy attendance_owner_delete on public.attendance for delete to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');

create policy expenses_owner_only on public.expenses for all to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner')
  with check (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');
create policy reminders_owner_staff on public.reminders for all to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) in ('owner','staff'))
  with check (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) in ('owner','staff'));
create policy settings_owner_read on public.gym_settings for select to authenticated
  using (gym_id = (select public.current_gym_id()));
create policy settings_owner_write on public.gym_settings for all to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner')
  with check (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');
create policy audit_owner_read on public.audit_events for select to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) = 'owner');
create policy audit_owner_insert on public.audit_events for insert to authenticated
  with check (gym_id = (select public.current_gym_id()) and (select public.current_gym_role()) in ('owner','staff') and actor_id = (select auth.uid()));

-- Apply one user action as a single Postgres transaction. SECURITY INVOKER keeps every
-- insert/update/delete subject to the policies above; the browser cannot choose a gym scope.
create or replace function public.apply_gympay_changes(p_upserts jsonb, p_deletions jsonb, p_gym_update jsonb default null)
returns void language plpgsql set search_path = '' as $$
declare
  v_table_name text;
  v_conflict_column text;
  update_clause text;
  ids uuid[];
begin
  if (select public.current_gym_id()) is null then
    raise exception 'An active gym workspace is required';
  end if;

  for v_table_name, v_conflict_column in
    select * from (values
      ('members','id'), ('membership_plans','id'), ('memberships','id'), ('payments','id'),
      ('attendance','id'), ('expenses','id'), ('reminders','id'), ('gym_settings','gym_id'), ('audit_events','id')
    ) as allowed_tables(table_name, conflict_column)
  loop
    if jsonb_typeof(coalesce(p_upserts -> v_table_name, '[]'::jsonb)) <> 'array' then
      raise exception 'Invalid rows for %', v_table_name;
    end if;
    if jsonb_array_length(coalesce(p_upserts -> v_table_name, '[]'::jsonb)) > 0 then
      select string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ' order by ordinal_position)
        into update_clause
        from information_schema.columns
       where table_schema = 'public' and information_schema.columns.table_name = v_table_name
         and column_name <> v_conflict_column;
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict (%I) do update set %s',
        v_table_name, v_table_name, v_conflict_column, update_clause
      ) using p_upserts -> v_table_name;
    end if;
  end loop;

  if p_gym_update is not null then
    update public.gyms
       set name = coalesce(nullif(trim(p_gym_update ->> 'name'), ''), name),
           phone = p_gym_update ->> 'phone'
     where id = (select public.current_gym_id());
  end if;

  for v_table_name in select unnest(array['payments','attendance','reminders','memberships','members','membership_plans','expenses'])
  loop
    if jsonb_typeof(coalesce(p_deletions -> v_table_name, '[]'::jsonb)) <> 'array' then
      raise exception 'Invalid deletion list for %', v_table_name;
    end if;
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into ids
      from jsonb_array_elements_text(coalesce(p_deletions -> v_table_name, '[]'::jsonb));
    if cardinality(ids) > 0 then
      execute format('delete from public.%I where id = any($1)', v_table_name) using ids;
    end if;
  end loop;
end;
$$;

revoke all on public.gyms, public.profiles, public.members, public.membership_plans, public.memberships,
  public.payments, public.attendance, public.expenses, public.reminders, public.gym_settings, public.audit_events
  from anon, authenticated, public;
grant select on public.gyms to authenticated;
grant update (name, phone) on public.gyms to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.members, public.memberships, public.payments, public.attendance, public.reminders to authenticated;
grant select, insert, update, delete on public.membership_plans, public.expenses, public.gym_settings to authenticated;
grant select, insert on public.audit_events to authenticated;
revoke execute on function public.current_gym_id(), public.current_gym_role(), public.has_gym_role(uuid, public.gym_role[]), public.has_gym_permission(text), public.apply_gympay_changes(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.current_gym_id(), public.current_gym_role(), public.has_gym_role(uuid, public.gym_role[]), public.has_gym_permission(text) to authenticated;
grant execute on function public.apply_gympay_changes(jsonb, jsonb, jsonb) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
