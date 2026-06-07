import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUserByUsername } from "@/lib/auth";
import { getPostsByAuthor, isFollowing } from "@/lib/queries";
import { PostCard } from "@/components/PostCard";
import { toggleFollowAction } from "@/app/actions/follows";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await findUserByUsername(decodeURIComponent(username));
  if (!user) notFound();

  const session = await getSession();
  const viewerId = session?.uid ?? null;
  const isMe = viewerId === user.id;
  const following = viewerId && !isMe ? await isFollowing(viewerId, user.id) : false;

  const posts = await getPostsByAuthor(user.id, viewerId);

  return (
    <div className="space-y-4">
      <header className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-full bg-[var(--accent)] text-[var(--background)] flex items-center justify-center text-2xl font-bold">
            {user.username[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">@{user.username}</h1>
            {user.bio && <p className="text-sm text-[var(--muted)] mt-1">{user.bio}</p>}
            <div className="flex gap-4 mt-3 text-sm">
              <span><b>{user.post_count}</b> 게시글</span>
              <span><b>{user.follower_count}</b> 팔로워</span>
              <span><b>{user.following_count}</b> 팔로잉</span>
              <span className="text-[var(--accent)] font-mono">
                {user.credit_balance} P
              </span>
            </div>
          </div>
          {viewerId && !isMe && (
            <form action={toggleFollowAction}>
              <input type="hidden" name="followee_id" value={user.id} />
              <button
                type="submit"
                className={
                  following
                    ? "rounded-md border border-[var(--border)] px-4 py-1.5 text-sm cursor-pointer"
                    : "rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-1.5 text-sm font-semibold cursor-pointer"
                }
              >
                {following ? "팔로잉" : "팔로우"}
              </button>
            </form>
          )}
        </div>
      </header>

      <h2 className="text-lg font-semibold">게시글</h2>
      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">아직 게시글이 없어요.</p>
        ) : (
          posts.map((p) => (
            <PostCard key={p.id} post={p} viewerId={viewerId} showDelete={isMe} />
          ))
        )}
      </div>
    </div>
  );
}
