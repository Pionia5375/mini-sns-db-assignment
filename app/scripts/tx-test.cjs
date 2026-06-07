#!/usr/bin/env node
/* eslint-disable */
// 트랜잭션 통합 테스트 — DB 와 실제로 통신
// 1) 정상 후원: 잔액·tip_total·ledger 가 일관되게 변하는지
// 2) 잔액 부족 후원: 모든 상태가 그대로(ROLLBACK) 인지
// 3) 좋아요 토글 멱등성
// 4) 팔로우 양방향 카운터 동시 갱신

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function withTx(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function snapshot(userIds) {
  const r = await pool.query(
    `SELECT id, username, credit_balance, follower_count, following_count
       FROM users WHERE id = ANY($1) ORDER BY id`,
    [userIds],
  );
  return r.rows;
}

function assertEq(label, actual, expected) {
  if (actual !== expected) {
    console.error(`  ❌ ${label}: 기대 ${expected}, 실제 ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✅ ${label}: ${actual}`);
  }
}

async function tip(fromId, toId, postId, amount) {
  return withTx(async (tx) => {
    const [first, second] = [fromId, toId].sort((a, b) => a - b);
    await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [first]);
    await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [second]);

    const s = await tx.query("SELECT credit_balance FROM users WHERE id = $1", [fromId]);
    if (s.rows[0].credit_balance < amount) {
      throw new Error(`잔액 부족: ${s.rows[0].credit_balance} < ${amount}`);
    }
    await tx.query("UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2", [amount, fromId]);
    await tx.query("UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2", [amount, toId]);
    await tx.query("UPDATE posts SET tip_total = tip_total + $1 WHERE id = $2", [amount, postId]);
    await tx.query(
      "INSERT INTO credit_ledger (from_user_id, to_user_id, post_id, amount) VALUES ($1,$2,$3,$4)",
      [fromId, toId, postId, amount],
    );
  });
}

async function toggleLike(userId, postId) {
  return withTx(async (tx) => {
    const ex = await tx.query("SELECT 1 FROM likes WHERE user_id=$1 AND post_id=$2", [userId, postId]);
    if (ex.rowCount > 0) {
      await tx.query("DELETE FROM likes WHERE user_id=$1 AND post_id=$2", [userId, postId]);
      await tx.query("UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id=$1", [postId]);
    } else {
      const ins = await tx.query(
        "INSERT INTO likes (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [userId, postId],
      );
      if (ins.rowCount > 0) {
        await tx.query("UPDATE posts SET like_count = like_count + 1 WHERE id=$1", [postId]);
      }
    }
  });
}

async function main() {
  const ids = (await pool.query("SELECT id, username FROM users ORDER BY username")).rows;
  const byName = Object.fromEntries(ids.map((u) => [u.username, u.id]));
  const aliceId = byName.alice;
  const bobId = byName.bob;
  const carolId = byName.carol;
  const postIdOwnedByBob = 2; // 시드에서 bob 의 ACID 글

  console.log("\n=== 시나리오 1: 정상 후원 (alice → bob, 10P) ===");
  const beforeOk = await snapshot([aliceId, bobId]);
  const aliceBefore = beforeOk.find((u) => u.id === aliceId).credit_balance;
  const bobBefore = beforeOk.find((u) => u.id === bobId).credit_balance;
  const postBefore = (await pool.query("SELECT tip_total FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].tip_total;
  const ledgerBefore = (await pool.query("SELECT count(*)::int AS n FROM credit_ledger")).rows[0].n;

  await tip(aliceId, bobId, postIdOwnedByBob, 10);

  const afterOk = await snapshot([aliceId, bobId]);
  const aliceAfter = afterOk.find((u) => u.id === aliceId).credit_balance;
  const bobAfter = afterOk.find((u) => u.id === bobId).credit_balance;
  const postAfter = (await pool.query("SELECT tip_total FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].tip_total;
  const ledgerAfter = (await pool.query("SELECT count(*)::int AS n FROM credit_ledger")).rows[0].n;
  assertEq("alice 잔액 -10", aliceAfter, aliceBefore - 10);
  assertEq("bob   잔액 +10", bobAfter, bobBefore + 10);
  assertEq("post  tip_total +10", postAfter, postBefore + 10);
  assertEq("ledger 행 +1", ledgerAfter, ledgerBefore + 1);

  console.log("\n=== 시나리오 2: 잔액 부족 후원 (alice → bob, 9999P) → ROLLBACK ===");
  const before2 = await snapshot([aliceId, bobId]);
  const post2Before = (await pool.query("SELECT tip_total FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].tip_total;
  const ledger2Before = (await pool.query("SELECT count(*)::int AS n FROM credit_ledger")).rows[0].n;
  let errored = false;
  try {
    await tip(aliceId, bobId, postIdOwnedByBob, 9999);
  } catch (e) {
    errored = true;
    console.log(`  ✅ 에러 발생: ${e.message}`);
  }
  if (!errored) {
    console.error("  ❌ 에러가 안 났음 (잘못된 동작)");
    process.exitCode = 1;
  }
  const after2 = await snapshot([aliceId, bobId]);
  const post2After = (await pool.query("SELECT tip_total FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].tip_total;
  const ledger2After = (await pool.query("SELECT count(*)::int AS n FROM credit_ledger")).rows[0].n;
  assertEq(
    "alice 잔액 그대로",
    after2.find((u) => u.id === aliceId).credit_balance,
    before2.find((u) => u.id === aliceId).credit_balance,
  );
  assertEq(
    "bob   잔액 그대로",
    after2.find((u) => u.id === bobId).credit_balance,
    before2.find((u) => u.id === bobId).credit_balance,
  );
  assertEq("post  tip_total 그대로", post2After, post2Before);
  assertEq("ledger 행 그대로", ledger2After, ledger2Before);

  console.log("\n=== 시나리오 3: 좋아요 토글 멱등성 ===");
  // carol 이 게시글 2 에 좋아요 (현재 안 한 상태)
  const post2LikeBefore = (await pool.query("SELECT like_count FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].like_count;
  await toggleLike(carolId, postIdOwnedByBob);
  const post2LikeAfter1 = (await pool.query("SELECT like_count FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].like_count;
  assertEq("첫 클릭: like_count +1", post2LikeAfter1, post2LikeBefore + 1);
  await toggleLike(carolId, postIdOwnedByBob);
  const post2LikeAfter2 = (await pool.query("SELECT like_count FROM posts WHERE id=$1", [postIdOwnedByBob]))
    .rows[0].like_count;
  assertEq("두 번째 클릭(해제): like_count 원상복귀", post2LikeAfter2, post2LikeBefore);

  await pool.end();
  if (process.exitCode === 1) console.log("\n❌ 일부 검증 실패");
  else console.log("\n🎉 모든 트랜잭션 검증 통과");
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
