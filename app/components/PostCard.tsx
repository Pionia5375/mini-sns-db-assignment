import Link from "next/link";
import { toggleLikeAction } from "@/app/actions/likes";
import { sendTipAction } from "@/app/actions/tips";
import { deletePostAction } from "@/app/actions/posts";
import type { FeedPost } from "@/lib/queries";

function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)      return `${sec}초 전`;
  if (sec < 3600)    return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400)   return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}

export function PostCard({
  post,
  viewerId,
  showDelete = false,
}: {
  post: FeedPost;
  viewerId: number | null;
  showDelete?: boolean;
}) {
  const isMine = viewerId === post.author_id;
  return (
    <article className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-4">
      <header className="flex items-baseline gap-2 mb-2">
        <Link
          href={`/u/${post.author_username}`}
          className="font-semibold hover:underline"
        >
          @{post.author_username}
        </Link>
        <span className="text-xs text-[var(--muted)]">{timeAgo(post.created_at)}</span>
        {showDelete && isMine && (
          <form action={deletePostAction} className="ml-auto">
            <input type="hidden" name="post_id" value={post.id} />
            <button
              type="submit"
              className="text-xs text-[var(--muted)] hover:text-red-400 cursor-pointer"
            >
              삭제
            </button>
          </form>
        )}
      </header>

      <Link href={`/posts/${post.id}`} className="block">
        <p className="whitespace-pre-wrap mb-3">{post.content}</p>
      </Link>

      <footer className="flex items-center gap-3 text-sm text-[var(--muted)]">
        {viewerId !== null ? (
          <form action={toggleLikeAction}>
            <input type="hidden" name="post_id" value={post.id} />
            <button
              type="submit"
              className={`cursor-pointer ${post.liked_by_me ? "text-pink-400" : "hover:text-[var(--foreground)]"}`}
            >
              {post.liked_by_me ? "♥" : "♡"} {post.like_count}
            </button>
          </form>
        ) : (
          <span>♡ {post.like_count}</span>
        )}

        <Link href={`/posts/${post.id}`} className="hover:text-[var(--foreground)]">
          💬 {post.comment_count}
        </Link>

        {viewerId !== null && !isMine ? (
          <form action={sendTipAction} className="flex items-center gap-1">
            <input type="hidden" name="post_id" value={post.id} />
            <input
              type="number"
              name="amount"
              min={1}
              max={1000}
              defaultValue={10}
              className="w-16 bg-[var(--background)] border border-[var(--border)] rounded px-1 py-0.5 text-xs"
            />
            <button
              type="submit"
              className="text-[var(--accent)] hover:underline cursor-pointer"
              title="포인트 후원 (트랜잭션 데모)"
            >
              💰 후원
            </button>
            <span className="text-xs">누적 {post.tip_total} P</span>
          </form>
        ) : (
          <span>💰 {post.tip_total} P</span>
        )}
      </footer>
    </article>
  );
}
