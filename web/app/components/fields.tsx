"use client";

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";

/** "1.234,56" ou "R$ 1234" → 1234.56. */
export function parseMoney(v: string) {
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formata enquanto a pessoa digita, no padrão brasileiro: "1234,5" → "1.234,5".
 * Os pontos de milhar são postos pelo app; a vírgula separa os centavos (no máximo 2 casas).
 * Um ponto digitado no fim vira vírgula, para quem usa o teclado com ponto.
 */
export function maskMoney(raw: string) {
  let s = raw.replace(/\s|R\$|US\$/g, "");
  if (!s.includes(",") && s.endsWith(".")) {
    const i = s.lastIndexOf(".");
    s = `${s.slice(0, i)},${s.slice(i + 1)}`;
  }
  s = s.replace(/[^\d,]/g, "");
  const comma = s.indexOf(",");
  let int = comma < 0 ? s : s.slice(0, comma);
  const dec = comma < 0 ? null : s.slice(comma + 1).replace(/,/g, "").slice(0, 2);
  int = int.replace(/^0+(?=\d)/, "");
  if (!int && dec != null) int = "0";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec == null ? grouped : `${grouped},${dec}`;
}

/** Ao sair do campo, completa os centavos: "1.234,5" → "1.234,50". */
export function finishMoney(v: string) {
  const m = maskMoney(v);
  if (!m) return m;
  const [int, dec = ""] = m.split(",");
  return `${int},${dec.padEnd(2, "0")}`;
}

/** Campo de número com máscara brasileira, que mantém o cursor no lugar enquanto formata. */
export function MoneyInput({
  value,
  onChange,
  cents = true,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  /** Completa os centavos ao sair do campo. */
  cents?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const shown = maskMoney(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null || caret.current == null || document.activeElement !== el) return;
    // Recoloca o cursor depois do mesmo número de dígitos/vírgula que havia antes dele.
    let seen = 0;
    let pos = 0;
    while (pos < shown.length && seen < caret.current) {
      if (/[\d,]/.test(shown[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [shown]);

  return (
    <input
      {...rest}
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
        const masked = maskMoney(before);
        caret.current = (masked.match(/[\d,]/g) ?? []).length;
        onChange(maskMoney(e.target.value));
      }}
      onBlur={(e) => {
        if (cents) onChange(finishMoney(value));
        rest.onBlur?.(e);
      }}
    />
  );
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
        <MoneyInput
          value={value}
          required={required}
          onChange={onChange}
          placeholder="0,00"
          className="w-full bg-transparent font-normal outline-none"
        />
      </span>
    </label>
  );
}
