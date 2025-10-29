import { supabase, isAdmin } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const noteId = new URL(location.href).searchParams.get("note_id");

const listEl = $("comments-list");
const inputEl = $("comment-input");
const postBtn = $("comment-btn");
const hintEl = $("comment-hint");
const infoEl = $("note-info");

let me = null;
let admin = false;

/* ===== ユーザー認証状態初期化 ===== */
async function initAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  me = user || null;
  try { admin = await isAdmin(); } catch { admin = false; }
}

/* ===== コメント一覧読み込み ===== */
async function loadComments() {
  if (!noteId) return;
  const { data: comments, error } = await supabase
    .from("comments")
    .select("id, user_id, author_name, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  listEl.innerHTML = "";
  if (error) {
    listEl.innerHTML = `<li>読み込みエラー: ${error.message}</li>`;
    console.error(error);
    return;
  }
  if (!comments || comments.length === 0) {
    listEl.innerHTML = "<li>まだコメントはありません。</li>";
    return;
  }

  for (const c of comments) {
    const li = document.createElement("li");
    const who = c.author_name || "名無し";
    li.textContent = `${who}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;

    // 削除ボタン（管理者or本人）
    if (admin || (me && me.id === c.user_id)) {
      const del = document.createElement("button");
      del.textContent = "削除";
      del.onclick = async () => {
        if (!confirm("削除しますか？")) return;
        await supabase.from("comments").delete().eq("id", c.id);
        await loadComments();
      };
      li.appendChild(del);
    }
    listEl.appendChild(li);
  }
}

/* ===== 投稿 ===== */
async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("ログインしてください。");

  const content = (inputEl.value || "").trim();
  if (!content) return;

  let authorName = null;
  try {
    const { data: p } = await supabase.from("profiles")
      .select("username").eq("id", user.id).single();
    authorName = p?.username || null;
  } catch {}
  if (!authorName) authorName = (user.email || "").split("@")[0] || "名無し";

  const { error } = await supabase.from("comments").insert({
    note_id: noteId,
    user_id: user.id,
    content,
    author_name: authorName,
  });
  if (error) return alert("投稿失敗: " + error.message);

  inputEl.value = "";
  await loadComments();
}

/* ===== 認証状態変化イベント ===== */
supabase.auth.onAuthStateChange(async (_event, session) => {
  await initAuth();
  setFormState();
  await loadComments(); // ← 認証状態が確定してから読む
});

/* ===== フォーム状態更新 ===== */
function setFormState() {
  const authed = !!me;
  postBtn.disabled = !authed;
  inputEl.disabled = !authed;
  hintEl.textContent = authed
    ? "※ コメントは公開されます。"
    : "※ ログインするとコメントを投稿できます。";
}

/* ===== 起動時 ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initAuth();        // ← ログイン状態を確認してから
  setFormState();          // ← ボタンを有効化/無効化
  await loadComments();    // ← コメントをロード
  postBtn.addEventListener("click", postComment);
});
