-- Consumo de IA: uma linha por chamada à Claude, com tokens e custo estimado em US$.
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0
);

create index if not exists ai_usage_at on ai_usage (at desc);

-- Só o backend (service role) lê e grava; a API publica o resumo em GET /ia/consumo.
alter table ai_usage enable row level security;
