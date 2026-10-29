import { Journey, type Today } from "@/app/components/Journey";
import { getMacro, getMarket } from "@/lib/api";
import { formatBRL, formatNumber, formatPercent, formatUpdated } from "@/lib/format";

// Os números de "Como está hoje" mudam durante o dia: renderiza a cada acesso.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [macro, market] = await Promise.all([getMacro(), getMarket()]);
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

  return <Journey today={today} />;
}
