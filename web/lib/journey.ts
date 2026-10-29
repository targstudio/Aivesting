import type { AdvisorInput, Holding } from "./api";
import { loadPortfolio } from "./portfolio";

// A jornada: o app premia o hábito de guardar dinheiro, ter reserva e diversificar. Nunca premia comprar e vender.
// Fica neste navegador e, com conta, é espelhada no banco (ver SYNC_KEYS em account.ts).

export type Journey = {
  /** Quanto a pessoa disse que guardou em cada mês ("2026-10" → 500). */
  saved: Record<string, number>;
  /** Patrimônio visto em cada mês, para o resumo mensal comparar. */
  history: Record<string, number>;
  /** Trilhas de Aprenda concluídas. */
  trails: string[];
};

const KEY = "aivesting.jornada";
export const JOURNEY_EVENT = "aivesting:jornada";

export function loadJourney(): Journey {
  try {
    const raw = localStorage.getItem(KEY);
    const j = raw ? JSON.parse(raw) : {};
    return { saved: j.saved ?? {}, history: j.history ?? {}, trails: j.trails ?? [] };
  } catch {
    return { saved: {}, history: {}, trails: [] };
  }
}

export function saveJourney(j: Journey) {
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {}
  window.dispatchEvent(new Event(JOURNEY_EVENT));
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function prevMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Meses seguidos guardando, até este mês (ou até o mês passado, se este ainda não foi registrado). */
export function streak(saved: Record<string, number>, now = monthKey()) {
  let key = saved[now] > 0 ? now : prevMonth(now);
  let n = 0;
  while (saved[key] > 0) {
    n++;
    key = prevMonth(key);
  }
  return n;
}

// Os níveis seguem um voo, combinando com a torre de controle do StockTower: do pré-voo até o comando da torre.
export const LEVELS = [
  { min: 0, name: "Pré-voo" },
  { min: 1_000, name: "Check-in" },
  { min: 5_000, name: "Embarque" },
  { min: 10_000, name: "Taxiando" },
  { min: 25_000, name: "Decolagem" },
  { min: 50_000, name: "Subida" },
  { min: 100_000, name: "Altitude de cruzeiro" },
  { min: 250_000, name: "Acima das nuvens" },
  { min: 500_000, name: "Estratosfera" },
  { min: 1_000_000, name: "Torre de controle" },
];

/** Nível do patrimônio e quanto falta para o próximo (progress de 0 a 1). */
export function levelOf(total: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && total >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1];
  const progress = next ? (total - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1;
  return { index: i, level: LEVELS[i], next, progress: Math.max(0, Math.min(1, progress)) };
}

export const holdingValue = (h: Holding) => h.value ?? (h.quantity ?? 0) * (h.price ?? 0);

function loadAdvisor(): AdvisorInput | null {
  try {
    const raw = localStorage.getItem("aivesting.assessor");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadAlertCount() {
  try {
    const raw = localStorage.getItem("aivesting.alerts");
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  } catch {
    return 0;
  }
}

export type Mission = { key: string; title: string; why: string; href: string; cta: string; done: boolean };

/** Tudo o que a tela da jornada precisa, lido do que já está guardado no navegador. */
export function journeyState() {
  const journey = loadJourney();
  const portfolio = loadPortfolio();
  const holdings = portfolio?.holdings ?? [];
  const advisor = loadAdvisor();
  const savedTotal = Object.values(journey.saved).reduce((a, v) => a + v, 0);
  const portfolioTotal = holdings.reduce((a, h) => a + holdingValue(h), 0);
  const fromPortfolio = portfolioTotal > 0;
  const total = fromPortfolio ? portfolioTotal : savedTotal;
  const months = streak(journey.saved);
  const classes = new Set(holdings.filter((h) => holdingValue(h) > 0).map((h) => h.asset_class));
  const hasVariable = classes.has("acoes") || classes.has("fiis") || classes.has("etf");

  const missions: Mission[] = [
    {
      key: "perfil",
      title: "Descobrir o seu perfil",
      why: "4 perguntas dizem quanto risco combina com você.",
      href: "/assessor",
      cta: "Responder",
      done: !!advisor?.answers,
    },
    {
      key: "reserva",
      title: "Montar a reserva de emergência",
      why: "Antes de tudo, guarde de 3 a 6 meses de gastos num lugar seguro que dá para resgatar a qualquer dia.",
      href: "/renda-fixa",
      cta: "Ver onde guardar",
      done: !!advisor?.has_reserve,
    },
    {
      key: "primeiro",
      title: "Registrar o primeiro dinheiro guardado",
      why: "Anote aqui quanto guardou este mês. É isso que faz a sua sequência crescer.",
      href: "#guardei",
      cta: "Registrar",
      done: savedTotal > 0,
    },
    {
      key: "carteira",
      title: "Colocar seus investimentos no app",
      why: "Com um print da corretora o app mede o seu patrimônio de verdade.",
      href: "/carteira",
      cta: "Importar",
      done: holdings.length > 0,
    },
    {
      key: "aprender",
      title: "Concluir uma trilha em Aprenda",
      why: "5 minutos para entender o básico antes de colocar dinheiro em ações.",
      href: "/enciclopedia",
      cta: "Começar",
      done: journey.trails.length > 0,
    },
    {
      key: "diversificar",
      title: "Ter uma parte em ações ou fundos",
      why: "Depois da reserva, uma parte em ações ou fundos imobiliários ajuda o dinheiro a crescer no longo prazo.",
      href: "/assessor",
      cta: "Ver o plano",
      done: hasVariable,
    },
    {
      key: "tres-meses",
      title: "Guardar 3 meses seguidos",
      why: "A constância pesa mais do que acertar o melhor investimento.",
      href: "#guardei",
      cta: "Registrar este mês",
      done: months >= 3,
    },
    {
      key: "aviso",
      title: "Criar um aviso",
      why: "O app avisa quando uma ação ou fundo chegar ao preço que você quer.",
      href: "/alertas",
      cta: "Criar",
      done: loadAlertCount() > 0,
    },
  ];

  return { journey, holdings, advisor, total, fromPortfolio, months, missions, level: levelOf(total) };
}

/** Grava o patrimônio do mês (para o resumo mensal comparar com o mês anterior). */
export function recordHistory(total: number) {
  const j = loadJourney();
  const key = monthKey();
  if (total > 0 && j.history[key] !== total) saveJourney({ ...j, history: { ...j.history, [key]: total } });
}

/** Traduz a renda mensal de dividendos numa conta do dia a dia. */
export function dividendsPay(monthly: number) {
  const bills: [number, string][] = [
    [600, "o mercado do mês"],
    [250, "a conta de luz"],
    [100, "a internet de casa"],
    [50, "o plano de celular"],
    [20, "um serviço de streaming"],
    [5, "um cafezinho por semana"],
  ];
  return bills.find(([v]) => monthly >= v)?.[1] ?? null;
}
