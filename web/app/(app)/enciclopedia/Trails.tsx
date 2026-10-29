"use client";

import { ArrowLeft, ArrowRight, Award, Check, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { JOURNEY_EVENT, loadJourney, saveJourney } from "@/lib/journey";

type Lesson = { title: string; text: string };
type Trail = { key: string; title: string; minutes: number; lessons: Lesson[] };

/** Trilhas curtas para quem nunca investiu. Concluir uma vale como missão na jornada. */
export const TRAILS: Trail[] = [
  {
    key: "primeiros-passos",
    title: "Primeiros passos",
    minutes: 4,
    lessons: [
      {
        title: "Primeiro, a reserva de emergência",
        text: "Antes de qualquer investimento com risco, separe de 3 a 6 meses dos seus gastos num lugar seguro que dá para tirar a qualquer dia, como o Tesouro Selic ou um CDB com liquidez diária. É ela que evita vender um investimento no pior momento quando aparece um imprevisto.",
      },
      {
        title: "Juros sobre juros",
        text: "Quando o rendimento fica aplicado, ele também passa a render. R$ 300 por mês a 10% ao ano viram cerca de R$ 60 mil em 10 anos, mas você só colocou R$ 36 mil: o resto veio dos juros. Por isso começar cedo e guardar todo mês pesa mais do que acertar o melhor investimento.",
      },
      {
        title: "Risco e retorno andam juntos",
        text: "Quem promete ganho alto sem risco está enganando. A renda fixa rende menos, mas quase não oscila. Ações e fundos imobiliários podem render mais em muitos anos, mas sobem e descem no caminho. O segredo é usar cada um para o prazo certo.",
      },
    ],
  },
  {
    key: "renda-fixa",
    title: "Renda fixa em 5 minutos",
    minutes: 5,
    lessons: [
      {
        title: "Selic e CDI",
        text: "A Selic é a taxa de juros básica do país, definida pelo Banco Central. O CDI anda quase colado nela. Quando um CDB paga \"100% do CDI\", ele rende o mesmo que essa taxa. Juros altos são bons para quem investe em renda fixa.",
      },
      {
        title: "Tesouro, CDB e LCI",
        text: "No Tesouro Direto você empresta para o governo. No CDB você empresta para um banco. LCI e LCA também são de bancos, mas não pagam imposto de renda. Os três são simples de comprar em qualquer corretora.",
      },
      {
        title: "Imposto e garantia",
        text: "Tesouro e CDB pagam imposto só sobre o lucro, e ele cai com o tempo: de 22,5% até 6 meses para 15% depois de 2 anos. CDB, LCI e LCA têm a garantia do FGC: se o banco quebrar, você recebe até R$ 250 mil por banco.",
      },
    ],
  },
  {
    key: "acoes-fundos",
    title: "Ações e fundos imobiliários",
    minutes: 5,
    lessons: [
      {
        title: "O que é uma ação",
        text: "Uma ação é um pedacinho de uma empresa. Se a empresa cresce e lucra, a ação tende a valer mais com o tempo e parte do lucro vem para você como dividendos. Se vai mal, a ação cai. No dia a dia o preço oscila muito, por isso ação é para dinheiro que pode ficar anos aplicado.",
      },
      {
        title: "Fundos imobiliários (FIIs)",
        text: "Num FII você vira dono de um pedaço de shoppings, galpões ou prédios de escritórios. O aluguel é dividido entre os cotistas, em geral todo mês e sem imposto de renda para pessoa física. É um jeito de ter uma renda mensal com pouco dinheiro.",
      },
      {
        title: "Não coloque tudo num lugar só",
        text: "Dividir o dinheiro entre vários investimentos diminui o estrago se um deles der errado. Uma regra simples: não mais de 10% do total numa única ação ou fundo. Olhe para anos, não para dias: quem compra e vende toda hora costuma ganhar menos.",
      },
    ],
  },
];

export function Trails() {
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState<{ trail: Trail; step: number } | null>(null);
  useEffect(() => {
    const read = () => setDone(loadJourney().trails);
    read();
    window.addEventListener(JOURNEY_EVENT, read);
    return () => window.removeEventListener(JOURNEY_EVENT, read);
  }, []);

  function finish(t: Trail) {
    const j = loadJourney();
    if (!j.trails.includes(t.key)) saveJourney({ ...j, trails: [...j.trails, t.key] });
    setOpen(null);
  }

  if (open) {
    const { trail, step } = open;
    const lesson = trail.lessons[step];
    const last = step === trail.lessons.length - 1;
    return (
      <section className="mb-10 rounded-card border border-primary/50 bg-gradient-to-br from-accent-bg to-surface p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-accent-text">{trail.title}</span>
          <span className="text-muted">
            {step + 1} de {trail.lessons.length}
          </span>
        </div>
        <div className="mb-5 flex gap-1.5">
          {trail.lessons.map((l, i) => (
            <span key={l.title} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-track"}`} />
          ))}
        </div>
        <h3 className="text-2xl font-bold">{lesson.title}</h3>
        <p className="mt-3 max-w-2xl leading-relaxed">{lesson.text}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => (step ? setOpen({ trail, step: step - 1 }) : setOpen(null))}
            className="inline-flex items-center gap-2 rounded-full bg-track px-5 py-2.5 text-sm font-semibold"
          >
            <ArrowLeft size={16} /> {step ? "Voltar" : "Sair"}
          </button>
          <button
            onClick={() => (last ? finish(trail) : setOpen({ trail, step: step + 1 }))}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
          >
            {last ? (
              <>
                <Award size={16} /> Concluir e ganhar o selo
              </>
            ) : (
              <>
                Próxima <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <GraduationCap size={22} /> Comece aqui
      </h2>
      <p className="mb-4 text-sm text-muted">Trilhas de poucos minutos. Cada uma concluída vira um selo na sua jornada.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {TRAILS.map((t) => {
          const ok = done.includes(t.key);
          return (
            <button
              key={t.key}
              onClick={() => setOpen({ trail: t, step: 0 })}
              className={`flex flex-col rounded-card border p-5 text-left transition-colors hover:border-primary ${ok ? "border-border bg-surface-2" : "border-border bg-surface"}`}
            >
              <span
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${ok ? "bg-positive text-white" : "bg-accent-bg text-accent-text"}`}
              >
                {ok ? <Check size={18} /> : <Award size={18} />}
              </span>
              <span className="font-bold">{t.title}</span>
              <span className="mt-1 text-sm text-muted">
                {t.lessons.length} lições · {t.minutes} min{ok ? " · selo conquistado" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
