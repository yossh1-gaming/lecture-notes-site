// main.js
import { supabase } from "./supabase.js";  // supabase.js で定義したクライアントを読み込む

let currentUser = null;
let currentUserProfile = null;

// ページ読み込み時、またはサインイン後に一度呼び出す
export async function getCurrentUserProfile() {
  // ① supabase.authからユーザーを取得
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("ユーザー情報の取得に失敗しました", userError);
    return null;
  }
  currentUser = user;

  // ② profiles テーブルから該当レコードを取得
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("username, is_admin")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("プロフィール取得エラー", profileError);
    return null;
  }

  currentUserProfile = profiles;
  return profiles;
}

// ③ uploadNote など、アップロード処理も同じファイルにまとめる例
// main.js（または index.js）内の uploadNote 関数
export async function uploadNote() {
  const title = document.getElementById("note-title").value;
  const subject = document.getElementById("note-subject").value;
  const fileInput = document.getElementById("note-file");
  const file = fileInput.files[0];

  if (!title || !file) {
    alert("講義録タイトルとファイルを選択してください");
    return;
  }
  if (!currentUser) {
    alert("ログインしてください");
    return;
  }

  // ファイル名に日本語や空白を含ませないようにする
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "");
  const fileName = `${Date.now()}_${safeName}`;
  console.log("▶ uploadNote(): fileName =", fileName);
  console.log("▶ uploadNote(): currentUser.id =", currentUser.id);

  // 1) Supabase Storage にファイルをアップロード
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from("lecture-files")
    .upload(fileName, file);

  // ← ここが肝心。uploadData と uploadError を必ずログ出力
  console.log("▶ uploadData:", uploadData);
  console.log("▶ uploadError:", uploadError);

  if (uploadError) {
    alert("アップロードエラー：" + uploadError.message);
    return;
  }

  // 2) getPublicUrl 用の相対パスを切り出し
  console.log("▶ uploadData.path (raw):", uploadData.path);
  let relativePath = uploadData.path;
  if (relativePath.startsWith("lecture-files/")) {
    relativePath = relativePath.slice("lecture-files/".length);
  }
  console.log("▶ getPublicUrl に渡す relativePath:", relativePath);

  // 3) 公開URLを取得
  const urlResponse = supabase
    .storage
    .from("lecture-files")
    .getPublicUrl(relativePath);
  console.log("▶ urlResponse:", urlResponse);

  if (urlResponse.error) {
    alert("URL取得エラー：" + urlResponse.error.message);
    return;
  }
  const publicUrl = urlResponse.data.publicUrl;
  console.log("▶ publicUrl:", publicUrl);

  // 4) notes テーブルにレコードを挿入
  const { data: insertData, error: insertError } = await supabase
    .from("notes")
    .insert({
      title,
      subject,
      file_url: publicUrl,
      user_id: currentUser.id,
    });

  console.log("▶ insertData:", insertData);
  console.log("▶ insertError:", insertError);

  if (insertError) {
    alert("データ登録エラー：" + insertError.message);
    return;
  }

  alert("アップロード完了！");
  fileInput.value = "";
  loadNotes();
}


// ④ ページ読み込み時に一度だけ呼び出す例
window.addEventListener("DOMContentLoaded", async () => {
  // ここで getCurrentUserProfile() を実行し、currentUser・currentUserProfile をセット
  await getCurrentUserProfile();
  // ノート一覧を読み込む loadNotes() などを呼ぶ
});
