import { Fragment, type ReactNode } from "react";

/**
 * Renderiza o markdown simples que a IA escreve (negrito, itálico, listas, títulos, links) sem mostrar os
 * asteriscos. Monta elementos React, sem innerHTML, então o texto da IA nunca vira HTML.
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`space-y-3 ${className}`}>{blocks(text)}</div>;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function parse(text: string): Block[] {
  const out: Block[] = [];
  const last = () => out[out.length - 1];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    const h = line.match(HEADING);
    const b = line.match(BULLET);
    const n = line.match(NUMBER);
    if (h) out.push({ kind: "h", text: h[1] });
    else if (b || n) {
      const kind = b ? "ul" : "ol";
      const prev = last();
      const item = (b ?? n)![1];
      if (prev?.kind === kind) prev.items.push(item);
      else out.push({ kind, items: [item] });
    } else {
      const prev = last();
      // Linha que continua um item de lista (sem marcador) entra no item anterior.
      if ((prev?.kind === "ul" || prev?.kind === "ol") && /^\s{2,}/.test(raw)) prev.items[prev.items.length - 1] += ` ${line.trim()}`;
      else if (prev?.kind === "p" && prev.lines.length) prev.lines.push(line.trim());
      else out.push({ kind: "p", lines: [line.trim()] });
    }
  }
  return out.filter((b) => b.kind !== "p" || b.lines.length);
}

function blocks(text: string): ReactNode[] {
  return parse(text).map((b, i) => {
    if (b.kind === "h") return <p key={i} className="font-bold">{inline(b.text)}</p>;
    if (b.kind === "p")
      return (
        <p key={i}>
          {b.lines.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>
      );
    const List = b.kind === "ul" ? "ul" : "ol";
    return (
      <List key={i} className={`space-y-1.5 pl-5 ${b.kind === "ul" ? "list-disc marker:text-chart-1" : "list-decimal marker:text-muted"}`}>
        {b.items.map((it, j) => (
          <li key={j} className="pl-1">
            {inline(it)}
          </li>
        ))}
      </List>
    );
  });
}

// Negrito (**x** ou __x__), itálico (*x*), código (`x`) e links [x](https://...).
const INLINE = /(\*\*|__)(.+?)\1|\*(?!\s)([^*]+?)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > pos) out.push(text.slice(pos, m.index));
    const k = out.length;
    if (m[2] !== undefined) out.push(<strong key={k} className="font-semibold text-text">{inline(m[2])}</strong>);
    else if (m[3] !== undefined) out.push(<em key={k}>{m[3]}</em>);
    else if (m[4] !== undefined) out.push(<code key={k} className="rounded bg-track px-1 py-0.5 text-[0.9em]">{m[4]}</code>);
    else
      out.push(
        <a key={k} href={m[6]} target="_blank" rel="noreferrer" className="text-chart-2 underline">
          {m[5]}
        </a>,
      );
    pos = m.index! + m[0].length;
  }
  if (pos < text.length) out.push(text.slice(pos));
  // Asteriscos que sobraram sem par (ex.: resposta cortada) não aparecem.
  return out.map((n) => (typeof n === "string" ? n.replace(/\*\*/g, "") : n));
}
