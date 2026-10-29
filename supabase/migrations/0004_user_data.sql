-- Dados da conta (login por link mágico): carteira, alertas, perfil do assessor e preferências de cada pessoa.
-- Só a API (service role) lê e grava; não há política de acesso público.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;
