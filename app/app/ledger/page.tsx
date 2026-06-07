import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLedgerForUser, getUserCredit } from "@/lib/queries";

export default async function LedgerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [rows, balance] = await Promise.all([
    getLedgerForUser(session.uid),
    getUserCredit(session.uid),
  ]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">후원 내역</h1>
        <p className="text-sm text-[var(--muted)]">
          포인트 후원은 트랜잭션으로 처리됩니다.
          잔액 차감, 적립, 원장 기록이 모두 성공해야만 COMMIT 됩니다.
        </p>
        <p className="text-sm">
          현재 잔액:{" "}
          <span className="text-[var(--accent)] font-mono font-bold">{balance} P</span>
        </p>
      </header>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
            <th className="py-2 pr-2">시각</th>
            <th className="py-2 pr-2">유형</th>
            <th className="py-2 pr-2">상대방</th>
            <th className="py-2 pr-2 text-right">금액</th>
            <th className="py-2 pr-2">게시글</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-[var(--muted)]">
                아직 후원 내역이 없어요. 다른 사람 글에 후원해 보세요!
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const sent = r.from_user_id === session.uid;
              return (
                <tr key={r.id} className="border-b border-[var(--border)]">
                  <td className="py-2 pr-2 text-[var(--muted)]">
                    {new Date(r.created_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-2 pr-2">
                    {sent ? (
                      <span className="text-red-300">보냄</span>
                    ) : (
                      <span className="text-[var(--accent)]">받음</span>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    @{sent ? r.to_username : r.from_username}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {sent ? `-${r.amount}` : `+${r.amount}`} P
                  </td>
                  <td className="py-2 pr-2">
                    {r.post_id ? (
                      <Link
                        href={`/posts/${r.post_id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        #{r.post_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
