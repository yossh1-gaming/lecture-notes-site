import { supabase } from "./supabase.js";

let noteId = null;
let user = null;

async function init() {
  // DOM取得（nullガード）
  const ul   = document.getElementById("comments-list");
  const form = document.getElementById("comment-form");
  const btn  = document.getElementById("comment-post-btn");
  const input= document.getElementById("comment-input");
  if (!ul || !form || !btn || !input) {
    console.error("必要なDOMが見つかりません");
    return;
  }

  // セッション取得（失敗してもゲスト閲覧は続行）
  try {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user || null;
  } catch (e) {
    console.warn("getSession 失敗:", e);
    user = null;
  }

  // note_id 取得
  noteId = new URLSearchParams(location.search).get("note_id");
  if (!noteId) {
    ul.innerHTML = "<li>note_id がありません</li>";
    form.style.display = "none";
    return;
  }

  // ゲストはフォーム非表示（閲覧のみ）
  if (!user) form.style.display = "none";

  // 既存コメント読み込み
  await loadComments();

  // 投稿
  btn.onclick = postComment;
}

async function loadComments() {
  const ul = document.getElementById("comments-list");
  ul.innerHTML = "<li>読み込み中...</li>";

  const { data, error } = await supabase
    .from("comments")
    // FKが comments.user_id -> profiles.id で張ってあればこれでOK
    .select("content, created_at, user_id")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("comments load error:", error.message);
    ul.innerHTML = "<li>読み込みに失敗しました</li>";
    return;
  }

  ul.innerHTML = "";
  if (!data || data.length === 0) {
    ul.innerHTML = "<li>まだコメントはありません</li>";
    return;
  }

  for (const c of data) {
    const li  = document.createElement("li");
    li.textContent = `${c.content} — ${new Date(c.created_at).toLocaleString()}`;
    ul.appendChild(li);
  }
}

async function postComment() {
  const input = document.getElementById("comment-input");
  const content = input.value.trim();

  if (!user) {
    alert("ログインしてください");
    return;
  }
  if (!content) return;

  const { error } = await supabase
    .from("comments")
    .insert({ note_id: noteId, user_id: user.id, content });

  if (error) {
    alert("投稿失敗: " + error.message);
    return;
  }

  input.value = "";
  await loadComments();
}

window.addEventListener("DOMContentLoaded", init);
