// js/auth.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ── Supabase クライアントの初期化 ──
const SUPABASE_URL     = "https://camhjokfxzzelqlirxir.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbWhqb2tmeHp6ZWxxbGlyeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjc1MTYsImV4cCI6MjA2NDQwMzUxNn0.WpJ2AWmbgCWHKwxrP9EmqEO4CGT65OjQsW2YSJcVCwM"; // あなたの anon キー
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// サインイン関数（login.html から呼び出す）
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error; // 呼び出し元で catch して alert する
  }
  return data.user;
}

// サインアップ関数（signup.html から呼び出す）
export async function signUp(nickname, email, password) {
  // 1) Supabase Auth でユーザー登録
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    throw signUpError;
  }

  // 2) profiles テーブルにニックネームを upsert
  const newUserId = signUpData.user.id;
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: newUserId,
      username: nickname,
      is_admin: false,
    });
  if (profileError) {
    throw profileError;
  }

  // 3) 登録メールを送信した旨を呼び出し元で通知
  return signUpData.user;
}

// サインアウト関数（index.html から呼び出す）
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
