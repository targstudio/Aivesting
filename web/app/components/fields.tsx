/** "1.234,56" ou "R$ 1234" → 1234.56. */
export function parseMoney(v: string) {
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Campo de valor em reais, no estilo dos formulários do app. */
export function MoneyField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold">
      {label}
      <span className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-primary">
        <span className="text-muted">R$</span>
        <input
          inputMode="decimal"
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          className="w-full bg-transparent font-normal outline-none"
        />
      </span>
    </label>
  );
}
