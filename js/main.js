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
  console.log("▶ prod セッション:", session, "エラー:", sessionError);
  if (sessionError) {
    console.error("セッション取得エラー:", sessionError);
  }

  const userInfoDiv   = document.getElementById("user-info");
  const uploadSection = document.getElementById("upload-section");

  if (session && session.user) {
    // ログイン中：プロフィール反映＆アップロード欄を表示
    currentUser = session.user;
    await getCurrentUserProfile();
    const nickname = currentUserProfile.username || "未設定ニックネーム";
    userInfoDiv.textContent = `ログイン中：${nickname}`;
    uploadSection.style.display = "block";
    document.getElementById("upload-btn").onclick = uploadNote;
    document.getElementById("logout-btn").onclick = signOut;
  } else {
    // ゲスト：一覧のみ見せる（PDF/アップロード不可）
    currentUser = null;
    currentUserProfile = null;
    userInfoDiv.textContent = "ゲスト閲覧中";
    uploadSection.style.display = "none";
  }

  // 誰でも一覧は表示（初回1回だけ）
  await loadNotes();

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

async function uploadNote() {
  if (!currentUser) return alert("ログインしてください");

  const title    = document.getElementById("note-title").value.trim();
  const subject  = document.getElementById("note-subject").value.trim();
  const category = document.getElementById("note-category").value;
  const file     = document.getElementById("note-file").files[0];
  if (!title || !file) return alert("タイトルとファイルは必須です");

  // 1) まず行を作って id を取得
  const { data: inserted, error: insErr } = await supabase
    .from("notes")
    .insert({ title, subject, category, user_id: currentUser.id })
    .select("id")
    .single();
  if (insErr) return alert("ノート作成エラー: " + insErr.message);

  const id = inserted.id;

  // 拡張子を元ファイルから取得（既定は .pdf）
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const path = `notes/${id}.${ext}`;               // ← 一意 & 上書き可能な固定キー
  const bucket = supabase.storage.from("lecture-files");

  // 2) 上書きアップロード（常に同じキーに保存）
  const { error: upErr } = await bucket.upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (upErr) return alert("アップロード失敗: " + upErr.message);

  // 3) 公開URLを取得（Public バケット前提）。非公開なら signed URL を出す。
  let publicUrl = null;
  try {
    const { data: pub } = bucket.getPublicUrl(path);
    publicUrl = pub?.publicUrl || null;
  } catch { /* noop */ }

  if (!publicUrl) {
    // 非公開バケットなら 1時間の署名URLを発行して保存
    const { data: signed, error: sigErr } = await bucket.createSignedUrl(path, 3600);
    if (sigErr) return alert("URL生成失敗: " + sigErr.message);
    publicUrl = signed.signedUrl;
  }

  // 4) file_url を「完全URL」で更新（これで404を根絶）
  const { error: updErr } = await supabase
    .from("notes")
    .update({ file_url: publicUrl })
    .eq("id", id);
  if (updErr) return alert("URL更新失敗: " + updErr.message);

  // 5) お知らせに自動投稿
  await supabase.from("announcements").insert({
    title: `新規資料：${title}`,
    body: subject ? `${subject} の資料がアップロードされました` : "新規資料がアップロードされました",
  });

  alert("アップロード完了！");
  document.getElementById("note-title").value = "";
  document.getElementById("note-subject").value = "";
  document.getElementById("note-file").value = "";
  loadNotes();
}



// ---- コメント一覧（個別ページや将来の拡張で利用） ----
async function loadComments(noteId, commentsList) {
  const { data: comments, error } = await supabase
    .from("comments")
    .select("content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("コメント取得エラー：", error.message);
    commentsList.innerHTML = "<li>読み込みに失敗しました</li>";
    return;
  }

  commentsList.innerHTML = "";
  if (!comments || comments.length === 0) {
    commentsList.innerHTML = "<li>まだコメントはありません</li>";
    return;
  }

  comments.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = `${c.content} — ${new Date(c.created_at).toLocaleString()}`;
    commentsList.appendChild(li);
  });
}


// ---- 一覧取得＆描画 ----
async function loadNotes(searchKeyword = "", categoryFilter = "") {
  let query = supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (searchKeyword) {
    query = query.ilike("title", `%${searchKeyword}%`);
  }
  if (categoryFilter) {
    query = query.eq("category", categoryFilter);
  }

  const { data: notes, error } = await query;
  if (error) {
    console.error("一覧取得エラー：", error.message);
    return;
  }

  const listElem = document.getElementById("notes-list");
  listElem.innerHTML = "";

  if (!notes || notes.length === 0) {
    listElem.innerHTML = "<li>投稿はまだありません</li>";
    return;
  }

  // 現在ログインしているユーザー（投稿者表示の簡略化に使用）
  let me = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    me = user || null;
  } catch { me = null; }

  for (const note of notes) {
    // li 要素
    const li = document.createElement("li");

    // タイトル＆科目
    const textSpan = document.createElement("span");
    textSpan.textContent = `${note.title}（${note.subject || "－"}）`;

    // 投稿者（RLSの都合で他人の profiles は読めない → “あなた/非公開” に簡略化）
    const authorSpan = document.createElement("span");
    authorSpan.className = "author";
    authorSpan.textContent = `投稿者：${me && me.id === note.user_id ? "あなた" : "非公開"}`;

    // 日時
    const dateSpan = document.createElement("span");
    dateSpan.className = "small";
    dateSpan.textContent = ` – ${new Date(note.created_at).toLocaleString()}`;

    // PDFを開くボタン（完全URL優先。相対パスは自動で public URL に変換）
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "PDFを開く";
    viewBtn.onclick = async () => {
      let url = note.file_url || "";
      if (!url) {
        alert("公開URLが登録されていません。");
        return;
      }
      if (!/^https?:\/\//.test(url)) {
        // 既存の相対パスデータ向けフォールバック
        const { data: pub } = supabase.storage.from("lecture-files").getPublicUrl(url);
        url = pub?.publicUrl || url;
      }
      window.open(url, "_blank");
    };

    // 削除ボタン（管理者のみ）
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

    // コメント専用ページへのリンク
    const commentLink = document.createElement("a");
    commentLink.href = `comments.html?note_id=${note.id}`;
    commentLink.textContent = "コメントを見る";
    commentLink.className = "comment-link";

    // li に追加
    li.appendChild(textSpan);
    li.appendChild(authorSpan);
    li.appendChild(dateSpan);
    li.appendChild(viewBtn);
    if (deleteBtn) li.appendChild(deleteBtn);
    li.appendChild(commentLink);

    listElem.appendChild(li);
  }
}


// ---- 削除 ----
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


// ---- サインアウト ----
async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}


// ---- 初期化 ----
window.addEventListener("DOMContentLoaded", async () => {
  await setupUI();           // ← 既存のログイン表示・ボタンバインド
  await loadNotes();

  // 検索＆カテゴリフィルター
  const searchEl = document.getElementById("search-input");
  const catEl    = document.getElementById("category-filter");

  if (searchEl) {
    searchEl.addEventListener("input", async (e) => {
      const keyword = e.target.value.trim();
      await loadNotes(keyword, catEl ? catEl.value : "");
    });
  }
  if (catEl) {
    catEl.addEventListener("change", async (e) => {
      const cat = e.target.value;
      await loadNotes(searchEl ? searchEl.value.trim() : "", cat);
    });
  }
});
