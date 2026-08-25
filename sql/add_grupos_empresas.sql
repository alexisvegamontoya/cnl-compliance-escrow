-- ============================================================
-- Grupos de empresas (sujetos obligados agrupados en un grupo económico)
--
-- · Un sujeto obligado pertenece a lo sumo a UN grupo (tenants.grupo_id).
-- · Un usuario puede pertenecer a VARIOS grupos (grupo_usuarios, N a N).
-- · El usuario de un grupo es "miembro pleno" de todas las empresas del grupo:
--   se logra sumando los tenants del grupo a mis_tenant_ids(), así hereda todo
--   el RLS existente (ver/editar) sin tocar cada política.
-- · Solo el superadministrador gestiona grupos, asignaciones y usuarios.
-- ============================================================

create table if not exists public.grupos_empresas (
  id          uuid        primary key default gen_random_uuid(),
  nombre      text        not null,
  descripcion text,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Un sujeto obligado pertenece a lo sumo a un grupo.
alter table public.tenants
  add column if not exists grupo_id uuid references public.grupos_empresas(id) on delete set null;
create index if not exists idx_tenants_grupo on public.tenants(grupo_id);

-- Usuarios asignados a grupos (muchos a muchos).
create table if not exists public.grupo_usuarios (
  id         uuid        primary key default gen_random_uuid(),
  grupo_id   uuid        not null references public.grupos_empresas(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  unique (grupo_id, user_id)
);
create index if not exists idx_grupo_usuarios_user  on public.grupo_usuarios(user_id);
create index if not exists idx_grupo_usuarios_grupo on public.grupo_usuarios(grupo_id);

-- ── mis_tenant_ids(): incluir los tenants de los grupos del usuario ──
create or replace function mis_tenant_ids()
returns setof uuid
language sql
security definer
stable
as $$
  -- Membresías activas (modelo directo)
  select tenant_id from user_tenant_memberships
  where user_id = auth.uid() and activo = true
  union
  -- Fallback legacy: tenant_id en user_profiles
  select tenant_id from user_profiles
  where id = auth.uid() and tenant_id is not null
  union
  -- Tenants de los grupos del usuario (miembro pleno del grupo de empresas)
  select t.id
  from tenants t
  join grupo_usuarios gu on gu.grupo_id = t.grupo_id
  where gu.user_id = auth.uid() and gu.activo = true
$$;

-- ── Grupos del usuario actual (para RLS y para la UI) ──
create or replace function mis_grupos_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select grupo_id from grupo_usuarios
  where user_id = auth.uid() and activo = true
$$;

-- ── RLS: grupos_empresas ──
alter table public.grupos_empresas enable row level security;
drop policy if exists "grupos_superadmin_all" on public.grupos_empresas;
drop policy if exists "grupos_member_read"    on public.grupos_empresas;

create policy "grupos_superadmin_all" on public.grupos_empresas
  for all to authenticated
  using (es_superadmin()) with check (es_superadmin());

create policy "grupos_member_read" on public.grupos_empresas
  for select to authenticated
  using (id in (select mis_grupos_ids()));

-- ── RLS: grupo_usuarios ──
alter table public.grupo_usuarios enable row level security;
drop policy if exists "gu_superadmin_all" on public.grupo_usuarios;
drop policy if exists "gu_own_read"       on public.grupo_usuarios;

create policy "gu_superadmin_all" on public.grupo_usuarios
  for all to authenticated
  using (es_superadmin()) with check (es_superadmin());

create policy "gu_own_read" on public.grupo_usuarios
  for select to authenticated
  using (user_id = auth.uid() and activo = true);

notify pgrst, 'reload schema';
