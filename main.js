
// main.js
import { supabase, getCurrentUserProfile } from "./supabase.js";

let isAdmin = false;       // 現在のユーザーが管理者かどうか
let currentUser = null;    // 現在のログインユーザー情報

// ━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 認証まわりの関数
// ━━━━━━━━━━━━━━━━━━━━━━━━

// サインアップ
export async function signUp() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    alert("メールアドレスとパスワードを入力してください");
    return;
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    alert("サインアップ失敗：" + error.message);
  } else {
    alert("サインアップ成功！メールを確認してください（開発中は不要）");
  }
}

// ログイン
export async function signIn() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    alert("メールアドレスとパスワードを入力してください");
    return;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    alert("ログイン失敗：" + error.message);
  } else {
    // ログイン成功後、ユーザー情報と管理者フラグを設定して画面を切り替え
    await setupUser();
  }
}

// ログアウト
export async function signOut() {
  await supabase.auth.signOut();
  location.reload(); // ページをリロードして状態をリセット
}

// 認証状態をチェックし、UIを切り替え
async function setupUser() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    // 未ログイン状態
    document.getElementById("auth-forms").style.display = "block";
    document.getElementById("upload-section").style.display = "none";
    document.getElementById("user-info").innerText = "";
    isAdmin = false;
    currentUser = null;
  } else {
    // ログイン中
    currentUser = user;
    document.getElementById("auth-forms").style.display = "none";
    document.getElementById("upload-section").style.display = "block";
    document.getElementById("user-info").innerText = `ログイン中： ${user.email}`;

    // プロフィールを取得して isAdmin を設定
    const profile = await getCurrentUserProfile();
    isAdmin = profile ? profile.is_admin : false;
  }
  // どちらの場合でも一覧を再読み込み
  loadNotes();
}

// ページ読み込み時に認証状態をチェック
window.addEventListener("DOMContentLoaded", async () => {
  await setupUser();
});

// 認証状態が変わったときにも setupUser を再実行
supabase.auth.onAuthStateChange(async () => {
  await setupUser();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━
// 2. アップロード関係
// ━━━━━━━━━━━━━━━━━━━━━━━━

// 講義録をアップロード
export async function uploadNote() {
  const title = document.getElementById("note-title").value;
  const subject = document.getElementById("note-subject").value;
  const fileInput = document.getElementById("note-file");
  const file = fileInput.files[0];

  if (!title || !file) {
    alert("講義録タイトルとファイルを選択してください");
    return;
  }

  // ログインしているかチェック
  if (!currentUser) {
    alert("ログインしてください");
    return;
  }

  // ファイル名にタイムスタンプを付与して重複防止
  const fileName = `${Date.now()}_${file.name}`;

  // 1) Supabase Storage にアップロード
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from("lecture-files")
    .upload(fileName, file);

  if (uploadError) {
    alert("アップロードエラー：" + uploadError.message);
    return;
  }

  // 2) 公開URLを取得
  const { data: { publicUrl } } = supabase
    .storage
    .from("lecture-files")
    .getPublicUrl(uploadData.path);

  // 3) notes テーブルにレコードを挿入
  const { error: insertError } = await supabase
    .from("notes")
    .insert({
      title,
      subject,
      file_url: publicUrl,
      user_id: currentUser.id,
    });

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

// ━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 一覧取得＆削除関係
// ━━━━━━━━━━━━━━━━━━━━━━━━

// notes テーブルから講義録一覧を取得して表示
export async function loadNotes() {
  const { data: notes, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("一覧取得エラー：", error.message);
    return;
  }

  const listElem = document.getElementById("notes-list");
  listElem.innerHTML = ""; // いったん空にする

  // 取得した notes を1件ずつ <li> にして追加
  notes.forEach((note) => {
    // 1) リンク要素
    const link = document.createElement("a");
    link.href = note.file_url;
    link.target = "_blank";
    link.textContent = `${note.title}（${note.subject || "－"}）`;

    // 2) アップロード日時表示
    const dateSpan = document.createElement("span");
    dateSpan.className = "small";
    dateSpan.textContent = ` – ${new Date(note.created_at).toLocaleString()}`;

    // 3) 管理者なら削除ボタンを作成
    let deleteBtn = null;
    if (isAdmin) {
      deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "削除";
      deleteBtn.onclick = () => {
        if (confirm(`本当に「${note.title}」を削除しますか？`)) {
          deleteNote(note.id);
        }
      };
    }

    // 4) <li> に要素をまとめる
    const li = document.createElement("li");
    li.appendChild(link);
    li.appendChild(dateSpan);
    if (deleteBtn) li.appendChild(deleteBtn);

    listElem.appendChild(li);
  });
}

/**
 * 管理者専用：指定IDの note を削除する
 * @param {string} noteId 
 */
async function deleteNote(noteId) {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    // RLS ポリシー違反やその他のエラー
    alert("削除に失敗しました: " + error.message);
  } else {
    alert("投稿を削除しました");
    loadNotes(); // 削除後に一覧を再表示
  }
}