// main.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ── 0) Supabase クライアントの設定 ──
const SUPABASE_URL     = "https://camhjokfxzzelqlirxir.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbWhqb2tmeHp6ZWxxbGlyeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjc1MTYsImV4cCI6MjA2NDQwMzUxNn0.WpJ2AWmbgCWHKwxrP9EmqEO4CGT65OjQsW2YSJcVCwM";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserProfile = null;

/**
 * 1) 初期表示・認証状況チェック
 * - ページ読み込み時にセッションをチェックし、UIを更新
 */
async function setupUI() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error("セッション取得エラー:", sessionError);
  }

  const userInfoDiv = document.getElementById("user-info");
  const authForms    = document.getElementById("auth-forms");
  const uploadSection = document.getElementById("upload-section");
  
  // ノート一覧を常に表示するので leave notes-list visible

  if (session && session.user) {
    // ログイン済み
    currentUser = session.user;
    userInfoDiv.textContent = `ログイン中: ${currentUser.email}`;
    authForms.style.display = "none";
    uploadSection.style.display = "block";
    await getCurrentUserProfile();
    loadNotes();
  } else {
    // 未ログイン
    currentUser = null;
    userInfoDiv.textContent = "";
    authForms.style.display = "block";
    uploadSection.style.display = "none";
    // 未ログイン時でも一覧は取得可能
    loadNotes();
  }
}

/** 
 * サインアップ関数をアップデート
 *  - supabase.auth.signUp() 後、profiles テーブルに upsert でレコードを作成 
 */
async function signUp() {
  const email    = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    alert("メールアドレスとパスワードは必須です");
    return;
  }

  // ① Supabase Auth でユーザー登録
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    alert("サインアップエラー：" + signUpError.message);
    return;
  }

  // ② サインアップが成功すると signUpData.user.id に uid が入る
  const newUserId = signUpData.user.id;

  // ③ profiles テーブルに upsert（存在すれば更新、なければ挿入）
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: newUserId,
      username: email,      // 任意で「メールアドレス」をユーザー名にする
      is_admin: false,      // デフォルトでは管理者権限なし
    })
    .select()
    .single();
  
  if (profileError) {
    console.error("profiles テーブル更新エラー：", profileError.message);
    alert("サインアップは完了しましたが、プロフィール登録に失敗しました。管理者へ問い合わせてください。");
    return;
  }

  alert("サインアップ完了！登録したメールアドレスに確認メールを送りました。リンクを踏んで認証を完了してください。");
}


// main.js の signIn() に、サインイン成功後すぐ profiles.upsert() を追加する例

async function signIn() {
  const email    = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    alert("メールアドレスとパスワードは必須です");
    return;
  }

  // ① Supabase Auth でサインインを実行
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  console.log("▶ signIn(): data =", data, " error =", error);
  if (error) {
    alert("サインインエラー: " + error.message);
    return;
  }

  currentUser = data.user;

  // ② profiles テーブルに行がなければ upsert して作成（username: email, is_admin: false）
  const { data: upserted, error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: currentUser.id,
      username: email,
    })
    .select()        // 挿入後の行を受け取るために .select() をつける
    .single();       // 1行だけ期待する
  if (profileError) {
    console.warn("profiles upsert エラー:", profileError.message);
    // ここで止めず getCurrentUserProfile() に進める
  } else {
    console.log("▶ profiles に upsert した結果:", upserted);
  }

  // ③ 続けて UI をセットアップ
  await setupUI();
}


/**
 * 4) サインアウト関数
 */
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    alert("サインアウトエラー：" + error.message);
  } else {
    currentUser = null;
    await setupUI();
  }
}

/**
 * 5) プロフィール取得関数
 */
async function getCurrentUserProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
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
 * 6) ファイルアップロード関数
 */
async function uploadNote() {
  if (!currentUser) {
    alert("ログインしてください");
    return;
  }
  const title   = document.getElementById("note-title").value;
  const subject = document.getElementById("note-subject").value;
  const fileInput = document.getElementById("note-file");
  const file = fileInput.files[0];

  if (!title || !file) {
    alert("講義録タイトルとファイルを選択してください");
    return;
  }

  // ファイル名を安全化してタイムスタンプを付与
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

  // 2) バケット名を取り除いて「相対パス」だけを取り出す
  //    uploadData.path は "lecture-files/1749050379300_bibunn.pdf" のように返ってくる
  let relativePath = uploadData.path;
  if (relativePath.startsWith("lecture-files/")) {
    relativePath = relativePath.slice("lecture-files/".length);
  }
  console.log("▶ relativePath:", relativePath); // 例: "1749050379300_bibunn.pdf"

  // 3) notes テーブルには「相対パスだけ」を file_url フィールドに保存する
  //    （publicUrl を使わない）
  const { data: insertData, error: insertError } = await supabase
    .from("notes")
    .insert({
      title,
      subject,
      file_url: relativePath, // ここに相対パスだけを入れる
      user_id: currentUser.id,
    });

  console.log("▶ insertData:", insertData);
  console.log("▶ insertError:", insertError);
  if (insertError) {
    alert("データ登録エラー：" + insertError.message);
    return;
  }

  alert("アップロード完了！");
  document.getElementById("note-title").value   = "";
  document.getElementById("note-subject").value = "";
  document.getElementById("note-file").value    = "";

  // 4) 再び一覧を読み込む
  loadNotes();
}


/**
 * 7) 講義録一覧読み込み関数
 */
async function loadNotes() {
  const { data: notes, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  console.log("▶ loadNotes: notes =", notes, " error =", error);

  if (error) {
    console.error("一覧取得エラー：", error.message);
    return;
  }

  const listElem = document.getElementById("notes-list");
  if (!listElem) {
    console.warn("notes-list 要素が見つかりません");
    return;
  }
  listElem.innerHTML = "";

  notes.forEach((note) => {
    // 1) 「タイトル＋科目」のテキスト要素
    const textSpan = document.createElement("span");
    textSpan.textContent = `${note.title}（${note.subject || "－"}）`;

    // 2) アップロード日時も表示
    const dateSpan = document.createElement("span");
    dateSpan.className   = "small";
    dateSpan.textContent = ` – ${new Date(note.created_at).toLocaleString()}`;

    // 3) 「PDF を開く／ダウンロード」ボタンを作成
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "PDFを開く";
    viewBtn.style.marginLeft = "12px";

    if (currentUser) {
      // ログイン済みユーザーなら「署名付きURL」を発行して新しいタブで開く
      viewBtn.onclick = async () => {
        // note.file_url は "1749051597181_bibunn.pdf" のような「相対パス」のはず
        const relativePath = note.file_url; 

        // ① 署名付き URL を発行
        const { data: signedData, error: signedError } = await supabase
            .storage
            .from("lecture-files")
            .createSignedUrl(relativePath, 60); // 第2引数=有効期限(秒)

        if (signedError) {
            alert("署名付きURLの取得に失敗しました：" + signedError.message);
            return;
        }
        // ② 新しいタブで署名付き URL を開く
        window.open(signedData.signedUrl, "_blank");
      };
    } else {
      // 未ログインユーザーならボタンは無効化（グレーアウト表示など）
      viewBtn.disabled          = true;
      viewBtn.style.opacity     = "0.5";
      viewBtn.title             = "ログインしてからご利用ください";
    }

    // 4) 管理者なら「削除」ボタンを追加
    let deleteBtn = null;
    if (currentUserProfile && currentUserProfile.is_admin) {
      deleteBtn = document.createElement("button");
      deleteBtn.className   = "delete-btn";
      deleteBtn.textContent = "削除";
      deleteBtn.onclick = () => {
        if (confirm(`本当に「${note.title}」を削除しますか？`)) {
          deleteNote(note.id);
        }
      };
    }

    // 5) <li> 要素にまとめる
    const li = document.createElement("li");
    li.appendChild(textSpan);
    li.appendChild(dateSpan);
    li.appendChild(viewBtn);
    if (deleteBtn) li.appendChild(deleteBtn);

    listElem.appendChild(li);
  });
}


/**
 * 8) 管理者用：講義録を削除
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
    loadNotes();
  }
}

/**
 * 9) ページ読み込み時の初期化
 */
window.addEventListener("DOMContentLoaded", async () => {
  await setupUI();

  // グローバルに関数を登録して、HTML の onclick から呼べるようにする
  window.signUp     = signUp;
  window.signIn     = signIn;
  window.signOut    = signOut;
  window.uploadNote = uploadNote;
});
