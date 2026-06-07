"use server";

import { revalidatePath } from "next/cache";
import { withTx } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function addCommentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const postId = Number(formData.get("post_id"));
  const content = (formData.get("content") ?? "").toString().trim();

  if (!Number.isInteger(postId) || postId <= 0) {
    throw new Error("잘못된 게시글 ID");
  }
  if (content.length === 0 || content.length > 300) {
    throw new Error("댓글은 1~300자여야 합니다.");
  }

  await withTx(async (tx) => {
    // 존재하지 않는 게시글에 댓글 다는 것 막기
    const exists = await tx.query(
      "SELECT 1 FROM posts WHERE id = $1",
      [postId],
    );
    if (exists.rowCount === 0) throw new Error("게시글이 존재하지 않습니다.");

    await tx.query(
      `INSERT INTO comments (post_id, author_id, content)
            VALUES ($1, $2, $3)`,
      [postId, session.uid, content],
    );
    await tx.query(
      "UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1",
      [postId],
    );
  });

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/");
}
