# Módulo de trading

Área **Trading** no menu, para quem opera day trade e swing trade na B3.

| Tela | O que faz |
|---|---|
| Gráfico (`/trading`) | Candles de 1, 5, 15 e 60 minutos, diário e semanal (lightweight-charts, Apache 2.0). MME 9/21, MMA 50/200, VWAP, Bollinger, volume, IFR e MACD. Leitura técnica do último candle, setups, pivôs, suporte/resistência, stop pelo ATR, calculadora de tamanho de posição e lista de acompanhamento. Atualiza sozinho a cada minuto no pregão. |
| Radar de setups (`/trading/radar`) | Varre as ~100 ações mais negociadas no diário: 9.1, cruzamento de médias, IFR2, IFR14, rompimento de 20 barras, MACD, Bollinger, volume forte, gap, inside bar. A visão "Para day trade" lista as mais líquidas (giro > R$ 20 mi/dia) com maior amplitude (ATR%). |
| Testar estratégia (`/trading/estrategias`) | Estratégia em português vira regras (IA) e é testada. Execução no candle seguinte, stop/alvo pela máxima e mínima (stop vence empates), gap atravessando o stop sai na abertura, lote de 100, custos da B3, corretagem, slippage, day trade zerado no fim do pregão e IR mês a mês. 6 estratégias prontas. |
| Diário de trades (`/trading/diario`) | Registro manual ou leitura de nota de corretagem por print (IA). Acerto, payoff, fator de lucro, por setup e por ativo, observações automáticas e DARF mensal (day trade 20%, swing 15%, FIIs 20%, isenção de R$ 20 mil, compensação de prejuízo, IRRF descontado). |

A IA do app ganha três ferramentas no Trading: `get_technical`, `get_radar` e `run_backtest`.

Código: `api/app/trading/` (dados, indicadores, setups, backtest, diário, radar, IA, rotas) e
`web/app/components/trading/`. Testes: `api/tests/test_trading.py`.

## O que falta para operar day trade de verdade

O módulo funciona hoje para estudar, testar e registrar. Para executar day trade com segurança faltam três coisas, todas
pagas ou contratuais:

1. **Cotação em tempo real.** O Yahoo tem cerca de 15 minutos de atraso e não permite uso comercial. Para day trade é
   preciso um distribuidor autorizado da B3 (ex.: Cedro Technologies, Nelogica, Enfoque, ou um plano da brapi com
   tempo real), mais a taxa de exibição de dados da B3 por usuário. O `CandleSource` (`api/app/trading/data.py`) é o
   único ponto a trocar; o restante do módulo não muda. Com o feed, o gráfico passa de "atualiza a cada minuto" para
   streaming (WebSocket).
2. **Mini-índice (WIN) e mini-dólar (WDO).** São os contratos mais operados no day trade e não existem no Yahoo. Vêm no
   mesmo feed do item 1 (segmento BM&F). O backtest precisará de regras de contrato futuro (ponto, margem, ajuste).
3. **Envio de ordens.** Não há API pública de corretoras brasileiras para apps de terceiros. Caminhos possíveis:
   - **MetaTrader 5**: várias corretoras (XP, Clear, Rico, Genial, BTG, Modal) oferecem MT5 com roteamento para a B3.
     Um robô (Expert Advisor) ou a biblioteca Python `MetaTrader5`, rodando no computador do trader e logado na conta
     dele, pode receber sinais do app. O app não toca no dinheiro; a ordem sai da conta da própria pessoa.
   - **Parceria com corretora** (API B2B ou "multibroker"), que exige contrato e normalmente CNPJ e compliance.

## Cuidados regulatórios

- O app mostra padrões com regras públicas e testes que a própria pessoa define. Não diz "compre" ou "venda".
- Publicar sinais de compra e venda para o público é análise de valores mobiliários (Resolução CVM 20): exige
  analista CNPI responsável.
- Executar ordens por conta de terceiros exige ser intermediário autorizado (Resolução CVM 35). Com MT5, quem envia
  a ordem é o próprio trader, na conta dele.
