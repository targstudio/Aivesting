/** Termos que aparecem nos números do app, explicados em linguagem simples. Usado por <Term> e pela Enciclopédia. */
export const GLOSSARY = {
  retorno_ano: {
    term: "Quanto rendeu por ano",
    text: "Quanto o investimento rendeu, em média, a cada ano do período, já contando os dividendos reinvestidos. Se rendeu 10% ao ano por 10 anos, R$ 1.000 viraram cerca de R$ 2.600.",
  },
  volatilidade: {
    term: "Sobe e desce (volatilidade)",
    text: "Mede o quanto o preço sobe e desce. 30% ao ano quer dizer que é comum o preço variar 30% para cima ou para baixo em um ano. Quanto maior, mais emoção e mais chance de ver prejuízo no meio do caminho.",
  },
  pior_queda: {
    term: "Pior queda",
    text: "A maior perda do topo até o fundo no período. Mostra quanto você teria visto o dinheiro encolher se comprasse no pior momento, antes de recuperar.",
  },
  sharpe: {
    term: "Retorno por risco (Sharpe)",
    text: "Mostra se valeu a pena aguentar os sobe e desce em vez de deixar o dinheiro na renda fixa (CDI). Acima de 0,5 é bom; perto de zero ou negativo quer dizer que a renda fixa teria sido melhor.",
  },
  probabilidade: {
    term: "Chance de render mais que a bolsa",
    text: "Estimativa, feita com estatística, de o investimento render mais que a média da bolsa (Ibovespa para ações, IFIX para fundos imobiliários) no prazo. 60% não é garantia: em 4 de cada 10 casos parecidos, ele ficou para trás.",
  },
  score: {
    term: "Nota",
    text: "Nota de 0 a 100 que o app dá a partir de como o preço vem se comportando: se vem subindo, se oscila muito e se tem muita gente negociando. Serve para ordenar a lista; não é recomendação.",
  },
  dividend_yield: {
    term: "Rendimento em dividendos (DY)",
    text: "Dividendos pagos nos últimos 12 meses divididos pelo preço atual. DY de 10% quer dizer que, com o mesmo pagamento do último ano, R$ 1.000 renderiam R$ 100 por ano, fora a variação do preço.",
  },
  data_com: {
    term: "Data com",
    text: "Último dia para ter a ação ou cota e ganhar o próximo pagamento. Quem compra depois dela só recebe no próximo pagamento.",
  },
  cdi: {
    term: "CDI",
    text: "Taxa que os bancos usam para emprestar entre si, quase igual à Selic (os juros básicos do país). É a régua da renda fixa: um CDB de 100% do CDI rende o mesmo que essa taxa.",
  },
  ibovespa: {
    term: "Ibovespa",
    text: "Índice das ações mais negociadas da B3. Bater o Ibovespa quer dizer render mais do que a média da bolsa.",
  },
  ifix: {
    term: "IFIX",
    text: "Índice dos fundos imobiliários da B3. No app, quando o IFIX não está disponível, usamos a média dos FIIs acompanhados.",
  },
  mediana: {
    term: "Resultado típico (mediana)",
    text: "O valor do meio: metade dos períodos terminou acima dele e metade abaixo. É mais honesto que a média, que puxa para cima quando há poucos casos muito bons.",
  },
  marcacao: {
    term: "Preço que muda todo dia (marcação a mercado)",
    text: "Títulos prefixados e de IPCA+ mudam de preço todo dia conforme os juros. Quem leva até o vencimento recebe a taxa contratada; quem vende antes recebe o preço do dia, que pode ser maior ou menor.",
  },
  ir_regressivo: {
    term: "Imposto que diminui com o tempo (IR regressivo)",
    text: "Imposto de renda da renda fixa que cai com o tempo: 22,5% até 6 meses, 20% até 1 ano, 17,5% até 2 anos e 15% depois disso. Incide só sobre o ganho.",
  },
  fgc: {
    term: "Garantia do FGC",
    text: "Fundo Garantidor de Créditos: se o banco quebrar, devolve até R$ 250 mil por CPF por instituição em CDB, LCI, LCA e poupança (limite total de R$ 1 milhão a cada 4 anos).",
  },
  rebalanceamento: {
    term: "Reequilibrar a carteira",
    text: "Trazer a carteira de volta às proporções do plano. Ao investir mais, basta colocar o dinheiro novo nas classes que ficaram abaixo, sem vender nada nem pagar imposto.",
  },
  pl: {
    term: "P/L (preço sobre lucro)",
    text: "Preço da ação dividido pelo lucro por ação do último ano: quantos anos de lucro atual pagariam o preço. P/L baixo pode indicar ação barata ou um lucro que o mercado espera que caia; compare com empresas do mesmo setor.",
  },
  pvp: {
    term: "P/VP (preço sobre valor patrimonial)",
    text: "Preço dividido pelo patrimônio contábil por ação ou cota. Abaixo de 1, o mercado paga menos do que o patrimônio no balanço. Em FIIs é muito usado: P/VP perto de 1 quer dizer que a cota está perto do valor dos imóveis.",
  },
  roe: {
    term: "ROE (retorno sobre o patrimônio)",
    text: "Lucro do ano dividido pelo patrimônio da empresa: quanto ela ganha com o dinheiro dos sócios. ROE de 20% é considerado alto; bancos e empresas maduras costumam ficar entre 10% e 25%.",
  },
  margem_liquida: {
    term: "Margem líquida",
    text: "Quanto sobra de lucro de cada R$ 100 vendidos, depois de custos, juros e impostos. Varia muito por setor: varejo tem margens baixas, bancos e energia margens maiores.",
  },
  divida_patrimonio: {
    term: "Dívida sobre patrimônio",
    text: "Dívida total dividida pelo patrimônio, em %. 100% quer dizer dívida do tamanho do patrimônio. Quanto maior, mais a empresa sofre com juros altos.",
  },
  vacancia: {
    term: "Vacância",
    text: "Parte dos imóveis de um fundo imobiliário que está vazia, sem pagar aluguel. 5% é pouco; acima de 15% a renda do fundo costuma sofrer.",
  },
  liquidez: {
    term: "Liquidez (negociado por dia)",
    text: "Quanto dinheiro troca de mãos por dia naquele papel, em média. Muita liquidez quer dizer que é fácil comprar e vender rápido sem mexer no preço; pouca liquidez pode deixar você preso na hora de vender.",
  },
  embalo: {
    term: "Embalo do preço",
    text: "Como o preço vem andando nas últimas semanas: se subiu no mês, se está acima da média dos últimos 20 pregões e se mais gente está negociando. Mostra o que já aconteceu, não garante que continue.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
