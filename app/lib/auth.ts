import bcrypt from "bcryptjs";
import { query } from "./db";

export type UserRow = {
  id: number;
  username: string;
  email: string;
  bio: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  credit_balance: number;
  created_at: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function findUserByEmail(email: string) {
  const r = await query<UserRow & { password_hash: string }>(
    "SELECT * FROM users WHERE email = $1",
    [email],
  );
  return r.rows[0] ?? null;
}

export async function findUserByUsername(username: string) {
  const r = await query<UserRow>(
    `SELECT id, username, email, bio, follower_count, following_count,
            post_count, credit_balance, created_at
       FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return r.rows[0] ?? null;
}

export async function createUser(
  username: string,
  email: string,
  password: string,
): Promise<UserRow> {
  const hash = await hashPassword(password);
  const r = await query<UserRow>(
    `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
      RETURNING id, username, email, bio, follower_count, following_count,
                post_count, credit_balance, created_at`,
    [username, email, hash],
  );
  return r.rows[0];
}
