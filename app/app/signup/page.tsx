"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type FormState } from "@/app/actions/auth";

export default function SignupPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    signupAction,
    undefined,
  );

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-2xl font-bold">회원가입</h1>

      <form action={action} className="space-y-3">
        <label className="block">
          <span className="text-sm text-[var(--muted)]">사용자명 (영문/숫자/_, 2~20자)</span>
          <input
            type="text"
            name="username"
            required
            minLength={2}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            autoFocus
            className="mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded p-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-[var(--muted)]">이메일</span>
          <input
            type="email"
            name="email"
            required
            className="mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded p-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-[var(--muted)]">비밀번호 (6자 이상)</span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded p-2"
          />
        </label>

        {state?.error && (
          <p className="text-sm text-red-400">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-[var(--accent)] text-[var(--background)] py-2 font-semibold disabled:opacity-50 cursor-pointer"
        >
          {pending ? "가입 중…" : "가입하기"}
        </button>
      </form>

      <p className="text-sm text-[var(--muted)]">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-[var(--accent)] underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
