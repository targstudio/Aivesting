-- Esquema inicial do AI.vesting (Postgres / Supabase).
-- Guarda cada ranking calculado para montar o histórico público de acertos do modelo.

create table if not exists ranking_runs (
  id bigint generated always as identity primary key,
  asset_class text not null check (asset_class in ('acoes', 'fiis')),
  benchmark text not null,
  model_version text not null,
  data_realtime boolean not null,
  computed_at timestamptz not null
);

create table if not exists ranking_entries (
  run_id bigint not null references ranking_runs (id) on delete cascade,
  ticker text not null,
  rank int not null,
  score numeric(5, 1) not null,
  probability_outperform numeric(4, 3) not null,
  price numeric(14, 4) not null,
  top_factors jsonb not null default '[]',
  primary key (run_id, ticker)
);

create index if not exists ranking_runs_class_time on ranking_runs (asset_class, computed_at desc);
create index if not exists ranking_entries_ticker on ranking_entries (ticker);

-- Watchlist por usuário (auth.users do Supabase).
create table if not exists watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

alter table watchlist enable row level security;
create policy "watchlist do próprio usuário" on watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Rankings são públicos para leitura; só o backend (service role) escreve.
alter table ranking_runs enable row level security;
alter table ranking_entries enable row level security;
create policy "leitura pública" on ranking_runs for select using (true);
create policy "leitura pública" on ranking_entries for select using (true);
