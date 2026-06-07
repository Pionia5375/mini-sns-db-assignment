# MiniSNS — 데이터베이스 과제

PostgreSQL을 백엔드 DBMS로 사용하는 미니 SNS.
**좋아요 / 팔로우 / 포인트 후원** 세 가지 액션을 모두 트랜잭션으로 처리해서
릴레이션 · 쿼리 · 트랜잭션이 실제 웹 서비스에서 어떻게 맞물려 돌아가는지 보여준다.

> 과제 요건 — PostgreSQL을 활용한 웹 서비스, 백엔드의 Relation/Query/Transaction 정의 및 활용

---

## 빠른 실행

```bash
# 1) Postgres 컨테이너 (포트 5433, 초기 스크립트로 스키마 자동 생성)
docker compose -p db_assignment up -d

# 2) 앱 의존성 + 시드 데이터
cd app
npm install
npm run db:seed

# 3) 개발 서버
npm run dev    # http://localhost:3000

# (선택) 트랜잭션 통합 테스트 — 정상 후원 / 잔액 부족 ROLLBACK / 좋아요 토글
npm run db:test
```

기본 시드 계정: `alice@example.com … eve@example.com` / 비밀번호 `password`

---

## 디렉토리 구조

```
.
├── docker-compose.yml         # PostgreSQL 16 컨테이너
├── db/init/01_schema.sql      # 컨테이너 첫 부팅 시 자동 실행 (DDL)
└── app/                       # Next.js 16 앱
    ├── app/
    │   ├── actions/           # 서버 액션 = "트랜잭션 경계"
    │   │   ├── auth.ts        # 회원가입 / 로그인 / 로그아웃
    │   │   ├── posts.ts       # 게시글 작성·삭제  (TX: 작성 + post_count)
    │   │   ├── likes.ts       # 좋아요 토글        (TX: like 행 ± like_count)
    │   │   ├── follows.ts     # 팔로우 토글        (TX: follow 행 ± 양쪽 카운터)
    │   │   ├── tips.ts        # 포인트 후원        (TX: 잔액 검증 + 이동 + 원장)
    │   │   └── comments.ts    # 댓글               (TX: insert + comment_count)
    │   ├── page.tsx           # 피드
    │   ├── posts/[id]/        # 게시글 상세 + 댓글
    │   ├── u/[username]/      # 프로필 + 팔로우 버튼
    │   └── ledger/            # 후원 원장 페이지 (트랜잭션 결과 가시화)
    ├── lib/
    │   ├── db.ts              # pg Pool + withTx 트랜잭션 헬퍼
    │   ├── queries.ts         # 읽기 쿼리 (JOIN/LEFT JOIN)
    │   ├── auth.ts            # 비밀번호 해싱
    │   └── session.ts         # JWT 쿠키 세션
    ├── components/PostCard.tsx
    └── scripts/seed.cjs       # 시드 데이터
```

---

## 데이터 모델 (Relation)

6개의 릴레이션을 ER 관점으로 묶으면 다음 세 그룹.

| 그룹           | 테이블                | 역할                                           |
| -------------- | --------------------- | ---------------------------------------------- |
| 회원/콘텐츠    | `users`, `posts`, `comments` | 핵심 엔티티                              |
| 관계 (N:M)     | `likes`, `follows`    | 교차 테이블, 복합 PK 로 유일성 보장             |
| 금융 거래      | `credit_ledger`       | append-only 원장 (진실의 원천)                  |

자세한 컬럼은 [`db/init/01_schema.sql`](db/init/01_schema.sql) 참고.

### 비정규화 카운터

`posts.like_count`, `users.follower_count` 등은 **비정규화(denormalized) 캐시**다.

- 매 조회마다 `SELECT COUNT(*)` 하면 글 1만 개 피드에서 O(N×M).
- 대신 카운터를 컬럼으로 보관하고, 좋아요/팔로우 액션마다 ±1.
- 단점: 카운터와 실제 행이 어긋날 수 있음 → **트랜잭션으로 묶어 해결**.

이 trade-off 자체가 과제의 학습 포인트.

---

## 트랜잭션 패턴 3종

### 1. 좋아요 토글 — 멱등(idempotent) 카운터

```ts
withTx(async (tx) => {
  if (이미 좋아요?) {
    DELETE FROM likes ...
    UPDATE posts SET like_count = like_count - 1 ...
  } else {
    INSERT INTO likes ... ON CONFLICT DO NOTHING
    if (실제로 INSERT 됐다면) UPDATE posts SET like_count = like_count + 1 ...
  }
});
```

- 복합 PK `(user_id, post_id)` 가 동시 이중 INSERT 를 막는다.
- `ON CONFLICT DO NOTHING` + `rowCount` 검사로 이중 클릭을 흡수.

### 2. 팔로우 토글 — 두 사용자 카운터 동시 갱신

```ts
withTx(async (tx) => {
  // 데드락 방지: 두 사용자 행을 항상 id 오름차순으로 잠근다.
  SELECT id FROM users WHERE id = min FOR UPDATE
  SELECT id FROM users WHERE id = max FOR UPDATE

  INSERT/DELETE follows ...
  UPDATE follower.following_count ±1
  UPDATE followee.follower_count  ±1
});
```

- 세 갈래 업데이트가 모두 성공해야만 COMMIT.
- 두 행을 잠그는 순서를 정해놓아야 동시 양방향 팔로우에서 데드락이 안 난다.

### 3. 포인트 후원 — ACID 의 살아있는 예제

```ts
withTx(async (tx) => {
  SELECT ... FROM users WHERE id IN (보내는이, 받는이) FOR UPDATE  -- 잠금
  보내는이.credit_balance 가 amount 이상인지 검사            -- C: 일관성
  UPDATE 보내는이 SET credit_balance -= amount
  UPDATE 받는이   SET credit_balance += amount               -- A: 원자성
  UPDATE posts    SET tip_total      += amount
  INSERT INTO credit_ledger (...)                             -- 감사 원장
});
```

- **A**(Atomicity): 잔액이 어디선 빠지고 어디선 안 들어가는 사고 방지.
- **C**(Consistency): `CHECK (credit_balance >= 0)` + 사전 잔액 검사로 음수 잔액 차단.
- **I**(Isolation): `FOR UPDATE` 로 동시 이체 시 잔액 더블 스펜드 방지.
- **D**(Durability): COMMIT 이후엔 PostgreSQL WAL 이 디스크에 보장.

`credit_ledger` 는 append-only 라서 잔액에 의심이 생기면 합산만 다시 해보면 된다 — 회계의 분개장과 같은 발상.

---

## 의미 있는 쿼리들

### 피드 (JOIN + LEFT JOIN으로 1쿼리)

```sql
SELECT p.id, p.content, p.like_count, p.comment_count, p.tip_total,
       u.username AS author_username,
       (l.user_id IS NOT NULL) AS liked_by_me
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN likes l
    ON l.post_id = p.id AND l.user_id = $viewer
 ORDER BY p.created_at DESC
 LIMIT 50;
```

- 작성자 정보는 INNER JOIN.
- "내가 좋아요 눌렀는지" 는 LEFT JOIN — 안 눌렀으면 NULL.

### 후원 내역 (양방향 OR)

```sql
SELECT cl.*, uf.username AS from_username, ut.username AS to_username
  FROM credit_ledger cl
  JOIN users uf ON uf.id = cl.from_user_id
  JOIN users ut ON ut.id = cl.to_user_id
 WHERE cl.from_user_id = $me OR cl.to_user_id = $me
 ORDER BY cl.created_at DESC;
```

---

## 시연 시나리오

1. `alice` 로 로그인 → 글 작성, `bob` 글에 좋아요·후원
2. `/ledger` 에서 alice 잔액이 정확히 후원 금액만큼 감소, bob 잔액이 같은 만큼 증가했는지 확인
3. (선택) 잔액보다 큰 후원을 시도 → 에러 메시지, **트랜잭션 ROLLBACK 되어 잔액 그대로**
4. `/u/bob` 에서 팔로우 토글 → bob 의 follower_count, alice 의 following_count 가 동시에 변하는 것 확인

---

## 기술 스택

- **DBMS**: PostgreSQL 16 (Docker)
- **백엔드**: Next.js 16 Server Actions + `pg` (의도적으로 ORM 미사용, SQL 직접 작성)
- **세션**: jose (JWT in HttpOnly cookie), bcryptjs
- **프론트**: React 19 + Tailwind v4

---

## 배포 (선택)

- Vercel + Neon (또는 Supabase) 무료 티어로 같은 코드를 그대로 배포 가능.
- `DATABASE_URL` 환경변수만 Neon 연결 문자열로 바꿔주면 끝.
