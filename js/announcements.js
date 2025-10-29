import { supabase } from "./supabase.js";

const ul = document.getElementById("news");

async function loadAnnouncements() {
  // ✅ まず、ゲスト（未ログイン）でも読み込めるように
  // RLS で "SELECT to public" を許可しておく必要あり
  const { data, error } = await supabase
    .from("announcements")
    .select("title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("📛 読み込みエラー:", error.message);
    ul.innerHTML = `<li>読み込みに失敗しました (${error.message})</li>`;
    return;
  }

  if (!data || data.length === 0) {
    ul.innerHTML = "<li>お知らせはまだありません。</li>";
    return;
  }

  // ✅ 一覧をクリアして追加
  ul.innerHTML = "";
  data.forEach((a) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${a.title}</strong><br>
      <small>${new Date(a.created_at).toLocaleString()}</small><br>
      ${a.body}
    `;
    li.style.marginBottom = "12px";
    ul.appendChild(li);
  });
}

window.addEventListener("DOMContentLoaded", loadAnnouncements);
