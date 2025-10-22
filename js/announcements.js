import { supabase } from "./supabase.js";

async function loadAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return console.error(error);

  const ul = document.getElementById("ann-list");
  ul.innerHTML = "";
  data.forEach(n => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${n.title}</strong> — ${new Date(n.created_at).toLocaleString()}<br>${n.body}`;
    ul.appendChild(li);
  });
}
window.addEventListener("DOMContentLoaded", loadAnnouncements);
