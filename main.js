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

  const userInfoDiv   = document.getElementById("user-info");
  const authForms     = document.getElementById("auth-forms");
  const uploadSection = document.getElementById("upload-section");
  
  if (session && session.user) {
    // ログイン済み
    currentUser = session.user;
    // まずプロファイルを取得し（中でニックネームを currentUserProfile にセット）
    await getCurrentUserProfile();
    // ニックネームが取得できていればそれを表示
    const nickname = currentUserProfile.username || "未設定のニックネーム";
    userInfoDiv.textContent = `ログイン中：${nickname}`;

    authForms.style.display     = "none";
    uploadSection.style.display = "block";
    loadNotes();  // 一覧を読み込む
  } else {
    // 未ログイン
    currentUser = null;
    currentUserProfile = null;
    userInfoDiv.textContent     = "";
    authForms.style.display      = "block";
    uploadSection.style.display  = "none";
    loadNotes();  // 未ログインでも一覧を表示（PDFは開けない）
  }
}

/**
 * 2) サインアップ関数
 * - ニックネーム、メール、パスワードを取得し、Authとprofilesテーブルを upsert
 */
async function signUp() {
  const nickname = document.getElementById("signup-nickname").value.trim();
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!nickname || !email || !password) {
    alert("ニックネーム、メールアドレス、パスワードはすべて必須です");
    return;
  }

  // ① Supabase Auth でユーザー登録
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    alert("サインアップエラー：" + signUpError.message);
    return;
  }

  // ② signUpData.user.id に uid が入るので、profiles テーブルに upsert
  const newUserId = signUpData.user.id;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: newUserId,
      username: nickname,  // ニックネームを username カラムに保存
      is_admin: false,     // 初期は管理者権限なし
    })
    .select()
    .single();

  if (profileError) {
    console.error("profiles テーブル更新エラー：", profileError.message);
    alert("サインアップは完了しましたが、プロフィール登録に失敗しました。管理者へ問い合わせてください。");
    return;
  }

  alert("サインアップ完了！メール認証を行ってからログインしてください。");
}

/**
 * 3) サインイン関数
 * - メール、パスワードを取得し Auth でログイン → プロフィールがなければ upsert → UI 更新
 */
async function signIn() {
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("メールアドレスとパスワードは必須です");
    return;
  }

  // ① Supabase Auth でサインイン
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  console.log("▶ signIn(): data =", data, " error =", error);
  if (error) {
    alert("サインインエラー: " + error.message);
    return;
  }
  currentUser = data.user;

  // ② profiles テーブルに upsert
  //    ここでは「email を使って username を更新」または挿入しますが、
  //    管理者権限(is_admin)はここで上書きしないようにしている点に注意。
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: currentUser.id,
      username: email,    // 本来は「メールをニックネームとしても可」だが、既にサインアップ時に nickname を設定済みなので
                          // upsert() 時に username を省略してもよい。ただここではサインインごとに更新する例。
    })
    .select("id, username, is_admin")
    .single();
  if (profileError) {
    console.warn("profiles upsert エラー:", profileError.message);
  } else {
    console.log("▶ profiles に upsert した結果:", profileData);
  }

  // ③ UI 更新（内部で getCurrentUserProfile() → loadNotes() が呼ばれる）
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
    currentUserProfile = null;
    await setupUI();
  }
}

/**
 * 5) プロフィール取得関数
 * - supabase.auth.getUser() → profiles テーブルからニックネーム & is_admin を取得
 * - 行が存在しない場合は「{ username: null, is_admin: false }」を返す
 */
async function getCurrentUserProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("ユーザー情報の取得に失敗しました", userError);
    currentUser = null;
    currentUserProfile = null;
    return null;
  }
  currentUser = user;

  // profiles テーブルからニックネーム & is_admin を取得
  try {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("username, is_admin")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    currentUserProfile = profiles;
  } catch (err) {
    console.warn("profiles テーブルに対象レコードがない、または取得失敗:", err.message);
    currentUserProfile = { username: null, is_admin: false };
  }

  console.log("▶ currentUserProfile:", currentUserProfile);
  return currentUserProfile;
}

/**
 * 6) ファイルアップロード関数
 * - 講義録タイトル・科目・ファイルを取得し、Storage にアップロード
 * - 相対パスだけを notes.file_url に保存
 */
async function uploadNote() {
  if (!currentUser) {
    alert("ログインしてください");
    return;
  }
  const title   = document.getElementById("note-title").value;
  const subject = document.getElementById("note-subject").value;
  const file    = document.getElementById("note-file").files[0];

  if (!title || !file) {
    alert("講義録タイトルとファイルを選択してください");
    return;
  }

  // ファイル名を半角英数字のみの safeName にして重複防止
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

  // uploadData.path は "lecture-files/1749051597181_bibunn.pdf" の形式
  // ここから「lecture-files/」を取り除き、相対パスだけにする
  const relativePath = uploadData.path.replace(/^lecture-files\//, "");
  console.log("▶ uploadNote(): relativePath を保存 =", relativePath);
  //   → "1749051597181_bibunn.pdf" という文字列のみが得られる

  // 2) notes テーブルに「相対パスだけ」を挿入
  const { data: insertData, error: insertError } = await supabase
    .from("notes")
    .insert({
      title,
      subject,
      file_url: relativePath, // 相対パスのみを保存
      user_id: currentUser.id,
    })
    .select(); // 挿入後の行を取得したいなら .select() を付ける

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
  loadNotes(); // 一覧を再読み込み
}

/**
 * 7) 講義録一覧読み込み関数
 * - notes テーブルから全レコードを取得し、<ul id="notes-list"> に <li> を追加
 * - 各講義録にタイトル・科目・投稿者（ニックネーム）・アップロード日時・PDF開く・（管理者なら削除）を表示
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

  for (const note of notes) {
    // (0) 投稿者のニックネームを取得するには、別途 profiles からフェッチする必要があるか、
    //     クエリ時に join して取得しても良いが、ここでは手軽に「user_id から再度クエリ」を使う例を示す。

    let authorNickname = "不明なユーザー";
    try {
      const { data: p, error: pe } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", note.user_id)
        .single();
      if (pe) throw pe;
      authorNickname = p.username || "名無し";
    } catch (err) {
      console.warn("投稿者ニックネーム取得エラー:", err.message);
    }

    // (1) タイトル＋科目をテキストで表示
    const textSpan = document.createElement("span");
    textSpan.textContent = `${note.title}（${note.subject || "－"}）`;

    // (2) 投稿者ニックネームを斜体で表示
    const authorSpan = document.createElement("span");
    authorSpan.className = "author";
    authorSpan.textContent = `投稿者：${authorNickname}`;

    // (3) アップロード日時を表示
    const dateSpan = document.createElement("span");
    dateSpan.className = "small";
    dateSpan.textContent = ` – ${new Date(note.created_at).toLocaleString()}`;

    // (4) 「PDFを開く」ボタンを作成
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "PDFを開く";
    viewBtn.style.marginLeft = "12px";

    if (currentUser) {
      // note.file_url はバケット内の相対パス（例："1749051597181_bibunn.pdf"）
      viewBtn.onclick = async () => {
        const relativePath = note.file_url;
        console.log("▶ createSignedUrl に渡す relativePath =", relativePath);

        const { data: signedData, error: signedError } = await supabase
          .storage
          .from("lecture-files")
          .createSignedUrl(relativePath, 60);

        if (signedError) {
          alert("署名付きURLの取得に失敗しました：" + signedError.message);
          return;
        }
        window.open(signedData.signedUrl, "_blank");
      };
    } else {
      viewBtn.disabled      = true;
      viewBtn.style.opacity = "0.5";
      viewBtn.title         = "ログインしてからご利用ください";
    }

    // (5) 管理者なら「削除」ボタンを追加
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

    // (6) <li> 要素にまとめる
    const li = document.createElement("li");
    li.appendChild(textSpan);
    li.appendChild(authorSpan);
    li.appendChild(dateSpan);
    li.appendChild(viewBtn);
    if (deleteBtn) li.appendChild(deleteBtn);

    listElem.appendChild(li);
  }
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
