-- ===========================================================
-- SNS 과제 - 스키마 정의
-- 핵심 학습 포인트:
--   * 정규화된 릴레이션 + 비정규화 카운터(성능)의 공존
--   * 카운터 일관성은 트랜잭션으로 보장
--   * 잔액(credit) 이동은 SELECT FOR UPDATE + 트랜잭션으로 보호
-- ===========================================================

BEGIN;

-- ----- 사용자 ---------------------------------------------------------------
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        TEXT        NOT NULL UNIQUE,
    email           TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    bio             TEXT        NOT NULL DEFAULT '',
    -- 비정규화 카운터: 매 조회 시 COUNT(*)하지 않기 위함. 트랜잭션으로 정합성 유지.
    follower_count  INTEGER     NOT NULL DEFAULT 0 CHECK (follower_count  >= 0),
    following_count INTEGER     NOT NULL DEFAULT 0 CHECK (following_count >= 0),
    post_count      INTEGER     NOT NULL DEFAULT 0 CHECK (post_count      >= 0),
    -- 후원/적립 잔액 (포인트). 음수 금지 → CHECK + 트랜잭션의 두 겹 방어.
    credit_balance  INTEGER     NOT NULL DEFAULT 100 CHECK (credit_balance >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX users_username_idx ON users (LOWER(username));

-- ----- 게시글 ---------------------------------------------------------------
CREATE TABLE posts (
    id            BIGSERIAL PRIMARY KEY,
    author_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content       TEXT        NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
    like_count    INTEGER     NOT NULL DEFAULT 0 CHECK (like_count    >= 0),
    comment_count INTEGER     NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    tip_total     INTEGER     NOT NULL DEFAULT 0 CHECK (tip_total     >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX posts_author_id_created_at_idx ON posts (author_id, created_at DESC);
CREATE INDEX posts_created_at_idx           ON posts (created_at DESC);

-- ----- 댓글 -----------------------------------------------------------------
CREATE TABLE comments (
    id         BIGSERIAL PRIMARY KEY,
    post_id    BIGINT      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id  BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT        NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX comments_post_id_created_at_idx ON comments (post_id, created_at);

-- ----- 좋아요 (다대다, 유일성 보장) ----------------------------------------
CREATE TABLE likes (
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    BIGINT      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX likes_post_id_idx ON likes (post_id);

-- ----- 팔로우 (자기 자신 팔로우 금지) -------------------------------------
CREATE TABLE follows (
    follower_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON follows (followee_id);

-- ----- 포인트 후원 원장 (감사용 append-only 로그) -------------------------
-- 잔액 이동의 진실의 원천. users.credit_balance 는 캐시.
CREATE TABLE credit_ledger (
    id            BIGSERIAL PRIMARY KEY,
    from_user_id  BIGINT      NOT NULL REFERENCES users(id),
    to_user_id    BIGINT      NOT NULL REFERENCES users(id),
    post_id       BIGINT          NULL REFERENCES posts(id) ON DELETE SET NULL,
    amount        INTEGER     NOT NULL CHECK (amount > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_user_id <> to_user_id)
);
CREATE INDEX credit_ledger_from_idx ON credit_ledger (from_user_id, created_at DESC);
CREATE INDEX credit_ledger_to_idx   ON credit_ledger (to_user_id,   created_at DESC);

COMMIT;
