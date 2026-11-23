import { Workspace } from "@/app/components/trading/Workspace";
import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { INTERVALS, type Interval } from "@/lib/trading";

export const metadata = { title: "Trading · Gráfico" };

export default async function TradingPage({ searchParams }: { searchParams: Promise<{ ticker?: string; intervalo?: string }> }) {
  const { ticker, intervalo } = await searchParams;
  const t = (ticker ?? "PETR4").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "PETR4";
  const i = (INTERVALS.find((x) => x.key === intervalo)?.key ?? "5m") as Interval;
  return (
    <>
      <Breadcrumbs items={[{ label: "Trading" }]} />
      <PageTitle
        title="Gráfico"
        subtitle="Candles de 1 minuto ao semanal, médias, VWAP, Bollinger, IFR e MACD, setups do último candle, pivôs e calculadora de risco."
      />
      <Workspace initialTicker={t} initialInterval={i} />
    </>
  );
}
