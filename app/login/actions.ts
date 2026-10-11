"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

function loginError(message: string): never {
  redirect("/login?error=" + encodeURIComponent(message));
}

export async function login(formData: FormData) {
  const emailValue = formData.get("email");
  const password = formData.get("password");
  if (typeof emailValue !== "string" || typeof password !== "string") {
    loginError("メールアドレスとパスワードを入力してください。");
  }
  const email = emailValue.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 4096) {
    loginError("メールアドレスとパスワードを確認してください。");
  }

  let failed = false;
  try {
    const supabase = createClient(await cookies());
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    failed = !!error;
  } catch {
    loginError("ログインサービスに接続できません。時間をおいて再度お試しください。");
  }
  if (failed) loginError("ログインできませんでした。入力内容を確認してください。");

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup() {
  loginError("新規登録は現在停止しています。");
}

export async function logout() {
  let failed = false;
  try {
    const supabase = createClient(await cookies());
    const { error } = await supabase.auth.signOut();
    failed = !!error;
  } catch {
    loginError("ログアウトできませんでした。時間をおいて再度お試しください。");
  }
  if (failed) loginError("ログアウトできませんでした。再度お試しください。");

  revalidatePath("/", "layout");
  redirect("/login");
}
