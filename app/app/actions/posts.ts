"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTx } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function createPostAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const content = (formData.get("content") ?? "").toString().trim();

  if (content.length === 0 || content.length > 500) {
    throw new Error("게시글은 1~500자여야 합니다.");
  }

  // 트랜잭션: INSERT posts + UPDATE users.post_count 를 원자적으로
  await withTx(async (tx) => {
    await tx.query(
      "INSERT INTO posts (author_id, content) VALUES ($1, $2)",
      [session.uid, content],
    );
    await tx.query(
      "UPDATE users SET post_count = post_count + 1 WHERE id = $1",
      [session.uid],
    );
  });

  revalidatePath("/");
  revalidatePath(`/u/${session.username}`);
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const postId = Number(formData.get("post_id"));
  if (!Number.isInteger(postId)) throw new Error("잘못된 요청입니다.");

  await withTx(async (tx) => {
    // 작성자 본인만 삭제 가능. 카운터도 함께 보정.
    const r = await tx.query<{ id: number }>(
      "DELETE FROM posts WHERE id = $1 AND author_id = $2 RETURNING id",
      [postId, session.uid],
    );
    if (r.rowCount === 0) throw new Error("삭제 권한이 없습니다.");
    await tx.query(
      "UPDATE users SET post_count = GREATEST(post_count - 1, 0) WHERE id = $1",
      [session.uid],
    );
  });

  revalidatePath("/");
  revalidatePath(`/u/${session.username}`);
  redirect("/");
}
