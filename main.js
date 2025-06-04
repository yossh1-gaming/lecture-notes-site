// main.js
import { supabase } from "./supabase.js"; // supabase.js でエクスポートしたクライアントを読み込む

let currentUser = null;
let currentUserProfile = null;

/**
 * 1) 現在のユーザー情報とプロフィールを取得する
 * - supabase.auth.getUser() でセッション中のユーザーを取得
 * - profiles テーブルから username と is_admin を読み込む
 */
export async function getCurrentUserProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("ユーザー情報の取得に失敗しました", userError);
    return null;
  }
  currentUser = user;

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
  console.log("▶ currentUserProfile:", currentUserProfile);
  return profiles;
}

/**
 * 2) サインアップ関数
 * - prompt() でメールとパスワードを入力させ、supabase.auth.signUp を実行
 */
export async function signUp() {
  const email = prompt("メールアドレスを入力してください");
  const password = prompt("パスワードを入力してください");
  if (!email || !password) {
    alert("メールアドレスとパスワードは必須です");
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    alert("サインアップエラー：" + error.message);
  } else {
    alert("登録メールを送信しました。認証リンクをクリックして完了させてください。");
  }
}

/**
 * 3) サインイン関数
 * - prompt() でメールとパスワードを入力させ、supabase.auth.signInWithPassword を実行
 * - 成功時に currentUser とプロフィールを取得
 */
export async function signIn() {
  const email = prompt("メールアドレスを入力してください");
  const password = prompt("パスワードを入力してください");
  if (!email || !password) {
    alert("メールアドレスとパスワードは必須です");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    alert("サインインエラー：" + error.message);
  } else {
    currentUser = data.user;
    console.log("▶ ログイン成功:", currentUser);
    await getCurrentUserProfile();
    loadNotes(); // ログイン後に講義録一覧を読み込む
  }
}

/**
 * 4) ファイルアップロード関数
 * - 講義録タイトル・科目・ファイルを取得し、Storage にアップロード
 * - getPublicUrl で公開URLを取得し、notes テーブルにレコードを挿入
 */
export async function uploadNote() {
  if (!currentUser) {
    alert("ログインしてください");
    return;
  }

  const title = document.getElementById("note-title").value;
  const subject = document.getElementById("note-subject").value;
  const fileInput = document.getElementById("note-file");
  const file = fileInput.files[0];

  if (!title || !file) {
    alert("講義録タイトルとファイルを選択してください");
    return;
  }

  // ファイル名に日本語や特殊文字が含まれているとエラーになることがあるため、安全化
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "");
  const fileName = `${Date.now()}_${safeName}`;
  console.log("▶ uploadNote(): fileName =", fileName);

  // 1) Supabase Storage にアップロード
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from("lecture-files")
    .upload(fileName, file);

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
  document.getElementById("note-title").value = "";
  document.getElementById("note-subject").value = "";
  fileInput.value = "";
  loadNotes(); // 一覧を再読み込み
}

/**
 * 5) 講義録一覧を取得して表示する関数
 * - notes テーブルからレコードを取得し、<ul id="notes-list"> に <li> を追加
 */
export async function loadNotes() {
  const { data: notes, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("一覧取得エラー：", error);
    return;
  }

  const listElem = document.getElementById("notes-list");
  listElem.innerHTML = ""; // クリア

  notes.forEach((note) => {
    // 1) リンク要素
    const link = document.createElement("a");
    link.href = note.file_url;
    link.target = "_blank";
    link.textContent = `${note.title}（${note.subject || "－"}）`;

    // 2) アップロード日時
    const dateSpan = document.createElement("span");
    dateSpan.className = "small";
    dateSpan.textContent = ` – ${new Date(note.created_at).toLocaleString()}`;

    // 3) 管理者なら削除ボタンを作成
    let deleteBtn = null;
    if (currentUserProfile && currentUserProfile.is_admin) {
      deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "削除";
      deleteBtn.onclick = () => {
        if (confirm(`本当に「${note.title}」を削除しますか？`)) {
          deleteNote(note.id);
        }
      };
    }

    // 4) <li> 要素にまとめる
    const li = document.createElement("li");
    li.appendChild(link);
    li.appendChild(dateSpan);
    if (deleteBtn) li.appendChild(deleteBtn);

    listElem.appendChild(li);
  });
}

/**
 * 6) 管理者専用：指定IDの note を削除する関数
 */
async function deleteNote(noteId) {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    alert("削除に失敗しました: " + error.message);
  } else {
    alert("投稿を削除しました");
    loadNotes(); // 削除後に再読み込み
  }
}

/**
 * 7) ページ読み込み時に一度だけ実行
 * - セッションをチェックしてプロフィール読み込み
 * - HTML ボタンにイベントを紐づけ
 */
window.addEventListener("DOMContentLoaded", async () => {
  // 既にログイン済みか確認してプロフィール取得
  await getCurrentUserProfile();

  // サインアップ／サインインボタンにハンドラを紐づけ
  document.getElementById("sign-up-btn").onclick = signUp;
  document.getElementById("sign-in-btn").onclick = signIn;

  // アップロードボタンにハンドラを紐づけ
  document.getElementById("upload-btn").onclick = uploadNote;

  // ログイン済みなら一覧を表示
  if (currentUser) {
    loadNotes();
  }
});
