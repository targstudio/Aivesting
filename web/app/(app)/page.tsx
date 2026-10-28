import Link from "next/link";
import { getMacro, getRanking, type RankingSnapshot } from "@/lib/api";
import { formatNumber, formatTime } from "@/lib/format";
import { RankingList } from "@/app/components/RankingList";
import { Card, EmptyState, InfoBanner, PageTitle, Stat } from "@/app/components/ui";

function TopRanking({ title, snapshot, href }: { title: string; snapshot: RankingSnapshot | null; href: string }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link href={href} className="rounded-full bg-accent-bg px-4 py-1.5 text-sm font-semibold text-accent-text">
          Ver ranking completo
        </Link>
      </div>
      {snapshot && snapshot.assets.length ? (
        <RankingList assets={snapshot.assets.slice(0, 5)} benchmark={snapshot.benchmark} compact />
      ) : (
        <EmptyState>Ranking ainda não calculado. Verifique se a API está rodando.</EmptyState>
      )}
    </div>
  );
}

// O ranking muda durante o pregão: renderiza a cada acesso em vez de gerar a página no build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [acoes, fiis, macro] = await Promise.all([getRanking("acoes"), getRanking("fiis"), getMacro()]);
  const computedAt = acoes?.computed_at ?? fiis?.computed_at;
  const realtime = acoes?.data_realtime ?? false;

  return (
    <>
      <PageTitle eyebrow="Boas-vindas ao AI.vesting!" title="Como está o mercado hoje" subtitle="Ranking de ativos por probabilidade de superar o índice, recalculado a cada 5 minutos no pregão." />
      <InfoBanner>
        Conteúdo informativo gerado por modelo estatístico em calibração. Não é recomendação de investimento.
        {!realtime && " Cotações com atraso até a contratação do feed em tempo real."}
      </InfoBanner>

      {(macro?.indicators.length || computedAt) && (
      <Card className="mb-8">
        <div className="grid grid-cols-2 gap-6 md:flex md:gap-0 md:divide-x md:divide-border">
          {(macro?.indicators ?? []).map((m) => (
            <div key={m.key} className="md:px-8 md:first:pl-0">
              <Stat
                value={`${m.unit === "R$" ? "R$ " : ""}${formatNumber(m.value)}${m.unit.startsWith("%") ? "%" : ""}`}
                label={m.label}
                accent={m.key === "selic"}
                sub={`em ${m.date}`}
              />
            </div>
          ))}
          {computedAt && (
            <div className="md:px-8">
              <Stat value={formatTime(computedAt)} label="Último recálculo do ranking" />
            </div>
          )}
        </div>
      </Card>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        <TopRanking title="Ações" snapshot={acoes} href="/ranking" />
        <TopRanking title="Fundos imobiliários" snapshot={fiis} href="/ranking?classe=fiis" />
      </div>
    </>
  );
}
