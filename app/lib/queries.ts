import { query } from "./db";

export type FeedPost = {
  id: number;
  content: string;
  like_count: number;
  comment_count: number;
  tip_total: number;
  created_at: string;
  author_id: number;
  author_username: string;
  liked_by_me: boolean;
};

/**
 * 피드. 최신순 + 작성자 join + 현재 사용자 좋아요 여부 결합.
 * 좋아요 여부는 LEFT JOIN ... ON user_id = $viewer 패턴으로 1쿼리에 해결.
 */
export async function getFeed(viewerId: number | null, limit = 50): Promise<FeedPost[]> {
  const r = await query<FeedPost>(
    `
    SELECT p.id,
           p.content,
           p.like_count,
           p.comment_count,
           p.tip_total,
           p.created_at,
           p.author_id,
           u.username   AS author_username,
           (l.user_id IS NOT NULL) AS liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN likes l
        ON l.post_id = p.id AND l.user_id = $1
     ORDER BY p.created_at DESC
     LIMIT $2
    `,
    [viewerId ?? -1, limit],
  );
  return r.rows;
}

/** 특정 사용자의 게시글 목록 (프로필 페이지용) */
export async function getPostsByAuthor(authorId: number, viewerId: number | null) {
  const r = await query<FeedPost>(
    `
    SELECT p.id, p.content, p.like_count, p.comment_count, p.tip_total,
           p.created_at, p.author_id, u.username AS author_username,
           (l.user_id IS NOT NULL) AS liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = $2
     WHERE p.author_id = $1
     ORDER BY p.created_at DESC
    `,
    [authorId, viewerId ?? -1],
  );
  return r.rows;
}

export type PostDetail = FeedPost;

export async function getPostById(postId: number, viewerId: number | null) {
  const r = await query<PostDetail>(
    `
    SELECT p.id, p.content, p.like_count, p.comment_count, p.tip_total,
           p.created_at, p.author_id, u.username AS author_username,
           (l.user_id IS NOT NULL) AS liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = $2
     WHERE p.id = $1
    `,
    [postId, viewerId ?? -1],
  );
  return r.rows[0] ?? null;
}

export type CommentRow = {
  id: number;
  content: string;
  created_at: string;
  author_id: number;
  author_username: string;
};

export async function getComments(postId: number): Promise<CommentRow[]> {
  const r = await query<CommentRow>(
    `
    SELECT c.id, c.content, c.created_at, c.author_id,
           u.username AS author_username
      FROM comments c
      JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC
    `,
    [postId],
  );
  return r.rows;
}

export async function isFollowing(
  followerId: number,
  followeeId: number,
): Promise<boolean> {
  const r = await query(
    "SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2",
    [followerId, followeeId],
  );
  return (r.rowCount ?? 0) > 0;
}

export type LedgerRow = {
  id: number;
  from_user_id: number;
  to_user_id: number;
  post_id: number | null;
  amount: number;
  created_at: string;
  from_username: string;
  to_username: string;
};

/** 후원 원장 (트랜잭션 시연용). 보낸/받은 내역을 시간순으로 조회. */
export async function getLedgerForUser(userId: number, limit = 30): Promise<LedgerRow[]> {
  const r = await query<LedgerRow>(
    `
    SELECT cl.id, cl.from_user_id, cl.to_user_id, cl.post_id, cl.amount, cl.created_at,
           uf.username AS from_username,
           ut.username AS to_username
      FROM credit_ledger cl
      JOIN users uf ON uf.id = cl.from_user_id
      JOIN users ut ON ut.id = cl.to_user_id
     WHERE cl.from_user_id = $1 OR cl.to_user_id = $1
     ORDER BY cl.created_at DESC
     LIMIT $2
    `,
    [userId, limit],
  );
  return r.rows;
}

export async function getUserCredit(userId: number): Promise<number> {
  const r = await query<{ credit_balance: number }>(
    "SELECT credit_balance FROM users WHERE id = $1",
    [userId],
  );
  return r.rows[0]?.credit_balance ?? 0;
}
