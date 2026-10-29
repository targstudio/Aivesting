/** Contas do simulador de renda fixa. Taxas em % ao ano; prazo em meses. */

/** Tabela regressiva do IR em renda fixa, pelo número de dias corridos. */
export function incomeTaxRate(days: number) {
  return days <= 180 ? 0.225 : days <= 360 ? 0.2 : days <= 720 ? 0.175 : 0.15;
}

export type FixedOption = {
  key: string;
  label: string;
  detail: string;
  annualGross: number; // % a.a. antes de IR e custos
  taxFree: boolean;
  custody: number; // % a.a. de custódia (B3 cobra 0,20% no Tesouro)
  custodyFreeUpTo?: number; // Tesouro Selic: isento de custódia até R$ 10 mil
  note?: string;
};

export type FixedResult = FixedOption & {
  gross: number;
  tax: number;
  custodyCost: number;
  net: number;
  netGain: number;
  netAnnual: number;
  real: number;
};

export function simulateFixed(o: FixedOption, amount: number, months: number, inflation: number): FixedResult {
  const years = months / 12;
  const grossValue = amount * (1 + o.annualGross / 100) ** years;
  // Custódia cobrada sobre o saldo médio do período (aproximação), só na parte acima da isenção.
  const avg = (amount + grossValue) / 2;
  const charged = Math.max(0, avg - (o.custodyFreeUpTo ?? 0));
  const custodyCost = charged * (o.custody / 100) * years;
  const gain = Math.max(0, grossValue - custodyCost - amount);
  const tax = o.taxFree ? 0 : gain * incomeTaxRate(Math.round(months * 30.4));
  const net = grossValue - custodyCost - tax;
  return {
    ...o,
    gross: grossValue,
    tax,
    custodyCost,
    net,
    netGain: net - amount,
    netAnnual: years > 0 ? ((net / amount) ** (1 / years) - 1) * 100 : 0,
    real: net / (1 + inflation / 100) ** years,
  };
}

/** Poupança: 0,5% ao mês (+TR) com Selic acima de 8,5%; senão 70% da Selic. A TR fica de fora. */
export function savingsAnnual(selic: number) {
  return selic > 8.5 ? (1.005 ** 12 - 1) * 100 : selic * 0.7;
}
