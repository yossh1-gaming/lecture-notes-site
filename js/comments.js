// js/comments.js（コメント部分だけ最終安定版）
import { supabase, isAdmin } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const rawId  = new URL(location.href).searchParams.get("note_id");
const noteId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : rawId || null;

const listEl   = $("comments-list");
const inputEl  = $("comment-input");
const postBtn  = $("comment-btn");
const hintEl   = $("comment-hint");
const infoEl   = $("note-info");
const guestBox = $("guest-banner");

let me = null;
let admin = false;
let booted = false;
let authSub = null;
let reloading = false;

const fmt = (dt) => { try { return new Date(dt).toLocaleString(); } catch { return dt; } };
const showError = (msg) => { if (listEl) listEl.innerHTML = `<li style="color:#b00">${msg}</li>`; };

// INITIAL_SESSION を確実に待つ（2秒タイムアウト）
function waitInitialSession(timeoutMs = 2000) {
  return new Promise(async (resolve) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session || session === null) return resolve(session);

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "INITIAL_SESSION") {
        sub.subscription.unsubscribe();
        resolve(s);
      }
    });

    setTimeout(() => {
      try { sub.subscription.unsubscribe(); } catch {}
      resolve(null);
    }, timeoutMs);
  });
}

function updateGuestBanner() {
  if (!guestBox) return;
  guestBox.style.display = me ? "none" : "block";
}

function setFormState() {
  const authed = !!me && !!noteId;
  if (postBtn) postBtn.disabled = !authed;
  if (inputEl) inputEl.disabled = !authed;
  if (hintEl)  hintEl.textContent = authed
    ? "※ コメントは公開されます。"
    : "※ ログインするとコメントを投稿できます。";
}

function disableUIForSignOut() {
  if (postBtn) postBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;
  if (hintEl)  hintEl.textContent = "※ ログアウトしました。";
}

async function initAuth() {
  const s = await waitInitialSession();
  me = s?.user || null;
  try { admin = await isAdmin(); } catch { admin = false; }
  updateGuestBanner();
  setFormState();
}

async function loadNoteInfo() {
  if (!noteId) return;
  const { data, error } = await supabase
    .from("notes")
    .select("title, subject, author_name, created_at")
    .eq("id", noteId)
    .single();
  if (error || !data) return;
  const parts = [];
  if (data.title)       parts.push(`タイトル: ${data.title}`);
  if (data.subject)     parts.push(`科目: ${data.subject}`);
  if (data.author_name) parts.push(`投稿者: ${data.author_name}`);
  if (data.created_at)  parts.push(`投稿日: ${fmt(data.created_at)}`);
  if (infoEl) infoEl.textContent = parts.join(" / ");
}

async function loadComments(retry = 1) {
  if (!noteId) { showError("note_id がありません。URLを確認してください。"); return; }

  const { data, error, status } = await supabase
    .from("comments")
    .select("id, note_id, user_id, author_name, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  // 認証レース/トークン更新直後の 401/403 を一度だけ吸収
  if ((status === 401 || status === 403) && retry > 0) {
    await new Promise(r => setTimeout(r, 250));
    return loadComments(retry - 1);
  }

  listEl.innerHTML = "";
  if (error) { showError(`読み込み失敗: ${error.message}`); return; }
  if (!data || data.length === 0) { listEl.innerHTML = "<li>まだコメントはありません。</li>"; return; }

  for (const c of data) {
    const li = document.createElement("li");
    li.textContent = `${c.author_name || "名無し"}: ${c.content} — ${fmt(c.created_at)}`;

    if (admin) {
      const del = document.createElement("button");
      del.textContent = "削除";
      del.className = "delete-btn";
      del.style.marginLeft = "8px";
      del.onclick = async () => {
        if (!confirm("このコメントを削除しますか？")) return;
        const { error: delErr } = await supabase.from("comments").delete().eq("id", c.id);
        if (delErr) return alert("削除失敗: " + delErr.message);
        await loadComments();
      };
      li.appendChild(del);
    }
    listEl.appendChild(li);
  }
}

async function postComment() {
  if (!noteId) return alert("note_id がありません。");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("ログインしてください。");

  const content = (inputEl.value || "").trim();
  if (!content) { inputEl.focus(); return; }

  let authorName = null;
  try {
    const { data: p } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    authorName = p?.username || null;
  } catch {}
  if (!authorName) authorName = (user.email || "").split("@")[0] || "名無し";

  const payload = { note_id: noteId, user_id: user.id, content, author_name: authorName };
  const { error, status } = await supabase.from("comments").insert(payload);
  if (error) return alert(`投稿失敗(${status}): ${error.message}`);

  inputEl.value = "";
  await loadComments();
}

function bindEventsOnce() {
  if (!postBtn || postBtn.__bound) return;
  postBtn.__bound = true;
  postBtn.addEventListener("click", postComment);
  if (inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !postBtn.disabled) {
        e.preventDefault();
        postComment();
      }
    });
  }
}

// 購読を一元化し、サインイン/アウトで確実に再ロード
function ensureSingleAuthSubscription() {
  if (authSub) return;

  const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === "SIGNED_OUT") {
      disableUIForSignOut();
      if (!reloading) {
        reloading = true;
        location.replace(`${location.pathname}?t=${Date.now()}`); // cache-buster
      }
      return;
    }
    // --- 修正版：TOKEN_REFRESHED で reload しない・再起動防止 ---
    function ensureSingleAuthSubscription() {
      if (authSub) return;

      const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === "SIGNED_OUT") {
          disableUIForSignOut();
          location.replace("index.html"); // ← サインアウトはログイン画面へ
          return;
        }

        // ★ サインインした時だけ初期化（TOKEN_REFRESHEDではリロードしない！）
        if (event === "SIGNED_IN") {
          await initAuth();
          await loadComments();
          return;
        }

        // TOKEN_REFRESHEDやUSER_UPDATEDはスルー（無限再読込防止）
        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          return;
        }

        if (event === "INITIAL_SESSION") {
          await initAuth();
          await loadComments();
        }
      });

      authSub = sub.subscription;

      window.addEventListener("beforeunload", () => {
        try { authSub?.unsubscribe(); } catch {}
        authSub = null;
      }, { once: true });
    }

    if (event === "INITIAL_SESSION") {
      await initAuth();
      await loadComments();
    }
  });

  authSub = sub.subscription;

  window.addEventListener("beforeunload", () => {
    try { authSub?.unsubscribe(); } catch {}
    authSub = null;
  }, { once: true });
}

async function boot() {
  if (booted) return;
  booted = true;

  if (!noteId) {
    showError("note_id がありません。URLを確認してください。");
    if (postBtn) postBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;
    return;
  }
  ensureSingleAuthSubscription();
  await initAuth();         // INITIAL_SESSION 待ち＋UI反映
  bindEventsOnce();
  await loadNoteInfo();
  await loadComments();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
