// js/comments.js
import { supabase, isAdmin } from "./supabase.js";

/* ===== util ===== */
const $  = (id) => document.getElementById(id);
const qs = (k) => new URL(location.href).searchParams.get(k);
const fmt = (dt) => { try { return new Date(dt).toLocaleString(); } catch { return dt; } };

/* ===== elements ===== */
const infoEl   = $("note-info");
const listEl   = $("comments-list");
const inputEl  = $("comment-input");
const postBtn  = $("comment-btn");
const hintEl   = $("comment-hint");

const noteId = qs("note_id");

/* ===== state ===== */
let me = null;
let admin = false;

/* ===== guards ===== */
if (!noteId) {
  listEl.innerHTML = "<li>ノートが指定されていません。URLの note_id を確認してください。</li>";
  if (postBtn) postBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;
}

/* ===== auth ===== */
async function initAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  me = user || null;
  try { admin = await isAdmin(); } catch { admin = false; }
}

function setFormState() {
  const authed = !!me;
  if (postBtn) postBtn.disabled = !authed || !noteId;
  if (inputEl) inputEl.disabled = !authed || !noteId;
  if (hintEl)  hintEl.textContent = authed
    ? "※ コメントは公開されます。"
    : "※ ログインするとコメントを投稿できます。";
}

/* ===== note info ===== */
async function loadNoteInfo() {
  if (!noteId) return;
  const { data, error } = await supabase
    .from("notes")
    .select("title, subject, author_name, created_at")
    .eq("id", noteId)
    .single();
  if (error || !data) return;

  const parts = [];
  if (data.title)       parts.push(`タイトル: ${data.title}`);
  if (data.subject)     parts.push(`科目: ${data.subject}`);
  if (data.author_name) parts.push(`投稿者: ${data.author_name}`);
  if (data.created_at)  parts.push(`投稿日: ${fmt(data.created_at)}`);
  if (infoEl) infoEl.textContent = parts.join(" / ");
}

/* ===== list ===== */
async function loadComments() {
  if (!noteId) return;
  const { data, error } = await supabase
    .from("comments")
    .select("id, user_id, author_name, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  listEl.innerHTML = "";
  if (error) {
    console.error("コメント取得エラー:", error.message);
    listEl.innerHTML = `<li>読み込みに失敗しました: ${error.message}</li>`;
    return;
  }
  if (!data || data.length === 0) {
    listEl.innerHTML = "<li>まだコメントはありません。</li>";
    return;
  }

  for (const c of data) {
    const li = document.createElement("li");

    const who  = c.author_name || "名無し";
    const text = document.createElement("span");
    text.textContent = `${who}: ${c.content} — ${fmt(c.created_at)}`;
    li.appendChild(text);

    // 管理者 or 本人のみ 削除
    const canDelete = admin || (me && me.id === c.user_id);
    if (canDelete) {
      const del = document.createElement("button");
      del.textContent = "削除";
      del.className = "delete-btn";
      del.style.marginLeft = "8px";
      del.onclick = async () => {
        if (!confirm("このコメントを削除しますか？")) return;
        const { error: delErr } = await supabase.from("comments").delete().eq("id", c.id);
        if (delErr) return alert("削除失敗: " + delErr.message);
        await loadComments();
      };
      li.appendChild(del);
    }

    listEl.appendChild(li);
  }
}

/* ===== post ===== */
async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("ログインしてください。");

  const content = (inputEl.value || "").trim();
  if (!content) {
    inputEl.focus();
    return;
  }

  // author_name を用意（自分のprofilesが読めなければメールローカル部）
  let authorName = null;
  try {
    const { data: p } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    authorName = p?.username || null;
  } catch {}
  if (!authorName) authorName = (user.email || "").split("@")[0] || "名無し";

  const { error } = await supabase.from("comments").insert({
    note_id: noteId,
    user_id: user.id,
    content,
    author_name: authorName
  });

  if (error) {
    alert("投稿に失敗しました: " + error.message);
    return;
  }

  inputEl.value = "";
  await loadComments();
}

/* ===== bind once ===== */
function bindEventsOnce() {
  if (!postBtn || postBtn.__bound) return;
  postBtn.__bound = true;

  // クリック
  postBtn.addEventListener("click", postComment);

  // Enterで投稿（Shift+Enter は改行想定ならテキストエリアに変更してください）
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !postBtn.disabled) {
      e.preventDefault();
      postComment();
    }
  });
}

/* ===== auth state change ===== */
supabase.auth.onAuthStateChange(async () => {
  await initAuth();
  setFormState();      // UIを先に
  await loadComments(); // 一覧更新（削除ボタンの可否が変わるため）
});

/* ===== boot ===== */
window.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  setFormState();
  bindEventsOnce();
  await loadNoteInfo();
  await loadComments();
});
