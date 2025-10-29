import { supabase, isAdmin } from "./supabase.js";

let admin = false;
let me = null;

async function initAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  me = user;
  admin = await isAdmin(); // ← これだけで管理者判定OK
}

async function loadComments(noteId) {
  const list = document.getElementById("comments-list");
  const { data: comments } = await supabase
    .from("comments")
    .select("id, user_id, author_name, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  list.innerHTML = "";
  comments.forEach(c => {
    const li = document.createElement("li");
    li.textContent = `${c.author_name || "名無し"}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;

    // 管理者または本人なら削除ボタン表示
    if (admin || (me && me.id === c.user_id)) {
      const del = document.createElement("button");
      del.textContent = "削除";
      del.onclick = async () => {
        if (!confirm("このコメントを削除しますか？")) return;
        await supabase.from("comments").delete().eq("id", c.id);
        await loadComments(noteId);
      };
      li.appendChild(del);
    }

    list.appendChild(li);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  const noteId = new URL(location.href).searchParams.get("note_id");
  if (noteId) await loadComments(noteId);
});
