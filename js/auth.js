// js/auth.js
import { supabase } from "./supabase.js";

export async function signUp(nickname, email, password) {
  const redirectTo = `${location.origin}/confirm.html`;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: redirectTo }
  });
    if (error) throw error;

  // サインアップ直後は data.user が null のことがある（メール確認前）
  // プロフィールは SQL のトリガで自動作成（後述）に任せる。
  // ニックネーム設定はログイン後に別途更新でも可。
  return data.user ?? null;
}


export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // プロフィールがなければ upsert
  await supabase
    .from("profiles")
    .upsert({ id: data.user.id })
    .single();
  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUserProfile() {
  const { data: { user }, error: uErr } = await supabase.auth.getUser();
  if (uErr || !user) return null;
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("username,role,is_admin")
    .eq("id", user.id)
    .single();
  return profile || null;
}
