"use client";

import { useEffect, useRef, useState } from "react";

// Logotipo do ativo; se a imagem não existir ou falhar, mostra as quatro letras do ticker.
export function AssetLogo({ ticker, src, size = 40 }: { ticker: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Se a imagem falhar antes da hidratação, o onError do React não dispara: confere ao montar.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span
        style={{ ...box, fontSize: size * 0.28 }}
        className="flex shrink-0 items-center justify-center rounded-full bg-track font-bold tracking-tight"
        aria-hidden
      >
        {ticker.slice(0, 4)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={src}
      alt={`Logotipo de ${ticker}`}
      style={box}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full border border-border bg-white object-contain"
    />
  );
}
