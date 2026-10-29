import Link from "next/link";
import { Breadcrumbs, InfoBanner, PageTitle } from "@/app/components/ui";
import { AskButton } from "./AskButton";
import { GLOSSARY } from "@/lib/glossary";
import { ENTRIES, GROUPS } from "./entries";

const ROWS: [keyof (typeof ENTRIES)[number], string][] = [
  ["howItPays", "Como rende"],
  ["risk", "Risco"],
  ["liquidity", "Liquidez"],
  ["tax", "Imposto"],
  ["guarantee", "Garantia"],
  ["goodFor", "Para quem"],
];

export default function EncyclopediaPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Enciclopédia" }]} />
      <PageTitle
        title="Enciclopédia do investidor"
        subtitle="O que é cada investimento, como rende, o risco, a liquidez e o imposto. Tire qualquer dúvida com a IA."
      />
      <InfoBanner>
        Quer saber quanto colocar em cada um? O <Link href="/assessor" className="underline">Assessor</Link> monta um plano a
        partir do seu perfil.
      </InfoBanner>
      <nav className="mb-8 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <a key={g} href={`#${g}`} className="rounded-full bg-track px-4 py-2 text-sm font-semibold">
            {g}
          </a>
        ))}
        <a href="#glossario" className="rounded-full bg-track px-4 py-2 text-sm font-semibold">
          Glossário dos números
        </a>
      </nav>
      {GROUPS.map((g) => (
        <section key={g} id={g} className="mb-10 scroll-mt-24">
          <h2 className="mb-4 text-xl font-bold">{g}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {ENTRIES.filter((e) => e.group === g).map((e) => (
              <article key={e.slug} id={e.slug} className="scroll-mt-24 rounded-card border border-border bg-surface p-6 md:p-7">
                <h3 className="text-lg font-bold">{e.name}</h3>
                <p className="mt-1 text-sm text-muted">{e.summary}</p>
                <dl className="mt-4 divide-y divide-border text-sm">
                  {ROWS.filter(([k]) => e[k] && e[k] !== "—").map(([k, label]) => (
                    <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                      <dt className="font-semibold">{label}</dt>
                      <dd>{e[k]}</dd>
                    </div>
                  ))}
                </dl>
                <AskButton prompt={`Explique ${e.name} com exemplos e compare com as alternativas parecidas, usando os dados atuais do app.`} />
              </article>
            ))}
          </div>
        </section>
      ))}
      <section id="glossario" className="mb-10 scroll-mt-24">
        <h2 className="mb-1 text-xl font-bold">Glossário dos números</h2>
        <p className="mb-4 text-sm text-muted">Os termos que aparecem nas telas do app. Em qualquer tela, toque no termo sublinhado para ver a explicação.</p>
        <dl className="grid gap-4 lg:grid-cols-2">
          {Object.entries(GLOSSARY).map(([k, g]) => (
            <div key={k} id={`termo-${k}`} className="scroll-mt-24 rounded-card border border-border bg-surface p-5">
              <dt className="font-bold">{g.term}</dt>
              <dd className="mt-1 text-sm text-muted">{g.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
