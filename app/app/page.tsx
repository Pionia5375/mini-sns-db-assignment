import Link from "next/link";
import { getSession } from "@/lib/session";
import { getFeed } from "@/lib/queries";
import { createPostAction } from "@/app/actions/posts";
import { PostCard } from "@/components/PostCard";

export default async function HomePage() {
  const session = await getSession();
  const posts = await getFeed(session?.uid ?? null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">피드</h1>

      {session ? (
        <form
          action={createPostAction}
          className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-4 space-y-2"
        >
          <textarea
            name="content"
            required
            maxLength={500}
            rows={3}
            placeholder="무슨 생각을 하고 있나요? (최대 500자)"
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded p-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-1.5 text-sm font-semibold cursor-pointer"
            >
              게시
            </button>
          </div>
        </form>
      ) : (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-4 text-sm text-[var(--muted)]">
          <Link href="/login" className="underline text-[var(--accent)]">로그인</Link>
          {" "}하면 글을 쓰고 좋아요/팔로우/후원을 사용할 수 있어요.
        </div>
      )}

      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">아직 글이 없어요.</p>
        ) : (
          posts.map((p) => (
            <PostCard key={p.id} post={p} viewerId={session?.uid ?? null} />
          ))
        )}
      </div>
    </div>
  );
}
