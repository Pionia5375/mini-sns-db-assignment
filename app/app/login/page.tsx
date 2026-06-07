"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-2xl font-bold">로그인</h1>

      <form action={action} className="space-y-3">
        <label className="block">
          <span className="text-sm text-[var(--muted)]">이메일</span>
          <input
            type="email"
            name="email"
            required
            autoFocus
            className="mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded p-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-[var(--muted)]">비밀번호</span>
          <input
            type="password"
            name="password"
            required
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
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>

      <p className="text-sm text-[var(--muted)]">
        계정이 없나요?{" "}
        <Link href="/signup" className="text-[var(--accent)] underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}
