"use client";

import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, KeyRound, LogIn, Mail, MailCheck, User, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  chooseExplore,
  consumeLoginRedirect,
  getProviders,
  loadSession,
  sendLoginLink,
  sendPasswordReset,
  setNewPassword,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUp,
  type Providers,
} from "@/lib/account";
import { Slides } from "./Slides";

type Mode = "entrar" | "criar";
type View = "form" | "forgot" | "sent" | "new-password" | "in";

/** Para onde voltar depois de entrar: só caminhos do próprio site. */
function nextPath(): string {
  const v = new URLSearchParams(window.location.search).get("volta");
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/entrar") ? v : "/";
}

// Primeira tela de quem ainda não entrou: vitrine do app e login com Google, e-mail e senha ou link no e-mail.
// Usar sem conta continua possível.
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("entrar");
  const [view, setView] = useState<View>("form");
  const [sentText, setSentText] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedAs, setSignedAs] = useState<string | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);

  useEffect(() => {
    getProviders()
      .then(setProviders)
      .catch(() => setProviders({ available: true, email: true, google: false }));
    const back = consumeLoginRedirect();
    if (back && !back.ok) setError(back.error ?? "Não foi possível entrar.");
    const s = loadSession();
    if (back?.recovery && s) {
      setView("new-password");
      return;
    }
    if (s) {
      setSignedAs(s.email);
      setView("in");
      // Acabou de voltar do Google ou do e-mail: segue para o app, que traz os dados da conta.
      if (back?.ok) window.location.replace(nextPath());
    }
  }, []);

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const showSent = (text: string) => {
    setSentText(text);
    setView("sent");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (view === "forgot")
      return run(async () => {
        await sendPasswordReset(mail);
        showSent(`Enviamos um e-mail para ${mail} com o link para criar uma senha nova.`);
      });
    if (view === "new-password")
      return run(async () => {
        await setNewPassword(password);
        window.location.replace(nextPath());
      });
    if (mode === "entrar")
      return run(async () => {
        await signInWithPassword(mail, password);
        window.location.replace(nextPath());
      });
    return run(async () => {
      if (await signUp(mail, password)) window.location.replace(nextPath());
      else showSent(`Conta criada! Enviamos um e-mail para ${mail}. Toque no link dele para confirmar e entrar.`);
    });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setView("form");
    setError("");
  };
  const explore = () => {
    chooseExplore();
    window.location.assign(nextPath());
  };
  const loginOff = providers && !providers.available;

  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row">
      <Slides />

      <main className="flex flex-1 flex-col px-4 py-6 md:px-12 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex gap-1 rounded-full bg-track p-1 text-sm" role="tablist">
            {(
              [
                ["entrar", "Entrar", User],
                ["criar", "Criar conta", UserPlus],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold transition-colors ${
                  mode === m ? "bg-primary text-on-primary" : "text-muted hover:text-text"
                }`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
          <button onClick={explore} className="text-sm font-semibold text-accent-text hover:underline">
            Explorar sem conta
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-1 flex-col justify-center rounded-card border border-border px-6 py-10 md:px-16">
          <div className="mx-auto w-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo.png" alt="StockTower" width={146} height={84} />
            {view === "in" ? (
              <>
                <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight">Você já está conectado</h1>
                <p className="mt-4 flex items-center gap-2 text-muted">
                  <CheckCircle2 size={18} className="shrink-0 text-positive" /> {signedAs ?? "Conta ativa"}: carteira, alertas e
                  perfil ficam salvos na sua conta.
                </p>
                <a href="/" className="mt-8 block rounded-full bg-primary py-4 text-center font-semibold text-on-primary">
                  Ir para o app
                </a>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    setView("form");
                    setSignedAs(null);
                  }}
                  className="mt-3 w-full rounded-full bg-accent-bg py-4 text-center font-semibold text-accent-text"
                >
                  Sair da conta
                </button>
              </>
            ) : view === "sent" ? (
              <>
                <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight">Confira seu e-mail</h1>
                <p className="mt-4 flex items-start gap-2 text-muted">
                  <MailCheck size={18} className="mt-0.5 shrink-0 text-accent-text" /> {sentText} Abra neste aparelho; se não
                  achar, olhe o spam.
                </p>
                <button type="button" onClick={() => setView("form")} className="mt-8 text-sm font-semibold text-accent-text hover:underline">
                  Voltar
                </button>
              </>
            ) : view === "new-password" ? (
              <>
                <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight">Crie uma senha nova</h1>
                <p className="mt-3 text-muted">Use pelo menos 8 caracteres.</p>
                <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                {error && <p className="mt-3 text-sm text-negative">{error}</p>}
                <Submit busy={busy} disabled={password.length < 8} icon={<KeyRound size={18} />} label="Salvar senha e entrar" />
              </>
            ) : (
              <>
                <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight">
                  {view === "forgot" ? "Esqueceu a senha?" : mode === "entrar" ? "Que bom te ver de novo" : "Crie sua conta grátis"}
                </h1>
                <p className="mt-3 text-muted">
                  {view === "forgot"
                    ? "Informe seu e-mail e mandamos um link para você criar uma senha nova."
                    : "Com a conta, sua carteira, alertas e perfil ficam iguais no celular e no computador."}
                </p>

                {loginOff ? (
                  <p className="mt-8 rounded-2xl bg-accent-bg px-4 py-3 text-sm text-accent-text">
                    O login ainda está sendo ativado. Enquanto isso, explore o app sem conta: tudo fica salvo neste navegador.
                  </p>
                ) : (
                  <>
                    {view === "form" && providers?.google && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(signInWithGoogle)}
                          className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-border bg-surface py-3.5 font-semibold transition-colors hover:bg-surface-2"
                        >
                          <GoogleIcon /> {mode === "entrar" ? "Entrar com Google" : "Criar conta com Google"}
                        </button>
                        <div className="my-6 flex items-center gap-3 text-xs text-muted">
                          <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
                        </div>
                      </>
                    )}
                    <label
                      className={`${view === "form" && providers?.google ? "" : "mt-8"} flex items-center gap-3 rounded-2xl border border-muted/50 px-4 py-3.5 focus-within:border-primary`}
                    >
                      <Mail size={18} className="text-muted" />
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="E-mail"
                        className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted"
                      />
                    </label>
                    {view === "form" && (
                      <PasswordField
                        value={password}
                        onChange={setPassword}
                        show={showPassword}
                        onToggle={() => setShowPassword(!showPassword)}
                        placeholder={mode === "criar" ? "Senha (mínimo 8 caracteres)" : "Senha"}
                        autoComplete={mode === "criar" ? "new-password" : "current-password"}
                      />
                    )}
                    {error && <p className="mt-3 text-sm text-negative">{error}</p>}
                    {view === "forgot" ? (
                      <Submit busy={busy} disabled={!email} icon={<MailCheck size={18} />} label="Enviar link" />
                    ) : (
                      <Submit
                        busy={busy}
                        disabled={!email || password.length < (mode === "criar" ? 8 : 1)}
                        icon={mode === "entrar" ? <LogIn size={18} /> : <UserPlus size={18} />}
                        label={mode === "entrar" ? "Entrar" : "Criar conta"}
                      />
                    )}
                    <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm font-semibold text-accent-text">
                      {view === "forgot" ? (
                        <button type="button" onClick={() => setView("form")} className="hover:underline">
                          Voltar
                        </button>
                      ) : (
                        <>
                          {mode === "entrar" && (
                            <button type="button" onClick={() => setView("forgot")} className="hover:underline">
                              Esqueci a senha
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!email || busy}
                            title={email ? undefined : "Digite o e-mail primeiro"}
                            onClick={() =>
                              run(async () => {
                                await sendLoginLink(email.trim());
                                showSent(`Enviamos um link de acesso para ${email.trim()}. Toque nele para entrar, sem senha.`);
                              })
                            }
                            className="hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            Receber link sem senha
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={explore}
                  className="mt-8 w-full rounded-full bg-accent-bg py-4 text-center font-semibold text-accent-text"
                >
                  Explorar sem conta
                </button>
              </>
            )}
            <p className="mt-6 text-center text-xs text-muted">
              Ao continuar, você concorda com os{" "}
              <Link href="/termos" className="underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

function PasswordField(props: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="mt-3 flex items-center gap-3 rounded-2xl border border-muted/50 px-4 py-3.5 focus-within:border-primary">
      <KeyRound size={18} className="text-muted" />
      <input
        type={props.show ? "text" : "password"}
        required
        autoComplete={props.autoComplete ?? "new-password"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder ?? "Senha nova"}
        className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted"
      />
      <button type="button" onClick={props.onToggle} aria-label={props.show ? "Esconder senha" : "Mostrar senha"} className="text-muted">
        {props.show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </label>
  );
}

function Submit({ busy, disabled, icon, label }: { busy: boolean; disabled: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-semibold text-on-primary transition-colors disabled:bg-track disabled:text-muted"
    >
      {icon} {busy ? "Aguarde..." : label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
