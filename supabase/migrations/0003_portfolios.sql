-- Minha carteira: posições que a pessoa importou de prints da corretora (os prints não são guardados).
-- Enquanto não há login, o id é um UUID aleatório gerado no navegador; só o backend (service role) lê e grava.
create table if not exists portfolios (
  id uuid primary key,
  holdings jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table portfolios enable row level security;
