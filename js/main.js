// js/main.js
import { supabase } from "./supabase.js";

// ユーザー情報格納用
let currentUser = null;
let currentUserProfile = null;

/**
 * ページロード時の処理：
 * ① セッションチェック → 未ログインなら index.html へリダイレクト
 * ② ログイン済みならニックネームを取得して UI 更新
 * ③ アップロードフォームを表示、イベントバインド
 * ④ 講義録一覧を取得して表示
 */
async function setupUI() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error("セッション取得エラー:", sessionError);
  }

  const userInfoDiv   = document.getElementById("user-info");
  const uploadSection = document.getElementById("upload-section");

  if (!session || !session.user) {
    // 未ログインなら index.html に遷移
    window.location.href = "index.html";
    return;
  }

  // ログイン済みの場合
  currentUser = session.user;

  // プロフィール取得／ニックネームを表示
  await getCurrentUserProfile();
  const nickname = currentUserProfile.username || "未設定ニックネーム";
  userInfoDiv.textContent = `ログイン中：${nickname}`;

  // アップロードフォームを表示し、ボタンにイベントをバインド
  uploadSection.style.display = "block";
  document.getElementById("upload-btn").onclick   = uploadNote;
  document.getElementById("logout-btn").onclick   = signOut;

  // 講義録一覧を取得して描画
  loadNotes();
}

/**
 * プロフィール取得
 */
async function getCurrentUserProfile() {
  // 1) supabase.auth.getUser() で現在の user を取得
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error("ユーザー情報の取得に失敗:", userError);
    currentUserProfile = { username: null, is_admin: false };
    return;
  }
  currentUser = user;

  // 2) profiles テーブルから該当レコードを取得
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("username, is_admin")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    currentUserProfile = profile;
  } catch (err) {
    console.warn("profiles 取得エラー:", err.message);
    currentUserProfile = { username: null, is_admin: false };
  }
}

/**
 * アップロード処理
 */
async function uploadNote() {
  if (!currentUser) {
    alert("ログインしてください");
    return;
  }

  const title   = document.getElementById("note-title").value.trim();
  const subject = document.getElementById("note-subject").value.trim();
  const fileElem = document.getElementById("note-file");
  const file    = fileElem.files[0];

  if (!title || !file) {
    alert("タイトルとファイルを選択してください");
    return;
  }

  // ファイル名を安全化しつつタイムスタンプ付与
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "");
  const fileName = `${Date.now()}_${safeName}`;

  // 1) Supabase Storage にアップロード
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from("lecture-files")
    .upload(fileName, file);
  if (uploadError) {
    alert("アップロードエラー：" + uploadError.message);
    return;
  }

  // 2) notes テーブルに「相対パスだけ」を挿入
  const relativePath = uploadData.path.replace(/^lecture-files\//, "");
  const { data: insertData, error: insertError } = await supabase
    .from("notes")
    .insert({
      title,
      subject,
      file_url: relativePath,
      user_id: currentUser.id,
    })
    .select();
  if (insertError) {
    alert("データ登録エラー：" + insertError.message);
    return;
  }

  alert("アップロード完了！");
  document.getElementById("note-title").value   = "";
  document.getElementById("note-subject").value = "";
  document.getElementById("note-file").value    = "";
  loadNotes();
}

/**
 * 一覧取得＆描画
 */
async function loadNotes() {
  const { data: notes, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("一覧取得エラー：", error.message);
    return;
  }

  const listElem = document.getElementById("notes-list");
  listElem.innerHTML = "";

  for (const note of notes) {
    // 投稿者ニックネームを取得
    let authorNickname = "不明";
    try {
      const { data: p, error: pe } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", note.user_id)
        .single();
      if (pe) throw pe;
      authorNickname = p.username || "名無し";
    } catch {
      // 無視
    }

    // li 要素を作成
    const li = document.createElement("li");
    // テキスト
    const textSpan = document.createElement("span");
    textSpan.textContent = `${note.title}（${note.subject || "－"}）`;
    // 投稿者
    const authorSpan = document.createElement("span");
    authorSpan.className = "author";
    authorSpan.textContent = `投稿者：${authorNickname}`;
    // 日時
    const dateSpan = document.createElement("span");
    dateSpan.className = "small";
    dateSpan.textContent = ` – ${new Date(note.created_at).toLocaleString()}`;
    // PDFを開くボタン
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "PDFを開く";
    if (currentUser) {
      viewBtn.onclick = async () => {
        const { data: signedData, error: signedError } = await supabase
          .storage
          .from("lecture-files")
          .createSignedUrl(note.file_url, 60);
        if (signedError) {
          alert("URL取得エラー：" + signedError.message);
          return;
        }
        window.open(signedData.signedUrl, "_blank");
      };
    } else {
      viewBtn.disabled      = true;
      viewBtn.style.opacity = "0.5";
      viewBtn.title         = "ログインしてからご利用ください";
    }

    // 削除ボタン（管理者のみ）
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

    // li にまとめて ul に追加
    li.appendChild(textSpan);
    li.appendChild(authorSpan);
    li.appendChild(dateSpan);
    li.appendChild(viewBtn);
    if (deleteBtn) li.appendChild(deleteBtn);
    listElem.appendChild(li);
  }
}

async function deleteNote(noteId) {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId);
  if (error) {
    alert("削除失敗：" + error.message);
  } else {
    alert("投稿を削除しました");
    loadNotes();
  }
}

async function signOut() {
  // main.html の「ログアウト」ボタンから呼ばれる
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

window.addEventListener("DOMContentLoaded", setupUI);
