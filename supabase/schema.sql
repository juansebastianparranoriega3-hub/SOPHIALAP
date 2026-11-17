-- ==========================================================
-- SOPHIALAP · Base de datos en Supabase (PostgreSQL)
-- El sitio está en GitHub Pages (estático); los datos viven aquí.
--
-- Seguridad:
--   * Las tablas tienen RLS activado y NINGUNA política: el navegador no puede
--     leerlas ni escribirlas directamente.
--   * Todo el acceso pasa por funciones SECURITY DEFINER (RPC) que validan:
--       - el código personal del estudiante (guardado como hash SHA-256), o
--       - el token de sesión docente (guardado como hash SHA-256, expira en 8 h).
--   * La contraseña docente se guarda con bcrypt (pgcrypto). Las credenciales
--     NO están en este archivo: el docente se crea aparte (ver final).
-- ==========================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. TABLAS ----------
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  grade       text not null check (grade in ('10', '11')),
  client_id   text,
  progress    jsonb not null default '{}'::jsonb,
  code_hash   text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.teachers (
  username      text primary key,
  password_hash text not null
);

create table if not exists public.teacher_sessions (
  token_hash  text primary key,
  username    text not null references public.teachers(username) on delete cascade,
  expires_at  timestamptz not null
);

create table if not exists public.settings (
  id               int primary key default 1 check (id = 1),
  resources        jsonb not null default '{}'::jsonb,
  extra_resources  jsonb not null default '{}'::jsonb
);
insert into public.settings (id) values (1) on conflict do nothing;

alter table public.students         enable row level security;
alter table public.teachers         enable row level security;
alter table public.teacher_sessions enable row level security;
alter table public.settings         enable row level security;

-- ---------- 2. UTILIDADES INTERNAS ----------
-- Hash SHA-256 en hexadecimal
create or replace function public._sha(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex');
$$;

-- Código personal legible: SL-XXXX-XXXX-XXXX (sin 0/O/1/I)
create or replace function public._new_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  s text := '';
begin
  for i in 0..11 loop
    s := s || substr(abc, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return 'SL-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4);
end $$;

-- Deja solo los campos esperados del progreso: { name, grade, u: { "0".."3": {...} } }
create or replace function public._clean_progress(p jsonb, p_name text, p_grade text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  u jsonb := coalesce(p -> 'u', '{}'::jsonb);
  out jsonb := '{}'::jsonb;
  k text;
begin
  if jsonb_typeof(u) <> 'object' then u := '{}'::jsonb; end if;
  foreach k in array array['0', '1', '2', '3'] loop
    if jsonb_typeof(u -> k) = 'object' then out := out || jsonb_build_object(k, u -> k); end if;
  end loop;
  return jsonb_build_object('name', p_name, 'grade', p_grade, 'u', out);
end $$;

-- Representación pública de un estudiante (sin hash del código)
create or replace function public._student_json(s public.students) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'grade', s.grade, 'progress', s.progress,
                            'updatedAt', s.updated_at, 'createdAt', s.created_at);
$$;

-- Valida el token docente o lanza "Acceso docente requerido."
create or replace function public._require_teacher(p_token text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.teacher_sessions
                 where token_hash = public._sha(p_token) and expires_at > now()) then
    raise exception 'Acceso docente requerido.' using errcode = '28000';
  end if;
end $$;

-- Normaliza el nombre (espacios) y valida nombre y grado
create or replace function public._check_student(p_name text, p_grade text) returns text
language plpgsql immutable set search_path = '' as $$
declare n text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 120);
begin
  if n = '' or coalesce(p_grade, '') not in ('10', '11') then
    raise exception 'Nombre o grado no válido.' using errcode = '22023';
  end if;
  return n;
end $$;

-- ---------- 3. SESIÓN DOCENTE ----------
create or replace function public.teacher_login(p_user text, p_password text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.teachers;
  token text;
begin
  select * into t from public.teachers where username = lower(trim(coalesce(p_user, '')));
  if t.username is null or t.password_hash <> extensions.crypt(coalesce(p_password, ''), t.password_hash) then
    perform pg_sleep(0.6);
    raise exception 'Usuario o contraseña incorrectos.' using errcode = '28P01';
  end if;
  delete from public.teacher_sessions where expires_at < now();
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.teacher_sessions (token_hash, username, expires_at)
  values (public._sha(token), t.username, now() + interval '8 hours');
  return jsonb_build_object('authenticated', true, 'token', token);
end $$;

create or replace function public.teacher_session(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('authenticated', exists (
    select 1 from public.teacher_sessions where token_hash = public._sha(p_token) and expires_at > now()));
$$;

create or replace function public.teacher_logout(p_token text) returns jsonb
language sql volatile security definer set search_path = '' as $$
  delete from public.teacher_sessions where token_hash = public._sha(p_token);
  select jsonb_build_object('authenticated', false);
$$;

-- ---------- 4. ESTUDIANTES (con código personal) ----------
create or replace function public.student_register(p_name text, p_grade text, p_client_id text, p_progress jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  n text := public._check_student(p_name, p_grade);
  code text := public._new_code();
  s public.students;
begin
  insert into public.students (name, grade, client_id, progress, code_hash)
  values (n, p_grade, left(p_client_id, 64), public._clean_progress(p_progress, n, p_grade), public._sha(code))
  returning * into s;
  return jsonb_build_object('student', public._student_json(s), 'accessCode', code);
end $$;

create or replace function public.student_access(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.students;
begin
  select * into s from public.students where code_hash = public._sha(upper(trim(coalesce(p_code, ''))));
  if s.id is null then
    perform pg_sleep(0.6);
    raise exception 'Código personal no válido.' using errcode = '28000';
  end if;
  return jsonb_build_object('student', public._student_json(s));
end $$;

create or replace function public.student_save_progress(p_id uuid, p_code text, p_progress jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.students;
begin
  update public.students
     set progress = public._clean_progress(p_progress, name, grade), updated_at = now()
   where id = p_id and code_hash = public._sha(upper(trim(coalesce(p_code, ''))))
  returning * into s;
  if s.id is null then raise exception 'Código personal no válido.' using errcode = '28000'; end if;
  return jsonb_build_object('student', public._student_json(s));
end $$;

-- ---------- 5. PANEL DOCENTE ----------
create or replace function public.teacher_list_students(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_teacher(p_token);
  return coalesce((select jsonb_agg(public._student_json(s) order by s.name) from public.students s), '[]'::jsonb);
end $$;

create or replace function public.teacher_create_student(p_token text, p_name text, p_grade text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._require_teacher(p_token);
  return public.student_register(p_name, p_grade, null, '{}'::jsonb);
end $$;

create or replace function public.teacher_update_student(p_token text, p_id uuid, p_progress jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.students;
  n text;
  g text;
begin
  perform public._require_teacher(p_token);
  select * into s from public.students where id = p_id;
  if s.id is null then raise exception 'Estudiante no encontrado.' using errcode = 'P0002'; end if;
  n := coalesce(nullif(left(regexp_replace(trim(coalesce(p_progress ->> 'name', '')), '\s+', ' ', 'g'), 120), ''), s.name);
  g := case when p_progress ->> 'grade' in ('10', '11') then p_progress ->> 'grade' else s.grade end;
  update public.students
     set name = n, grade = g, progress = public._clean_progress(p_progress, n, g), updated_at = now()
   where id = p_id returning * into s;
  return public._student_json(s);
end $$;

create or replace function public.teacher_delete_student(p_token text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._require_teacher(p_token);
  delete from public.students where id = p_id;
end $$;

create or replace function public.teacher_get_settings(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_teacher(p_token);
  return (select jsonb_build_object('settings', jsonb_build_object('resources', resources, 'extraResources', extra_resources))
          from public.settings where id = 1);
end $$;

create or replace function public.teacher_put_settings(p_token text, p_resources jsonb, p_extra jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._require_teacher(p_token);
  update public.settings
     set resources = case when jsonb_typeof(p_resources) = 'object' then p_resources else '{}'::jsonb end,
         extra_resources = case when jsonb_typeof(p_extra) = 'object' then p_extra else '{}'::jsonb end
   where id = 1;
  return public.teacher_get_settings(p_token);
end $$;

-- ---------- 6. PERMISOS ----------
-- Nadie ejecuta nada por defecto; solo las RPC públicas se abren al rol anónimo.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.teacher_login(text, text), public.teacher_session(text), public.teacher_logout(text),
  public.student_register(text, text, text, jsonb), public.student_access(text),
  public.student_save_progress(uuid, text, jsonb),
  public.teacher_list_students(text), public.teacher_create_student(text, text, text),
  public.teacher_update_student(text, uuid, jsonb), public.teacher_delete_student(text, uuid),
  public.teacher_get_settings(text), public.teacher_put_settings(text, jsonb, jsonb)
to anon, authenticated;

-- ---------- 7. CREAR EL USUARIO DOCENTE (ejecutar aparte, NO subir la contraseña real) ----------
-- insert into public.teachers (username, password_hash)
-- values ('docente', extensions.crypt('<CONTRASEÑA>', extensions.gen_salt('bf', 10)));
