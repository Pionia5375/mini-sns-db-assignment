#!/usr/bin/env node
/* eslint-disable */
// 데모용 시드 데이터.
// 모든 계정 비밀번호는 "password" 로 통일 (시연 편의)
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const PASSWORD = "password";

const USERS = [
  { username: "alice",   email: "alice@example.com",   bio: "고양이 두 마리와 산다" },
  { username: "bob",     email: "bob@example.com",     bio: "백엔드 개발자" },
  { username: "carol",   email: "carol@example.com",   bio: "주말엔 등산" },
  { username: "dave",    email: "dave@example.com",    bio: "커피 ☕️" },
  { username: "eve",     email: "eve@example.com",     bio: "데이터베이스 좋아함" },
];

const POSTS = [
  { author: "alice", content: "오늘 학교 도서관에서 PostgreSQL 책 빌렸어요. 추천!" },
  { author: "bob",   content: "트랜잭션은 ACID 의 약자… A 는 원자성(Atomicity).\n전부 성공하거나 전부 실패." },
  { author: "carol", content: "주말 등산 후기 곧 올릴게요 🏔" },
  { author: "alice", content: "좋아요 카운터를 비정규화하면 빨라지지만, 일관성 유지는 트랜잭션이 필수." },
  { author: "dave",  content: "오늘의 카페: 안국역 근처. 라떼 강추." },
  { author: "eve",   content: "MVCC 가 핵심이다. PostgreSQL 짱." },
  { author: "bob",   content: "SELECT ... FOR UPDATE 로 행 잠그면 동시성 문제가 깔끔하게 해결됨." },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 가 없습니다 (.env.local 확인)");
  const pool = new Pool({ connectionString: url });

  console.log("🌱 시드 시작…");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 기존 데이터 깨끗이 (의존 순서 역순)
    await client.query("TRUNCATE credit_ledger, comments, likes, follows, posts, users RESTART IDENTITY CASCADE");

    // 사용자
    const userIds = {};
    for (const u of USERS) {
      const hash = await bcrypt.hash(PASSWORD, 10);
      const r = await client.query(
        `INSERT INTO users (username, email, password_hash, bio, credit_balance)
              VALUES ($1, $2, $3, $4, 200) RETURNING id`,
        [u.username, u.email, hash, u.bio],
      );
      userIds[u.username] = r.rows[0].id;
    }
    console.log(`  ✅ users ${USERS.length}명`);

    // 게시글 + 작성자 post_count 갱신
    const postIds = [];
    for (const p of POSTS) {
      const r = await client.query(
        "INSERT INTO posts (author_id, content) VALUES ($1, $2) RETURNING id",
        [userIds[p.author], p.content],
      );
      postIds.push({ id: r.rows[0].id, author: p.author });
      await client.query(
        "UPDATE users SET post_count = post_count + 1 WHERE id = $1",
        [userIds[p.author]],
      );
    }
    console.log(`  ✅ posts ${POSTS.length}개`);

    // 팔로우 일부 - alice 가 다 팔로우, eve 는 alice 만 팔로우
    const follows = [
      ["alice", "bob"], ["alice", "carol"], ["alice", "dave"], ["alice", "eve"],
      ["eve",   "alice"],
      ["bob",   "alice"], ["bob", "eve"],
      ["dave",  "carol"],
    ];
    for (const [a, b] of follows) {
      await client.query(
        "INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userIds[a], userIds[b]],
      );
      await client.query(
        "UPDATE users SET following_count = following_count + 1 WHERE id = $1",
        [userIds[a]],
      );
      await client.query(
        "UPDATE users SET follower_count  = follower_count  + 1 WHERE id = $1",
        [userIds[b]],
      );
    }
    console.log(`  ✅ follows ${follows.length}건`);

    // 좋아요 몇 개
    const likes = [
      ["bob",   1], ["carol", 1], ["dave", 1],   // alice 의 첫 글
      ["alice", 2], ["eve",   2],                // bob 의 ACID 글
      ["alice", 6], ["bob",   6], ["dave", 6],   // eve 의 MVCC 글
    ];
    for (const [u, postId] of likes) {
      await client.query(
        "INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userIds[u], postId],
      );
      await client.query(
        "UPDATE posts SET like_count = like_count + 1 WHERE id = $1",
        [postId],
      );
    }
    console.log(`  ✅ likes ${likes.length}개`);

    // 댓글
    const comments = [
      [1, "bob",   "오 무슨 책이에요?"],
      [1, "alice", "@bob \"Database Internals\" 라는 책!"],
      [2, "eve",   "I = Isolation, D = Durability"],
      [6, "alice", "동의합니다 👍"],
    ];
    for (const [postId, u, content] of comments) {
      await client.query(
        "INSERT INTO comments (post_id, author_id, content) VALUES ($1, $2, $3)",
        [postId, userIds[u], content],
      );
      await client.query(
        "UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1",
        [postId],
      );
    }
    console.log(`  ✅ comments ${comments.length}개`);

    // 후원 시드 (트랜잭션 데모 시각화용)
    const tips = [
      ["bob",   "alice", 1, 20],
      ["dave",  "eve",   6, 30],
      ["alice", "eve",   6, 15],
    ];
    for (const [from, to, postId, amount] of tips) {
      await client.query(
        "UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2",
        [amount, userIds[from]],
      );
      await client.query(
        "UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2",
        [amount, userIds[to]],
      );
      await client.query(
        "UPDATE posts SET tip_total = tip_total + $1 WHERE id = $2",
        [amount, postId],
      );
      await client.query(
        `INSERT INTO credit_ledger (from_user_id, to_user_id, post_id, amount)
              VALUES ($1, $2, $3, $4)`,
        [userIds[from], userIds[to], postId, amount],
      );
    }
    console.log(`  ✅ tips ${tips.length}건`);

    await client.query("COMMIT");
    console.log("🌱 시드 완료. 로그인 정보: <username>@example.com / password");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ 시드 실패:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
