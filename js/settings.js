// js/settings.js
// 設定画面：ニックネーム / メール / パスワード / ログアウト / アカウント削除（ダミー）

import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

let me = null;      // auth.users の user
let profile = null; // public.profiles の行（username 用）

function setText(elem, text) {
  if (!elem) return;
  elem.textContent = text ?? "";
}

function setMsg(elem, text, type = "info") {
  if (!elem) return;
  elem.textContent = text ?? "";
  elem.classList.remove("ok", "warn", "err");
  if (type === "ok") elem.classList.add("ok");
  if (type === "warn") elem.classList.add("warn");
  if (type === "err") elem.classList.add("err");
}

// ---- ログインチェック & ユーザー / プロフィール読み込み ----

async function loadUserAndProfile() {
  const gate = $("gate");
  const content = $("content");

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    // 未ログイン
    if (gate) gate.style.display = "block";
    if (content) content.style.display = "none";
    return false;
  }

  me = user;

  // profiles.username を取得（行がなくても error にしない）
  const { data, error: perr } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", me.id)
    .maybeSingle();

  if (perr) {
    console.warn("profiles load error:", perr.message);
    profile = null;
  } else {
    profile = data || null;
  }

  if (gate) gate.style.display = "none";
  if (content) content.style.display = "block";

  renderAccountSummary();
  return true;
}

// ---- 画面への反映 ----

function renderAccountSummary() {
  const curEmailEl   = $("cur-email");
  const emailStatusEl = $("email-status");
  const nickInput    = $("nick");
  const nickMsg      = $("nick-msg");

  // 現在のメール
  if (curEmailEl) {
    setText(curEmailEl, me?.email || "（メール未設定）");
  }

  // 認証状態
  if (emailStatusEl) {
    const confirmed = !!me?.email_confirmed_at;
    if (confirmed) {
      setMsg(emailStatusEl, "認証済み", "ok");
    } else {
      setMsg(emailStatusEl, "未認証（メールの確認が必要です）", "warn");
    }
  }

  // ニックネーム入力欄
  if (nickInput) {
    nickInput.value = profile?.username || "";
  }
  if (nickMsg) {
    setMsg(nickMsg, "");
  }
}

// ---- ニックネーム保存 ----

async function onSaveNick() {
  const nickInput = $("nick");
  const nickMsg   = $("nick-msg");
  if (!nickInput) return;

  const name = (nickInput.value || "").trim();
  if (!name) {
    setMsg(nickMsg, "ニックネームを入力してください。", "err");
    nickInput.focus();
    return;
  }

  try {
    // 念のためユーザー確認
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      setMsg(nickMsg, "ログインしていません。", "err");
      return;
    }
    me = user;

    // 行がない場合も含めて、必ず反映されるように upsert
    const { error: upErr } = await supabase
      .from("profiles")
      .upsert(
        { id: me.id, username: name },
        { onConflict: "id" } // id が同じなら UPDATE
      );

    if (upErr) {
      console.error("nickname upsert error:", upErr);
      setMsg(nickMsg, "保存に失敗しました：" + upErr.message, "err");
      return;
    }

    // 再読み込みして画面に反映
    const { data, error: perr } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", me.id)
      .maybeSingle();
    profile = perr ? null : (data || null);

    renderAccountSummary();
    setMsg(nickMsg, "ニックネームを保存しました。", "ok");
  } catch (e) {
    console.error(e);
    setMsg(nickMsg, "保存に失敗しました。", "err");
  }
}

// ---- メールアドレス変更 ----

async function onChangeEmail() {
  const input = $("new-email");
  const msg   = $("email-msg");
  if (!input) return;

  const newEmail = (input.value || "").trim();
  if (!newEmail) {
    setMsg(msg, "新しいメールアドレスを入力してください。", "err");
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      setMsg(msg, "ログインしていません。", "err");
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ email: newEmail });
    if (updErr) {
      console.error("change email error:", updErr);
      setMsg(msg, "変更に失敗しました：" + updErr.message, "err");
      return;
    }

    setMsg(
      msg,
      "新しいメール宛に確認メールを送信しました。そこから認証を完了してください。",
      "ok"
    );
  } catch (e) {
    console.error(e);
    setMsg(msg, "変更に失敗しました。", "err");
  }
}

// 認証メール再送（現在のメール宛て）

async function onResendVerify() {
  const msg = $("email-msg");
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      setMsg(msg, "ログインしていません。", "err");
      return;
    }
    if (!user.email) {
      setMsg(msg, "メールアドレスが登録されていません。", "err");
      return;
    }

    const { error: resendErr } = await supabase.auth.resend({
      type: "signup", // サインアップ確認メールを再送
      email: user.email,
    });

    if (resendErr) {
      console.error("resend error:", resendErr);
      setMsg(msg, "再送に失敗しました：" + resendErr.message, "err");
      return;
    }

    setMsg(msg, "認証メールを再送しました。メールを確認してください。", "ok");
  } catch (e) {
    console.error(e);
    setMsg(msg, "再送に失敗しました。", "err");
  }
}

// ---- パスワード変更 ----

async function onChangePass() {
  const pass1 = $("new-pass");
  const pass2 = $("new-pass2");
  const msg   = $("pass-msg");
  if (!pass1 || !pass2) return;

  const p1 = (pass1.value || "").trim();
  const p2 = (pass2.value || "").trim();

  if (!p1 || !p2) {
    setMsg(msg, "新しいパスワードを2回入力してください。", "err");
    return;
  }
  if (p1 !== p2) {
    setMsg(msg, "パスワードが一致しません。", "err");
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      setMsg(msg, "ログインしていません。", "err");
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: p1 });
    if (updErr) {
      console.error("change pass error:", updErr);
      setMsg(msg, "変更に失敗しました：" + updErr.message, "err");
      return;
    }

    pass1.value = "";
    pass2.value = "";
    setMsg(msg, "パスワードを変更しました。", "ok");
  } catch (e) {
    console.error(e);
    setMsg(msg, "変更に失敗しました。", "err");
  }
}

// ---- ログアウト ----

async function onLogout() {
  const msg = $("logout-msg");
  try {
    await supabase.auth.signOut();
    setMsg(msg, "ログアウトしました。", "ok");
    // 少し待ってからトップへ
    setTimeout(() => {
      location.href = "index.html";
    }, 500);
  } catch (e) {
    console.error(e);
    setMsg(msg, "ログアウトに失敗しました。", "err");
  }
}

// ---- アカウント削除（今は安全のためダミー実装） ----

async function onDeleteAccount() {
  const input = $("delete-confirm");
  const msg   = $("delete-msg");
  if (!input) return;

  const text = (input.value || "").trim();
  if (text !== "削除") {
    setMsg(msg, "確認のため「削除」と入力してください。", "err");
    return;
  }

  // ⚠ 実際のユーザー削除は service_role が必要なので、
  // ここでは安全のため「管理者に依頼してください」にしておく
  setMsg(
    msg,
    "アカウント削除は現在、管理者により実行されます。管理者へ連絡してください。",
    "warn"
  );
}

// ---- イベント登録 ----

function bindEvents() {
  $("save-nick")?.addEventListener("click", onSaveNick);
  $("change-email")?.addEventListener("click", onChangeEmail);
  $("resend-verify")?.addEventListener("click", onResendVerify);
  $("change-pass")?.addEventListener("click", onChangePass);
  $("logout-btn")?.addEventListener("click", onLogout);
  $("delete-account")?.addEventListener("click", onDeleteAccount);
}

// ---- 初期化 ----

window.addEventListener("DOMContentLoaded", async () => {
  await loadUserAndProfile(); // 未ログインなら gate が表示される
  bindEvents();
});