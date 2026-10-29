import { Fragment, type ReactNode } from "react";

/**
 * Renderiza o markdown simples que a IA escreve (negrito, itálico, listas, títulos, tabelas, links) sem mostrar os
 * asteriscos. Monta elementos React, sem innerHTML, então o texto da IA nunca vira HTML.
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`space-y-3 ${className}`}>{blocks(text)}</div>;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; align: ("left" | "right")[] };

const BULLET = /^\s*[-*•+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

// Coluna de números (R$, %, mil) fica alinhada à direita para comparar de relance.
const NUMERIC = /^[-+−]?\s*(R\$\s*)?[-+−]?[\d.,]+\s*(%|mil|mi|bi|pp)?$/i;

function parse(text: string): Block[] {
  const out: Block[] = [];
  const last = () => out[out.length - 1];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    // Tabela: linha de cabeçalho, linha |---|---| e as linhas seguintes que começam e terminam com |.
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i].trimEnd())) rows.push(cells(lines[i++]));
      i--;
      const align = head.map((_, c) =>
        rows.length && rows.every((r) => !r[c] || NUMERIC.test(r[c].replace(/\*/g, "").replace(/^sobra[m]?\s+|^falta[m]?\s+/i, "")))
          ? ("right" as const)
          : ("left" as const),
      );
      out.push({ kind: "table", head, rows, align });
      continue;
    }
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
    if (b.kind === "table")
      return (
        <div key={i} className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {b.head.map((h, j) => (
                  <th
                    key={j}
                    className={`whitespace-nowrap px-2 py-2 text-xs sm:px-3 font-semibold uppercase tracking-wide text-muted ${b.align[j] === "right" ? "text-right" : "text-left"}`}
                  >
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j} className="border-b border-border/60 last:border-0 even:bg-surface-2">
                  {b.head.map((_, c) => (
                    <td
                      key={c}
                      className={`px-2 py-2 align-top sm:px-3 ${b.align[c] === "right" ? "tabular whitespace-nowrap text-right" : "text-left"} ${c === 0 ? "font-medium text-text" : ""}`}
                    >
                      {inline(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
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
