# Meta 76

App pessoal de dieta e emagrecimento (alta proteína, carboidrato quase zero, sem frutas/verduras), baseado em relatório de bioimpedância.

## O que tem

- **Hoje** — registre cada refeição como "vou comer" ou "comi"; anel de calorias, barras de macro e meta de peso semanal calculados na hora.
- **Gráficos** — o que você já comeu, o que falta comer, quanto falta para bater a meta do dia e histórico dos últimos dias.
- **Nutri** — acompanhamento de fibra, vitamina C, potássio, magnésio e folato (nutrientes de risco numa dieta sem fruta/verdura), com sugestões de uma IA quando algo fica abaixo do ideal.
- **Plano** — plano alimentar editável.
- **Perfil** — dados do exame de bioimpedância e configurações (peso alvo, nível de atividade, déficit calórico).

## Como rodar

`index.html` é uma página HTML autocontida. Abra o arquivo direto no navegador ou publique-o em qualquer host estático (GitHub Pages, Netlify, Vercel, etc.).

Quando aberto como um [Claude Artifact](https://claude.ai/code), o app usa as capacidades de dados (`db`) e IA (`sample`) do Claude para persistir o progresso e responder perguntas sobre nutrição. Aberto como arquivo estático comum, ele funciona com armazenamento apenas na sessão do navegador (sem persistência entre acessos e sem assistente de IA).
