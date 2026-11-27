-- Esquema del panel /administracion en Neon (migrado desde Supabase el 2026-11-16).
-- Se puede correr de nuevo sin romper nada.

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  empresa text,
  producto text,
  dominio text,
  dominio_vencimiento date,
  mail text,
  telefono text,
  servidor text,
  base_datos text,
  plan text,
  metodo_pago text,
  ultimo_pago date,
  proximo_pago date,
  orden integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Precio al que se le vendió el servicio (texto con formato $150.000, igual que el plan).
alter table clients add column if not exists valor_venta text;

-- Proyecto de Neon con la base del servicio (id del proyecto), para calcular cuánto cuesta cada cliente.
alter table clients add column if not exists neon_proyecto text;

-- Cosas por hacer de cada cliente (sección Clientes): aparecen en la «Agenda de hoy» cuando les llega la fecha.
create table if not exists client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  texto text not null,
  fecha date not null,
  hecho_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_tasks_pendientes on client_tasks (fecha) where hecho_at is null;

-- Quién puede entrar al panel. La contraseña se guarda como hash bcrypt (nunca en texto plano).
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Para dar de alta otro admin, generar el hash con:
--   node -e "console.log(require('bcryptjs').hashSync('LA_CONTRASEÑA', 10))"
-- y luego:
--   insert into admin_users (email, password_hash) values ('alguien@email.com', '<hash>');

-- Prospectos comerciales (sección /administracion/prospectos), importados del Excel Control_Demos el 2026-11-26.
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  negocio text not null,
  producto text not null default 'Rediseño web',
  rubro text,
  contacto text,
  whatsapp text,
  email text,
  instagram text,
  web text,
  demo text,
  ciudad text,
  motivo text,
  estado text not null default 'Prospecto',
  seguimiento text,
  fecha_contacto date,
  proximo_paso text,
  proximo_fecha date,
  notas text,
  origen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un negocio no se repite (mismo nombre sin importar mayúsculas).
create unique index if not exists prospects_negocio_key on prospects (lower(negocio));

-- Historial de cada prospecto: contactos, cambios de estado y notas.
create table if not exists prospect_events (
  id bigserial primary key,
  prospect_id uuid not null references prospects(id) on delete cascade,
  tipo text not null,
  texto text,
  created_at timestamptz not null default now()
);

create index if not exists prospect_events_prospect on prospect_events (prospect_id, created_at desc);
