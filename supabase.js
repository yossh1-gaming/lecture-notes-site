
// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

export const supabase = createClient(
  "https://camhjokfxzzelqlirxir.supabase.co", // あなたの Supabase URL に置き換えてください
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbWhqb2tmeHp6ZWxxbGlyeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjc1MTYsImV4cCI6MjA2NDQwMzUxNn0.WpJ2AWmbgCWHKwxrP9EmqEO4CGT65OjQsW2YSJcVCwM"              // あなたの anon 公開キーに置き換えてください
)

// supabase.js から supabase クライアントを import している前提
import { supabase } from "./supabase.js";

let currentUser = null;
let currentUserProfile = null;

// ページ読み込み時、またはサインイン後に一度呼び出す
export async function getCurrentUserProfile() {
  // 1) 現在のユーザー情報を取得
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("ユーザー情報の取得に失敗しました", userError);
    return null;
  }
  currentUser = user;

  // 2) profiles テーブルから該当レコードを取得
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("username, is_admin")
    .eq("id", user.id)
    .single();  // 1件だけ取得

  if (profileError) {
    console.error("プロフィール取得エラー", profileError);
    return null;
  }

  currentUserProfile = profiles;  
  // profiles.is_admin が true なら管理者
  return profiles; 
}