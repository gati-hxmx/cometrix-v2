import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "../../auth/current";
import { isLoginConfigured, safeNext } from "../../auth/google";
import { Header } from "../../components/Header";

export const metadata: Metadata = { title: "ログイン | Cometrix" };

const ERRORS: Record<string, string> = {
  failed: "ログインできませんでした。もう一度お試しください。",
  unconfigured: "ログインは準備中です。",
};

/** ログインの画面（#7、docs/specs/7-google-login.md）。［Google でログイン］はリンクなので JavaScript がなくても使える */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await currentUser()) redirect(next);
  const configured = isLoginConfigured();
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  return (
    <>
      <Header />
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px" }}>
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>ログイン</h1>
          {error && configured && (
            <p role="alert" style={{ margin: "0 0 12px", color: "var(--danger)", fontWeight: 700 }}>
              ⚠ {error}
            </p>
          )}
          {configured ? (
            <>
              <p style={{ margin: "0 0 20px", color: "var(--muted)" }}>
                ログインすると、分析した配信を履歴に残せます（履歴は今後追加します）。ログインしなくても分析は使えます。
              </p>
              <a
                href={`/api/auth/google?next=${encodeURIComponent(next)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 48,
                  padding: "0 18px",
                  borderRadius: "var(--radius)",
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Google でログイン
              </a>
            </>
          ) : (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              ログインは準備中です。分析はログインしなくても使えます。
            </p>
          )}
        </section>
      </main>
    </>
  );
}
