// js/comments.js
import { supabase } from "./supabase.js";
import { isAdmin } from "./supabase.js";

let admin = false;
let me = null;

/* ===== 認証状態の取得 ===== */
async function initAuthState() {
  const { data: { user } } = await supabase.auth.getUser();
  me = user || null;
  admin = await isAdmin();
}

/* ===== ヘルパ ===== */
function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}
function fmt(dt) {
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

/* ===== 要素参照 ===== */
const commentsList = document.getElementById("comments-list");
const inputEl      = document.getElementById("comment-input");
const postBtn      = document.getElementById("comment-btn");
const hintEl       = document.getElementById("comment-hint");
const noteInfoEl   = document.getElementById("note-info");

/* ===== 入口チェック ===== */
const noteId = getParam("note_id");
if (!noteId) {
  commentsList.innerHTML = "<li>ノートが指定されていません。<br>「講義録一覧」から『コメントを見る』を押してください。</li>";
  if (postBtn) postBtn.disabled = true;
}

/* ===== ノート情報（任意） ===== */
async function loadNoteInfo() {
  if (!noteId) return;
  const { data, error } = await supabase
    .from("notes")
    .select("title, subject, author_name, created_at")
    .eq("id", noteId)
    .single();
  if (error) return; // 表示は必須でないので無視

  const s = [];
  if (data.title)       s.push(`タイトル: ${data.title}`);
  if (data.subject)     s.push(`科目: ${data.subject}`);
  if (data.author_name) s.push(`投稿者: ${data.author_name}`);
  if (data.created_at)  s.push(`投稿日: ${fmt(data.created_at)}`);
  noteInfoEl.textContent = s.join(" / ");
}

/* ===== コメントの描画 ===== */
async function loadComments() {
  if (!noteId) return;
  const { data: comments, error } = await supabase
    .from("comments")
    .select("id, user_id, author_name, content, created_at") // ← id/user_id も取得
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  commentsList.innerHTML = "";
  if (error) {
    console.error("コメント取得エラー：", error.message);
    commentsList.innerHTML = "<li>読み込みに失敗しました。</li>";
    return;
  }
  if (!comments || comments.length === 0) {
    commentsList.innerHTML = "<li>まだコメントはありません。</li>";
    return;
  }

  for (const c of comments) {
    const li  = document.createElement("li");
    const who = c.author_name || "名無し";

    const text = document.createElement("span");
    text.textContent = `${who}: ${c.content} — ${fmt(c.created_at)}`;
    li.appendChild(text);

    // 管理者 or 自分のコメントにだけ「削除」ボタンを表示
    const canDelete = admin || (me && me.id === c.user_id);
    if (canDelete) {
      const del = document.createElement("button");
      del.textContent = "削除";
      del.className   = "delete-btn";
      del.style.marginLeft = "8px";
      del.onclick = async () => {
        if (!confirm("このコメントを削除しますか？")) return;
        const { error: delErr } = await supabase
          .from("comments")
          .delete()
          .eq("id", c.id);
        if (delErr) return alert("削除に失敗しました：" + delErr.message);
        await loadComments();
      };
      li.appendChild(del);
    }

    commentsList.appendChild(li);
  }
}

/* ===== 投稿処理（ログイン者のみ） ===== */
async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("ログインしてください。");

  const content = (inputEl.value || "").trim();
  if (!content) return;

  // 投稿者名を取得（自分のprofilesはRLS的に読める）
  let authorName = null;
  try {
    const { data: p } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    authorName = p?.username || null;
  } catch {}
  if (!authorName) {
    authorName = (user.email || "").split("@")[0] || "名無し";
  }

  const { error } = await supabase.from("comments").insert({
    note_id: noteId,
    user_id: user.id,
    content,
    author_name: authorName
  });
  if (error) {
    alert("投稿に失敗しました：" + error.message);
    return;
  }
  inputEl.value = "";
  await loadComments();
}

/* ===== ログイン状態でフォームを切替 ===== */
async function setFormStateByAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  const authed = !!user;
  postBtn.disabled = !authed || !noteId;
  inputEl.disabled = !authed || !noteId;
  hintEl.textContent = authed ? "※ コメントは公開されます。" : "※ ログインするとコメントを投稿できます。";
}

/* auth 状態変化でも切替 */
supabase.auth.onAuthStateChange(async () => {
  await initAuthState();
  await setFormStateByAuth();
  await loadComments(); // 状態が変わったら一覧も更新（削除ボタンの可否が変わるため）
});

/* ===== 初期化 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initAuthState();
  await setFormStateByAuth();
  await loadNoteInfo();
  await loadComments();

  postBtn.addEventListener("click", postComment);
  // Enter投稿（任意）
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !postBtn.disabled) {
      e.preventDefault();
      postComment();
    }
  });
});
