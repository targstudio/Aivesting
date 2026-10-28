"use client";

import { CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useApp, type Prefs } from "@/app/components/AppProvider";
import { Card } from "@/app/components/ui";
import { apiFetch, type Health, type Level } from "@/lib/api";

const LEVELS: { value: Level; label: string; desc: string }[] = [
  { value: "iniciante", label: "Simples", desc: "Sem jargão, explica cada termo." },
  { value: "intermediario", label: "Intermediário", desc: "Usa os termos comuns do mercado." },
  { value: "avancado", label: "Avançado", desc: "Técnico e direto, com os fatores do modelo." },
];

function Pills<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full bg-track p-1 text-sm">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-2 font-semibold transition-colors ${
            o.value === value ? "bg-surface-2 text-text ring-1 ring-border" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
      <div className="max-w-md">
        <div className="font-semibold">{title}</div>
        {desc && <div className="text-sm text-muted">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 rounded-full transition-colors ${on ? "bg-chart-3" : "bg-track"}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-surface shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-positive" /> : <CircleAlert size={20} className="mt-0.5 shrink-0 text-accent-text" />}
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-muted">{detail}</div>
      </div>
    </li>
  );
}

export function Settings() {
  const { ready, prefs, setPrefs, alerts, resetAll } = useApp();
  const [health, setHealth] = useState<Health | null | "error">(null);
  const [name, setName] = useState("");
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    apiFetch<Health>("/health").then(setHealth).catch(() => setHealth("error"));
    setNotifState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (ready) setName(prefs.name);
  }, [ready, prefs.name]);

  const set = (p: Partial<Prefs>) => setPrefs(p);

  async function toggleNotifications(on: boolean) {
    if (!on) return set({ notifications: false });
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifState(perm);
    set({ notifications: perm === "granted" });
  }

  if (!ready) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <Sparkles size={20} /> Inteligência artificial
          </h2>
          <p className="text-sm text-muted">
            A Claude está em todas as telas: lê os dados de cada página, responde no botão &quot;Pergunte à IA&quot; e explica os
            alertas. Ela não recomenda compra ou venda.
          </p>
          <div className="divide-y divide-border">
            <Row title="Nível da linguagem" desc={LEVELS.find((l) => l.value === prefs.level)?.desc}>
              <Pills value={prefs.level} options={LEVELS} onChange={(level) => set({ level })} />
            </Row>
            <Row
              title="Leitura automática em cada tela"
              desc="Na primeira visita a cada tela, gera o resumo da IA sozinho. Depois a última leitura fica guardada e só muda quando você clica em Atualizar. Desligado, aparece um botão para gerar."
            >
              <Toggle label="Leitura automática" on={prefs.aiAuto} onChange={(aiAuto) => set({ aiAuto })} />
            </Row>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold">Perfil</h2>
          <p className="text-sm text-muted">Salvo só neste navegador até o login ser ativado.</p>
          <div className="divide-y divide-border">
            <Row title="Como quer ser chamado">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => set({ name: name.trim() })}
                onKeyDown={(e) => e.key === "Enter" && set({ name: name.trim() })}
                maxLength={40}
                placeholder="Seu nome"
                className="w-full rounded-full border border-border bg-background px-5 py-2.5 outline-none focus:border-primary md:w-64"
              />
            </Row>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold">Alertas</h2>
          <p className="text-sm text-muted">
            {alerts.length} alerta(s) salvo(s). São conferidos enquanto o app está aberto em alguma aba.
          </p>
          <div className="divide-y divide-border">
            <Row title="Conferir a cada">
              <Pills
                value={prefs.alertMinutes}
                options={[1, 5, 15].map((m) => ({ value: m, label: `${m} min` }))}
                onChange={(alertMinutes) => set({ alertMinutes })}
              />
            </Row>
            <Row
              title="Notificação do navegador"
              desc={
                notifState === "denied"
                  ? "Bloqueada no navegador. Libere nas permissões do site para ativar."
                  : notifState === "unsupported"
                    ? "Este navegador não suporta notificações."
                    : "Avisa mesmo com o app em outra aba."
              }
            >
              <Toggle
                label="Notificações"
                on={prefs.notifications && notifState === "granted"}
                onChange={toggleNotifications}
              />
            </Row>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold">Dados deste navegador</h2>
          <Row title="Apagar preferências e alertas" desc="Volta tudo ao padrão. Não dá para desfazer.">
            <button
              onClick={() => confirm("Apagar preferências e alertas deste navegador?") && resetAll()}
              className="rounded-full border border-negative px-5 py-2.5 text-sm font-semibold text-negative"
            >
              Apagar
            </button>
          </Row>
        </Card>
      </div>

      <Card className="h-fit">
        <h2 className="mb-2 text-lg font-bold">Estado dos serviços</h2>
        {health === null && <p className="text-sm text-muted">Consultando a API...</p>}
        {health === "error" && <p className="text-sm text-negative">A API não respondeu. Ela pode estar iniciando (até 1 minuto no plano gratuito).</p>}
        {health && health !== "error" && (
          <ul className="divide-y divide-border">
            <Status
              ok={health.ai}
              label="IA (Claude)"
              detail={health.ai ? `Ativa · até ${health.ai_requests_per_hour} perguntas por hora por pessoa` : "Falta ANTHROPIC_API_KEY na API"}
            />
            <Status
              ok
              label="Cotações"
              detail={`${health.provider === "yahoo" ? "Yahoo Finance (teste, uso não comercial)" : health.provider === "demo" ? "Dados de demonstração" : health.provider} · ${health.realtime ? "tempo real" : "com atraso"}`}
            />
            <Status
              ok
              label="Ranking"
              detail={`Recalculado a cada ${health.ranking_interval_minutes} min no pregão · pregão ${health.market_open ? "aberto" : "fechado"}`}
            />
            <Status
              ok={health.advisor}
              label="Assessor IA"
              detail={health.advisor ? "Ligado para todos" : "Desligado (ADVISOR_MODE=off)"}
            />
            <Status ok={health.longterm} label="Horizontes de 1 a 10 anos" detail={health.longterm ? "Modelo calibrado" : "Sem calibração"} />
            <Status
              ok={health.database}
              label="Banco de dados"
              detail={health.database ? "Supabase: histórico de rankings sendo gravado" : "Não configurado"}
            />
          </ul>
        )}
      </Card>
    </div>
  );
}
