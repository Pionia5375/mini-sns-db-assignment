"use server";

import { revalidatePath } from "next/cache";
import { withTx } from "@/lib/db";
import { requireSession } from "@/lib/session";

/**
 * 좋아요 토글.
 *
 * 학습 포인트:
 *  - INSERT/DELETE likes + UPDATE posts.like_count 가 분리되면
 *    크래시 시 카운터가 어긋날 수 있다. 트랜잭션으로 묶는다.
 *  - 동시에 두 번 누르는 이중 클릭은 PK(user_id, post_id) UNIQUE 가 막아주고,
 *    충돌은 ON CONFLICT 로 흡수해서 멱등(idempotent)으로 처리한다.
 */
export async function toggleLikeAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const postId = Number(formData.get("post_id"));
  if (!Number.isInteger(postId) || postId <= 0) {
    throw new Error("잘못된 게시글 ID");
  }

  await withTx(async (tx) => {
    // 이미 좋아요 되어있으면 해제, 아니면 추가.
    const existing = await tx.query<{ user_id: number }>(
      "SELECT user_id FROM likes WHERE user_id = $1 AND post_id = $2",
      [session.uid, postId],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await tx.query(
        "DELETE FROM likes WHERE user_id = $1 AND post_id = $2",
        [session.uid, postId],
      );
      await tx.query(
        "UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1",
        [postId],
      );
    } else {
      // ON CONFLICT 로 동시성 충돌(이중 클릭) 흡수
      const ins = await tx.query(
        `INSERT INTO likes (user_id, post_id)
              VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [session.uid, postId],
      );
      // 진짜로 새로 추가된 경우에만 카운터 +1
      if (ins.rowCount && ins.rowCount > 0) {
        await tx.query(
          "UPDATE posts SET like_count = like_count + 1 WHERE id = $1",
          [postId],
        );
      }
    }
  });

  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
}
