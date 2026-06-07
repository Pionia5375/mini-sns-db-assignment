"use server";

import { revalidatePath } from "next/cache";
import { withTx } from "@/lib/db";
import { requireSession } from "@/lib/session";

/**
 * 팔로우 토글.
 *
 * 학습 포인트:
 *   팔로우 1회로 4개 변화가 일어난다.
 *     1) follows 테이블 INSERT/DELETE
 *     2) follower.following_count ±1
 *     3) followee.follower_count  ±1
 *   세 작업이 모두 성공하거나 모두 실패해야 한다 → 트랜잭션.
 *
 * 데드락 방지를 위해 두 users 행을 항상 같은 순서(id 오름차순)로 잠근다.
 */
export async function toggleFollowAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const followeeId = Number(formData.get("followee_id"));

  if (!Number.isInteger(followeeId) || followeeId <= 0) {
    throw new Error("잘못된 사용자 ID");
  }
  if (followeeId === session.uid) {
    throw new Error("자기 자신은 팔로우할 수 없습니다.");
  }

  await withTx(async (tx) => {
    // 데드락 방지: 항상 id 작은 쪽 → 큰 쪽 순서로 잠근다.
    const [first, second] = [session.uid, followeeId].sort((a, b) => a - b);
    await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [first]);
    await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [second]);

    const existing = await tx.query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [session.uid, followeeId],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      // 언팔로우
      await tx.query(
        "DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2",
        [session.uid, followeeId],
      );
      await tx.query(
        "UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1",
        [session.uid],
      );
      await tx.query(
        "UPDATE users SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = $1",
        [followeeId],
      );
    } else {
      // 팔로우
      const ins = await tx.query(
        `INSERT INTO follows (follower_id, followee_id)
              VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [session.uid, followeeId],
      );
      if (ins.rowCount && ins.rowCount > 0) {
        await tx.query(
          "UPDATE users SET following_count = following_count + 1 WHERE id = $1",
          [session.uid],
        );
        await tx.query(
          "UPDATE users SET follower_count  = follower_count  + 1 WHERE id = $1",
          [followeeId],
        );
      }
    }
  });

  revalidatePath(`/u`, "layout");
}
