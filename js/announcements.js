import { supabase, isAdmin } from "./supabase.js";

let admin = false;
const ul = document.getElementById("news");

async function loadAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    ul.innerHTML = "<li>読み込みに失敗しました。</li>";
    return;
  }

  ul.innerHTML = "";
  data.forEach(a => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${a.title}</strong><br>
      <small>${new Date(a.created_at).toLocaleString()}</small><br>
      ${a.body}
    `;

    // 管理者だけ編集・削除ボタンを表示
    if (admin) {
      const edit = document.createElement("button");
      edit.textContent = "編集";
      edit.onclick = async () => {
        const newTitle = prompt("新しいタイトル", a.title);
        const newBody  = prompt("新しい本文", a.body);
        if (newTitle === null) return;
        await supabase
          .from("announcements")
          .update({ title: newTitle, body: newBody })
          .eq("id", a.id);
        await loadAnnouncements();
      };

      const del = document.createElement("button");
      del.textContent = "削除";
      del.onclick = async () => {
        if (!confirm("削除しますか？")) return;
        await supabase.from("announcements").delete().eq("id", a.id);
        await loadAnnouncements();
      };

      li.appendChild(edit);
      li.appendChild(del);
    }

    ul.appendChild(li);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  admin = await isAdmin();  // ← supabase.js の関数をそのまま使う
  await loadAnnouncements();
});
