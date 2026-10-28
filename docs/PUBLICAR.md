# Como publicar o AI.vesting

O app tem três partes, cada uma num serviço:

| Parte | Serviço | Custo aproximado |
|---|---|---|
| Site (`web/`) | Vercel | grátis no plano Hobby |
| API (`api/`) | Render | plano Starter, cerca de US$ 7 por mês (o gratuito dorme e para o recálculo de 5 min) |
| Banco (`supabase/`) | Supabase | grátis |

Chaves necessárias:

- **brapi**: crie uma conta em brapi.dev e copie o token. O plano gratuito tem limite de requisições; com 28 ativos a cada 5 minutos, provavelmente será preciso um plano pago.
- **Anthropic**: crie uma chave em console.anthropic.com (é cobrado por uso).
- **Supabase**: no painel do projeto, *Project Settings > API Keys*: a URL do projeto e uma chave secreta (`sb_secret_...`). A chave secreta fica só na API, nunca no site.

## 1. Banco (Supabase)

Rode `supabase/migrations/0001_init.sql` no *SQL Editor* do projeto (ou com a CLI do Supabase).

## 2. API (Render)

1. render.com > **New > Blueprint** > conecte o GitHub e escolha o repositório **Aivesting**.
2. O Render lê o `render.yaml` e pede os valores de `BRAPI_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SECRET_KEY` e `WEB_ORIGIN` (preencha este depois do passo 3).
3. Depois do deploy, abra `https://<sua-api>.onrender.com/health`. Deve mostrar `"database": true` e `"ai": true`.

## 3. Site (Vercel)

1. vercel.com > **Add New > Project** > importe o repositório **Aivesting**.
2. Em *Root Directory*, escolha `web`.
3. Em *Environment Variables*, crie `NEXT_PUBLIC_API_URL` com o endereço da API do passo 2.
4. Deploy. Copie o domínio gerado (ex.: `https://aivesting.vercel.app`) e coloque em `WEB_ORIGIN` no Render.

Cada merge na branch `main` publica de novo o site e a API automaticamente.
