// js/passkeys.js
import { supabase } from "./supabase.js";

async function callFn(name, body = null, withAuth = false) {
  const headers = {};
  if (withAuth) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const { data, error } = await supabase.functions.invoke(name, { body, headers });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}

// 端末にパスキー登録（platform）
export async function enrollPasskeyPlatform() {
  // 1) サーバ: 登録オプション発行（JWT 必須）
  const opts = await callFn("webauthn-register-start", null, true);

  // 念のためフロントでも platform を強制
  opts.authenticatorSelection = {
    authenticatorAttachment: "platform",
    residentKey: "preferred",
    userVerification: "required",
  };
  opts.attestation = "none";

  // 2) 端末の生体認証UIを起動
  const attResp = await navigator.credentials.create({ publicKey: opts });

  // 3) サーバ: 検証＆保存（JWT 必須）
  await callFn(
    "webauthn-register-finish",
    { attResp, expectedChallenge: opts.challenge },
    true
  );

  alert("この端末にパスキーを登録しました。次回は生体認証でログインできます。");
}

// 生体認証でログイン（platform）
export async function loginWithPasskeyPlatform() {
  if (
    !window.PublicKeyCredential ||
    !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  ) {
    alert("この端末は生体認証ログインに対応していません。");
    return;
  }

  // 1) サーバ: 認証オプション発行（未ログイン想定なので JWT なし）
  const opts = await callFn("webauthn-login-start");

  // 生体認証を要求
  opts.userVerification = "required";

  // 2) 端末の生体認証UIを起動
  const authResp = await navigator.credentials.get({ publicKey: opts, mediation: "optional" });

  // 3) サーバ: 検証
  const { user_id } = await callFn("webauthn-login-finish", {
    authResp,
    expectedChallenge: opts.challenge,
  });

  alert("生体認証OK。続けて通常ログイン（メールOTPなど）でセッションを確定してください。");
}
