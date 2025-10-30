// js/comments.js（安定＋ゲスト用バナー付き）
import { supabase, isAdmin } from "./supabase.js";

const $ = (id) => document.getElementById(id);

// --- URL note_id（UUID/数値両対応） ---
const rawId  = new URL(location.href).searchParams.get("note_id");
const noteId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : rawId || null;

// --- 要素 ---
const listEl   = $("comments-list");
const inputEl  = $("comment-input");
const postBtn  = $("comment-btn");
const hintEl   = $("comment-hint");
const infoEl   = $("note-info");
const guestBox = $("guest-banner");   // ← ゲスト用バナー（HTMLに設置）

// --- 状態 ---
let me = null;
let admin = false;
let booted = false;

// ---- ユーティリティ ----
const fmt = (dt) => { try { return new Date(dt).toLocaleString(); } catch { return dt; } };
const showError = (msg) => { if (listEl) listEl.innerHTML = `<li style="color:#b00">${msg}</li>`; };

// ---- セッション確定を待つ ----
async function waitSession(maxMs = 1500) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) return session;

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 150));
    ({ data: { session } } = await supabase.auth.getSession());
    if (session && session.user) return session;
  }
  return null;
}

// ---- 認証＆管理者 ----
async function initAuth() {
  const session = await waitSession();
  me = session?.user || null;
  try { admin = await isAdmin(); } catch { admin = false; }
  updateGuestBanner(); // ← セッション取得後にバナー更新
}

function setFormState() {
  const authed = !!me && !!noteId;
  if (postBtn) postBtn.disabled = !authed;
  if (inputEl) inputEl.disabled = !authed;
  if (hintEl)  hintEl.textContent = authed
    ? "※ コメントは公開されます。"
    : "※ ログインするとコメントを投稿できます。";
}

// ---- ゲスト用バナー表示 ----
function updateGuestBanner() {
  if (!guestBox) return;
  if (me) {
    guestBox.style.display = "none";
  } else {
    guestBox.style.display = "block";
  }
}

// ---- ノート情報 ----
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

// ---- コメント一覧 ----
async function loadComments(retry = 1) {
  if (!noteId) { showError("note_id がありません。URLを確認してください。"); return; }

  const { data, error, status } = await supabase
    .from("comments")
    .select("id, note_id, user_id, author_name, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  // RLS競合時（401/403）を1回だけリトライ
  if ((status === 401 || status === 403) && retry > 0) {
    await new Promise(r => setTimeout(r, 200));
    return loadComments(retry - 1);
  }

  listEl.innerHTML = "";
  if (error) { showError(`読み込み失敗: ${error.message}`); return; }
  if (!data || data.length === 0) {
    listEl.innerHTML = "<li>まだコメントはありません。</li>";
    return;
  }

  for (const c of data) {
    const li = document.createElement("li");
    li.textContent = `${c.author_name || "名無し"}: ${c.content} — ${fmt(c.created_at)}`;

    // 管理者のみ削除ボタン
    if (admin) {
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

// ---- 投稿 ----
async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("ログインしてください。");

  const content = (inputEl.value || "").trim();
  if (!content) { inputEl.focus(); return; }

  // 表示名
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

  const payload = { note_id: noteId, user_id: user.id, content, author_name: authorName };
  const { error, status } = await supabase.from("comments").insert(payload);
  if (error) return alert(`投稿失敗(${status}): ${error.message}`);

  inputEl.value = "";
  await loadComments();
}

// ---- イベント ----
function bindEventsOnce() {
  if (!postBtn || postBtn.__bound) return;
  postBtn.__bound = true;
  postBtn.addEventListener("click", postComment);
  if (inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !postBtn.disabled) {
        e.preventDefault();
        postComment();
      }
    });
  }
}

// ---- 初期化 ----
async function boot() {
  if (booted) return;
  booted = true;

  if (!noteId) {
    showError("note_id がありません。URLを確認してください。");
    if (postBtn) postBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;
    return;
  }
  await initAuth();        // セッション確定＋管理者判定＋バナー表示
  setFormState();
  bindEventsOnce();
  await loadNoteInfo();
  await loadComments();
}

// DOMがreadyかどうかに関わらず実行
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

// 認証状態変化に応じてUI更新
supabase.auth.onAuthStateChange(async () => {
  await initAuth();
  setFormState();
  await loadComments();
});
