import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/session";
import { getUserCredit } from "@/lib/queries";
import { logoutAction } from "@/app/actions/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MiniSNS — DB 과제",
  description: "PostgreSQL 기반 SNS (좋아요/팔로우/포인트 후원)",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const credit = session ? await getUserCredit(session.uid) : 0;

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <nav className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
            <Link href="/" className="font-bold text-[var(--accent)]">
              MiniSNS
            </Link>
            <Link href="/" className="text-sm hover:underline">피드</Link>
            {session && (
              <>
                <Link href={`/u/${session.username}`} className="text-sm hover:underline">
                  내 프로필
                </Link>
                <Link href="/ledger" className="text-sm hover:underline">
                  후원 내역
                </Link>
              </>
            )}
            <div className="ml-auto flex items-center gap-3 text-sm">
              {session ? (
                <>
                  <span className="text-[var(--muted)]">@{session.username}</span>
                  <span className="rounded-full bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 text-[var(--accent)] font-mono">
                    {credit} P
                  </span>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      로그아웃
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="hover:underline">로그인</Link>
                  <Link
                    href="/signup"
                    className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-1 font-semibold"
                  >
                    가입
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--muted)]">
          DB 과제 · PostgreSQL · Next.js
        </footer>
      </body>
    </html>
  );
}
