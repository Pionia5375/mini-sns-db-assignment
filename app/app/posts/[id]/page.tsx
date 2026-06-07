import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getPostById, getComments } from "@/lib/queries";
import { PostCard } from "@/components/PostCard";
import { addCommentAction } from "@/app/actions/comments";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();

  const session = await getSession();
  const post = await getPostById(postId, session?.uid ?? null);
  if (!post) notFound();

  const comments = await getComments(postId);

  return (
    <div className="space-y-4">
      <PostCard post={post} viewerId={session?.uid ?? null} showDelete />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">댓글 {comments.length}</h2>

        {session ? (
          <form
            action={addCommentAction}
            className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-3 space-y-2"
          >
            <input type="hidden" name="post_id" value={post.id} />
            <textarea
              name="content"
              required
              maxLength={300}
              rows={2}
              placeholder="댓글 (최대 300자)"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded p-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-1 text-sm font-semibold cursor-pointer"
              >
                댓글 작성
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            <Link href="/login" className="underline text-[var(--accent)]">로그인</Link>
            {" "}하면 댓글을 달 수 있어요.
          </p>
        )}

        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-3"
            >
              <div className="flex items-baseline gap-2 text-sm">
                <Link
                  href={`/u/${c.author_username}`}
                  className="font-semibold hover:underline"
                >
                  @{c.author_username}
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {new Date(c.created_at).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap mt-1">{c.content}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
