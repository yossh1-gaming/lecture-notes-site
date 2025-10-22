import { supabase } from "./supabase.js";
import { getCurrentUserProfile } from "./auth.js"; // signOutは未使用なので外しました

let noteId = null;
let currentUser = null;         // 認証済みのAuthユーザー
let currentUserProfile = null;  // profiles.username等

async function init() {
  // 1) URLパラメータ
  const params = new URLSearchParams(location.search);
  noteId = params.get("note_id");
  if (!noteId) {
    alert("note_id がありません");
    return;
  }

  // 2) 認証状態 & プロフィール
  const { data: { session }, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) console.warn("getSession エラー:", sessErr?.message);
  currentUser = session?.user || null;

  try {
    currentUserProfile = await getCurrentUserProfile(); // 未ログインなら null が返る想定
  } catch (e) {
    console.warn("getCurrentUserProfile 取得失敗:", e?.message);
    currentUserProfile = null;
  }

  // 3) UIの表示制御（ゲストは投稿フォームを隠す）
  const form = document.getElementById("comment-form");
  const btn  = document.getElementById("comment-btn");
  const inp  = document.getElementById("comment-input");

  if (currentUser) {
    form.style.display = "block";
    // 既存のonclickを一度クリアしてから割当（多重バインド防止）
    btn.onclick = null;
    btn.onclick = postComment;

    // Enter投稿（任意）
    inp.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        postComment();
      }
    };
  } else {
    form.style.display = "none"; // ゲスト：閲覧のみ
  }

  // 4) タイトル表示（任意）
  await loadNoteTitle();

  // 5) コメント一覧を読み込み
  await loadComments();
}

async function loadNoteTitle() {
  try {
    const { data, error } = await supabase
      .from("notes")
      .select("title")
      .eq("id", noteId)
      .single();
    if (!error && data) {
      const h1 = document.getElementById("note-title");
      if (h1) h1.textContent = `「${data.title}」のコメント`;
    }
  } catch { /* 表示は必須ではないので握りつぶし */ }
}

async function postComment() {
  const btn = document.getElementById("comment-btn");
  const inp = document.getElementById("comment-input");

  if (!currentUser) {
    alert("コメントの投稿はログインが必要です。");
    return;
  }
  const content = (inp.value || "").trim();
  if (!content) return;

  // 二重送信防止
  btn.disabled = true;

  try {
    const { error } = await supabase
      .from("comments")
      .insert({
        note_id: noteId,
        user_id: currentUser.id, // RLS: auth.uid() = user_id を満たす
        content
      });
    if (error) throw error;

    inp.value = "";
    await loadComments();
  } catch (e) {
    alert("投稿に失敗しました: " + (e?.message || e));
  } finally {
    btn.disabled = false;
  }
}

async function loadComments() {
  try {
    // profiles.username を同時取得（エイリアスで安全に）
    const { data, error } = await supabase
      .from("comments")
      .select("content, created_at, user_id, profiles:profiles(username)")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const ul = document.getElementById("comments-list");
    ul.innerHTML = "";

    (data || []).forEach(c => {
      const li = document.createElement("li");
      const name = c?.profiles?.username || "名無し";
      // XSS対策として textContent を使い、文字列連結だけにする
      li.textContent = `${name}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;
      ul.appendChild(li);
    });
  } catch (e) {
    console.error("コメント取得エラー:", e?.message || e);
    const ul = document.getElementById("comments-list");
    ul.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = "コメントの読み込みに失敗しました。";
    ul.appendChild(li);
  }
}

window.addEventListener("DOMContentLoaded", init);
