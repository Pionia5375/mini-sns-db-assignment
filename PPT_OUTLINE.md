# PPT 발표 자료 - 아웃라인 (12장)

> 발표 시간 7~10분 가정. 슬라이드 옆에 말로 할 멘트(스피치 노트) 함께 정리.

---

## 1. 표지
- **MiniSNS — PostgreSQL 기반 미니 SNS**
- 이름 / 학번 / 과목명 / 제출일 (2026-06-10)
- 한 줄 설명: "좋아요·팔로우·포인트 후원으로 트랜잭션을 시연하는 SNS"

---

## 2. 학습 목표 (요구사항 → 답)
- ✔ 웹 서비스가 DBMS와 어떻게 연동되는가
- ✔ 백엔드에서 Relation/Query/Transaction 을 어떻게 정의·활용하는가
- → 본 발표는 위 두 가지를 "구현 → 시연 → SQL 코드" 순으로 보여줌

---

## 3. 시스템 구조 (아키텍처 한 장)
```
[브라우저] ── HTTP/Server Action ──► [Next.js 서버]
                                          │
                                  pg (PostgreSQL 드라이버)
                                          ▼
                                   [PostgreSQL 16]
                                  (Docker 컨테이너)
```
- 의도적으로 **ORM 미사용** → SQL 을 그대로 보여주는 게 학습 목적.
- Next.js Server Action 한 함수 = 트랜잭션 한 단위.

---

## 4. ERD (한 장)
- 6개 릴레이션:
  - `users`, `posts`, `comments` — 핵심 엔티티
  - `likes`, `follows` — 다대다 교차 (복합 PK)
  - `credit_ledger` — append-only 원장
- 카운터(`like_count`, `follower_count`, `tip_total`) 는 **비정규화 캐시** — 왜 두는가는 다음 슬라이드.

---

## 5. 비정규화 카운터의 trade-off
- 비정규화 OFF: 매 피드 조회마다 `COUNT(*)` → 글 10,000개에서 10,000번 카운트
- 비정규화 ON: `like_count` 컬럼 한 번 SELECT → O(1)
- 단점: 좋아요 INSERT 와 카운터 +1 이 분리되면 비일관성
- 해결: **트랜잭션으로 묶는다** → 다음 슬라이드부터 실제 코드

---

## 6. 좋아요 토글 — Transaction #1
- SQL 두 줄을 한 트랜잭션에 묶음
```ts
await withTx(async (tx) => {
  await tx.query("INSERT INTO likes ... ON CONFLICT DO NOTHING");
  if (실제로 추가된 경우) {
    await tx.query("UPDATE posts SET like_count = like_count + 1");
  }
});
```
- `(user_id, post_id)` 복합 PK → 동시 이중 클릭에서 행이 두 개 안 생김
- `ON CONFLICT DO NOTHING` + `rowCount` 검사 → 멱등 처리

---

## 7. 팔로우 토글 — Transaction #2
- 한 액션이 **3개 변화**: follows 행 + follower.following_count + followee.follower_count
- 데드락 방지 패턴
```sql
SELECT id FROM users WHERE id = LEAST($me, $other)  FOR UPDATE;
SELECT id FROM users WHERE id = GREATEST($me, $other) FOR UPDATE;
-- 그 다음 INSERT/UPDATE...
```
- "두 행을 늘 같은 순서로 잠그면 데드락이 없다" — 동시성 제어 기본 패턴

---

## 8. 포인트 후원 — Transaction #3 (ACID 종합)
- 트랜잭션 안의 흐름
  1. 보내는 사람 + 받는 사람 행을 `FOR UPDATE` 잠금
  2. 잔액 >= amount 검증 (실패 시 throw → ROLLBACK)
  3. 보내는 사람 잔액 -amount, 받는 사람 +amount
  4. posts.tip_total += amount
  5. `credit_ledger` 에 분개 한 줄 INSERT
- **A**: 어느 한 쪽만 변하지 않는다
- **C**: `CHECK (credit_balance >= 0)` + 사전 검증
- **I**: `FOR UPDATE` 로 더블 스펜드 방지
- **D**: COMMIT 후 WAL 로 영속성

---

## 9. 라이브 데모 (스크린샷 / 영상 캡처)
- (1) alice 로 100P 후원 → bob 잔액 +100, 원장에 1줄
- (2) 잔액 부족 후원 시도 → 에러 토스트, **잔액이 그대로** (ROLLBACK 증거)
- (3) /ledger 페이지에서 보낸 내역/받은 내역 확인

---

## 10. 의미 있는 SELECT — 피드 1쿼리
```sql
SELECT p.*, u.username AS author_username,
       (l.user_id IS NOT NULL) AS liked_by_me
  FROM posts p
  JOIN  users u ON u.id = p.author_id
  LEFT JOIN likes l
    ON l.post_id = p.id AND l.user_id = $viewer
 ORDER BY p.created_at DESC
 LIMIT 50;
```
- INNER JOIN: 작성자 (필수)
- LEFT JOIN: 내 좋아요 여부 (없으면 NULL → false 매핑)
- N+1 없이 **단일 쿼리**

---

## 11. 인덱스 한 줄 정리
- `posts (created_at DESC)`: 피드 정렬용
- `posts (author_id, created_at DESC)`: 프로필 게시글 목록
- `likes (post_id)`: 게시글별 좋아요 역참조
- `follows (followee_id)`: "이 사람을 누가 팔로우 했나"

---

## 12. 요약 & 회고
- 구현한 것
  - 회원/글/댓글 + 다대다(좋아요·팔로우) + 금융 원장 5개 시나리오
  - 5종 트랜잭션 (글 작성, 댓글, 좋아요, 팔로우, 후원)
  - 단일 쿼리 피드/프로필/원장
- 배운 것
  - **트랜잭션은 안전망이지만, 격리·잠금 순서·복합 PK 같은 설계가 같이 가야 의미가 있다**
- 한계 / 다음 단계
  - 카운터 충돌 줄이려면 LISTEN/NOTIFY 또는 outbox 패턴 고려
  - JWT → NextAuth 같은 표준 세션으로 교체

---

## 부록 (스피커 노트용 메모)

- Next.js 16 의 Server Action 은 RPC 처럼 동작. 클라이언트에서 form 으로 호출하면 서버 함수가 실행되고 결과/리다이렉트가 돌아옴.
- `withTx` 헬퍼는 BEGIN/COMMIT/ROLLBACK 보일러플레이트를 한 곳에 모아둔 것. 콜백 throw = ROLLBACK.
- 시드 계정/비번 정보 (시연 직전 슬라이드 한 켠에 작게):
  - `alice@example.com … eve@example.com` / `password`
