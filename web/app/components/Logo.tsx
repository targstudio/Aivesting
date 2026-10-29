/**
 * Marca StockTower. `light` é o símbolo branco para o menu preto; `dark` é o símbolo preto para fundos claros.
 * O símbolo tem proporção 282 x 420; `size` é a altura.
 */
export function Logo({ size = 40, variant = "dark" }: { size?: number; variant?: "dark" | "light" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={variant === "light" ? "/marca/simbolo-branco.png" : "/marca/simbolo.png"}
      alt="StockTower"
      width={Math.round((size * 282) / 420)}
      height={size}
      className="shrink-0"
    />
  );
}

/** Nome escrito como no logotipo: caixa alta, letras espaçadas. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-bold uppercase tracking-[0.18em] ${className}`}>StockTower</span>;
}
