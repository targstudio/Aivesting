import Link from "next/link";
import { AiInsight } from "@/app/components/AiInsight";
import { SIDE, SIDES } from "@/app/components/AnalystsCard";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Breadcrumbs, Card, EmptyState, InfoBanner, PageTitle, Segmented, Stat } from "@/app/components/ui";
import { getConsensus, type ConsensusAsset, type ConsensusSort } from "@/lib/api";
import { formatBRL, formatNumber, formatRatio, formatUpdated } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORTS: { key: ConsensusSort; label: string }[] = [
  { key: "compra", label: "Mais indicadas para compra" },
  { key: "potencial", label: "Maior distância do preço-alvo" },
  { key: "analistas", label: "Mais acompanhadas" },
];

const dateBR = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

function Row({ a, position }: { a: ConsensusAsset; position: number }) {
  const c = a.counts;
  const v = SIDE[a.verdict];
  return (
    <Link
      href={`/ativo/${a.ticker}`}
      className="block rounded-3xl border border-border bg-surface px-4 py-4 transition-colors hover:bg-track/40 md:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="tabular w-7 text-center text-sm font-bold text-muted">{position}º</span>
          <AssetLogo ticker={a.ticker} src={a.logo_url} />
          <span className="min-w-0">
            <span className="block font-bold">{a.ticker}</span>
            <span className="block truncate text-sm text-muted">{a.name}</span>
          </span>
        </span>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${v.badge}`}>{v.label}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="mb-1.5 flex h-2.5 overflow-hidden rounded-full bg-border">
            {SIDES.map((s) =>
              c[s.key] ? <span key={s.key} style={{ width: `${(100 * c[s.key]) / c.total}%`, background: s.color }} /> : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {SIDES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <strong className="tabular">{c[s.key]}</strong>
              </span>
            ))}
            <span className="text-muted">de {c.total} analistas</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Preço que esperam (média)</div>
          <div className="tabular font-bold">{a.target_mean != null ? formatBRL(a.target_mean) : "–"}</div>
          {a.price != null && <div className="text-[11px] text-muted">hoje {formatBRL(a.price)}</div>}
        </div>
        <div>
          <div className="text-xs text-muted">Diferença para hoje</div>
          <div className={`tabular font-bold ${a.upside != null && a.upside < 0 ? "text-negative" : "text-positive"}`}>
            {formatRatio(a.upside)}
          </div>
          <div className="text-[11px] text-muted">em cerca de 12 meses, se acertarem</div>
        </div>
      </div>

      {a.firms.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Últimas notas com nome:</span>
          {a.firms.map((f) => (
            <span
              key={`${f.firm}-${f.date}`}
              className={`rounded-full px-2.5 py-1 font-semibold ${SIDE[f.side].badge}`}
              title={`${dateBR(f.date)}${f.source.startsWith("ADR") ? ` · sobre a ${f.source.slice(4)}, ação da empresa em Nova York` : ""}`}
            >
              {f.firm}: {f.side_label}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export default async function ConsensusPage({ searchParams }: { searchParams: Promise<{ ordem?: string }> }) {
  const { ordem } = await searchParams;
  const sort = SORTS.find((s) => s.key === ordem)?.key ?? "compra";
  const data = await getConsensus(sort, 60);
  const verdicts = { compra: 0, neutro: 0, venda: 0 };
  data?.assets.forEach((a) => (verdicts[a.verdict] += 1));

  return (
    <>
      <Breadcrumbs items={[{ label: "Mercado", href: "/mercado" }, { label: "Indicadas pelos bancos" }]} />
      <PageTitle
        title="Ações mais indicadas por bancos e corretoras"
        subtitle="O que os analistas que acompanham cada empresa dizem: compra, neutro (manter) ou venda, e o preço que esperam para daqui a 12 meses."
      />
      <InfoBanner>
        Analistas erram com frequência e costumam ser otimistas. A lista mostra a opinião deles, não uma previsão, e não
        conhece o seu objetivo. Não é recomendação de investimento.
      </InfoBanner>

      <div className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmented options={SORTS.map((s) => ({ label: s.label, href: `/consenso?ordem=${s.key}`, active: s.key === sort }))} />
      </div>

      {!data ? (
        <EmptyState>
          As opiniões dos analistas ainda estão sendo reunidas (consultamos uma ação de cada vez numa fonte gratuita).
          Tente de novo em alguns minutos.
        </EmptyState>
      ) : (
        <>
          <Card className="mb-6">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <Stat value={formatNumber(data.covered)} label="ações com 3 ou mais analistas" sub={`de ${data.checked} mais negociadas`} />
              <Stat value={formatNumber(verdicts.compra)} label="com consenso de compra" accent />
              <Stat value={formatNumber(verdicts.neutro)} label="com consenso neutro" />
              <Stat value={formatNumber(verdicts.venda)} label="com consenso de venda" />
            </div>
          </Card>

          <AiInsight
            context="consenso"
            title="O que os bancos estão dizendo"
            askPrompt="Explique de forma simples quais ações os bancos e corretoras mais indicam e por que isso não é garantia"
          />

          <div className="mb-3 flex items-center justify-between text-sm text-muted">
            <span>{data.sort_label}</span>
            <span>Atualizado {formatUpdated(data.updated_at)}</span>
          </div>

          <div className="flex flex-col gap-3">
            {data.assets.map((a, i) => (
              <Row key={a.ticker} a={a} position={i + 1} />
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-lg">Como a lista é montada</h2>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>
                  Para cada ação, contamos quantos analistas dizem <strong className="text-positive">compra</strong>,{" "}
                  <strong className="text-text">neutro</strong> (manter) ou <strong className="text-negative">venda</strong>. O
                  selo de cada ação é a opinião da maioria; empate fica neutro.
                </p>
                <p>
                  A ordem é a parte que indica compra, com um ajuste para quem tem poucos analistas: 3 de 3 não vale mais que
                  14 de 15. Só entram ações acompanhadas por pelo menos {data.min_analysts} analistas.
                </p>
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 text-lg">O que a fonte gratuita não mostra</h2>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>{data.coverage_note}</p>
                <p>Fundos imobiliários quase não têm analistas nessa fonte, por isso a lista é só de ações. Fonte: {data.source}.</p>
              </div>
            </Card>
          </div>

          <p className="mt-6 text-xs text-muted">{data.disclaimer}</p>
        </>
      )}
    </>
  );
}
