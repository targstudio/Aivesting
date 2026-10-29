"use client";

import { Bell, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

// Vitrine da tela de entrada: o que a pessoa ganha ao criar a conta. Os números das ilustrações são exemplos.
const SLIDES = [
  {
    tag: "Ranking com IA",
    photo: "/entrar/ranking.webp",
    title: "Veja quais ações e FIIs mais se destacam agora",
    text: "Atualizado a cada 5 minutos no pregão, com a explicação da IA em linguagem simples.",
    art: <RankingArt />,
  },
  {
    tag: "Simulador de metas",
    photo: "/entrar/simulador.webp",
    title: "Descubra quanto investir por mês para chegar lá",
    text: "Seu plano testado em mais de 20 anos de mercado, do pior ao melhor caso, já descontando a inflação.",
    art: <GoalArt />,
  },
  {
    tag: "Minha carteira",
    photo: "/entrar/carteira.webp",
    title: "Sua carteira inteira em um só lugar, em qualquer aparelho",
    text: "Importe por print, acompanhe os proventos e saiba onde colocar o próximo aporte.",
    art: <PortfolioArt />,
  },
  {
    tag: "Renda fixa",
    photo: "/entrar/renda-fixa.webp",
    title: "Tesouro, CDB ou LCI: qual rende mais no seu prazo?",
    text: "Compare o rendimento líquido, já com imposto e taxas, antes de decidir.",
    art: <FixedIncomeArt />,
  },
  {
    tag: "Assistente e alertas",
    photo: "/entrar/assistente.webp",
    title: "Pergunte qualquer coisa e seja avisado na hora certa",
    text: "A IA lê os números de cada tela e responde sem jargão. Os alertas avisam quando o preço chega onde você quer.",
    art: <AssistantArt />,
  },
];

export function Slides() {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setSlide((s) => (s + 1) % SLIDES.length), 6000);
    return () => clearTimeout(t);
  }, [slide, paused]);
  const go = (d: number) => setSlide((slide + d + SLIDES.length) % SLIDES.length);
  const current = SLIDES[slide];

  return (
    <aside
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden bg-[#111] text-white lg:w-[45%]"
    >
      {/* Todas as fotos ficam carregadas e trocam com fade; o degradê escuro mantém o texto legível. */}
      {SLIDES.map((s, i) => (
        <img
          key={s.photo}
          src={s.photo}
          alt=""
          fetchPriority={i === 0 ? "high" : "low"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === slide ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/90" />
      <div className="relative flex h-full flex-col p-6 md:p-12">
        <div className="hidden flex-1 items-center justify-center py-8 sm:flex">
          <div key={slide} className="w-full max-w-md animate-[fadein_.5s_ease-out]">
            {current.art}
            <p className="mt-3 text-right text-xs text-white/40">Exemplo ilustrativo</p>
          </div>
        </div>
        <div>
          <span className="mb-4 inline-block rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary">{current.tag}</span>
          <h2 className="max-w-xl text-2xl font-bold leading-tight tracking-tight md:text-4xl">{current.title}</h2>
          <p className="mt-3 max-w-xl text-white/70 md:text-lg">{current.text}</p>
          <div className="mt-6 flex items-center gap-4 md:mt-8">
            <button onClick={() => go(-1)} aria-label="Anterior" className="rounded-full p-1 hover:bg-white/10">
              <ChevronLeft />
            </button>
            {SLIDES.map((s, i) => (
              <button
                key={s.tag}
                onClick={() => setSlide(i)}
                aria-label={s.tag}
                className={`h-1.5 rounded-full bg-white transition-all ${i === slide ? "w-6" : "w-1.5 opacity-60"}`}
              />
            ))}
            <button onClick={() => go(1)} aria-label="Próximo" className="rounded-full p-1 hover:bg-white/10">
              <ChevronRight />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/15 bg-black/45 p-5 shadow-2xl backdrop-blur-md">{children}</div>;
}

function RankingArt() {
  const rows = [
    ["WEGE3", 82, "+1,8%"],
    ["ITUB4", 74, "+0,9%"],
    ["HGLG11", 69, "+0,4%"],
    ["PETR4", 61, "-0,3%"],
  ] as const;
  return (
    <Panel>
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/80">
        <Sparkles size={16} className="text-primary" /> Ranking agora
      </p>
      <div className="space-y-3">
        {rows.map(([t, score, chg], i) => (
          <div key={t} className="flex items-center gap-3 text-sm">
            <span className="w-4 text-white/50">{i + 1}</span>
            <span className="w-16 font-semibold">{t}</span>
            <span className="h-2 flex-1 rounded-full bg-white/10">
              <span className="block h-2 rounded-full bg-primary" style={{ width: `${score}%` }} />
            </span>
            <span className="w-8 text-right font-semibold">{score}</span>
            <span className={`w-12 text-right ${chg.startsWith("-") ? "text-red-400" : "text-emerald-400"}`}>{chg}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function GoalArt() {
  // Alturas em proporção ao melhor caso (R$ 374 mil = 112 px); a linha tracejada é a meta de R$ 250 mil.
  const bars = [
    ["Pior caso", 186, "R$ 186 mil"],
    ["Típico", 281, "R$ 281 mil"],
    ["Melhor caso", 374, "R$ 374 mil"],
  ] as const;
  const px = (v: number) => `${(v / 374) * 112}px`;
  return (
    <Panel>
      <p className="text-sm text-white/70">R$ 1.000 por mês durante 15 anos</p>
      <p className="mt-1 text-2xl font-bold">
        Meta de R$ 250 mil: <span className="text-primary">atingida em 7 de cada 10</span>
      </p>
      <div className="relative mt-6 flex h-28 items-end gap-6">
        <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-primary" style={{ bottom: px(250) }}>
          <span className="absolute -top-5 left-0 text-xs font-semibold text-primary">meta</span>
        </div>
        {bars.map(([label, v]) => (
          <div key={label} className="flex-1 rounded-t-lg bg-white/80" style={{ height: px(v) }} />
        ))}
      </div>
      <div className="mt-2 flex gap-6 text-center">
        {bars.map(([label, , text]) => (
          <div key={label} className="flex-1">
            <p className="text-xs font-semibold">{text}</p>
            <p className="text-xs text-white/60">{label}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PortfolioArt() {
  const parts = [
    ["Renda fixa", 45, "#f5c400"],
    ["Ações", 30, "#ffffff"],
    ["FIIs", 15, "#7aa7ff"],
    ["Dólar", 10, "#34d399"],
  ] as const;
  let acc = 0;
  const gradient = parts.map(([, p, c]) => `${c} ${acc}% ${(acc += p)}%`).join(", ");
  return (
    <Panel>
      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-[#1b1b1b]">
            <span className="text-xs text-white/60">Total</span>
            <span className="font-bold">R$ 84 mil</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {parts.map(([l, p, c]) => (
            <li key={l} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l} <span className="text-white/60">{p}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5 flex justify-between rounded-xl bg-white/[0.06] px-4 py-3 text-sm">
        <span className="text-white/70">Proventos em 12 meses</span>
        <span className="font-semibold text-emerald-400">R$ 3.920</span>
      </div>
      <div className="mt-2 flex justify-between rounded-xl bg-white/[0.06] px-4 py-3 text-sm">
        <span className="text-white/70">Próximo aporte</span>
        <span className="font-semibold">R$ 500 em FIIs</span>
      </div>
    </Panel>
  );
}

function FixedIncomeArt() {
  const rows = [
    ["LCI 95% do CDI", 100, "R$ 11.470", true],
    ["CDB 110% do CDI", 94, "R$ 11.390", false],
    ["Tesouro Selic", 88, "R$ 11.290", false],
    ["Poupança", 58, "R$ 10.720", false],
  ] as const;
  return (
    <Panel>
      <p className="mb-4 text-sm text-white/70">R$ 10 mil por 1 ano, já sem imposto</p>
      <div className="space-y-3">
        {rows.map(([l, w, v, best]) => (
          <div key={l}>
            <div className="mb-1 flex justify-between text-sm">
              <span className={best ? "font-semibold" : "text-white/80"}>{l}</span>
              <span className="font-semibold">{v}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10">
              <div className={`h-2 rounded-full ${best ? "bg-primary" : "bg-white/60"}`} style={{ width: `${w}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AssistantArt() {
  return (
    <Panel>
      <div className="space-y-3 text-sm">
        <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-on-primary">
          O que o P/VP abaixo de 1 quer dizer?
        </p>
        <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 leading-relaxed">
          Que o preço na bolsa está abaixo do patrimônio da empresa. Pode ser oportunidade ou sinal de problema: vale olhar
          o lucro e as dívidas junto.
        </p>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <Bell size={18} className="text-primary" />
          <span>
            <b>Alerta:</b> BBAS3 chegou a R$ 27,00
          </span>
        </div>
      </div>
    </Panel>
  );
}
