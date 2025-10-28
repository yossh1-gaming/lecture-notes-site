import { supabase } from "./supabase.js";

const ul = document.getElementById("ann-list");

async function loadAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("ann load error:", error.message);
    ul.innerHTML = "<li>読み込みに失敗しました</li>";
    return;
  }

  ul.innerHTML = "";
  data.forEach(a => {
    const li = document.createElement("li");
    li.innerHTML = `<b>${a.title}</b> — ${new Date(a.created_at).toLocaleString()}<br>${a.body}`;
    ul.appendChild(li);
  });
}
window.addEventListener("DOMContentLoaded", loadAnnouncements);
