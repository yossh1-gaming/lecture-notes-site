// js/announcements.js
import { supabase } from "./supabase.js";
import { isAdmin } from "./supabase.js";

const ul = document.getElementById("news");
let admin = false;

// XSS対策（title/body にHTMLを入れない運用なら安全）
function esc(s = "") {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function loadAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, created_at") // ← id を取得（編集/削除で必須）
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("📛 読み込みエラー:", error.message);
    ul.innerHTML = `<li>読み込みに失敗しました (${esc(error.message)})</li>`;
    return;
  }
  if (!data || data.length === 0) {
    ul.innerHTML = "<li>お知らせはまだありません。</li>";
    return;
  }

  ul.innerHTML = "";
  for (const a of data) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.innerHTML = `<strong>${esc(a.title)}</strong><br>
      <small>${new Date(a.created_at).toLocaleString()}</small>`;
    const body = document.createElement("div");
    body.textContent = a.body ?? ""; // bodyはプレーンテキストとして表示

    li.appendChild(head);
    li.appendChild(body);

    // 管理者のみ「編集」「削除」ボタン
    if (admin) {
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "8px";
      controls.style.marginTop = "8px";

      const editBtn = document.createElement("button");
      editBtn.textContent = "編集";
      editBtn.onclick = async () => {
        const newTitle = prompt("タイトルを編集", a.title ?? "");
        if (newTitle === null) return;
        const newBody  = prompt("本文を編集", a.body ?? "");
        if (newBody === null) return;

        const { error: upErr } = await supabase
          .from("announcements")
          .update({ title: newTitle, body: newBody })
          .eq("id", a.id);
        if (upErr) return alert("更新に失敗しました：" + upErr.message);
        await loadAnnouncements();
      };

      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.className = "delete-btn"; // 任意のスタイル
      delBtn.onclick = async () => {
        if (!confirm("このお知らせを削除しますか？")) return;
        const { error: delErr } = await supabase
          .from("announcements")
          .delete()
          .eq("id", a.id);
        if (delErr) return alert("削除に失敗しました：" + delErr.message);
        await loadAnnouncements();
      };

      controls.appendChild(editBtn);
      controls.appendChild(delBtn);
      li.appendChild(controls);
    }

    li.style.marginBottom = "12px";
    ul.appendChild(li);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  admin = await isAdmin();   // profiles.is_admin を確認
  await loadAnnouncements();
});
