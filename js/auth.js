// js/auth.js
import { supabase } from "./supabase.js";

// ── サインイン関数（index.html から呼ぶ） ──
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return data.user;
}

// ── サインアップ関数（signup.html から呼ぶ） ──
// 「ニックネームを入力させ、Auth と profiles を upsert する」 
export async function signUp(nickname, email, password) {
  // 1) Supabase Auth 側で登録（自動で「確認メール」がユーザーのメール宛に送信される）
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
    { email, password },
    {
      // 【補足】ここで「redirectTo」を指定すると、ユーザーが確認メールのリンクを
      // クリックしたあとに戻ってくる URL をセットできる。必要なら使ってみてください。
      edirectTo: "https://your-domain.com/confirm.html"
    }
  );
  if (signUpError) {
    throw signUpError;
  }

  // 2) 確認メールが送られたので、profiles テーブルにニックネームだけ先に upsert しておく
  const newUserId = signUpData.user.id;
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: newUserId,
      username: nickname,
      is_admin: false,  // 初期は管理者権限なし
    });
  if (profileError) {
    throw profileError;
  }

  // 3) 呼び出し元にユーザー情報を返す
  return signUpData.user;
}

// ── サインアウト関数（main.html から呼ぶ） ──
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
