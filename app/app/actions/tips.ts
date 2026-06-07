"use server";

import { revalidatePath } from "next/cache";
import { withTx } from "@/lib/db";
import { requireSession } from "@/lib/session";

/**
 * 포인트 후원 (Tip).
 *
 * 트랜잭션의 정수를 보여주는 데모.
 *   1) 보내는 사람 행을 SELECT ... FOR UPDATE 로 잠궈서 잔액을 읽는다
 *      (다른 동시 트랜잭션이 같은 사람 잔액을 만지지 못하게)
 *   2) 잔액 >= amount 인지 검사
 *   3) 보내는 사람 -amount, 받는 사람 +amount, 게시글 tip_total +amount
 *   4) credit_ledger 에 원장 기록 (append-only)
 *   하나라도 실패하면 전부 ROLLBACK → 원자성(A), 일관성(C)
 *   FOR UPDATE 로 동시 이체에서 잔액이 음수가 되지 않도록 격리(I)
 *   COMMIT 후 영속성(D)
 */
export async function sendTipAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const postId = Number(formData.get("post_id"));
  const amount = Number(formData.get("amount"));

  if (!Number.isInteger(postId) || postId <= 0) {
    throw new Error("잘못된 게시글 ID");
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1000) {
    throw new Error("후원 금액은 1~1000 사이의 정수여야 합니다.");
  }

  await withTx(async (tx) => {
    // 게시글 + 작성자 조회
    const post = await tx.query<{ id: number; author_id: number }>(
      "SELECT id, author_id FROM posts WHERE id = $1",
      [postId],
    );
    if (post.rowCount === 0) throw new Error("게시글이 존재하지 않습니다.");
    const authorId = post.rows[0].author_id;

    if (authorId === session.uid) {
      throw new Error("자신의 글에는 후원할 수 없습니다.");
    }

    // 데드락 방지 위해 id 오름차순 잠금
    const [first, second] = [session.uid, authorId].sort((a, b) => a - b);
    await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [first]);
    await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [second]);

    // 잔액 확인
    const sender = await tx.query<{ credit_balance: number }>(
      "SELECT credit_balance FROM users WHERE id = $1",
      [session.uid],
    );
    if (sender.rows[0].credit_balance < amount) {
      throw new Error(
        `잔액 부족: 보유 ${sender.rows[0].credit_balance} P, 필요 ${amount} P`,
      );
    }

    // 잔액 이동
    await tx.query(
      "UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2",
      [amount, session.uid],
    );
    await tx.query(
      "UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2",
      [amount, authorId],
    );

    // 게시글 누적 후원금
    await tx.query(
      "UPDATE posts SET tip_total = tip_total + $1 WHERE id = $2",
      [amount, postId],
    );

    // 원장 기록 (append-only audit log)
    await tx.query(
      `INSERT INTO credit_ledger (from_user_id, to_user_id, post_id, amount)
            VALUES ($1, $2, $3, $4)`,
      [session.uid, authorId, postId, amount],
    );
  });

  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  revalidatePath(`/u`, "layout");
}
