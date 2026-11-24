-- =====================================================================
--  EL RESACÓN · App de la peña · Fase 1
--  SQL completo para Supabase (tablas, seguridad RLS, funciones, avisos
--  y almacenamiento de fotos).
--
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede volver a ejecutar sin romper nada.
--
--  Importes SIEMPRE en céntimos (integer): 25,50 € = 2550.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Miembros (datos que ven todos los miembros: apodo y foto)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  apodo          text not null check (char_length(trim(apodo)) between 1 and 30),
  foto_url       text,                       -- ruta en el almacén "fotos"
  rol            text not null default 'member' check (rol in ('member','admin')),
  activo         boolean not null default true,
  tutorial_visto boolean not null default false,
  creado_en      timestamptz not null default now()
);

-- Datos privados de cada miembro: solo los ve él y el administrador
create table if not exists public.perfil_privado (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  telefono     text,
  metodo_cobro text check (metodo_cobro in ('revolut','transferencia','bizum')),
  dato_cobro   text                          -- su Revtag, IBAN o número de Bizum
);

-- Invitaciones: sin código válido no se puede crear cuenta
create table if not exists public.invites (
  codigo      text primary key,
  creado_por  uuid references public.profiles(id) on delete set null,
  usado_por   uuid references public.profiles(id) on delete set null, -- último que la usó
  usado_en    timestamptz,
  usos        integer not null default 0,
  usos_max    integer not null default 1 check (usos_max >= 1),
  activa      boolean not null default true,
  caduca_en   timestamptz,
  nota        text,
  creado_en   timestamptz not null default now()
);

-- Eventos (Fiestas San Lorenzo, cena de Navidad...)
create table if not exists public.events (
  id                 bigint generated always as identity primary key,
  nombre             text not null,
  descripcion        text,
  fecha_inicio       date,
  fecha_fin          date,
  portada_url        text,                   -- ruta en el almacén "portadas"
  modo_reparto       text not null default 'igual' check (modo_reparto in ('igual','fijo','manual')),
  importe_fijo_cents integer check (importe_fijo_cents >= 0),
  fecha_limite_pago  date,
  estado             text not null default 'abierto' check (estado in ('abierto','cerrado')),
  autoapuntarse      boolean not null default false,  -- botón «Me apunto»
  creado_en          timestamptz not null default now()
);

create table if not exists public.event_participants (
  event_id             bigint not null references public.events(id) on delete cascade,
  user_id              uuid   not null references public.profiles(id) on delete cascade,
  importe_manual_cents integer check (importe_manual_cents >= 0), -- solo reparto manual
  primary key (event_id, user_id)
);

-- Invitados: alguien de la peña trae a un amigo, pareja… Si «paga», en
-- el reparto cuenta como una persona más y el cargo va a quien lo trae.
create table if not exists public.event_guests (
  id                   bigint generated always as identity primary key,
  event_id             bigint not null references public.events(id) on delete cascade,
  host_id              uuid   not null references public.profiles(id) on delete cascade,  -- quien lo trae (paga su parte)
  nombre               text   not null check (char_length(trim(nombre)) between 1 and 40),
  relacion             text,                                   -- amigo, novia, primo…
  paga                 boolean not null default true,          -- lo decide el admin
  importe_manual_cents integer check (importe_manual_cents >= 0),  -- solo reparto a mano
  creado_por           uuid references public.profiles(id) on delete set null,
  creado_en            timestamptz not null default now()
);

-- Lista de la compra de cada evento. El coste es OPCIONAL: se puede
-- apuntar «Coger y poner bebidas» sin precio, encargárselo a alguien y
-- poner más tarde cuánto costó y quién lo pagó.
create table if not exists public.purchase_items (
  id                    bigint generated always as identity primary key,
  event_id              bigint not null references public.events(id) on delete cascade,
  concepto              text not null,
  cantidad              numeric(10,2) not null default 1 check (cantidad > 0),
  precio_unitario_cents integer check (precio_unitario_cents >= 0),
  total_cents           integer check (total_cents >= 0),  -- coste total; vacío = aún no se sabe
  comprado_por          uuid references public.profiles(id) on delete set null,  -- encargado de comprarlo
  pagado_por            uuid references public.profiles(id) on delete set null,  -- quién lo pagó
  pagado_bote           boolean not null default false,                          -- lo pagó el bote
  ticket_url            text,                -- ruta en el almacén "tickets"
  comprado              boolean not null default false,
  ticket_id             bigint,              -- si viene de un ticket aprobado
  creado_en             timestamptz not null default now()
);

-- Actualización desde la primera versión (no borra nada): el total deja
-- de calcularse solo y pasa a ser un dato que se puede dejar vacío.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_items'
             and column_name = 'total_cents' and is_generated = 'ALWAYS') then
    alter table public.purchase_items rename column total_cents to total_cents_antiguo;
    alter table public.purchase_items add column total_cents integer check (total_cents >= 0);
    update public.purchase_items set total_cents = total_cents_antiguo;
    alter table public.purchase_items drop column total_cents_antiguo;
  end if;
end $$;
alter table public.purchase_items alter column precio_unitario_cents drop not null;
alter table public.purchase_items alter column precio_unitario_cents drop default;
alter table public.purchase_items add column if not exists pagado_por uuid references public.profiles(id) on delete set null;
alter table public.purchase_items add column if not exists pagado_bote boolean not null default false;

-- Si se da precio por unidad y no total, el total se calcula solo
create or replace function public.calcular_total_compra() returns trigger
language plpgsql as $$
begin
  if new.total_cents is null and new.precio_unitario_cents is not null then
    new.total_cents := round(new.cantidad * new.precio_unitario_cents)::integer;
  end if;
  return new;
end $$;
drop trigger if exists calcular_total_compra on public.purchase_items;
create trigger calcular_total_compra before insert or update on public.purchase_items
  for each row execute function public.calcular_total_compra();

-- Lo que debe cada uno: un cargo por persona y concepto
create table if not exists public.charges (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  event_id       bigint references public.events(id) on delete set null,
  concepto       text not null,
  importe_cents  integer not null check (importe_cents >= 0),
  fecha_limite   date,
  estado         text not null default 'sin_pagar'
                 check (estado in ('sin_pagar','pendiente','pagado','anulado')),
  metodo         text,                       -- revolut, transferencia, bizum, efectivo, compensacion, manual
  captura_url    text,                       -- ruta en el almacén "capturas"
  marcado_en     timestamptz,                -- cuando pulsó «Ya he pagado»
  confirmado_en  timestamptz,
  confirmado_por uuid references public.profiles(id) on delete set null,
  motivo_rechazo text,
  creado_en      timestamptz not null default now()
);
-- Solo un cargo vivo por persona y evento
alter table public.charges add column if not exists guest_id bigint references public.event_guests(id) on delete set null;
-- Un cargo vivo por persona y evento (y otro por cada invitado que traiga)
drop index if exists public.charges_un_cargo_por_evento;
create unique index charges_un_cargo_por_evento
  on public.charges(event_id, user_id, coalesce(guest_id, 0)) where event_id is not null and estado <> 'anulado';
create index if not exists charges_user_idx on public.charges(user_id);
create index if not exists charges_estado_idx on public.charges(estado);

-- Historial de cambios de estado de cada cargo
create table if not exists public.payment_events (
  id         bigint generated always as identity primary key,
  charge_id  bigint not null references public.charges(id) on delete cascade,
  de_estado  text,
  a_estado   text not null,
  hecho_por  uuid references public.profiles(id) on delete set null,
  motivo     text,
  creado_en  timestamptz not null default now()
);

-- Movimientos del bote (los miembros solo ven los gastos)
create table if not exists public.pot_movements (
  id            bigint generated always as identity primary key,
  tipo          text not null check (tipo in ('ingreso','gasto')),
  concepto      text not null,
  importe_cents integer not null check (importe_cents >= 0),
  event_id      bigint references public.events(id) on delete set null,
  ticket_url    text,
  ticket_id     bigint,
  fecha         date not null default (now() at time zone 'Europe/Madrid')::date,
  creado_por    uuid references public.profiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);

-- Ajustes. visibilidad: 'miembros' (lo lee cualquiera con sesión) o 'admin'
create table if not exists public.config (
  clave       text primary key,
  valor       text not null default '',
  visibilidad text not null default 'miembros' check (visibilidad in ('miembros','admin'))
);

-- Notificaciones push (se usan en la fase 2)
create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,          -- endpoint Web Push o token FCM
  datos       jsonb,                         -- claves p256dh/auth
  dispositivo text,
  creado_en   timestamptz not null default now()
);

create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo    text not null,
  activo  boolean not null default true,
  primary key (user_id, tipo)
);

-- Bandeja de avisos: la app los genera ya en la fase 1; en la fase 2
-- una función los enviará como notificación push.
create table if not exists public.avisos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tipo       text not null,
  titulo     text not null,
  cuerpo     text,
  url        text,
  enviado_en timestamptz,
  leido      boolean not null default false,
  creado_en  timestamptz not null default now()
);
create index if not exists avisos_pendientes_idx on public.avisos(enviado_en) where enviado_en is null;

-- «Ahora suena» (fase 3)
create table if not exists public.now_playing (
  id             integer primary key default 1 check (id = 1),
  titulo         text,
  artista        text,
  portada_url    text,
  actualizado_en timestamptz not null default now()
);

-- Tareas de un evento y sus encargados
create table if not exists public.event_tasks (
  id                bigint generated always as identity primary key,
  event_id          bigint not null references public.events(id) on delete cascade,
  titulo            text not null,
  descripcion       text,
  presupuesto_cents integer check (presupuesto_cents >= 0),
  fecha             date,
  estado            text not null default 'pendiente' check (estado in ('pendiente','hecha')),
  creado_por        uuid references public.profiles(id) on delete set null,
  hecha_en          timestamptz,
  creado_en         timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id bigint not null references public.event_tasks(id) on delete cascade,
  user_id uuid   not null references public.profiles(id) on delete cascade,
  primary key (task_id, user_id)
);

-- Tickets para reembolsar
create table if not exists public.tickets (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  event_id             bigint references public.events(id) on delete set null,
  task_id              bigint references public.event_tasks(id) on delete set null,
  concepto             text not null,
  importe_cents        integer not null check (importe_cents > 0),
  foto_url             text,                 -- ruta en el almacén "tickets"
  metodo_cobro         text check (metodo_cobro in ('revolut','transferencia','bizum')),
  dato_cobro           text,
  estado               text not null default 'enviado'
                       check (estado in ('enviado','aprobado','reembolsado','rechazado')),
  motivo_rechazo       text,
  revisado_por         uuid references public.profiles(id) on delete set null,
  revisado_en          timestamptz,
  reembolsado_en       timestamptz,
  compensado_charge_id bigint references public.charges(id) on delete set null,
  creado_en            timestamptz not null default now()
);
create index if not exists tickets_user_idx on public.tickets(user_id);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES DE AYUDA
-- ---------------------------------------------------------------------

-- ¿El usuario actual es el administrador?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin' and activo);
$$;

-- ¿El usuario actual es miembro de la peña (tiene perfil)?
create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- 2550 -> '25,50 €'
create or replace function public.fmt_eur(c integer) returns text
language sql immutable as $$
  select replace(to_char(coalesce(c,0) / 100.0, 'FM999999990.00'), '.', ',') || ' €';
$$;

-- Mete un aviso en la bandeja (lo envía la fase 2)
create or replace function public.crear_aviso(p_user uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text default null)
returns void language sql security definer set search_path = public as $$
  insert into avisos(user_id, tipo, titulo, cuerpo, url) values (p_user, p_tipo, p_titulo, p_cuerpo, p_url);
$$;

-- Avisa a todos los administradores
create or replace function public.avisar_admins(p_tipo text, p_titulo text, p_cuerpo text, p_url text default null)
returns void language sql security definer set search_path = public as $$
  insert into avisos(user_id, tipo, titulo, cuerpo, url)
  select id, p_tipo, p_titulo, p_cuerpo, p_url from profiles where rol = 'admin' and activo;
$$;

-- ---------------------------------------------------------------------
-- 3. ALTA POR INVITACIÓN
-- ---------------------------------------------------------------------

-- Se ejecuta al crear una cuenta. Sin invitación válida, la cuenta NO se
-- crea. La PRIMERA cuenta de todas (la de Sergio) entra sin código y
-- queda como administrador.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_codigo  text := upper(trim(coalesce(new.raw_user_meta_data->>'invitacion', '')));
  v_apodo   text := trim(coalesce(new.raw_user_meta_data->>'apodo', ''));
  v_primero boolean := not exists (select 1 from profiles);
begin
  if v_apodo = '' then
    v_apodo := split_part(coalesce(new.email, 'miembro'), '@', 1);
  end if;

  if not v_primero then
    update invites
       set usos = usos + 1, usado_por = null, usado_en = now()
     where codigo = v_codigo and activa and usos < usos_max
       and (caduca_en is null or caduca_en > now());
    if not found then
      raise exception 'Código de invitación no válido o caducado';
    end if;
  end if;

  insert into profiles(id, apodo, rol) values (new.id, left(v_apodo, 30), case when v_primero then 'admin' else 'member' end);
  insert into perfil_privado(user_id) values (new.id);
  update invites set usado_por = new.id where codigo = v_codigo and v_codigo <> '';
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Comprueba un código antes de registrarse (se puede llamar sin sesión).
-- Mientras no exista ninguna cuenta, cualquier código vale (alta del admin).
create or replace function public.comprobar_invitacion(p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles) or exists (
    select 1 from invites
     where codigo = upper(trim(p_codigo)) and activa and usos < usos_max
       and (caduca_en is null or caduca_en > now())
  );
$$;

-- El administrador crea una invitación: devuelve el código
create or replace function public.crear_invitacion(p_usos_max integer default 1, p_dias integer default 14, p_nota text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if not is_admin() then raise exception 'Solo el administrador puede invitar'; end if;
  loop
    -- sin letras que se confunden (0/O, 1/I)
    v_codigo := translate(upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), '01', 'XY');
    exit when not exists (select 1 from invites where codigo = v_codigo);
  end loop;
  insert into invites(codigo, creado_por, usos_max, caduca_en, nota)
  values (v_codigo, auth.uid(), greatest(coalesce(p_usos_max, 1), 1),
          case when p_dias is null or p_dias <= 0 then null else now() + make_interval(days => p_dias) end,
          p_nota);
  return v_codigo;
end $$;

-- ---------------------------------------------------------------------
-- 4. PROTECCIONES (triggers): lo que un miembro NO puede cambiar
--    Si no hay sesión (SQL Editor de Supabase) se permite todo.
-- ---------------------------------------------------------------------

create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.id := old.id; new.rol := old.rol; new.activo := old.activo; new.creado_en := old.creado_en;
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfil on public.profiles;
create trigger proteger_perfil before update on public.profiles
  for each row execute function public.proteger_perfil();

create or replace function public.proteger_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid(); new.estado := 'enviado';
      new.revisado_por := null; new.revisado_en := null; new.reembolsado_en := null;
      new.compensado_charge_id := null; new.motivo_rechazo := null;
    else
      new.user_id := old.user_id; new.estado := old.estado; new.revisado_por := old.revisado_por;
      new.revisado_en := old.revisado_en; new.reembolsado_en := old.reembolsado_en;
      new.compensado_charge_id := old.compensado_charge_id; new.motivo_rechazo := old.motivo_rechazo;
      new.creado_en := old.creado_en;
    end if;
  end if;
  -- si viene de una tarea, el evento es el de la tarea
  if new.task_id is not null and new.event_id is null then
    select event_id into new.event_id from event_tasks where id = new.task_id;
  end if;
  return new;
end $$;
drop trigger if exists proteger_ticket on public.tickets;
create trigger proteger_ticket before insert or update on public.tickets
  for each row execute function public.proteger_ticket();

-- ---------------------------------------------------------------------
-- 5. HISTORIAL DE PAGOS Y AVISOS AUTOMÁTICOS
-- ---------------------------------------------------------------------

create or replace function public.registrar_cambio_cargo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_evento text;
begin
  if tg_op = 'INSERT' then
    insert into payment_events(charge_id, de_estado, a_estado, hecho_por)
    values (new.id, null, new.estado, auth.uid());
    if new.estado = 'sin_pagar' and new.importe_cents > 0 then
      perform crear_aviso(new.user_id, 'nuevo_cargo', new.concepto,
        'Te tocan ' || fmt_eur(new.importe_cents), '#/pagos');
    end if;
  elsif new.estado is distinct from old.estado then
    insert into payment_events(charge_id, de_estado, a_estado, hecho_por, motivo)
    values (new.id, old.estado, new.estado, auth.uid(),
            case when new.estado = 'sin_pagar' then new.motivo_rechazo end);
    if new.estado = 'pagado' then
      perform crear_aviso(new.user_id, 'pago_confirmado', 'Pago confirmado',
        new.concepto || ': ' || fmt_eur(new.importe_cents) || '. ¡Gracias!', '#/pagos');
    elsif new.estado = 'sin_pagar' and old.estado = 'pendiente' then
      perform crear_aviso(new.user_id, 'pago_rechazado', 'No se ha encontrado tu pago',
        coalesce(new.motivo_rechazo, new.concepto), '#/pagos');
    end if;
  elsif new.importe_cents is distinct from old.importe_cents and new.estado = 'sin_pagar' then
    insert into payment_events(charge_id, de_estado, a_estado, hecho_por, motivo)
    values (new.id, old.estado, new.estado, auth.uid(),
            'Importe cambiado de ' || fmt_eur(old.importe_cents) || ' a ' || fmt_eur(new.importe_cents));
  end if;
  return new;
end $$;
drop trigger if exists registrar_cambio_cargo on public.charges;
create trigger registrar_cambio_cargo after insert or update on public.charges
  for each row execute function public.registrar_cambio_cargo();

create or replace function public.aviso_tarea_asignada() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select et.titulo, e.nombre into t from event_tasks et join events e on e.id = et.event_id where et.id = new.task_id;
  perform crear_aviso(new.user_id, 'nuevo_encargo', 'Nuevo encargo',
    'Eres encargado de: ' || t.titulo || ' (' || t.nombre || ')', '#/inicio');
  return new;
end $$;
drop trigger if exists aviso_tarea_asignada on public.task_assignees;
create trigger aviso_tarea_asignada after insert on public.task_assignees
  for each row execute function public.aviso_tarea_asignada();

create or replace function public.aviso_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_apodo text;
begin
  if tg_op = 'INSERT' then
    select apodo into v_apodo from profiles where id = new.user_id;
    perform avisar_admins('ticket_nuevo', 'Ticket nuevo',
      v_apodo || ' ha subido un ticket de ' || fmt_eur(new.importe_cents), '#/admin/tickets');
  elsif new.estado is distinct from old.estado then
    if new.estado = 'aprobado' then
      perform crear_aviso(new.user_id, 'ticket_estado', 'Ticket aprobado',
        'Tu ticket de ' || fmt_eur(new.importe_cents) || ' está aprobado', '#/pagos/tickets');
    elsif new.estado = 'rechazado' then
      perform crear_aviso(new.user_id, 'ticket_estado', 'Ticket rechazado',
        'Tu ticket de ' || fmt_eur(new.importe_cents) || ' no se ha aprobado: ' || coalesce(new.motivo_rechazo, ''), '#/pagos/tickets');
    elsif new.estado = 'reembolsado' then
      perform crear_aviso(new.user_id, 'ticket_estado', 'Reembolsado',
        case when new.compensado_charge_id is not null
             then 'Tu ticket de ' || fmt_eur(new.importe_cents) || ' se ha descontado de lo que debías'
             else 'Te hemos devuelto ' || fmt_eur(new.importe_cents) end, '#/pagos/tickets');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists aviso_ticket on public.tickets;

-- Aviso a quien le encargan comprar algo de la lista
create or replace function public.aviso_encargo_compra() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_evento text;
begin
  if new.comprado_por is not null and not new.comprado
     and (tg_op = 'INSERT' or new.comprado_por is distinct from old.comprado_por) then
    select nombre into v_evento from events where id = new.event_id;
    perform crear_aviso(new.comprado_por, 'nuevo_encargo', 'Te toca comprar',
      new.concepto || ' (' || coalesce(v_evento, '') || ')', '#/evento/' || new.event_id);
  end if;
  return new;
end $$;
drop trigger if exists aviso_encargo_compra on public.purchase_items;
create trigger aviso_encargo_compra after insert or update on public.purchase_items
  for each row execute function public.aviso_encargo_compra();
create trigger aviso_ticket after insert or update on public.tickets
  for each row execute function public.aviso_ticket();

-- ---------------------------------------------------------------------
-- 6. ACCIONES (funciones RPC que llama la app)
-- ---------------------------------------------------------------------

-- El MIEMBRO pulsa «Ya he pagado»: sin_pagar -> pendiente. Es lo único
-- que puede hacer con un cargo. Nunca puede ponerlo en «pagado».
create or replace function public.marcar_pagado(p_charge_id bigint, p_metodo text default null, p_captura_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c charges; v_apodo text;
begin
  select * into c from charges where id = p_charge_id for update;
  if not found or c.user_id <> auth.uid() then raise exception 'Cargo no encontrado'; end if;
  if c.estado <> 'sin_pagar' then raise exception 'Este cargo ya no está pendiente de pago'; end if;
  if p_metodo is not null and p_metodo not in ('revolut','transferencia','bizum','efectivo') then
    raise exception 'Método de pago no válido';
  end if;
  if p_captura_url is not null and split_part(p_captura_url, '/', 1) <> auth.uid()::text then
    raise exception 'Captura no válida';
  end if;
  update charges set estado = 'pendiente', metodo = p_metodo, captura_url = p_captura_url,
                     marcado_en = now(), motivo_rechazo = null
   where id = p_charge_id;
  select apodo into v_apodo from profiles where id = c.user_id;
  perform avisar_admins('pago_por_confirmar', 'Pago por confirmar',
    v_apodo || ' dice que ha pagado ' || fmt_eur(c.importe_cents) || ' (' || c.concepto || ')', '#/admin/pagos');
end $$;

-- ADMIN: confirma uno o varios pagos (también sirve para «marcar pagado a
-- mano» a quien paga en efectivo: pasa p_metodo = 'efectivo').
create or replace function public.confirmar_pago(p_ids bigint[], p_metodo text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'Solo el administrador puede confirmar pagos'; end if;
  update charges
     set estado = 'pagado', confirmado_en = now(), confirmado_por = auth.uid(),
         motivo_rechazo = null, metodo = coalesce(p_metodo, metodo, 'manual')
   where id = any(p_ids) and estado in ('pendiente','sin_pagar');
  get diagnostics n = row_count;
  return n;
end $$;

-- ADMIN: no encuentra el pago -> vuelve a «sin pagar» con el motivo
create or replace function public.rechazar_pago(p_charge_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador puede rechazar pagos'; end if;
  update charges set estado = 'sin_pagar', motivo_rechazo = coalesce(nullif(trim(p_motivo), ''), 'No se ha encontrado el pago'),
                     marcado_en = null
   where id = p_charge_id and estado = 'pendiente';
  if not found then raise exception 'Ese cargo no está pendiente de confirmar'; end if;
end $$;

-- ADMIN: anula un cargo (se muestra tachado) o lo reactiva
create or replace function public.anular_cargo(p_charge_id bigint, p_anular boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  if p_anular then
    update charges set estado = 'anulado' where id = p_charge_id and estado <> 'anulado';
  else
    update charges set estado = 'sin_pagar' where id = p_charge_id and estado = 'anulado';
  end if;
end $$;

-- ADMIN: cargo suelto (cuota, multa simpática, derrama) para varios
-- miembros a la vez. Devuelve cuántos cargos ha creado.
create or replace function public.crear_cargos_sueltos(p_usuarios uuid[], p_concepto text, p_importe_cents integer, p_fecha_limite date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  if coalesce(p_importe_cents, 0) <= 0 then raise exception 'El importe tiene que ser mayor que 0'; end if;
  insert into charges(user_id, concepto, importe_cents, fecha_limite)
  select p.id, trim(p_concepto), p_importe_cents, p_fecha_limite
    from profiles p where p.id = any(p_usuarios) and p.activo;
  get diagnostics n = row_count;
  return n;
end $$;

-- ADMIN: calcula la parte de cada participante (y de cada invitado que
-- paga) y crea/actualiza sus cargos. Se pulsa «Guardar reparto».
--  · igual: total de la compra / nº de plazas (participantes + invitados que
--    pagan), redondeado HACIA ABAJO al céntimo (la diferencia la pone el bote).
--  · fijo: el importe fijo por persona (también por invitado).
--  · manual: el importe escrito para cada persona o invitado.
--  El cargo de un invitado va a quien lo trae, con su propio concepto.
--  Los cargos ya pagados o pendientes de confirmar NO se tocan.
create or replace function public.guardar_reparto(p_event_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  e events; c charges; r record;
  v_total integer; v_n integer; v_inv integer; v_importe integer;
  v_creados integer := 0; v_actualizados integer := 0; v_anulados integer := 0; v_sin_tocar integer := 0;
  v_filas integer;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  select * into e from events where id = p_event_id;
  if not found then raise exception 'Evento no encontrado'; end if;

  create temp table if not exists _plazas (user_id uuid, guest_id bigint, manual integer, concepto text) on commit drop;
  delete from _plazas;
  insert into _plazas
    select ep.user_id, null::bigint, ep.importe_manual_cents, e.nombre
      from event_participants ep join profiles p on p.id = ep.user_id
     where ep.event_id = p_event_id and p.activo
    union all
    select g.host_id, g.id, g.importe_manual_cents, left(e.nombre || ' · invitado: ' || g.nombre, 120)
      from event_guests g join profiles p on p.id = g.host_id
     where g.event_id = p_event_id and g.paga and p.activo;

  select coalesce(sum(total_cents), 0) into v_total from purchase_items where event_id = p_event_id;
  select count(*), count(guest_id) into v_n, v_inv from _plazas;

  for r in select * from _plazas loop
    v_importe := case e.modo_reparto
      when 'igual'  then case when v_n > 0 then floor(v_total::numeric / v_n)::integer else 0 end
      when 'fijo'   then coalesce(e.importe_fijo_cents, 0)
      else coalesce(r.manual, 0) end;

    select * into c from charges
     where event_id = p_event_id and user_id = r.user_id and guest_id is not distinct from r.guest_id and estado <> 'anulado';
    if not found then
      if v_importe > 0 then
        insert into charges(user_id, event_id, guest_id, concepto, importe_cents, fecha_limite)
        values (r.user_id, p_event_id, r.guest_id, r.concepto, v_importe, e.fecha_limite_pago);
        v_creados := v_creados + 1;
      end if;
    elsif c.estado = 'sin_pagar' then
      if v_importe <= 0 then
        update charges set estado = 'anulado' where id = c.id;
        v_anulados := v_anulados + 1;
      elsif c.importe_cents <> v_importe or c.fecha_limite is distinct from e.fecha_limite_pago or c.concepto <> r.concepto then
        update charges set importe_cents = v_importe, fecha_limite = e.fecha_limite_pago, concepto = r.concepto where id = c.id;
        v_actualizados := v_actualizados + 1;
      end if;
    elsif c.importe_cents <> v_importe then
      v_sin_tocar := v_sin_tocar + 1;   -- ya pagado/pendiente con otro importe: lo decide el admin
    end if;
  end loop;

  -- plazas que ya no existen (no participa, inactivo, invitado quitado o que
  -- ya no paga): se anulan sus cargos sin pagar
  update charges ch set estado = 'anulado'
   where ch.event_id = p_event_id and ch.estado = 'sin_pagar'
     and not exists (select 1 from _plazas pl where pl.user_id = ch.user_id and pl.guest_id is not distinct from ch.guest_id);
  get diagnostics v_filas = row_count;
  v_anulados := v_anulados + v_filas;

  return json_build_object('total_cents', v_total, 'participantes', v_n, 'invitados', v_inv,
    'parte_cents', case when e.modo_reparto = 'igual' and v_n > 0 then floor(v_total::numeric / v_n)::integer end,
    'creados', v_creados, 'actualizados', v_actualizados, 'anulados', v_anulados, 'pagados_con_otro_importe', v_sin_tocar);
end $$;

-- MIEMBRO: «Vengo con alguien». El admin puede añadirlo a nombre de otro.
create or replace function public.traer_invitado(p_event_id bigint, p_nombre text, p_relacion text default null, p_host uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare e events; v_host uuid := coalesce(p_host, auth.uid()); v_id bigint; v_apodo text;
begin
  if not es_miembro() then raise exception 'Sin sesión'; end if;
  if v_host <> auth.uid() and not is_admin() then raise exception 'Solo puedes apuntar a tus invitados'; end if;
  select * into e from events where id = p_event_id;
  if not found then raise exception 'Evento no encontrado'; end if;
  if e.estado <> 'abierto' and not is_admin() then raise exception 'Este evento ya está cerrado'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Pon el nombre de tu invitado'; end if;
  insert into event_guests(event_id, host_id, nombre, relacion, creado_por)
  values (p_event_id, v_host, left(trim(p_nombre), 40), nullif(left(trim(coalesce(p_relacion, '')), 30), ''), auth.uid())
  returning id into v_id;
  if not is_admin() then
    select apodo into v_apodo from profiles where id = v_host;
    perform avisar_admins('invitado_nuevo', 'Invitado nuevo',
      v_apodo || ' viene con ' || trim(p_nombre) || ' a ' || e.nombre, '#/evento/' || p_event_id);
  end if;
  return v_id;
end $$;

-- Quitar un invitado (quien lo trajo o el admin). Si ya ha pagado su
-- parte, no se puede: primero el admin anula ese cargo.
create or replace function public.quitar_invitado(p_guest_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare g event_guests; e events;
begin
  select * into g from event_guests where id = p_guest_id;
  if not found then raise exception 'Invitado no encontrado'; end if;
  if g.host_id <> auth.uid() and not is_admin() then raise exception 'Solo puedes quitar a tus invitados'; end if;
  select * into e from events where id = g.event_id;
  if e.estado <> 'abierto' and not is_admin() then raise exception 'Este evento ya está cerrado'; end if;
  if exists (select 1 from charges where guest_id = p_guest_id and estado in ('pendiente','pagado')) then
    raise exception 'La parte de este invitado ya está pagada o pendiente de confirmar: el administrador tiene que anularla antes';
  end if;
  update charges set estado = 'anulado' where guest_id = p_guest_id and estado = 'sin_pagar';
  delete from event_guests where id = p_guest_id;
end $$;

-- MIEMBRO: «Me apunto» / «Me desapunto» (si el evento lo permite)
create or replace function public.apuntarme(p_event_id bigint, p_apuntar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare e events;
begin
  if not es_miembro() then raise exception 'Sin sesión'; end if;
  select * into e from events where id = p_event_id;
  if not found or not e.autoapuntarse or e.estado <> 'abierto' then
    raise exception 'En este evento no puedes apuntarte tú';
  end if;
  if p_apuntar then
    insert into event_participants(event_id, user_id) values (p_event_id, auth.uid()) on conflict do nothing;
  else
    if exists (select 1 from charges where event_id = p_event_id and user_id = auth.uid() and estado in ('pendiente','pagado')) then
      raise exception 'Ya has pagado este evento; habla con el administrador';
    end if;
    delete from event_participants where event_id = p_event_id and user_id = auth.uid();
  end if;
end $$;

-- ENCARGADO de una compra (o admin): «Ya lo he comprado»
create or replace function public.marcar_comprado(p_item_id bigint, p_comprado boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or exists (select 1 from purchase_items where id = p_item_id and comprado_por = auth.uid())) then
    raise exception 'No eres el encargado de comprar esto';
  end if;
  update purchase_items set comprado = p_comprado where id = p_item_id;
end $$;

-- ENCARGADO (o admin): marcar tarea como hecha / pendiente
create or replace function public.marcar_tarea(p_task_id bigint, p_hecha boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or exists (select 1 from task_assignees where task_id = p_task_id and user_id = auth.uid())) then
    raise exception 'No eres encargado de esta tarea';
  end if;
  update event_tasks set estado = case when p_hecha then 'hecha' else 'pendiente' end,
                         hecha_en = case when p_hecha then now() end
   where id = p_task_id;
end $$;

-- ADMIN: aprobar ticket. Si es de un evento y p_anadir_a_compra, se
-- añade a la lista de la compra (cuenta en el total y en el reparto).
create or replace function public.aprobar_ticket(p_ticket_id bigint, p_anadir_a_compra boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare t tickets;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  select * into t from tickets where id = p_ticket_id for update;
  if not found or t.estado <> 'enviado' then raise exception 'Este ticket ya está revisado'; end if;
  update tickets set estado = 'aprobado', revisado_por = auth.uid(), revisado_en = now(), motivo_rechazo = null
   where id = p_ticket_id;
  if p_anadir_a_compra and t.event_id is not null
     and not exists (select 1 from purchase_items where ticket_id = t.id) then
    insert into purchase_items(event_id, concepto, cantidad, precio_unitario_cents, total_cents, comprado_por, pagado_por, ticket_url, comprado, ticket_id)
    values (t.event_id, t.concepto, 1, t.importe_cents, t.importe_cents, t.user_id, t.user_id, t.foto_url, true, t.id);
  end if;
end $$;

create or replace function public.rechazar_ticket(p_ticket_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  update tickets set estado = 'rechazado', motivo_rechazo = coalesce(nullif(trim(p_motivo), ''), 'Sin motivo'),
                     revisado_por = auth.uid(), revisado_en = now()
   where id = p_ticket_id and estado in ('enviado','aprobado');
  if not found then raise exception 'Este ticket no se puede rechazar'; end if;
  -- si ya estaba en la lista de la compra, se quita
  delete from purchase_items where ticket_id = p_ticket_id;
end $$;

-- ADMIN: ya le he devuelto el dinero -> gasto en el bote con el ticket
create or replace function public.reembolsar_ticket(p_ticket_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t tickets;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  select * into t from tickets where id = p_ticket_id for update;
  if not found or t.estado not in ('enviado','aprobado') then raise exception 'Este ticket no se puede reembolsar'; end if;
  if t.estado = 'enviado' then perform aprobar_ticket(p_ticket_id, true); end if;
  update tickets set estado = 'reembolsado', reembolsado_en = now(),
                     revisado_por = coalesce(revisado_por, auth.uid()), revisado_en = coalesce(revisado_en, now())
   where id = p_ticket_id;
  insert into pot_movements(tipo, concepto, importe_cents, event_id, ticket_url, ticket_id, creado_por)
  values ('gasto', t.concepto, t.importe_cents, t.event_id, t.foto_url, t.id, auth.uid());
end $$;

-- ADMIN: en vez de devolver el dinero, se descuenta de lo que debe.
-- El ticket tiene que cubrir el cargo entero (no hay pagos parciales en
-- la fase 1). Devuelve lo que aún hay que devolverle (0 si nada).
create or replace function public.compensar_ticket(p_ticket_id bigint, p_charge_id bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare t tickets; c charges;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  select * into t from tickets where id = p_ticket_id for update;
  if not found or t.estado not in ('enviado','aprobado') then raise exception 'Este ticket no se puede compensar'; end if;
  select * into c from charges where id = p_charge_id for update;
  if not found or c.user_id <> t.user_id then raise exception 'El cargo no es de la misma persona'; end if;
  if c.estado not in ('sin_pagar','pendiente') then raise exception 'Ese cargo ya está pagado o anulado'; end if;
  if t.importe_cents < c.importe_cents then
    raise exception 'El ticket (%) es menor que lo que debe (%): no se puede compensar entero', fmt_eur(t.importe_cents), fmt_eur(c.importe_cents);
  end if;
  if t.estado = 'enviado' then perform aprobar_ticket(p_ticket_id, true); end if;
  update charges set estado = 'pagado', metodo = 'compensacion', confirmado_en = now(), confirmado_por = auth.uid()
   where id = p_charge_id;
  update tickets set estado = 'reembolsado', reembolsado_en = now(), compensado_charge_id = p_charge_id
   where id = p_ticket_id;
  insert into pot_movements(tipo, concepto, importe_cents, event_id, ticket_url, ticket_id, creado_por)
  values ('gasto', t.concepto || ' (descontado de ' || c.concepto || ')', t.importe_cents, t.event_id, t.foto_url, t.id, auth.uid());
  return t.importe_cents - c.importe_cents;
end $$;

-- ---------------------------------------------------------------------
-- 7. SEGURIDAD (RLS): quién puede leer y escribir cada tabla
-- ---------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.perfil_privado     enable row level security;
alter table public.invites            enable row level security;
alter table public.events             enable row level security;
alter table public.event_participants enable row level security;
alter table public.purchase_items     enable row level security;
alter table public.charges            enable row level security;
alter table public.payment_events     enable row level security;
alter table public.pot_movements      enable row level security;
alter table public.config             enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.avisos             enable row level security;
alter table public.now_playing        enable row level security;
alter table public.event_tasks        enable row level security;
alter table public.task_assignees     enable row level security;
alter table public.tickets            enable row level security;
alter table public.event_guests       enable row level security;

-- Borra las políticas anteriores para poder re-ejecutar el archivo
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- profiles: todos los miembros ven apodo y foto; cada uno edita lo suyo
-- (rol y activo los protege el trigger proteger_perfil)
create policy perfiles_leer   on public.profiles for select to authenticated using (es_miembro());
create policy perfiles_editar on public.profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create policy privado_leer   on public.perfil_privado for select to authenticated using (user_id = auth.uid() or is_admin());
create policy privado_editar on public.perfil_privado for update to authenticated
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

create policy invites_admin on public.invites for all to authenticated using (is_admin()) with check (is_admin());

-- eventos, participantes, compra, tareas: leen todos, escribe el admin
create policy eventos_leer  on public.events for select to authenticated using (es_miembro());
create policy eventos_admin on public.events for all    to authenticated using (is_admin()) with check (is_admin());
create policy part_leer     on public.event_participants for select to authenticated using (es_miembro());
create policy part_admin    on public.event_participants for all    to authenticated using (is_admin()) with check (is_admin());
create policy compra_leer   on public.purchase_items for select to authenticated using (es_miembro());
create policy compra_admin  on public.purchase_items for all    to authenticated using (is_admin()) with check (is_admin());
create policy tareas_leer   on public.event_tasks for select to authenticated using (es_miembro());
create policy tareas_admin  on public.event_tasks for all    to authenticated using (is_admin()) with check (is_admin());
create policy enc_leer      on public.task_assignees for select to authenticated using (es_miembro());
create policy enc_admin     on public.task_assignees for all    to authenticated using (is_admin()) with check (is_admin());

-- cargos: cada miembro SOLO ve los suyos. Escribir: solo el admin.
-- (El miembro cambia su cargo únicamente con marcar_pagado().)
create policy cargos_leer  on public.charges for select to authenticated using (user_id = auth.uid() or is_admin());
create policy cargos_admin on public.charges for all    to authenticated using (is_admin()) with check (is_admin());

create policy historial_leer on public.payment_events for select to authenticated using (
  is_admin() or exists (select 1 from charges c where c.id = charge_id and c.user_id = auth.uid()));

-- bote: los miembros ven los GASTOS (transparencia); ingresos y saldo, solo el admin
create policy bote_leer  on public.pot_movements for select to authenticated using ((tipo = 'gasto' and es_miembro()) or is_admin());
create policy bote_admin on public.pot_movements for all    to authenticated using (is_admin()) with check (is_admin());

create policy config_leer  on public.config for select to authenticated using ((visibilidad = 'miembros' and es_miembro()) or is_admin());
create policy config_admin on public.config for all    to authenticated using (is_admin()) with check (is_admin());

create policy push_propias  on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prefs_propias on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy avisos_leer   on public.avisos for select to authenticated using (user_id = auth.uid());
create policy avisos_leido  on public.avisos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy suena_leer    on public.now_playing for select to authenticated using (es_miembro());

-- tickets: cada uno crea y ve los suyos; los edita/borra solo mientras
-- estén «enviado». Con tarea: solo un encargado de esa tarea (o el admin).
-- invitados: los ven todos; los crea/quita cada uno con traer_invitado()/quitar_invitado(); el admin, todo
create policy invitados_leer  on public.event_guests for select to authenticated using (es_miembro());
create policy invitados_admin on public.event_guests for all    to authenticated using (is_admin()) with check (is_admin());

create policy tickets_leer on public.tickets for select to authenticated using (user_id = auth.uid() or is_admin());
create policy tickets_crear on public.tickets for insert to authenticated with check (
  es_miembro() and (is_admin() or (
    user_id = auth.uid() and estado = 'enviado'
    and (task_id is null or exists (select 1 from task_assignees ta where ta.task_id = tickets.task_id and ta.user_id = auth.uid()))
  )));
create policy tickets_editar on public.tickets for update to authenticated
  using (is_admin() or (user_id = auth.uid() and estado = 'enviado'))
  with check (is_admin() or (user_id = auth.uid() and estado = 'enviado'));
create policy tickets_borrar on public.tickets for delete to authenticated
  using (is_admin() or (user_id = auth.uid() and estado = 'enviado'));

-- Permisos: nada para usuarios sin sesión (anon) salvo comprobar invitación
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.comprobar_invitacion(text) to anon;

-- ---------------------------------------------------------------------
-- 8. AJUSTES INICIALES (Sergio los cambia desde Admin → Ajustes)
--    El IBAN, el enlace de Revolut y el Bizum NO van aquí: se escriben
--    desde la app y solo los ven los miembros con sesión.
-- ---------------------------------------------------------------------
insert into public.config(clave, valor, visibilidad) values
  ('nombre_app',              'El Resacón',          'miembros'),
  ('admin_nombre',            'Sergio',              'miembros'),
  ('revolut_enlace',          '',                    'miembros'),
  ('iban',                    '',                    'miembros'),
  ('titular',                 '',                    'miembros'),
  ('bizum_numero',            '',                    'miembros'),
  ('bizum_activo',            'true',                'miembros'),
  ('apk_url',                 '',                    'miembros'),
  ('jukebox_url',             'http://10.77.77.1',   'miembros'),
  ('saldo_bote_cents',        '0',                   'admin'),
  ('saldo_actualizado_en',    '',                    'admin'),
  ('recordatorio_dias_antes', '3',                   'admin'),
  ('recordatorio_semanal',    'true',                'admin'),
  ('recordatorio_dia_semana', '1',                   'admin'),
  ('recordatorio_hora',       '19',                  'admin'),
  ('aviso_evento_dias_antes', '1',                   'admin'),
  ('aviso_tarea_dias_antes',  '1',                   'admin')
on conflict (clave) do nothing;

insert into public.now_playing(id) values (1) on conflict do nothing;
