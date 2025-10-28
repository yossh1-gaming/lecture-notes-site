import { supabase } from "./supabase.js";

let noteId = null;
let user = null;

async function init() {
  // セッション取得
  const { data: { session } } = await supabase.auth.getSession();
  user = session?.user || null;

  // note_id 取得
  const sp = new URLSearchParams(location.search);
  noteId = sp.get("note_id");

  const ul = document.getElementById("comments-list");
  const form = document.getElementById("comment-form");

  if (!noteId) {
    ul.innerHTML = "<li>note_id がありません</li>";
    return;
  }

  // ゲストはフォーム非表示（閲覧のみ）
  if (!user) form.style.display = "none";

  // 既存コメント読み込み
  await loadComments();

  // 投稿
  document.getElementById("comment-btn").onclick = postComment;
}

async function loadComments() {
  const ul = document.getElementById("comments-list");
  const { data, error } = await supabase
    .from("comments")
    .select("content,created_at,profiles!comments_user_id_fkey(username)")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("comments load error:", error.message);
    ul.innerHTML = "<li>読み込みに失敗しました</li>";
    return;
  }
  ul.innerHTML = "";
  data.forEach(c => {
    const li = document.createElement("li");
    const who = c.profiles?.username || "ゲスト";
    li.textContent = `${who}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;
    ul.appendChild(li);
  });
}

async function postComment() {
  const input = document.getElementById("comment-input");
  const content = input.value.trim();
  if (!user) return alert("ログインしてください");
  if (!content) return;

  const { error } = await supabase
    .from("comments")
    .insert({ note_id: noteId, user_id: user.id, content });

  if (error) return alert("投稿失敗: " + error.message);
  input.value = "";
  await loadComments();
}

window.addEventListener("DOMContentLoaded", init);
