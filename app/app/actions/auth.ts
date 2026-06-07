"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createUser, findUserByEmail, verifyPassword } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";

export type FormState = { error?: string } | undefined;

function str(v: FormDataEntryValue | null): string {
  return (v ?? "").toString().trim();
}

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const username = str(formData.get("username"));
  const email = str(formData.get("email")).toLowerCase();
  const password = str(formData.get("password"));

  if (username.length < 2 || username.length > 20) {
    return { error: "사용자명은 2~20자여야 합니다." };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: "사용자명은 영문/숫자/_ 만 가능합니다." };
  }
  if (!email.includes("@")) {
    return { error: "이메일 형식이 올바르지 않습니다." };
  }
  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상이어야 합니다." };
  }

  try {
    const user = await createUser(username, email, password);
    await createSession({ uid: user.id, username: user.username });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("users_email_key")) return { error: "이미 사용 중인 이메일입니다." };
    if (msg.includes("users_username_key")) return { error: "이미 사용 중인 사용자명입니다." };
    return { error: "회원가입 실패: " + msg };
  }

  redirect("/");
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = str(formData.get("email")).toLowerCase();
  const password = str(formData.get("password"));

  const user = await findUserByEmail(email);
  if (!user) return { error: "이메일 또는 비밀번호가 잘못되었습니다." };
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: "이메일 또는 비밀번호가 잘못되었습니다." };

  await createSession({ uid: user.id, username: user.username });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  revalidatePath("/");
  redirect("/login");
}
