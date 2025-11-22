// js/settings.js
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

function show(id, on = true) {
  $(id).style.display = on ? "" : "none";
}
function msg(el, text, cls = "") {
  el.className = `small ${cls}`.trim();
  el.textContent = text;
}

let currentUser = null;

// ---------- 初期ロード ----------
(async function init() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    show("gate", true);
    show("content", false);
    return;
  }

  currentUser = session.user;
  show("gate", false);
  show("content", true);

  // 表示
  $("cur-email").textContent = currentUser.email ?? "–";
  $("email-status").textContent =
    currentUser.email_confirmed_at ? "認証済み" : "未認証";

  // profiles 取得（idで）
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!error && prof?.nickname) {
    $("nick").value = prof.nickname;
  }

  bindEvents();
})();

// ---------- 各ボタン ----------
function bindEvents() {

  // ニックネーム保存
  $("save-nick").onclick = async () => {
    const nick = $("nick").value.trim();
    const out = $("nick-msg");
    msg(out, "保存中…");

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: currentUser.id,
          nickname: nick,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      );

    if (error) {
      msg(out, `保存失敗: ${error.message}`, "err");
    } else {
      msg(out, "保存しました", "ok");
    }
  };

  // メール変更
  $("change-email").onclick = async () => {
    const newEmail = $("new-email").value.trim();
    const out = $("email-msg");
    msg(out, "送信中…");

    const { error } = await supabase.auth.updateUser({
      email: newEmail
      // emailRedirectTo は Supabase側の Redirect URL に入れてれば不要
    });

    if (error) {
      msg(out, `送信失敗: ${error.message}`, "err");
    } else {
      msg(out, "確認メールを新しいアドレスに送りました。", "ok");
    }
  };

  // 認証メール再送
  $("resend-verify").onclick = async () => {
    const out = $("email-msg");
    msg(out, "再送中…");

    const email = currentUser.email;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      msg(out, `再送失敗: ${error.message}`, "err");
    } else {
      msg(out, "認証メールを再送しました。", "ok");
    }
  };

  // パスワード変更
  $("change-pass").onclick = async () => {
    const p1 = $("new-pass").value;
    const p2 = $("new-pass2").value;
    const out = $("pass-msg");

    if (p1.length < 6) return msg(out, "パスワードは6文字以上", "warn");
    if (p1 !== p2) return msg(out, "確認用と一致しません", "warn");

    msg(out, "変更中…");

    const { error } = await supabase.auth.updateUser({ password: p1 });

    if (error) msg(out, `変更失敗: ${error.message}`, "err");
    else msg(out, "変更しました。", "ok");
  };

  // ログアウト
  $("logout-btn").onclick = async () => {
    const out = $("logout-msg");
    msg(out, "ログアウト中…");
    await supabase.auth.signOut();
    location.href = "index.html";
  };

  // アカウント削除（※Edge Function がある場合だけ）
  $("delete-account").onclick = async () => {
    const out = $("delete-msg");
    if ($("delete-confirm").value.trim() !== "削除") {
      return msg(out, "確認欄に「削除」と入力してください", "warn");
    }

    msg(out, "削除中…");

    // あなたの delete-user 関数名に合わせてね
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/delete-user`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      }
    );

    if (!res.ok) {
      msg(out, `削除失敗: ${await res.text()}`, "err");
      return;
    }

    msg(out, "削除しました。", "ok");
    location.href = "index.html";
  };
}
