begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.bump_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.revision = old.revision + 1;
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.prevent_owner_id_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception using errcode = '42501', message = 'owner_id_is_immutable';
  end if;
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  game_package_id text not null,
  stable_engine_id text not null,
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint projects_game_package_id_format check (game_package_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  constraint projects_stable_engine_id_format check (stable_engine_id ~ '^[a-z0-9][a-z0-9:_-]{0,159}$'),
  constraint projects_owner_game_package_unique unique (owner_id, game_package_id)
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_id)
);

create table if not exists public.workspace_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stable_engine_id text not null,
  payload jsonb not null,
  payload_version integer not null default 1 check (payload_version > 0),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_drafts_stable_id_format check (stable_engine_id ~ '^[a-z0-9][a-z0-9:_-]{0,159}$'),
  constraint workspace_drafts_project_stable_unique unique (project_id, stable_engine_id)
);

create table if not exists public.testing_levels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  stable_engine_id text not null,
  name text not null,
  payload jsonb not null,
  payload_version integer not null default 1 check (payload_version > 0),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint testing_levels_stable_id_format check (stable_engine_id ~ '^[a-z0-9][a-z0-9:_-]{0,159}$'),
  constraint testing_levels_owner_stable_unique unique (owner_id, stable_engine_id)
);

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  stable_engine_id text not null,
  asset_kind text not null check (asset_kind in ('textures', 'characters', 'sprites', 'npc-images', 'weapon-art', 'other')),
  bucket_id text not null default 'builder-assets' check (bucket_id = 'builder-assets'),
  object_path text not null,
  original_name text not null default '',
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_assets_stable_id_format check (stable_engine_id ~ '^[a-z0-9][a-z0-9:_-]{0,159}$'),
  constraint project_assets_project_stable_unique unique (project_id, stable_engine_id),
  constraint project_assets_object_path_unique unique (bucket_id, object_path)
);

create table if not exists public.character_art (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  stable_engine_id text not null,
  name text not null,
  art_kind text not null check (art_kind in ('still', 'sprite_sheet')),
  asset_id uuid not null references public.project_assets(id) on delete restrict,
  frame_width integer check (frame_width is null or frame_width > 0),
  frame_height integer check (frame_height is null or frame_height > 0),
  row_count integer check (row_count is null or row_count > 0),
  column_count integer check (column_count is null or column_count > 0),
  animation_speed numeric(8, 4) check (animation_speed is null or animation_speed > 0),
  directional_mapping jsonb not null default '{}'::jsonb,
  idle_frames jsonb not null default '[]'::jsonb,
  walk_frames jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint character_art_stable_id_format check (stable_engine_id ~ '^[a-z0-9][a-z0-9:_-]{0,159}$'),
  constraint character_art_project_stable_unique unique (project_id, stable_engine_id)
);

create index if not exists projects_owner_updated_idx on public.projects(owner_id, updated_at desc);
create index if not exists project_members_user_idx on public.project_members(user_id, project_id);
create index if not exists workspace_drafts_project_updated_idx on public.workspace_drafts(project_id, updated_at desc);
create index if not exists testing_levels_owner_updated_idx on public.testing_levels(owner_id, updated_at desc);
create index if not exists testing_levels_project_idx on public.testing_levels(project_id) where project_id is not null;
create index if not exists project_assets_project_kind_idx on public.project_assets(project_id, asset_kind, updated_at desc);
create index if not exists character_art_project_updated_idx on public.character_art(project_id, updated_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;

create or replace function public.add_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.project_members(project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner', updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_project_created_add_owner on public.projects;
create trigger on_project_created_add_owner
after insert on public.projects
for each row execute function public.add_project_owner_membership();

insert into public.project_members (project_id, user_id, role)
select id, owner_id, 'owner'
from public.projects
on conflict (project_id, user_id) do update set role = 'owner';

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id and pm.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor')
  );
$$;

revoke all on function public.can_access_project(uuid) from public;
revoke all on function public.can_edit_project(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.workspace_drafts enable row level security;
alter table public.testing_levels enable row level security;
alter table public.project_assets enable row level security;
alter table public.character_art enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated
using (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists projects_select_accessible on public.projects;
create policy projects_select_accessible on public.projects for select to authenticated
using (owner_id = auth.uid() or public.can_access_project(id));
drop policy if exists projects_insert_owned on public.projects;
create policy projects_insert_owned on public.projects for insert to authenticated
with check (owner_id = auth.uid());
drop policy if exists projects_update_editable on public.projects;
create policy projects_update_editable on public.projects for update to authenticated
using (public.can_edit_project(id)) with check (public.can_edit_project(id));
drop policy if exists projects_delete_owned on public.projects;
create policy projects_delete_owned on public.projects for delete to authenticated
using (owner_id = auth.uid());

drop policy if exists project_members_select_accessible on public.project_members;
create policy project_members_select_accessible on public.project_members for select to authenticated
using (user_id = auth.uid() or public.can_access_project(project_id));
drop policy if exists project_members_insert_owner on public.project_members;
create policy project_members_insert_owner on public.project_members for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
drop policy if exists project_members_update_owner on public.project_members;
create policy project_members_update_owner on public.project_members for update to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
drop policy if exists project_members_delete_owner on public.project_members;
create policy project_members_delete_owner on public.project_members for delete to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

drop policy if exists workspace_drafts_select_accessible on public.workspace_drafts;
create policy workspace_drafts_select_accessible on public.workspace_drafts for select to authenticated
using (public.can_access_project(project_id));
drop policy if exists workspace_drafts_insert_editable on public.workspace_drafts;
create policy workspace_drafts_insert_editable on public.workspace_drafts for insert to authenticated
with check (public.can_edit_project(project_id) and created_by = auth.uid() and updated_by = auth.uid());
drop policy if exists workspace_drafts_update_editable on public.workspace_drafts;
create policy workspace_drafts_update_editable on public.workspace_drafts for update to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id) and updated_by = auth.uid());
drop policy if exists workspace_drafts_delete_editable on public.workspace_drafts;
create policy workspace_drafts_delete_editable on public.workspace_drafts for delete to authenticated
using (public.can_edit_project(project_id));

drop policy if exists testing_levels_select_owned on public.testing_levels;
create policy testing_levels_select_owned on public.testing_levels for select to authenticated
using (owner_id = auth.uid() and (project_id is null or public.can_access_project(project_id)));
drop policy if exists testing_levels_insert_owned on public.testing_levels;
create policy testing_levels_insert_owned on public.testing_levels for insert to authenticated
with check (owner_id = auth.uid() and (project_id is null or public.can_edit_project(project_id)));
drop policy if exists testing_levels_update_owned on public.testing_levels;
create policy testing_levels_update_owned on public.testing_levels for update to authenticated
using (owner_id = auth.uid() and (project_id is null or public.can_edit_project(project_id)))
with check (owner_id = auth.uid() and (project_id is null or public.can_edit_project(project_id)));
drop policy if exists testing_levels_delete_owned on public.testing_levels;
create policy testing_levels_delete_owned on public.testing_levels for delete to authenticated
using (owner_id = auth.uid() and (project_id is null or public.can_edit_project(project_id)));

drop policy if exists project_assets_select_accessible on public.project_assets;
create policy project_assets_select_accessible on public.project_assets for select to authenticated
using (public.can_access_project(project_id));
drop policy if exists project_assets_insert_editable on public.project_assets;
create policy project_assets_insert_editable on public.project_assets for insert to authenticated
with check (owner_id = auth.uid() and public.can_edit_project(project_id));
drop policy if exists project_assets_update_editable on public.project_assets;
create policy project_assets_update_editable on public.project_assets for update to authenticated
using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists project_assets_delete_editable on public.project_assets;
create policy project_assets_delete_editable on public.project_assets for delete to authenticated
using (public.can_edit_project(project_id));

drop policy if exists character_art_select_accessible on public.character_art;
create policy character_art_select_accessible on public.character_art for select to authenticated
using (public.can_access_project(project_id));
drop policy if exists character_art_insert_editable on public.character_art;
create policy character_art_insert_editable on public.character_art for insert to authenticated
with check (owner_id = auth.uid() and public.can_edit_project(project_id));
drop policy if exists character_art_update_editable on public.character_art;
create policy character_art_update_editable on public.character_art for update to authenticated
using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists character_art_delete_editable on public.character_art;
create policy character_art_delete_editable on public.character_art for delete to authenticated
using (public.can_edit_project(project_id));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists projects_bump_revision on public.projects;
create trigger projects_bump_revision before update on public.projects
for each row execute function public.bump_revision();
drop trigger if exists project_members_set_updated_at on public.project_members;
create trigger project_members_set_updated_at before update on public.project_members
for each row execute function public.set_updated_at();
drop trigger if exists testing_levels_bump_revision on public.testing_levels;
create trigger testing_levels_bump_revision before update on public.testing_levels
for each row execute function public.bump_revision();
drop trigger if exists project_assets_bump_revision on public.project_assets;
create trigger project_assets_bump_revision before update on public.project_assets
for each row execute function public.bump_revision();
drop trigger if exists character_art_bump_revision on public.character_art;
create trigger character_art_bump_revision before update on public.character_art
for each row execute function public.bump_revision();
drop trigger if exists projects_protect_owner on public.projects;
create trigger projects_protect_owner before update on public.projects
for each row execute function public.prevent_owner_id_change();
drop trigger if exists testing_levels_protect_owner on public.testing_levels;
create trigger testing_levels_protect_owner before update on public.testing_levels
for each row execute function public.prevent_owner_id_change();
drop trigger if exists project_assets_protect_owner on public.project_assets;
create trigger project_assets_protect_owner before update on public.project_assets
for each row execute function public.prevent_owner_id_change();
drop trigger if exists character_art_protect_owner on public.character_art;
create trigger character_art_protect_owner before update on public.character_art
for each row execute function public.prevent_owner_id_change();

create or replace function public.save_workspace_draft(
  p_project_id uuid,
  p_stable_engine_id text,
  p_payload jsonb,
  p_payload_version integer,
  p_expected_revision integer
)
returns setof public.workspace_drafts
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_row public.workspace_drafts%rowtype;
begin
  if not public.can_edit_project(p_project_id) then
    raise insufficient_privilege using message = 'project_access_denied';
  end if;

  select * into current_row
  from public.workspace_drafts
  where project_id = p_project_id and stable_engine_id = p_stable_engine_id
  for update;

  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception using errcode = '40001', message = 'cloud_revision_conflict';
    end if;
    begin
      insert into public.workspace_drafts (
        project_id, stable_engine_id, payload, payload_version, revision, created_by, updated_by
      ) values (
        p_project_id, p_stable_engine_id, p_payload, greatest(1, p_payload_version), 1, auth.uid(), auth.uid()
      ) returning * into current_row;
    exception when unique_violation then
      raise exception using errcode = '40001', message = 'cloud_revision_conflict';
    end;
  else
    if current_row.revision <> coalesce(p_expected_revision, 0) then
      raise exception using errcode = '40001', message = 'cloud_revision_conflict';
    end if;
    update public.workspace_drafts
    set payload = p_payload,
        payload_version = greatest(1, p_payload_version),
        revision = current_row.revision + 1,
        updated_by = auth.uid(),
        updated_at = timezone('utc', now())
    where id = current_row.id
    returning * into current_row;
  end if;

  return next current_row;
end;
$$;

revoke all on function public.save_workspace_draft(uuid, text, jsonb, integer, integer) from public;
grant execute on function public.save_workspace_draft(uuid, text, jsonb, integer, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'builder-assets',
  'builder-assets',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists builder_assets_select_owner_path on storage.objects;
create policy builder_assets_select_owner_path on storage.objects for select to authenticated
using (
  bucket_id = 'builder-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 3
);
drop policy if exists builder_assets_insert_owner_path on storage.objects;
create policy builder_assets_insert_owner_path on storage.objects for insert to authenticated
with check (
  bucket_id = 'builder-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 3
);
drop policy if exists builder_assets_update_owner_path on storage.objects;
create policy builder_assets_update_owner_path on storage.objects for update to authenticated
using (bucket_id = 'builder-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'builder-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists builder_assets_delete_owner_path on storage.objects;
create policy builder_assets_delete_owner_path on storage.objects for delete to authenticated
using (bucket_id = 'builder-assets' and (storage.foldername(name))[1] = auth.uid()::text);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.workspace_drafts to authenticated;
grant select, insert, update, delete on public.testing_levels to authenticated;
grant select, insert, update, delete on public.project_assets to authenticated;
grant select, insert, update, delete on public.character_art to authenticated;

commit;
