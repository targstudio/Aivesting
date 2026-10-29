"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, LogIn, MailCheck, MessageSquare, ShieldCheck, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { consumeLoginRedirect, loadSession, sendLoginLink, signOut } from "@/lib/account";
import { Logo } from "../components/Logo";

const SLIDES = [
  { tag: "Ranking com IA", title: "Os ativos com mais chance de superar o índice, a cada 5 minutos" },
  { tag: "Macro", title: "Selic, inflação e dólar explicados no impacto da sua carteira" },
  { tag: "Assistente", title: "Pergunte à Claude sobre qualquer ação ou FII da B3" },
];

// Tela de entrada: login sem senha, por link mágico no e-mail (Supabase Auth). Usar sem conta continua possível.
export default function LoginPage() {
  const [slide, setSlide] = useState(0);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "in">("idle");
  const [error, setError] = useState("");
  const [signedAs, setSignedAs] = useState<string | null>(null);

  useEffect(() => {
    const back = consumeLoginRedirect();
    if (back && !back.ok) setError(back.error ?? "Não foi possível entrar.");
    const s = loadSession();
    if (s) {
      setSignedAs(s.email);
      setState("in");
      // Acabou de voltar do e-mail: segue para o app, que traz os dados da conta.
      if (back?.ok) window.location.replace("/");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      await sendLoginLink(email.trim());
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o link.");
      setState("idle");
    }
  }
  const current = SLIDES[slide];
  const go = (d: number) => setSlide((slide + d + SLIDES.length) % SLIDES.length);

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="relative hidden w-[45%] overflow-hidden bg-[#111] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3a3020_0%,transparent_55%),radial-gradient(circle_at_80%_70%,#1f2a3a_0%,transparent_50%)]" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <span className="mb-5 w-fit rounded-lg bg-black px-3 py-1.5 text-sm font-semibold">{current.tag}</span>
          <h2 className="max-w-xl text-4xl font-bold leading-tight tracking-tight">{current.title}</h2>
          <div className="mt-8 flex items-center gap-4">
            <button onClick={() => go(-1)} aria-label="Anterior">
              <ChevronLeft />
            </button>
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full bg-white transition-all ${i === slide ? "w-6" : "w-1.5 opacity-60"}`} />
            ))}
            <button onClick={() => go(1)} aria-label="Próximo">
              <ChevronRight />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col px-4 py-6 md:px-12 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex gap-1 rounded-full bg-track p-1 text-sm">
            <span className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-on-primary">
              <User size={18} /> Entrar
            </span>
            <span className="flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold text-muted">
              <UserPlus size={18} /> Criar conta
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 px-3 text-sm font-semibold text-accent-text sm:flex">
              <ShieldCheck size={18} /> Segurança
            </span>
            <span className="flex items-center gap-2 rounded-full bg-accent-bg px-5 py-2.5 text-sm font-semibold text-accent-text">
              <MessageSquare size={18} /> Ajuda
            </span>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-1 flex-col justify-center rounded-card border border-border px-6 py-10 md:px-16"
        >
          <Logo size={72} />
          <p className="mt-10 text-muted">Boas-vindas ao AI.vesting!</p>
          {state === "in" ? (
            <>
              <h1 className="mt-2 max-w-xl text-3xl font-bold leading-tight tracking-tight md:text-[40px]">Você já está conectado</h1>
              <p className="mt-4 flex items-center gap-2 text-muted">
                <CheckCircle2 size={18} className="text-positive" /> {signedAs ?? "Conta ativa"}: carteira, alertas e perfil ficam salvos na sua conta.
              </p>
              <Link href="/" className="mt-8 rounded-full bg-primary py-4 text-center font-semibold text-on-primary">
                Ir para o app
              </Link>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  setState("idle");
                  setSignedAs(null);
                }}
                className="mt-3 rounded-full bg-accent-bg py-4 text-center font-semibold text-accent-text"
              >
                Sair da conta
              </button>
            </>
          ) : state === "sent" ? (
            <>
              <h1 className="mt-2 max-w-xl text-3xl font-bold leading-tight tracking-tight md:text-[40px]">Confira seu e-mail</h1>
              <p className="mt-4 flex items-start gap-2 text-muted">
                <MailCheck size={18} className="mt-0.5 shrink-0 text-accent-text" />
                Enviamos um link de acesso para {email}. Abra o e-mail neste aparelho e toque no link para entrar. Não precisa de senha.
              </p>
              <button type="button" onClick={() => setState("idle")} className="mt-8 w-fit text-sm font-semibold text-accent-text hover:underline">
                Usar outro e-mail
              </button>
            </>
          ) : (
            <>
              <h1 className="mt-2 max-w-xl text-3xl font-bold leading-tight tracking-tight md:text-[40px]">
                Informe seu e-mail para continuar
              </h1>
              <p className="mt-3 max-w-xl text-muted">
                Mandamos um link de acesso, sem senha. Com a conta, sua carteira, alertas e perfil ficam iguais no celular e no
                computador.
              </p>
              <label className="mt-8 flex items-center gap-3 rounded-2xl border border-muted/50 px-4 py-3.5 focus-within:border-primary">
                <User size={18} className="text-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail"
                  className="w-full bg-transparent outline-none placeholder:text-muted"
                />
              </label>
              {error && <p className="mt-3 text-sm text-negative">{error}</p>}
              <button
                type="submit"
                disabled={!email || state === "sending"}
                className="mt-8 flex items-center justify-center gap-2 rounded-full bg-primary py-4 font-semibold text-on-primary transition-colors disabled:bg-track disabled:text-muted"
              >
                <LogIn size={18} /> {state === "sending" ? "Enviando..." : "Receber link de acesso"}
              </button>
              <Link href="/" className="mt-3 rounded-full bg-accent-bg py-4 text-center font-semibold text-accent-text">
                Explorar sem conta
              </Link>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
