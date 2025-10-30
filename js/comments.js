// js/comments.js
import { supabase, isAdmin } from "./supabase.js";

const $ = (id) => document.getElementById(id);

// --- URLパラメータ note_id を厳密取得（数値/UUID両対応） ---
const rawId  = new URL(location.href).searchParams.get("note_id");
const noteId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : rawId || null;

// --- 要素参照 ---
const listEl  = $("comments-list");
const inputEl = $("comment-input");
const postBtn = $("comment-btn");
const hintEl  = $("comment-hint");
const infoEl  = $("note-info");

// --- 状態 ---
let me = null;
let admin = false;

// --- 小さなユーティリティ ---
function showErrorOnList(msg) {
  if (listEl) listEl.innerHTML = `<li style="color:#b00;">${msg}</li>`;
}
function fmt(dt) {
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

// --- 認証/管理者判定 ---
async function initAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  me = user || null;
  try { admin = await isAdmin(); } catch { admin = false; }
}

// --- フォームの有効/無効切替 ---
function setFormState() {
  const authed = !!me && !!noteId;
  if (postBtn) postBtn.disabled = !authed;
  if (inputEl) inputEl.disabled = !authed;
  if (hintEl)  hintEl.textContent = authed
    ? "※ コメントは公開されます。"
    : "※ ログインするとコメントを投稿できます。";
}

// --- ノート情報（任意表示） ---
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

// --- コメント一覧 ---
async function loadComments() {
  if (!noteId) {
    showErrorOnList("note_id がありません。URLを確認してください。");
    return;
  }

  const { data, error } = await supabase
    .from("comments")
    .select("id, note_id, user_id, author_name, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  listEl.innerHTML = "";
  if (error) {
    showErrorOnList(`読み込みに失敗: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    listEl.innerHTML = "<li>まだコメントはありません。</li>";
    return;
  }

  for (const c of data) {
    const li = document.createElement("li");
    li.textContent = `${c.author_name || "名無し"}: ${c.content} — ${fmt(c.created_at)}`;

    // 管理者のみ「削除」ボタンを表示（RLS側も管理者のみ）
    if (admin) {
      const del = document.createElement("button");
      del.textContent = "削除";
      del.className = "delete-btn";
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
}

// --- コメント投稿 ---
async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("ログインしてください。");

  const content = (inputEl.value || "").trim();
  if (!content) { inputEl.focus(); return; }

  // 表示名：profiles.username → なければメールのローカル部
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

  const payload = {
    note_id: noteId,        // 数値テーブルなら数値、UUIDなら文字列のまま
    user_id: user.id,
    content,
    author_name: authorName,
  };

  const { error } = await supabase.from("comments").insert(payload);
  if (error) return alert("投稿失敗: " + error.message);

  inputEl.value = "";
  await loadComments();
}

// --- イベントバインド（重複防止） ---
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

// --- 初期化（DOMContentLoaded 済みでも必ず実行） ---
async function boot() {
  if (!noteId) {
    showErrorOnList("note_id がありません。URLを確認してください。");
    if (postBtn) postBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;
    return;
  }
  await initAuth();
  updateGuestBanner();
  setFormState();
  bindEventsOnce();
  await loadNoteInfo();
  await loadComments();
}
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

// 認証変化（ログイン/ログアウト直後の再描画）
supabase.auth.onAuthStateChange(async () => {
  await initAuth();
  updateGuestBanner();
  setFormState();
  await loadComments();
});

// 追加：ゲスト用バナー制御
function updateGuestBanner() {
  const banner = document.getElementById("guest-banner");
  if (!banner) return;
  // me は initAuth() で設定される
  if (me) {
    banner.style.display = "none";
  } else {
    banner.style.display = "block";
  }
}
