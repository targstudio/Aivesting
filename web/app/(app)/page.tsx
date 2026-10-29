import { Journey, type Today } from "@/app/components/Journey";
import Link from "next/link";
import { RankingList } from "@/app/components/RankingList";
import { EmptyState } from "@/app/components/ui";
import { getMacro, getMarket, getRanking, type RankingSnapshot } from "@/lib/api";
import { formatBRL, formatNumber, formatPercent, formatUpdated } from "@/lib/format";

// Os números de "Como está hoje" mudam durante o dia: renderiza a cada acesso.
export const dynamic = "force-dynamic";

function Top({ title, snapshot, href }: { title: string; snapshot: RankingSnapshot | null; href: string }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-sm font-medium text-accent-text hover:underline">
          Ver todos
        </Link>
      </div>
      {snapshot && snapshot.assets.length ? (
        <RankingList assets={snapshot.assets.slice(0, 5)} benchmark={snapshot.benchmark} compact />
      ) : (
        <EmptyState>A lista ainda está sendo preparada. Tente de novo em alguns minutos.</EmptyState>
      )}
    </div>
  );
}

export default async function Home() {
  const [macro, market, acoes, fiis] = await Promise.all([getMacro(), getMarket(), getRanking("acoes"), getRanking("fiis")]);
  const ind = (key: string) => macro?.indicators.find((m) => m.key === key);
  const ibov = market?.indices.find((i) => i.symbol === "^BVSP");
  const usd = market?.indices.find((i) => i.symbol === "BRL=X");
  const selic = ind("selic");
  const ipca = ind("ipca_12m");

  const today: Today = {
    lines: [
      ...(selic ? [{ label: "Juros básicos (Selic)", value: `${formatNumber(selic.value)}% ao ano`, note: "quanto rende a renda fixa" }] : []),
      ...(ipca ? [{ label: "Inflação em 12 meses", value: `${formatNumber(ipca.value)}%`, note: "quanto os preços subiram" }] : []),
      ...(ibov ? [{ label: "Bolsa hoje", value: formatPercent(ibov.change_percent), note: "Ibovespa" }] : []),
      ...(usd ? [{ label: "Dólar", value: formatBRL(usd.value), note: `${formatPercent(usd.change_percent)} hoje` }] : []),
    ],
    updated: market?.precos_de || market?.atualizado_em ? formatUpdated((market.precos_de ?? market.atualizado_em)!) : undefined,
  };
  if (!today.lines.length) today.lines.push({ label: "Dados do dia", value: "carregando", note: "tente de novo em 1 minuto" });

  const highlights = (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Destaques do mercado hoje</h2>
        <Link href="/mercado" className="text-sm font-semibold text-accent-text hover:underline">
          Ver o mercado completo, com renda fixa
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Top title="Ações com mais chance de render bem" snapshot={acoes} href="/ranking" />
        <Top title="Fundos imobiliários" snapshot={fiis} href="/ranking?classe=fiis" />
      </div>
      <p className="mt-3 text-xs text-muted">
        As chances vêm de estatística sobre o passado e podem errar. Não é recomendação de investimento.
      </p>
    </section>
  );

  return <Journey today={today} highlights={highlights} />;
}
