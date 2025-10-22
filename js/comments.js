import { supabase } from "./supabase.js";

let noteId, session;

async function init() {
  noteId = new URLSearchParams(location.search).get("note_id");
  if (!noteId) return alert("note_id がありません");

  session = (await supabase.auth.getSession()).data.session;

  // ゲストは投稿UIを無効化
  const btn = document.getElementById("comment-btn");
  const inp = document.getElementById("comment-input");
  if (!session) {
    btn.disabled = true;
    btn.title = "ログインするとコメントできます";
    inp.placeholder = "ログインするとコメントできます";
  } else {
    btn.onclick = postComment;
  }

  await loadComments();
}

async function loadComments() {
  const { data, error } = await supabase
    .from("comments")
    .select(`content, created_at, profiles!comments_user_id_fkey(username)`)
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  if (error) return console.error(error);

  const ul = document.getElementById("comments-list");
  ul.innerHTML = "";
  data.forEach(c => {
    const user = c.profiles?.username ?? "ゲスト";
    const li = document.createElement("li");
    li.textContent = `${user}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;
    ul.appendChild(li);
  });
}

async function postComment() {
  const inp = document.getElementById("comment-input");
  const content = inp.value.trim();
  if (!content) return;

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return alert("ログインしてください");

  const { error } = await supabase
    .from("comments")
    .insert({ note_id: noteId, user_id: user.id, content });
  if (error) return alert("投稿エラー: " + error.message);

  inp.value = "";
  loadComments();
}

window.addEventListener("DOMContentLoaded", init);
