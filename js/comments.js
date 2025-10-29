// js/comments.js
import { supabase, isAdmin } from "./supabase.js";

const $ = (id) => document.getElementById(id);

// --- note_id を厳密に（数値 or UUID どちらにも対応） ---
const rawId = new URL(location.href).searchParams.get("note_id");
const noteId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : rawId || null;

const listEl  = $("comments-list");
const inputEl = $("comment-input");
const postBtn = $("comment-btn");
const hintEl  = $("comment-hint");
const infoEl  = $("note-info");

let me = null;
let admin = false;

function showErrorOnList(msg) {
  if (listEl) listEl.innerHTML = `<li style="color:#b00;">${msg}</li>`;
}

async function initAuth() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) console.warn("getUser error:", error.message);
    me = user || null;
    try { admin = await isAdmin(); } catch { admin = false; }
  } catch (e) {
    console.error("initAuth fatal:", e);
    me = null; admin = false;
  }
}

function setFormState() {
  const authed = !!me && !!noteId;
  if (postBtn) postBtn.disabled = !authed;
  if (inputEl) inputEl.disabled = !authed;
  if (hintEl)  hintEl.textContent = authed
    ? "※ コメントは公開されます。"
    : "※ ログインするとコメントを投稿できます。";
}

async function loadNoteInfo() {
  if (!noteId) return;
  try {
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
    if (data.created_at)  parts.push(`投稿日: ${new Date(data.created_at).toLocaleString()}`);
    if (infoEl) infoEl.textContent = parts.join(" / ");
  } catch {}
}

async function loadComments() {
  if (!noteId) {
    showErrorOnList("note_id がありません。URLを確認してください。");
    return;
  }

  try {
    const { data, error } = await supabase
      .from("comments")
      .select("id, note_id, user_id, author_name, content, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true });

    listEl.innerHTML = "";
    if (error) {
      console.error("comments select error:", error);
      showErrorOnList(`読み込みに失敗: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      listEl.innerHTML = "<li>まだコメントはありません。</li>";
      return;
    }

    for (const c of data) {
      const li = document.createElement("li");
      li.textContent = `${c.author_name || "名無し"}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;

      if (admin || (me && me.id === c.user_id)) {
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
          if (delErr) return alert("削除失敗: " + delErr.message);
          await loadComments();
        };
        li.appendChild(del);
      }

      listEl.appendChild(li);
    }
  } catch (e) {
    console.error("loadComments fatal:", e);
    showErrorOnList("読み込みに失敗しました（ネットワークまたは設定エラー）");
  }
}

async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("ログインしてください。");

    const content = (inputEl.value || "").trim();
    if (!content) { inputEl.focus(); return; }

    // 投稿者名（profiles.username → 無ければメールローカル部）
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

    // note_id の型を厳密に送る（数値テーブルなら数値、UUIDなら文字列のまま）
    const payload = {
      note_id: noteId,
      user_id: user.id,
      content,
      author_name: authorName,
    };

    const { error } = await supabase.from("comments").insert(payload);
    if (error) {
      alert("投稿失敗: " + error.message);
      return;
    }

    inputEl.value = "";
    await loadComments();
  } catch (e) {
    console.error("postComment fatal:", e);
    alert("投稿に失敗しました（ネットワークまたは設定エラー）");
  }
}

function bindEventsOnce() {
  if (!postBtn || postBtn.__bound) return;
  postBtn.__bound = true;
  postBtn.addEventListener("click", postComment);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !postBtn.disabled) {
      e.preventDefault();
      postComment();
    }
  });
}

// 認証変化：必ず「認証→UI→一覧」の順
supabase.auth.onAuthStateChange(async () => {
  await initAuth();
  setFormState();
  await loadComments();
});

// 初期化：必ず「認証→UI→イベント→ノート情報→一覧」
window.addEventListener("DOMContentLoaded", async () => {
  if (!noteId) showErrorOnList("note_id がありません。URLを確認してください。");
  await initAuth();
  setFormState();
  bindEventsOnce();
  await loadNoteInfo();
  await loadComments();
});
